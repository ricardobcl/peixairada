// The board's own code kept up to date (2026-10-12): the server fetches its checkout's upstream and fast-forwards to it,
// then starts again what the commits touched — the packages, the server, the page, the app. Here the checkout is a
// throwaway one, cloned from a bare "origin" that a second clone pushes to; its server.mjs a few lines that answer, its
// lib/testserver.mjs, check-page and page the real ones (the pre-flight runs them); the restart, the app's build and npm
// stand-ins that write down what they were asked; the installed app a folder with an Info.plist, stamped as build.sh does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { updateParts } from '../server.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TINY = `import { createServer } from 'node:http';\nconst s = createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); });\ns.listen(Number(process.env.PORT), '127.0.0.1', () => console.log('[tiny] listening on ' + process.env.PORT));\nprocess.on('SIGTERM', () => process.exit(0));\n`;
const PAGE = readFileSync(join(ROOT, 'public', 'index.html'), 'utf8');

/** origin.git, a clone the server updates (`co`) and one that commits and pushes (`dev`); the stand-ins write to `marks`;
 *  the installed app (`app`) built from the first commit's mac/, until a build stamps it again. */
function project() {
  const root = tmpDir('peix-upd-'), origin = join(root, 'origin.git'), co = join(root, 'co'), dev = join(root, 'dev'), marks = join(root, 'marks'), app = join(root, 'peixAIrada.app');
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
  const plist = join(app, 'Contents', 'Info.plist'), stamp = tree => { mkdirSync(dirname(plist), { recursive: true }); writeFileSync(plist, `<plist version="1.0"><dict>\n  <key>PeixSource</key><string>${tree}</string>\n</dict></plist>\n`); };
  stamp(git(co, 'rev-parse', 'HEAD:mac'));
  const stand = (name, then = '') => { const f = join(root, name); writeFileSync(f, `#!/bin/sh\necho "${name} $*" >> "${marks}"\n${then}`); chmodSync(f, 0o755); return f; };
  // the app's build as build.sh ends: stamped with the checkout's mac/ and `installed →`, or a compiler's complaint; slow
  // when asked to (a file says so)
  const build = stand('build', `[ -f "${root}/build-slow" ] && sleep 2\n[ -f "${root}/build-fails" ] && { echo "swiftc: error: no such module 'Cocoa'"; exit 1; }\nprintf '<plist><dict><key>PeixSource</key><string>%s</string></dict></plist>\\n' "$(git -C "${co}" rev-parse HEAD:mac)" > "${plist}"\necho "installed → /Applications/peixAIrada.app"\n`);
  const env = { UPDATE_DIR: co, UPDATE_RESTART_BIN: stand('restart'), UPDATE_BUILD_BIN: build, NPM_BIN: stand('npm'), BOARD_APP: app };
  /** a commit on origin, as from someone else's machine; its sha */
  const push = (files, msg = 'a change') => { write(dev, files); git(dev, 'add', '-A'); git(dev, 'commit', '-q', '-m', msg); git(dev, 'push', '-q'); return git(dev, 'rev-parse', 'HEAD'); };
  const head = () => git(co, 'rev-parse', 'HEAD');
  const asked = () => existsSync(marks) ? readFileSync(marks, 'utf8').trim().split('\n') : [];
  /** a commit made here, in the checkout the server runs from — never pushed, so no pull ever brings it */
  const commit = (files, msg = 'a change of mine') => { write(co, files); git(co, 'add', '-A'); git(co, 'commit', '-q', '-m', msg); return git(co, 'rev-parse', 'HEAD'); };
  const builds = () => asked().filter(l => l.startsWith('build ')).length;
  return { root, co, env, git, write, push, commit, head, asked, builds, stamp, flag: (name, on) => on ? writeFileSync(join(root, name), '') : rmSync(join(root, name), { force: true }) };
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
    st = await waitFor(async () => { const b = (await srv.api('api/update')).body; return b.build?.done && b; }, { what: 'the build\'s end' });
    assert.deepEqual([st.building, st.build.ok], [false, true]);
    st = await waitFor(async () => { const b = (await srv.api('api/update')).body; return b.app?.behind === false && b; }, { what: 'the app stamped as built' });

    // a rebuild that outlives the server's restart: followed by the new server, and one that fails is said
    p.flag('build-slow', true); p.flag('build-fails', true);
    p.push({ 'mac/Sources/main.swift': swift + '// b2\n' }, 'the app again');
    st = await look();
    assert.equal(st.building, true, 'building');
    await srv.restart();
    st = (await srv.api('api/update')).body;
    assert.deepEqual([st.building, st.build.done], [true, undefined], 'the new server knows the build still runs');
    st = await waitFor(async () => { const b = (await srv.api('api/update')).body; return b.build?.done && b; }, { what: 'the build\'s end, seen from the new server' });
    assert.deepEqual([st.building, st.build.ok, st.build.why], [false, false, "swiftc: error: no such module 'Cocoa'"]);
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

test('a commit made here while the pre-flight runs is never undone with the commit that failed it (2026-10-14)', { timeout: 60_000 }, async () => {
  const p = project();
  // npm install, as the update runs it: meanwhile a session commits in the checkout (once — the undo would install again)
  const npm = join(p.root, 'npm-commits');
  writeFileSync(npm, `#!/bin/sh\n[ -f "${p.root}/committed" ] && exit 0\ntouch "${p.root}/committed"\necho mine > "${p.co}/mine.txt"\ngit -c commit.gpgsign=false -c core.hooksPath=/dev/null -c user.name=t -c user.email=t@t -C "${p.co}" add mine.txt\ngit -c commit.gpgsign=false -c core.hooksPath=/dev/null -c user.name=t -c user.email=t@t -C "${p.co}" commit -q -m 'mine, mid-update'\n`);
  chmodSync(npm, 0o755);
  const srv = await startTestServer({ env: { ...p.env, NPM_BIN: npm, UPDATE_QUIET_MS: '60000' } });
  try {
    const c = p.push({ 'package.json': '{ "name": "tiny", "version": "2.0.0" }\n', 'server.mjs': "throw new Error('boom: this server does not start');\n" }, 'a broken server and a package');
    const st = (await srv.post('api/update', { apply: true })).body;
    assert.match(st.error, new RegExp(`^${c.slice(0, 7)} was not kept: its server did not start .* — not undone: [0-9a-f]{7} was committed on it since; the checkout stays as it is`));
    assert.equal(p.git(p.co, 'log', '-1', '--format=%s'), 'mine, mid-update', 'the commit made meanwhile is still the branch\'s');
    assert.equal(p.git(p.co, 'rev-parse', 'HEAD~1'), c);
    assert.deepEqual([st.why, st.held.to], ['held', c]);
  } finally { await srv.stop(); }
});

test('an app behind its checkout with nothing to pull: said, rebuilt by update now — never over work in mac/, by the switch not twice for one source', { timeout: 60_000 }, async () => {
  const p = project();
  p.stamp('0'.repeat(40));   // built from an older mac/ — or before the stamp
  const srv = await startTestServer({ env: { ...p.env, UPDATE_QUIET_MS: '60000' } });
  const look = async (body = {}) => (await srv.post('api/update', body)).body;
  const now = async () => (await srv.api('api/update')).body;
  try {
    let st = await look();
    assert.deepEqual([st.why, st.app.behind, st.appWhy, p.builds()], ['current', true, 'off', 0], 'nothing to pull, the app behind: said, not rebuilt with the switch off');
    p.write(p.co, { 'mac/Sources/more.swift': '// half written\n' });
    st = await look({ apply: true });
    assert.deepEqual([st.app.changes, st.appWhy, p.builds()], [1, 'changes', 0], 'never over work in mac/, even asked');
    rmSync(join(p.co, 'mac/Sources/more.swift'));
    await look({ apply: true });
    await waitFor(() => p.builds() === 1, { what: 'update now rebuilding it' });
    st = await waitFor(async () => { const b = await now(); return !b.building && b.app?.behind === false && b; }, { what: 'the app rebuilt and stamped' });
    assert.deepEqual([st.build.ok, st.build.source, st.app.built, st.appWhy], [true, st.app.source, st.app.source, 'none']);

    // a commit made here: no pull ever brings it, and the app is behind it all the same
    const swift = readFileSync(join(p.co, 'mac/Sources/main.swift'), 'utf8');
    p.commit({ 'mac/Sources/main.swift': swift + '// mine\n' });
    st = await look();
    assert.deepEqual([st.why, st.ahead, st.app.behind, st.appWhy], ['current', 1, true, 'off']);
    // the switch on, and asked: rebuilt at once — one that fails is said, and not tried again but by the button
    p.flag('build-fails', true);
    await srv.api('api/update', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: true }) });
    await look();
    st = await waitFor(async () => { const b = await now(); return b.build?.done && b.appWhy !== 'building' && b; }, { what: 'the failed build\'s end' });
    assert.deepEqual([st.build.ok, st.app.behind, st.appWhy, p.builds()], [false, true, 'tried', 2]);
    st = await look();
    assert.deepEqual([st.appWhy, p.builds()], ['tried', 2], 'not twice for one source');
    p.flag('build-fails', false);
    await look({ apply: true });
    st = await waitFor(async () => { const b = await now(); return !b.building && b.app?.behind === false && b; }, { what: 'update now tries it again' });
    assert.deepEqual([st.build.ok, p.builds()], [true, 3]);
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
    await waitFor(async () => { const u = (await srv.api('api/update')).body; return p.head() === b && u.last?.to === b && !u.busy; }, { timeout: 8000, what: 'the commit taken once it rested' });

    // a commit made here to mac/: the app behind it, rebuilt by the clock as a pull is taken — once the board rests
    await srv.api('api/notifications', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: false }) });
    p.commit({ 'mac/Sources/main.swift': readFileSync(join(p.co, 'mac/Sources/main.swift'), 'utf8') + '// mine\n' });
    await sleep(1000);
    const st2 = (await srv.api('api/update')).body;
    assert.deepEqual([st2.app.behind, st2.appWhy, p.builds()], [true, 'busy', 0], 'seen, and waiting for the board to rest');
    await waitFor(async () => { const u = (await srv.api('api/update')).body; return p.builds() === 1 && u.app?.behind === false; }, { timeout: 8000, what: 'the app rebuilt once it rested' });
  } finally { await srv.stop(); }
});

test('not a checkout — the app\'s bundled copy — says so, and pulls nothing', { timeout: 20_000 }, async () => {
  const srv = await startTestServer({ env: { UPDATE_DIR: tmpDir('peix-nogit-') } });
  try {
    const st = (await srv.post('api/update', { apply: true })).body;
    assert.deepEqual([st.checkout, st.why, st.error], [false, 'none', null]);
  } finally { await srv.stop(); }
});

test('the page follows a restart: served with a stamp of itself and the boot that served it, every snapshot names the page on disk', { timeout: 40_000 }, async () => {
  const srv = await startTestServer();
  /** the stream's snapshot, and the stream let go */
  const snapshot = async () => {
    const res = await fetch(srv.url + 'events'), reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) throw new Error('the stream ended before its snapshot');
        buf += dec.decode(value, { stream: true });
        const m = /^event: snapshot\ndata: (.*?)\n\n/s.exec(buf); if (m) return JSON.parse(m[1]);
      }
    } finally { reader.cancel().catch(() => {}); }
  };
  try {
    const html = await (await fetch(srv.url)).text();
    const m = /<meta name="peix-page" content="([0-9a-f]{12})" data-since="(\d+)">/.exec(html);
    assert.ok(m, 'the head carries the stamp and the boot');
    assert.equal(m[1], createHash('sha1').update(readFileSync(join(ROOT, 'public', 'index.html'))).digest('hex').slice(0, 12), 'the stamp is the file\'s, not the page as served');
    const a = await snapshot();
    assert.deepEqual([a.page, a.about.since], [m[1], Number(m[2])], 'the server that served it: the same page, the same boot');
    await srv.restart();
    const b = await snapshot();
    assert.equal(b.page, m[1], 'the same page on disk');
    assert.notEqual(b.about.since, Number(m[2]), 'another boot');
  } finally { await srv.stop(); }
});
