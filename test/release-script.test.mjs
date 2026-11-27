// Cutting a release (2026-11-27, scripts/release.mjs) against a throwaway repo signed by its own key: what the notes are
// drafted from, the release commit and its signed tag — the notes at the top of CHANGELOG.md as the board reads them —,
// and the push and GitHub release that publish it, refused for a release no trusted key signed.
import './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { changelogSections } from '../lib/changelog.mjs';
import { tmpDir } from '../lib/testserver.mjs';
import { ROOT } from './update-project.mjs';

const SCRIPT = join(ROOT, 'scripts', 'release.mjs');

test(
  'release.mjs: the draft, the cut, the publish — and an unsigned release kept back',
  { timeout: 60_000 },
  async () => {
    const root = tmpDir('peix-rel-'),
      repo = join(root, 'repo'),
      origin = join(root, 'origin.git'),
      key = join(root, 'signer'),
      ghLog = join(root, 'gh.log'),
      gh = join(root, 'gh');
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'test', '-f', key]);
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GH_BIN: gh,
    };
    const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env }).trim();
    const run = (...args) =>
      new Promise(res =>
        execFile(process.execPath, [SCRIPT, ...args], { cwd: repo, env, timeout: 30_000 }, (e, out, err) =>
          res({ code: e ? e.code : 0, out: out + err }),
        ),
      );
    const write = files => {
      for (const [f, body] of Object.entries(files)) {
        mkdirSync(join(repo, f, '..'), { recursive: true });
        writeFileSync(join(repo, f), body);
      }
    };
    const commit = (files, msg) => {
      write(files);
      git(repo, 'add', '-A');
      git(repo, 'commit', '-q', '-m', msg);
    };
    writeFileSync(gh, `#!/bin/sh\necho "$@" >> "${ghLog}"\ncat "$(eval echo \\$$#)" >> "${ghLog}"\n`);
    chmodSync(gh, 0o755);

    mkdirSync(repo);
    git(repo, 'init', '-q', '-b', 'main');
    for (const [k, v] of [
      ['gpg.format', 'ssh'],
      ['user.signingkey', `${key}.pub`],
      ['commit.gpgsign', 'true'],
      ['core.hooksPath', '/dev/null'],
    ])
      git(repo, 'config', k, v);
    commit(
      {
        'package.json': '{\n  "name": "tiny",\n  "version": "0.1.0"\n}\n',
        'package-lock.json':
          '{\n  "name": "tiny",\n  "version": "0.1.0",\n  "lockfileVersion": 3,\n  "packages": {\n    "": {\n      "name": "tiny",\n      "version": "0.1.0"\n    }\n  }\n}\n',
        '.github/allowed_signers': `test@example.com namespaces="git" ${readFileSync(`${key}.pub`, 'utf8').trim().split(' ').slice(0, 2).join(' ')}\n`,
        'docs/DECISIONS.md':
          '# Decisions\n\n## Decisions of 2026-11-26 — Space\n\nwords\n\n## Decisions of 2020-01-01 — old\n',
      },
      'the first',
    );
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(repo, 'remote', 'add', 'origin', origin);
    git(repo, 'push', '-q', '-u', 'origin', 'main');
    commit({ 'public/index.html': '<p>space</p>\n' }, 'Space on the page');
    commit({ 'README.md': 'tiny\n' }, 'the readme');

    // the draft's inputs
    let r = await run('--since', '2026-01-01');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^peixAIrada: the last release 0\.1 \([0-9a-f]{7}, \d{4}-\d{2}-\d{2}\); the next 0\.2$/m);
    assert.match(r.out, /^3 commits since 2026-01-01 — 2 touch the page, the server or the app$/m);
    assert.match(r.out, /^DECISIONS\.md, 1 entry since 2026-01-01:\n {2}2026-11-26 {2}Space$/m);
    assert.match(r.out, /^ {2}\d{4}-\d{2}-\d{2} [0-9a-f]{7} \[page\] Space on the page$/m);
    assert.match(r.out, /\[notes\] the readme$/m);

    // the cut: the notes at the top of a new CHANGELOG.md, the version in both files, one commit, a signed tag
    const notes = join(root, 'notes.md');
    writeFileSync(notes, '### New\n\n- **Space** shows every chat as a node.\n');
    write({ 'scratch.txt': 'not mine to commit\n' });
    r = await run('cut', notes, '--date', '27 November 2026');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^cut 0\.2: [0-9a-f]{7} Release 0\.2, tagged v0\.2\.0$/m);
    assert.equal(git(repo, 'log', '-1', '--format=%s'), 'Release 0.2');
    assert.deepEqual(
      git(repo, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort(),
      ['CHANGELOG.md', 'package-lock.json', 'package.json'],
      'the release alone',
    );
    const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')),
      lock = JSON.parse(readFileSync(join(repo, 'package-lock.json'), 'utf8'));
    assert.deepEqual([pkg.version, lock.version, lock.packages[''].version], ['0.2.0', '0.2.0', '0.2.0']);
    const log = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8');
    assert.match(log, /^# Changelog\n/);
    assert.deepEqual(changelogSections(log), [
      { version: '0.2', title: '27 November 2026', md: '### New\n\n- **Space** shows every chat as a node.' },
    ]);
    assert.equal(git(repo, 'rev-parse', 'v0.2.0^{commit}'), git(repo, 'rev-parse', 'HEAD'));
    // signed by the repo's key: verify-tag throws on anything else
    execFileSync(
      'git',
      ['-C', repo, '-c', `gpg.ssh.allowedSignersFile=${join(repo, '.github/allowed_signers')}`, 'verify-tag', 'v0.2.0'],
      { env, stdio: 'ignore' },
    );
    write({ 'package.json': '{ "name": "tiny", "version": "0.2.0", "private": true }\n' });
    r = await run('cut', notes);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /^not cut: 1 of package\.json, package-lock\.json, CHANGELOG\.md changed here$/m);
    git(repo, 'checkout', '--', 'package.json');

    // publish: main and the tag on origin, the release made from the same notes
    r = await run('publish');
    assert.equal(r.code, 0, r.out);
    assert.equal(git(origin, 'rev-parse', 'main'), git(repo, 'rev-parse', 'HEAD'));
    assert.equal(git(origin, 'rev-parse', 'v0.2.0^{commit}'), git(repo, 'rev-parse', 'HEAD'));
    const asked = readFileSync(ghLog, 'utf8');
    assert.match(asked, /^release create v0\.2\.0 --verify-tag --title peixAIrada 0\.2 --notes-file \S+notes\.md\n/);
    assert.match(asked, /\n### New\n\n- \*\*Space\*\* shows every chat as a node\.\n$/);

    // a release no trusted key signed is not pushed: no board would take it
    git(repo, 'config', 'commit.gpgsign', 'false');
    writeFileSync(notes, '- three\n');
    r = await run('cut', notes);
    assert.equal(r.code, 0, r.out);
    r = await run('publish');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /^not published: [0-9a-f]{7} is not signed by a key in \.github\/allowed_signers/m);
    assert.notEqual(git(origin, 'rev-parse', 'main'), git(repo, 'rev-parse', 'HEAD'), 'nothing pushed');
  },
);
