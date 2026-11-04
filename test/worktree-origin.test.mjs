// A new chat's branch and an origin that does not answer (2026-11-04): asking it costs WT_ASK_MS at most, whatever its SSH
// does, the tree is made from what is here, and the answer says origin was not asked; an origin that answers says nothing.
// The rest of the ways a tree is made: worktrees.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = realpathSync(tmpDir('peix-wto-'));
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
process.env.GIT_CONFIG_GLOBAL = '/dev/null'; process.env.GIT_CONFIG_NOSYSTEM = '1';
process.env.WT_ASK_MS = '1000';
const { ensureWorktree } = await import('../server.mjs');

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe', env }).toString().trim();
const origin = join(tmp, 'origin.git'), seed = join(tmp, 'seed');
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
execFileSync('git', ['init', '-q', '-b', 'main', seed]);
writeFileSync(join(seed, 'README.md'), '# widgets\n'); writeFileSync(join(seed, '.gitignore'), '.claude/\n');
git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', 'base'); git(seed, 'push', '-q', origin, 'main', 'main:refs/heads/feat/theirs');
let n = 0;
const clone = () => { const co = join(tmp, `co${++n}`); execFileSync('git', ['clone', '-q', '--no-local', origin, co], { stdio: 'pipe', env }); return co; };
/** origin over an SSH that does what `ssh` says: the way it is reached, nothing else about the clone changed. */
const overSsh = (co, ssh) => { git(co, 'remote', 'set-url', 'origin', 'ssh://nobody@peix.invalid/widgets.git'); git(co, 'config', 'core.sshCommand', ssh); };

test('an origin that hangs costs WT_ASK_MS, once: the branch is new, from the base picked', { timeout: 20_000 }, async () => {
  const co = clone(); overSsh(co, `sh -c 'sleep 6' --`);
  const t0 = Date.now(), r = await ensureWorktree({ cwd: co, branch: 'feat/hung', fresh: true, base: 'refs/heads/main' }), took = Date.now() - t0;
  assert.equal(r.made, true, JSON.stringify(r));
  assert.deepEqual([r.unasked, r.from], [true, 'refs/heads/main']);
  assert.ok(took >= 900 && took < 4000, `took ${took} ms`);
  assert.equal(git(r.path, 'branch', '--show-current'), 'feat/hung');
  assert.equal(git(r.path, 'rev-parse', 'HEAD'), git(co, 'rev-parse', 'main'));
});

test('an origin that refuses: no base asked for, origin\'s default as last fetched, and no second try', { timeout: 20_000 }, async () => {
  const co = clone(); overSsh(co, 'false');
  const r = await ensureWorktree({ cwd: co, branch: 'feat/denied', fresh: true });
  assert.deepEqual([r.made, r.unasked, r.from], [true, true, 'refs/remotes/origin/main'], JSON.stringify(r));
  assert.throws(() => git(r.path, 'rev-parse', '--abbrev-ref', '@{u}'), /no upstream|fatal/, 'tracking nothing');
});

test('an origin that answers: a name it has is tracked, one it has not is new, and neither says a thing', { timeout: 20_000 }, async () => {
  const co = clone();
  git(seed, 'push', '-q', origin, 'main:refs/heads/feat/late');   // since the clone: only origin knows it
  const late = await ensureWorktree({ cwd: co, branch: 'feat/late', fresh: true, base: 'refs/heads/main' });
  assert.equal(late.unasked, undefined, JSON.stringify(late));
  assert.equal(git(late.path, 'rev-parse', '--abbrev-ref', '@{u}'), 'origin/feat/late');
  const anew = await ensureWorktree({ cwd: co, branch: 'feat/anew', fresh: true });
  assert.equal(anew.unasked, undefined, JSON.stringify(anew));
  assert.throws(() => git(anew.path, 'rev-parse', '--abbrev-ref', '@{u}'), /no upstream|fatal/, 'tracking nothing');
  // a name that only ends the same: not the branch asked for
  const near = await ensureWorktree({ cwd: co, branch: 'theirs', fresh: true });
  assert.throws(() => git(near.path, 'rev-parse', '--abbrev-ref', '@{u}'), /no upstream|fatal/, 'feat/theirs is another branch');
});

test('no origin at all is nothing to say', { timeout: 20_000 }, async () => {
  const co = clone(); git(co, 'remote', 'remove', 'origin');
  const r = await ensureWorktree({ cwd: co, branch: 'feat/alone', fresh: true });
  assert.deepEqual([r.made, r.unasked], [true, undefined], JSON.stringify(r));
});

test('a PR\'s or a named branch, not fresh, still has to come from origin', { timeout: 20_000 }, async () => {
  const co = clone(); overSsh(co, 'false');
  assert.match((await ensureWorktree({ cwd: co, branch: 'feat/nowhere' })).error, /no branch feat\/nowhere here, nor on origin/);
});
