// Headless Chrome over the DevTools protocol — the plumbing scripts/verify.mjs and scripts/scenario.mjs share.
// Why not `chrome --dump-dom`: it dumps on `load`, before the SSE snapshot and fetch fill the page in, and
// `--virtual-time-budget` never expires while the SSE stream is in flight. So: drive Chrome, wait for the DOM.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
export async function launchChrome({ port = 9222 + (process.pid % 500), width = 1700, height = 1000, dark = false, focus = true } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'peixairada-chrome-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });
  /** Chrome ended, then its profile removed — after the exit, not in the same tick (2026-09-27: a Chrome still writing
   *  its profile as it shut down won that race, and $TMPDIR held 1504 of them). SIGKILL after three seconds. */
  const close = () => new Promise(res => {
    const done = () => { try { rmSync(profile, { recursive: true, force: true }); } catch {} res(); };
    if (chrome.exitCode !== null || chrome.signalCode !== null) return done();
    const t = setTimeout(() => { try { chrome.kill('SIGKILL'); } catch {} }, 3000);
    chrome.once('exit', () => { clearTimeout(t); done(); });
    try { chrome.kill(); } catch { clearTimeout(t); done(); }
  });
  let targets;
  for (let i = 0; i < 80 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(150); } }
  if (!targets) { await close(); throw new Error(`Chrome devtools never came up (CHROME=${CHROME})`); }
  let ws;
  try {   // a Chrome that is up but hands over no page, or a socket that fails, must not be left running
    const page = targets.find(t => t.type === 'page'); if (!page) throw new Error('Chrome came up with no page target');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('could not open the devtools socket')); });
  } catch (e) { await close(); throw e; }
  let id = 0;
  const pending = new Map(), exceptions = [], consoleLines = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'exception');
    else if (m.method === 'Runtime.consoleAPICalled') consoleLines.push(`${m.params.type}: ${m.params.args.map(a => a.value ?? a.description ?? '').join(' ')}`);
  };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  /** Evaluate in the page; a promise is awaited; the value comes back by value. Throws on a page exception. */
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    if (r.error) throw new Error(r.error.message);
    return r.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  if (dark) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  if (focus) await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  /** PNG to `file`; `clip` = {x, y, width, height} in CSS px for a part of the page. */
  const shot = async (file, clip) => {
    const png = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { scale: 1, ...clip } } : {}) });
    if (!png.result?.data) throw new Error('no screenshot: ' + (png.error?.message || '?'));
    writeFileSync(file, Buffer.from(png.result.data, 'base64')); return file;
  };
  /** Poll `expr` until truthy. */
  const waitFor = async (expr, { timeout = 10_000, every = 100, what = expr.slice(0, 80) } = {}) => {
    const t0 = Date.now();
    for (;;) { const v = await evaluate(expr); if (v) return v; if (Date.now() - t0 > timeout) throw new Error(`timed out after ${timeout} ms waiting for ${what}`); await sleep(every); }
  };
  return { chrome, send, evaluate, waitFor, shot, sleep, exceptions, console: consoleLines, close: () => { try { ws.close(); } catch {} return close(); } };
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
/** Switch to a chat by id and wait for its transcript (or the empty state). */
export async function openChat(cdp, id) {
  await cdp.evaluate(`location.hash = ${JSON.stringify(id)}`);
  await cdp.evaluate(`new Promise(res => { const t0 = Date.now(); const iv = setInterval(() => {
    if (document.querySelectorAll('.text.md, #log .empty').length || Date.now() - t0 > 8000) { clearInterval(iv); res(1); } }, 100); })`);
}
