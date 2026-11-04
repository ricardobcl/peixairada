#!/usr/bin/env node
// The real shell, driven (2026-11-04): what no scenario can reach. A scenario is the page in Chrome with a fake bridge,
// so it can say what the page asks for, in the page's own coordinates; whether the app's window, its overlay and its web
// views agree with that is the shell's, and only a look at the window can say.
//   npm run shell                   every check in scripts/shell-checks/
//   npm run shell -- pane-place     the ones named
//   npm run shell -- --shots <dir>  where the window's pictures go ($TMPDIR/peixairada-shots by default)
//   npm run shell -- --src <dir>/main.swift   another main.swift, to see a check fail on the bug it is for
//   npm run shell -- --space        macOS's own full screen: the app comes forward and takes a Space for some seconds, so
//                                   only when asked, and it is all this runs
// mac/Sources/main.swift itself is compiled with scripts/shell-probe.swift beside it, -D PEIX_PROBE, into the cache, and
// run on a throwaway server and a fixture, its home a temp folder (CFFIXED_USER_HOME: the key, the logs, no launchd agent
// to find) — out of the way of the app in use: never in front, one pixel on the screen (scripts/shell-probe.swift).
// A check is an ES module: `export const meta = {}` and `export default async function (ctx) { … return result }`; `ctx`
// is listed below. Exit 0 all passed, 1 one failed, 3 could not be run (the screen locked or asleep: WebKit runs no frames).
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture } from './fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), NAME = 'peix-shell';
const argv = process.argv.slice(2), opt = name => { const i = argv.indexOf(name); return i < 0 ? null : argv.splice(i, 2)[1]; }, flag = name => { const i = argv.indexOf(name); if (i < 0) return false; argv.splice(i, 1); return true; };
const shots = opt('--shots') || join(tmpdir(), 'peixairada-shots'), srcAsked = opt('--src'), space = flag('--space'), named = argv.filter(a => !a.startsWith('--'));
const DRIVE = join(ROOT, 'scripts/shell-probe.swift'), SRC = srcAsked ? resolve(srcAsked) : join(ROOT, 'mac/Sources/main.swift');
if (basename(SRC) !== 'main.swift') { console.error('--src wants a file named main.swift: swiftc takes top-level code from no other'); process.exit(2); }
if (process.platform !== 'darwin') { console.error('the shell is a Mac\'s'); process.exit(2); }
mkdirSync(shots, { recursive: true });
let nm = ROOT; while (!existsSync(join(nm, 'node_modules')) && dirname(nm) !== nm) nm = dirname(nm);
const CACHE = join(nm, 'node_modules/.cache/peixairada');
const sourceHash = () => createHash('sha256').update(readFileSync(SRC)).update(readFileSync(DRIVE)).digest('hex');

/** Compiled once per what it is compiled from, whichever worktree asks: flags as build.sh's but -O, which only takes longer. */
function compile() {
  const hash = sourceHash(), dir = join(CACHE, 'shell', hash.slice(0, 16)), bin = join(dir, NAME);
  if (existsSync(bin)) return bin;
  const min = /^MIN_OS=(.*)$/m.exec(readFileSync(join(ROOT, 'mac/build.sh'), 'utf8'))?.[1] || '13.0';
  const arch = spawnSync('uname', ['-m'], { encoding: 'utf8' }).stdout.trim();
  mkdirSync(dir, { recursive: true });
  console.error(`› compiling ${SRC === join(ROOT, 'mac/Sources/main.swift') ? 'mac/Sources/main.swift' : SRC} with the probe`);
  const made = join(dir, `${NAME}.${process.pid}`);
  const c = spawnSync('swiftc', ['-swift-version', '5', '-D', 'PEIX_PROBE', '-target', `${arch}-apple-macosx${min}`, SRC, DRIVE, '-o', made], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (c.status !== 0) { console.error(c.stderr); process.exit(c.status ?? 1); }
  renameSync(made, bin);
  for (const old of readdirSync(join(CACHE, 'shell'))) if (old !== hash.slice(0, 16)) { const p = join(CACHE, 'shell', old); if (Date.now() - statSync(p).mtimeMs > 86_400_000) rmSync(p, { recursive: true, force: true }); }
  return bin;
}
/** Its defaults are the one thing the fake home does not move: the process's name's, in the real ~/Library/Preferences. */
const wipeDefaults = () => { spawnSync('defaults', ['delete', NAME], { stdio: 'ignore' }); rmSync(join(homedir(), 'Library/Preferences', `${NAME}.plist`), { force: true }); };

/** Pages of one colour, for a check to read off the window. */
function pagesServer() {
  const srv = createServer((req, res) => {
    const hex = /^\/solid\/([0-9a-f]{6})/.exec(req.url)?.[1];
    if (!hex) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>${hex}</title><style>html, body { height: 100%; margin: 0; background: #${hex}; }</style>`);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

/** The shell as a process: a line of JSON each way. */
function startShell(bin, { port, home, space: inSpace }) {
  const child = spawn(bin, ['-peixairada.fill', 'NO', ...(inSpace ? [] : ['-peixairada.space', 'NO'])], {
    env: { ...process.env, PEIXAIRADA_PORT: String(port), CFFIXED_USER_HOME: home, ...(inSpace ? { PEIX_PROBE_SPACE: '1' } : {}) }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let seq = 0, err = '', ready, failed;
  const waiting = new Map(), up = new Promise((res, rej) => { ready = res; failed = rej; });
  child.stderr.on('data', d => { err = (err + d).slice(-4000); });
  child.stdin.on('error', () => {});
  child.on('exit', (code, sig) => {
    const e = new Error(`the shell ended (${code ?? sig})${err ? `:\n${err}` : ''}`);
    failed(e); for (const w of waiting.values()) w.rej(e); waiting.clear();
  });
  createInterface({ input: child.stdout }).on('line', line => {
    let m; try { m = JSON.parse(line); } catch { return; }
    if (m.ready) return ready(m);
    const w = waiting.get(m.id); if (!w) return;
    waiting.delete(m.id); clearTimeout(w.t);
    if (m.ok) w.res(m.value); else w.rej(new Error(`${w.what}: ${m.error}`));
  });
  const ask = (what, o = {}, ms = 20_000) => new Promise((res, rej) => {
    const id = ++seq, t = setTimeout(() => { waiting.delete(id); rej(new Error(`no answer from the shell in ${ms} ms to ${what}`)); }, ms);
    waiting.set(id, { res, rej, t, what });
    child.stdin.write(JSON.stringify({ id, do: what, ...o }) + '\n');
  });
  return { up, ask, child, stop: () => { try { child.stdin.end(); } catch {} setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 1500).unref(); } };
}

// What a scenario's page starts from (lib/cdp.mjs): the tour taken, the timeline seen, and every page in the board, so
// none goes to the browser of the Mac this runs on; and the fill's word on the way in said, a pill over the strip.
const PREFS = { toured: true, tvSeen: true, lanesShut: [], skinFollow: true, cards: 'large', cardsMoved: true, pagesOut: false, linksMoved: true, fillHints: 99 };

async function runCheck(file, bin) {
  const name = basename(file, '.mjs'), mod = await import(pathToFileURL(file).href), meta = mod.meta || {};
  const log = (...a) => console.error(`[${name}]`, ...a), home = tmpDir('peix-home-'), cleanups = [];
  const repos = realpathSync(tmpDir('peix-repo-')), cwdA = join(repos, 'repo-a'); mkdirSync(cwdA);
  const fixture = defaultFixture(tmpDir('peix-fixture-'), { cwdA, cwdB: realpathSync(tmpdir()) });
  const server = await startTestServer({ claudeDir: fixture.dir, env: meta.env || {} }); cleanups.push(() => server.stop());
  const pages = await pagesServer(); cleanups.push(() => pages.close());
  for (const d of ['Library/Application Support/peixAIrada', 'Library/Logs']) mkdirSync(join(home, d), { recursive: true });
  writeFileSync(join(home, 'Library/Application Support/peixAIrada/key'), server.key);
  wipeDefaults();
  const shell = startShell(bin, { port: server.port, home, space: !!meta.space }); cleanups.push(() => shell.stop());
  const appLog = () => { try { return readFileSync(join(home, 'Library/Logs/peixairada-app.log'), 'utf8'); } catch { return ''; } };
  try {
    const hello = await shell.up;
    if (hello.unseen) return { name, skipped: hello.unseen };
    const ctx = {
      name, log, assert, fixture, server, appLog, ask: shell.ask, shots, aside: !meta.space,
      /** A body of script on the board, what it returns (JSON). */
      js: code => shell.ask('js', { code }).then(v => JSON.parse(v)),
      /** …on a page in the pane, by its key. */
      page: (key, code) => shell.ask('page', { key, code }).then(v => JSON.parse(v)),
      /** The window as the shell has it: size, style, fill, the overlay's top, each pane view's place. */
      win: () => shell.ask('window'),
      until: (code, what = code, timeout = 15_000) => waitFor(() => ctx.js(`return ${code}`), { what, timeout, every: 100 }),
      /** A key as the forwarder hands it to the page. */
      key: (code, mods = 'altcmd') => ctx.js(`return window.peixKey(${JSON.stringify(code)}, ${JSON.stringify(mods)})`),
      /** The address of a page of one colour. */
      solid: hex => `http://127.0.0.1:${pages.address().port}/solid/${hex}`,
      /** The board up, from what a scenario's page starts from. */
      board: async (prefs = {}) => {
        await ctx.until(`!!window.peix && peix.state().snapshots > 0`, 'the board in the shell\'s web view', 30_000);
        await ctx.js(`window.__before = true; localStorage.setItem('peixairada-prefs', ${JSON.stringify(JSON.stringify({ ...PREFS, ...prefs }))}); setTimeout(() => location.reload(), 0); return true`);
        await ctx.until(`!window.__before && !!window.peix && peix.state().snapshots > 0`, 'the board again, with its prefs', 30_000);
        ctx.assert.equal(await ctx.js(`return JSON.parse(localStorage.getItem('peixairada-prefs')).pagesOut`), false, 'every page in the board: none goes to this Mac\'s browser');
      },
      openChat: async id => { await ctx.js(`location.hash = ${JSON.stringify(id)}; return true`); await ctx.until(`peix.state().current === ${JSON.stringify(id)} && document.querySelector('#log')?.dataset.sid === ${JSON.stringify(id)}`, 'the chat open'); },
      /** A link in the transcript clicked: the way most pages get here. */
      link: url => ctx.js(`const a = document.createElement('a'); a.href = ${JSON.stringify(url)}; a.textContent = 'x'; document.querySelector('#log').append(a); a.click(); a.remove(); return true`),
      /** The half showing the page at `url`, once one does. */
      halfOf: url => waitFor(async () => { const h = await ctx.js(`return peix.state().halves`), g = h.findIndex(k => (k || '').endsWith(url)); return g < 0 ? null : { g, key: h[g] }; }, { what: `a half showing ${url}`, every: 100 }),
      /** ⌃⌘F, and the shell's word that it took. */
      full: async () => { const was = await ctx.win(); await shell.ask('full'); await waitFor(async () => { const w = await ctx.win(); return w.fill !== was.fill || w.full !== was.full ? w : null; }, { what: 'the full screen to change', timeout: 15_000, every: 100 }); },
      size: (w, h) => shell.ask('size', { w, h }),
      /** Settings' text size, as its menu picks it. */
      zoom: async z => { await ctx.js(`const p = document.querySelector('#zoomPick'); p.value = ${JSON.stringify(String(z))}; p.dispatchEvent(new Event('change')); return true`); await waitFor(async () => (await ctx.win()).zoom === z, { what: `the zoom at ${z}`, every: 50 }); },
      /** A picture of the window as WebKit and the window server drew it. */
      shot: async label => { const path = join(shots, `shell-${name}-${label}.png`); await shell.ask('shot', { path }); return path; },
    };
    const t0 = Date.now(), result = await mod.default(ctx);
    log(`passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return { name, ok: true, result };
  } catch (e) {
    log(`FAILED: ${e.stack || e}`);
    const tail = appLog().split('\n').slice(-12).join('\n');
    if (tail.trim()) log(`the shell's log, its end:\n${tail}`);
    return { name, ok: false, error: e.message };
  } finally {
    for (const c of cleanups.reverse()) { try { await c(); } catch (e) { log('cleanup:', e.message); } }
    wipeDefaults();
  }
}

const dir = join(ROOT, 'scripts/shell-checks');
const all = readdirSync(dir).filter(f => f.endsWith('.mjs')).map(f => join(dir, f)), metas = new Map();
for (const f of all) metas.set(f, (await import(pathToFileURL(f).href)).meta || {});
const chosen = named.length ? all.filter(f => named.includes(basename(f, '.mjs'))) : all.filter(f => !!metas.get(f).space === space);
if (!chosen.length) { console.error(`no check named ${named.join(', ')} among ${all.map(f => basename(f, '.mjs')).join(', ')}`); process.exit(2); }

const bin = compile();
const results = [];
for (const f of chosen) results.push(await runCheck(f, bin));
const failed = results.filter(r => r.ok === false), skipped = results.filter(r => r.skipped);
for (const r of results) console.log(`${r.skipped ? 'NOT RUN' : r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.skipped ? ` — ${r.skipped}` : r.ok ? '' : ` — ${r.error.split('\n')[0]}`}`);
// `npm run check` says when main.swift has moved on from the last time this passed whole (scripts/check.sh)
if (!failed.length && !skipped.length && !named.length && !space && !srcAsked) { mkdirSync(CACHE, { recursive: true }); writeFileSync(join(CACHE, 'shell-passed'), sourceHash()); }
process.exit(failed.length ? 1 : skipped.length ? 3 : 0);
