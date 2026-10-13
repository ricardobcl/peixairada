// The editor at a branch (2026-10-13): a PR's branch on disk without moving the branch under the folder's chats — the
// tree that has it, else one made inside the repo (`.claude/worktrees/<slug>`), tracking origin's branch, or detached
// for a fork's PR or review only; node_modules linked when the lockfiles match; the trees made removed only once their
// PR is merged or closed and nothing holds them; and when the folder itself may be switched. Temp repos throughout: a
// bare origin with PRs as GitHub keeps them (refs/pull/<n>/head), a checkout of it that reads as acme/widgets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-wt-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
process.env.GIT_CONFIG_GLOBAL = '/dev/null'; process.env.GIT_CONFIG_NOSYSTEM = '1';   // no global ignore file: the board's own exclude is what keeps the trees out of status
const { ensureWorktree, linkModules, newSession, prRefs, projectDir, sessions, setPrInfo, summary, sweepWorktrees, switchGuard, worktreesFor, worktreesMade } = await import('../server.mjs');

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe', env }).toString().trim();
const origin = join(tmp, 'origin.git'), seed = join(tmp, 'seed'), co = join(tmp, 'widgets');
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env });
execFileSync('git', ['init', '-q', '-b', 'main', seed], { env });
writeFileSync(join(seed, 'package.json'), '{ "name": "widgets" }\n'); writeFileSync(join(seed, 'package-lock.json'), '{ "lockfileVersion": 3 }\n');
writeFileSync(join(seed, '.gitignore'), 'node_modules/\n'); writeFileSync(join(seed, 'a.js'), 'a\n');
git(seed, 'add', '.'); git(seed, 'commit', '-qm', 'base'); git(seed, 'push', '-q', origin, 'main');
const branch = (name, n, file, { pushBranch = true } = {}) => {
  git(seed, 'checkout', '-q', '-b', name, 'main'); writeFileSync(join(seed, file), name + '\n'); git(seed, 'add', '.'); git(seed, 'commit', '-qm', name);
  git(seed, 'push', '-q', origin, `${name}:refs/pull/${n}/head`, ...pushBranch ? [`${name}:refs/heads/${name}`] : []);
  return git(seed, 'rev-parse', 'HEAD');
};
branch('feat/a', 21, 'a2.js'); branch('feat/b', 22, 'b.js'); const fork = branch('fork-main', 23, 'f.js', { pushBranch: false });
execFileSync('git', ['clone', '-q', '--no-local', '--config', `url.${origin}.insteadOf=https://github.com/acme/widgets`, 'https://github.com/acme/widgets', co], { stdio: 'pipe', env });
git(co, 'checkout', '-q', 'feat/b'); mkdirSync(join(co, 'node_modules', 'x'), { recursive: true });
const real = git(co, 'rev-parse', '--show-toplevel'), wt = n => join(real, '.claude', 'worktrees', n);
const url = n => `https://github.com/acme/widgets/pull/${n}`;
const refs = (head, fork = false) => prRefs({ headRefName: head, baseRefName: 'main', headRefOid: null, isCrossRepository: fork });
const folder = () => ({ head: git(co, 'rev-parse', 'HEAD'), branch: git(co, 'branch', '--show-current'), status: git(co, 'status', '--porcelain') });
const before = folder();

test('a PR\'s branch: the tree that has it, else one made inside the repo, tracking origin\'s', async () => {
  assert.match((await ensureWorktree({ cwd: co, pr: url(21) })).error, /not known yet/, 'no branch name until GitHub answered');
  setPrInfo(url(21), 'open', 'A', null, Date.now(), undefined, false, null, null, refs('feat/a'));
  const a = await ensureWorktree({ cwd: co, pr: url(21) });
  assert.deepEqual([a.path, a.branch, a.made], [wt('feat-a'), 'feat/a', true]);
  assert.equal(git(a.path, 'rev-parse', '--abbrev-ref', '@{u}'), 'origin/feat/a', 'tracking origin’s branch');
  assert.deepEqual(worktreesMade[a.path].branch, 'feat/a'); assert.equal(worktreesMade[a.path].pr, url(21));
  assert.deepEqual(folder(), before, 'the folder’s branch and tree untouched');
  assert.equal(existsSync(join(co, '.git', 'FETCH_HEAD')), false, 'no FETCH_HEAD');
  assert.equal(git(co, 'status', '--porcelain', '--ignored=no'), '', 'the tree is out of the repo’s own status (info/exclude)');
  assert.deepEqual(await ensureWorktree({ cwd: co, pr: url(21) }), { path: a.path, branch: 'feat/a', made: false, here: false }, 'asked again: the same tree');
  // the folder's own branch: the folder itself, never "already checked out"
  setPrInfo(url(22), 'open', 'B', null, Date.now(), undefined, false, null, null, refs('feat/b'));
  assert.deepEqual(await ensureWorktree({ cwd: co, pr: url(22) }), { path: real, branch: 'feat/b', made: false, here: true });
  // from inside the worktree, the same list
  assert.deepEqual((await ensureWorktree({ cwd: a.path, pr: url(22) })).path, real);
  assert.match((await ensureWorktree({ cwd: co, branch: 'no/such' })).error, /no branch no\/such here, nor on origin/);
  assert.match((await ensureWorktree({ cwd: co, pr: 'https://github.com/acme/gadgets/pull/1' })).error, /not in this checkout's repo \(acme\/widgets\)/);
});

test('a fork\'s PR, or one asked for review only, is detached at its head; a new branch starts from origin\'s main', async () => {
  setPrInfo(url(23), 'open', 'Fork', null, Date.now(), undefined, false, null, null, refs('main', true));   // a fork's branch named main means nothing here
  const f = await ensureWorktree({ cwd: co, pr: url(23) });
  assert.deepEqual([f.path, f.branch, f.detached, f.made], [wt('pr-23'), null, true, true]);
  assert.equal(git(f.path, 'rev-parse', 'HEAD'), fork); assert.throws(() => git(f.path, 'symbolic-ref', '-q', 'HEAD'), 'detached');
  const r = await ensureWorktree({ cwd: co, pr: url(21), detach: true });
  assert.deepEqual([r.path, r.detached], [wt('pr-21'), true], 'review only: a tree of its own beside the branch’s');
  assert.equal((await ensureWorktree({ cwd: co, pr: url(21), detach: true })).made, false, 'and found again');
  const n = await ensureWorktree({ cwd: co, branch: 'feat/new', fresh: true });
  assert.deepEqual([n.path, n.branch, n.made], [wt('feat-new'), 'feat/new', true]);
  assert.equal(git(n.path, 'rev-parse', 'HEAD'), git(co, 'rev-parse', 'origin/main'), 'from origin’s main');
  assert.throws(() => git(n.path, 'rev-parse', '--abbrev-ref', '@{u}'), 'tracking nothing — a push names its own');
});

test('node_modules: linked to the main tree\'s when the lockfiles match, never installed', async () => {
  const w = await worktreesFor(wt('feat-a'));
  assert.deepEqual(w.worktrees.map(t => [t.path, t.branch, t.modules, !!t.made]), [[real, 'feat/b', null, false], [wt('feat-a'), 'feat/a', 'same', true], [wt('feat-new'), 'feat/new', 'same', true], [wt('pr-21'), null, 'same', true], [wt('pr-23'), null, 'same', true]]);
  assert.deepEqual(await linkModules(wt('feat-a')), { ok: true, path: wt('feat-a') });
  assert.ok(lstatSync(join(wt('feat-a'), 'node_modules')).isSymbolicLink());
  assert.match((await linkModules(wt('feat-a'))).error, /has a node_modules already/);
  assert.match((await linkModules(real)).error, /not a worktree/);
});

test('the sweep removes a tree it made once its PR is merged or closed and nothing holds it — never by force', async () => {
  setPrInfo(url(21), 'merged', 'A', null, Date.now(), undefined, false, null, null, refs('feat/a'));
  writeFileSync(join(wt('feat-a'), 'a.js'), 'changed\n');                          // a change not committed
  git(wt('pr-21'), 'commit', '--allow-empty', '-qm', 'mine');                         // a commit no remote has
  assert.deepEqual(await sweepWorktrees(), [], 'both kept');
  assert.ok(existsSync(wt('feat-a')) && existsSync(wt('pr-21')));
  git(wt('feat-a'), 'checkout', '--', 'a.js');
  assert.deepEqual(await sweepWorktrees(), [wt('feat-a')], 'clean now: removed');
  assert.equal(existsSync(wt('feat-a')), false); assert.equal(worktreesMade[wt('feat-a')], undefined);
  assert.ok(existsSync(join(co, 'node_modules', 'x')), 'the main tree’s node_modules, which it linked to, untouched');
  // a chat in it holds it; a PR still open, a tree the board did not make, are never touched
  setPrInfo(url(23), 'closed', 'Fork', null, Date.now(), undefined, false, null, null, refs('main', true));
  const s = newSession(randomUUID(), null); s.alive = true; s.live = { cwd: wt('pr-23') }; sessions.set(s.id, s);
  assert.deepEqual(await sweepWorktrees(), [], 'a live chat in pr-23');
  sessions.delete(s.id);
  assert.deepEqual(await sweepWorktrees(), [wt('pr-23')]);
  assert.ok(existsSync(wt('pr-21')) && existsSync(wt('feat-new')) && existsSync(real));
});

test('the folder\'s own branch switched only when nothing else works there — said, not done', async () => {
  const s = newSession(randomUUID(), null); s.cwd = co; sessions.set(s.id, s);
  assert.deepEqual(await switchGuard(s, 'feat/b'), { ok: false, why: ['it is on feat/b already'] });
  assert.deepEqual(await switchGuard(s, 'feat/a'), { ok: true, why: [], branch: 'feat/a', tree: real });
  const o = newSession(randomUUID(), null); o.cwd = join(co, 'node_modules'); o.alive = true; o.live = { cwd: co }; o.title = 'Other work'; sessions.set(o.id, o);
  const n = newSession(randomUUID(), null); n.alive = true; n.live = { cwd: wt('feat-new') }; sessions.set(n.id, n);   // a chat in a worktree inside it is not in it
  writeFileSync(join(co, 'a.js'), 'dirty\n');
  assert.deepEqual((await switchGuard(s, 'feat/a')).why, ['another chat works here — Other work', '1 file is not committed']);
  assert.deepEqual(folder().branch, 'feat/b', 'nothing switched');
  for (const x of [s, o, n]) sessions.delete(x.id);
});

test('a chat in a worktree inside the repo is the repo\'s, with the branch it is on', () => {
  assert.equal(projectDir('/c/widgets/.claude/worktrees/feat-x'), '/c/widgets');
  assert.equal(projectDir('/c/widgets/.claude/worktrees/feat-x/src'), '/c/widgets');
  assert.equal(projectDir('/c/widgets-feat-x'), '/c/widgets-feat-x', 'one beside the repo is its own folder');
  assert.equal(projectDir('/c/widgets'), '/c/widgets');
  const s = newSession(randomUUID(), null); s.cwd = wt('feat-new');
  assert.deepEqual([summary(s).project, summary(s).worktree], ['widgets', { name: 'feat-new', branch: 'feat/new' }], 'the branch the board made it on, before Claude Code says one');
  s.gitBranch = 'feat/renamed';
  assert.deepEqual(summary(s).worktree, { name: 'feat-new', branch: 'feat/renamed' }, 'then the one Claude Code saw');
  s.alive = true; s.headNow = 'feat/now';
  assert.deepEqual(summary(s).worktree, { name: 'feat-new', branch: 'feat/now' }, 'and while it runs, its HEAD as the poll read it');
  s.alive = false;
  const plain = newSession(randomUUID(), null); plain.cwd = co;
  assert.deepEqual([summary(plain).project, summary(plain).worktree], ['widgets', null]);
});
