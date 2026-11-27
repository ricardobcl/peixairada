// The board's own update (2026-10-12) by the clock: switched on, a commit is looked at every UPDATE_EVERY_MS and taken
// once nothing has been done on the board for UPDATE_QUIET_MS — and the app, behind a commit made here, rebuilt the
// same way. The project is test/update-project.mjs's; the pull asked for is test/update.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sleep, startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { PAGE, project } from './update-project.mjs';

test(
  'on its own: looked at by the clock, taken once nothing has been done on the board for a while',
  { timeout: 40_000 },
  async () => {
    const testProject = project();
    const dir = tmpDir('peix-');

    writeFileSync(join(dir, 'state.json'), JSON.stringify({ selfUpdate: true })); // switched on

    const srv = await startTestServer({
      dir,
      env: { ...testProject.env, UPDATE_EVERY_MS: '400', UPDATE_QUIET_MS: '2500' },
    });

    try {
      const commitA = testProject.push({ 'public/index.html': `${PAGE}<!-- a -->\n` });

      await waitFor(() => testProject.head() === commitA, { timeout: 8000, what: 'the commit taken by the clock' });

      await srv.api('api/notifications', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ on: true }),
      }); // something done on the board

      const commitB = testProject.push({ 'public/index.html': `${PAGE}<!-- b -->\n` });

      await sleep(1500);
      const st = (await srv.api('api/update')).body;

      assert.deepEqual(
        [st.why, st.behind, testProject.head()],
        ['busy', 1, commitA],
        'seen, and waiting for the board to rest',
      );

      await waitFor(
        async () => {
          const status = (await srv.api('api/update')).body;

          return testProject.head() === commitB && status.last?.to === commitB && !status.busy;
        },
        { timeout: 8000, what: 'the commit taken once it rested' },
      );

      // a commit made here to mac/: the app behind it, rebuilt by the clock as a pull is taken — once the board rests
      await srv.api('api/notifications', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ on: false }),
      });

      testProject.commit({
        'mac/Sources/main.swift': `${readFileSync(join(testProject.co, 'mac/Sources/main.swift'), 'utf8')}// mine\n`,
      });

      await sleep(1000);
      const st2 = (await srv.api('api/update')).body;

      assert.deepEqual(
        [st2.app.behind, st2.appWhy, testProject.builds()],
        [true, 'busy', 0],
        'seen, and waiting for the board to rest',
      );

      await waitFor(
        async () => {
          const status = (await srv.api('api/update')).body;

          return testProject.builds() === 1 && status.app?.behind === false;
        },
        { timeout: 8000, what: 'the app rebuilt once it rested' },
      );
    } finally {
      await srv.stop();
    }
  },
);
