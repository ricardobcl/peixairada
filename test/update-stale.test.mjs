// The server against its own checkout (2026-11-25): a checkout reached by a path spelled in another case is still one,
// and a server whose checkout moved under it — a pull by hand, the way round an update the board would not take — says
// it runs older code than the checkout has, and *update now* restarts it (the packages first when they moved), never
// for a change a restart does not take in. The checkout is the update tests' throwaway one (test/update-project.mjs).
import './env.mjs'; // first: server.mjs reads where its state lives as it is imported
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { startTestServer, waitFor } from '../lib/testserver.mjs';
import { PAGE, project } from './update-project.mjs';

test(
  'a checkout reached by a path in another case is a checkout (a case-insensitive disk)',
  { timeout: 30_000 },
  async context => {
    const testProject = project();
    const name = basename(testProject.co);
    const other = join(dirname(testProject.co), name === name.toUpperCase() ? name.toLowerCase() : name.toUpperCase());

    if (!existsSync(other)) return context.skip('this disk tells case apart');
    const srv = await startTestServer({ env: { ...testProject.env, UPDATE_DIR: other } });

    try {
      const st = (await srv.post('api/update', {})).body;

      assert.deepEqual(
        [st.checkout, st.why, st.branch],
        [true, 'current', 'main'],
        `${other} is the checkout ${testProject.co}`,
      );
    } finally {
      await srv.stop();
    }
  },
);

test(
  'a pull by hand: the server says it is older than its checkout, update now restarts it — the packages first when they moved — and a page alone asks for nothing',
  { timeout: 90_000 },
  async () => {
    const testProject = project();
    const srv = await startTestServer({ env: { ...testProject.env, APP_LOOK_MS: '300' } });
    const state = async () => (await srv.api('api/update')).body;

    try {
      await waitFor(async () => (await state()).checkout, { what: 'the checkout read at boot' });
      assert.deepEqual((await state()).pending, [], 'nothing behind at boot');

      // the page alone, pulled by hand: seen (the minute's look, here 300 ms), and nothing to restart for
      const pageCommit = testProject.push({ 'public/index.html': `${PAGE}<!-- a -->\n` }, 'the page');

      testProject.git(testProject.co, 'pull', '-q', '--ff-only');

      let st = await waitFor(
        async () => {
          const status = await state();

          return status.head === pageCommit && status;
        },
        { what: 'the hand pull seen' },
      );

      assert.deepEqual(
        [st.why, st.behind, st.pending, st.restart],
        ['current', 0, [], true],
        'up to date, nothing behind: the page is read from disk',
      );

      // the server, pulled by hand: behind, said, until update now restarts it
      const serverCommit = testProject.push(
        { 'lib/version.mjs': 'export const versionFrom = async () => "9.9.9";\n' },
        'the server',
      );

      testProject.git(testProject.co, 'pull', '-q', '--ff-only');

      st = await waitFor(
        async () => {
          const status = await state();

          return status.head === serverCommit && status.pending.length && status;
        },
        { what: 'the server behind' },
      );

      assert.deepEqual([st.why, st.pending], ['current', ['server']]);
      assert.deepEqual(testProject.asked(), [], 'said, not restarted by itself');
      st = (await srv.post('api/update', { apply: true })).body;

      assert.deepEqual(
        [st.error, st.failed, st.pending, st.restarting, st.steps, st.step],
        [null, null, [], true, ['server', 'restart'], 1],
        'tried on a spare port, then restarted',
      );

      await waitFor(() => testProject.asked().includes('restart restart --detached'), { what: 'the restart' });
      assert.deepEqual(testProject.asked(), ['restart restart --detached'], 'no packages: they did not move');
    } finally {
      await srv.stop();
    }

    // a new server, its packages moved by a hand pull: installed, then restarted
    const srv2 = await startTestServer({ env: { ...testProject.env, APP_LOOK_MS: '300' } });

    try {
      await waitFor(async () => (await srv2.api('api/update')).body.checkout, { what: 'the checkout read at boot' });

      const packagesCommit = testProject.push(
        { 'package.json': '{ "name": "tiny", "version": "1.1.0" }\n' },
        'the packages',
      );

      testProject.git(testProject.co, 'pull', '-q', '--ff-only');

      const st = await waitFor(
        async () => {
          const status = (await srv2.api('api/update')).body;

          return status.head === packagesCommit && status.pending.length && status;
        },
        { what: 'the packages behind' },
      );

      assert.deepEqual(st.pending, ['deps', 'server']);
      const done = (await srv2.post('api/update', { apply: true })).body;

      assert.deepEqual([done.error, done.steps, done.restarting], [null, ['deps', 'server', 'restart'], true]);

      await waitFor(() => testProject.asked().filter(line => line.startsWith('restart')).length === 2, {
        what: 'the second restart',
      });

      assert.deepEqual(
        testProject.asked().slice(1),
        ['npm ci --ignore-scripts --no-audit --no-fund', 'restart restart --detached'],
        'npm ci, then the restart',
      );
    } finally {
      await srv2.stop();
    }
  },
);
