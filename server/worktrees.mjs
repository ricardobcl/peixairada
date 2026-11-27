// The editor at a branch (2026-10-13): a working tree per branch — found, made, made again, swept once its PR
// is done.
import { appendFileSync, existsSync, lstatSync, realpathSync, symlinkSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { CLAUDE_DIR, inClaudeDir, STATE_FILE } from './env.mjs';
import {
  baseOk,
  branchNameOk,
  GIT_NET,
  gitOr,
  gitOut,
  goneSay,
  originDefault,
  parseWorktrees,
  prAsked,
  worktreesFor,
  WT_ASK_MS,
} from './changes.mjs';
import { gitTopOf, headAt } from './drift.mjs';
import { privateDir } from './key.mjs';
import { prKey } from './prs/mentions.mjs';
import { prStatus, queuePr } from './prs/status.mjs';
import { ghRepoOf } from './repos.mjs';
import { statusOf } from './sessions.mjs';
import { tildePath } from './setup.mjs';
import { saveState, sessions, titles, worktreesMade } from './state.mjs';
import { terms } from './terminals/terms.mjs';

// ---- the editor at a branch: a working tree per branch (2026-10-13) -------------------------------------------------
// A PR's branch on disk without moving the branch under the chats of the folder: the tree that has it already — the
// folder itself, a worktree — else a new one inside the repo, `<repo>/.claude/worktrees/<slug>` (where Claude Code's
// --worktree puts its own: the repo's colour, its named projects and VS Code Web's trust of it reach there). A
// branch of origin's is checked out tracking it; a fork's PR, or one asked for review only, is detached at its head —
// nothing to push to, and never "already checked out". Nothing is installed: node_modules is linked from the main tree
// when asked and the lockfiles match. The trees made here are the state file's `worktrees`; only they are ever removed.
// A fork's PR is a stranger's code, and its tree is made outside the repo (2026-11-06): in the state folder's `reviews`,
// where no trust given to the repo or a folder above it — VS Code Web's, whose workspace runs a folder's tasks and
// settings once trusted — reaches it.
const REVIEWS_DIR = join(dirname(STATE_FILE), 'reviews');

const wtSlug = b =>
  String(b)
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || 'wt';

const wtAsking = new Map(); // one making per repo and branch at a time: a second ask waits for the first's tree

export async function ensureWorktree({
  cwd,
  pr = null,
  branch = null,
  detach = false,
  fresh = false,
  share = false,
  base = null,
}) {
  const w = await worktreesFor(cwd);

  if (w.error) return { code: 409, error: w.error };

  let want = null;
  let refs = null;

  if (pr) {
    want = prAsked(pr, w.main);
    if (!want) return { code: 400, error: 'which PR? — its number or URL' };

    if (!want.mine) {
      return { code: 409, error: `that PR is not in this checkout's repo${w.repo ? ` (${w.repo})` : ''}` };
    }

    refs = prStatus.get(want.url)?.refs || null;
    if (!refs && !detach) return { code: 409, error: 'its branch is not known yet — GitHub has not answered for it' };
    branch = refs?.head ?? null;
    if (refs?.fork) detach = true; // a fork's branch name means nothing here
  }

  if (!pr && (!branch || detach)) return { code: 400, error: detach ? 'detached at what? — a PR' : 'which branch?' };

  if (branch && !(await branchNameOk(w.main, branch))) {
    return { code: 400, error: `${branch} is not a branch name the board makes` };
  }

  if (base !== null && !(await baseOk(w.main, base))) {
    return { code: 400, error: `${base} is not a branch here to start from` };
  }

  if (!detach) {
    const t = w.worktrees.find(x => x.branch === branch);

    // a new chat's branch (fresh) out in a tree already: that tree is shared only when asked for — the page said so first
    if (t && fresh && !share) {
      return {
        code: 409,
        error: `${branch} is out in ${tildePath(t.path)} already — a chat there shares its files`,
        path: t.path,
        out: true,
      };
    }

    if (t) return { path: t.path, branch, made: false, here: t.path === w.here };
    const gone = goneSay(branch, w);

    if (gone) return { code: 409, error: gone };
  }

  const key = `${w.main}\0${detach ? `pr-${want?.n}` : branch}`;

  if (wtAsking.has(key)) return wtAsking.get(key);
  const p = makeWorktree(w, { want, refs, branch, detach, fresh, base }).finally(() => wtAsking.delete(key));

  wtAsking.set(key, p);
  return p;
}

async function makeWorktree(w, { want, refs, branch, detach, fresh, base = null }) {
  const main = w.main;

  const fail = (e, what) => ({
    code: 500,
    error: `${what}: ${
      String(e.stderr || e.message)
        .trim()
        .split('\n')[0]
    }`,
  });

  if (inClaudeDir(join(main, '.claude', 'worktrees'))) {
    return {
      code: 409,
      error: `a tree here would be under ${tildePath(CLAUDE_DIR)}, Claude Code's — the board writes nothing there`,
    };
  } // a repo at ~/.claude or ~ (2026-10-14)

  let oid = null;
  let start = [];
  let unasked = false;

  if (detach) {
    oid = refs?.headOid;

    if (!oid || (await gitOr(main, ['cat-file', '-e', `${oid}^{commit}`], false)) === false) {
      try {
        // its head into the object store alone, as a PR's diff does
        const ls = await gitOut(main, ['ls-remote', 'origin', `refs/pull/${want.n}/head`], GIT_NET);

        oid = ls.split('\t')[0].trim();
        if (!oid) return { code: 409, error: `origin has no PR #${want.n}` };

        if ((await gitOr(main, ['cat-file', '-e', `${oid}^{commit}`], false)) === false) {
          await gitOut(
            main,
            [
              'fetch',
              '--quiet',
              '--no-tags',
              '--no-write-fetch-head',
              '--refmap=',
              'origin',
              `refs/pull/${want.n}/head`,
            ],
            GIT_NET,
          );
        }
      } catch (e) {
        return fail(e, `could not fetch PR #${want.n}`);
      }
    }

    const t = w.worktrees.find(x => x.detached && x.head === oid);

    if (t) return { path: t.path, branch: null, made: false, detached: true, here: t.path === w.here };
    start = ['--detach', null, oid];
  } else if (await gitOr(main, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])) {
    start = [null, branch]; // a branch of this repo's, checked out nowhere
  } else {
    // A new chat's branch (2026-11-04): origin is asked only whether it has the name, WT_ASK_MS at most. One that does not
    // answer costs that and no more, and the branch is new, from what is here; one that does keeps its minute for a fetch.
    const there =
      !fresh ||
      ((await gitOr(main, ['remote', 'get-url', 'origin'], false)) &&
        (await gitOut(main, ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], {
          ...GIT_NET,
          timeout: WT_ASK_MS,
        }).then(
          o => o.split('\n').some(l => l.endsWith(`\trefs/heads/${branch}`)),
          () => null,
        )));

    unasked = there === null;

    if (there) {
      try {
        await gitOut(
          main,
          [
            'fetch',
            '--quiet',
            '--no-tags',
            '--no-write-fetch-head',
            'origin',
            `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
          ],
          GIT_NET,
        );

        start = ['--track', '-b', branch, null, `refs/remotes/origin/${branch}`];
      } catch (e) {
        if (!fresh) return fail(e, `no branch ${branch} here, nor on origin`);
      }
    }

    if (!start.length) {
      // a new branch (a new chat on one): from the base asked for (2026-10-28; origin's as origin has it now), else from
      // origin's default branch as origin has it now — tracking nothing yet
      const theirs = base ? /^refs\/remotes\/origin\/(.+)$/.exec(base)?.[1] : w.dflt;

      if (theirs && !unasked) {
        try {
          await gitOut(
            main,
            [
              'fetch',
              '--quiet',
              '--no-tags',
              '--no-write-fetch-head',
              'origin',
              `+refs/heads/${theirs}:refs/remotes/origin/${theirs}`,
            ],
            GIT_NET,
          );
        } catch {}
      }

      const from =
        base ||
        ((await gitOr(main, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${theirs}`]))
          ? `refs/remotes/origin/${theirs}`
          : 'HEAD'); // full refs: never a branch of that name

      start = ['--no-track', '-b', branch, null, from];
    }
  }

  const stranger = !!(detach && refs?.fork);
  let dir = join(main, '.claude', 'worktrees');

  if (stranger) {
    try {
      dir = realpathSync(privateDir(REVIEWS_DIR));
    } catch (e) {
      return { code: 500, error: e.message };
    }
  }

  const slug = wtSlug(stranger ? `${basename(main)}-pr-${want.n}` : detach ? `pr-${want.n}` : branch);
  let path = join(dir, slug);

  for (let i = 2; existsSync(path); i++) path = join(dir, `${slug}-${i}`);

  try {
    await gitOut(main, ['worktree', 'add', '--quiet', ...start.map(a => a ?? path)]);
  } catch (e) {
    return fail(e, 'git worktree add failed');
  }

  await treeMade(main, path, {
    branch: detach ? null : branch,
    pr: want?.url ?? null,
    ...(want && { prState: prStatus.get(want.url)?.state ?? null }),
  });

  console.log(`[peixairada] worktree ${tildePath(path)} made for ${detach ? `PR #${want.n}, detached` : branch}`);
  return {
    path,
    branch: detach ? null : branch,
    made: true,
    detached: !!detach,
    here: false,
    ...(unasked && { unasked: true, from: start.at(-1) }),
  };
}

/** A tree just added: out of the repo's own status where no ignore file says so already (the repo's info/exclude, never
 *  a tracked file), and in the state file's `worktrees` — the only trees the sweep ever removes. */
async function treeMade(main, path, rec) {
  if (path.startsWith(`${main}/`) && (await gitOr(main, ['check-ignore', '-q', path], false)) === false) {
    try {
      appendFileSync(
        join(await gitOr(main, ['rev-parse', '--git-common-dir']).then(d => resolve(main, d)), 'info', 'exclude'),
        '\n/.claude/worktrees/\n',
      );
    } catch {}
  }

  worktreesMade[path] = {
    repo: main,
    ...rec,
    head: await gitOr(path, ['rev-parse', 'HEAD']),
    at: new Date().toISOString(),
  };

  saveState();
}

/** A chat's worktree made again at its own path, for its resume (2026-10-19; folderBack's `tree`) — removed by the sweep
 *  once its PR merged, by worktree.sh done, by hand. On the chat's branch as this checkout has it, else origin's as last
 *  fetched (no network), else made anew from the default branch — this checkout's or origin's, whichever is ahead: a
 *  branch deleted once its work landed, on a main here that origin has not got yet —; detached there for a chat that
 *  was. Its branch out in another tree is that tree: the chat resumes there. Its own path deleted by hand, which git
 *  still holds, is taken back (`--force`, for that path: the branch is checked first). Made by the board, the sweep
 *  removes it as any other. */
export async function restoreTree(path, said) {
  const repo = path.slice(0, path.lastIndexOf('/.claude/worktrees/'));
  const w = await worktreesFor(repo);

  if (w.error) return { code: 409, error: w.error };

  if (inClaudeDir(path)) {
    return {
      code: 409,
      error: `${tildePath(path)} is under ${tildePath(CLAUDE_DIR)}, Claude Code's — the board writes nothing there`,
    };
  }

  const branch = said && said !== 'HEAD' && (await branchNameOk(w.main, said)) ? said : null;
  const out = branch && w.worktrees.find(t => t.branch === branch);

  if (out) return { path: out.path, branch, made: false };
  let real = path;

  try {
    real = join(realpathSync(repo), relative(repo, path));
  } catch {} // as git names its trees

  const mine = w.gone.find(t => t.path === real || t.path === path);
  const held = branch && w.gone.find(t => t.branch === branch && t !== mine);

  if (held) return { code: 409, error: goneSay(branch, { gone: [held] }) };
  const key = `${w.main}\0${branch || real}`; // ensureWorktree's for a branch: one making of it at a time

  if (wtAsking.has(key)) return wtAsking.get(key);

  const p = (async () => {
    const has = ref => gitOr(w.main, ['rev-parse', '--verify', '--quiet', ref]);
    let start;

    if (branch && (await has(`refs/heads/${branch}`))) start = [real, branch];
    else if (branch && (await has(`refs/remotes/origin/${branch}`))) {
      start = ['--track', '-b', branch, real, `refs/remotes/origin/${branch}`];
    } else {
      const here = `refs/heads/${w.dflt}`;
      const there = `refs/remotes/origin/${w.dflt}`;
      const [h, t] = await Promise.all([has(here), has(there)]);

      const from =
        h && (!t || (await gitOr(w.main, ['merge-base', '--is-ancestor', there, here], false)) !== false)
          ? here
          : t
            ? there
            : 'HEAD'; // full refs: never a branch of that name

      start = branch ? ['--no-track', '-b', branch, real, from] : ['--detach', real, from];
    }

    try {
      await gitOut(w.main, ['worktree', 'add', '--quiet', ...(mine ? ['--force'] : []), ...start]);
    } catch (e) {
      return {
        code: 500,
        error: `git worktree add failed: ${
          String(e.stderr || e.message)
            .trim()
            .split('\n')[0]
        }`,
      };
    }

    await treeMade(w.main, real, { branch, pr: null });
    return { path: real, branch, made: true };
  })().finally(() => wtAsking.delete(key));

  wtAsking.set(key, p);
  return p;
}

/** A worktree's node_modules linked to its main tree's — only when the lockfiles are the same (worktreesFor's `same`). */
export async function linkModules(path) {
  const w = await worktreesFor(path);
  const t = w.worktrees?.find(x => x.path === w.here);

  if (!t || t.path === w.main) return { code: 409, error: 'not a worktree of a checkout' };

  if (inClaudeDir(t.path)) {
    return {
      code: 409,
      error: `${tildePath(t.path)} is under ${tildePath(CLAUDE_DIR)} — the board writes nothing there`,
    };
  }

  if (t.modules !== 'same') {
    return {
      code: 409,
      error:
        t.modules === 'here'
          ? 'it has a node_modules already'
          : "its lockfile is not the main tree's — npm ci there instead",
    };
  }

  try {
    symlinkSync(join(w.main, 'node_modules'), join(t.path, 'node_modules'));
  } catch (e) {
    return { code: 500, error: e.message };
  }

  if (worktreesMade[t.path]) {
    worktreesMade[t.path].linked = true;
    saveState();
  }

  return { ok: true, path: t.path };
}

/** The work tree a path is in (gitTopOf), real — as git names the trees it lists. */
export const treeOf = p => {
  const t = gitTopOf(p);

  try {
    return t && realpathSync(t);
  } catch {
    return null;
  }
};

/** Whether a chat or a drawer works in that tree: a live chat's folder, a drawer not ended. */
const busyIn = tree =>
  [...sessions.values()].some(s => s.alive && treeOf(s.live?.cwd || s.cwd) === tree) ||
  [...terms.values()].some(t => t.exited === null && treeOf(t.cwd) === tree);

/** Why a tree the board made stays — null when nothing holds it: a chat or a drawer in it, another branch out in it
 *  than the one it was made for (or, detached, another commit — 2026-10-14: a `git switch -c` there after the merge is
 *  new work), a change not committed, a commit no remote has (beyond the one it was made at). Untracked files and
 *  submodules are asked for whatever the config says (2026-10-14): status.showUntrackedFiles=no hid a file never
 *  added, and `worktree remove` took it. */
async function keepWorktree(path, rec) {
  if (busyIn(path)) return 'a chat or a drawer is in it';

  const on = await gitOr(path, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const head = await gitOr(path, ['rev-parse', 'HEAD']);

  if (rec.branch ? on !== rec.branch : on !== null || head !== rec.head) {
    return `it is on ${on || head?.slice(0, 7)} now`;
  }

  const st = (
    await gitOut(path, [
      '--no-optional-locks',
      'status',
      '--porcelain',
      '--untracked-files=normal',
      '--ignore-submodules=none',
    ])
  )
    .split('\n')
    .filter(l => l && !(rec.linked && l === '?? node_modules'));

  if (st.length) return 'changes not committed';

  if (head !== rec.head && (await gitOr(path, ['rev-list', '--max-count=1', 'HEAD', '--not', '--remotes'], 'x'))) {
    return 'commits not pushed';
  }

  return null;
}

/** The PR opened from a new branch's tree (2026-10-13): its repo's, headed by that branch, not a fork's — open, or opened
 *  since the tree was made (a branch name used again: the PR merged under it long ago is not this tree's). The newest. */
function prOfBranch(rec) {
  const own = ghRepoOf(rec.repo);

  if (!own) return null;

  const pre = prKey(own.owner, own.name, '');
  const made = Date.parse(rec.at) || 0;

  let best = null;

  for (const [url, p] of prStatus) {
    if (!url.startsWith(pre) || p.refs?.head !== rec.branch || p.refs.fork || !p.state) continue;
    if ((p.state === 'merged' || p.state === 'closed') && !(Date.parse(p.created) >= made)) continue;
    if (!best || (Date.parse(p.created) || 0) > (Date.parse(best[1].created) || 0)) best = [url, p];
  }

  return best?.[0] ?? null;
}

/** Whether a new branch's tree has commits since it was made, all of them on origin's default branch now — merged with
 *  no PR the board knows of, or fast-forwarded — as this checkout last fetched it; and one of them at least its own
 *  (2026-10-14): a tree only brought up to origin's branch by a pull has nothing done in it, and stays. */
async function landed(path, rec) {
  const head = await gitOr(path, ['rev-parse', 'HEAD']);

  if (!head || head === rec.head) return false;

  if (
    (await gitOr(
      path,
      ['merge-base', '--is-ancestor', 'HEAD', `refs/remotes/origin/${await originDefault(rec.repo)}`],
      false,
    )) === false
  ) {
    return false;
  }

  const mine = await ownCommits(path);
  const since = (await gitOr(path, ['rev-list', `${rec.head}..HEAD`], '')).split('\n');

  return since.some(c => mine.has(c));
}

/** The commits made in a tree, as its HEAD's reflog says them: a commit (an amend too), a cherry-pick, a revert, a merge
 *  made, a rebase's picks — never a pull or a merge that fast-forwarded, a reset, a checkout. No reflog: none. */
const OWN_MOVE = /^(commit|cherry-pick|revert)\b|\((pick|reword|edit|squash|fixup)\): |: Merge made by /;

async function ownCommits(path) {
  const lines = (await gitOr(path, ['reflog', '--format=%H %gs', 'HEAD'], '')).split('\n');

  return new Set(
    lines
      .map(l => [l.slice(0, l.indexOf(' ')), l.slice(l.indexOf(' ') + 1)])
      .filter(([, gs]) => OWN_MOVE.test(gs))
      .map(([c]) => c),
  );
}

/** The trees the board made, removed once their work is done — a PR's merged or closed; a new branch's (2026-10-13) by
 *  the PR opened from it (`prOfBranch`, kept as its `pr`), else once its commits are on origin's default branch — with
 *  `git worktree remove`, never --force, so git itself refuses anything with work in it, and only when nothing holds
 *  them (keepWorktree). A new branch's tree with nothing done in it stays. A tree gone by hand is forgotten. A tree made
 *  for a PR merged or closed already (2026-10-14: Editor ▾ on any PR row), or before GitHub said, is a look at it: only
 *  a merge or a close after the sweep has seen the PR open counts (`prState`). */
export const WT_SWEEP_MS = Number(process.env.WT_SWEEP_MS || 10 * 60_000);
export let wtSweeping = false;
export let wtSweptAt = 0;

export async function sweepWorktrees() {
  if (wtSweeping) return [];
  wtSweeping = true;
  wtSweptAt = Date.now();
  const gone = [];
  let changed = false;

  const drop = async (path, rec, why) => {
    try {
      if (await keepWorktree(path, rec)) return;

      if (rec.linked) {
        try {
          if (lstatSync(join(path, 'node_modules')).isSymbolicLink()) unlinkSync(join(path, 'node_modules'));
        } catch {}
      }

      await gitOut(rec.repo, ['-c', 'status.showUntrackedFiles=normal', 'worktree', 'remove', path]); // git's own check reads that config too
      delete worktreesMade[path];
      changed = true;
      gone.push(path);
      console.log(`[peixairada] worktree ${tildePath(path)} removed — ${why}, nothing in it`);
    } catch (e) {
      console.error(
        `[peixairada] worktree ${tildePath(path)} kept: ${
          String(e.stderr || e.message)
            .trim()
            .split('\n')[0]
        }`,
      );
    }
  };

  try {
    for (const [path, rec] of Object.entries(worktreesMade)) {
      if (!existsSync(path)) {
        delete worktreesMade[path];
        changed = true;
        continue;
      }

      if (!rec.pr && rec.branch) {
        const url = prOfBranch(rec);

        if (url) {
          rec.pr = url;
          changed = true;
        } else {
          if (await landed(path, rec).catch(() => false)) {
            await drop(path, rec, 'its commits are on origin’s default branch');
          }

          continue;
        }
      }

      if (!rec.pr) continue;
      const st = prStatus.get(rec.pr)?.state;

      if (!st) {
        queuePr(rec.pr);
        continue;
      } // asked about: the chat that named it may be gone

      if (st === 'merged' || st === 'closed') {
        if (rec.prState === undefined || rec.prState === 'open' || rec.prState === 'draft') {
          await drop(path, rec, `its PR is ${st}`);
        }
      } else if (rec.prState !== st) {
        rec.prState = st;
        changed = true;
      } // open: a merge or a close from now on is its end
    }
  } finally {
    wtSweeping = false;
    if (changed) saveState();
  }

  return gone;
}

/** Whether this chat's folder may have its branch switched to `branch` — never by the board: the switch is typed
 *  into the chat's zsh, unrun, and offered only when no other chat works in that tree, this one is not mid-turn,
 *  nothing is uncommitted and no merge or rebase is under way. `why` says what stands in the way. */
export async function switchGuard(s, branch) {
  const cwd = s.live?.cwd || s.cwd;
  const tree = treeOf(cwd);
  const why = [];

  if (!tree || !headAt(tree)) return { ok: false, why: ['its folder is not a git checkout'] };
  if (headAt(tree) === branch) return { ok: false, why: [`it is on ${branch} already`] };

  const elsewhere = parseWorktrees(await gitOut(tree, ['worktree', 'list', '--porcelain'])).find(
    w => w.branch === branch,
  );

  if (elsewhere) why.push(`${branch} is out in ${basename(elsewhere.path)} — open that instead`); // git would refuse it
  if (statusOf(s) === 'working') why.push('this chat is mid-turn');
  const name = o => titles[o.id] || o.customTitle || o.title || 'a chat';
  const others = [...sessions.values()].filter(o => o.id !== s.id && treeOf(o.live?.cwd || o.cwd) === tree);

  const live = others.filter(o => o.alive);
  const recent = others.filter(o => !o.alive && Date.now() - Date.parse(o.lastActivity || 0) < 86_400_000);

  if (live.length) {
    why.push(
      `another chat works here — ${live.slice(0, 2).map(name).join(', ')}${live.length > 2 ? ` and ${live.length - 2} more` : ''}`,
    );
  } else if (recent.length) why.push(`another chat was here today — ${name(recent[0])}`);

  if ([...terms.values()].some(t => t.exited === null && t.sessionId !== s.id && treeOf(t.cwd) === tree)) {
    why.push('another chat’s drawer is open here');
  }

  const dirty = (await gitOut(tree, ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=no']))
    .split('\n')
    .filter(Boolean).length; // no index written back (2026-10-14)

  if (dirty) why.push(`${dirty} file${dirty === 1 ? ' is' : 's are'} not committed`);
  const gd = await gitOr(tree, ['rev-parse', '--absolute-git-dir']);

  if (
    gd &&
    ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'].some(f => existsSync(join(gd, f)))
  ) {
    why.push('a merge or a rebase is under way');
  }

  return { ok: !why.length, why, branch, tree };
}
