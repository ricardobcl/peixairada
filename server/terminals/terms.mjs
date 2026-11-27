// Terminals: a real claude in a PTY, held by a process of its own (lib/termhold.mjs) — the drawers the
// board holds, and what the pages are told of them.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { ROOT, STATE_FILE } from '../env.mjs';
import { claudeBin } from '../bins.mjs';
import { nodePty } from '../pty.mjs';
import { pidAlive, procStarts, squash } from '../registry.mjs';

// Chatting from the board means running Claude Code itself, not re-implementing its UI: the process
// is the CLI in a pseudo-terminal, the page shows it through xterm.js, and every feature the TUI has
// comes along — permission prompts, questions, plan mode, slash commands. It registers in
// ~/.claude/sessions like any Terminal.app run (entrypoint "cli") and writes the same transcript,
// so the watcher tracks it with no special casing; the rendered chat above the drawer is the reading
// view and the terminal is where you type.
//
// The PTY does not live here. Each drawer is a holder (lib/termhold.mjs), a small process spawned detached
// that owns the PTY and the exact screen (a headless xterm) and listens on a Unix socket under TERMS_DIR;
// this server connects to it and proxies pages to it. So a server restart — `scripts/launchd.sh restart`,
// a crash — leaves every chat running, and on boot the server adopts the holders it finds. Until
// 2026-09-20 the PTY was in-process and every restart ended every drawer, this project's own included.
// A resumed chat keeps its session id; a new one is matched to its session by pid when it registers —
// the holder reports the PTY's pid, and is told the id back so an adoption after a restart knows it too.
export const TERMS_DIR = process.env.TERMS_DIR || join(dirname(STATE_FILE), 'terms');
export const HOLDER = join(ROOT, 'lib', 'termhold.mjs');
export const TERM_LINGER_MS = Number(process.env.TERM_LINGER_MS || 5 * 60_000); // an exited holder keeps its last screen this long (the holder's own timer; this one forgets it here)
export const HOLDER_START_MS = 15_000;
export const SOCK_MAX = 103; // bytes in a Unix socket's path: macOS's sun_path holds 104, one kept for its NUL (lib/termhold.mjs has its copy)
export const terms = new Map(); // id -> { id, sessionId, cwd, pid, holderPid, resume, startedAt, exited, cols, rows, sock, clients, snapQ, lastSnap }
export const termsAvailable = () => !!nodePty && existsSync(HOLDER);

/** The chat's drawer (`shell` false) or its zsh (true) — a live one over an exited one still lingering in `terms`. The
 *  same rule as termIndex, for one chat. An editor's tab (`editor`, 2026-10-21) is a shell's kind, and never its zsh. */
function drawerOf(s, shell) {
  let hit = null;
  for (const t of terms.values())
    if (
      t.sessionId === s.id &&
      !!t.shell === shell &&
      !t.editor &&
      (!hit || (hit.exited !== null && t.exited === null))
    )
      hit = t;
  return hit;
}
export const termOf = s => drawerOf(s, false),
  shellOf = s => drawerOf(s, true);
/** Every zsh of the chat (2026-10-13: ⌘T opens another) and its editors' (vim), the exited ones still lingering too,
 *  oldest first — each its tab. */
const byStart = (a, b) => String(a.startedAt).localeCompare(String(b.startedAt));
export const shellsOf = s => [...terms.values()].filter(t => t.sessionId === s.id && t.shell).sort(byStart);
export const NO_TERMS = Object.freeze({ term: null, shell: null, shells: [] });
/** Every chat's drawer and zsh in one pass, by the same rule — for the summaries of the whole board, which asked
 *  termOf and shellOf per chat, each a walk over every terminal (322 chats × 75 terminals × 2 per snapshot, 2026-09-27). */
export function termIndex() {
  const m = new Map();
  for (const t of terms.values()) {
    if (!t.sessionId) continue;
    let e = m.get(t.sessionId);
    if (!e) m.set(t.sessionId, (e = { term: null, shell: null, shells: [] }));
    const k = t.shell ? 'shell' : 'term';
    if (!t.editor && (!e[k] || (e[k].exited !== null && t.exited === null))) e[k] = t;
    if (t.shell) e.shells.push(t);
  }
  for (const e of m.values()) e.shells.sort(byStart);
  return m;
}
export function termSummary(t) {
  return t
    ? {
        id: t.id,
        sessionId: t.sessionId,
        cwd: t.cwd,
        pid: t.pid,
        holderPid: t.holderPid,
        resume: t.resume,
        shell: !!t.shell,
        editor: t.editor || null,
        task: t.task || null,
        startedAt: t.startedAt,
        exited: t.exited,
        cols: t.cols,
        rows: t.rows,
        clients: t.clients.size,
        connected: !!(t.sock && !t.sock.destroyed),
        lastSnapshotChars: t.lastSnap,
      }
    : null;
}

// The server's own environment minus anything that says "you are inside a Claude session" — under
// `npm start` from a Claude shell that is exactly what it says, and the CLI refuses to nest. Only the nesting markers
// go: CLAUDECODE and CLAUDE_CODE_*. CLAUDE_DIR is this project's own (a fixture in tests — the fake claude reads it)
// and CLAUDE_BIN the override the server already resolved; neither means anything to the CLI.
export const cleanEnv = () =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDECODE$|^CLAUDE_CODE_/.test(k)));
export function termEnv() {
  const env = cleanEnv();
  // PEIXAIRADA_DRAWER tells a script that its shell is a drawer (launchd.sh and build.sh check it).
  return {
    ...env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: env.LANG || 'en_US.UTF-8',
    PEIXAIRADA_DRAWER: '1',
  };
}
// …and minus the board's own configuration, for what you work in — a drawer, a zsh tab, VS Code Web's terminals (2026-10-14):
// PORT is the agent's 7331 or the app's, and a `rails s`, `next dev` or `process.env.PORT || 3000` run there took the
// board's port; HOST, NOTIFY, STATE_FILE, the clocks and the <NAME>_BIN overrides are this server's alone. Every name it
// reads off its environment goes but CLAUDE_DIR (see above), the ones that are the system's or a tool's too (PATH, XDG_*,
// VSCODE_CLI_DATA_DIR, JIRA_API_TOKEN) and the holder's TERM_LINGER_MS, which the holder keeps from its PTY. A knob
// added to the server joins the list (terminals.test reads the server for them).
const BOARD_ENV = new Set([
  'WT_ASK_MS',
  'PORT',
  'HOST',
  'NOTIFY',
  'USAGE',
  'STATE_FILE',
  'CONFIG_FILE',
  'TERMS_DIR',
  'SCRATCH_DIR',
  'ORG',
  'ORG_DIR',
  'APP_DIRS',
  'BOARD_APP',
  'AWAKE_ADMIN',
  'MAX_ENTRIES',
  'TAIL_BYTES',
  'HEAD_BYTES',
  'CHANGES_MAX',
  'JIRA_TOKEN_FILE',
  'JIRA_CONFIG_FILE',
  'UPDATE_DIR',
  'VSWEB_PORT',
  'VSWEB_UPDATE_URL',
  'CLAUDE_JSON',
  'KEY_MODE',
  'AGENT_STALE_MS',
  'AGENT_WORDS_MS',
  'CLONE_MS',
  'CONFIG_POLL_MS',
  'POWER_POLL_MS',
  'DRAWER_IDLE_MS',
  'MONITOR_MS',
  'PR_TTL_MS',
  'PR_WATCH_MS',
  'REGISTRY_POLL_MS',
  'TASK_GRACE_MS',
  'TASK_MAX_MS',
  'TICKET_TTL_MS',
  'UPDATE_EVERY_MS',
  'UPDATE_QUIET_MS',
  'APP_LOOK_MS',
  'VSWEB_FRESH_MS',
  'WT_SWEEP_MS',
  'UPDATE_RESTART_BIN',
  'UPDATE_BUILD_BIN',
  'PEIX_TEST_PARENT',
  'GITHUB_API',
  'CHAT_FAST_MS',
  'CHAT_SLOW_MS',
  'CHAT_GAP_MS',
  'CHAT_INVITES_MS',
  'LUNCH_TICK_MS',
  'INSTAGRAM_BIN',
  'READER_BIN',
  'VIM_BIN',
  'DISCLAIM',
  ...[
    'claude',
    'gh',
    'git',
    'task',
    'code',
    'npm',
    'brew',
    'caffeinate',
    'pmset',
    'lsregister',
    'lsof',
    'ps',
    'osascript',
    'cc',
  ].map(n => `${n.toUpperCase()}_BIN`),
]); // findBin's
export const drawerEnv = () => Object.fromEntries(Object.entries(termEnv()).filter(([k]) => !BOARD_ENV.has(k)));

// Take a chat over from wherever it runs — iTerm, VS Code: end that claude, then resume the chat here.
// Nothing respawns a CLI process, and VS Code's extension does not respawn its own either (see inVsCode),
// so the transcript has one writer again the moment it is gone. SIGTERM first, which is what closing the
// terminal amounts to (claude exits and drops its registry entry); SIGKILL if it is still there after
// 5 s. Whatever Claude was mid-way through is lost, and the page says so before the click. The caller
// re-reads the registry afterwards; this only ends the process.
const TAKEOVER_WAIT_MS = 10_000;
/** Whether `pid` is still the process the registry entry was written by: the entry's procStart is the process's start
 *  as `ps` gives it in UTC and the C locale (procStarts). A dead claude's file lingers until claude's housekeeping, and
 *  its pid can be handed to any other process of yours meanwhile — Done and Take over signalled it, an editor say
 *  (2026-10-03). Asked afresh, never the liveness's kept verdict: a signal follows. An entry without a procStart (an
 *  older claude) is taken at its word. */
function sameProcess({ pid, procStart }) {
  if (!procStart) return true;
  return procStarts([pid]).get(Number(pid)) === squash(procStart);
}
/** A background session's job (2026-11-04): what `claude attach` and `claude stop` take, as the registry names it. */
export const jobOf = l => (l?.kind === 'bg' && /^[0-9a-f]{8}$/.test(l.jobId || '') ? l.jobId : null);
export function endClaude(entry) {
  const { pid } = entry;
  return new Promise(resolve => {
    // a pid as a registry file could hold it (2026-11-27, an outside audit's note): -1 signals every process of yours, 0
    // this server's group — never one that is not a process's own
    if (!Number.isInteger(pid) || pid <= 1) return resolve({ code: 400, error: `${pid} is no process's id` });
    if (!sameProcess(entry))
      return resolve({ code: 409, error: `pid ${pid} is no longer that claude — its registry file outlived it` });
    // A background session is the daemon's (2026-11-04): one SIGTERMed reads *crashed*, and the daemon may start it again
    // (measured: 11 s later, one run in two). Its own stop keeps the conversation, and the wait below still holds.
    const job = jobOf(entry),
      bin = job && claudeBin();
    if (bin)
      execFile(bin, ['stop', job], { env: drawerEnv(), timeout: 15_000 }, err => {
        if (err) console.error(`[peixairada] claude stop ${job}: ${err.message}`);
      });
    // gone between the look and the signal (2026-11-06) — a drawer's claude ends with its holder, which the delete ends
    // first — is ended: what was asked
    else
      try {
        process.kill(pid, 'SIGTERM');
      } catch (e) {
        return resolve(
          e.code === 'ESRCH' ? { ok: true } : { code: 500, error: `could not signal pid ${pid}: ${e.message}` },
        );
      }
    const t0 = Date.now();
    let hard = false;
    const tick = () => {
      if (!pidAlive(pid)) return resolve({ ok: true });
      if (Date.now() - t0 > TAKEOVER_WAIT_MS) return resolve({ code: 504, error: `pid ${pid} is still running` });
      if (!hard && Date.now() - t0 > 5000) {
        hard = true;
        if (!sameProcess(entry)) return resolve({ ok: true }); // it ended, and the pid is another's now: not that one
        try {
          process.kill(pid, 'SIGKILL');
        } catch {}
      }
      setTimeout(tick, 200);
    };
    setTimeout(tick, 200);
  });
}
