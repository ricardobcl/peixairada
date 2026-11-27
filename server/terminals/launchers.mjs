// Launchers: a folder's own way to start claude (its Taskfile's tasks), where Claude Code trusts
// the folder.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { CLAUDE_DIR, execFileP } from '../env.mjs';
import { findBin } from '../bins.mjs';
import { termEnv } from './terms.mjs';

// ---- launchers: a folder's own way to start claude ---------------------------------------------------------------
// Some folders do not start claude bare: oracle's Taskfile has `task production-workload`, `task sandbox-workload`,
// `task development-<cluster>`… — each sets a cluster's environment (its credentials and dashboards) and then runs
// claude. A new chat there has to go through one of them, and which is a choice (2026-09-20).
// Nothing is named here: a folder with a Taskfile whose tasks mention Claude in their description has launchers, and
// the page asks (`GET /api/launchers?cwd=`) before starting a chat. `task --list --json` lists them; cached by the
// Taskfile's mtime, so it runs once per edit. A resume (`claude --resume`) never goes through task: its command line is
// the Taskfile's.
// …and only where Claude Code trusts the folder (2026-10-16): `task --list` runs the Taskfile's code — Task resolves a
// dotenv path templated on an `sh:` variable before it lists anything, and a repo can pin its own task for mise's shim
// in a `.tool-versions` — so a cloned repo's or a PR's commands ran the moment its folder was picked for a new chat,
// before Claude Code would have asked whether to trust it. Now task is asked only where Claude Code has the folder, or
// one above it, trusted (`projects[<dir>].hasTrustDialogAccepted` in its config, as Claude Code reads it): the bar at
// which claude itself runs the folder's hooks. Not trusted, a folder has no launchers — a new chat there is a bare
// claude, which asks — and once trusted it has them. The config is `~/.claude.json` (`<CLAUDE_DIR>/.claude.json` for
// another CLAUDE_DIR, as Claude Code places it for its CLAUDE_CONFIG_DIR), read again when it changes; never written.
const CLAUDE_JSON =
  process.env.CLAUDE_JSON ||
  (resolve(CLAUDE_DIR) === join(homedir(), '.claude')
    ? join(homedir(), '.claude.json')
    : join(CLAUDE_DIR, '.claude.json'));
let trustRead = { mtime: null, dirs: new Set() };
export function claudeTrusts(cwd) {
  let mtime;
  try {
    mtime = statSync(CLAUDE_JSON).mtimeMs;
  } catch {
    return false;
  }
  if (trustRead.mtime !== mtime) {
    let projects;
    try {
      projects = JSON.parse(readFileSync(CLAUDE_JSON, 'utf8')).projects || {};
    } catch {
      return false;
    } // caught mid-write: asked again next time
    trustRead = {
      mtime,
      dirs: new Set(
        Object.entries(projects)
          .filter(([, p]) => p?.hasTrustDialogAccepted === true)
          .map(([d]) => d),
      ),
    };
  }
  let real = cwd;
  try {
    real = realpathSync(cwd);
  } catch {}
  // up to the repository's own folder and no further (2026-11-06), as Claude Code walks it: a trusted folder of repos (an
  // org's root) trusts none of them, nor a fresh clone in it whose Taskfile would run before claude ever asked
  for (let d of new Set([resolve(cwd), real]))
    for (;;) {
      if (trustRead.dirs.has(d)) return true;
      if (existsSync(join(d, '.git'))) break;
      const up = dirname(d);
      if (up === d) break;
      d = up;
    }
  return false;
}
const TASKFILES = [
  'Taskfile.yml',
  'Taskfile.yaml',
  'taskfile.yml',
  'taskfile.yaml',
  'Taskfile.dist.yml',
  'Taskfile.dist.yaml',
];
const launcherCache = new Map(); // cwd → { mtime, launchers } — or { mtime, asking }, the run under way
const untrustedSaid = new Set(); // the folders whose Taskfile was left unasked, logged once each
export const TASK_NAME = /^\w[\w:.-]*$/; // a word's character first (2026-11-27): `task -x` is an option
export function taskfileOf(cwd) {
  for (const f of TASKFILES) {
    const p = join(cwd, f);
    if (existsSync(p)) return p;
  }
  return null;
}
/** Only an answer is kept (2026-10-03): a `task` that failed — a timeout, a broken include, a shim's hiccup — was
 *  cached as "no launchers" until the Taskfile itself changed, and a new chat there quietly started a bare claude.
 *  Asks at the same time share one run. */
export function launchersFor(cwd) {
  const file = cwd && taskfileOf(cwd);
  if (!file) return Promise.resolve([]);
  if (!claudeTrusts(cwd)) {
    if (!untrustedSaid.has(cwd)) {
      untrustedSaid.add(cwd);
      console.log(
        `[peixairada] ${cwd}: its Taskfile is not asked for launchers — Claude Code has not trusted the folder`,
      );
    }
    return Promise.resolve([]);
  }
  let mtime;
  try {
    mtime = statSync(file).mtimeMs;
  } catch {
    return Promise.resolve([]);
  }
  const hit = launcherCache.get(cwd);
  if (hit?.mtime === mtime) return hit.asking || Promise.resolve(hit.launchers);
  const bin = findBin('task', 'Taskfile launchers are disabled');
  if (!bin) return Promise.resolve([]);
  const asking = execFileP(bin, ['--list', '--json'], { cwd, env: termEnv(), timeout: 15_000, maxBuffer: 4e6 }).then(
    ({ stdout }) => {
      const launchers = (JSON.parse(stdout).tasks || [])
        .filter(t => /\bclaude\b/i.test(t.desc || ''))
        .map(t => ({ name: t.name, desc: t.desc || '' }));
      launcherCache.set(cwd, { mtime, launchers });
      return launchers;
    },
    e => {
      console.error(`[peixairada] task --list in ${cwd}: ${String(e.message).split('\n')[0]}`);
      if (launcherCache.get(cwd)?.asking === asking) launcherCache.delete(cwd);
      return [];
    },
  );
  launcherCache.set(cwd, { mtime, asking });
  return asking;
}
