// What a chat changed (2026-10-10): its folder's diff in a scope — uncommitted, the branch, the last turn, a
// PR's — for the changes tab.
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { execFileP } from './env.mjs';
import { findBin, ghBin } from './bins.mjs';
import { PR_ONE, prKey } from './prs/mentions.mjs';
import { prStatus } from './prs/status.mjs';
import { ghRepoOf } from './repos.mjs';
import { tildePath } from './setup.mjs';
import { sessions, worktreesMade } from './state.mjs';
import { treeOf } from './worktrees.mjs';

// ---- what a chat changed: its folder's diff, for the changes tab (2026-10-10) ------------------------------------------
// Conductor's and Crystal's review pane, read from git in the chat's folder when the page asks — nothing is polled and
// nothing is written. Three scopes: `uncommitted` (the working tree, untracked files too, against HEAD), `branch` (the
// same against where the branch left its base — origin's default branch), and `turn`: the uncommitted diff of the files
// the chat's last turn edited (`s.turnFiles`, from its Edit / Write tool calls — a file already dirty before the turn
// shows whole, which a snapshot per prompt would have avoided at the cost of writing objects into the repo).
const CHANGES_MAX = Number(process.env.CHANGES_MAX || 600_000); // the patch's characters the page gets, at most
export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
// Paths as git wrote them (2026-10-14): -z wherever git lists them, each verbatim; a patch's heads quoted C-style where a
// name needs it ("a/say \"hi\".txt", the bytes of UTF-8 in octal with core.quotePath on) — read back by diffPath.
/** `git diff --numstat -z` → {path: {add, del, binary}}; a binary file says - - */
export function parseNumstat(text) {
  const out = {};
  for (const l of String(text).split('\0')) {
    const m = /^(-|\d+)\t(-|\d+)\t([\s\S]+)$/.exec(l);
    if (m) out[m[3]] = { add: m[1] === '-' ? 0 : +m[1], del: m[2] === '-' ? 0 : +m[2], binary: m[1] === '-' };
  }
  return out;
}
/** `git diff --name-status -z` → {path: 'M' | 'A' | 'D' | …} */
export function parseNameStatus(text) {
  const out = {},
    p = String(text).split('\0');
  for (let i = 0; i + 1 < p.length; i += 2) if (/^[A-Z]\d*$/.test(p[i])) out[p[i + 1]] = p[i][0];
  return out;
}
/** A name git quoted, from the `"` at `i`: its text and the index past the closing quote. */
function unquoteGit(s, i = 0) {
  const bytes = [],
    esc = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 },
    enc = new TextEncoder();
  for (i++; i < s.length && s[i] !== '"';) {
    if (s[i] !== '\\') {
      const ch = String.fromCodePoint(s.codePointAt(i));
      bytes.push(...enc.encode(ch));
      i += ch.length;
    } else if (/[0-7]/.test(s[i + 1])) {
      bytes.push(parseInt(s.slice(i + 1, i + 4), 8));
      i += 4;
    } else {
      bytes.push(esc[s[i + 1]] ?? s.charCodeAt(i + 1));
      i += 2;
    }
  }
  return [new TextDecoder().decode(new Uint8Array(bytes)), i + 1];
}
/** The b/ side's path of a `diff --git` line, quoted or not — `a/P b/P` read by its length, so a space or " b/" in the
 *  name is no matter; null for a head that is not a/ b/. */
function diffPath(line) {
  const rest = String(line).slice(11);
  let b;
  if (rest[0] === '"') b = rest.slice(unquoteGit(rest)[1] + 1);
  else {
    const n = (rest.length - 5) / 2;
    if (
      Number.isInteger(n) &&
      rest.startsWith('a/') &&
      rest.slice(n + 2, n + 5) === ' b/' &&
      rest.slice(2, n + 2) === rest.slice(n + 5)
    )
      return rest.slice(n + 5);
    const q = rest.indexOf(' "b/');
    b = rest.slice((q >= 0 ? q : rest.indexOf(' b/')) + 1);
  }
  if (b[0] === '"') b = unquoteGit(b)[0];
  return b.startsWith('b/') ? b.slice(2) : null;
}
/** A patch cut at each file's `diff --git` line: [{path, text}], the path the b/ side's. */
export function splitPatch(text) {
  const out = [];
  for (const part of String(text).split(/^(?=diff --git )/m)) {
    const path = part.startsWith('diff --git ') && diffPath(part.split('\n', 1)[0]);
    if (path) out.push({ path, text: part });
  }
  return out;
}
/** An untracked file as git would show it added: every line a +, up to `max` of them. */
export function addedPatch(path, body, max = 400) {
  const lines = body.replace(/\n$/, '').split('\n'),
    shown = lines.slice(0, max);
  return `diff --git a/${path} b/${path}\nnew file\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${shown.length} @@\n${shown.map(l => '+' + l).join('\n')}\n${lines.length > max ? `\\ ${lines.length - max} more lines\n` : ''}`;
}
export const gitOut = async (cwd, args, opts = {}) => {
  const bin = findBin('git', "a chat's changes go unread");
  if (!bin) throw new Error('git is not installed');
  const { stdout } = await execFileP(bin, ['-C', cwd, ...args], { timeout: 20_000, maxBuffer: 32e6, ...opts });
  return stdout;
};
export const gitOr = (cwd, args, dflt = null) =>
  gitOut(cwd, args).then(
    o => o.trim(),
    () => dflt,
  );
/** A copy of a checkout's index for the reads that must leave it alone (2026-10-14): `git diff` against the working tree
 *  refreshes the stat data of files touched but not changed and writes the index back — index.lock taken under a chat's
 *  own git add or commit, the changes tab reading at each turn's end. `opts` for gitOut; the copy keeps the index's
 *  mtime (an entry as new is still checked by content) and goes with `drop`. No index yet, no copy: nothing to spare. */
async function indexCopy(root) {
  const idx = resolve(root, await gitOr(root, ['rev-parse', '--git-path', 'index'], '.git/index'));
  if (!existsSync(idx)) return { opts: {}, drop() {} };
  const dir = mkdtempSync(join(tmpdir(), 'peix-index-')),
    copy = join(dir, 'index');
  try {
    cpSync(idx, copy, { preserveTimestamps: true });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return {
    opts: { env: { ...process.env, GIT_INDEX_FILE: copy } },
    drop: () => rmSync(dir, { recursive: true, force: true }),
  };
}
// A PR of the checkout's repo as GitHub shows it (2026-10-13): `refs/pull/<n>/head` against where it left its base,
// read from origin into the object store alone — `--refmap=` and `--no-write-fetch-head` write no ref and no FETCH_HEAD
// (a `git pull` mid-way in this checkout reads that), and nothing is checked out — so a chat on another branch of the
// same folder never notices. ls-remote says where both are; only what is not here yet is fetched. Whatever git cannot
// do — no checkout of that repo, origin unreachable — `gh pr diff` does, from GitHub (`gh: true` asks for it).
export const BRANCH_NAME = /^(?!-)(?!.*\.\.)[\w./-]{1,200}$/; // a base asked for by name: a branch, never an option
export const GIT_NET = { timeout: 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } };
export const WT_ASK_MS = Number(process.env.WT_ASK_MS || 5000); // how long origin has to say whether it has a new chat's branch (makeWorktree, 2026-11-04)
/** origin's default branch as this checkout last heard it (origin/HEAD), no network — else main. */
export const originDefault = async root =>
  (await gitOr(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']))?.replace(/^origin\//, '') || 'main';
/** Which PR `pr=` names — a number (the checkout's repo) or a URL — and whether it is the checkout's repo's. */
export function prAsked(ask, root) {
  const said = String(ask || ''),
    m = PR_ONE.exec(said),
    n = Number(m?.[3] || /^#?(\d+)$/.exec(said)?.[1]);
  if (!n) return null;
  const own = root && ghRepoOf(root);
  return {
    n,
    url: m ? prKey(m[1], m[2], n) : own ? prKey(own.owner, own.name, n) : null,
    mine: !m || (!!own && `${m[1]}/${m[2]}`.toLowerCase() === `${own.owner}/${own.name}`.toLowerCase()),
  };
}
async function prRange(root, n, base) {
  base ||=
    (await gitOr(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']))?.replace(/^origin\//, '') ||
    /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(
      await gitOut(root, ['ls-remote', '--symref', 'origin', 'HEAD'], GIT_NET).catch(() => ''),
    )?.[1] ||
    'main';
  const want = [`refs/pull/${n}/head`, `refs/heads/${base}`];
  let ls;
  try {
    ls = await gitOut(root, ['ls-remote', 'origin', ...want], GIT_NET);
  } catch (e) {
    return {
      error: `origin did not answer: ${
        String(e.stderr || e.message)
          .trim()
          .split('\n')[0]
      }`,
      gh: true,
    };
  }
  const oid = Object.fromEntries(
    ls
      .split('\n')
      .filter(Boolean)
      .map(l => l.split('\t').reverse()),
  );
  if (!oid[want[0]]) return { error: `origin has no PR #${n}`, gh: true };
  if (!oid[want[1]]) return { error: `origin has no branch ${base}`, gh: true };
  const missing = [];
  for (const r of want)
    if ((await gitOr(root, ['cat-file', '-e', `${oid[r]}^{commit}`], false)) === false) missing.push(r);
  if (missing.length) {
    try {
      await gitOut(
        root,
        ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', '--refmap=', 'origin', ...missing],
        GIT_NET,
      );
    } catch (e) {
      return {
        error: `could not fetch PR #${n}: ${
          String(e.stderr || e.message)
            .trim()
            .split('\n')[0]
        }`,
        gh: true,
      };
    }
  }
  const from = await gitOr(root, ['merge-base', oid[want[1]], oid[want[0]]]);
  if (!from) return { error: `PR #${n} shares no history with ${base}`, gh: true };
  return { n, head: oid[want[0]], base, baseOid: oid[want[1]], from, fetched: missing.length > 0 };
}
/** One file's patch counted as numstat would: its status, the lines added and removed after its first hunk. */
export function patchStat(text) {
  let add = 0,
    del = 0,
    inHunk = false;
  for (const l of String(text).split('\n')) {
    if (l.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (inHunk && l.startsWith('+')) add++;
    else if (inHunk && l.startsWith('-')) del++;
  }
  return {
    status: /^new file mode/m.test(text) ? 'A' : /^deleted file mode/m.test(text) ? 'D' : 'M',
    add,
    del,
    binary: /^(Binary files |GIT binary patch)/m.test(text),
  };
}
/** A patch over CHANGES_MAX: whole files while they fit, one that does not left out (its path in `left`) and the rest
 *  still taken (2026-10-14: one big file first stopped every file after it). */
function capPatch(patch, left = []) {
  if (patch.length <= CHANGES_MAX) return { patch, truncated: left.length > 0, left };
  let kept = '';
  for (const c of splitPatch(patch)) {
    if (kept.length + c.text.length > CHANGES_MAX) left.push(c.path);
    else kept += c.text;
  }
  return { patch: kept, truncated: true, left };
}
/** git's patch read as it comes (2026-10-14): a file's whole while the patch so far fits in CHANGES_MAX, else only its
 *  path (`left`) — one file's diff of 33 MB went past the buffer's end and failed the whole changes tab. */
function gitPatch(cwd, args, opts = {}) {
  return new Promise((done, fail) => {
    const bin = findBin('git', "a chat's changes go unread");
    if (!bin) return fail(new Error('git is not installed'));
    const p = spawn(bin, ['-C', cwd, ...args], { env: opts.env || process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const left = [];
    let kept = '',
      cur = null,
      rest = '',
      skip = false,
      err = '';
    const close = () => {
      if (cur && !cur.over && kept.length + cur.text.length <= CHANGES_MAX) kept += cur.text;
      else if (cur) left.push(cur.path);
      cur = null;
    };
    const over = () => {
      if (cur) {
        cur.over = true;
        cur.text = '';
      }
    };
    const line = l => {
      if (l.startsWith('diff --git ')) {
        close();
        cur = { path: diffPath(l), text: '', over: false };
      }
      if (cur && !cur.over) {
        cur.text += l + '\n';
        if (kept.length + cur.text.length > CHANGES_MAX) over();
      }
    };
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    p.stdout.on('data', d => {
      // by lines; one longer than the whole cap is dropped as it comes, never held
      let i = 0,
        j;
      while ((j = d.indexOf('\n', i)) >= 0) {
        if (!skip) line(rest + d.slice(i, j));
        skip = false;
        rest = '';
        i = j + 1;
      }
      if (!skip) {
        rest += d.slice(i);
        if (rest.length > CHANGES_MAX) {
          over();
          rest = '';
          skip = true;
        }
      }
    });
    p.stderr.on('data', d => {
      err += d;
    });
    const timer = setTimeout(() => p.kill(), opts.timeout || 20_000);
    p.on('error', e => {
      clearTimeout(timer);
      fail(e);
    });
    p.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0)
        return fail(
          Object.assign(
            new Error(signal ? 'git diff took too long' : `git diff failed: ${err.trim().split('\n')[0]}`),
            { stderr: err },
          ),
        );
      if (rest && !skip) line(rest);
      close();
      done({ patch: kept, left: left.filter(Boolean) });
    });
  });
}
/** The PR's diff from GitHub — no checkout of its repo here, or git could not reach it: `why` says which. */
async function prFromGh(want, why, cwd) {
  const bin = ghBin();
  if (!bin || !want.url) return { error: why };
  let out;
  try {
    out = (await execFileP(bin, ['pr', 'diff', want.url, '--color', 'never'], { timeout: 30_000, maxBuffer: 32e6 }))
      .stdout;
  } catch (e) {
    return {
      error: `${why} — and gh pr diff: ${
        String(e.stderr || e.message)
          .trim()
          .split('\n')[0]
      }`,
    };
  }
  const files = splitPatch(out)
    .map(c => ({ path: c.path, ...patchStat(c.text) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const refs = prStatus.get(want.url)?.refs,
    { patch, truncated, left } = capPatch(out);
  return {
    cwd,
    root: null,
    branch: null,
    base: refs?.base ?? null,
    scope: 'pr',
    upstream: null,
    files,
    add: files.reduce((n, f) => n + f.add, 0),
    del: files.reduce((n, f) => n + f.del, 0),
    patch,
    truncated,
    left,
    pr: {
      n: want.n,
      url: want.url,
      head: refs?.headOid ?? null,
      headName: refs?.head ?? null,
      base: refs?.base ?? null,
      source: 'gh',
      why,
    },
  };
}
/** The changes of a chat's folder in one scope — or `{stat}` alone (the header's chip): the counts, no patch. `ask` is
 *  scope `pr`'s: `{pr, base}`. */
export async function changesOf(s, scope = 'uncommitted', statOnly = false, ask = {}) {
  const cwd = s.live?.cwd || s.cwd;
  const root = cwd && existsSync(cwd) ? await gitOr(cwd, ['rev-parse', '--show-toplevel']) : null;
  const want = scope === 'pr' && prAsked(ask.pr, root);
  if (scope === 'pr' && !want) return { error: 'which PR? — pr=<its number or URL>' };
  if (want && !root) return prFromGh(want, 'its folder is not a git checkout', cwd);
  if (want && !want.mine) return prFromGh(want, `it is not in this checkout's repo`, cwd);
  if (!cwd || !existsSync(cwd)) return { error: 'its folder is not there' };
  if (!root) return { error: 'its folder is not in a git repository' };
  const head = await gitOr(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  const branch = head
    ? await gitOr(root, ['rev-parse', '--abbrev-ref', 'HEAD'], 'HEAD')
    : await gitOr(root, ['symbolic-ref', '--short', 'HEAD'], 'HEAD');
  let base = null,
    from = head || EMPTY_TREE;
  if (scope === 'branch' && head) {
    base = await gitOr(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    for (const b of base ? [] : ['origin/main', 'origin/master', 'main', 'master'])
      if (b !== branch && (await gitOr(root, ['rev-parse', '--verify', '--quiet', b]))) {
        base = b;
        break;
      }
    const mb = base && (await gitOr(root, ['merge-base', 'HEAD', base]));
    if (mb) from = mb;
    else base = null;
  }
  let pr = null;
  if (want) {
    const refs = want.url && prStatus.get(want.url)?.refs; // its base as GitHub says it — a stacked PR's is another PR's branch
    pr = await prRange(root, want.n, ask.base || refs?.base);
    if (pr.error) return pr.gh && want.url ? prFromGh(want, pr.error, cwd) : { error: pr.error };
    Object.assign(pr, { url: want.url, headName: refs?.head ?? null, source: 'git' });
    from = pr.from;
    base = pr.base;
  }
  const range = pr ? [from, pr.head] : [from]; // a PR is between two commits; every other scope, a commit and the tree
  let paths = [];
  if (scope === 'turn') {
    // git names the root by its real path (/private/var/… for a /var/… folder): the files are made real to match
    const real = f => {
      try {
        return realpathSync(f);
      } catch {
        try {
          return join(realpathSync(dirname(f)), basename(f));
        } catch {
          return f;
        }
      }
    };
    paths = [...(s.turnFiles || [])]
      .map(f => relative(root, real(resolve(cwd, f))))
      .filter(f => f && !f.startsWith('..') && !isAbsolute(f));
    if (!paths.length)
      return {
        cwd,
        root,
        branch,
        scope,
        base,
        upstream: null,
        files: [],
        add: 0,
        del: 0,
        patch: '',
        truncated: false,
        note: 'nothing edited in its last turn',
      };
  }
  const only = paths.length ? ['--', ...paths.map(f => `:(literal)${f}`)] : []; // a name, never a glob: src/[id].tsx is not src/i.tsx (2026-10-14)
  const ix = pr ? null : await indexCopy(root); // a PR is two commits: no index read
  try {
    const [num, names, untracked] = await Promise.all([
      gitOut(root, ['diff', '--numstat', '-z', '--no-renames', ...range, ...only], ix?.opts),
      gitOut(root, ['diff', '--name-status', '-z', '--no-renames', ...range, ...only], ix?.opts),
      pr ? '' : gitOut(root, ['ls-files', '-z', '--others', '--exclude-standard', ...only], ix?.opts),
    ]);
    const stat = parseNumstat(num),
      status = parseNameStatus(names);
    const files = Object.entries(stat).map(([path, n]) => ({ path, status: status[path] || 'M', ...n }));
    const bodies = new Map();
    for (const path of untracked.split('\0').filter(Boolean).slice(0, 200)) {
      let body = '';
      try {
        const f = join(root, path);
        if (statSync(f).size < 1e6) body = readFileSync(f, 'utf8');
      } catch {}
      const binary = body.includes('\0');
      bodies.set(path, binary ? '' : body);
      files.push({
        path,
        status: 'A',
        add: binary || !body ? 0 : body.replace(/\n$/, '').split('\n').length,
        del: 0,
        binary,
        untracked: true,
      });
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    const add = files.reduce((n, f) => n + f.add, 0),
      del = files.reduce((n, f) => n + f.del, 0);
    if (statOnly) return { root, branch, add, del, files: files.length };
    const upName = head && !pr && (await gitOr(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']));
    const counts =
      upName &&
      (await gitOr(root, ['rev-list', '--left-right', '--count', '@{u}...HEAD'], '')).split(/\s+/).map(Number);
    const upstream = upName ? { name: upName, behind: counts?.[0] || 0, ahead: counts?.[1] || 0 } : null;
    // a/ and b/ whatever diff.noprefix or diff.mnemonicPrefix say; names with no octal where they need no quote
    let { patch, left } = await gitPatch(
      root,
      [
        '-c',
        'core.quotePath=false',
        'diff',
        '--no-renames',
        '--no-color',
        '--no-ext-diff',
        '--src-prefix=a/',
        '--dst-prefix=b/',
        '-U3',
        ...range,
        ...only,
      ],
      ix?.opts,
    );
    for (const [path, body] of bodies) if (body) patch += addedPatch(path, body);
    let truncated;
    ({ patch, truncated, left } = capPatch(patch, left));
    return {
      cwd,
      root,
      branch,
      base,
      scope,
      upstream,
      files,
      add,
      del,
      patch,
      truncated,
      left,
      ...(pr && {
        pr: {
          n: pr.n,
          url: pr.url,
          head: pr.head,
          headName: pr.headName,
          base: pr.base,
          baseOid: pr.baseOid,
          fetched: pr.fetched,
          source: 'git',
        },
      }),
    };
  } finally {
    ix?.drop();
  }
}
// The header's chip asks often (each open, each turn's end): the counts are kept a few seconds per folder.
const changeStats = new Map();
export async function changeStat(s) {
  const key = s.live?.cwd || s.cwd,
    hit = changeStats.get(key);
  if (hit && Date.now() - hit.at < 4000) return hit.v;
  const v = await changesOf(s, 'uncommitted', true).catch(e => ({ error: e.message }));
  changeStats.set(key, { at: Date.now(), v });
  return v;
}
// A checkout's working trees (2026-10-13), as `git worktree list --porcelain` says them: which branch each holds — the
// changes tab's PR picker and the PR rows say where a PR's branch lives; the editor opens the tree that has it.
export function parseWorktrees(text) {
  const out = [];
  for (const block of String(text).split(/\n\n+/)) {
    const w = {};
    for (const l of block.split('\n')) {
      const i = l.indexOf(' ');
      if (l) w[i < 0 ? l : l.slice(0, i)] = i < 0 ? true : l.slice(i + 1);
    }
    if (typeof w.worktree !== 'string') continue;
    out.push({
      path: w.worktree,
      head: typeof w.HEAD === 'string' ? w.HEAD : null,
      branch: typeof w.branch === 'string' ? w.branch.replace(/^refs\/heads\//, '') : null,
      detached: !!w.detached,
      bare: !!w.bare,
      prunable: !!w.prunable,
    });
  }
  return out;
}
/** The working trees of the checkout `cwd` is in: `here` its own, `main` the repo's first, `repo` its GitHub name; each
 *  tree's `modules` says whether it can run the repo's JavaScript — `here` (a node_modules of its own or linked), `same`
 *  (none, and its lockfile is the main tree's: a link to that one's would do), `differ`, or null (not a node project).
 *  A tree whose folder was deleted by hand (git's `prunable`) is none of them (2026-10-14): it is `gone`, where git
 *  still holds its branch. */
export async function worktreesFor(cwd) {
  if (!cwd || !existsSync(cwd)) return { error: 'its folder is not there' };
  const here = await gitOr(cwd, ['rev-parse', '--show-toplevel']);
  if (!here) return { error: 'its folder is not in a git repository' };
  const all = parseWorktrees(await gitOut(here, ['worktree', 'list', '--porcelain'])).filter(w => !w.bare),
    list = all.filter(w => !w.prunable);
  const own = ghRepoOf(here),
    main = list[0]?.path || here;
  const lock = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].find(f => existsSync(join(main, f)));
  const mainLock = lock && existsSync(join(main, 'node_modules')) && (await gitOr(main, ['rev-parse', `HEAD:${lock}`]));
  for (const w of list) {
    if (w.path === main || !existsSync(join(w.path, 'package.json'))) w.modules = null;
    else if (existsSync(join(w.path, 'node_modules'))) w.modules = 'here';
    else w.modules = mainLock && (await gitOr(w.path, ['rev-parse', `HEAD:${lock}`])) === mainLock ? 'same' : 'differ';
    if (worktreesMade[w.path]) w.made = true;
  }
  return {
    here,
    main,
    repo: own ? `${own.owner}/${own.name}` : null,
    dflt: await originDefault(main),
    worktrees: list,
    gone: all.filter(w => w.prunable),
  };
}
/** What stops a branch whose tree was deleted by hand — git still holds it out there, and refuses it anywhere else. */
export const goneSay = (branch, w) => {
  const g = w.gone?.find(x => x.branch === branch);
  return g && `${branch} is out in ${tildePath(g.path)}, a folder deleted by hand — git worktree prune lets it go`;
};
/** Where a branch named for a new chat already is (2026-10-13; ⌥⌘N's worktree switch, as its name is typed): `ok` false
 *  for a name git would refuse; else `local` / `origin` (as this checkout last heard it — no network), and the tree that
 *  has it out (`tree`; `main` when that is the repo's own folder) with how many live chats work there. */
export async function branchWhere(cwd, name) {
  const w = await worktreesFor(cwd);
  if (w.error) return w;
  if (!(await branchNameOk(w.main, name))) return { name, ok: false, dflt: w.dflt };
  const [local, origin] = await Promise.all(
    [`refs/heads/${name}`, `refs/remotes/origin/${name}`].map(r =>
      gitOr(w.main, ['rev-parse', '--verify', '--quiet', r]),
    ),
  );
  const t = w.worktrees.find(x => x.branch === name),
    gone = !t && goneSay(name, w);
  if (gone) return { error: gone };
  const live = t ? [...sessions.values()].filter(s => s.alive && treeOf(s.live?.cwd || s.cwd) === t.path).length : 0;
  return {
    name,
    ok: true,
    local: !!local,
    origin: !!origin,
    tree: t?.path ?? null,
    main: !!t && t.path === w.main,
    live,
    dflt: w.dflt,
  };
}
/** What a new chat's branch may start from (2026-10-28; ⌥⌘N's base step): the checkout's branches and origin's as last
 *  fetched (no network), newest first — a branch here at origin's commit adds nothing and is left out. `prefer` is the
 *  row ⏎ takes: origin's default branch, or this checkout's when it is ahead of origin's (its own commits not pushed
 *  yet); the default branch's rows lead, that one first. Only names a base may be (baseOk). */
export async function worktreeBases(cwd) {
  const w = await worktreesFor(cwd);
  if (w.error) return w;
  const out = await gitOut(w.main, [
    'for-each-ref',
    '--sort=-committerdate',
    '--count=400',
    '--format=%(refname)%09%(objectname)%09%(committerdate:iso-strict)',
    'refs/heads',
    'refs/remotes/origin',
  ]);
  const remotes = (await gitOr(w.main, ['remote'], '')).split('\n').filter(Boolean),
    all = [];
  for (const l of out.split('\n')) {
    const [ref, oid, at] = l.split('\t'),
      m = /^refs\/(heads|remotes\/origin)\/(.+)$/.exec(ref || '');
    if (!m || m[2] === 'HEAD' || !baseName(m[2], remotes)) continue;
    const where = m[1] === 'heads' ? 'local' : 'origin';
    all.push({ name: where === 'local' ? m[2] : `origin/${m[2]}`, branch: m[2], ref, where, at: at || null, oid });
  }
  const theirs = new Map(all.filter(b => b.where === 'origin').map(b => [b.branch, b.oid]));
  const list = all.filter(b => b.where === 'origin' || theirs.get(b.branch) !== b.oid);
  const here = list.find(b => b.where === 'local' && b.branch === w.dflt),
    there = list.find(b => b.where === 'origin' && b.branch === w.dflt);
  const ahead =
    here && there && (await gitOr(w.main, ['merge-base', '--is-ancestor', there.ref, here.ref], false)) !== false;
  const first = here && (!there || ahead) ? here : there || list[0] || null;
  const lead = [first, here, there].filter((b, i, a) => b && a.indexOf(b) === i);
  const branches = [...lead, ...list.filter(b => !lead.includes(b))].slice(0, 200).map(({ branch, ...b }) => b);
  return { dflt: w.dflt, prefer: first?.ref ?? null, branches };
}
/** A branch's name as a base may be one: the board's rule for a branch it makes, without asking git (baseOk does). */
const baseName = (name, remotes) =>
  BRANCH_NAME.test(name) &&
  !/^(refs|heads|remotes|tags)\//.test(name) &&
  !/^[A-Z_]*HEAD$/.test(name) &&
  !remotes.some(r => name.startsWith(`${r}/`));
/** A base asked for (2026-10-28): a full ref, this checkout's branch or origin's, that names a commit here. */
export async function baseOk(main, ref) {
  const m = /^refs\/(heads|remotes\/origin)\/(.+)$/.exec(String(ref));
  return (
    !!m &&
    m[2] !== 'HEAD' &&
    (await branchNameOk(main, m[2])) &&
    !!(await gitOr(main, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]))
  );
}
/** A name the board may make a branch of (2026-10-14): git's rule, and none that another ref would answer to as well —
 *  `origin/main` made refs/heads/origin/main, after which origin/main named it, not origin's, for every command in the
 *  repo. Never a remote's name and a slash, refs/ heads/ remotes/ tags/, HEAD or one of git's other *HEADs. */
export async function branchNameOk(main, name) {
  if (!BRANCH_NAME.test(name) || /^(refs|heads|remotes|tags)\//.test(name) || /^[A-Z_]*HEAD$/.test(name)) return false;
  if ((await gitOr(main, ['check-ref-format', '--branch', name])) === null) return false;
  return !(await gitOr(main, ['remote'], '')).split('\n').some(r => r && name.startsWith(`${r}/`));
}
