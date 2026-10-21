// The board's version (2026-10-21): package.json's major and minor, and for the patch the commits made since its
// "version" was set — every commit a version of its own, nothing bumped by hand and no hook to run, and the
// same commit the same version in every clone (a count of its history). A new minor or major is package.json's version
// changed in a commit, which starts the count again: 0.2.0 on the commit that sets it, 0.2.1 on the next.
//
// Without git or a history — the app's bundled copy, which build.sh stamps with the version it was built at — it is
// package.json's as written.
//
//   node lib/version.mjs [dir]      — prints the version of the checkout at dir (this one by default)
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The version at the checkout's HEAD, from package.json's own (`written`): `git(args)` runs git there and answers its
 *  output, trimmed. A version that is no x.y.z, or a history that never names it, is the one written. */
export async function versionFrom(written, git) {
  const m = /^(\d+)\.(\d+)\.\d+/.exec(written || ''); if (!m) return written;
  // the last commit that changed how often that value is written — the one that set it, whatever else moved on its line
  const since = await git(['log', '-1', '--format=%H', '--pickaxe-regex', '-S', `"version": *"${written.replace(/[.+]/g, '\\$&')}"`, '--', 'package.json']);
  if (!/^[0-9a-f]{40}$/.test(since)) return written;
  const n = await git(['rev-list', '--count', `${since}..HEAD`]);
  return /^\d+$/.test(n) ? `${m[1]}.${m[2]}.${n}` : written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..');
  const written = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  const git = args => new Promise(res => execFile('git', ['-C', dir, ...args], (e, out) => res(e ? '' : String(out).trim())));
  console.log(await versionFrom(written, git));
}
