// The board's own code kept up to date (2026-10-12): the server fetches its checkout's upstream and fast-forwards to it,
// then starts again what the commits touched — the packages, the server, the page, the app. Here the checkout is a
// throwaway one, cloned from a bare "origin" that a second clone pushes to; its server.mjs a few lines that answer, its
// lib/testserver.mjs, check-page and page the real ones (the pre-flight runs them); the restart, the app's build and npm
// stand-ins that write down what they were asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const stand = (name, then = '') => { const f = join(root, name); writeFileSync(f, `#!/bin/sh\necho "${name} $*" >> "${marks}"\n${then}`); chmodSync(f, 0o755); return f; };
  // the app's build as build.sh ends: `installed →`, or a compiler's complaint; slow when asked to (a file says so)
  const build = stand('build', `[ -f "${root}/build-slow" ] && sleep 2\n[ -f "${root}/build-fails" ] && { echo "swiftc: error: no such module 'Cocoa'"; exit 1; }\necho "installed → /Applications/peixAIrada.app"\n`);
  const env = { UPDATE_DIR: co, UPDATE_RESTART_BIN: stand('restart'), UPDATE_BUILD_BIN: build, NPM_BIN: stand('npm') };
  /** a commit on origin, as from someone else's machine; its sha */
  const push = (files, msg = 'a change') => { write(dev, files); git(dev, 'add', '-A'); git(dev, 'commit', '-q', '-m', msg); git(dev, 'push', '-q'); return git(dev, 'rev-parse', 'HEAD'); };
  const head = () => git(co, 'rev-parse', 'HEAD');
  const asked = () => existsSync(marks) ? readFileSync(marks, 'utf8').trim().split('\n') : [];
  return { root, co, env, git, write, push, head, asked, flag: (name, on) => on ? writeFileSync(join(root, name), '') : rmSync(join(root, name), { force: true }) };
}

test('what a change asks for: packages, the server, the page, the app — and nothing for the rest', () => {
  assert.deepEqual(updateParts(['public/index.html']), ['page']);
  assert.deepEqual(updateParts(['server.mjs', 'mac/Sources/main.swift', 'README.md']), ['server', 'app']);
  assert.deepEqual(updateParts(['lib/termhold.mjs']), ['server']);
  assert.deepEqual(updateParts(['package-lock.json', 'public/vendor/xterm.js']), ['deps', 'server', 'page']);
  assert.deepEqual(updateParts(['docs/DECISIONS.md', 'test/update.test.mjs', 'scripts/scenarios/x.mjs', 'CLAUDE.md']), []);
});

test('a pull, asked for: fast-forwarded, what it touched started again, a commit that does not start held back, and nothing over a change here', { timeout: 60_000 }, async () => {
  const p = project(), dir = tmpDir('peix-');
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ autoUpdate: true }));   // as every save wrote it on 2026-10-12, when on was the default
  const srv = await startTestServer({ dir, env: { ...p.env, UPDATE_QUIET_MS: '60000' } });
  const look = async (body = {}) => (await srv.post('api/update', body)).body;
  const turn = async on => (await srv.api('api/update', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on }) })).body.on;
  try {
    const st0 = await waitFor(async () => { const b = (await srv.api('api/update')).body; return b.checkout && b; }, { what: 'the checkout read at boot' });
    assert.deepEqual([st0.on, st0.every, st0.branch, st0.upstream, st0.behind], [false, 0, 'main', 'origin/main', 0], 'off by default, the old key notwithstanding; a server run by hand looks only when asked');
    assert.equal((await look()).why, 'current', 'nothing new');

    // off (2026-10-13): a new commit said — the status bar's alert — and not taken
    const first = p.head(), a = p.push({ 'public/index.html': PAGE + '<!-- a -->\n' }, 'the page');
    let st = await look();
    assert.deepEqual([st.why, st.behind, st.up, p.head()], ['off', 1, a, first], 'seen, not pulled');
    assert.equal(await turn(true), true);

    // the page: fast-forwarded, nothing restarted (the page reloads itself)
    st = await look();
    assert.equal(p.head(), a, 'fast-forwarded');
    assert.deepEqual([st.why, st.error, st.behind, st.last.count, st.last.parts, st.last.to], ['current', null, 0, 1, ['page'], a]);
    assert.deepEqual(p.asked(), [], 'nothing restarted for a page');

    // the server and the app: the agent restarted, the app rebuilt — each a step the status bar says
    const swift = readFileSync(join(ROOT, 'mac/Sources/main.swift'), 'utf8');
    const b = p.push({ 'server.mjs': TINY + '// b\n', 'mac/Sources/main.swift': swift + '// b\n' }, 'the server and the app');
    st = await look();
    assert.deepEqual([p.head(), st.last.parts, st.restarting], [b, ['server', 'app'], true]);
    assert.deepEqual([st.steps, st.step], [['pull', 'server', 'build', 'restart'], 3], 'the steps, and the last one reached');
    await waitFor(() => p.asked().length === 2, { what: 'the restart and the build' });
    assert.deepEqual(p.asked().sort(), ['build install --detached', 'restart restart --detached']);
    st = await waitFor(async () => { const b = (await srv.api('api/update')).body; return b.last.build?.done && b; }, { what: 'the build\'s end' });
    assert.deepEqual([st.building, st.last.build.ok], [false, true]);

    // a rebuild that outlives the server's restart: followed by the new server, and one that fails is said
    p.flag('build-slow', true); p.flag('build-fails', true);
    p.push({ 'mac/Sources/main.swift': swift + '// b2\n' }, 'the app again');
    st = await look();
    assert.equal(st.building, true, 'building');
    await srv.restart();
    st = (await srv.api('api/update')).body;
    assert.deepEqual([st.building, st.last.build.done], [true, undefined], 'the new server knows the build still runs');
    st = await waitFor(async () => { const b = (await srv.api('api/update')).body; return b.last.build?.done && b; }, { timeout: 10_000, what: 'the build\'s end, seen from the new server' });
    assert.deepEqual([st.building, st.last.build.ok, st.last.build.why], [false, false, "swiftc: error: no such module 'Cocoa'"]);
    p.flag('build-slow', false); p.flag('build-fails', false);

    // a server that does not start: undone, and held back until a newer commit comes
    const kept = p.head(), c = p.push({ 'server.mjs': "throw new Error('boom: this server does not start');\n" }, 'a broken server');
    st = await look();
    assert.equal(p.head(), kept, 'undone');
    assert.match(st.error, new RegExp(`^${c.slice(0, 7)} was not kept: its server did not start \\(.*boom: this server does not start`));
    assert.deepEqual([st.why, st.held.to, st.behind, st.failed], ['held', c, 1, st.error], 'the update itself failed: the status bar says so');
    assert.equal(p.git(p.co, 'status', '--porcelain'), '', 'the checkout as it was');
    st = await look();
    assert.deepEqual([st.why, st.error, p.head()], ['held', null, kept], 'asked again: still held, and said without an error');
    const d = p.push({ 'server.mjs': TINY + '// d\n' }, 'the fix');
    st = await look();
    assert.deepEqual([p.head(), st.held, st.failed, st.last.count], [d, null, null, 2], 'the next commit taken, the held one with it');

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
    assert.equal(await turn(false), false);
    st = await look();
    assert.deepEqual([st.why, st.behind, p.head()], ['off', 1, before]);
    st = await look({ apply: true });
    assert.deepEqual([st.why, p.head()], ['current', f]);
    const saved = JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8'));
    assert.deepEqual([saved.selfUpdate, saved.autoUpdate], [false, undefined], 'the switch is the state file\'s, the old key gone');

    // a branch that moved on its own: never merged, never rebased
    p.write(p.co, { 'mine.txt': 'a commit of mine\n' }); p.git(p.co, 'add', 'mine.txt'); p.git(p.co, 'commit', '-q', '-m', 'mine');
    const mine = p.head();
    p.push({ 'public/index.html': PAGE + '<!-- g -->\n' });
    st = await look({ apply: true });
    assert.deepEqual([st.why, st.ahead, st.behind, p.head()], ['diverged', 1, 1, mine]);
  } finally { await srv.stop(); }
});

test('on its own: looked at by the clock, taken once nothing has been done on the board for a while', { timeout: 40_000 }, async () => {
  const p = project(), dir = tmpDir('peix-');
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ selfUpdate: true }));   // switched on
  const srv = await startTestServer({ dir, env: { ...p.env, UPDATE_EVERY_MS: '400', UPDATE_QUIET_MS: '2500' } });
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
