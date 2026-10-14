// Which PRs the registry poll asks GitHub about: by how recently their chat was touched — a word in it, or a page
// opening it — every minute, five, thirty, then not at all; never twice once merged or closed. Pure: duePrs. And gh
// failing as a whole, through a throwaway server: nothing changes, and the polls pause.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { makeFixture } from '../scripts/fixture.mjs';

const tmp = tmpDir('peix-test-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { newSession, notePr, notePrs, duePrs, prStatus } = await import('../server.mjs');

const NOW = Date.UTC(2026, 8, 28, 12);
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const url = n => `https://github.com/acme/r/pull/${n}`;
function chat(id, touched, ...prs) {
  const s = newSession(id, `/x/${id}.jsonl`);
  s.lastActivity = new Date(NOW - touched).toISOString();
  for (const n of prs) notePr(s, url(n), s.lastActivity, 'user');
  return s;
}
const checked = (n, ago, state = 'open') => prStatus.set(url(n), { state, title: 'PR ' + n, checkedAt: NOW - ago });
const due = list => duePrs(list, NOW).map(u => Number(u.split('/').pop()));

test('never asked about is due whatever the chat\'s age, the most recently touched chat\'s first', () => {
  prStatus.clear();
  assert.deepEqual(due([chat('a', 10 * DAY, 1), chat('b', 2 * MIN, 2), chat('c', 2 * DAY, 3)]), [2, 3, 1]);
});

test('the older the chat, the less often: a minute, five minutes, half an hour, then never', () => {
  prStatus.clear();
  const list = [chat('h', 10 * MIN, 1), chat('d', 5 * HOUR, 2), chat('w', 2 * DAY, 3), chat('o', 4 * DAY, 4)];
  for (const n of [1, 2, 3, 4]) checked(n, 90_000);
  assert.deepEqual(due(list), [1]);
  for (const n of [1, 2, 3, 4]) checked(n, 6 * MIN);
  assert.deepEqual(due(list), [1, 2]);
  for (const n of [1, 2, 3, 4]) checked(n, 31 * MIN);
  assert.deepEqual(due(list), [1, 2, 3]);
  for (const n of [1, 2, 3, 4]) checked(n, 30 * DAY);
  assert.deepEqual(due(list), [1, 2, 3]);   // four days old: asked once at boot, then left alone
});

test('opening a chat makes its PRs recent again', () => {
  prStatus.clear();
  const s = chat('o', 5 * DAY, 1);
  checked(1, 2 * MIN);
  assert.deepEqual(due([s]), []);
  s.openedAt = NOW - 30 * MIN;
  assert.deepEqual(due([s]), [1]);
});

test('a PR in two chats goes by the more recent one', () => {
  prStatus.clear();
  checked(1, 2 * MIN);
  assert.deepEqual(due([chat('old', 5 * DAY, 1)]), []);
  assert.deepEqual(due([chat('old', 5 * DAY, 1), chat('new', 5 * MIN, 1)]), [1]);
});

test('merged and closed are never asked twice; one we cannot see backs off an hour', () => {
  prStatus.clear();
  const s = chat('h', MIN, 1, 2, 3);
  checked(1, DAY, 'merged'); checked(2, DAY, 'closed'); checked(3, 30 * MIN, null);
  assert.deepEqual(due([s]), []);
  checked(3, 61 * MIN, null);
  assert.deepEqual(due([s]), [3]);
});

test('a PR you wrote or reviewed is watched by its own last event, whatever its chat', () => {
  prStatus.clear();
  const s = chat('o', 20 * DAY, 1, 2, 3, 4);
  const watched = (n, last, ago) => prStatus.set(url(n), { state: 'open', title: 'PR ' + n, turn: { you: false, last: new Date(NOW - last).toISOString() }, checkedAt: NOW - ago });
  watched(1, HOUR, 3 * MIN); watched(2, 5 * DAY, 3 * MIN); watched(3, 5 * DAY, 11 * MIN); watched(4, 20 * DAY, 11 * MIN);
  assert.deepEqual(due([s]).sort(), [1, 3]);   // two minutes within two days of its last event, ten within two weeks, then the chat's pace
});

test('a PR\'s number is one GraphQL takes: none with a leading zero, none past 2^31−1 (2026-10-14)', () => {
  const s = newSession('nums', '/x/nums.jsonl');
  notePrs(s, 'https://github.com/acme/widgets/pull/012 and https://github.com/acme/widgets/pull/12, https://github.com/acme/widgets/pull/99999999999, https://github.com/acme/widgets/pull/2147483647 and https://github.com/acme/widgets/pull/2147483648', NOW, 'user');
  assert.deepEqual(s.prs.map(p => p.label), ['widgets#2147483647', 'widgets#12'], '012 is no second #12, and the rest no PR at all');
});

test('a batch GitHub refuses as a whole is asked again in halves: the rest answered, the one it will not take let be (2026-10-14)', { timeout: 60_000 }, async () => {
  const dir = tmpDir('peix-gh-'), prs = join(dir, 'prs.json'), gh = join(dir, 'gh.mjs'), calls = join(dir, 'calls');
  writeFileSync(prs, JSON.stringify({ 'acme/widgets#1': { state: 'OPEN', title: 'One' }, 'acme/widgets#2': { state: 'MERGED', title: 'Two' }, 'acme/widgets#3': { state: 'OPEN', title: 'Three' } }));
  // GitHub's answer to a query it cannot run — a parse error points into it — whenever the batch holds acme/refused
  writeFileSync(gh, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const q = process.argv.find(a => a.startsWith('query=')) || '';
appendFileSync(${JSON.stringify(calls)}, (q.match(/ p\\d+: /g) || []).length + '\\n');
if (q.includes('name: "refused"')) { console.log(JSON.stringify({ errors: [{ message: 'Parse error on "4" (INT) at [1, 99]', locations: [{ line: 1, column: 99 }] }] })); console.error('gh: Parse error'); process.exit(1); }
await import(${JSON.stringify(fileURLToPath(new URL('../scripts/fakegh.mjs', import.meta.url)))});
`, { mode: 0o755 });
  const pull = (repo, n) => `https://github.com/acme/${repo}/pull/${n}`;
  const fx = makeFixture(tmpDir('peix-fx-'), [{ cwd: '/Users/test/widgets', prompt: `Look at ${pull('widgets', 1)}, ${pull('refused', 4)}, ${pull('widgets', 2)} and ${pull('widgets', 3)}`, reply: 'ok' }]);
  const srv = await startTestServer({ claudeDir: fx.dir, env: { GH_BIN: gh, FAKEGH_PRS: prs } });
  try {
    const states = async () => Object.fromEntries((await srv.api('api/sessions')).body.sessions[0].prs.map(p => [p.label, p.state]));
    await waitFor(async () => (await states())['widgets#1'] === 'open', { timeout: 45_000, what: 'the PRs beside the refused one answered' });
    assert.deepEqual(await states(), { 'widgets#3': 'open', 'widgets#2': 'merged', 'refused#4': null, 'widgets#1': 'open' });
    const asked = readFileSync(calls, 'utf8').trim().split('\n').map(Number);
    assert.deepEqual(asked.slice(0, 5), [4, 2, 2, 1, 1], 'all four, then in halves down to the one it refused — each asked once');
    assert.match(srv.logText(), /GitHub refused the query for https:\/\/github\.com\/acme\/refused\/pull\/4/);
  } finally { await srv.stop(); }
});

test('gh failing as a whole changes nothing, and the polls pause until an answer comes (2026-10-14)', { timeout: 90_000 }, async () => {
  const dir = tmpDir('peix-ghfail-'), prs = join(dir, 'prs.json'), fail = join(dir, 'fail');
  const pr = (state, title) => writeFileSync(prs, JSON.stringify({ 'acme/widgets#7': { state, title } }));
  pr('OPEN', 'First title'); writeFileSync(fail, 'HTTP 502: Bad Gateway (https://api.github.com/graphql)');
  const fx = makeFixture(join(dir, 'claude'), [{ cwd: '/Users/test/widgets', prompt: 'Look at https://github.com/acme/widgets/pull/7', reply: 'Looked.' }]);
  const id = fx.chats[0].id;
  // PR_TTL_MS at 1 ms: opening the chat always asks, the way to put a call through a pause
  const srv = await startTestServer({ claudeDir: fx.dir, env: { FAKEGH_PRS: prs, FAKEGH_FAIL: fail, PR_TTL_MS: '1' } });
  const failed = () => (srv.logText().match(/\] pr status: gh: HTTP 502/g) || []).length;
  const seen = async () => { const p = (await srv.api('api/sessions')).body.sessions.find(s => s.id === id).prs[0]; return { state: p.state, title: p.title }; };
  const open = () => srv.api(`api/sessions/${id}/messages`);
  try {
    await waitFor(() => failed() === 1, { what: 'the boot\'s ask, failed' });
    await sleep(4000);   // three registry polls, each of which would ask again for a PR never answered
    assert.equal(failed(), 1, 'paused: no poll asks again');
    assert.deepEqual(await seen(), { state: null, title: null });
    rmSync(fail);
    await sleep(2500);
    assert.deepEqual(await seen(), { state: null, title: null }, 'gh would answer now, and the polls still wait');
    await open();
    assert.deepEqual(await waitFor(async () => (await seen()).state && seen(), { what: 'the PR, asked on opening the chat' }), { state: 'open', title: 'First title' });

    pr('MERGED', 'Renamed'); writeFileSync(fail, 'HTTP 502: Bad Gateway (https://api.github.com/graphql)');
    const turns = () => JSON.stringify(JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).prTurns), before = turns();
    await open();
    await waitFor(() => failed() === 2, { what: 'the second ask, failed' });
    await sleep(500);
    assert.deepEqual(await seen(), { state: 'open', title: 'First title' }, 'what the card showed stands');
    assert.equal(turns(), before, 'nor what the state file keeps of it');
    rmSync(fail);
    await open();
    assert.deepEqual(await waitFor(async () => (await seen()).state === 'merged' && seen(), { what: 'the PR merged' }), { state: 'merged', title: 'Renamed' });
  } finally { await srv.stop(); }
});
