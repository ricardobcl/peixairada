// The board updating itself (2026-10-12), as the page sees it. The server's checkout is a throwaway clone of a bare
// "origin" that a second clone pushes to (test/update.test.mjs has the server's side); the agent's restart is a stand-in
// that writes it was asked, and the scenario restarts the server itself, as launchd would. What this checks: the
// settings' Updates row says where the checkout stands; *check now* with a commit that changes the page pulls it and
// reloads the page at once; one pulled by the server on its own waits for the page to be left be — not under a dialog,
// not while keys are pressed — and then reloads it; one that changes the server too waits for the new server before
// the page reloads; the switch is the server's.
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
const restart = join(root, 'restart');
writeFileSync(restart, `#!/bin/sh\necho "restart $*" >> "${marks}"\n`); chmodSync(restart, 0o755);
let n = 0;
/** a commit on origin, as from someone else's machine; its sha */
const push = (files = { 'public/index.html': `${PAGE}<!-- ${++n} -->\n` }) => { write(files); git(dev, 'add', '-A'); git(dev, 'commit', '-q', '-m', `change ${n}`); git(dev, 'push', '-q'); return git(dev, 'rev-parse', 'HEAD'); };

export const meta = { server: true, env: { UPDATE_DIR: co, UPDATE_RESTART_BIN: restart, UPDATE_QUIET_MS: '0' } };

export default async function (ctx) {
  const out = {};
  const mark = () => ctx.evaluate(`window.__mark = 1`);
  const reloaded = what => ctx.waitFor(`!window.__mark && window.peix?.state().snapshots > 0`, { timeout: 25_000, what });
  const say = () => ctx.evaluate(`document.querySelector('#updSay').textContent`);
  try {
    // where it stands
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open && /not looked yet/.test(document.querySelector('#updSay').textContent)`, { what: 'the Updates row, before a look' });
    await ctx.evaluate(`document.querySelector('#updBtn').click()`);
    await ctx.waitFor(`/up to date/.test(document.querySelector('#updSay').textContent)`, { what: 'a look: up to date' });
    out.first = await say();
    ctx.assert.match(out.first, new RegExp(`^up to date · ${git(co, 'rev-parse', '--short=7', 'HEAD')} · looked \\d+s ago · it looks only when asked`), out.first);
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#autoUpdate').checked`), true, 'on by default');
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

    // pulled by the server on its own: the page waits while a dialog is up and while keys are pressed, then reloads
    await mark();
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings again' });
    const b = push();
    await ctx.server.post('/api/update', {});
    ctx.assert.equal(git(co, 'rev-parse', 'HEAD'), b);
    await ctx.waitFor(`window.peix.state().reload?.why === 'dialog'`, { what: 'the reload waiting on the dialog' });
    await ctx.evaluate(`document.querySelector('#settings').close()`);
    for (let i = 0; i < 4; i++) { await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 }); await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 }); await ctx.sleep(1000); }
    out.waiting = await ctx.evaluate(`window.peix?.state().reload`);
    ctx.assert.deepEqual(out.waiting, { to: b, why: 'input' }, 'keys pressed a moment ago: not yet');
    await reloaded('the page reloaded once left be');

    // a commit that changes the server and the page, asked for here: the page waits for the new server
    await mark();
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings once more' });
    const c = push({ 'server.mjs': `${TINY}// ${++n}\n`, 'public/index.html': `${PAGE}<!-- ${n} -->\n` });
    await ctx.evaluate(`document.querySelector('#updBtn').click()`);
    await ctx.waitFor(`window.peix.state().reload?.why === 'server'`, { what: 'the reload waiting on the server' });
    ctx.assert.equal(git(co, 'rev-parse', 'HEAD'), c);
    for (let i = 0; i < 40 && !existsSync(marks); i++) await ctx.sleep(100);
    ctx.assert.equal(readFileSync(marks, 'utf8').trim(), 'restart restart --detached', 'the agent asked to restart');
    await ctx.sleep(1500);
    ctx.assert.equal(await ctx.evaluate(`window.__mark`), 1, 'not before the server is back');
    await ctx.server.restart();   // as launchd would
    await reloaded('the page reloaded from the new server');

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
    await ctx.evaluate(`document.querySelector('#updRow').scrollIntoView({ block: 'center' })`); await ctx.settle();
    await ctx.shot('2-off', await ctx.evaluate(`(r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))(document.querySelector('#settings').getBoundingClientRect())`));
    return out;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
