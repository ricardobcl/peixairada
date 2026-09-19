#!/usr/bin/env node
// Check the live board in a real browser. Loads the page in headless Chrome, waits until the board
// has rendered, evaluates your expression and prints the result plus any JS exception.
//
//   node scripts/verify.mjs "document.querySelectorAll('.card').length"
//   node scripts/verify.mjs "JSON.stringify({lanes: [...document.querySelectorAll('.lane')].map(l => l.dataset.lane)})"
//   node scripts/verify.mjs --hash <session-id> "document.querySelectorAll('.text.md').length"
//   URL=http://127.0.0.1:7399/ node scripts/verify.mjs "…"
//   node scripts/verify.mjs --shot /tmp/board.png "1"      # also save a screenshot after the expression
//   DARK=1 node scripts/verify.mjs …                      # emulate prefers-color-scheme: dark
//
// Why not `chrome --dump-dom`? It dumps on `load`, before the SSE snapshot and fetch fill the page in,
// so it always shows an empty board; and `--virtual-time-budget` never expires because the SSE stream
// stays open. Driving CDP and waiting for the DOM state is the only reliable way.
//
// Expressions may return a promise — it is awaited. `await` at top level is not allowed, wrap it:
//   "new Promise(r => setTimeout(() => r(document.title), 500))"

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL_ = process.env.URL || 'http://127.0.0.1:7331/';
const PORT = Number(process.env.CDP_PORT || 9222 + (process.pid % 500));
const TIMEOUT = Number(process.env.TIMEOUT_MS || 20000);

const args = process.argv.slice(2);
let hash = null;
const hi = args.indexOf('--hash');
if (hi !== -1) { hash = args[hi + 1]; args.splice(hi, 2); }
let shot = null;
const si = args.indexOf('--shot');
if (si !== -1) { shot = args[si + 1]; args.splice(si, 2); }
const expr = args.join(' ');
if (!expr) { console.error('usage: node scripts/verify.mjs [--hash <session-id>] "<js expression>"'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'peixairada-verify-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1700,1000', 'about:blank',
], { stdio: 'ignore' });

// Chrome may still be flushing its profile as we exit; a leftover temp dir is harmless.
const cleanup = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
const bail = setTimeout(() => { console.error(`timed out after ${TIMEOUT}ms`); process.exit(1); }, TIMEOUT);

let targets;
for (let i = 0; i < 80 && !targets; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(150); }
}
if (!targets) { console.error('Chrome devtools never came up'); process.exit(1); }

const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0;
const pending = new Map();
const exceptions = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.text || 'exception');
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async e => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || '') };
  return { value: r.result?.result?.value };
};

await send('Runtime.enable');
await send('Page.enable');
if (process.env.DARK) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await send('Page.navigate', { url: URL_ });
// wait for the board to actually render (SSE snapshot arrived), not merely for `load`
const ready = await evaluate(`new Promise(res => { const t0 = Date.now(); const iv = setInterval(() => {
  if (document.querySelectorAll('.card').length || Date.now() - t0 > 12000) { clearInterval(iv); res(document.querySelectorAll('.card').length); }
}, 100); })`);
if (!ready.value) console.error('warning: no cards rendered — is the server running at ' + URL_ + '?');

if (hash) {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await evaluate(`new Promise(res => { const t0 = Date.now(); const iv = setInterval(() => {
    if (document.querySelectorAll('.text.md').length || Date.now() - t0 > 8000) { clearInterval(iv); res(1); }
  }, 100); })`);
}

const out = await evaluate(expr);
if (shot) {
  const png = await send('Page.captureScreenshot', { format: 'png' });
  if (png.result?.data) { (await import('node:fs')).writeFileSync(shot, Buffer.from(png.result.data, 'base64')); console.error('screenshot → ' + shot); }
}
clearTimeout(bail);
if (out.error) { console.error('EXCEPTION:', out.error); process.exitCode = 1; }
else console.log(typeof out.value === 'string' ? out.value : JSON.stringify(out.value, null, 1));
if (exceptions.length) { console.error('page JS exceptions:', exceptions); process.exitCode = 1; }
ws.close();
process.exit(process.exitCode || 0);
