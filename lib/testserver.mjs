// A throwaway server for tests: its own state dir, a free port, notifications and the usage call off, and a
// stop() that ends the terminals it made — the ritual that used to be typed by hand (and forgotten).
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function freePort() { return new Promise((res, rej) => { const s = createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); }
export const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
/** A temp dir that goes when this process does (2026-10-03: every test file and scenario left its own behind —
 *  a hundred of them in $TMPDIR). The exit hook is synchronous, as an exit hook has to be. */
export function tmpDir(prefix = 'peix-') {
  const d = mkdtempSync(join(tmpdir(), prefix));
  process.once('exit', () => { try { rmSync(d, { recursive: true, force: true }); } catch {} });
  return d;
}
/** Poll `fn` (sync or async) until it answers something truthy, and hand that back; a timeout is an error that says
 *  what was waited for — the tests used to count forty sleeps and assert on null (2026-09-27). */
export async function waitFor(fn, { timeout = 6000, every = 150, what = 'it' } = {}) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > timeout) throw new Error(`timed out after ${timeout} ms waiting for ${what}`); await sleep(every); }
}

/**
 * Start server.mjs on a free port. `claudeDir`: the ~/.claude to read — a fixture; none is an empty one of its own
 * (2026-10-03: the real one before, and with it a real `gh` call for every PR in the user's chats on every `npm test`);
 * the real one only when named outright, read-only. `fake`: CLAUDE_BIN = scripts/fakeclaude.mjs, so drawers run the
 * stand-in. The state dir is short on purpose: the holders' Unix sockets live under it and macOS caps a socket path at
 * 104 bytes.
 */
export async function startTestServer({ claudeDir = null, fake = false, env = {}, port = null, dir = null, keep = false } = {}) {
  dir ||= mkdtempSync(join(tmpdir(), 'peix-'));
  port ||= await freePort();
  // Two things every test server wants and every scenario used to have to remember. **The clocks**: the registry
  // poll is what notices a pid that died, a chat that moved to a new session id and a background command that let
  // its output file go, and at the live 10 s a scenario either waits half a minute or races it. **The org
  // directory**: the setup's folders of repos otherwise, so anything that lists them would depend on what this Mac
  // happens to hold — it gets an empty one of its own here (and with it, no first-run welcome). `env` is spread last, so a scenario that means something else says so
  // (new-project points ORG_DIR at a tree it built; card-signals spells its own clocks out, because they are what
  // it is about).
  // **Nothing of this Mac's** (2026-10-03): `gh` is the fake (no PR file: GitHub shows nothing), the config, the
  // holders' folder and the XDG dirs are not inherited — a CONFIG_FILE exported in the shell had the config tests write
  // the user's own setup — and a drawer's zsh reads no rc files of the user's (ZDOTDIR: 0.5 s of them per shell); caffeinate
  // and pmset are fakes too (2026-10-08).
  const org = join(dir, 'org'), claude = join(dir, 'claude'), zdot = join(dir, 'zdot');
  for (const d of [org, claude, zdot]) mkdirSync(d, { recursive: true });
  const e = {
    ...process.env, PORT: String(port), STATE_FILE: join(dir, 'state.json'), NOTIFY: 'off', USAGE: 'off',
    REGISTRY_POLL_MS: '1200', TASK_GRACE_MS: '400', CONFIG_POLL_MS: '200', ORG_DIR: org, CLAUDE_DIR: claudeDir || claude,
    GH_BIN: join(ROOT, 'scripts', 'fakegh.mjs'), ZDOTDIR: zdot,
    // keeping the Mac awake (2026-10-08): fakes, and pmset run as it is — no test holds this Mac awake or asks for a password
    CAFFEINATE_BIN: join(ROOT, 'scripts', 'fakecaffeinate.mjs'), PMSET_BIN: join(ROOT, 'scripts', 'fakepmset.mjs'), AWAKE_ADMIN: 'none', FAKE_PMSET_FILE: join(dir, 'pmset'),
    ...(fake ? { CLAUDE_BIN: join(ROOT, 'scripts', 'fakeclaude.mjs') } : {}), ...env,
  };
  for (const k of Object.keys(e)) if (/^CLAUDE(CODE|_CODE)/.test(k)) delete e[k];   // a test run from inside a Claude shell must not look like one to the server
  for (const k of ['CONFIG_FILE', 'TERMS_DIR', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME']) if (!(k in env)) delete e[k];
  const log = join(dir, 'server.log');
  const url = `http://127.0.0.1:${port}/`;
  let proc = null;
  async function launch() {
    const fd = openSync(log, 'a');
    try { proc = spawn(process.execPath, [join(ROOT, 'server.mjs')], { env: e, stdio: ['ignore', fd, fd] }); } finally { closeSync(fd); }   // the child has its own copy
    const t0 = Date.now(), heard = () => (logText().match(/\] listening on /g) || []).length, before = heard();
    for (;;) {
      // up is *this* process answering — its own log says it took the port — not whatever took it after freePort() let it go
      try { if (heard() > before && (await fetch(url + 'api/projects', { signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
      if (proc.exitCode !== null) throw new Error(`test server exited (${proc.exitCode}):\n${logText().slice(-2000)}`);
      if (Date.now() - t0 > 20_000) throw new Error(`test server did not answer on ${port}:\n${logText().slice(-2000)}`);
      await sleep(120);
    }
  }
  const logText = () => { try { return readFileSync(log, 'utf8'); } catch { return ''; } };
  const api = async (path, opts) => { const r = await fetch(url + path.replace(/^\//, ''), opts); const text = await r.text(); let body; try { body = JSON.parse(text); } catch { body = text; } return { status: r.status, ok: r.ok, body }; };
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const terminals = async () => (await api('api/terminals')).body?.terminals || [];
  const killTerminals = async () => { for (const t of await terminals()) if (t.exited === null) await api(`api/terminals/${t.id}`, { method: 'DELETE', signal: AbortSignal.timeout(3000) }); };
  /** The holders under this state dir — they outlive the server by design, so a test has to end them itself. */
  const holders = () => { const d = join(dir, 'terms'); if (!existsSync(d)) return []; return readdirSync(d).filter(f => f.endsWith('.json')).map(f => { try { return JSON.parse(readFileSync(join(d, f), 'utf8')); } catch { return null; } }).filter(Boolean); };
  const killProc = async () => {
    if (!proc || proc.exitCode !== null) return;
    proc.kill('SIGTERM');
    for (let i = 0; i < 50 && proc.exitCode === null; i++) await sleep(100);
    if (proc.exitCode === null) proc.kill('SIGKILL');
  };
  /** End the server only — the holders and their claudes stay, which is what `restart()` then proves. */
  const restart = async () => { await killProc(); await launch(); };
  const stop = async () => {
    try { await killTerminals(); } catch {}
    await killProc();
    const left = () => holders().flatMap(h => [h.pid, h.holderPid]).filter(pid => pid && alive(pid));
    for (const pid of left()) { try { process.kill(pid, 'SIGTERM'); } catch {} }
    if (left().length) { await sleep(300); for (const pid of left()) { try { process.kill(pid, 'SIGKILL'); } catch {} } }
    if (!keep) try { rmSync(dir, { recursive: true, force: true }); } catch {}
  };
  // a server that never came up is ended too, and its dir removed: nobody is handed a stop() for it
  try { await launch(); } catch (err) { await killProc(); if (!keep) try { rmSync(dir, { recursive: true, force: true }); } catch {} throw err; }
  return { url, port, dir, log, env: e, get proc() { return proc; }, api, post, terminals, killTerminals, holders, restart, stop, logText };
}
