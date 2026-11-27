// Each folder's repository on GitHub, from its origin remote: asked once per folder, again after an hour.
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { findBin } from './bins.mjs';
import { checkoutOf } from './folders.mjs';
import { boardCwds } from './setup.mjs';
import { broadcast } from './sse.mjs';

// The folder's repository on GitHub, from `git remote get-url origin` — ⌥⌘G opens it when the chat mentions no PR
// (2026-09-20). Asked once per folder the board knows, again after an hour; a change reaches every page as a `repos`
// event. A folder that is no git checkout, or whose origin is not GitHub, has none.
const repos = new Map(); // cwd -> { url, at }

export const REPO_TTL_MS = 60 * 60_000;
export const REPOS_POLL_MS = 3000;
// `git@github.com-work:` too — an SSH host alias, the usual way to keep two GitHub accounts apart
const GH_REMOTE = /github\.com(?:-[\w.-]+)?[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?\s*$/;

const ghRepoUrl = remote => {
  const m = GH_REMOTE.exec(String(remote));

  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
};

/** The same repository as `{owner, name}`, read from the checkout's git config rather than asked of git — a chat's `#12`
 *  is resolved as its line is read, the boot's included (2026-10-06). A worktree's `.git` is a file naming its own git
 *  dir, whose `commondir` is the repo's. Kept an hour, as `repos` is; null for no checkout or an origin not on GitHub. */
const checkouts = new Map(); // cwd -> { at, repo }

export function ghRepoOf(cwd, now = Date.now()) {
  if (!cwd) return null;
  const hit = checkouts.get(cwd);

  if (hit && now - hit.at < REPO_TTL_MS) return hit.repo;
  let repo = null;
  const top = checkoutOf(cwd);

  if (top) {
    try {
      let git = join(top, '.git');

      if (!statSync(git).isDirectory()) {
        git = resolve(top, /^gitdir:\s*(.+)$/m.exec(readFileSync(git, 'utf8'))[1].trim());

        try {
          git = resolve(git, readFileSync(join(git, 'commondir'), 'utf8').trim());
        } catch {}
      }

      const m = GH_REMOTE.exec(
        /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(readFileSync(join(git, 'config'), 'utf8'))?.[1] || '',
      );

      if (m) repo = { owner: m[1], name: m[2] };
    } catch {}
  }

  checkouts.set(cwd, { at: now, repo });
  return repo;
}

export const repoUrls = () => Object.fromEntries([...repos].filter(([, v]) => v.url).map(([c, v]) => [c, v.url]));

export function pollRepos() {
  const want = boardCwds();
  let changed = false;

  for (const c of [...repos.keys()]) {
    if (!want.has(c)) {
      repos.delete(c);
      changed = true;
    }
  }

  // Six a poll (every 3 s), not every folder at once (2026-10-03: forty gits at boot and again each hour, all on one
  // poll); and an answer that is no answer — git timed out, or is not there — keeps the URL known before. Only "no
  // origin" (2) and "not a repo" (128) say there is none.
  const due = [...want].filter(c => !repos.has(c) || Date.now() - repos.get(c).at > REPO_TTL_MS).slice(0, 6);
  const git = due.length && findBin('git', '⌥⌘G opens no repo');

  if (!git) {
    if (changed) broadcast('repos', { repos: repoUrls() });
    return;
  }

  let left = due.length;

  for (const cwd of due) {
    const prev = repos.get(cwd);

    repos.set(cwd, { url: prev?.url || null, at: Date.now() }); // claimed: not asked twice while git answers

    execFile(git, ['-C', cwd, 'remote', 'get-url', 'origin'], { timeout: 5000 }, (err, out) => {
      const url = !err ? ghRepoUrl(out) : err.code === 2 || err.code === 128 ? null : prev?.url || null;

      if ((prev?.url || null) !== url) changed = true;
      repos.set(cwd, { url, at: Date.now() });
      if (--left === 0 && changed) broadcast('repos', { repos: repoUrls() });
    });
  }
}
