// The editor at a branch (2026-10-13): a PR's branch on disk without moving the branch under the folder's chats — the
// tree that has it, else one made inside the repo (`.claude/worktrees/<slug>`), tracking origin's branch, or detached
// for a fork's PR or review only; node_modules linked when the lockfiles match; the trees made removed only once their
// PR is merged or closed and nothing holds them; and when the folder itself may be switched. A new chat's branch
// (⌥⌘N's new worktree): where it is already, a tree out shared only when asked, and its tree removed once the PR opened
// from it is merged or its commits are on origin's main. Temp repos throughout: a bare origin with PRs as GitHub keeps
// them (refs/pull/<n>/head), a checkout of it that reads as acme/widgets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-wt-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
process.env.GIT_CONFIG_GLOBAL = '/dev/null'; process.env.GIT_CONFIG_NOSYSTEM = '1';   // no global ignore file: the board's own exclude is what keeps the trees out of status
const { branchWhere, ensureWorktree, folderBack, linkModules, newSession, prRefs, projectDir, putBack, sessions, setPrInfo, summary, sweepWorktrees, switchGuard, worktreesFor, worktreesMade } = await import('../server.mjs');

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
branch('feat/a', 21, 'a2.js'); branch('feat/b', 22, 'b.js'); const fork = branch('fork-main', 23, 'f.js', { pushBranch: false }); branch('feat/old', 24, 'o.js'); branch('feat/d', 25, 'd.js');
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
  git(co, 'config', 'status.showUntrackedFiles', 'no'); writeFileSync(join(wt('feat-a'), 'notes.md'), 'never added\n');   // (2026-10-14) status told to hide such a file
  assert.deepEqual(await sweepWorktrees(), [], 'a file never added: kept, whatever status.showUntrackedFiles says');
  assert.ok(existsSync(join(wt('feat-a'), 'notes.md')));
  rmSync(join(wt('feat-a'), 'notes.md'));
  assert.deepEqual(await sweepWorktrees(), [wt('feat-a')], 'clean now: removed');
  git(co, 'config', '--unset', 'status.showUntrackedFiles');
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

test('a tree made for a PR merged or closed already is a look at it: kept, until the sweep sees the PR open again (2026-10-14)', async () => {
  setPrInfo(url(24), 'merged', 'Old', null, Date.now(), undefined, false, null, null, refs('feat/old'));
  const t = await ensureWorktree({ cwd: co, pr: url(24) });                         // Editor ▾ on a merged PR's row
  assert.deepEqual([t.path, t.made, worktreesMade[t.path].prState], [wt('feat-old'), true, 'merged']);
  assert.deepEqual(await sweepWorktrees(), [], 'merged before it was made: kept');
  assert.ok(existsSync(t.path));
  setPrInfo(url(24), 'open', 'Old', null, Date.now(), undefined, false, null, null, refs('feat/old'));   // reopened
  assert.deepEqual(await sweepWorktrees(), []);
  setPrInfo(url(24), 'closed', 'Old', null, Date.now(), undefined, false, null, null, refs('feat/old'));
  assert.deepEqual(await sweepWorktrees(), [t.path], 'closed after the sweep saw it open: removed');
});

test('a tree on another branch, or detached at another commit, than it was made for is kept when its PR is done (2026-10-14)', async () => {
  setPrInfo(url(25), 'open', 'D', null, Date.now(), undefined, false, null, null, refs('feat/d'));
  const t = (await ensureWorktree({ cwd: co, pr: url(25) })).path, r = (await ensureWorktree({ cwd: co, pr: url(25), detach: true })).path;
  git(t, 'switch', '-q', '-c', 'followup');                                          // the next piece of work, started there after the merge
  git(r, 'checkout', '-q', '--detach', 'HEAD~1');                                    // a review tree moved to look at the commit before
  setPrInfo(url(25), 'merged', 'D', null, Date.now(), undefined, false, null, null, refs('feat/d'));
  assert.deepEqual(await sweepWorktrees(), [], 'both kept');
  git(t, 'switch', '-q', 'feat/d'); git(r, 'checkout', '-q', '--detach', worktreesMade[r].head);
  assert.deepEqual((await sweepWorktrees()).sort(), [t, r].sort(), 'back where they were made: removed');
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

test('a new chat\'s branch: where it is already, and a tree that has it out shared only when asked', async () => {
  git(seed, 'push', '-q', origin, 'main:refs/heads/feat/c'); git(co, 'fetch', '-q', 'origin');
  assert.deepEqual(await branchWhere(co, 'feat/brand-new'), { name: 'feat/brand-new', ok: true, local: false, origin: false, tree: null, main: false, live: 0, dflt: 'main' });
  assert.equal((await branchWhere(co, 'feat/x.lock')).ok, false, 'git’s own rule');
  assert.equal((await branchWhere(co, '--force')).ok, false, 'never an option');
  for (const name of ['origin/main', 'refs/heads/x', 'remotes/origin/x', 'HEAD', 'ORIG_HEAD']) {   // (2026-10-14) a name another ref answers to as well
    assert.equal((await branchWhere(co, name)).ok, false, name);
    assert.equal((await ensureWorktree({ cwd: co, branch: name, fresh: true })).code, 400, name);
  }
  assert.equal(git(co, 'for-each-ref', 'refs/heads/origin', 'refs/heads/refs', 'refs/heads/remotes'), '', 'no branch made that shadows another ref');
  assert.deepEqual(await branchWhere(co, 'feat/c').then(b => [b.local, b.origin, b.tree]), [false, true, null], 'origin’s, as last fetched');
  assert.deepEqual(await branchWhere(co, 'feat/b').then(b => [b.tree, b.main]), [real, true], 'the folder’s own');
  assert.deepEqual(await branchWhere(wt('feat-new'), 'feat/new').then(b => [b.tree, b.main, b.local]), [wt('feat-new'), false, true], 'out in a tree the board made — asked from inside it too');
  const s = newSession(randomUUID(), null); s.alive = true; s.live = { cwd: join(wt('feat-new'), 'src') }; sessions.set(s.id, s);
  assert.equal((await branchWhere(co, 'feat/new')).live, 1, 'a chat at work there');
  sessions.delete(s.id);
  const out = await ensureWorktree({ cwd: co, branch: 'feat/new', fresh: true });
  assert.deepEqual([out.code, out.out, out.path], [409, true, wt('feat-new')]); assert.match(out.error, /feat\/new is out in .*feat-new already/);
  assert.equal((await ensureWorktree({ cwd: co, branch: 'feat/new', fresh: true, share: true })).path, wt('feat-new'), 'asked for: that tree');
  const c = await ensureWorktree({ cwd: co, branch: 'feat/c', fresh: true });
  assert.deepEqual([c.path, c.made, git(c.path, 'rev-parse', '--abbrev-ref', '@{u}')], [wt('feat-c'), true, 'origin/feat/c'], 'origin’s branch: a tree of its own, tracking it');
});

test('a new branch\'s tree goes once the PR opened from it is merged, or its commits are on origin\'s main — one with nothing done in it stays', async () => {
  const t = wt('feat-new');
  writeFileSync(join(t, 'n.js'), 'n\n'); git(t, 'add', '.'); git(t, 'commit', '-qm', 'n'); git(t, 'push', '-q', 'origin', 'feat/new');
  assert.deepEqual(await sweepWorktrees(), [], 'no PR from it, nothing on main: kept');
  setPrInfo(url(30), 'merged', 'Old', null, Date.now(), undefined, false, '2020-01-01T00:00:00Z', null, refs('feat/new'));
  assert.deepEqual(await sweepWorktrees(), [], 'a PR of that name merged before the tree was made is not its');
  assert.equal(worktreesMade[t].pr, null);
  setPrInfo(url(31), 'open', 'New', null, Date.now(), undefined, false, new Date().toISOString(), null, refs('feat/new'));
  assert.deepEqual(await sweepWorktrees(), []);
  assert.equal(worktreesMade[t].pr, url(31), 'the PR opened from it, kept as its own');
  setPrInfo(url(31), 'merged', 'New', null, Date.now(), undefined, false, null, null, refs('feat/new'));
  assert.deepEqual(await sweepWorktrees(), [t], 'merged: removed');
  // merged with no PR the board knows of: its commits on origin's main
  const l = await ensureWorktree({ cwd: co, branch: 'feat/landed', fresh: true });
  writeFileSync(join(l.path, 'l.js'), 'l\n'); git(l.path, 'add', '.'); git(l.path, 'commit', '-qm', 'l');
  assert.deepEqual(await sweepWorktrees(), [], 'a commit no remote has: kept');
  git(l.path, 'push', '-q', 'origin', 'HEAD:main'); git(co, 'fetch', '-q', 'origin');
  assert.deepEqual(await sweepWorktrees(), [l.path], 'on origin’s main: removed');
  assert.ok(existsSync(wt('feat-c')), 'nothing done in it: it stays');
  // (2026-10-14) brought up to origin's main by a pull, nothing of its own: nothing done in it either
  const p = await ensureWorktree({ cwd: co, branch: 'feat/pulled', fresh: true });
  git(seed, 'fetch', '-q', origin, 'main'); git(seed, 'checkout', '-q', '-B', 'up', 'FETCH_HEAD'); writeFileSync(join(seed, 'up.js'), 'up\n');
  git(seed, 'add', '.'); git(seed, 'commit', '-qm', 'someone else’s'); git(seed, 'push', '-q', origin, 'up:main');
  git(p.path, 'pull', '-q', '--ff-only', 'origin', 'main');
  assert.notEqual(git(p.path, 'rev-parse', 'HEAD'), worktreesMade[p.path].head);
  assert.deepEqual(await sweepWorktrees(), [], 'only pulled: it stays');
  assert.ok(existsSync(p.path));
});

// A repo at CLAUDE_DIR (~/.claude kept in git) or at the home above it: a tree made inside it would be under ~/.claude,
// which the board never writes (2026-10-14).
test('no tree is made under CLAUDE_DIR', async () => {
  const claude = process.env.CLAUDE_DIR;
  execFileSync('git', ['clone', '-q', '--no-local', origin, claude], { stdio: 'pipe', env });
  const r = await ensureWorktree({ cwd: claude, branch: 'feat/fresh', fresh: true });
  assert.equal(r.code, 409); assert.match(r.error, /the board writes nothing there/);
  assert.equal(existsSync(join(claude, '.claude')), false, 'nothing made');
  assert.equal(git(claude, 'worktree', 'list').split('\n').length, 1);
});

test('a branch whose tree was deleted by hand is said so, never handed back as its tree (2026-10-14)', async () => {
  const gone = join(tmp, 'gone-tree'); git(co, 'worktree', 'add', '-q', '-b', 'feat/gone', gone); rmSync(gone, { recursive: true, force: true });
  assert.equal((await worktreesFor(co)).worktrees.some(t => t.branch === 'feat/gone'), false, 'not among the trees');
  const r = await ensureWorktree({ cwd: co, branch: 'feat/gone' });
  assert.deepEqual([r.code, r.path], [409, undefined]); assert.match(r.error, /^feat\/gone is out in .*gone-tree, a folder deleted by hand/);
  assert.match((await branchWhere(co, 'feat/gone')).error, /deleted by hand/);
});

// A chat's worktree gone — the sweep after its PR merged, worktree.sh done, by hand — and the chat resumed (2026-10-19):
// the tree made again at its own path, on the chat's branch as it stands, else made anew from whichever main is ahead,
// this checkout's or origin's; a branch out in another tree is that tree; a folder gone inside the checkout itself
// starts in the nearest folder of it left.
test('a chat\'s worktree gone is made again for its resume, a folder gone in the checkout is the nearest one left (2026-10-19)', async () => {
  const chat = branch => Object.assign(newSession(randomUUID(), null), { gitBranch: branch });
  const head = r => git(co, 'rev-parse', r);
  // its branch still here: the tree on it again, the folder it was in the nearest there is of it
  git(co, 'worktree', 'add', '-q', '-b', 'feat/again', wt('again'), 'main'); git(co, 'worktree', 'remove', wt('again'));
  const gone = Object.assign(newSession(randomUUID(), null), { cwd: join(wt('again'), 'src'), gitBranch: 'feat/again' });
  assert.deepEqual(summary(gone).back, { tree: wt('again'), repo: real }, 'the summary says the resume makes it again');
  assert.deepEqual(await putBack(gone.cwd, gone), { cwd: wt('again'), tree: wt('again'), branch: 'feat/again', made: true });
  assert.equal(git(wt('again'), 'branch', '--show-current'), 'feat/again');
  assert.deepEqual([worktreesMade[wt('again')].branch, worktreesMade[wt('again')].pr], ['feat/again', null], 'the board’s to sweep as any it made');
  assert.deepEqual(summary(gone).back, { near: wt('again') }, 'the tree there now, its src not: a resume starts in the tree');
  // its branch gone after it landed: a new one of that name, from the main that is ahead
  git(co, 'update-ref', 'refs/heads/main', git(co, 'commit-tree', '-p', 'origin/main', '-m', 'landed here first', 'origin/main^{tree}'));
  assert.deepEqual(await putBack(wt('landed'), chat('feat/landed-here')), { cwd: wt('landed'), tree: wt('landed'), branch: 'feat/landed-here', made: true });
  assert.equal(git(wt('landed'), 'rev-parse', 'HEAD'), head('main'), 'this checkout’s main, ahead of origin’s');
  assert.throws(() => git(wt('landed'), 'rev-parse', '--abbrev-ref', '@{u}'), 'tracking nothing');
  git(co, 'update-ref', 'refs/heads/main', head('origin/main~1'));
  await putBack(wt('behind'), chat('feat/behind'));
  assert.equal(git(wt('behind'), 'rev-parse', 'HEAD'), head('origin/main'), 'origin’s, when this checkout’s main is behind it');
  // deleted by hand: git still holds that path and its branch — taken back
  rmSync(wt('again'), { recursive: true, force: true });
  assert.deepEqual(await putBack(wt('again'), chat('feat/again')), { cwd: wt('again'), tree: wt('again'), branch: 'feat/again', made: true });
  assert.equal(git(wt('again'), 'branch', '--show-current'), 'feat/again');
  // its branch out in another tree: that tree, nothing made
  assert.deepEqual(await putBack(wt('elsewhere'), chat('feat/b')), { cwd: real, tree: real, branch: 'feat/b', made: false });
  assert.equal(existsSync(wt('elsewhere')), false);
  // detached: detached again, at the main ahead
  const d = await putBack(wt('looked'), chat('HEAD'));
  assert.deepEqual([d.branch, d.made, git(wt('looked'), 'rev-parse', 'HEAD')], [null, true, head('origin/main')]);
  assert.throws(() => git(wt('looked'), 'symbolic-ref', '-q', 'HEAD'), 'detached');
  // not a worktree: the nearest folder of the checkout left; in no checkout, nowhere
  assert.deepEqual(await putBack(join(co, 'gone', 'deeper'), chat('feat/b')), { cwd: co });
  assert.equal(folderBack(join(tmp, 'nowhere', 'x')), null);
  assert.equal(folderBack(co), null, 'a folder that is there');
});
