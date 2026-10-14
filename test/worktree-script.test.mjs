// scripts/worktree.sh (2026-10-14): a worktree per piece of parallel work, made from main and taken away only when
// nothing is lost — every commit on main (a cherry-picked one too), nothing uncommitted, no process inside it — and
// never by force; an old worktree's node_modules link goes first, the link alone. A temp repo with the script copied in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-wts-');
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe', env }).toString().trim();
const repo = join(tmp, 'repo');
execFileSync('git', ['init', '-q', '-b', 'main', repo], { env });
mkdirSync(join(repo, 'scripts')); mkdirSync(join(repo, 'node_modules', 'x'), { recursive: true });
copyFileSync(fileURLToPath(new URL('../scripts/worktree.sh', import.meta.url)), join(repo, 'scripts', 'worktree.sh'));
writeFileSync(join(repo, '.gitignore'), 'node_modules/\n.claude/\n'); writeFileSync(join(repo, 'a.txt'), 'a\n');
git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'base');
const real = git(repo, 'rev-parse', '--show-toplevel'), wt = n => join(real, '.claude', 'worktrees', n);
const sh = (args, more = {}) => {
  const r = spawnSync(join(repo, 'scripts', 'worktree.sh'), args, { cwd: repo, env: { ...env, ...more }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const commit = (name, file) => { writeFileSync(join(wt(name), file), name + '\n'); git(wt(name), 'add', file); git(wt(name), 'commit', '-qm', name); return git(wt(name), 'rev-parse', 'HEAD'); };
const branches = () => git(repo, 'branch', '--format=%(refname:short)').split('\n');

test('new makes .claude/worktrees/<name> on its branch from main, needing no node_modules of its own', () => {
  const r = sh(['new', 'a']);
  assert.equal(r.code, 0, r.out); assert.equal(r.out.trim(), wt('a'));
  assert.equal(git(wt('a'), 'branch', '--show-current'), 'a');
  assert.equal(git(wt('a'), 'rev-parse', 'HEAD'), git(repo, 'rev-parse', 'main'));
  assert.ok(!existsSync(join(wt('a'), 'node_modules')), 'no link: Node finds the checkout\'s up the folders');
  assert.notEqual(sh(['new', '../x']).code, 0, 'a plain folder name only');
  assert.match(sh(['list']).out, /^a \(a\): 0 not on main, 0 not committed/m);
});

test('done keeps a worktree with a commit not on main, or anything not committed, and says why', () => {
  sh(['new', 'b']); commit('b', 'b.txt');
  let r = sh(['done', 'b']);
  assert.equal(r.code, 1); assert.match(r.out, /b: kept — 1 commit\(s\) not on main/); assert.ok(existsSync(wt('b')));
  sh(['new', 'c']); writeFileSync(join(wt('c'), 'loose.txt'), 'x\n');
  r = sh(['done', 'c']);
  assert.equal(r.code, 1); assert.match(r.out, /c: kept — not committed:\n\?\? loose\.txt/); assert.ok(existsSync(wt('c')));
});

test('done takes a worktree whose work is on main — fast-forwarded or cherry-picked — and its branch, never by force', () => {
  sh(['new', 'ff']); commit('ff', 'ff.txt'); git(repo, 'merge', '-q', '--ff-only', 'ff');
  const pick = commit('b', 'b2.txt'); git(repo, 'cherry-pick', git(repo, 'rev-parse', 'b~1'), pick);
  const r = sh(['done', 'ff', 'b']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ff: removed, and its branch ff/); assert.match(r.out, /b: removed, and its branch b/);
  assert.ok(!existsSync(wt('ff')) && !existsSync(wt('b')));
  assert.ok(!branches().includes('ff') && !branches().includes('b'));
});

test('an old worktree\'s link to the checkout\'s node_modules goes, the link alone; a link elsewhere keeps it', () => {
  sh(['new', 'linked']); symlinkSync('../../../node_modules', join(wt('linked'), 'node_modules'));
  let r = sh(['done', 'linked']);
  assert.equal(r.code, 0, r.out); assert.ok(existsSync(join(repo, 'node_modules', 'x')), 'what it pointed at is still there');
  const other = join(tmp, 'elsewhere'); mkdirSync(other);
  sh(['new', 'odd']); symlinkSync(other, join(wt('odd'), 'node_modules'));
  r = sh(['done', 'odd']);
  assert.equal(r.code, 1); assert.match(r.out, /odd: kept — its node_modules links somewhere else/);
});

test('a process whose current folder is inside keeps the worktree', async () => {
  sh(['new', 'busy']);
  const p = spawn('sleep', ['30'], { cwd: wt('busy'), stdio: 'ignore' });
  try {
    const r = sh(['done', 'busy']);
    assert.equal(r.code, 1); assert.match(r.out, /busy: kept — a process works inside it/);
    assert.match(sh(['list']).out, /^busy \(busy\): .*, in use,/m);
  } finally { p.kill(); }
  await new Promise(res => p.once('exit', res));
  assert.equal(sh(['done', 'busy']).code, 0);
});

test('prune takes only finished work: a commit of its own, all on main, left a while', () => {
  sh(['new', 'fresh']);
  sh(['new', 'landed']); commit('landed', 'l.txt'); git(repo, 'merge', '-q', '--ff-only', 'landed');
  sh(['new', 'open']); commit('open', 'o.txt');
  let r = sh(['prune']);
  assert.match(r.out, /fresh: kept — no commit of its own yet/); assert.match(r.out, /landed: kept — touched within the hour/);
  assert.ok(existsSync(wt('landed')));
  r = sh(['prune'], { QUIET_S: '0' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /landed: removed/); assert.match(r.out, /open: kept — 1 commit\(s\) not on main/);
  assert.match(r.out, /fresh: kept — no commit of its own yet/); assert.match(r.out, /c: kept — no commit of its own yet/);
  assert.ok(!existsSync(wt('landed')) && existsSync(wt('open')) && existsSync(wt('fresh')));
});

test('a MAIN that names nothing stops it before anything is taken — never a branch deleted by force (2026-10-14)', () => {
  sh(['new', 'lost']); commit('lost', 'lost.txt');
  for (const args of [['done', 'lost'], ['prune'], ['list']]) {
    const r = sh(args, { MAIN: 'nope', QUIET_S: '0' });
    assert.notEqual(r.code, 0, r.out); assert.match(r.out, /nope: no such branch here/);
  }
  assert.ok(existsSync(wt('lost')) && branches().includes('lost'), 'the worktree and its commit still there');
});

test('run from inside a worktree, it works on the main checkout\'s', () => {
  const r = spawnSync(join(wt('open'), 'scripts', 'worktree.sh'), ['list'], { cwd: wt('open'), env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /^open \(open\): 1 not on main/m);
});
