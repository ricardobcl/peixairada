// Whose move a PR is (prTurn, 2026-09-28), the people with a hand in it, and a round let go.
import { isoS, LOG_KEEP_MS, logBoard, loggedOf, openRound, roundsOf } from './ledger.mjs';
import { prStatus } from './status.mjs';
import { schedulePush } from '../sse.mjs';
import { forgotten, indexing, prLogs, prTurns, sessions } from '../state.mjs';

// ---- …and whose move it is ------------------------------------------------------------------------------------------
// (2026-09-28 — Slack and GitHub's app were the only way to know.) The
// same call asks what it takes to say whose move a PR is at; twenty PRs cost GitHub's GraphQL budget a point.
// `pushes` are the newest commits and force-pushes, `asks` the review requests, both off the PR's timeline.
// Every person comes with a face since 2026-09-29 (`avatarUrl`, a scalar: no cost) — prPeople, the cards' faces.
const WHO = 'login __typename avatarUrl(size: 48)';
export const WINDOWS = { reviews: 20, comments: 20, pushes: 5, asks: 10, marks: 10 };   // how far back each look reaches (prEvents' `edge`)
const ACTOR = 'actor { login __typename }';
export const PR_FIELDS = `title state isDraft createdAt updatedAt headRefOid author { ${WHO} }`   // updatedAt (2026-11-01): a scalar, the card's matrix
  + ' headRefName baseRefName baseRefOid isCrossRepository headRepository { nameWithOwner }'   // where its branch is (2026-10-13): scalars, no cost
  + ' viewerLatestReview { submittedAt commit { oid } }'
  + ' reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }'
  + ` reviews(last: ${WINDOWS.reviews}) { nodes { author { ${WHO} } state submittedAt url } }`
  + ` comments(last: ${WINDOWS.comments}) { nodes { author { ${WHO} } createdAt url } }`
  + ` pushes: timelineItems(last: ${WINDOWS.pushes}, itemTypes: [PULL_REQUEST_COMMIT, HEAD_REF_FORCE_PUSHED_EVENT]) { nodes { __typename`
  + ` ... on HeadRefForcePushedEvent { createdAt actor { ${WHO} } } ... on PullRequestCommit { url commit { committedDate author { user { login avatarUrl(size: 48) } } } } } }`
  + ` asks: timelineItems(last: ${WINDOWS.asks}, itemTypes: [REVIEW_REQUESTED_EVENT]) { nodes { ... on ReviewRequestedEvent { createdAt ${ACTOR}`
  + ' requestedReviewer { __typename ... on User { login } ... on Bot { login } ... on Team { slug } } } } }'
  // what happened to the PR itself (2026-10-17, the chat's timeline): merged, closed, reopened, ready for review — who and when, scalars
  + ` marks: timelineItems(last: ${WINDOWS.marks}, itemTypes: [MERGED_EVENT, CLOSED_EVENT, REOPENED_EVENT, READY_FOR_REVIEW_EVENT]) { nodes { __typename`
  + ` ... on MergedEvent { createdAt url ${ACTOR} } ... on ClosedEvent { createdAt url ${ACTOR} } ... on ReopenedEvent { createdAt ${ACTOR} }`
  + ` ... on ReadyForReviewEvent { createdAt url ${ACTOR} } } }`
  + ' commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }'   // CI on the head (2026-10-09): the rollup alone, a point's worth
  + ' reviewDecision reviewThreads(last: 50) { nodes { isResolved } }';   // where its review stands (2026-11-23): the decision, the threads left open
/** The head commit's checks as the chat header says them: pass · fail · pending, or null for none (2026-10-09). */
const CHECKS = { SUCCESS: 'pass', FAILURE: 'fail', ERROR: 'fail', PENDING: 'pending', EXPECTED: 'pending' };
export const prChecks = pr => CHECKS[pr?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state] ?? null;
/** Where a PR's review stands (pure; 2026-11-23): GitHub's decision (approved · changes · required), the review threads
 *  not resolved, the reviews asked and not given. Null for no answer. */
const DECISIONS = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes', REVIEW_REQUIRED: 'required' };
export const prReview = pr => pr ? { decision: DECISIONS[pr.reviewDecision] ?? null, open: (pr.reviewThreads?.nodes || []).filter(t => t && !t.isResolved).length,
  asked: (pr.reviewRequests?.nodes || []).filter(n => n?.requestedReviewer).length } : null;
/** A PR's branches as the changes tab and the editor want them (2026-10-13): its head's name and commit, its base's,
 *  and whether the head lives in a fork — whose branch name means nothing in this checkout. Null for no answer. */
export const prRefs = pr => pr?.headRefName ? { head: pr.headRefName, headOid: pr.headRefOid || null, base: pr.baseRefName || null, baseOid: pr.baseRefOid || null,
  fork: !!pr.isCrossRepository, from: pr.headRepository?.nameWithOwner || null } : null;
export let turnsDirty = false;
export function setTurnsDirty(v) { turnsDirty = v; }   // for the modules that write it: an import is read-only

export const isBot = a => !a?.login || a.__typename === 'Bot' || /\[bot\]$/.test(a.login);
const newest = times => times.reduce((a, t) => (t && t > a ? t : a), '');
const names = ws => [...new Set(ws.map(w => w.by.login))].join(', ');

/**
 * Whose move a PR is at, from what PR_FIELDS brings back and who `me` is; null when nobody waits on you — merged or
 * closed, or a PR you neither wrote nor reviewed nor commented on. Pure.
 *  · Someone else's PR comes round to you when its head is no longer the commit your latest review was on (a push, a
 *    force-push — anyone's but yours, and not after you approved), when someone else writes after your last word (a
 *    comment, a review, a reply in a thread: every reply is a review), or when your review is asked for again.
 *  · Your own, when someone else writes, or pushes to it, after your last word — your comments, reviews and pushes.
 * Bots are nobody. `key` names what came round, so another push or reply is a new move; `at` is GitHub's time for the
 * newest of it; `last` the newest thing on the PR at all, whoever did it (what PR_WATCH goes by). `said` is your last
 * word, and `before` the last the board knew (2026-10-14): a comment of yours twenty comments back is out of the
 * window asked for — the PR at its busiest is no less yours to answer.
 */
export function prTurn(pr, me, before = '') {
  if (!pr || !me || pr.state !== 'OPEN') return null;
  const mine = pr.author?.login === me;
  const words = [
    ...(pr.reviews?.nodes || []).filter(r => r?.submittedAt && r.state !== 'PENDING').map(r => ({ at: r.submittedAt, by: r.author, state: r.state })),
    ...(pr.comments?.nodes || []).filter(c => c?.createdAt).map(c => ({ at: c.createdAt, by: c.author }))
  ];
  // a commit GitHub cannot tie to an account (an unlinked email, a bot) is the PR's author's
  // and a force-push by a bot is nobody's (its actor's __typename says so; it was a move on your own PR)
  const pushes = (pr.pushes?.nodes || []).map(n => n?.__typename === 'HeadRefForcePushedEvent'
    ? { at: n.createdAt, by: n.actor?.login, bot: isBot(n.actor) } : { at: n?.commit?.committedDate, by: n?.commit?.author?.user?.login })
    .filter(p => p.at && !p.bot).map(p => ({ at: p.at, by: p.by || pr.author?.login }));
  const push = pushes.reduce((a, p) => (!a || p.at > a.at ? p : a), null);
  const review = pr.viewerLatestReview?.submittedAt ? pr.viewerLatestReview : null;
  const said = newest([before, review?.submittedAt, ...words.filter(w => w.by?.login === me).map(w => w.at), ...pushes.filter(p => p.by === me).map(p => p.at), mine && pr.createdAt]);
  const asks = (pr.asks?.nodes || []).filter(a => a?.requestedReviewer?.login === me).map(a => a.createdAt);
  const last = newest([said, pr.createdAt, ...words.map(w => w.at), ...pushes.map(p => p.at), ...asks]) || null;
  if (!said) return null;
  const theirs = words.filter(w => !isBot(w.by) && w.by.login !== me && w.at > said);
  // a push after you approved is the author getting on with it — unless GitHub dismissed the approval for it
  const verdict = words.filter(w => w.by?.login === me && /^(APPROVED|CHANGES_REQUESTED|DISMISSED)$/.test(w.state)).reduce((a, w) => (!a || w.at > a.at ? w : a), null);
  // Any word of yours answers everything before it (the same night): a comment after your review is past a push
  // committed before it, and past a re-request.
  const since = review && said > review.submittedAt ? said : '';
  // On someone else's PR a push is a move only against a review of yours (2026-10-03: a comment alone made every push
  // after it "pushed since your review", and un-ticked every chat that named the PR).
  const pushed = !!push && push.by !== me && (mine ? push.at > said : !!review && review.commit?.oid !== pr.headRefOid && verdict?.state !== 'APPROVED' && !(since >= push.at));
  const askedAt = newest(asks);
  const again = !mine && !!review && (pr.reviewRequests?.nodes || []).some(n => n?.requestedReviewer?.login === me) && !(askedAt && said > askedAt);
  const you = pushed || theirs.length > 0 || again;
  if (!you) return { you, mine, why: mine ? 'waiting on reviews' : `waiting on ${pr.author?.login || 'the author'}`, at: null, last, said, key: 'them' };
  const why = [];
  if (pushed) why.push(mine ? `${push.by} pushed` : 'pushed since your review');
  const approved = theirs.filter(w => w.state === 'APPROVED'), asked = theirs.filter(w => w.state === 'CHANGES_REQUESTED');
  const talk = theirs.filter(w => w.state !== 'APPROVED' && w.state !== 'CHANGES_REQUESTED');
  if (approved.length) why.push(`approved by ${names(approved)}`);
  if (asked.length) why.push(`changes asked by ${names(asked)}`);
  if (talk.length) why.push(`${talk.length} comment${talk.length === 1 ? '' : 's'} from ${names(talk)}`);
  if (again) why.push('your review asked for again');
  const heard = newest(theirs.map(w => w.at));
  return {
    you, mine, why: why.join(' · '), at: newest([pushed && push.at, heard, again && askedAt]) || null, last, said,
    key: [pushed ? pr.headRefOid : '', heard, again ? askedAt || 'asked' : ''].join('|')
  };
}

/**
 * Who has had a hand in a PR, for the faces on its chats' cards (2026-09-29): the author, and whoever reviewed,
 * commented or pushed — each once, with what they did and when they last did it, the newest first, at most PEOPLE_MAX.
 * You and the bots are left out: the faces say who else is in it. Pure, from what PR_FIELDS brings back.
 */
const PEOPLE_MAX = 8;
export function prPeople(pr, me) {
  if (!pr) return [];
  const by = new Map();
  const add = (a, at, did) => {
    if (!a?.login || isBot(a) || a.login === me) return;
    const p = by.get(a.login) || { login: a.login, avatar: null, at: '', did: [] };
    p.avatar ||= a.avatarUrl || null;
    if (at && at > p.at) p.at = at;
    if (!p.did.includes(did)) p.did.push(did);
    by.set(a.login, p);
  };
  add(pr.author, pr.createdAt, 'opened it');
  for (const r of pr.reviews?.nodes || []) if (r?.submittedAt && r.state !== 'PENDING') add(r.author, r.submittedAt, r.state === 'APPROVED' ? 'approved' : r.state === 'CHANGES_REQUESTED' ? 'asked for changes' : 'reviewed');
  for (const c of pr.comments?.nodes || []) add(c?.author, c?.createdAt, 'commented');
  for (const n of pr.pushes?.nodes || []) {
    if (n?.__typename === 'HeadRefForcePushedEvent') add(n.actor, n.createdAt, 'pushed');
    else add(n?.commit?.author?.user, n?.commit?.committedDate, 'pushed');
  }
  return [...by.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, PEOPLE_MAX);
}

/**
 * Note the turn GitHub gave (`t`: prTurn's answer; undefined, a PR we could not see — what the board knew stands) and
 * hand back the one to show. `movedAt` is when the move became news: GitHub's time for it the first time the board
 * sees the PR, the board's own clock for every change after — a push committed before you ticked and pushed after
 * is news all the same, and so is one the board only learnt of after the tick. Only something that *came* is a move:
 * a new head, a newer word of theirs, a new request; a reason gone (answered by a word of yours) keeps the time.
 * News is weighed against everything that has come round so far (`came`, 2026-10-14), never the last look alone: a
 * look that missed the reason (a timeline GitHub answered as it stood hours before, see PR_BATCH) read as not at your
 * move, and the next brought the same reason back as a move — an alert, the chat un-ticked, a round let go undone.
 */
const keyParts = k => !k || k === 'them' ? ['', '', ''] : k.split('|');
const newsIn = (was, now) => {
  const [h0, w0, a0] = keyParts(was), [h1, w1, a1] = keyParts(now);
  // `asked` after a time is that request, its event out of the last ten asked for — ten requests to others since (2026-10-14)
  return (!!h1 && h1 !== h0) || w1 > w0 || (!!a1 && a1 !== a0 && !(a1 === 'asked' && a0));
};
/** `was` and what `now` brought: the newest head, word and request of either, as a key. */
const cameIn = (was, now) => {
  const [h0, w0, a0] = keyParts(was), [h1, w1, a1] = keyParts(now);
  return [h1 || h0, w1 > w0 ? w1 : w0, !a1 || (a1 === 'asked' && a0) ? a0 : a1].join('|');
};
/** A PR no chat mentions any more and whose turn has not moved in a month leaves the state file — it grew by every PR
 *  ever reviewed (2026-10-03). A month, not at once: the boot reads only a transcript's tail, and a PR named before it
 *  is still the chat's. */
const TURN_KEEP_MS = 30 * 24 * 60 * 60_000;
export function pruneTurns(now = Date.now()) {
  if (indexing) return;
  const named = new Set(); for (const s of sessions.values()) for (const p of s.prs) named.add(p.url);
  for (const [url, t] of Object.entries(prTurns)) if (!named.has(url) && now - (Date.parse(t.at) || 0) > TURN_KEEP_MS) delete prTurns[url];
  pruneLogs(now);
}
/** A ledger stays while a chat not done for good names it, or its turn's record does, and LOG_KEEP_MS after the last
 *  day either did (2026-10-17): the boot reads a transcript's tail, so a PR named before it is out of the chat's PRs
 *  until the chat is read whole — as prTurns' month. */
export function pruneLogs(now = Date.now()) {
  const day = isoS(now).slice(0, 10), live = new Set();
  for (const s of sessions.values()) if (!forgotten(s)) for (const p of s.prs) live.add(p.url);
  for (const [url, log] of Object.entries(prLogs)) {
    if (live.has(url) || prTurns[url]) { if (log.seen !== day) log.seen = day; }
    else if (now - (Date.parse(log.seen) || 0) > LOG_KEEP_MS) delete prLogs[url];
  }
}
export function moveTurn(url, t, now = Date.now()) {
  const prev = prTurns[url];
  if (t === undefined) return { turn: null, moved: false, from: prev?.key };
  if (!t) { if (prev) { delete prTurns[url]; turnsDirty = true; } return { turn: null, moved: false, from: prev?.key }; }
  const came = prev ? prev.came ?? (prev.key === 'them' ? '' : prev.key) : '';   // a record from before 2026-10-14 has its last look alone
  const moved = !!prev && t.you && newsIn(came, t.key);
  if (!prev || moved) { prTurns[url] = { key: t.key, at: new Date(prev ? now : Date.parse(t.at) || now).toISOString(), ...prev?.said && { said: prev.said } }; turnsDirty = true; }   // a move ends a round let go
  else if (prev.key !== t.key) { prTurns[url] = { ...prev, key: t.key }; turnsDirty = true; }
  const rec = prTurns[url], all = t.you ? cameIn(came, t.key) : came;
  if (all && rec.came !== all) { rec.came = all; turnsDirty = true; }
  if (t.said && t.said > (rec.said || '')) { rec.said = t.said; turnsDirty = true; }   // your last word, for prTurn's next look
  const { key, said, ...turn } = t, shown = { ...turn, movedAt: rec.at };
  return { turn: rec.waived && t.you ? waivedTurn(shown) : shown, moved, from: prev?.key, released: moved && !!prev?.waived };   // moved is only ever a move to you
}
/**
 * A round let go (2026-10-12): your move, and nothing to do about it yet — ⌥-click on a chat's "your move". The PR
 * reads as not at your move (`you: false`, `waived`: it was) until something new comes round, which is a move and an
 * alert as any other (moveTurn drops the mark). A look that reads it answered leaves the mark (2026-10-14): after a word
 * of yours nothing comes back to you without something new, and a look that missed the reasons was taken for one.
 * The mark is the PR's record in prTurns (`waived`: the key let go), so a restart keeps it.
 */
const waivedTurn = turn => ({ ...turn, you: false, waived: true });
export function waiveTurn(url) {
  const rec = prTurns[url], known = prStatus.get(url);
  if (!rec || !known?.turn?.you) return false;
  rec.waived = rec.key;
  const turn = waivedTurn(known.turn);
  prStatus.set(url, { ...known, turn });
  const open = openRound(url); if (open) open.let = isoS(Date.now());
  logBoard(url, 'let go');
  for (const s of sessions.values()) { const pr = s.prs.find(p => p.url === url); if (pr) { pr.turn = turn; pr.rounds = roundsOf(url); pr.logged = loggedOf(url); schedulePush(s); } }
  return true;
}
/** A round let go, taken back (2026-10-15): your move again, as it was — no alert, no un-tick, its time kept. */
export function unwaiveTurn(url) {
  const rec = prTurns[url], known = prStatus.get(url);
  if (!rec?.waived || !known?.turn?.waived) return false;
  delete rec.waived; turnsDirty = true;
  const { waived, ...was } = known.turn, turn = { ...was, you: true };
  prStatus.set(url, { ...known, turn });
  const open = openRound(url); if (open) delete open.let;
  logBoard(url, 'back');
  for (const s of sessions.values()) { const pr = s.prs.find(p => p.url === url); if (pr) { pr.turn = turn; pr.rounds = roundsOf(url); pr.logged = loggedOf(url); schedulePush(s); } }
  return true;
}
