// A PR's history (2026-10-15): the events of each look into its ledger, merged by id, and its rounds — a move come round
// to you and how it ended. prEvents is pure; setPrInfo keeps the ledger as GitHub's looks come; the server keeps it over a
// restart and hands it to the page (GET /api/sessions/:id/prlog).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { makeFixture } from '../scripts/fixture.mjs';

const tmp = tmpDir('peix-test-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { prTurn, prEvents, logEvents, setPrInfo, waiveTurn, newSession, notePr, sessions, prLogs, prTurns, prStatus } = await import('../server.mjs');

const t = (h, m = 0) => new Date(Date.UTC(2026, 9, 15, h, m)).toISOString().replace('.000', '');   // GitHub writes no milliseconds
const at = (h, m = 0) => Date.UTC(2026, 9, 15, h, m);
const user = login => ({ login, __typename: 'User' });
const commit = (h, login, m = 0) => ({ __typename: 'PullRequestCommit', commit: { committedDate: t(h, m), author: { user: login ? { login } : null } } });
const force = (h, login) => ({ __typename: 'HeadRefForcePushedEvent', createdAt: t(h), actor: user(login) });
/** Your own PR, opened at 8:00. */
const mine = (o = {}) => ({ state: 'OPEN', createdAt: t(8), headRefOid: 'A', author: user('me'), viewerLatestReview: null,
  reviewRequests: { nodes: [] }, reviews: { nodes: [] }, comments: { nodes: [] }, pushes: { nodes: [commit(8, 'me')] }, asks: { nodes: [] }, ...o });
const word = (h, login, m = 0) => ({ author: user(login), createdAt: t(h, m) });

test('a look\'s events: who opened, reviewed, commented, pushed and asked — you as \'\', no bots, a rebase one push', () => {
  const pr = mine({
    reviews: { nodes: [{ author: user('ana'), state: 'COMMENTED', submittedAt: t(9) }, { author: user('ana'), state: 'PENDING', submittedAt: t(9, 30) }] },
    comments: { nodes: [word(10, 'rui'), word(10, 'renovate[bot]'), { author: { login: 'ci', __typename: 'Bot' }, createdAt: t(10, 5) }] },
    pushes: { nodes: [commit(11, 'me'), commit(11, 'me'), commit(11, 'me'), force(12, 'bob')] },
    asks: { nodes: [{ createdAt: t(13), requestedReviewer: { login: 'me' } }, { createdAt: t(13, 5), requestedReviewer: { login: 'ana' } }] } });
  const ev = prEvents(pr, 'me');
  assert.deepEqual(ev.map(e => [e.k, e.w, e.a, e.n ?? null, e.s ?? e.f ?? null]), [
    ['opened', '', t(8), null, null],
    ['review', 'ana', t(9), null, 'COMMENTED'],
    ['comment', 'rui', t(10), null, null],
    ['push', '', t(11), 3, null],
    ['push', 'bob', t(12), null, 1],
    ['ask', null, t(13), null, null],
  ]);
  assert.equal(new Set(ev.map(e => e.id)).size, ev.length, 'each its own id');
  assert.deepEqual(prEvents(mine({ pushes: { nodes: [commit(9, null)] } }), 'me').map(e => [e.k, e.w]), [['opened', ''], ['push', '']], 'a commit tied to no one is the author\'s');
  assert.deepEqual(prEvents(null, 'me'), []);
});

test('the ledger takes an event once and gives none back: a short look loses nothing, a full one stays put', () => {
  const url = 'https://github.com/acme/r/pull/1';
  const all = prEvents(mine({ comments: { nodes: [word(9, 'ana'), word(10, 'rui')] } }), 'me');
  assert.equal(logEvents(url, all), true);
  assert.equal(logEvents(url, all), false, 'the same look again: nothing new');
  assert.equal(logEvents(url, all.slice(0, 1)), false, 'a look that lacks some takes none away');
  assert.deepEqual(prLogs[url].ev.map(e => e.k), ['opened', 'push', 'comment', 'comment']);
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `comment:ana:${i}`, k: 'comment', w: 'ana', a: t(12, i) }));
  logEvents(url, many);
  assert.equal(prLogs[url].ev.length, 16, 'sixteen at most, the newest');
  assert.equal(prLogs[url].ev[0].a, t(12, 4));
  assert.equal(logEvents(url, [...all, ...many]), false, 'what fell off the front stays out — GitHub\'s window still holds it');
});

test('a round opens at your move, stays open through a look that misses it, and closes on your word', () => {
  const url = 'https://github.com/acme/r/pull/2';
  const s = newSession('rounds', '/x/rounds.jsonl'); sessions.set(s.id, s);
  s.lastActivity = new Date(at(8)).toISOString(); notePr(s, url, s.lastActivity, 'user');
  const look = (o, h, m = 0) => setPrInfo(url, 'open', 'PR', prTurn(mine(o), 'me', prTurns[url]?.said), at(h, m));
  const rounds = () => s.prs[0].rounds?.map(r => ({ from: r.from, why: r.why, end: r.end ?? null, how: r.how ?? null, them: !!r.them }));
  look({}, 9);
  assert.equal(s.prs[0].rounds, null, 'theirs from the start: no round');
  const ana = { reviews: { nodes: [{ author: user('ana'), state: 'COMMENTED', submittedAt: t(10) }] } };
  look(ana, 10, 5);
  assert.deepEqual(rounds(), [{ from: t(10), why: '1 comment from ana', end: null, how: null, them: false }], 'opened at GitHub\'s time for it');
  look({ ...ana, reviews: { nodes: [] } }, 10, 10);
  assert.deepEqual(rounds().map(r => [r.end, r.them]), [[null, true]], 'a look without the review: still open, marked');
  look(ana, 10, 15);
  assert.deepEqual(rounds().map(r => [r.end, r.them]), [[null, false]], 'back: the mark goes, one round still');
  const rui = { ...ana, comments: { nodes: [word(10, 'rui', 20)] } };
  look(rui, 10, 25);
  assert.deepEqual(rounds().map(r => [r.from, r.why]), [[t(10), '2 comments from ana, rui']], 'more news, the same round');
  look({ ...rui, comments: { nodes: [word(10, 'rui', 20), word(11, 'me')] } }, 11, 5);
  assert.deepEqual(rounds().map(r => [r.end, r.how]), [[t(11), 'answered']], 'your word closes it, at its time');
  look({ ...rui, comments: { nodes: [word(10, 'rui', 20), word(11, 'me'), word(12, 'ana')] } }, 12, 5);
  assert.deepEqual(rounds().map(r => [r.from, r.how]), [[t(10), 'answered'], [t(12), null]], 'the next move, the next round');
});

test('a round let go ends when the next move comes; one whose reason went ends as gone, an hour on', () => {
  const url = 'https://github.com/acme/r/pull/3';
  const s = newSession('letgo', '/x/letgo.jsonl'); sessions.set(s.id, s);
  s.lastActivity = new Date(at(8)).toISOString(); notePr(s, url, s.lastActivity, 'user');
  const look = (o, h, m = 0) => setPrInfo(url, 'open', 'PR', prTurn(mine(o), 'me', prTurns[url]?.said), at(h, m));
  const approved = { reviews: { nodes: [{ author: user('priya'), state: 'APPROVED', submittedAt: t(9) }] } };
  look(approved, 9, 5);
  assert.equal(waiveTurn(url), true);
  assert.ok(s.prs[0].rounds[0].let, 'the round says when it was let go');
  assert.deepEqual(prLogs[url].ev.filter(e => e.k === 'board').map(e => e.x), ['let go'], 'and the ledger, that it was');
  look(approved, 9, 30);
  assert.equal(s.prs[0].rounds.length, 1, 'the same round on the next look');
  const more = { reviews: { nodes: [...approved.reviews.nodes, { author: user('kenji'), state: 'COMMENTED', submittedAt: t(10) }] } };
  look(more, 10, 5);
  assert.deepEqual(s.prs[0].rounds.map(r => r.how ?? null), ['let go', null], 'let go, then kenji: a round of its own');
  // their move with no word of yours since — the reviews taken back — is marked, then gone an hour on
  look({}, 10, 10);
  assert.ok(s.prs[0].rounds[1].them && !s.prs[0].rounds[1].end);
  look({}, 11, 5);
  assert.ok(!s.prs[0].rounds[1].end, 'within the hour: still open');
  look({}, 11, 15);
  assert.deepEqual(s.prs[0].rounds.map(r => r.how), ['let go', 'gone']);
  setPrInfo(url, 'merged', 'PR', null, at(12));
  assert.equal(prLogs[url], undefined, 'merged: its history goes with it');
  assert.equal(s.prs[0].rounds, null);
});

test('the server keeps a PR\'s history over a restart and hands it to the page', { timeout: 90_000 }, async () => {
  const dir = tmpDir('peix-prlog-'), prs = join(dir, 'prs.json');
  const now = Date.now(), iso = min => new Date(now - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
  writeFileSync(prs, JSON.stringify({ 'acme/widgets#5': { state: 'OPEN', title: 'Five', createdAt: iso(120), author: { login: 'me', __typename: 'User' },
    reviews: { nodes: [{ author: { login: 'ana', __typename: 'User' }, state: 'CHANGES_REQUESTED', submittedAt: iso(30) }] }, pushes: { nodes: [{ __typename: 'PullRequestCommit', commit: { committedDate: iso(119), author: { user: { login: 'me' } } } }] } } }));
  const fx = makeFixture(join(dir, 'claude'), [{ cwd: '/Users/test/widgets', prompt: 'Open https://github.com/acme/widgets/pull/5', reply: 'Opened.' }]);
  const id = fx.chats[0].id;
  const srv = await startTestServer({ claudeDir: fx.dir, env: { FAKEGH_PRS: prs } });
  try {
    const log = async () => (await srv.api(`api/sessions/${id}/prlog`)).body.prs[0];
    await waitFor(async () => (await log())?.rounds?.length === 1, { timeout: 30_000, what: 'the round at your move' });
    const first = await log();
    assert.deepEqual(first.ev.map(e => [e.k, e.w, e.s ?? null]), [['opened', '', null], ['push', '', null], ['review', 'ana', 'CHANGES_REQUESTED']]);
    assert.deepEqual([first.rounds[0].from, first.rounds[0].why], [iso(30), 'changes asked by ana']);
    const card = (await srv.api('api/sessions')).body.sessions.find(s => s.id === id).prs[0];
    assert.deepEqual(card.rounds.map(r => r.why), ['changes asked by ana'], 'the chat\'s PR carries its rounds');
    await srv.restart();
    await waitFor(async () => (await srv.api('api/sessions')).body?.sessions?.length === 1, { what: 'the server back' });
    const back = await log();
    assert.deepEqual(back.ev.map(e => e.id), first.ev.map(e => e.id), 'the events kept');
    assert.deepEqual(back.rounds, first.rounds, 'the rounds kept');
  } finally { await srv.stop(); }
});
