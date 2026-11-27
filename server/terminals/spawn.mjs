// A drawer started: claude, a zsh or vim, each in a holder — adopted again at boot, tied to its chat
// by pid.
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { userInfo } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { execFileP, ROOT, SCRATCH_DIR, STATE_FILE } from '../env.mjs';
import { canRun, claudeBin, findBin } from '../bins.mjs';
import { cloneFor, cloneUnder, putBack } from '../folders.mjs';
import { privateDir } from '../key.mjs';
import { pidAlive } from '../registry.mjs';
import { boardConfig, tildePath } from '../setup.mjs';
import { broadcast, schedulePush } from '../sse.mjs';
import { envs, indexing, saveState, sessions } from '../state.mjs';
import { connectHolder, holderSend } from './holder.mjs';
import {
  drawerEnv,
  HOLDER,
  HOLDER_START_MS,
  SOCK_MAX,
  TERM_LINGER_MS,
  terms,
  TERMS_DIR,
  termsAvailable,
  termSummary,
} from './terms.mjs';
import { errText } from '../update.mjs';

let termSeq = 0;

// The shell a drawer runs claude through, and the one a shell tab (⌥⌘T) is (2026-09-28; /bin/zsh for both before): the
// login shell, which is where the PATH the tools want gets built (.zshrc, .bash_profile — mise activates there).
// claude goes through `-l -i -c 'exec "$0" "$@"'`, which zsh and bash read alike; with any other login shell (fish) the
// tab is still that shell and claude goes through zsh, as it always did.
export const LOGIN_SHELL = (() => {
  try {
    const sh = userInfo().shell;

    return sh && existsSync(sh) ? sh : '/bin/zsh';
  } catch {
    return '/bin/zsh';
  }
})();
const RUN_SHELL = /\/(zsh|bash)$/.test(LOGIN_SHELL) ? LOGIN_SHELL : '/bin/zsh';
// The in-app editor's other pick (2026-10-21): vim in the chat's folder, on a tab as a zsh is — run as claude is, through
// the login shell, so the vim its PATH finds. VIM_BIN for another one, or the tests' stand-in.
const VIM_BIN = process.env.VIM_BIN || 'vim';
// A drawer's claude answers to macOS for itself (2026-11-23): the microphone, the camera and Automation are asked of the
// *responsible* process, and a drawer's was this server's node — launchd's, a hardened binary with no audio-input
// entitlement —, so tccd refused /voice without asking anyone. Claude Code carries the entitlement and the usage string:
// through lib/disclaim.c (an exec, the same pid) it is its own, and macOS asks for "claude". Built with cc into the state
// folder, once per source; no developer tools, none — a drawer starts as before. DISCLAIM=off for none.
const DISCLAIM_SRC = join(ROOT, 'lib', 'disclaim.c');
let disclaimAt = null;

function disclaimBin() {
  if (process.platform !== 'darwin' || process.env.DISCLAIM === 'off') return Promise.resolve(null);
  return (disclaimAt ??= buildDisclaim().catch(e => {
    console.error(`[peixairada] a drawer's claude cannot ask macOS for the microphone: ${errText(e)}`);
    return null;
  }));
}

async function buildDisclaim() {
  const src = readFileSync(DISCLAIM_SRC);
  const dir = privateDir(join(dirname(STATE_FILE), 'bin'));
  const out = join(dir, `disclaim-${createHash('sha256').update(src).digest('hex').slice(0, 12)}`);

  if (!canRun(out)) {
    const cc = findBin('cc', "a drawer's claude cannot ask macOS for the microphone");

    if (!cc) return null;

    // /usr/bin/cc with no developer tools asks to install them, in a dialog: not a server's to raise, unasked
    if (cc === '/usr/bin/cc') {
      const dev = await execFileP('/usr/bin/xcode-select', ['-p'], { timeout: 10_000 }).then(
        r => r.stdout.trim(),
        () => '',
      );

      if (!dev || !existsSync(dev)) {
        throw new Error('no developer tools to build lib/disclaim.c (xcode-select --install)');
      }
    }

    const tmp = `${out}.${process.pid}`;

    await execFileP(cc, ['-O2', '-o', tmp, DISCLAIM_SRC], { timeout: 120_000 });
    renameSync(tmp, out);
  }

  // the build an older source made: a claude it started has exec'd past it
  for (const f of readdirSync(dir)) {
    if (/^disclaim-[0-9a-f]{12}$/.test(f) && join(dir, f) !== out) {
      try {
        unlinkSync(join(dir, f));
      } catch {}
    }
  }

  return out;
}

/**
 * Start `claude` (or `claude --resume <id>`, or `task <name>` — a launcher, see above) in `cwd`: write the spec, spawn
 * the holder detached (its own session, so a signal to this server never reaches it), wait for its socket. The holder
 * runs the CLI through an interactive login zsh, because the app's server has a bare PATH and the tools Claude will
 * call — git, gh, node — are on the PATH that .zshrc builds (mise activates there); `exec` makes claude take over the
 * shell's pid, which is the pid the registry will report — with a launcher, task takes the pid and claude is a
 * descendant, which linkTermToRegistry knows.
 * `prompt` (2026-10-31): the chat's first prompt, given as claude's own argument after `--` — Claude Code sends it once it
 * is up, past a folder's trust question, where keys typed into a claude still starting are lost or answer that question.
 * Only the words you wrote in the board's Send box; never logged.
 */
const PROMPT_MAX = 100_000;

export async function spawnTerm({
  cwd,
  sessionId = null,
  cols = 120,
  rows = 30,
  shell = false,
  editor = null,
  task = null,
  prompt = null,
  newId = null,
  fork = null,
  attach = null,
  claudePid = null,
  agent = null,
}) {
  if (!termsAvailable()) {
    return { code: 501, error: 'node-pty is not available — run npm install and restart the server' };
  }

  const bin = editor
    ? VIM_BIN
    : shell
      ? LOGIN_SHELL
      : task
        ? findBin('task', 'Taskfile launchers are disabled')
        : claudeBin(); // a shell holder runs the shell itself (see termhold.mjs); the chat's is claude, or its launcher

  if (!bin) {
    return {
      code: 503,
      error: task
        ? 'task binary not found — set TASK_BIN to its path'
        : 'claude binary not found — set CLAUDE_BIN to its path',
    };
  }

  if (!cwd) return { code: 400, error: 'no cwd known for this chat' };

  if (cwd === SCRATCH_DIR) {
    try {
      mkdirSync(SCRATCH_DIR, { recursive: true });
    } catch {}
  } // the no-folder chats' own: made on the first, and again after it was deleted

  // not there — or being cloned: the page clones it (`clone`, the repo it was a checkout of) and asks again (2026-10-09);
  // a chat's own folder gone from a repo that is there is put back, or the chat starts in what is left of it (2026-10-19)
  let back = null;

  if (sessionId && !existsSync(cwd) && !cloneUnder(cwd) && !cloneFor(cwd)) {
    back = await putBack(cwd, sessions.get(sessionId));

    if (back) {
      console.log(
        `[peixairada] ${tildePath(cwd)} is gone — ${back.made ? `its worktree made again, ${back.branch ? `on ${back.branch}` : 'detached'}` : back.tree ? `${back.branch} is out in ${tildePath(back.tree)}` : `started in ${tildePath(back.cwd)}${back.why ? `: ${back.why}` : ''}`}`,
      );

      back = { from: cwd, ...back };
      cwd = back.cwd;
    }
  }

  if (!existsSync(cwd) || cloneUnder(cwd)) {
    const clone = cloneFor(cwd);

    return {
      code: 409,
      missing: cwd,
      clone,
      error: clone
        ? `${tildePath(cwd)} is not checked out — ${clone.ref} clones it`
        : boardConfig().roots.some(r => r.org && (cwd + sep).startsWith(r.dir + sep))
          ? `${tildePath(cwd)} is not there — its repo is checked out, but not this folder in it (a worktree since removed?)`
          : `${tildePath(cwd)} is not there, and no folder of repos with an org holds it to clone it from (Settings › Projects)`,
    };
  }

  // `newId` (2026-10-31): a new chat under an id the board picked — `--session-id` — so it is known before claude registers;
  // with `fork`, a copy of that chat under it (Claude Code's --fork-session: the chat itself is not written to)
  // `attach` (2026-11-04): a background session in this drawer, its worker's pid `claudePid`: the client registers nothing, and ending it leaves the session running
  // a chat's id is a file's name, and one that began with - would be read as an option of claude's (2026-11-06)
  if ([sessionId, fork, newId].some(id => id != null && !/^[\w][\w-]{0,127}$/.test(String(id)))) {
    return { code: 400, error: 'not a chat id' };
  }

  const args = editor
    ? ['.']
    : task
      ? [task]
      : shell
        ? []
        : attach
          ? ['attach', attach]
          : sessionId
            ? ['--resume', sessionId]
            : fork && newId
              ? ['--resume', fork, '--fork-session', '--session-id', newId]
              : newId
                ? ['--session-id', newId]
                : [];

  // `agent` (2026-11-06): a new chat as that agent, '' as no agent over a folder's own; a resume never — Claude Code puts the
  // transcript's back itself, and a flag beside --resume would override it
  if (typeof agent === 'string' && !editor && !task && !shell && !attach && !sessionId && !fork) {
    args.push('--agent', agent);
  }

  const said = args.map(a => (a === '' ? "''" : a)).join(' '); // the log's: the prompt is yours, and not the log's to keep

  // the words alone (2026-11-06): a handoff quotes Claude's replies and PR titles, and a control character in them is
  // nobody's to send — a carriage return, an escape — so only tabs and newlines stay
  if (prompt && !editor && !task && !shell) {
    args.push(
      '--',
      String(prompt)
        .replace(/\r\n?/g, '\n')
        .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
        .slice(0, PROMPT_MAX),
    );
  }

  const id = `t${++termSeq}-${Date.now().toString(36)}`;
  // past it the holder could not listen, and said only that it exited (2026-10-14) — said here, before anything is spawned
  const sock = join(TERMS_DIR, `${id}.sock`);

  if (Buffer.byteLength(sock) > SOCK_MAX) {
    return {
      code: 500,
      error: `the drawers' folder is too deep for a socket: ${sock} is ${Buffer.byteLength(sock)} bytes, macOS takes ${SOCK_MAX} — set TERMS_DIR to a shorter folder`,
    };
  }

  try {
    privateDir(TERMS_DIR);
  } catch (e) {
    return { code: 500, error: e.message };
  }

  // claude itself, never a zsh, vim or a launcher: what they run answers to this server as before (see disclaimBin)
  const disclaim = !shell && !editor && !task ? await disclaimBin() : null;

  const spec = {
    id,
    sessionId: sessionId || (!shell && !editor && !task && newId) || null,
    cwd,
    bin,
    args,
    shell,
    editor,
    sh: shell && !editor ? LOGIN_SHELL : RUN_SHELL,
    task,
    cols: Math.min(500, Math.max(20, cols | 0)),
    rows: Math.min(200, Math.max(5, rows | 0)),
    resume: !shell && !!(sessionId || fork),
    ...(fork && { fork }),
    ...(attach && { attach, claudePid }),
    ...(disclaim && { disclaim }),
    startedAt: new Date().toISOString(),
  };

  const logFile = join(TERMS_DIR, `${id}.log`);
  let child;

  try {
    writeFileSync(join(TERMS_DIR, `${id}.json`), JSON.stringify(spec));
    const log = openSync(logFile, 'a');

    child = spawn(process.execPath, [HOLDER, TERMS_DIR, id], {
      cwd,
      env: drawerEnv(),
      detached: true,
      stdio: ['ignore', log, log],
    });

    child.unref();
    closeSync(log);
  } catch (e) {
    return { code: 500, error: `could not start a terminal holder: ${e.message}` };
  }

  const t = {
    ...spec,
    pid: null,
    holderPid: child.pid,
    exited: null,
    sock: null,
    clients: new Set(),
    snapQ: [],
    lastSnap: null,
  };

  const t0 = Date.now();

  for (;;) {
    try {
      await connectHolder(t);
      break;
    } catch (e) {
      if (child.exitCode !== null) {
        let why = '';

        try {
          why = JSON.parse(readFileSync(join(TERMS_DIR, `${id}.json`), 'utf8')).error || '';
        } catch {}

        return { code: 500, error: why || `the terminal holder exited (${child.exitCode}) — see ${logFile}` };
      }

      if (Date.now() - t0 > HOLDER_START_MS) {
        // given up on, it is ended — or it comes up late with a claude in it that nothing tracks until the next boot
        try {
          process.kill(child.pid, 'SIGTERM');
        } catch {}

        return {
          code: 500,
          error: `the terminal holder did not answer in ${HOLDER_START_MS / 1000} s (${e.message}) — see ${logFile}`,
        };
      }

      await new Promise(r => setTimeout(r, 100));
    }
  }

  terms.set(id, t);

  console.log(
    `[peixairada] terminal ${id}: ${editor || (shell ? basename(LOGIN_SHELL) : task ? `task ${task}` : `claude${said ? ` ${said}` : ''}${args.includes('--') ? ' -- <a prompt of yours>' : ''}`)} in ${cwd} (pid ${t.pid}, holder ${t.holderPid})`,
  );

  broadcast('terminal', termSummary(t));
  const s = spec.sessionId && sessions.get(spec.sessionId);

  if (s) schedulePush(s);
  return { code: 201, terminal: termSummary(t), ...(back && { back }) };
}

/** On boot: the holders from before this server — adopt the ones that answer, clean up after the dead. All at once:
 *  one after another, every holder that does not answer cost its whole wait before the board could start. */
export async function adoptHolders() {
  if (!existsSync(TERMS_DIR)) return;

  // a folder not this user's alone is nobody's drawers to adopt (2026-11-06): its specs would name sockets of anyone's
  try {
    privateDir(TERMS_DIR);
  } catch (e) {
    console.error(`[peixairada] no drawers adopted: ${e.message}`);
    return;
  }

  await Promise.allSettled(
    readdirSync(TERMS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(adoptHolder),
  );
}

async function adoptHolder(f) {
  let meta;

  try {
    meta = JSON.parse(readFileSync(join(TERMS_DIR, f), 'utf8'));
  } catch {
    return;
  }

  const id = meta.id || f.slice(0, -5);
  const n = Number((id.match(/^t(\d+)-/) || [])[1]);

  if (n > termSeq) termSeq = n;

  const t = {
    id,
    sessionId: meta.sessionId ?? null,
    cwd: meta.cwd,
    bin: meta.bin,
    args: meta.args,
    shell: !!meta.shell,
    editor: meta.editor ?? null,
    task: meta.task ?? null,
    fork: meta.fork ?? null,
    attach: meta.attach ?? null,
    claudePid: meta.claudePid ?? null,
    cols: meta.cols,
    rows: meta.rows,
    resume: !!meta.resume,
    startedAt: meta.startedAt,
    pid: meta.pid,
    holderPid: meta.holderPid,
    exited: meta.exited ?? null,
    sock: null,
    clients: new Set(),
    snapQ: [],
    lastSnap: null,
  };

  try {
    await connectHolder(t);
    terms.set(id, t);
    noteEnv(t.sessionId, t.task); // a launcher's drawer from before the record existed, or from before a restart

    if (t.exited !== null) {
      setTimeout(() => {
        if (terms.get(id) === t) terms.delete(id);
      }, TERM_LINGER_MS).unref();
    }

    console.log(
      `[peixairada] terminal ${id}: adopted — pid ${t.pid}, holder ${t.holderPid}${t.exited !== null ? `, exited ${t.exited}` : ''}${t.sessionId ? `, chat ${t.sessionId}` : ''}`,
    );
  } catch (e) {
    if (meta.holderPid && pidAlive(meta.holderPid)) {
      console.log(
        `[peixairada] terminal ${id}: holder ${meta.holderPid} is alive but not answering (${e.message}) — left alone`,
      );

      return;
    }

    for (const ext of ['.json', '.sock', '.log']) {
      try {
        unlinkSync(join(TERMS_DIR, id + ext));
      } catch {}
    }

    console.log(`[peixairada] terminal ${id}: its holder is gone — cleaned up`);
  }
}

/** pid → parent pid for every process, from one `ps`. Asked for only while a launcher's drawer has no session yet —
 *  and only when a process in the registry is not in the last table (2026-10-03: a `ps` blocked the server ~20 ms on
 *  every registry write by any claude, for as long as a launcher sat at an SSO prompt). Parents do not change. */
let ppidTable = null;

export function parentPids(need = []) {
  if (ppidTable && need.every(p => ppidTable.has(p))) return ppidTable;
  const m = new Map();

  try {
    for (const l of execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).split('\n')) {
      const [p, pp] = l.trim().split(/\s+/).map(Number);

      if (p) m.set(p, pp);
    }
  } catch (e) {
    console.error(`[peixairada] ps: ${e.message}`);
  }

  return (ppidTable = m);
}

/** A drawer whose claude is not known yet: its PTY's process is in no registry file, and it has none tied. Behind a launcher, or
 *  a `claude` that does not exec (2026-11-04: a wrapper script's drawer stayed on the chat it began when /clear moved its claude on,
 *  showing the new chat under the old card, the new card with no drawer). An attach's is the worker it was given. */
export const untied = (t, regPids) => !t.shell && t.exited === null && !t.claudePid && !regPids.has(t.pid);

const descends = (pid, from, ppids) => {
  if (!ppids) return false;
  for (let p = ppids.get(pid), i = 0; p > 1 && i < 64; p = ppids.get(p), i++) if (p === from) return true;
  return false;
};

/**
 * A new chat has no session id until claude registers; the pid ties the two together, and the holder is told. The PTY's
 * process *is* claude (`exec`) — except behind a launcher, where it is `task` and claude a descendant (task → sh →
 * mise → claude), found through `ps`: `ppids` when such a drawer is waiting. The registry pid is kept as claudePid, so
 * the drawer's own process is known when the chat gets a rival.
 */
/**
 * Remember which environment a chat was started in (`task production-workload`…), so ⌥⌘O can list oracle's open
 * chats under it long after the drawer has gone. Forgotten sessions are pruned on the way, but never while the
 * initial scan is still running — an adopted holder records its env before the registry is read, and `sessions`
 * is not yet the whole truth then.
 */
function noteEnv(sessionId, task) {
  if (!sessionId || !task || envs[sessionId] === task) return;
  envs[sessionId] = task;
  if (!indexing) for (const id of Object.keys(envs)) if (!sessions.has(id)) delete envs[id];
  saveState();
}

export function linkTermToRegistry(pid, s, ppids = null, regPids = new Set()) {
  for (const t of terms.values()) {
    if (t.shell) continue;
    const below = untied(t, regPids) && descends(pid, t.pid, ppids);

    if (below && t.sessionId === s.id) {
      t.claudePid = pid;
      holderSend(t, { t: 'meta', sessionId: s.id, claudePid: pid });
    } // a resume's, on the chat it was started for: known now, for its /clear

    // a branch's drawer is not the chat it copied while it starts (2026-10-31); once on its own id, a /resume of that chat
    // is a move as any other (2026-11-04: the drawer stayed on the branch and its claude showed on the chat, with no way to it)
    if (t.fork && t.sessionId === s.id && (t.pid === pid || t.claudePid === pid)) {
      t.fork = null;
      holderSend(t, { t: 'meta', sessionId: s.id, fork: null });
    }

    if (t.sessionId === s.id || t.fork === s.id) continue;
    // the PTY's own process; the claude it was tied to (behind a launcher that is not the PTY's — /clear there gives
    // that claude a new id, and the drawer has to follow it as it does any other, 2026-10-03); or, not yet tied, a
    // claude below it
    if (t.pid !== pid && !(t.exited === null && t.claudePid === pid) && !below) continue;
    const was = sessions.get(t.sessionId); // the chat it is leaving — /clear gave this pid a new id

    t.sessionId = s.id;
    t.claudePid = pid;
    holderSend(t, { t: 'meta', sessionId: s.id, claudePid: pid });
    noteEnv(s.id, t.task);
    broadcast('terminal', termSummary(t));
    schedulePush(s);
    // The chat it left has to be told too, or its card keeps a drawer that is somewhere else now and only
    // something unrelated happening to it ever clears that (2026-09-22, found through drawer-clear's flake).
    if (!was || was === s) continue;

    // Its zsh tabs go with the drawer (2026-10-14): left on a chat /clear ticks done, they were out of reach of the
    // chat the drawer runs, and nothing ends a zsh — each ⌥⌘T after a /clear made another. Not while the chat left
    // still has a claude drawer of its own.
    if (![...terms.values()].some(o => o.sessionId === was.id && !o.shell && o.exited === null)) {
      for (const z of terms.values()) {
        if (z.shell && z.sessionId === was.id && z.exited === null) {
          z.sessionId = s.id;
          holderSend(z, { t: 'meta', sessionId: s.id });
          broadcast('terminal', termSummary(z));
        }
      }
    }

    schedulePush(was);
  }
}

/** One spawn per chat and kind at a time: a drawer is in `terms` only once its holder has answered, a few hundred ms
 *  in, and a second ⌥⌘C meanwhile started a second `claude --resume` on the same transcript (2026-10-03). The second
 *  ask gets the first one's answer. */
const spawning = new Map(); // `<chat>:claude` | `<chat>:shell` -> the spawn under way

export const spawnOnce = (key, run) => {
  let p = spawning.get(key);

  if (!p) spawning.set(key, (p = run().finally(() => spawning.delete(key))));
  return p;
};

/** End the process in a drawer; an exited one is let go at once instead of lingering. Vim is asked to quit, as you would
 *  (2026-10-21): with nothing unsaved it does, and its tab goes; with something, it stays and says so — never killed
 *  over your edits. */
export function killTerm(t) {
  if (t.exited === null && t.editor === 'vim') holderSend(t, { t: 'in', d: '\x1b\x1b:qa\r' });
  else if (t.exited === null) holderSend(t, { t: 'kill' });
  else {
    holderSend(t, { t: 'quit' });
    terms.delete(t.id);
  }
}
