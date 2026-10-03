// Headless Chrome over the DevTools protocol — the plumbing scripts/verify.mjs and scripts/scenario.mjs share.
// Why not `chrome --dump-dom`: it dumps on `load`, before the SSE snapshot and fetch fill the page in, and
// `--virtual-time-budget` never expires while the SSE stream is in flight. So: drive Chrome, wait for the DOM.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Launch a headless Chrome and connect to its first page. Returns the protocol primitives plus a few
 * conveniences. `focus` (default on) makes the page believe it has the keyboard: Claude Code stops
 * rendering while its terminal reports focus lost, and a headless page's focus() is not a focus without it —
 * the repaint never comes and the status timer freezes (2026-09-20, an hour lost).
 */
export async function launchChrome({ port = 0, width = 1700, height = 1000, dark = false, focus = true } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'peixairada-chrome-'));
  // Port 0 is Chrome's pick, read back from the profile (2026-10-03; 9222 + pid % 500 before, never checked: two runs
  // whose pids were 500 apart, or a Chrome of the user's own on 9222, and the scenario drove somebody else's page).
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });
  let failed = null;   // a CHROME that cannot be spawned is an 'error' event, and one nobody listens for ends this process
  chrome.once('error', e => { failed = e; });
  /** Chrome ended, then its profile removed — after the exit, not in the same tick (2026-09-27: a Chrome still writing
   *  its profile as it shut down won that race, and $TMPDIR held 1504 of them), and after its helpers too (2026-10-03:
   *  the network service outlives the browser by a moment and wrote two files back). SIGKILL after three seconds. */
  const helpers = () => { try { execFileSync('/usr/bin/pgrep', ['-f', profile], { stdio: 'ignore' }); return true; } catch { return false; } };
  const close = () => new Promise(res => {
    const done = async () => { for (let i = 0; i < 30 && helpers(); i++) await sleep(100); try { rmSync(profile, { recursive: true, force: true }); } catch {} res(); };
    if (failed || chrome.exitCode !== null || chrome.signalCode !== null) return done();
    const t = setTimeout(() => { try { chrome.kill('SIGKILL'); } catch {} }, 3000);
    chrome.once('exit', () => { clearTimeout(t); done(); });
    try { chrome.kill(); } catch { clearTimeout(t); done(); }
  });
  let targets;
  for (let i = 0; i < 80 && !targets && !failed; i++) {
    try {
      port ||= Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || 0;
      if (port) targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {}
    if (!targets) await sleep(150);
  }
  if (!targets) { await close(); throw new Error(`Chrome devtools never came up (CHROME=${CHROME}${failed ? `: ${failed.message}` : ''})`); }
  let ws;
  try {   // a Chrome that is up but hands over no page, or a socket that fails, must not be left running
    const page = targets.find(t => t.type === 'page'); if (!page) throw new Error('Chrome came up with no page target');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('could not open the devtools socket')); });
  } catch (e) { await close(); throw e; }
  // A command is answered, or fails: when the socket closes or the page crashes every one waiting is rejected, and one
  // with no answer in `timeout` ms gives up (2026-10-03: a Chrome that died left every evaluate — and the failure
  // path's screenshot — waiting for the scenario's whole bail, twice over with the suite's retry).
  let id = 0, dead = null;
  const pending = new Map(), exceptions = [], consoleLines = [];
  const fail = why => { dead ||= new Error(why); for (const p of pending.values()) p.reject(dead); pending.clear(); };
  ws.onclose = () => fail('the devtools socket closed — Chrome is gone');
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m); pending.delete(m.id); }
    else if (m.method === 'Inspector.targetCrashed') fail('the page crashed');
    else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'exception');
    else if (m.method === 'Runtime.consoleAPICalled') consoleLines.push(`${m.params.type}: ${m.params.args.map(a => a.value ?? a.description ?? '').join(' ')}`);
  };
  const send = (method, params = {}, { timeout = 60_000 } = {}) => {
    if (dead) return Promise.reject(dead);
    const i = ++id, { promise, resolve, reject } = Promise.withResolvers();
    const t = setTimeout(() => { pending.delete(i); reject(new Error(`${method}: no answer in ${timeout} ms`)); }, timeout);
    pending.set(i, { resolve: m => { clearTimeout(t); resolve(m); }, reject: e => { clearTimeout(t); reject(e); } });
    ws.send(JSON.stringify({ id: i, method, params }));
    return promise;
  };
  /** Evaluate in the page; a promise is awaited; the value comes back by value. Throws on a page exception. */
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    if (r.error) throw new Error(r.error.message);
    return r.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Inspector.enable');
  if (dark) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  if (focus) await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  /** PNG to `file`; `clip` = {x, y, width, height} in CSS px for a part of the page. */
  const shot = async (file, clip) => {
    const png = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { scale: 1, ...clip } } : {}) });
    if (!png.result?.data) throw new Error('no screenshot: ' + (png.error?.message || '?'));
    writeFileSync(file, Buffer.from(png.result.data, 'base64')); return file;
  };
  /** Poll `expr` until truthy. A page between two documents (a reload, a navigation) is a falsy answer, not an error. */
  const waitFor = async (expr, { timeout = 10_000, every = 100, what = expr.slice(0, 80) } = {}) => {
    const t0 = Date.now();
    for (;;) {
      let v; try { v = await evaluate(expr); } catch (e) { if (dead || !/context was destroyed|Cannot find context/i.test(e.message)) throw e; }
      if (v) return v; if (Date.now() - t0 > timeout) throw new Error(`timed out after ${timeout} ms waiting for ${what}`); await sleep(every);
    }
  };
  /** Reload the page and wait for the new document's first SSE snapshot (2026-10-03: a reload and a fixed sleep before,
   *  in fifteen places — too short, and the next wait was answered by the old page). */
  const reload = async ({ timeout = 15_000 } = {}) => {
    await evaluate('window.__peixOld = 1');
    await send('Page.reload');
    await waitFor('!window.__peixOld && window.peix?.state().snapshots > 0', { timeout, what: 'the reloaded page\'s snapshot' });
  };
  return { chrome, send, evaluate, waitFor, reload, shot, sleep, exceptions, console: consoleLines, close: () => { try { ws.close(); } catch {} return close(); } };
}

/** Open the board and wait for the SSE snapshot (cards rendered); with `hash`, open that chat and wait for its transcript. */
export async function openBoard(cdp, url, { hash = null } = {}) {
  await cdp.send('Page.navigate', { url });
  const cards = await cdp.evaluate(`new Promise(res => { const t0 = Date.now(); const iv = setInterval(() => {
    if (document.querySelectorAll('.card').length || Date.now() - t0 > 12000) { clearInterval(iv); res(document.querySelectorAll('.card').length); } }, 100); })`);
  if (!cards) console.error(`warning: no cards rendered — is the server running at ${url}?`);
  if (hash) await openChat(cdp, hash);
  return cards;
}
/** Switch to a chat by id and wait for *its* transcript — `#log` drawn for that chat (2026-10-03: any `.text.md` or the
 *  page's own placeholder answered before, so the wait waited for nothing). */
export async function openChat(cdp, id) {
  await cdp.evaluate(`location.hash = ${JSON.stringify(id)}`);
  const sid = JSON.stringify(id);
  await cdp.waitFor(`window.peix?.state().current === ${sid} && document.querySelector('#log')?.dataset.sid === ${sid}`, { timeout: 8000, what: `chat ${id.slice(0, 8)} to open` });
}
