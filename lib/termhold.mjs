#!/usr/bin/env node
// The holder: one small process per drawer that owns the PTY, so the chat in it survives the server.
//   node lib/termhold.mjs <termsDir> <id>       — the spec is <termsDir>/<id>.json, written by the server
// It spawns claude in a PTY (through an interactive login zsh, as the server did), keeps the exact screen in a
// headless xterm, and listens on <termsDir>/<id>.sock. The server connects and speaks newline-delimited JSON:
//   → {t:'in', d}  {t:'resize', cols, rows}  {t:'snap'}  {t:'kill'}  {t:'quit'}  {t:'meta', sessionId}
//   ← {t:'hello', …meta, cols, rows, seq}  {t:'out', d, seq}  {t:'snap', d, upto, cols, rows}  {t:'exit', code}
// `seq` numbers every output message; a snapshot says `upto` which of them it already contains, so a page that
// attached while output was flowing gets the screen and then only what came after it. The meta file carries the
// PTY's pid (the pid the registry will report), the holder's own, and the exit code once there is one; after
// an exit the holder lingers TERM_LINGER_MS so the last screen can still be read, then removes its files.
// Spawned detached by the server (its own session), so `launchctl kickstart -k` on the server leaves it alone.
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

const [, , dir, id] = process.argv;
if (!dir || !id) { console.error('usage: termhold.mjs <termsDir> <id>'); process.exit(2); }
const specFile = join(dir, `${id}.json`), sockFile = join(dir, `${id}.sock`);
const spec = JSON.parse(readFileSync(specFile, 'utf8'));
const nodePty = await import('node-pty').then(m => m.default ?? m);
const [{ Terminal }, { SerializeAddon }] = await Promise.all([import('@xterm/headless').then(m => m.default ?? m), import('@xterm/addon-serialize').then(m => m.default ?? m)]);
const LINGER_MS = Number(process.env.TERM_LINGER_MS || 5 * 60_000);
const SCROLLBACK = Number(process.env.TERM_SCROLLBACK_LINES || 5000);
const clamp = (cols, rows) => [Math.min(500, Math.max(20, cols | 0)), Math.min(200, Math.max(5, rows | 0))];

const meta = { ...spec, holderPid: process.pid, pid: null, exited: null, exitedAt: null };
const save = () => { try { writeFileSync(specFile, JSON.stringify(meta)); } catch {} };
let proc;
try {
  const [cols, rows] = clamp(spec.cols, spec.rows);
  proc = nodePty.spawn('/bin/zsh', ['-l', '-i', '-c', 'exec "$0" "$@"', spec.bin, ...(spec.args || [])], { name: 'xterm-256color', cols, rows, cwd: spec.cwd, env: process.env });
  meta.pid = proc.pid; meta.cols = cols; meta.rows = rows;
} catch (e) { meta.error = `could not start a terminal: ${e.message}`; save(); console.error(meta.error); process.exit(1); }
save();
const screen = new Terminal({ cols: meta.cols, rows: meta.rows, scrollback: SCROLLBACK, allowProposedApi: true });
const ser = new SerializeAddon(); screen.loadAddon(ser);

const clients = new Set();
let seq = 0;
const send = (c, m) => { if (!c.destroyed) c.write(JSON.stringify(m) + '\n'); };
const all = m => { const s = JSON.stringify(m) + '\n'; for (const c of clients) if (!c.destroyed) c.write(s); };
proc.onData(d => { seq++; screen.write(d); all({ t: 'out', d, seq }); });
function quit() { for (const f of [sockFile, specFile]) try { unlinkSync(f); } catch {} process.exit(0); }
proc.onExit(({ exitCode }) => {
  meta.exited = exitCode ?? 0; meta.exitedAt = new Date().toISOString(); save();
  all({ t: 'exit', code: meta.exited });
  setTimeout(quit, LINGER_MS).unref?.();
  setTimeout(quit, LINGER_MS);   // the unref'd one alone would let the process end early with no clients
});
function handle(c, m) {
  if (m.t === 'in' && typeof m.d === 'string') { if (meta.exited === null) proc.write(m.d); }
  else if (m.t === 'resize' && m.cols > 0 && m.rows > 0) {
    const [cols, rows] = clamp(m.cols, m.rows);
    try { if (meta.exited === null) proc.resize(cols, rows); screen.resize(cols, rows); meta.cols = cols; meta.rows = rows; } catch {}
  }
  else if (m.t === 'snap') { const upto = seq; screen.write('', () => send(c, { t: 'snap', d: ser.serialize({ scrollback: SCROLLBACK }), upto, cols: screen.cols, rows: screen.rows, exited: meta.exited })); }
  else if (m.t === 'meta') { if (typeof m.sessionId === 'string') { meta.sessionId = m.sessionId; save(); } }   // a new chat learnt its id from the registry
  else if (m.t === 'kill') { if (meta.exited === null) try { proc.kill(); } catch {} }
  else if (m.t === 'quit') { if (meta.exited === null) try { proc.kill(); } catch {} setTimeout(quit, 200); }
}
const server = createServer(c => {
  clients.add(c);
  send(c, { t: 'hello', ...meta, cols: screen.cols, rows: screen.rows, seq });
  let buf = '';
  c.on('data', chunk => {
    buf += chunk;
    let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m; try { m = JSON.parse(line); } catch { continue; } handle(c, m); }
  });
  c.on('close', () => clients.delete(c)); c.on('error', () => clients.delete(c));
});
try { unlinkSync(sockFile); } catch {}
server.listen(sockFile, () => { meta.ready = true; save(); });
// A signal to the holder itself ends the chat too — that is a test cleaning up, or someone meaning it.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { if (meta.exited === null) try { proc.kill(); } catch {} setTimeout(quit, 300); });
process.on('SIGHUP', () => {});
