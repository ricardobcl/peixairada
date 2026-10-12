// The board updating itself (2026-10-12), as the page sees it. The server's checkout is a throwaway clone of a bare
// "origin" that a second clone pushes to (test/update.test.mjs has the server's side); the agent's restart is a stand-in
// that writes it was asked, and the scenario restarts the server itself, as launchd would. What this checks: the
// settings' Updates row says where the checkout stands; *check now* with a commit that changes the page pulls it and
// reloads the page at once; one pulled by the server on its own waits for the page to be left be — not under a dialog,
// not while keys are pressed — and then reloads it; one that changes the server too waits for the new server before
// the page reloads; the switch is the server's. The status bar says it all as it goes: a page waiting to be reloaded,
// the restart, a step under way with its bar (the packages, slowed down here), new commits not taken and why — a click
// opening Settings › Updates.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'peix-upd-')), origin = join(root, 'origin.git'), co = join(root, 'co'), dev = join(root, 'dev'), marks = join(root, 'marks');
const git = (cwd, ...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-C', cwd, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' } }).trim();
const write = files => { for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(dev, f)), { recursive: true }); writeFileSync(join(dev, f), body); } };
const TINY = `import { createServer } from 'node:http';\nconst s = createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); });\ns.listen(Number(process.env.PORT), '127.0.0.1', () => console.log('[tiny] listening on ' + process.env.PORT));\nprocess.on('SIGTERM', () => process.exit(0));\n`;
const PAGE = readFileSync(join(ROOT, 'public', 'index.html'), 'utf8');
mkdirSync(dev);
git(dev, 'init', '-q', '-b', 'main');
write({ 'server.mjs': TINY, 'public/index.html': PAGE });
for (const f of ['lib/testserver.mjs', 'scripts/check-page.mjs', 'mac/Sources/main.swift']) cpSync(join(ROOT, f), join(dev, f));
git(dev, 'add', '-A'); git(dev, 'commit', '-q', '-m', 'the first');
git(root, 'init', '-q', '--bare', '-b', 'main', origin);
git(dev, 'remote', 'add', 'origin', origin); git(dev, 'push', '-q', '-u', 'origin', 'main');
git(root, 'clone', '-q', origin, co);
const restart = join(root, 'restart'), npm = join(root, 'npm');
writeFileSync(restart, `#!/bin/sh\necho "restart $*" >> "${marks}"\n`); chmodSync(restart, 0o755);
writeFileSync(npm, '#!/bin/sh\nsleep 3\n'); chmodSync(npm, 0o755);   // a slow install: long enough to see the step
let n = 0;
/** a commit on origin, as from someone else's machine; its sha */
const push = (files = { 'public/index.html': `${PAGE}<!-- ${++n} -->\n` }) => { write(files); git(dev, 'add', '-A'); git(dev, 'commit', '-q', '-m', `change ${n}`); git(dev, 'push', '-q'); return git(dev, 'rev-parse', 'HEAD'); };

export const meta = { server: true, env: { UPDATE_DIR: co, UPDATE_RESTART_BIN: restart, NPM_BIN: npm, UPDATE_QUIET_MS: '0' } };

export default async function (ctx) {
  const out = {};
  const mark = () => ctx.evaluate(`window.__mark = 1`);
  const reloaded = what => ctx.waitFor(`!window.__mark && window.peix?.state().snapshots > 0`, { timeout: 25_000, what });
  const say = () => ctx.evaluate(`document.querySelector('#updSay').textContent`);
  const seg = () => ctx.evaluate(`(b => b && { cls: b.className, text: b.textContent, tip: b.title, p: b.querySelector('i')?.style.getPropertyValue('--p') || null })(document.querySelector('#sbLeft .upg'))`);
  const barShot = label => ctx.evaluate(`(r => ({ x: r.left, y: r.top - 4, width: Math.min(r.width, 900), height: r.height + 8 }))(document.querySelector('#sbar').getBoundingClientRect())`).then(r => ctx.shot(label, r));
  try {
    // where it stands
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open && /not looked yet/.test(document.querySelector('#updSay').textContent)`, { what: 'the Updates row, before a look' });
    await ctx.evaluate(`document.querySelector('#updBtn').click()`);
    await ctx.waitFor(`/up to date/.test(document.querySelector('#updSay').textContent)`, { what: 'a look: up to date' });
    out.first = await say();
    ctx.assert.match(out.first, new RegExp(`^up to date · ${git(co, 'rev-parse', '--short=7', 'HEAD')} · looked \\d+s ago · it looks only when asked`), out.first);
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#autoUpdate').checked`), true, 'on by default');
    ctx.assert.equal(await seg(), null, 'up to date: the status bar says nothing');
    await ctx.evaluate(`document.querySelector('#updRow').scrollIntoView({ block: 'center' })`); await ctx.settle();
    await ctx.shot('1-up-to-date', await ctx.evaluate(`(r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))(document.querySelector('#settings').getBoundingClientRect())`));

    // check now, with a commit that changes the page: pulled, and the page reloaded at once — the dialog notwithstanding
    const a = push();
    await mark();
    await ctx.evaluate(`document.querySelector('#updBtn').click()`);
    await reloaded('the page reloaded at once');
    ctx.assert.equal(git(co, 'rev-parse', 'HEAD'), a, 'pulled');
    out.after = await ctx.evaluate(`window.peix.state().reload`);
    ctx.assert.equal(out.after, null, 'a page loaded after the update wants nothing more');
    await ctx.waitFor(`document.querySelector('#sbLeft .upg')`, { what: 'the status bar saying it' });
    ctx.assert.deepEqual(await seg().then(x => [x.cls, x.text]), ['seg upg done', 'updated · 1 commit'], 'for a minute, what came');

    // pulled by the server on its own: the page waits while a dialog is up and while keys are pressed, then reloads
    await mark();
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings again' });
    const b = push();
    await ctx.server.post('/api/update', {});
    ctx.assert.equal(git(co, 'rev-parse', 'HEAD'), b);
    await ctx.waitFor(`window.peix.state().reload?.why === 'dialog'`, { what: 'the reload waiting on the dialog' });
    out.pageSeg = await seg();
    ctx.assert.deepEqual([out.pageSeg.cls, out.pageSeg.text], ['seg upg page', 'updated · reload the page']);
    ctx.assert.match(out.pageSeg.tip, /once you leave it be \(a dialog is up\) — click to reload it now/);
    await ctx.evaluate(`document.querySelector('#settings').close()`);
    for (let i = 0; i < 4; i++) { await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 }); await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 }); await ctx.sleep(1000); }
    out.waiting = await ctx.evaluate(`window.peix?.state().reload`);
    ctx.assert.deepEqual(out.waiting, { to: b, why: 'input' }, 'keys pressed a moment ago: not yet');
    ctx.assert.match((await seg()).tip, /\(you are at it\)/);
    await barShot('2-bar-reload');
    await reloaded('the page reloaded once left be');

    // a commit that changes the server and the page, asked for here: the page waits for the new server
    await mark();
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings once more' });
    const c = push({ 'server.mjs': `${TINY}// ${++n}\n`, 'public/index.html': `${PAGE}<!-- ${n} -->\n` });
    await ctx.evaluate(`document.querySelector('#updBtn').click()`);
    await ctx.waitFor(`window.peix.state().reload?.why === 'server'`, { what: 'the reload waiting on the server' });
    ctx.assert.equal(git(co, 'rev-parse', 'HEAD'), c);
    out.restartSeg = await seg();
    ctx.assert.deepEqual([out.restartSeg.cls, out.restartSeg.text, out.restartSeg.p], ['seg upg run', 'restarting the server…', '0.88'], 'the last of four steps');
    for (let i = 0; i < 40 && !existsSync(marks); i++) await ctx.sleep(100);
    ctx.assert.equal(readFileSync(marks, 'utf8').trim(), 'restart restart --detached', 'the agent asked to restart');
    await ctx.sleep(1500);
    ctx.assert.equal(await ctx.evaluate(`window.__mark`), 1, 'not before the server is back');
    await ctx.server.restart();   // as launchd would
    await reloaded('the page reloaded from the new server');

    // a step that takes a while — the packages — said with its bar as it runs
    push({ 'package.json': `{ "name": "tiny", "version": "${++n}.0.0" }\n` });
    await ctx.evaluate(`document.querySelector('#updBtn').click()`);
    await ctx.waitFor(`document.querySelector('#sbLeft .upg.run')?.textContent === 'installing the packages…'`, { what: 'the packages, being installed' });
    out.npmSeg = await seg();
    ctx.assert.equal(out.npmSeg.p, '0.38', 'the second of four steps');
    ctx.assert.match(await say(), /^updating to \w{7} — installing the packages \(2 of 4\)…/);
    await barShot('3-bar-installing');
    await ctx.waitFor(`document.querySelector('#sbLeft .upg.run')?.textContent === 'restarting the server…'`, { timeout: 10_000, what: 'the restart, next' });
    await ctx.server.restart();
    await ctx.waitFor(`document.querySelector('#sbLeft .upg.done')`, { timeout: 10_000, what: 'done, once the server is back' });

    // the switch is the server's
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings, last' });
    await ctx.evaluate(`document.querySelector('#autoUpdate').click()`);
    for (let i = 0; i < 30 && (await ctx.server.api('api/update')).body.on !== false; i++) await ctx.sleep(100);
    ctx.assert.equal((await ctx.server.api('api/update')).body.on, false, 'the server switched off');
    push();
    await ctx.evaluate(`document.querySelector('#updBtn').click()`);
    await ctx.waitFor(`document.querySelector('#updBtn').textContent === 'update now'`, { what: 'update now, offered' });
    out.off = await say();
    ctx.assert.match(out.off, /^1 new commit on origin\/main — the switch is off/);
    await ctx.evaluate(`document.querySelector('#settings').close()`);
    await ctx.waitFor(`document.querySelector('#sbLeft .upg.new')`, { what: 'the status bar saying new commits wait' });
    ctx.assert.equal((await seg()).text, '1 new commit · updates off');
    await barShot('4-bar-new');
    await ctx.evaluate(`document.querySelector('#sbLeft .upg').click()`);
    await ctx.waitFor(`document.querySelector('#settings').open && document.querySelector('#settings [data-tab="board"]').classList.contains('on')`, { what: 'a click opening the settings at Updates' });
    await ctx.settle();
    await ctx.evaluate(`document.querySelector('#updRow').scrollIntoView({ block: 'center' })`); await ctx.settle();
    await ctx.shot('2-off', await ctx.evaluate(`(r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))(document.querySelector('#settings').getBoundingClientRect())`));
    return out;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
