// The chat's timeline reads a PR's ledger (2026-10-17): every PR a chat shows keeps one, not only those you have a turn
// on; 150 events and 30 rounds; past a merge or a close while a chat not done for good names it; and it says when GitHub
// holds more before what it kept (`older`). GET /api/sessions/:id/prlog hands the page every PR the chat shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { makeFixture } from '../scripts/fixture.mjs';

const tmp = tmpDir('peix-test-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { prEvents, logEvents, noteRounds, setPrInfo, prTurn, newSession, notePr, sessions, prLogs, prTurns, pruneLogs, doneMarks, forGoodMarks } = await import('../server.mjs');

const t = (h, m = 0, sec = 0) => new Date(Date.UTC(2026, 9, 17, h, m, sec)).toISOString().replace('.000', '');
const at = (h, m = 0) => Date.UTC(2026, 9, 17, h, m);
const user = login => ({ login, __typename: 'User' });
const word = (h, login, m = 0) => ({ author: user(login), createdAt: t(h, m) });
const pr = (o = {}) => ({ state: 'OPEN', createdAt: t(8), headRefOid: 'A', author: user('kenji'), viewerLatestReview: null,
  reviewRequests: { nodes: [] }, reviews: { nodes: [] }, comments: { nodes: [] }, pushes: { nodes: [] }, asks: { nodes: [] }, ...o });
const DAY = 24 * 60 * 60_000;

test('a full window\'s oldest the ledger never had says GitHub holds more before it', () => {
  const url = 'https://github.com/acme/r/pull/10';
  const few = prEvents(pr({ comments: { nodes: [word(9, 'ana'), word(10, 'rui')] } }), 'me');
  assert.equal(few.some(e => e.edge), false, 'a window not full: all of it was seen');
  logEvents(url, few);
  assert.equal(prLogs[url].older, undefined);
  const twenty = Array.from({ length: 20 }, (_, i) => word(11, 'ana', i));
  const full = prEvents(pr({ comments: { nodes: twenty } }), 'me');
  assert.deepEqual(full.filter(e => e.edge).map(e => e.a), [t(11)], 'the oldest of a full window is marked');
  logEvents(url, full);
  assert.equal(prLogs[url].older, 1, 'the ledger had not got it: there may be more before');
  assert.equal(prLogs[url].ev.some(e => 'edge' in e), false, 'the mark is never kept');
  const url2 = 'https://github.com/acme/r/pull/11';
  logEvents(url2, prEvents(pr({ comments: { nodes: twenty.slice(0, 19) } }), 'me'));
  logEvents(url2, prEvents(pr({ comments: { nodes: [...twenty.slice(1, 19), word(12, 'rui'), word(12, 'ana', 1)] } }), 'me'));
  assert.equal(prLogs[url2].older, undefined, 'a full window whose oldest an earlier look saw: nothing missed between');
});

test('a PR you never touched gets a ledger, its rounds only once you have a turn; thirty at most', () => {
  const url = 'https://github.com/acme/r/pull/12';
  const s = newSession('ledger', '/x/ledger.jsonl'); sessions.set(s.id, s);
  s.lastActivity = new Date(at(8)).toISOString(); notePr(s, url, s.lastActivity, 'user');
  assert.equal(prTurn(pr(), 'me'), null, 'kenji\'s PR, nothing of yours on it: no turn');
  logEvents(url, prEvents(pr(), 'me'));
  setPrInfo(url, 'open', 'Theirs', prTurn(pr(), 'me'), at(9));
  assert.deepEqual(prLogs[url].ev.map(e => [e.k, e.w]), [['opened', 'kenji']]);
  assert.deepEqual(prLogs[url].r, [], 'no rounds without a turn');
  assert.ok(s.prs[0].logged > 0, 'the chat\'s PR carries the ledger\'s count, so the page knows to ask');
  const was = s.prs[0].logged;
  logEvents(url, prEvents(pr({ comments: { nodes: [word(10, 'ana')] } }), 'me'));
  setPrInfo(url, 'open', 'Theirs', null, at(10));
  assert.ok(s.prs[0].logged > was, 'a new event moves it');
  // thirty rounds at most
  const u2 = 'https://github.com/acme/r/pull/13';
  for (let i = 0; i < 35; i++) {
    noteRounds(u2, { you: true, why: `round ${i}`, at: t(9, i) }, true, at(9, i));
    noteRounds(u2, { you: false, said: t(9, i, 30) }, false, at(9, i) + 40_000);
  }
  assert.equal(prLogs[u2].r.length, 30, 'thirty rounds, the newest (six before 2026-10-17)');
  assert.equal(prLogs[u2].r[0].why, 'round 5');
});

test('a merged PR keeps its ledger while a chat not done for good names it, LOG_KEEP_MS after the last day one did', () => {
  const url = 'https://github.com/acme/r/pull/14';
  const s = newSession('merged', '/x/merged.jsonl'); sessions.set(s.id, s);
  s.lastActivity = new Date(at(8)).toISOString(); notePr(s, url, s.lastActivity, 'user');
  logEvents(url, prEvents(pr({ author: user('me') }), 'me'));
  setPrInfo(url, 'merged', 'Mine', null, at(12));
  pruneLogs(at(12));
  assert.ok(prLogs[url], 'merged, and the chat names it: kept');
  assert.equal(prLogs[url].seen, '2026-10-17', 'the day a chat last named it');
  doneMarks[s.id] = forGoodMarks[s.id] = new Date(at(13)).toISOString();
  pruneLogs(at(13));
  assert.ok(prLogs[url], 'the chat done for good: kept a while yet');
  pruneLogs(at(13) + 31 * DAY);
  assert.equal(prLogs[url], undefined, 'a month on with only a chat done for good naming it: gone');
  delete doneMarks[s.id]; delete forGoodMarks[s.id];
  // no chat names it at all
  const u2 = 'https://github.com/acme/r/pull/15';
  logEvents(u2, prEvents(pr(), 'me'));
  pruneLogs(at(14));
  assert.equal(prLogs[u2], undefined, 'never named by a chat: gone at once');
  // a PR with a turn's record and no chat: kept, as its record is
  const u3 = 'https://github.com/acme/r/pull/16';
  logEvents(u3, prEvents(pr(), 'me')); prTurns[u3] = { key: 'x', at: new Date(at(14)).toISOString() };
  pruneLogs(at(14));
  assert.ok(prLogs[u3]);
  delete prTurns[u3];
});

test('/prlog lists every PR the chat shows, and the state file keeps each ledger on a line', { timeout: 90_000 }, async () => {
  const dir = tmpDir('peix-ledger-'), prs = join(dir, 'prs.json');
  const now = Date.now(), iso = min => new Date(now - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
  writeFileSync(prs, JSON.stringify({
    'acme/widgets#5': { state: 'OPEN', title: 'Five', createdAt: iso(120), author: { login: 'kenji', __typename: 'User' },
      comments: { nodes: [{ author: { login: 'ana', __typename: 'User' }, createdAt: iso(30) }] } },
    'acme/widgets#6': { state: 'MERGED', title: 'Six', createdAt: iso(200), author: { login: 'me', __typename: 'User' } },
  }));
  const fx = makeFixture(join(dir, 'claude'), [{ cwd: '/Users/test/widgets', prompt: 'Look at https://github.com/acme/widgets/pull/5 and https://github.com/acme/widgets/pull/6', reply: 'Looked.' }]);
  const id = fx.chats[0].id;
  const srv = await startTestServer({ claudeDir: fx.dir, env: { FAKEGH_PRS: prs } });
  try {
    const log = async () => (await srv.api(`api/sessions/${id}/prlog`)).body;
    await waitFor(async () => (await log())?.prs?.length === 2 && (await log()).prs.every(p => p.ev.length), { timeout: 30_000, what: 'both PRs in the ledger' });
    const body = await log();
    const five = body.prs.find(p => p.label === 'widgets#5'), six = body.prs.find(p => p.label === 'widgets#6');
    assert.deepEqual(Object.keys(five).sort(), ['ev', 'label', 'older', 'rounds', 'state', 'url']);
    assert.deepEqual([five.state, six.state], ['OPEN', 'MERGED'], 'GitHub\'s spelling');
    assert.deepEqual(five.ev.map(e => [e.k, e.w]), [['opened', 'kenji'], ['comment', 'ana']], 'kenji\'s PR, no turn of yours: its events all the same');
    assert.deepEqual([five.rounds, five.older], [[], false]);
    assert.deepEqual(six.ev.map(e => e.k), ['opened'], 'a merged PR the chat names keeps its ledger');
    await waitFor(() => /"prLogs": \{\n {2}"https/.test(readFileSync(join(srv.dir, 'state.json'), 'utf8')), { what: 'the state saved' });
    const file = readFileSync(join(srv.dir, 'state.json'), 'utf8'), st = JSON.parse(file);
    assert.equal(Object.keys(st.prLogs).length, 2);
    for (const url of Object.keys(st.prLogs)) assert.ok(file.includes(`  ${JSON.stringify(url)}: {"ev":[`), 'a ledger on one line');
  } finally { await srv.stop(); }
});
