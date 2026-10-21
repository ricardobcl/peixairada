// A throwaway server for tests: its own state dir, a free port, notifications and the usage call off, and a
// stop() that ends the terminals it made — the ritual that used to be typed by hand (and forgotten).
import { execFileSync, spawn } from 'node:child_process';
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
 *  what was waited for — the tests used to count forty sleeps and assert on null (2026-09-27). The timeout is for what
 *  never comes, not a speed limit: `npm test` runs every file at once, and a drawer's fake claude that registers in
 *  1.2 s alone took over 6 s there (2026-10-13) — so 15 s, which a passing wait never spends. */
export async function waitFor(fn, { timeout = 15_000, every = 150, what = 'it' } = {}) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > timeout) throw new Error(`timed out after ${timeout} ms waiting for ${what}`); await sleep(every); }
}

/**
 * Start server.mjs on a free port. `claudeDir`: the ~/.claude to read — a fixture; none is an empty one of its own
 * (2026-10-03: the real one before, and with it a real `gh` call for every PR in the user's chats on every `npm test`);
 * the real one only when named outright, read-only. `fake`: CLAUDE_BIN = scripts/fakeclaude.mjs, so drawers run the
 * stand-in; without it scripts/noclaude.mjs, which refuses (2026-10-14) — the real CLI only when named, `env: { CLAUDE_BIN }`.
 * The state dir is short on purpose: the holders' Unix sockets live under it and macOS caps a socket path at
 * 104 bytes.
 */
export async function startTestServer({ claudeDir = null, fake = false, env = {}, port = null, dir = null, keep = false } = {}) {
  dir ||= mkdtempSync(join(tmpdir(), 'peix-'));
  const ownPort = !port;   // a port of its own picking, which it may pick again; one the caller named is waited for
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
  // and pmset are fakes too, and Jira's token is a file of its own (2026-10-08); and the apps Zed is looked for among are a
  // folder of its own, with brew a fake and Launch Services left alone (2026-10-13).
  // **No real CLI by default** (2026-10-14): claude was the search's (~/.local/bin/claude, on the real ~/.claude, for any
  // test that reached a spawn without `fake`), `code serve-web` and `task` the real ones, and the update's checkout this
  // repo — a POST /api/update from a test would have fetched and fast-forwarded it. Now a claude that refuses, the fakes
  // of code (on a port of its own: 7332 is the live board's VS Code Web) and task, and an empty folder for a checkout.
  const org = join(dir, 'org'), claude = join(dir, 'claude'), zdot = join(dir, 'zdot'), apps = join(dir, 'apps'), checkout = join(dir, 'checkout');
  for (const d of [org, claude, zdot, apps, checkout]) mkdirSync(d, { recursive: true });
  const e = {
    ...process.env, PORT: String(port), STATE_FILE: join(dir, 'state.json'), NOTIFY: 'off', USAGE: 'off',
    REGISTRY_POLL_MS: '1200', TASK_GRACE_MS: '400', CONFIG_POLL_MS: '200', POWER_POLL_MS: '1200', ORG_DIR: org, CLAUDE_DIR: claudeDir || claude,
    GH_BIN: join(ROOT, 'scripts', 'fakegh.mjs'), ZDOTDIR: zdot,
    // keeping the Mac awake (2026-10-08): fakes, and pmset run as it is — no test holds this Mac awake or asks for a password
    CAFFEINATE_BIN: join(ROOT, 'scripts', 'fakecaffeinate.mjs'), PMSET_BIN: join(ROOT, 'scripts', 'fakepmset.mjs'), AWAKE_ADMIN: 'none', FAKE_PMSET_FILE: join(dir, 'pmset'), FAKE_PMSET_POWER: join(dir, 'pmset-power'),
    // Jira (2026-10-08): its token in a file of the server's own, never the keychain, and no jira-cli config to offer
    JIRA_TOKEN_FILE: join(dir, 'jira-token'), JIRA_CONFIG_FILE: join(dir, 'jira-cli.yml'),
    // VS Code Web kept on its newest build (2026-10-11): never from a test — no update service, no serve-web started
    VSWEB_FRESH_MS: '0',
    // the board's own update (2026-10-12): never by the clock — a test server looks at a checkout only when a test asks it to;
    // and no installed app to hold against it (2026-10-14) but one a test makes there
    UPDATE_EVERY_MS: '0', BOARD_APP: join(dir, 'peixAIrada.app'),
    // Zed, installed when picked (2026-10-13): into this server's own apps folder, by the fake — never brew, never /Applications
    APP_DIRS: apps, BREW_BIN: join(ROOT, 'scripts', 'fakebrew.mjs'), LSREGISTER_BIN: '/usr/bin/true',
    PEIX_TEST_PARENT: String(process.pid),
    CLAUDE_BIN: join(ROOT, 'scripts', fake ? 'fakeclaude.mjs' : 'noclaude.mjs'), CODE_BIN: join(ROOT, 'scripts', 'fakecode.mjs'), VSWEB_PORT: String(await freePort()),
    TASK_BIN: join(ROOT, 'scripts', 'faketask.mjs'), VIM_BIN: join(ROOT, 'scripts', 'fakevim.mjs'), UPDATE_DIR: checkout,
    // the board's key (2026-10-16): required from the first ask — every helper here sends it (`api`, `key`, `ws`), so
    // whatever forgets it fails here first —, and a tab with a ticket "opened" into a file, never a browser
    KEY_MODE: 'enforce', OPEN_BIN: join(ROOT, 'scripts', 'fakeopen.mjs'), FAKE_OPEN_LOG: join(dir, 'opened'),
    // the chat (2026-10-17): GitHub's REST API nowhere — a test hands its fake GitHub's address (scripts/fakegithub.mjs)
    GITHUB_API: 'http://127.0.0.1:9',
    // lunch (2026-10-18): Instagram and the menus' reader are fakes answering from files of the server's own, never Chrome
    // or a claude; its clock quick
    INSTAGRAM_BIN: join(ROOT, 'scripts', 'fakeinstagram.mjs'), FAKEIG_FILE: join(dir, 'instagram.json'), FAKEIG_LOG: join(dir, 'instagram.log'),
    READER_BIN: join(ROOT, 'scripts', 'fakereader.mjs'), FAKEREADER_FILE: join(dir, 'reader.json'), FAKEREADER_LOG: join(dir, 'reader.log'), LUNCH_TICK_MS: '300',
    ...env,
  };
  for (const k of Object.keys(e)) if (/^CLAUDE(CODE|_CODE)/.test(k)) delete e[k];   // a test run from inside a Claude shell must not look like one to the server
  for (const k of ['CONFIG_FILE', 'TERMS_DIR', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME', 'JIRA_API_TOKEN']) if (!(k in env)) delete e[k];
  const log = join(dir, 'server.log');
  let url = `http://127.0.0.1:${port}/`;
  let proc = null;
  async function launch(move = false) {
    for (let moves = 0; ; moves++) {
      const fd = openSync(log, 'a'), from = logText().length;
      // stdin a pipe, and PEIX_TEST_PARENT (2026-10-14): the pipe's end is this process gone, and the server goes with it
      // — a test killed or crashed before its stop() no longer leaves its server (and drawers) running for good —; and
      // its state dir on its command line, which the server never reads: what names it in `ps` (scripts/scenarios.mjs)
      try { proc = spawn(process.execPath, [join(ROOT, 'server.mjs'), '--test-state', dir], { env: e, stdio: ['pipe', fd, fd] }); } finally { closeSync(fd); }   // the child has its own copy
      const t0 = Date.now(), heard = () => (logText().match(/\] listening on /g) || []).length, before = heard();
      for (;;) {
        // up is *this* process answering — its own log says it took the port — not whatever took it after freePort() let it go
        try { if (heard() > before && (await fetch(url + 'api/alive', { signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
        if (proc.exitCode !== null) throw new Error(`test server exited (${proc.exitCode}):\n${logText().slice(-2000)}`);
        // a port taken between freePort() and the listen (2026-10-14): the server waits for it, 3 s at a time, and this
        // gave up after 20 s — another free port is a moment away
        if (move && moves < 5 && logText().slice(from).includes(`port ${port} is busy`)) break;
        if (Date.now() - t0 > 20_000) throw new Error(`test server did not answer on ${port}:\n${logText().slice(-2000)}`);
        await sleep(120);
      }
      await killProc();
      port = await freePort(); e.PORT = String(port); url = `http://127.0.0.1:${port}/`;
    }
  }
  const logText = () => { try { return readFileSync(log, 'utf8'); } catch { return ''; } };
  /** The board's key, as its file has it now; `ws(path)` a drawer's socket's address with it. */
  const key = () => { try { return readFileSync(join(dir, 'key'), 'utf8').trim(); } catch { return ''; } };
  const ws = path => `${url.replace(/^http/, 'ws')}${path.replace(/^\//, '')}?key=${key()}`;
  const api = async (path, opts = {}) => { const r = await fetch(url + path.replace(/^\//, ''), { ...opts, headers: { 'x-peix-key': key(), ...opts.headers } }); const text = await r.text(); let body; try { body = JSON.parse(text); } catch { body = text; } return { status: r.status, ok: r.ok, body }; };
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const terminals = async () => (await api('api/terminals')).body?.terminals || [];
  const killTerminals = async () => { for (const t of await terminals()) if (t.exited === null) await api(`api/terminals/${t.id}`, { method: 'DELETE', signal: AbortSignal.timeout(3000) }); };
  /** The holders under this state dir — they outlive the server by design, so a test has to end them itself. */
  const holders = () => { const d = join(dir, 'terms'); if (!existsSync(d)) return []; return readdirSync(d).filter(f => f.endsWith('.json')).map(f => { try { return JSON.parse(readFileSync(join(d, f), 'utf8')); } catch { return null; } }).filter(Boolean); };
  /** The pids a holder's file names, signalled only while they are still what it says (2026-10-14): the holder by its
   *  command line (termhold.mjs over this server's terms folder), its PTY's process only while it has not exited and is
   *  that holder's child — an exited one's pid, or a holder's from a file left behind, may be anyone's by now. */
  const ps = (pid, field) => { try { return execFileSync('/bin/ps', ['-ww', '-o', `${field}=`, '-p', String(pid)], { encoding: 'utf8' }).trim(); } catch { return ''; } };
  const ours = h => {
    const holder = h.holderPid && ps(h.holderPid, 'command').includes(`termhold.mjs ${join(dir, 'terms')} `) ? h.holderPid : null;
    return [holder && h.exited === null && h.pid && Number(ps(h.pid, 'ppid')) === holder ? h.pid : null, holder].filter(Boolean);
  };
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
    const left = () => holders().flatMap(ours);
    for (const pid of left()) { try { process.kill(pid, 'SIGTERM'); } catch {} }
    if (left().length) { await sleep(300); for (const pid of left()) { try { process.kill(pid, 'SIGKILL'); } catch {} } }
    if (!keep) try { rmSync(dir, { recursive: true, force: true }); } catch {}
  };
  // a server that never came up is ended too, and its dir removed: nobody is handed a stop() for it
  try { await launch(ownPort); } catch (err) { await killProc(); if (!keep) try { rmSync(dir, { recursive: true, force: true }); } catch {} throw err; }
  return { get url() { return url; }, get port() { return port; }, dir, log, env: e, get proc() { return proc; }, get key() { return key(); }, ws, api, post, terminals, killTerminals, holders, restart, stop, logText };
}
