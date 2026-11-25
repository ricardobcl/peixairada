// The roots' folders: where the repos live, the first run's guess at them, and cloning one that is not there
// yet.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { findBin } from './bins.mjs';
import { gitTopOf } from './drift.mjs';
import { WT_IN } from './sessions.mjs';
import { boardConfig } from './setup.mjs';
import { broadcast } from './sse.mjs';
import { sessions } from './state.mjs';
import { termEnv } from './terminals/terms.mjs';
import { restoreTree } from './worktrees.mjs';

// ---- the roots' folders: where the repos live, and cloning one that is not there yet --------------------------------
// A project on the board is a folder some chat ran in, so a repo you have not opened a chat in is nowhere to be seen,
// and one you have not cloned is nowhere at all — which made starting work on a repo the longest thing the board
// asked of you (2026-09-21). A root is a directory the repos live
// in and the GitHub org they come from (boardConfig — one of each, from the environment, until 2026-09-28, when the
// settings took them over); nothing under one is written to except by the one clone below.
const REPO_NAME = /^[A-Za-z0-9][\w.-]*$/; // a name for a folder and a repo, and nothing that walks out of its root
const CLONE_MS = Number(process.env.CLONE_MS || 10 * 60_000); // a big repo over a slow line; the page waits on it
export const isDir = p => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
export const folderCache = new Map(); // root dir -> { mtime, folders }

/** A worktree of a repo checked out beside it (2026-10-09): its .git is a file naming `<repo>/.git/worktrees/<name>`.
 *  A root of `git worktree add ../<repo>-<branch>` holds more of them than repos, and none is a project to start in. */
function isWorktree(cwd) {
  try {
    return /^gitdir:.*[/\\]worktrees[/\\]/m.test(readFileSync(join(cwd, '.git'), 'utf8'));
  } catch {
    return false;
  } // a directory: EISDIR
}
/** Every folder directly under a root, by name, `worktree` on one that is. Cached by the directory's own mtime — a
 *  clone or a `git clone` by hand moves it, and the picker asks on every opening. */
export function foldersIn(root) {
  let mtime;
  try {
    mtime = statSync(root).mtimeMs;
  } catch {
    return [];
  }
  const hit = folderCache.get(root);
  if (hit?.mtime === mtime) return hit.folders;
  let folders = [];
  try {
    folders = readdirSync(root, { withFileTypes: true })
      .filter(d => !d.name.startsWith('.') && (d.isDirectory() || (d.isSymbolicLink() && isDir(join(root, d.name)))))
      .map(d => ({ name: d.name, cwd: join(root, d.name) }))
      .map(f => ({ ...f, git: existsSync(join(f.cwd, '.git')), ...(isWorktree(f.cwd) ? { worktree: true } : {}) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    console.error(`[peixairada] ${root}: ${e.message}`);
  }
  folderCache.set(root, { mtime, folders });
  return folders;
}
// ---- the first run: where the repos live, guessed -------------------------------------------------------------------
// A board never told where the repos live asks, once (2026-10-01: the page's welcome, while `ask`). It offers what the
// chats already say — the folders holding the checkouts they ran in, by how many — then the usual names that hold a
// checkout, each with the GitHub account most of its checkouts' `origin` names, so the answer is mostly one ⏎.
const ROOT_NAMES = [
  'code',
  'src',
  'dev',
  'Developer',
  'projects',
  'repos',
  'git',
  'github',
  'workspace',
  'work',
  'Documents/GitHub',
];
/** The checkout a folder is in: the nearest folder at or above it whose .git is a directory — a worktree's or a
 *  submodule's .git is a file, and the repo holding it is the one meant — else the nearest with a .git at all. */
export function checkoutOf(cwd) {
  let any = null;
  if (!cwd?.startsWith('/')) return null; // dirname('.') is '.': a relative cwd climbed forever
  for (let d = cwd; d && d !== '/' && d !== homedir(); d = dirname(d)) {
    let st;
    try {
      st = statSync(join(d, '.git'));
    } catch {
      continue;
    }
    if (st.isDirectory()) return d;
    any ||= d;
  }
  return any;
}
/** The GitHub account most of a root's checkouts come from, by their `origin` — an ssh alias (github.com-work) too. */
function orgOf(root) {
  const n = new Map();
  for (const f of foldersIn(root).slice(0, 400)) {
    let txt;
    try {
      txt = readFileSync(join(f.cwd, '.git', 'config'), 'utf8');
    } catch {
      continue;
    }
    const m = /\[remote "origin"\][^[]*?url\s*=\s*\S*?github[\w.-]*[:/]([A-Za-z0-9][A-Za-z0-9-]{0,38})\//.exec(txt);
    if (m) n.set(m[1], (n.get(m[1]) || 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
/** Up to four folders of repos, likeliest first: `{dir, org, repos, chats}` — `chats`, how many of its checkouts a
 *  chat ran in; `repos`, how many it holds. */
export function suggestRoots() {
  const used = new Map(),
    seen = new Set(); // root -> the checkouts under it a chat ran in
  for (const s of sessions.values()) {
    const cwd = s.live?.cwd || s.cwd;
    if (!cwd || seen.has(cwd)) continue;
    seen.add(cwd);
    const top = checkoutOf(cwd),
      root = top && dirname(top);
    if (!root || root === '/' || root === homedir()) continue;
    if (!used.has(root)) used.set(root, new Set());
    used.get(root).add(top);
  }
  for (const n of ROOT_NAMES) {
    const d = join(homedir(), n);
    if (!used.has(d)) used.set(d, new Set());
  }
  const all = [...used]
    .map(([dir, tops]) => ({ dir, chats: tops.size, repos: foldersIn(dir).filter(f => f.git).length }))
    .filter(r => r.repos)
    .sort((a, b) => b.chats - a.chats || b.repos - a.repos);
  const likely = all.filter(r => r.chats > 1 || r.repos > 1); // one chat in one checkout is a download unzipped, not where the repos live
  return (likely.length ? likely : all).slice(0, 4).map(r => ({ ...r, org: orgOf(r.dir) }));
}
/** Every root's folders, a root at a time, each saying which root and org it is of. */
export const rootFolders = () =>
  boardConfig().roots.flatMap(r => foldersIn(r.dir).map(f => ({ ...f, root: r.dir, org: r.org })));

/** The repo a chat's folder was a checkout of, when that folder is not there (2026-10-09): under one of the setup's roots
 *  with an org, the folder right under the root names it — `<root>/<name>[/…]` is `<org>/<name>`, cloned to
 *  `<root>/<name>`. Null for a folder that is there, one under no such root, and one inside a repo folder that is there
 *  (a worktree since removed, a folder since deleted: no clone brings those back). A clone under way counts as not there. */
export function cloneFor(cwd) {
  if (!cwd || (existsSync(cwd) && !cloneUnder(cwd))) return null;
  for (const r of boardConfig().roots) {
    const rel = r.org ? relative(r.dir, cwd) : '';
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue;
    const name = rel.split(sep)[0],
      dir = join(r.dir, name);
    if (!REPO_NAME.test(name) || (existsSync(dir) && !clones.has(dir))) return null;
    return { name, root: r.dir, org: r.org, ref: `${r.org}/${name}`, dir };
  }
  return null;
}
/** Where a chat whose folder is gone resumes when no clone brings it back (2026-10-19): a worktree inside a repo that is
 *  there — `<repo>/.claude/worktrees/<name>`, the board's, worktree.sh's and Claude Code's --worktree's — is made again
 *  at its path (`tree`, restoreTree); any other folder inside a checkout that is there resumes in the nearest folder of
 *  it left (`near`) — Claude Code finds a chat by its id whichever folder it starts in, and writes on in its transcript.
 *  Null for a folder that is there, and one in no checkout that is. */
export function folderBack(cwd) {
  if (!cwd?.startsWith('/') || existsSync(cwd)) return null;
  const m = WT_IN.exec(cwd),
    repo = m && cwd.slice(0, m.index),
    tree = m && `${repo}/.claude/worktrees/${m[1]}`;
  if (m && existsSync(join(repo, '.git')) && !existsSync(tree)) return { tree, repo };
  let d = dirname(cwd);
  while (d !== '/' && !existsSync(d)) d = dirname(d);
  return gitTopOf(d) ? { near: d } : null;
}
/** A chat's folder gone from a repo that is there, put back for its resume or its zsh (2026-10-19): its worktree made
 *  again, and the folder it was in inside it (else the nearest one of it there); a worktree that cannot be made is the
 *  repo's own folder, and why. `cwd` is where the chat starts; null where folderBack has nowhere. */
export async function putBack(cwd, s) {
  const b = folderBack(cwd);
  if (!b) return null;
  if (!b.tree) return { cwd: b.near };
  const r = await restoreTree(b.tree, s?.gitBranch);
  if (!r.path) return { cwd: b.repo, why: r.error };
  let at = join(r.path, relative(b.tree, cwd));
  while (at !== r.path && !existsSync(at)) at = dirname(at);
  return { cwd: at, tree: r.path, branch: r.branch, made: r.made };
}
// The clones under way, by the folder each is cloning into (2026-10-09): a second ask for one joins it — the folder is
// there from git's first moment, and was "already there" to a second ask, which started claude in half a checkout —
// and git's own progress (`--progress`: it writes none into a pipe otherwise) goes out as `clone` events, the page's
// bar. The phases are weighted into one number: receiving the objects is most of a clone.
export const clones = new Map(); // dir → { ref, dir, phase, percent, at, waiters }
export const cloneUnder = cwd => [...clones.keys()].some(d => cwd === d || cwd.startsWith(d + sep));
const CLONE_PHASES = { 'Receiving objects': [0, 80], 'Resolving deltas': [80, 95], 'Updating files': [95, 100] };
export const cloneState = c => ({ ref: c.ref, dir: c.dir, phase: c.phase, percent: c.percent });
function cloneProgress(c, chunk) {
  let moved = false;
  for (const line of chunk.split(/[\r\n]+/)) {
    const m = /^(?:remote: )?([A-Z][a-z]+(?: [a-z]+)?):\s+(\d+)%/.exec(line.trim());
    if (!m) continue;
    const [lo, hi] = CLONE_PHASES[m[1]] || [c.percent, c.percent];
    const pct = Math.round(lo + ((hi - lo) * Number(m[2])) / 100);
    if (m[1] !== c.phase || pct !== c.percent) {
      c.phase = m[1];
      c.percent = Math.max(c.percent, pct);
      moved = true;
    }
  }
  if (moved && Date.now() - c.at >= 150) {
    c.at = Date.now();
    broadcast('clone', cloneState(c));
  }
}

/** `gh repo clone <org>/<name>` into a root — gh because it is already how the board asks GitHub about PRs, it knows
 *  the account's protocol, and it says plainly when there is no such repo. `rootDir` names the root; without it, the
 *  one root with an org, if there is only one. A folder that is already there is handed back as it is (the page
 *  carries straight on into the new-chat flow with it); a clone that failed leaves nothing behind, so the next try is
 *  not told the folder exists. */
export function cloneRepo(name, rootDir, done) {
  if (!REPO_NAME.test(name || '')) return done({ code: 400, error: `"${name}" is not a repository name` });
  const roots = boardConfig().roots.filter(r => r.org);
  const root = rootDir ? roots.find(r => r.dir === rootDir) : roots.length === 1 ? roots[0] : null;
  if (!root)
    return done({
      code: 400,
      error: rootDir
        ? `${rootDir} is not a folder of repos with an org — Settings › Projects sets them`
        : roots.length
          ? 'which folder of repos? more than one has an org'
          : 'no folder of repos has an org to clone from — Settings › Projects sets them',
    });
  const cwd = join(root.dir, name),
    ref = `${root.org}/${name}`;
  const under = clones.get(cwd);
  if (under) {
    under.waiters.push(done);
    return;
  } // one under way: its answer is this one's too
  if (existsSync(cwd)) return done({ code: 200, cwd, cloned: false });
  const bin = findBin('gh', 'cloning from the board is disabled');
  if (!bin) return done({ code: 503, error: 'gh not found — set GH_BIN to its path, or clone it by hand' });
  try {
    mkdirSync(root.dir, { recursive: true });
  } catch (e) {
    return done({ code: 500, error: `${root.dir}: ${e.message}` });
  }
  console.log(`[peixairada] clone ${ref} → ${cwd}`);
  const c = { ref, dir: cwd, phase: null, percent: 0, at: 0, waiters: [done] };
  clones.set(cwd, c);
  broadcast('clone', cloneState(c));
  const finish = r => {
    clones.delete(cwd);
    folderCache.delete(root.dir);
    broadcast('clone', { ...cloneState(c), ...(r.error ? { error: r.error } : { percent: 100 }), done: true });
    for (const w of c.waiters) w(r);
  };
  const child = execFile(
    bin,
    ['repo', 'clone', ref, cwd, '--', '--progress'],
    { cwd: root.dir, env: termEnv(), timeout: CLONE_MS, maxBuffer: 16e6 },
    (err, _out, stderr) => {
      if (!err) {
        console.log(`[peixairada] cloned ${ref}`);
        return finish({ code: 200, cwd, cloned: true });
      }
      try {
        if (existsSync(cwd)) rmSync(cwd, { recursive: true, force: true });
      } catch {} // half a checkout is no checkout: the next try clones again
      // execFile's callback error carries no output of its own: gh says why on stderr ("could not find any repository…").
      const why =
        String(stderr || err.message)
          .split(/[\r\n]+/)
          .map(l => l.trim())
          .filter(l => l && !/^(?:remote: )?[A-Z][a-z]+(?: [a-z]+)?:\s+\d+%/.test(l))
          .pop() || 'clone failed';
      console.error(`[peixairada] clone ${ref}: ${why}`);
      finish({ code: 502, error: why });
    },
  );
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', chunk => cloneProgress(c, chunk));
}
