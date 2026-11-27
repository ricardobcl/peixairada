// `make update` (2026-11-27, scripts/update.mjs): the board's *Update now* asked from a terminal, against a throwaway
// checkout (test/update-project.mjs) — its steps said, the restart and the app's rebuild waited out, a tip not signed
// left where it is and said, and nothing pulled when no board answers.
import './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { freePort, startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { PAGE, ROOT, TINY, project } from './update-project.mjs';

const SCRIPT = join(ROOT, 'scripts', 'update.mjs');
/** `make update` against this port and state folder: its exit code and all it wrote. */
const update = (port, dir, env = {}) =>
  new Promise(res =>
    execFile(
      process.execPath,
      [SCRIPT],
      { env: { ...process.env, PORT: String(port), STATE_FILE: join(dir, 'state.json'), ...env }, timeout: 60_000 },
      (e, out, err) => res({ code: e ? e.code : 0, out: out + err }),
    ),
  );

test(
  'make update: up to date; a pull with its steps; the restart and the rebuild waited out; a tip not signed left',
  { timeout: 90_000 },
  async () => {
    const p = project(),
      dir = tmpDir('peix-');
    const srv = await startTestServer({ dir, env: { ...p.env, UPDATE_QUIET_MS: '60000' } });
    const make = env => update(srv.port, dir, env);
    try {
      let r = await make();
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /^peixAIrada in .*co, from origin\/main$/m, 'which checkout, and what it follows');
      assert.match(r.out, /^up to date · [0-9a-f]{7}/m);

      // a page: pulled, no switch needed (*Update now* is the switch), nothing restarted
      const a = p.push({ 'public/index.html': PAGE + '<!-- a -->\n' }, 'the page');
      r = await make();
      assert.equal(r.code, 0, r.out);
      assert.equal(p.head(), a, 'fast-forwarded');
      assert.match(r.out, /^updated [0-9a-f]{7} → [0-9a-f]{7}, 1 commit: the page$/m);
      assert.deepEqual(p.asked(), [], 'nothing restarted for a page');

      // a file changed here that the new commits change too: said by name, nothing pulled
      p.write(p.co, { 'public/index.html': PAGE + '<!-- mine -->\n' });
      const a2 = p.push({ 'public/index.html': PAGE + '<!-- a2 -->\n' }, 'the page again');
      r = await make();
      assert.equal(r.code, 1, r.out);
      assert.match(
        r.out,
        /^1 new commit on origin\/main, not pulled: public\/index\.html changed here, .* change it too/m,
      );
      assert.equal(p.head(), a, 'not pulled over it');
      p.write(p.co, {
        'public/index.html': readFileSync(join(p.co, 'public/index.html'), 'utf8').replace(
          '<!-- mine -->\n',
          '<!-- a -->\n',
        ),
      });

      // the server and the app: the restart followed until a new server answers, the rebuild until it ends
      const swift = readFileSync(join(ROOT, 'mac/Sources/main.swift'), 'utf8');
      const b = p.push(
        { 'server.mjs': TINY + '// b\n', 'mac/Sources/main.swift': swift + '// b\n' },
        'the server and the app',
      );
      const run = make();
      await waitFor(() => p.asked().includes('restart restart --detached'), { what: 'the restart asked for' });
      await srv.restart(); // what launchd.sh restart does: the same port, a new process
      r = await run;
      assert.equal(r.code, 0, r.out);
      assert.equal(p.head(), b);
      assert.match(r.out, /^updated .*, 2 commits: the server, the page and the app$/m, `${a2} taken with it`);
      assert.match(r.out, /^ {2}restarting the server…\n {2}the server is back$/m);
      assert.match(r.out, /^ {2}the app rebuilt$/m);
      assert.doesNotMatch(r.out, /the app is behind/, 'not said behind once rebuilt');

      // a tip no key in .github/allowed_signers signed: said, and the checkout left where it is
      const stranger = p.keygen('stranger');
      p.push({ 'README.md': 'not mine\n' }, 'unsigned', { sign: stranger });
      r = await make();
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /1 new commit on origin\/main, not taken: [0-9a-f]{7} .*allowed_signers/);
      assert.equal(p.head(), b, 'not pulled');
    } finally {
      await srv.stop();
    }
  },
);

test('make update with no board answering pulls nothing and says what to run', async () => {
  const r = await update(await freePort(), tmpDir('peix-'));
  assert.equal(r.code, 1);
  assert.match(r.out, /^nothing answers on 127\.0\.0\.1:\d+ — scripts\/launchd\.sh status .*git pull --ff-only/m);
});

test('make update with the wrong key says so', { timeout: 20_000 }, async () => {
  const srv = await startTestServer();
  try {
    const r = await update(srv.port, tmpDir('peix-'));
    assert.equal(r.code, 1);
    assert.match(r.out, /^not updated: the board refused its key/m);
  } finally {
    await srv.stop();
  }
});
