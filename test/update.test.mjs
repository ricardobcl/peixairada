// The board's own code kept up to date (2026-10-12): the server fetches its checkout's upstream and fast-forwards to it,
// then starts again what the commits touched — the packages, the server, the page, the app. Here the checkout is a
// throwaway one, cloned from a bare "origin" that a second clone pushes to; its server.mjs a few lines that answer, its
// lib/testserver.mjs, check-page and page the real ones (the pre-flight runs them); the restart, the app's build and npm
// stand-ins that write down what they were asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { updateParts } from '../server.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TINY = `import { createServer } from 'node:http';\nconst s = createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); });\ns.listen(Number(process.env.PORT), '127.0.0.1', () => console.log('[tiny] listening on ' + process.env.PORT));\nprocess.on('SIGTERM', () => process.exit(0));\n`;
const PAGE = readFileSync(join(ROOT, 'public', 'index.html'), 'utf8');

/** origin.git, a clone the server updates (`co`) and one that commits and pushes (`dev`); the stand-ins write to `marks`. */
function project() {
  const root = tmpDir('peix-upd-'), origin = join(root, 'origin.git'), co = join(root, 'co'), dev = join(root, 'dev'), marks = join(root, 'marks');
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-C', cwd, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' } }).trim();
  const write = (dir, files) => { for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), body); } };
  mkdirSync(dev);
  git(dev, 'init', '-q', '-b', 'main');
  write(dev, { 'server.mjs': TINY, 'package.json': '{ "name": "tiny" }\n', 'README.md': 'tiny\n', 'public/index.html': PAGE });
  for (const f of ['lib/testserver.mjs', 'scripts/check-page.mjs', 'mac/Sources/main.swift']) cpSync(join(ROOT, f), join(dev, f));
  git(dev, 'add', '-A'); git(dev, 'commit', '-q', '-m', 'the first');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dev, 'remote', 'add', 'origin', origin); git(dev, 'push', '-q', '-u', 'origin', 'main');
  git(root, 'clone', '-q', origin, co);
  const stand = name => { const f = join(root, name); writeFileSync(f, `#!/bin/sh\necho "${name} $*" >> "${marks}"\n`); chmodSync(f, 0o755); return f; };
  const env = { UPDATE_DIR: co, UPDATE_RESTART_BIN: stand('restart'), UPDATE_BUILD_BIN: stand('build'), NPM_BIN: stand('npm') };
  /** a commit on origin, as from someone else's machine; its sha */
  const push = (files, msg = 'a change') => { write(dev, files); git(dev, 'add', '-A'); git(dev, 'commit', '-q', '-m', msg); git(dev, 'push', '-q'); return git(dev, 'rev-parse', 'HEAD'); };
  const head = () => git(co, 'rev-parse', 'HEAD');
  const asked = () => existsSync(marks) ? readFileSync(marks, 'utf8').trim().split('\n') : [];
  return { root, co, env, git, write, push, head, asked };
}

test('what a change asks for: packages, the server, the page, the app — and nothing for the rest', () => {
  assert.deepEqual(updateParts(['public/index.html']), ['page']);
  assert.deepEqual(updateParts(['server.mjs', 'mac/Sources/main.swift', 'README.md']), ['server', 'app']);
  assert.deepEqual(updateParts(['lib/termhold.mjs']), ['server']);
  assert.deepEqual(updateParts(['package-lock.json', 'public/vendor/xterm.js']), ['deps', 'server', 'page']);
  assert.deepEqual(updateParts(['docs/DECISIONS.md', 'test/update.test.mjs', 'scripts/scenarios/x.mjs', 'CLAUDE.md']), []);
});

test('a pull, asked for: fast-forwarded, what it touched started again, a commit that does not start held back, and nothing over a change here', { timeout: 60_000 }, async () => {
  const p = project();
  const srv = await startTestServer({ env: { ...p.env, UPDATE_QUIET_MS: '60000' } });
  const look = async (body = {}) => (await srv.post('api/update', body)).body;
  try {
    const st0 = await waitFor(async () => { const b = (await srv.api('api/update')).body; return b.checkout && b; }, { what: 'the checkout read at boot' });
    assert.deepEqual([st0.on, st0.every, st0.branch, st0.upstream, st0.behind], [true, 0, 'main', 'origin/main', 0], 'a server run by hand looks only when asked');
    assert.equal((await look()).why, 'current', 'nothing new');

    // the page: fast-forwarded, nothing restarted (the page reloads itself)
    const a = p.push({ 'public/index.html': PAGE + '<!-- a -->\n' }, 'the page');
    let st = await look();
    assert.equal(p.head(), a, 'fast-forwarded');
    assert.deepEqual([st.why, st.error, st.behind, st.last.count, st.last.parts, st.last.to], ['current', null, 0, 1, ['page'], a]);
    assert.deepEqual(p.asked(), [], 'nothing restarted for a page');

    // the server and the app: the agent restarted, the app rebuilt
    const b = p.push({ 'server.mjs': TINY + '// b\n', 'mac/Sources/main.swift': readFileSync(join(ROOT, 'mac/Sources/main.swift'), 'utf8') + '// b\n' }, 'the server and the app');
    st = await look();
    assert.deepEqual([p.head(), st.last.parts, st.restarting], [b, ['server', 'app'], true]);
    await waitFor(() => p.asked().length === 2, { what: 'the restart and the build' });
    assert.deepEqual(p.asked().sort(), ['build install --detached', 'restart restart --detached']);

    // a server that does not start: undone, and held back until a newer commit comes
    const c = p.push({ 'server.mjs': "throw new Error('boom: this server does not start');\n" }, 'a broken server');
    st = await look();
    assert.equal(p.head(), b, 'undone');
    assert.match(st.error, new RegExp(`^${c.slice(0, 7)} was not kept: its server did not start \\(.*boom: this server does not start`));
    assert.deepEqual([st.why, st.held.to, st.behind], ['held', c, 1]);
    assert.equal(p.git(p.co, 'status', '--porcelain'), '', 'the checkout as it was');
    st = await look();
    assert.deepEqual([st.why, st.error, p.head()], ['held', null, b], 'asked again: still held, and said without an error');
    const d = p.push({ 'server.mjs': TINY + '// d\n' }, 'the fix');
    st = await look();
    assert.deepEqual([p.head(), st.held, st.last.count], [d, null, 2], 'the next commit taken, the held one with it');

    // a page whose script does not compile: held back the same way
    const e = p.push({ 'public/index.html': PAGE.replace('</body>', '<script>let x = ;</script></body>') }, 'a broken page');
    st = await look();
    assert.match(st.error, /was not kept: its page does not compile \(public\/index\.html: Unexpected token/);
    assert.deepEqual([p.head(), st.held.to], [d, e]);
    p.push({ 'public/index.html': PAGE }, 'the page fixed');
    st = await look();
    assert.deepEqual([st.why, st.held], ['current', null]);

    // the packages: npm install, then the server
    p.push({ 'package.json': '{ "name": "tiny", "version": "2.0.0" }\n' }, 'a package');
    st = await look();
    assert.deepEqual(st.last.parts, ['deps', 'server']);
    assert.ok(p.asked().includes('npm install --no-audit --no-fund'), p.asked().join('\n'));

    // a tracked file changed here: said, and nothing pulled over it
    p.write(p.co, { 'README.md': 'mine\n' });
    const f = p.push({ 'public/index.html': PAGE + '<!-- f -->\n' });
    const before = p.head();
    st = await look();
    assert.deepEqual([st.why, st.dirty, st.behind, p.head()], ['changes', 1, 1, before]);
    p.git(p.co, 'checkout', 'README.md');

    // the switch off: said, not taken — unless asked to (update now)
    assert.equal((await srv.api('api/update', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: false }) })).body.on, false);
    st = await look();
    assert.deepEqual([st.why, st.behind, p.head()], ['off', 1, before]);
    st = await look({ apply: true });
    assert.deepEqual([st.why, p.head()], ['current', f]);
    assert.equal(JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).autoUpdate, false, 'the switch is the state file\'s');

    // a branch that moved on its own: never merged, never rebased
    p.write(p.co, { 'mine.txt': 'a commit of mine\n' }); p.git(p.co, 'add', 'mine.txt'); p.git(p.co, 'commit', '-q', '-m', 'mine');
    const mine = p.head();
    p.push({ 'public/index.html': PAGE + '<!-- g -->\n' });
    st = await look({ apply: true });
    assert.deepEqual([st.why, st.ahead, st.behind, p.head()], ['diverged', 1, 1, mine]);
  } finally { await srv.stop(); }
});

test('on its own: looked at by the clock, taken once nothing has been done on the board for a while', { timeout: 40_000 }, async () => {
  const p = project();
  const srv = await startTestServer({ env: { ...p.env, UPDATE_EVERY_MS: '400', UPDATE_QUIET_MS: '2500' } });
  try {
    const a = p.push({ 'public/index.html': PAGE + '<!-- a -->\n' });
    await waitFor(() => p.head() === a, { timeout: 8000, what: 'the commit taken by the clock' });
    await srv.api('api/notifications', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: true }) });   // something done on the board
    const b = p.push({ 'public/index.html': PAGE + '<!-- b -->\n' });
    await sleep(1500);
    const st = (await srv.api('api/update')).body;
    assert.deepEqual([st.why, st.behind, p.head()], ['busy', 1, a], 'seen, and waiting for the board to rest');
    await waitFor(() => p.head() === b, { timeout: 8000, what: 'the commit taken once it rested' });
  } finally { await srv.stop(); }
});

test('not a checkout — the app\'s bundled copy — says so, and pulls nothing', { timeout: 20_000 }, async () => {
  const srv = await startTestServer({ env: { UPDATE_DIR: tmpDir('peix-nogit-') } });
  try {
    const st = (await srv.post('api/update', { apply: true })).body;
    assert.deepEqual([st.checkout, st.why, st.error], [false, 'none', null]);
  } finally { await srv.stop(); }
});
