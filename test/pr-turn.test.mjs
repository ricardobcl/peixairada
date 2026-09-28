// Whose move a PR is at, and what that does to a done tick (2026-09-28). prTurn reads what GitHub's GraphQL answers
// for PR_FIELDS; setPrInfo keeps the board's record of when each move became news, and isDone weighs the tick by it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'peix-test-'));
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { prTurn, prPeople, setPrInfo, isDone, doneMarks, newSession, notePr, sessions, prStatus } = await import('../server.mjs');

const t = h => new Date(Date.UTC(2026, 8, 28, h)).toISOString().replace('.000', '');   // GitHub writes no milliseconds
const user = login => ({ login, __typename: 'User' });
/** A PR as PR_FIELDS brings it back: `me` reviewed `author`'s PR at 10:00 on commit A. */
function pr(o = {}) {
  return {
    state: 'OPEN', createdAt: t(8), headRefOid: 'A', author: user('ana'),
    viewerLatestReview: { submittedAt: t(10), commit: { oid: 'A' } },
    reviewRequests: { nodes: [] },
    reviews: { nodes: [{ author: user('me'), state: 'COMMENTED', submittedAt: t(10) }] },
    comments: { nodes: [] },
    pushes: { nodes: [{ __typename: 'PullRequestCommit', commit: { committedDate: t(9), author: { user: { login: 'ana' } } } }] },
    asks: { nodes: [] },
    ...o
  };
}
const commit = (h, login) => ({ __typename: 'PullRequestCommit', commit: { committedDate: t(h), author: { user: login ? { login } : null } } });

test('someone else\'s PR you reviewed: theirs to move until they push, reply, or ask again', () => {
  assert.deepEqual(prTurn(pr(), 'me'), { you: false, mine: false, why: 'waiting on ana', at: null, last: t(10), key: 'them' });
  const pushed = prTurn(pr({ headRefOid: 'B', pushes: { nodes: [commit(11, 'ana')] } }), 'me');
  assert.equal(pushed.you, true);
  assert.equal(pushed.why, 'pushed since your review');
  assert.equal(pushed.at, t(11));
  // the commit your review was on is what counts, not the clock: committed before your review, pushed after it
  assert.equal(prTurn(pr({ headRefOid: 'B', pushes: { nodes: [commit(9, 'ana')] } }), 'me').you, true);
  const replied = prTurn(pr({ reviews: { nodes: [...pr().reviews.nodes, { author: user('ana'), state: 'COMMENTED', submittedAt: t(12) }] }, comments: { nodes: [{ author: user('rui'), createdAt: t(13) }] } }), 'me');
  assert.deepEqual([replied.you, replied.why, replied.at], [true, '2 comments from ana, rui', t(13)]);
  const again = prTurn(pr({ reviewRequests: { nodes: [{ requestedReviewer: { login: 'me' } }] }, asks: { nodes: [{ createdAt: t(14), requestedReviewer: { login: 'me' } }] } }), 'me');
  assert.deepEqual([again.you, again.why, again.at], [true, 'your review asked for again', t(14)]);
});

test('nobody is waiting on you: bots, your own pushes, a push after you approved, words before yours', () => {
  assert.equal(prTurn(pr({ comments: { nodes: [{ author: { login: 'codecov', __typename: 'Bot' }, createdAt: t(12) }, { author: { login: 'ci[bot]', __typename: 'User' }, createdAt: t(12) }] } }), 'me').you, false);
  assert.equal(prTurn(pr({ headRefOid: 'B', pushes: { nodes: [commit(11, 'me')] } }), 'me').you, false);
  const approved = { reviews: { nodes: [{ author: user('me'), state: 'APPROVED', submittedAt: t(10) }] } };
  assert.equal(prTurn(pr({ ...approved, headRefOid: 'B', pushes: { nodes: [commit(11, 'ana')] } }), 'me').you, false);
  assert.equal(prTurn(pr({ comments: { nodes: [{ author: user('ana'), createdAt: t(9) }] } }), 'me').you, false);
});

test('no turn at all: merged, closed, or a PR you never touched', () => {
  assert.equal(prTurn(pr({ state: 'MERGED' }), 'me'), null);
  assert.equal(prTurn(pr({ state: 'CLOSED' }), 'me'), null);
  assert.equal(prTurn(pr({ viewerLatestReview: null, reviews: { nodes: [] } }), 'me'), null);
  assert.equal(prTurn(pr(), null), null);
});

test('your own PR: yours to move once someone reviews, comments or pushes after your last word', () => {
  const mine = o => pr({ author: user('me'), viewerLatestReview: null, reviews: { nodes: [] }, pushes: { nodes: [commit(9, 'me')] }, ...o });
  assert.deepEqual(prTurn(mine(), 'me'), { you: false, mine: true, why: 'waiting on reviews', at: null, last: t(9), key: 'them' });
  const reviewed = prTurn(mine({ reviews: { nodes: [{ author: user('rui'), state: 'CHANGES_REQUESTED', submittedAt: t(11) }, { author: user('ana'), state: 'APPROVED', submittedAt: t(12) }] } }), 'me');
  assert.deepEqual([reviewed.you, reviewed.mine, reviewed.why], [true, true, 'approved by ana · changes asked by rui']);
  // you pushed the fixes after: theirs again
  assert.equal(prTurn(mine({ reviews: { nodes: [{ author: user('rui'), state: 'CHANGES_REQUESTED', submittedAt: t(11) }] }, pushes: { nodes: [commit(13, 'me')] } }), 'me').you, false);
  // a commit GitHub cannot tie to anyone is the author's own
  assert.equal(prTurn(mine({ pushes: { nodes: [commit(13, null)] } }), 'me').you, false);
  const pushed = prTurn(mine({ pushes: { nodes: [commit(9, 'me'), commit(13, 'rui')] } }), 'me');
  assert.deepEqual([pushed.you, pushed.why], [true, 'rui pushed']);
});

test('a move un-ticks the chats that mention the PR, weighed by when the board learnt of it', () => {
  const url = 'https://github.com/acme/r/pull/7', at = (h, m = 0) => Date.UTC(2026, 8, 28, h, m);
  const s = newSession('tick', '/x/tick.jsonl');
  s.lastActivity = new Date(at(10)).toISOString(); notePr(s, url, s.lastActivity, 'user'); sessions.set(s.id, s);
  const them = prTurn(pr(), 'me'), comment = h => prTurn(pr({ comments: { nodes: [{ author: user('ana'), createdAt: t(h) }] } }), 'me');
  const tick = (h, m) => { doneMarks[s.id] = new Date(at(h, m)).toISOString(); };

  setPrInfo(url, 'open', 'PR', them, at(11));
  tick(11, 30); assert.equal(isDone(s), true, 'waiting on them: the tick holds');
  setPrInfo(url, 'open', 'PR', comment(12), at(13));
  assert.equal(isDone(s), false, 'the reply brings the chat back');
  tick(13, 30); assert.equal(isDone(s), true, 'ticked again after seeing it');
  setPrInfo(url, 'open', 'PR', comment(12), at(14));
  assert.equal(isDone(s), true, 'the same move is not news twice');
  // a move is news from when the board saw it, whatever GitHub's clock says of it
  setPrInfo(url, 'open', 'PR', prTurn(pr({ headRefOid: 'B', pushes: { nodes: [commit(9, 'ana')] }, comments: { nodes: [{ author: user('ana'), createdAt: t(12) }] } }), 'me'), at(15));
  assert.equal(isDone(s), false, 'a push the board saw at 15 un-ticks a 13:30 tick, though committed at 9');
  assert.equal(s.prs[0].turn.why, 'pushed since your review · 1 comment from ana');
  tick(16); setPrInfo(url, 'merged', 'PR', null, at(17));
  assert.equal(s.prs[0].turn, null, 'merged: no turn');
  assert.equal(isDone(s), true);
});

test('a PR the board has never looked at moves at GitHub\'s time for it, and one it cannot see keeps its record', () => {
  const url = 'https://github.com/acme/r/pull/8', at = (h, m = 0) => Date.UTC(2026, 8, 28, h, m);
  const s = newSession('first', '/x/first.jsonl');
  s.lastActivity = new Date(at(10)).toISOString(); notePr(s, url, s.lastActivity, 'user'); sessions.set(s.id, s);
  const reply = prTurn(pr({ comments: { nodes: [{ author: user('ana'), createdAt: t(12) }] } }), 'me');
  doneMarks[s.id] = new Date(at(13)).toISOString();
  setPrInfo(url, 'open', 'PR', reply, at(20));
  assert.equal(s.prs[0].turn.movedAt, new Date(at(12)).toISOString());
  assert.equal(isDone(s), true, 'a reply at 12 was there before the 13:00 tick');
  doneMarks[s.id] = new Date(at(11)).toISOString();
  assert.equal(isDone(s), false, '…and after an 11:00 one');
  setPrInfo(url, null, null, undefined, at(21));
  assert.equal(s.prs[0].turn, null, 'out of sight: no chip mark');
  setPrInfo(url, 'open', 'PR', reply, at(22));
  assert.equal(s.prs[0].turn.movedAt, new Date(at(12)).toISOString(), 'back in sight: the same move, the same time');
});

test('a word of yours answers everything before it, and an answer is no move', () => {
  const pushed = { headRefOid: 'B', pushes: { nodes: [commit(11, 'ana')] } };
  const asked = { reviewRequests: { nodes: [{ requestedReviewer: { login: 'me' } }] }, asks: { nodes: [{ createdAt: t(11), requestedReviewer: { login: 'me' } }] } };
  const mine = h => ({ comments: { nodes: [{ author: user('me'), createdAt: t(h) }] } });
  assert.equal(prTurn(pr({ ...pushed, ...asked }), 'me').you, true);
  assert.equal(prTurn(pr({ ...pushed, ...asked, ...mine(12) }), 'me').you, false, 'a comment after the push and the request');
  assert.equal(prTurn(pr({ ...pushed, ...mine(10) }), 'me').you, true, 'a comment with the review, before the push, answers nothing');
  const later = prTurn(pr({ headRefOid: 'C', pushes: { nodes: [commit(11, 'ana'), commit(13, 'ana')] }, ...mine(12) }), 'me');
  assert.deepEqual([later.you, later.why], [true, 'pushed since your review'], 'a push after the comment is news again');

  const url = 'https://github.com/acme/r/pull/9', at = (h, m = 0) => Date.UTC(2026, 8, 28, h, m);
  const s = newSession('answer', '/x/answer.jsonl');
  s.lastActivity = new Date(at(9)).toISOString(); notePr(s, url, s.lastActivity, 'user'); sessions.set(s.id, s);
  // asked again at a time the timeline no longer shows, and a comment from ana
  const still = { reviewRequests: { nodes: [{ requestedReviewer: { login: 'me' } }] } }, hers = { author: user('ana'), createdAt: t(11) };
  setPrInfo(url, 'open', 'PR', prTurn(pr(), 'me'), at(10));
  setPrInfo(url, 'open', 'PR', prTurn(pr({ ...still, comments: { nodes: [hers] } }), 'me'), at(12));
  const moved = s.prs[0].turn.movedAt;
  assert.equal(moved, new Date(at(12)).toISOString());
  // you answer her: the request stands (its time unknown), the comment is answered — one reason fewer is no move
  setPrInfo(url, 'open', 'PR', prTurn(pr({ ...still, comments: { nodes: [hers, { author: user('me'), createdAt: t(13) }] } }), 'me'), at(14));
  assert.deepEqual([s.prs[0].turn.you, s.prs[0].turn.why, s.prs[0].turn.movedAt], [true, 'your review asked for again', moved]);
});

test('the faces on a PR: who else had a hand in it, each once, the newest first — you and the bots left out', () => {
  const face = login => ({ ...user(login), avatarUrl: `https://avatars.example/${login}` });
  const people = prPeople(pr({
    author: face('ana'),
    reviews: { nodes: [{ author: face('me'), state: 'COMMENTED', submittedAt: t(10) }, { author: face('rui'), state: 'APPROVED', submittedAt: t(12) }, { author: face('rui'), state: 'PENDING', submittedAt: t(15) }] },
    comments: { nodes: [{ author: face('ana'), createdAt: t(13) }, { author: { login: 'ci', __typename: 'Bot' }, createdAt: t(14) }, { author: face('dependabot[bot]'), createdAt: t(14) }] },
    pushes: { nodes: [commit(11, 'ana'), commit(16, null), { __typename: 'HeadRefForcePushedEvent', createdAt: t(17), actor: face('eva') }] }
  }), 'me');
  assert.deepEqual(people.map(p => [p.login, p.at, p.did.join(', ')]), [
    ['eva', t(17), 'pushed'],
    ['ana', t(13), 'opened it, commented, pushed'],
    ['rui', t(12), 'approved']
  ], 'a pending review is not had yet; an unlinked commit is nobody\'s');
  assert.equal(people[1].avatar, 'https://avatars.example/ana');
  assert.deepEqual(prPeople(null, 'me'), []);
});

test('a PR the board could not see keeps the faces it had', () => {
  const url = 'https://github.com/acme/faces/pull/7';
  setPrInfo(url, 'open', 'Faces', null, Date.parse(t(10)), [{ login: 'ana', avatar: null, at: t(9), did: ['opened it'] }]);
  setPrInfo(url, null, null, undefined, Date.parse(t(11)));
  assert.deepEqual(prStatus.get(url).people.map(p => p.login), ['ana']);
});
