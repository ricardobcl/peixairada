// The board's version (2026-10-21, lib/version.mjs): package.json's major and minor, the patch the commits since its
// "version" line last changed — counted, never bumped by hand. A throwaway repository commits its way through one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../lib/testserver.mjs';
import { versionFrom } from '../lib/version.mjs';

const CLI = fileURLToPath(new URL('../lib/version.mjs', import.meta.url));

test('every commit is a version, a new minor starts the count again, and no history is the version written', async () => {
  const dir = tmpDir('peix-ver-');
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' } }).trim();
  const pkg = (version, extra = {}) => writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'tiny', version, ...extra }, null, 2) + '\n');
  const commit = (msg, files = {}) => { for (const [f, body] of Object.entries(files)) writeFileSync(join(dir, f), body); git('add', '-A'); git('commit', '-q', '-m', msg); };
  const now = () => execFileSync(process.execPath, [CLI, dir], { encoding: 'utf8' }).trim();

  git('init', '-q', '-b', 'main');
  pkg('0.1.0'); commit('the first');
  assert.equal(now(), '0.1.0', 'the commit that sets it is its .0');
  commit('two', { 'a.txt': 'a\n' }); commit('three', { 'a.txt': 'b\n' });
  assert.equal(now(), '0.1.2', 'one more per commit');
  pkg('0.1.0', { description: 'a line beside it changed' }); commit('four');
  assert.equal(now(), '0.1.3', 'package.json changed elsewhere counts on');
  pkg('0.2.0', { description: 'a line beside it changed' }); commit('a minor');
  assert.equal(now(), '0.2.0', 'a new minor starts again');
  commit('after it', { 'a.txt': 'c\n' });
  assert.equal(now(), '0.2.1');

  const none = async () => '';   // no git, no history: the app's bundled copy
  assert.equal(await versionFrom('0.3.0', none), '0.3.0');
  assert.equal(await versionFrom('dev', none), 'dev', 'no x.y.z: as written');
});
