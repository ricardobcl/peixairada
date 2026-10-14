// What a chat changed (2026-10-10): the changes tab reads git in the chat's folder — the working tree against HEAD,
// untracked files too; the branch against where it left its base; or only the files the last turn edited. The
// parsers alone, then a real repo in a temp dir: a commit on main, a branch with a commit of its own, an edit, a new
// file, and a transcript whose last turn edited one of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { addedPatch, changesOf, fold, newSession, parseNameStatus, parseNumstat, parseWorktrees, patchStat, prRefs, setPrInfo, splitPatch, worktreesFor } from '../server.mjs';
import { tmpDir } from '../lib/testserver.mjs';

test('the parsers: numstat, name-status, a patch split by file, an untracked file as added', () => {
  assert.deepEqual(parseNumstat('3\t1\tsrc/a.js\0-\t-\timg.png\0'), { 'src/a.js': { add: 3, del: 1, binary: false }, 'img.png': { add: 0, del: 0, binary: true } });
  assert.deepEqual(parseNameStatus('M\0src/a.js\0A\0new.txt\0D\0old.txt\0'), { 'src/a.js': 'M', 'new.txt': 'A', 'old.txt': 'D' });
  const p = 'diff --git a/x.js b/x.js\nindex 1..2\n--- a/x.js\n+++ b/x.js\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/y z.md b/y z.md\n--- a/y z.md\n+++ b/y z.md\n@@ -1 +1 @@\n-c\n+d\n';
  assert.deepEqual(splitPatch(p).map(c => c.path), ['x.js', 'y z.md']);
  // (2026-10-14) heads git quoted — a `"`, UTF-8 in octal —, and a name with " b/" in it
  const q = 'diff --git "a/say \\"hi\\".txt" "b/say \\"hi\\".txt"\n@@ -1 +1 @@\n-a\n+b\ndiff --git "a/a\\303\\247a\\303\\255.md" "b/a\\303\\247a\\303\\255.md"\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/x b/y b/x b/y\n@@ -1 +1 @@\n-a\n+b\n';
  assert.deepEqual(splitPatch(q).map(c => c.path), ['say "hi".txt', 'açaí.md', 'x b/y']);
  assert.ok(splitPatch(p)[0].text.endsWith('+b\n'));
  assert.equal(addedPatch('n.txt', 'one\ntwo\n'), 'diff --git a/n.txt b/n.txt\nnew file\n--- /dev/null\n+++ b/n.txt\n@@ -0,0 +1,2 @@\n+one\n+two\n');
  assert.match(addedPatch('n.txt', 'a\nb\nc\n', 2), /@@ -0,0 \+1,2 @@\n\+a\n\+b\n\\ 1 more lines/);
});

test('a chat\'s changes in its three scopes, from a real repo', async () => {
  const repo = tmpDir('peix-chg-');
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString();
  g('init', '-q', '-b', 'main');
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'a.js'), 'one\ntwo\nthree\n'); writeFileSync(join(repo, 'b.md'), '# b\n');
  g('add', '.'); g('commit', '-q', '-m', 'base');
  g('checkout', '-q', '-b', 'feature');
  writeFileSync(join(repo, 'b.md'), '# b\nmore\n'); g('commit', '-qam', 'on the branch');
  writeFileSync(join(repo, 'src', 'a.js'), 'one\n2\nthree\nfour\n');   // edited, not committed
  writeFileSync(join(repo, 'new.txt'), 'fresh\nlines\n');               // untracked

  // a chat in src/ whose last turn edited a.js
  const s = newSession(randomUUID(), null); s.loaded = false;
  const at = n => new Date(Date.now() - n * 1000).toISOString();
  fold(s, { type: 'user', cwd: join(repo, 'src'), timestamp: at(30), message: { role: 'user', content: 'change a' } });
  fold(s, { type: 'assistant', cwd: join(repo, 'src'), timestamp: at(20), message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: join(repo, 'src', 'a.js') } }], stop_reason: 'tool_use' } });
  assert.deepEqual([...s.turnFiles], [join(repo, 'src', 'a.js')]);

  const un = await changesOf(s, 'uncommitted');
  assert.equal(un.branch, 'feature');
  assert.deepEqual(un.files.map(f => [f.path, f.status, f.add, f.del]), [['new.txt', 'A', 2, 0], ['src/a.js', 'M', 2, 1]]);
  assert.equal(un.add, 4); assert.equal(un.del, 1);
  assert.match(un.patch, /^\+2$/m); assert.match(un.patch, /\+\+\+ b\/new\.txt[\s\S]*\+fresh/);
  assert.equal(un.upstream, null, 'no upstream');

  const br = await changesOf(s, 'branch');
  assert.equal(br.base, 'main');
  assert.deepEqual(br.files.map(f => f.path), ['b.md', 'new.txt', 'src/a.js'], 'the branch’s commit and the working tree');

  const turn = await changesOf(s, 'turn');
  assert.deepEqual(turn.files.map(f => f.path), ['src/a.js'], 'only the file the turn edited');

  const stat = await changesOf(s, 'uncommitted', true);
  assert.deepEqual(stat, { root: un.root, branch: 'feature', add: 4, del: 1, files: 2 });

  // a new prompt is a new turn: nothing edited in it yet
  fold(s, { type: 'assistant', cwd: repo, timestamp: at(10), message: { role: 'assistant', content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' } });
  fold(s, { type: 'user', cwd: repo, timestamp: at(5), message: { role: 'user', content: 'now something else' } });
  const next = await changesOf(s, 'turn');
  assert.deepEqual(next.files, []); assert.match(next.note, /nothing edited/);

  const nowhere = newSession(randomUUID(), null); nowhere.cwd = join(repo, 'gone');
  assert.match((await changesOf(nowhere)).error, /not there/);
  const plain = newSession(randomUUID(), null); plain.cwd = tmpDir('peix-nogit-');
  assert.match((await changesOf(plain)).error, /not in a git repository/);
});

test('names git quotes, and prefixes the config moves, read as the files they are (2026-10-14)', async () => {
  const repo = tmpDir('peix-chgq-');
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString();
  g('init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'configuração.json'), '{\n"a": 1\n}\n'); writeFileSync(join(repo, 'say "hi".txt'), 'old\n'); writeFileSync(join(repo, 'x b'), 'x\n');
  g('add', '.'); g('commit', '-q', '-m', 'base');
  writeFileSync(join(repo, 'configuração.json'), '{\n"a": 2\n}\n'); writeFileSync(join(repo, 'say "hi".txt'), 'new\n'); writeFileSync(join(repo, 'x b'), 'y\n');
  writeFileSync(join(repo, 'notas-reunião.md'), 'linha um\nlinha dois\n');   // untracked
  const s = newSession(randomUUID(), null); s.cwd = repo;
  const want = [['configuração.json', 'M', 1, 1], ['notas-reunião.md', 'A', 2, 0], ['say "hi".txt', 'M', 1, 1], ['x b', 'M', 1, 1]];
  for (const cfg of [[], ['diff.noprefix', 'true'], ['diff.mnemonicPrefix', 'true']]) {
    if (cfg.length) g('config', ...cfg);
    const un = await changesOf(s, 'uncommitted');
    assert.deepEqual(un.files.map(f => [f.path, f.status, f.add, f.del]), want, cfg.join('=') || 'core.quotePath as git ships it');
    assert.deepEqual(splitPatch(un.patch).map(c => c.path).sort(), want.map(w => w[0]), 'every file\'s patch found by its name');
    if (cfg.length) g('config', '--unset', cfg[0]);
  }
});

test('the turn\'s files are names, never patterns: src/[id].tsx is not src/i.tsx (2026-10-14)', async () => {
  const repo = tmpDir('peix-chglit-');
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString();
  g('init', '-q', '-b', 'main'); mkdirSync(join(repo, 'src'));
  for (const f of ['[id].tsx', 'i.tsx', 'd.tsx']) writeFileSync(join(repo, 'src', f), 'a\n');
  g('add', '.'); g('commit', '-q', '-m', 'base');
  for (const f of ['[id].tsx', 'i.tsx']) writeFileSync(join(repo, 'src', f), 'b\n');
  writeFileSync(join(repo, 'src', '*.md'), 'n\n'); writeFileSync(join(repo, 'src', 'notes.md'), 'n\n');   // untracked: *.md, and one it would match as a glob
  const s = newSession(randomUUID(), null); s.loaded = false;
  fold(s, { type: 'user', cwd: repo, timestamp: new Date(Date.now() - 20_000).toISOString(), message: { role: 'user', content: 'the page' } });
  fold(s, { type: 'assistant', cwd: repo, timestamp: new Date(Date.now() - 10_000).toISOString(), message: { role: 'assistant', content: [
    { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: join(repo, 'src', '[id].tsx') } },
    { type: 'tool_use', id: 't2', name: 'Write', input: { file_path: join(repo, 'src', '*.md') } }], stop_reason: 'tool_use' } });
  const turn = await changesOf(s, 'turn');
  assert.deepEqual(turn.files.map(f => f.path).sort(), ['src/*.md', 'src/[id].tsx'], 'the two files it edited, and nothing their names would match as patterns');
});

test('one file\'s diff past every buffer is left out by name, the others shown (2026-10-14)', { timeout: 120_000 }, async () => {
  const repo = tmpDir('peix-chgbig-');
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString();
  g('init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'small.js'), 'a\n'); g('add', '.'); g('commit', '-q', '-m', 'base');
  const row = `{"id":0,"v":"${'x'.repeat(80)}"}\n`;
  writeFileSync(join(repo, 'big.jsonl'), row.repeat(400_000)); g('add', 'big.jsonl');   // 36 MB, added: its patch a + per line, first by name
  writeFileSync(join(repo, 'small.js'), 'b\n');
  const s = newSession(randomUUID(), null); s.cwd = repo;
  const un = await changesOf(s, 'uncommitted');
  assert.deepEqual(un.files.map(f => [f.path, f.status, f.add]), [['big.jsonl', 'A', 400_000], ['small.js', 'M', 1]]);
  assert.deepEqual([un.truncated, un.left], [true, ['big.jsonl']]);
  assert.deepEqual(splitPatch(un.patch).map(c => c.path), ['small.js'], 'the file after it shown whole');
  assert.ok(un.patch.length < 1e6);
  rmSync(repo, { recursive: true, force: true });
});

test('reading a chat\'s changes leaves its index alone — files touched but not changed too (2026-10-14)', async () => {
  const repo = tmpDir('peix-chgix-'), tree = join(tmpDir('peix-chgixw-'), 'w');
  const g = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString().trim();
  g(repo, 'init', '-q', '-b', 'main');
  for (const f of ['a.js', 'b.js', 'c.js']) writeFileSync(join(repo, f), f + '\n');
  g(repo, 'add', '.'); g(repo, 'commit', '-q', '-m', 'base'); g(repo, 'worktree', 'add', '-q', '-b', 'w', tree);
  for (const dir of [repo, tree]) {
    const later = new Date(Date.now() + 5000);
    for (const f of ['a.js', 'b.js']) utimesSync(join(dir, f), later, later);   // touched, the same bytes: stat-dirty
    writeFileSync(join(dir, 'c.js'), 'c.js\nchanged\n');
    const index = resolve(dir, g(dir, 'rev-parse', '--git-path', 'index'));
    const look = () => { const st = statSync(index); return [st.ino, st.mtimeMs, readFileSync(index).toString('hex')]; };
    const before = look(), s = newSession(randomUUID(), null); s.cwd = dir;
    const un = await changesOf(s, 'uncommitted');
    assert.deepEqual(un.files.map(f => [f.path, f.add, f.del]), [['c.js', 1, 0]], 'only the file changed');
    assert.deepEqual((await changesOf(s, 'uncommitted', true)).files, 1);
    assert.deepEqual(look(), before, `${dir === repo ? 'the checkout' : 'a worktree'}'s index not written`);
    assert.equal(existsSync(index + '.lock'), false);
  }
});

test('a PR\'s changes from origin\'s refs, the checkout and its refs untouched (2026-10-13)', async () => {
  const dir = tmpDir('peix-chgpr-'), origin = join(dir, 'origin.git'), work = join(dir, 'work'), repo = join(dir, 'widgets');
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe', env }).toString().trim();
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  execFileSync('git', ['init', '-q', '-b', 'main', work]);
  writeFileSync(join(work, 'cart.js'), 'export const total = items => items.length;\n'); writeFileSync(join(work, 'README.md'), '# widgets\n');
  git(work, 'add', '.'); git(work, 'commit', '-q', '-m', 'base'); git(work, 'push', '-q', origin, 'main');
  // PR #7 lives on origin as GitHub keeps one — refs/pull/7/head, no branch of it here — and main moved on after it left
  git(work, 'checkout', '-q', '-b', 'tax');
  writeFileSync(join(work, 'cart.js'), 'export const total = (items, tax = 0) => items.length * (1 + tax);\n'); writeFileSync(join(work, 'tax.js'), 'export const VAT = 0.23;\n');
  git(work, 'add', '.'); git(work, 'commit', '-q', '-m', 'tax'); git(work, 'push', '-q', origin, 'tax:refs/pull/7/head');
  git(work, 'checkout', '-q', 'main'); writeFileSync(join(work, 'README.md'), '# widgets\n\nlater on main\n'); git(work, 'commit', '-qam', 'later'); git(work, 'push', '-q', origin, 'main');

  // the chat's checkout: GitHub's address for origin (read as acme/widgets), another branch, an edit not committed
  execFileSync('git', ['clone', '-q', '--no-local', '--config', `url.${origin}.insteadOf=https://github.com/acme/widgets`, 'https://github.com/acme/widgets', repo], { stdio: 'pipe', env });
  git(repo, 'checkout', '-q', '-b', 'other'); writeFileSync(join(repo, 'README.md'), '# widgets\n\nmine, not committed\n');
  const before = { head: git(repo, 'rev-parse', 'HEAD'), branch: git(repo, 'branch', '--show-current'), status: git(repo, 'status', '--porcelain'), refs: git(repo, 'for-each-ref') };
  const s = newSession(randomUUID(), null); s.cwd = repo;

  const pr = await changesOf(s, 'pr', false, { pr: 'https://github.com/acme/widgets/pull/7' });
  assert.equal(pr.error, undefined);
  assert.deepEqual(pr.files.map(f => [f.path, f.status, f.add, f.del]), [['cart.js', 'M', 1, 1], ['tax.js', 'A', 1, 0]], 'the PR’s own two files — not main’s later README, nor the checkout’s edit');
  assert.equal(pr.base, 'main'); assert.equal(pr.branch, 'other', 'the checkout’s branch, as it was');
  assert.equal(pr.pr.n, 7); assert.equal(pr.pr.fetched, true); assert.equal(pr.upstream, null);
  assert.match(pr.patch, /^\+export const VAT = 0\.23;$/m);
  assert.deepEqual({ head: git(repo, 'rev-parse', 'HEAD'), branch: git(repo, 'branch', '--show-current'), status: git(repo, 'status', '--porcelain'), refs: git(repo, 'for-each-ref') }, before, 'HEAD, the tree and every ref untouched');
  assert.equal(existsSync(join(repo, '.git', 'FETCH_HEAD')), false, 'no FETCH_HEAD written');

  const again = await changesOf(s, 'pr', false, { pr: '#7' });
  assert.equal(again.pr.fetched, false, 'what is here already is not fetched again');
  assert.deepEqual(again.files.map(f => f.path), ['cart.js', 'tax.js']);
  assert.match((await changesOf(s, 'pr', false, {})).error, /which PR/);

  // what git cannot read comes from GitHub: a PR of another repo, one origin has not got — gh pr diff (the fake)
  const prs = join(dir, 'prs.json');
  writeFileSync(prs, JSON.stringify({ 'acme/gadgets#7': { state: 'OPEN', title: 'Gadgets', diff: 'diff --git a/g.js b/g.js\nnew file mode 100644\n--- /dev/null\n+++ b/g.js\n@@ -0,0 +1,2 @@\n+one\n+two\n' } }));
  process.env.GH_BIN = fileURLToPath(new URL('../scripts/fakegh.mjs', import.meta.url)); process.env.FAKEGH_PRS = prs;
  const other = await changesOf(s, 'pr', false, { pr: 'https://github.com/acme/gadgets/pull/7' });
  assert.deepEqual([other.pr.source, other.pr.why, other.files.map(f => [f.path, f.status, f.add, f.del])], ['gh', 'it is not in this checkout\'s repo', [['g.js', 'A', 2, 0]]]);
  assert.equal(other.branch, null, 'nothing of the checkout read');
  assert.match((await changesOf(s, 'pr', false, { pr: '8' })).error, /^origin has no PR #8 — and gh pr diff: could not find pull request diff/);
  const nowhere = newSession(randomUUID(), null); nowhere.cwd = join(dir, 'gone');
  assert.equal((await changesOf(nowhere, 'pr', false, { pr: 'https://github.com/acme/gadgets/pull/7' })).pr.why, 'its folder is not a git checkout');

  // the base is the PR's own as GitHub says it (a stacked PR's is another branch), known once gh answered for it
  git(work, 'push', '-q', origin, 'tax:refs/heads/tax'); git(work, 'checkout', '-q', '-b', 'rounding', 'tax');
  writeFileSync(join(work, 'tax.js'), 'export const VAT = 0.23;\nexport const round2 = x => Math.round(x * 100) / 100;\n');
  git(work, 'commit', '-qam', 'rounding'); git(work, 'push', '-q', origin, 'rounding:refs/pull/9/head');
  const url9 = 'https://github.com/acme/widgets/pull/9';
  assert.deepEqual((await changesOf(s, 'pr', false, { pr: url9 })).files.map(f => f.path), ['cart.js', 'tax.js'], 'against main: the tax PR’s commit too');
  setPrInfo(url9, 'open', 'Rounding', null, Date.now(), undefined, false, null, null, prRefs({ headRefName: 'rounding', baseRefName: 'tax', headRefOid: 'x' }));
  const stacked = await changesOf(s, 'pr', false, { pr: url9 });
  assert.deepEqual([stacked.base, stacked.pr.headName, stacked.files.map(f => [f.path, f.add, f.del])], ['tax', 'rounding', [['tax.js', 1, 0]]], 'against its base: its own commit alone');
});

test('a patch counted by file, as numstat would (gh pr diff\'s, 2026-10-13)', () => {
  assert.deepEqual(patchStat('diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n--- a line that was a rule\n+++ and one that is\n ctx\n'), { status: 'M', add: 1, del: 1, binary: false });
  assert.deepEqual(patchStat('diff --git a/n b/n\nnew file mode 100644\n--- /dev/null\n+++ b/n\n@@ -0,0 +1 @@\n+n\n'), { status: 'A', add: 1, del: 0, binary: false });
  assert.deepEqual(patchStat('diff --git a/i.png b/i.png\ndeleted file mode 100644\nBinary files a/i.png and /dev/null differ\n'), { status: 'D', add: 0, del: 0, binary: true });
});

test('a checkout\'s working trees and the branch each holds (2026-10-13)', async () => {
  assert.deepEqual(parseWorktrees('worktree /r\nHEAD aaa\nbranch refs/heads/main\n\nworktree /r/.claude/worktrees/x\nHEAD bbb\ndetached\n\nworktree /gone\nHEAD ccc\nbranch refs/heads/feat/y\nprunable gitdir file points to non-existent location\n'), [
    { path: '/r', head: 'aaa', branch: 'main', detached: false, bare: false, prunable: false },
    { path: '/r/.claude/worktrees/x', head: 'bbb', branch: null, detached: true, bare: false, prunable: false },
    { path: '/gone', head: 'ccc', branch: 'feat/y', detached: false, bare: false, prunable: true }]);
  const repo = tmpDir('peix-wtl-');
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString().trim();
  git('init', '-q', '-b', 'main'); writeFileSync(join(repo, 'a'), 'a\n'); git('add', '.'); git('commit', '-qm', 'a');
  git('worktree', 'add', '-q', '-b', 'feat', join(repo, '.claude', 'worktrees', 'feat'));
  const real = git('rev-parse', '--show-toplevel');
  const w = await worktreesFor(join(repo, '.claude', 'worktrees', 'feat'));
  assert.deepEqual([w.here, w.main, w.repo, w.worktrees.map(x => [x.path, x.branch])], [join(real, '.claude', 'worktrees', 'feat'), real, null, [[real, 'main'], [join(real, '.claude', 'worktrees', 'feat'), 'feat']]]);
  assert.match((await worktreesFor(tmpDir('peix-nogit-'))).error, /not in a git repository/);
});
