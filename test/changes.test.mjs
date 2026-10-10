// What a chat changed (2026-10-10): the changes tab reads git in the chat's folder — the working tree against HEAD,
// untracked files too; the branch against where it left its base; or only the files the last turn edited. The
// parsers alone, then a real repo in a temp dir: a commit on main, a branch with a commit of its own, an edit, a new
// file, and a transcript whose last turn edited one of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { addedPatch, changesOf, fold, newSession, parseNameStatus, parseNumstat, splitPatch } from '../server.mjs';
import { tmpDir } from '../lib/testserver.mjs';

test('the parsers: numstat, name-status, a patch split by file, an untracked file as added', () => {
  assert.deepEqual(parseNumstat('3\t1\tsrc/a.js\n-\t-\timg.png\n'), { 'src/a.js': { add: 3, del: 1, binary: false }, 'img.png': { add: 0, del: 0, binary: true } });
  assert.deepEqual(parseNameStatus('M\tsrc/a.js\nA\tnew.txt\nD\told.txt\n'), { 'src/a.js': 'M', 'new.txt': 'A', 'old.txt': 'D' });
  const p = 'diff --git a/x.js b/x.js\nindex 1..2\n--- a/x.js\n+++ b/x.js\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/y z.md b/y z.md\n--- a/y z.md\n+++ b/y z.md\n@@ -1 +1 @@\n-c\n+d\n';
  assert.deepEqual(splitPatch(p).map(c => c.path), ['x.js', 'y z.md']);
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
