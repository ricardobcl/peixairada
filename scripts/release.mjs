// A release of the board (2026-11-27): the signed commit that sets package.json's version — the next minor, 0.2, 0.3… —
// and puts its notes at the top of CHANGELOG.md, tagged v0.N.0 and published on GitHub from the same notes. Boards on
// Releases (Settings › Updates › Follow, the default) take the newest one and show its notes (server/update.mjs); the
// notes are written for the people who use the board, drafted by Claude from what this prints and edited by you — the
// /release skill (.claude/skills/release/SKILL.md) is the procedure.
//
//   node scripts/release.mjs [--since <date | ref>]      what the notes are drafted from: the last release, the next
//                                                         version, the DECISIONS.md entries and the commits since
//   node scripts/release.mjs cut <notes.md> [--date <d>]  the release commit and its tag, the notes the file's markdown
//   node scripts/release.mjs publish                      main and the tag pushed to origin, the GitHub release made
//
// Run in the checkout, on main. `cut` takes nothing but the release: a staged change, or one to the three files it
// writes, is refused; `publish` only a release commit signed by a key in .github/allowed_signers — a board takes no
// other, so an unsigned one pushed would stop every board on Releases. GH_BIN is the tests' gh.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHANGELOG, changelogSections, relName, verParts } from '../lib/changelog.mjs';

const DIR = process.cwd();
const git = (...args) => execFileSync('git', ['-C', DIR, ...args], { encoding: 'utf8' }).trim();

const tryGit = (...args) => {
  try {
    return git(...args);
  } catch {
    return '';
  }
};

const die = line => {
  console.error(line);
  process.exit(1);
};

const many = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const writtenAt = ref => {
  try {
    return JSON.parse(git('show', `${ref}:package.json`)).version || null;
  } catch {
    return null;
  }
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const longDate = (date = new Date()) => `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

const HEAD_CHANGELOG = `# Changelog

What each release of peixAIrada brought, newest first. A board on *Releases* (Settings › Updates › Follow, the default)
takes the newest one and shows its notes; *Every commit* follows main.
`;

/** The commit that set the version HEAD is on, and when — the last release. */
function lastRelease() {
  const version = writtenAt('HEAD');

  if (!version) die('package.json has no version here');

  const sha = git(
    'log',
    '-1',
    '--format=%H',
    '--pickaxe-regex',
    '-S',
    `"version": *"${version.replace(/[.+]/g, '\\$&')}"`,
    '--',
    'package.json',
  );

  return { version, sha, date: sha ? git('show', '-s', '--format=%cs', sha) : null };
}

/** The next release: the next minor (2026-11-27, V1: a fix that cannot wait is a minor too). */
function nextVersion(version) {
  const parts = verParts(version);

  if (!parts) die(`package.json's version, ${version}, is no x.y.z`);
  return `${parts[0]}.${parts[1] + 1}.0`;
}

/** The parts of the board a commit's files are (server/update.mjs' updateParts), or `notes` for none of them. */
function partsOf(files) {
  const has = new Set();

  for (const file of files) {
    if (/^package(-lock)?\.json$/.test(file)) has.add('deps');
    else if (file === 'server.mjs' || /^(server|lib)\//.test(file)) has.add('server');
    else if (file.startsWith('public/')) has.add('page');
    else if (file.startsWith('mac/') && !file.endsWith('.md')) has.add('app');
  }

  return has.size ? [...has].join('+') : 'notes';
}

/** DECISIONS.md's entries dated on or after `since` (YYYY-MM-DD): the date and the rest of the heading. */
function decisionsSince(since) {
  let text = '';

  try {
    text = readFileSync(join(DIR, 'docs', 'DECISIONS.md'), 'utf8');
  } catch {}

  return [...text.matchAll(/^## Decisions of (\d{4}-\d{2}-\d{2})([^\n]*)$/gm)]
    .filter(match => !since || match[1] >= since)
    .map(match => ({ date: match[1], title: match[2].replace(/^[,\s]*(?:—\s*)?/, '').trim() }));
}

function draft(sinceArg) {
  const last = lastRelease();
  const next = nextVersion(last.version);

  const dated = /^\d{4}-\d{2}-\d{2}$/.test(sinceArg || '');
  const from = sinceArg && !dated ? tryGit('rev-parse', '--verify', `${sinceArg}^{commit}`) : last.sha;

  if (sinceArg && !dated && !from) die(`--since ${sinceArg}: no such commit or date`);
  const sinceDate = dated ? sinceArg : from ? git('show', '-s', '--format=%cs', from) : null;
  const range = dated ? ['--since', `${sinceArg}T00:00`, 'HEAD'] : from ? [`${from}..HEAD`] : ['HEAD'];

  const log = tryGit('log', '--format=%x1e%h%x1f%cs%x1f%s', '--name-only', ...range)
    .split('\x1e')
    .filter(Boolean)
    .map(block => {
      const [head, ...files] = block.trim().split('\n');
      const [hash, date, subject] = head.split('\x1f');

      return { h: hash, d: date, s: subject, part: partsOf(files.filter(Boolean)) };
    });

  const facing = log.filter(commit => commit.part !== 'notes').length;

  console.log(
    `peixAIrada: the last release ${relName(last.version)} (${last.sha.slice(0, 7)}, ${last.date}); the next ${relName(next)}`,
  );

  console.log(
    `${many(log.length, 'commit')} since ${sinceDate || 'the start'} — ${facing} touch the page, the server or the app`,
  );

  const dec = decisionsSince(sinceDate);

  console.log(`\nDECISIONS.md, ${dec.length} ${dec.length === 1 ? 'entry' : 'entries'} since ${sinceDate}:`);
  for (const entry of dec) console.log(`  ${entry.date}  ${entry.title}`);
  console.log('\nThe commits, newest first:');
  for (const commit of log) console.log(`  ${commit.d} ${commit.h} [${commit.part}] ${commit.s}`);

  console.log(`\nThe notes: markdown, ### New / ### Changed / ### Security / ### Fixed; then
  node scripts/release.mjs cut <notes.md>`);
}

function cut(file, date) {
  if (!file || !existsSync(file)) die('cut <notes.md>: the notes, as a markdown file');
  const notes = readFileSync(file, 'utf8').trim();

  if (!notes) die(`${file} is empty`);
  if (/^## /m.test(notes)) die(`${file}: no "## " heading in the notes — the release's own heading is written for you`);
  const touched = tryGit('status', '--porcelain', '--', 'package.json', 'package-lock.json', CHANGELOG);

  if (touched) {
    die(`not cut: ${touched.split('\n').length} of package.json, package-lock.json, ${CHANGELOG} changed here`);
  }

  if (tryGit('diff', '--cached', '--name-only')) {
    die('not cut: something is staged — the release commit holds the release alone');
  }

  const branch = tryGit('symbolic-ref', '--quiet', '--short', 'HEAD');

  if (branch !== 'main') console.warn(`(on ${branch || 'no branch'}, not main: boards follow origin's main)`);

  const last = lastRelease();
  const next = nextVersion(last.version);
  const name = relName(next);
  const tag = `v${next}`;

  if (tryGit('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`)) die(`not cut: the tag ${tag} is here already`);

  // the notes at the top: under the file's own head, before the newest release
  const path = join(DIR, CHANGELOG);
  const was = existsSync(path) ? readFileSync(path, 'utf8') : HEAD_CHANGELOG;
  const section = `## ${name} — ${date || longDate()}\n\n${notes}\n\n`;
  const at = was.search(/^## /m);

  writeFileSync(path, at < 0 ? `${was.trimEnd()}\n\n${section}` : was.slice(0, at) + section + was.slice(at));
  if (changelogSections(readFileSync(path, 'utf8'))[0]?.version !== name) die(`${CHANGELOG} did not read back`);

  for (const manifest of ['package.json', 'package-lock.json']) {
    const manifestPath = join(DIR, manifest);

    if (!existsSync(manifestPath)) continue;
    const json = JSON.parse(readFileSync(manifestPath, 'utf8'));

    json.version = next;
    if (json.packages?.['']) json.packages[''].version = next;
    writeFileSync(manifestPath, `${JSON.stringify(json, null, 2)}\n`);
  }

  git(
    'add',
    '--',
    'package.json',
    CHANGELOG,
    ...(existsSync(join(DIR, 'package-lock.json')) ? ['package-lock.json'] : []),
  );

  git('commit', '-q', '-m', `Release ${name}`, '-m', `Its notes are ${CHANGELOG}'s, at the top.`);
  git('tag', '-s', tag, '-m', `peixAIrada ${name}`);

  console.log(`cut ${name}: ${git('rev-parse', '--short', 'HEAD')} Release ${name}, tagged ${tag}
  node scripts/release.mjs publish     pushes main and ${tag}, and makes the GitHub release`);
}

function publish() {
  const version = writtenAt('HEAD');
  const tag = `v${version}`;
  const name = relName(version);

  const at = tryGit('rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`);

  if (!at) die(`not published: no tag ${tag} here — node scripts/release.mjs cut first`);
  if (tryGit('symbolic-ref', '--quiet', '--short', 'HEAD') !== 'main') die('not published: not on main');
  if (writtenAt(`${at}^`) === version) die(`not published: ${tag} is not on the commit that set ${version}`);

  // a board takes only a release a key it trusts signed (server/update.mjs' signedBy): checked as they will
  try {
    execFileSync(
      'git',
      ['-C', DIR, '-c', `gpg.ssh.allowedSignersFile=${join(DIR, '.github', 'allowed_signers')}`, 'verify-commit', at],
      { stdio: 'pipe' },
    );
  } catch {
    die(`not published: ${at.slice(0, 7)} is not signed by a key in .github/allowed_signers — no board would take it`);
  }

  const notes = changelogSections(git('show', `${at}:${CHANGELOG}`)).find(section => section.version === name);

  if (!notes) die(`not published: ${CHANGELOG} has no ${name} at ${tag}`);
  git('push', '-q', 'origin', 'main');
  git('push', '-q', 'origin', `refs/tags/${tag}`);
  const tmp = mkdtempSync(join(tmpdir(), 'peixairada-release-'));

  try {
    writeFileSync(join(tmp, 'notes.md'), `${notes.md}\n`);

    execFileSync(
      process.env.GH_BIN || 'gh',
      [
        'release',
        'create',
        tag,
        '--verify-tag',
        '--title',
        `peixAIrada ${name}`,
        '--notes-file',
        join(tmp, 'notes.md'),
      ],
      { cwd: DIR, stdio: 'inherit' },
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`published ${name}: main and ${tag} on origin, the GitHub release made`);
}

const [cmd, ...rest] = process.argv.slice(2);

const opt = flag => {
  const index = rest.indexOf(flag);

  return index >= 0 ? rest[index + 1] : null;
};

if (!cmd || cmd === '--since') draft(cmd ? rest[0] : null);
else if (cmd === 'cut') {
  cut(
    rest.find(argument => !argument.startsWith('--') && argument !== opt('--date')),
    opt('--date'),
  );
} else if (cmd === 'publish') publish();
else die('node scripts/release.mjs [--since <date | ref>] | cut <notes.md> [--date <d>] | publish');
