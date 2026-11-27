// Releases (2026-11-27): a board follows the newest release, not the tip — a release the signed commit that sets
// package.json's version, its notes at the top of CHANGELOG.md (lib/changelog.mjs) —, or every commit when Settings ›
// Updates says so. Against the throwaway checkout of test/update-project.mjs, its server on releases here.
import './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { changelogSections, notesBetween, relName, verCmp } from '../lib/changelog.mjs';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { PAGE, ROOT, project } from './update-project.mjs';

/** `make update` against this server: its exit code and all it wrote. */
const makeUpdate = (port, dir) =>
  new Promise(res =>
    execFile(
      process.execPath,
      [join(ROOT, 'scripts', 'update.mjs')],
      { env: { ...process.env, PORT: String(port), STATE_FILE: join(dir, 'state.json') }, timeout: 60_000 },
      (error, out, err) => res({ code: error ? error.code : 0, out: out + err }),
    ),
  );

test('a changelog: a section a release, read between two of them, newest first', () => {
  const log = [
    '# Changelog',
    '',
    'What each release brought.',
    '',
    '## 0.3 — 4 December 2026',
    '',
    '### New',
    '',
    '- **Snooze** puts a chat away',
    '',
    '## v0.2.0: 27 November 2026',
    '',
    '- **Space**',
    '',
    '## Not a release',
    '',
    'ignored',
    '',
    '## 0.1',
  ].join('\n');

  const sections = changelogSections(log);

  assert.deepEqual(
    sections.map(section => [section.version, section.title]),
    [
      ['0.3', '4 December 2026'],
      ['0.2.0', '27 November 2026'],
      ['0.1', ''],
    ],
  );

  assert.equal(sections[0].md, '### New\n\n- **Snooze** puts a chat away', 'a deeper heading is its own');
  assert.equal(sections[1].md, '- **Space**', 'another heading of its level ends it');

  assert.deepEqual(
    notesBetween(log, '0.1.0', '0.3.0').map(note => note.version),
    ['0.3', '0.2.0'],
  );

  assert.deepEqual(
    notesBetween(log, '0.2', '0.2.7').map(note => note.version),
    [],
    'past a release on main is still that release',
  );

  assert.deepEqual(
    notesBetween(log, null).map(note => note.version),
    ['0.3', '0.2.0', '0.1'],
    'from nothing: every one',
  );

  assert.deepEqual(
    [verCmp('0.2', '0.2.0'), verCmp('0.10.0', '0.9.3'), verCmp('0.2.1', '0.2'), verCmp(null, '0.1'), verCmp('x', 'y')],
    [0, 1, 1, -1, 0],
  );

  assert.deepEqual([relName('0.2.0'), relName('0.2.3'), relName('1.0')], ['0.2', '0.2.3', '1.0']);
});

test(
  'releases: the newest release taken, not the tip, with its notes; a version line that is no release; every commit when asked; a release not signed refused',
  { timeout: 90_000 },
  async () => {
    const testProject = project();
    const dir = tmpDir('peix-');

    const srv = await startTestServer({ dir, env: { ...testProject.env, UPDATE_CHANNEL: 'releases' } });
    const look = async (body = {}) => (await srv.post('api/update', body)).body;

    const put = async body =>
      srv.api('api/update', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    try {
      await waitFor(async () => (await srv.api('api/update')).body.checkout, { what: 'the checkout read at boot' });
      const first = testProject.head();

      // commits and no release: nothing to take — the tip's commits past it said as such
      testProject.push({ 'public/index.html': `${PAGE}<!-- a -->\n` }, 'a');
      let st = await look();

      assert.deepEqual(
        [st.channel, st.why, st.behind, st.past, st.release, st.notes, testProject.head()],
        ['releases', 'current', 0, 1, null, [], first],
      );

      // a release, and a commit past it: the release is what the board would take, its notes beside it
      const r2 = testProject.release('0.2.0', '### New\n\n- **Space** lays every chat out as a node\n');
      const commitB = testProject.push({ 'public/index.html': `${PAGE}<!-- b -->\n` }, 'b');

      st = await look();

      assert.deepEqual(
        [st.why, st.up, st.tip, st.behind, st.past, st.release, st.sign.ok],
        ['off', r2, commitB, 2, 1, '0.2.0', true],
      );

      assert.deepEqual(
        st.notes.map(note => [note.version, note.title]),
        [['0.2.0', '27 November 2026']],
      );

      assert.match(st.notes[0].md, /\*\*Space\*\* lays every chat out/);

      assert.deepEqual(
        st.commits.map(commit => commit.s),
        ['Release 0.2.0', 'a'],
        'the commits it brings, none past it',
      );

      // update now: onto the release, no further
      st = await look({ apply: true });

      assert.deepEqual(
        [testProject.head(), st.why, st.running, st.last.release, st.last.to, st.last.count, st.past],
        [r2, 'current', '0.2.0', '0.2.0', r2, 2, 1],
      );

      let whatsNew = (await srv.api('api/update/notes?since=0.1.0')).body;

      assert.deepEqual(
        [whatsNew.running, whatsNew.notes.map(note => note.version)],
        ['0.2.0', ['0.2.0']],
        "What's new's: the notes after the release its page last showed",
      );

      whatsNew = (await srv.api('api/update/notes?since=0.2')).body;
      assert.deepEqual(whatsNew.notes, [], 'none after the one it is on');

      // a line naming "version" changed, the version not: no release
      testProject.push(
        { 'package.json': '{ "name": "tiny", "version": "0.2.0", "description": "version two" }\n' },
        'a word',
      );

      st = await look();
      assert.deepEqual([st.why, st.behind, st.past, st.release], ['current', 0, 2, null]);

      // two releases at once: the newer taken, the notes of both, newest first
      const r3 = testProject.release('0.3.0', '- three\n');
      const r4 = testProject.release('0.4.0', '- four\n');

      st = await look();

      assert.deepEqual(
        [st.up, st.release, st.behind, st.past, st.notes.map(note => note.version)],
        [r4, '0.4.0', 4, 0, ['0.4.0', '0.3.0']],
      );

      assert.notEqual(r3, r4);

      // every commit (Settings' Follow): the tip, the newest release among its commits named; kept across a restart
      const commitC = testProject.push({ 'public/index.html': `${PAGE}<!-- c -->\n` }, 'c');
      const bad = await put({ channel: 'nightly' });

      assert.equal(bad.status, 400);
      st = (await put({ channel: 'main' })).body;

      assert.deepEqual(
        [st.channel, st.up, st.behind, st.past, st.release, st.notes.map(note => note.version)],
        ['main', commitC, 5, 0, '0.4.0', ['0.4.0', '0.3.0']],
      );

      await srv.restart();

      st = await waitFor(
        async () => {
          const status = (await srv.api('api/update')).body;

          return status.checkout && status;
        },
        { what: 'the checkout read again' },
      );

      assert.equal(st.channel, 'main', 'the pick is the state file’s');

      // back on releases: a release no trusted key signed is not taken, update now neither
      st = (await put({ channel: 'releases' })).body;
      assert.deepEqual([st.channel, st.up, st.release], ['releases', r4, '0.4.0']);
      const rogue = testProject.keygen('rogue');

      testProject.release('0.5.0', '- five\n', { sign: rogue });
      st = await look({ apply: true });

      assert.deepEqual(
        [st.why, st.release, testProject.head(), st.sign.ok],
        ['unsigned', '0.5.0', r2, false],
        'refused, the checkout where it was',
      );

      assert.match(st.error || st.sign.why, /not signed by a key this board trusts/);
    } finally {
      await srv.stop();
    }
  },
);

test(
  'make update on releases: nothing but a release taken, and its notes printed after',
  { timeout: 60_000 },
  async () => {
    const testProject = project();
    const dir = tmpDir('peix-');

    const srv = await startTestServer({ dir, env: { ...testProject.env, UPDATE_CHANNEL: 'releases' } });

    try {
      await waitFor(async () => (await srv.api('api/update')).body.checkout, { what: 'the checkout read at boot' });
      const first = testProject.head();

      testProject.push({ 'public/index.html': `${PAGE}<!-- a -->\n` }, 'a');
      let result = await makeUpdate(srv.port, dir);

      assert.equal(result.code, 0, result.out);
      assert.match(result.out, /, from origin\/main, its releases$/m);
      assert.match(result.out, /^no release yet — origin\/main has 1 commit past it/m);
      assert.equal(testProject.head(), first, 'a commit is no release');
      const r2 = testProject.release('0.2.0', '### New\n\n- **Space** lays every chat out as a node\n');
      const run = makeUpdate(srv.port, dir);

      // package.json moved: the server restarted, as launchd.sh does — the notes are asked of the new one
      await waitFor(() => testProject.asked().includes('restart restart --detached'), {
        what: 'the restart asked for',
      });

      await srv.restart();
      result = await run;
      assert.equal(result.code, 0, result.out);
      assert.equal(testProject.head(), r2);
      assert.match(result.out, /^updated [0-9a-f]{7} → [0-9a-f]{7}, to 0\.2, 2 commits: /m);

      assert.match(
        result.out,
        /^## 0\.2 — 27 November 2026\n\n### New\n\n- \*\*Space\*\* lays every chat out as a node$/m,
      );
    } finally {
      await srv.stop();
    }
  },
);
