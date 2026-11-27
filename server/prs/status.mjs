// Whether a PR is open, merged or closed: GitHub asked in batches, each PR polled by how recently its chat
// was touched (2026-09-28).
import { execFile } from 'node:child_process';
import { ghBin } from '../bins.mjs';
import { notifyPr, takeActs } from './acts.mjs';
import { ciEvent, logEvents, loggedOf, noteRounds, prEvents, roundsOf } from './ledger.mjs';
import { prMatch } from './mentions.mjs';
import { forgetRef } from './refs.mjs';
import {
  moveTurn,
  PR_FIELDS,
  prChecks,
  prPeople,
  prRefs,
  prReview,
  prTurn,
  pruneTurns,
  setTurnsDirty,
  turnsDirty,
} from './turn.mjs';
import { schedulePush } from '../sse.mjs';
import { forgotten, isDone, prTurns, saveState, sessions } from '../state.mjs';

// ---- …and whether they are open, merged or closed --------------------------------------------
// The transcript never says, so the colour comes from GitHub through `gh` — the user's own
// authenticated CLI, which reads its token from its config and so works from the app's bare
// launchd environment too. One GraphQL call covers a whole batch. Every PR is asked about once per
// run — titles head every card — and then **polled by how recently its chat was touched** (2026-09-28;
// nothing polled before, so a PR merged on GitHub stayed open on the card until its chat was opened):
// touched is a word in the chat, or a page opening it. A chat past the last row of PR_POLL is not
// polled at all; opening it asks at once and makes it recent again. A PR said again live, or on the
// chat being opened, is asked about unless it was within PR_TTL_MS.
const PR_POLL = [
  // [touched within, asked every]
  [60 * 60_000, 60_000], // the last hour: every minute
  [24 * 60 * 60_000, 5 * 60_000], // the last day: every five minutes
  [3 * 24 * 60 * 60_000, 30 * 60_000], // the last three days: every half hour
];

// A PR you wrote or reviewed is also watched by its own clock (2026-09-28): a chat goes quiet exactly while you wait on
// someone, and the push or the reply that answers you is the news. By the newest thing on the PR (prTurn's `last`).
const PR_WATCH_MS = Number(process.env.PR_WATCH_MS || 2 * 60_000);

const PR_WATCH = [
  // [the PR's last event within, asked every]
  [2 * 24 * 60 * 60_000, PR_WATCH_MS], // the last two days: every two minutes
  [14 * 24 * 60 * 60_000, 5 * PR_WATCH_MS], // the last two weeks: every ten
];

const PR_TTL_MS = Number(process.env.PR_TTL_MS || 30_000);
const PR_TTL_ERROR_MS = 60 * 60_000; // a PR we cannot see (private, deleted, no access): back off
// Twenty a call (2026-10-14): in a call of forty, GitHub answered a PR's timeline asked by type from hours before —
// the force-pushes since gone, no error said — and a call of twenty of the same PRs did not.
const PR_BATCH = 20;

export const prStatus = new Map(); // url -> { state, title, turn, people, checkedAt }
const prQueue = new Set();

let prTimer = null;
let prBusy = false;

let prAsking = new Set(); // the batch gh is being asked about now: a sweep or a mention meanwhile waits for it
let prSplit = []; // halves of a batch GitHub refused as a whole, asked before the queue (2026-10-14)

let prPause = 0;
let prPauseUntil = 0; // gh failing as a whole (offline, rate-limited): the polls back off, 1 min doubling to 30

/** Asked about within `ttl`. Merged and closed are terminal — never asked about twice. */
function prFresh(url, ttl = PR_TTL_MS, now = Date.now()) {
  const known = prStatus.get(url);

  if (!known) return false;
  if (!known.missing && (known.state === 'merged' || known.state === 'closed')) return true;
  return now - known.checkedAt < (known.state && !known.missing ? ttl : Math.max(ttl, PR_TTL_ERROR_MS));
}

export const touchedAt = session => Math.max(Date.parse(session.lastActivity) || 0, session.openedAt || 0);

/** How often a chat's PRs are polled, by how long ago it was touched; Infinity past PR_POLL's last row. */
export function prEvery(session, now = Date.now()) {
  const age = now - touchedAt(session);

  return PR_POLL.find(([within]) => age < within)?.[1] ?? Infinity;
}

/** How often a PR with a turn is polled for its own sake, by its newest event; Infinity without one, or past PR_WATCH. */
function prWatch(url, now = Date.now()) {
  const last = Date.parse(prStatus.get(url)?.turn?.last);

  return last ? (PR_WATCH.find(([within]) => now - last < within)?.[1] ?? Infinity) : Infinity;
}

/**
 * The PRs due a look, the most recently touched chat's first: never asked about, or not since the most
 * eager chat mentioning it — or the PR's own watch — asks for. At boot that is every PR, the chats in play first.
 */
export function duePrs(list, now = Date.now()) {
  const every = new Map(); // url -> the shortest interval a chat mentioning it asks for

  for (const session of [...list]
    .filter(chat => !forgotten(chat))
    .sort((left, right) => touchedAt(right) - touchedAt(left))) {
    // a chat done for good asks nothing
    const ms = prEvery(session, now);

    for (const pr of session.prs) if (!(every.get(pr.url) <= ms)) every.set(pr.url, ms);
  }

  return [...every].filter(([url, ms]) => !prFresh(url, Math.min(ms, prWatch(url, now)), now)).map(([url]) => url);
}

/** On the registry poll, and once at boot. */
export function sweepPrs() {
  if (Date.now() < prPauseUntil) return;
  for (const url of duePrs(sessions.values())) queuePr(url, 0); // 0: duePrs has judged it already
}

export function queuePr(url, ttl = PR_TTL_MS) {
  if (prQueue.has(url) || prAsking.has(url) || prSplit.some(half => half.includes(url)) || prFresh(url, ttl)) return;
  prQueue.add(url);

  prTimer ??= setTimeout(() => {
    prTimer = null;
    drainPrQueue();
  }, 250);
}

/** Whatever a chat's header and card will show, refreshed if it has aged out. */
export function queueSessionPrs(session) {
  for (const pr of session.prs) queuePr(pr.url);
}

/** What GitHub said of one PR: `found` is prTurn's answer, undefined for a PR it would not show us — `missing`, whose
 *  state and title are what was known before (2026-10-03: they were wiped, and the card's title fell back to Claude's
 *  over an SSO prompt or one field GitHub would not resolve), asked again an hour later. */
export function setPrInfo(
  url,
  state,
  title,
  found,
  now = Date.now(),
  people,
  missing = false,
  created = null,
  checks = null,
  refs = null,
  updated = null,
  review = null,
) {
  const chats = [...sessions.values()].filter(session => session.prs.some(pr => pr.url === url));
  const ticked = chats.filter(isDone);
  const { turn, moved, from, released } = moveTurn(url, found, now);

  noteRounds(url, found, moved, now, state); // merged or closed, its round ends there and its history stays (2026-10-17; it went with it)
  const known = prStatus.get(url);

  if (people === undefined) people = known?.people ?? null; // a PR we could not see: who we knew of stands

  if (missing) {
    state = known?.state ?? null;
    title = known?.title ?? null;
    checks = known?.checks ?? null;
  }

  refs ??= known?.refs ?? null; // a PR we could not see keeps the branches we knew
  updated ??= known?.updated ?? null; // GitHub's updatedAt (2026-11-01): the card's matrix numbers the PR updated last
  if (missing || !review) review = known?.review ?? null; // where its review stands (2026-11-23), kept through a look that could not see it

  prStatus.set(url, {
    state,
    title,
    turn,
    people,
    checks,
    refs,
    updated,
    review,
    checkedAt: now,
    missing,
    created: created ?? known?.created ?? null,
  }); // created: shownPr's

  const rounds = roundsOf(url);
  const logged = loggedOf(url);
  const said = JSON.stringify(review);
  const same = JSON.stringify(turn);
  const faces = JSON.stringify(people);
  const branches = JSON.stringify(refs);
  const rs = JSON.stringify(rounds);

  for (const session of chats) {
    const pr = session.prs.find(entry => entry.url === url);

    if (
      pr.state !== state ||
      pr.title !== title ||
      pr.checks !== checks ||
      pr.logged !== logged ||
      (pr.updated ?? null) !== updated ||
      JSON.stringify(pr.turn ?? null) !== same ||
      JSON.stringify(pr.people ?? null) !== faces ||
      JSON.stringify(pr.refs ?? null) !== branches ||
      JSON.stringify(pr.rounds ?? null) !== rs ||
      JSON.stringify(pr.review ?? null) !== said
    ) {
      pr.review = review;
      pr.state = state;
      pr.title = title;
      pr.turn = turn;
      pr.people = people;
      pr.checks = checks;
      pr.refs = refs;
      pr.updated = updated;
      pr.rounds = rounds;
      pr.logged = logged;
      schedulePush(session);
    }
  }

  for (const session of chats) if (session.prActs.some(act => !act.url)) takeActs(session); // a push to its branch, now that GitHub has named the branch

  // Said once, as the ball comes back to you — or when a chat you had ticked comes back with it, or the next move after
  // a round let go; never on a chat done for good, and not at all when every chat that mentions it is.
  if (moved && (from === 'them' || released || ticked.some(session => !isDone(session)))) {
    notifyPr(
      url,
      turn,
      chats.filter(session => !forgotten(session)),
    );
  }
}

function drainPrQueue() {
  if (prBusy || (!prQueue.size && !prSplit.length)) return;
  const bin = ghBin();

  if (!bin) {
    prQueue.clear();
    prSplit = [];
    return;
  } // no gh (yet: findBin looks again in a minute)

  const take = prSplit.shift() || [...prQueue].slice(0, PR_BATCH);

  const batch = [];
  const parts = [];

  for (const url of take) {
    prQueue.delete(url);
    const match = prMatch(url);

    if (!match) continue;

    // owner/repo/number came out of PR_RE, so they cannot break out of the query string
    parts.push(
      `p${batch.length}: repository(owner: "${match[1]}", name: "${match[2]}") { pullRequest(number: ${match[3]}) { ${PR_FIELDS} } }`,
    );

    batch.push(url);
  }

  if (!batch.length) return drainPrQueue();
  prBusy = true;
  prAsking = new Set(batch);

  execFile(
    bin,
    ['api', 'graphql', '-f', `query={viewer { login } ${parts.join(' ')}}`],
    { timeout: 30_000, maxBuffer: 8e6 },
    (err, stdout, stderr) => {
      prBusy = false;
      prAsking = new Set();

      // A PR we cannot resolve fails its own alias only: gh exits non-zero but still prints the rest. NOT_FOUND is
      // GitHub having nothing there for us (no such PR — an issue's number —, no such repo, or none we may see).
      let data = null;
      let none = new Set();
      let refused = false;

      try {
        const body = JSON.parse(stdout || '{}');
        const errs = body.errors || [];

        data = body.data;
        none = new Set(errs.filter(error => error.type === 'NOT_FOUND').map(error => error.path?.[0]));
        refused = !data && errs.some(error => error?.locations) && !errs.some(error => error?.type === 'RATE_LIMITED'); // a parse or validation error points into the query
      } catch {}

      if (refused) {
        // GitHub would not run the query as written (2026-10-14): something in one PR of it — asked again in halves, down
        // to that one, let be as a PR it would not show (asked an hour later). It answered: nothing pauses.
        console.error(
          '[peixairada] pr status: GitHub refused the query for',
          batch.length === 1 ? batch[0] : `${batch.length} PRs — asking in halves`,
        );

        if (batch.length > 1) prSplit.unshift(batch.slice(0, batch.length >> 1), batch.slice(batch.length >> 1));
        else setPrInfo(batch[0], null, null, undefined, Date.now(), undefined, true);
        return drainPrQueue();
      }

      if (!data) {
        // Nothing learned — offline, rate-limited, a timeout. What the cards show stands (until 2026-09-28 every PR in
        // the batch lost its state and title), the rest of the queue is dropped, and the polls back off.
        console.error(
          '[peixairada] pr status:',
          String(stderr || err?.message || 'no data')
            .trim()
            .split('\n')[0]
            .slice(0, 200),
        );

        prQueue.clear();
        prSplit = [];
        prPause = Math.min(prPause ? prPause * 2 : 60_000, 30 * 60_000);
        prPauseUntil = Date.now() + prPause;
        return;
      }

      prPause = 0;
      prPauseUntil = 0; // back: the sweeps poll again at once, not when a pause of up to 30 min would have run out
      const me = data.viewer?.login || null;

      batch.forEach((url, index) => {
        const pr = data?.[`p${index}`]?.pullRequest;

        const state = !pr
          ? null
          : pr.state === 'MERGED'
            ? 'merged'
            : pr.state === 'CLOSED'
              ? 'closed'
              : pr.isDraft
                ? 'draft'
                : 'open';

        if (!pr && none.has(`p${index}`)) forgetRef(url);
        const turn = pr && me ? prTurn(pr, me, prTurns[url]?.said) : undefined;

        if (pr && me) {
          // what this look saw, into its ledger — every PR a chat shows (2026-10-17; one you had a turn on before)
          const evs = prEvents(pr, me, url);
          const ci = ciEvent(prStatus.get(url), prChecks(pr), pr.headRefOid);

          logEvents(url, ci ? [...evs, ci] : evs);
        }

        setPrInfo(
          url,
          state,
          pr?.title || null,
          turn,
          Date.now(),
          pr ? prPeople(pr, me) : undefined,
          !pr,
          pr?.createdAt,
          prChecks(pr),
          prRefs(pr),
          pr?.updatedAt || null,
          prReview(pr),
        );
      });

      if (turnsDirty) {
        setTurnsDirty(false);
        pruneTurns();
        saveState();
      }

      if (prQueue.size || prSplit.length) drainPrQueue();
    },
  );
}
