// Where the board reads and writes, and the knobs the environment turns: paths, the port, the poll's pace — read as
// the server is imported. The one module every other needs, so it imports none of theirs; run as the program, it puts the
// time on every log line first.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { format, promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // the checkout (or the app's Resources): server/ is one in
export const isMain =
  !!process.argv[1] && new URL('../server.mjs', import.meta.url).href === pathToFileURL(process.argv[1]).href;

// Every line the server logs says when (2026-10-21): the agent's log is appended to for weeks, and a line without its
// time could not be placed — UTC, as the app's log writes it, to the millisecond. Run as the program only: a test that
// imports the module keeps its own console.
if (isMain) {
  for (const method of ['log', 'info', 'warn', 'error']) {
    const say = console[method].bind(console);

    console[method] = (...args) => say(`${new Date().toISOString()} ${format(...args)}`);
  }
}

export const execFileP = promisify(execFile);
export const CLAUDE_DIR = process.env.CLAUDE_DIR || join(homedir(), '.claude');
export const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');
export const SESSIONS_DIR = join(CLAUDE_DIR, 'sessions');
export const PORT = Number(process.env.PORT || 7331);
// The About box's facts (2026-09-27): the board's version — the checkout's, counted from its history (2026-10-21,
// readCheckout), else package.json's —, this process, and where the board reads and writes.
export const PKG = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  } catch {
    return {};
  }
})();
export const SINCE = Date.now();
export const HOST = process.env.HOST || '127.0.0.1';
export const NOTIFY = process.env.NOTIFY || 'native'; // native | off
export const TAIL_BYTES = Number(process.env.TAIL_BYTES || 512 * 1024);
export const HEAD_BYTES = Number(process.env.HEAD_BYTES || 64 * 1024); // where a chat tailed at boot is read for its PRs too (headPrs)
export const MAX_ENTRIES = Number(process.env.MAX_ENTRIES || 800);
export const REGISTRY_POLL_MS = Number(process.env.REGISTRY_POLL_MS || 10_000); // pids die silently; so do background commands (sweepTasks)

// Where the done ticks live. macOS keeps app data in Application Support (same place the
// logs already go); elsewhere follow the XDG state dir. STATE_FILE overrides both — tests use it.
function defaultStateFile() {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'peixAIrada', 'state.json');
  }

  return join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'peixairada', 'state.json');
}

export const STATE_FILE = process.env.STATE_FILE || defaultStateFile();
export const LEGACY_STATE_FILE = join(homedir(), '.peixairada', 'state.json');
// A chat with no folder (2026-10-14, ⌥⌘N's first row) runs in one of the board's own, beside the state file: Claude Code
// needs a working directory, and the home one's trust is for a session only — every chat there would ask again. Named so
// that what reads a project's name off its folder (the card, the header, the pickers) says what it is. Made when a chat
// is started or resumed there (spawnTerm). The state folder's real path, since that is the one claude registers.
export const SCRATCH_DIR =
  process.env.SCRATCH_DIR ||
  join(
    (dir => {
      try {
        return realpathSync(dir);
      } catch {
        return dir;
      }
    })(dirname(STATE_FILE)),
    'no folder',
  );
// The setup — where the repos live, ⌥⌘O's project, the projects' short names and colours — is the user's, in a file of
// its own under ~/.config (2026-10-01): what someone sets once and may keep with their dotfiles, while the state file
// churns with every tick. $XDG_CONFIG_HOME moves it, CONFIG_FILE names it; a STATE_FILE of its own (every test server)
// takes it along beside it, so a server run on the side never reads or writes the real one.
export const CONFIG_FILE =
  process.env.CONFIG_FILE ||
  (process.env.STATE_FILE
    ? join(dirname(STATE_FILE), 'config.json')
    : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'peixairada', 'config.json'));

// ---- nothing under CLAUDE_DIR: Claude Code's, never the board's to write in --------------------------------------
// …and some of it never the board's to read (2026-10-31): beside each `sessions/<pid>.json` lies a 0600
// `<pid>.<hash>.key` with that chat's peer token — whoever holds it can pass for the chat to every other one —, and
// `shell-snapshots/` and `history.jsonl` are your shell's environment and every prompt you typed, anywhere. None is
// opened: the registry is read by name (`.json`), a team by its config's path. Nor does the board post to a chat's socket
// (/tmp/cc-socks): it reaches a chat only through a claude it runs. test/peer-keys.test.mjs holds it.
/** Whether a path is CLAUDE_DIR or in it, as the disk has it (2026-10-14): the board writes nothing there, and a chat
 *  run in ~/.claude, a folder linked into it or another spelling of it (the disk ignores case) is no way round that.
 *  Judged by the nearest folder of it there is, real, against CLAUDE_DIR's device and inode. */
export function inClaudeDir(path) {
  let top;

  try {
    top = statSync(CLAUDE_DIR);
  } catch {
    return false;
  }

  let dir = resolve(path);

  for (;;) {
    try {
      dir = realpathSync(dir);
      break;
    } catch {
      if (dirname(dir) === dir) break;
      dir = dirname(dir);
    }
  }

  for (; ; dir = dirname(dir)) {
    try {
      const st = statSync(dir);

      if (st.dev === top.dev && st.ino === top.ino) return true;
    } catch {}

    if (dirname(dir) === dir) return false;
  }
}
