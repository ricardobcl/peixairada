// A PR's history (2026-10-15): each look's events merged by id, and its rounds.
import { byChat } from './acts.mjs';
import { isBot, setTurnsDirty, WINDOWS } from './turn.mjs';
import { prLogs } from '../state.mjs';

// ---- …and its history (2026-10-15) ----------------------------------------------------------------------------------
// A PR keeps a ledger (`prLogs`, the state file): its rounds — a move come round to you, and how it
// ended: your word (`answered`), let go and then moved past (`let go`), its reason gone (`gone`), the PR merged or
// closed — and its events: who opened, reviewed, commented, pushed or asked, from each look (prEvents), and what the
// board did with it (let go). The page shows the rounds (each PR row's round and the one before, a card's pips and its
// "answered") and asks for the events when it wants them (GET /api/sessions/:id/prlog). Kept by the board, never re-read
// from one look: GitHub can answer a PR's timeline from hours before (2026-10-14), so an event is merged by its id and a
// look without it takes nothing back, and a round closes as answered only on a word of yours newer than its move — a
// look that reads "their move" with no such word leaves it open (`gone` after ROUND_GONE_MS of that).
// The chat's timeline reads it (2026-10-17): every PR a chat shows has one, rounds only where you have a turn; 150
// events and 30 rounds, past a merge or a close while a chat not done for good names it, and LOG_KEEP_MS after the
// last day one did — the boot reads a transcript's tail, and a PR named before it is still the chat's (pruneTurns).
export const LOG_EV_MAX = 150;
export const LOG_ROUNDS_MAX = 30;
export const ROUND_GONE_MS = 60 * 60_000;
export const LOG_KEEP_MS = 30 * 24 * 60 * 60_000;
export const isoS = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z'); // GitHub's spelling, so the ledger's times sort as one

/**
 * The events in one look at a PR (pure; PR_FIELDS' answer): `k` opened · review (`s` its state) · comment · push (`f`
 * a force-push) · ask (your review asked for), `w` who — '' for you —, `a` when; the bots left out, as the turn does. An
 * id is the kind, who and when: GitHub's times do not move, and a rebase's commits, one second each, are one push of `n`.
 * The oldest of a window GitHub filled (`WINDOWS`) is marked `edge`: one the ledger has not got says GitHub held more
 * before it than this look could see (2026-10-17; logEvents' `older`).
 * Since 2026-10-17, for the chat's timeline: asked (someone else's review asked for: `x` whose, `w` by whom) and the
 * PR's own merged · closed · reopened · ready (for review) — these by a bot or nobody too, `w` null —, and `u` the
 * event's page on GitHub, kept as what follows the PR's own address (`url`) when it starts with it.
 */
export function prEvents(pr, me, url = '') {
  if (!pr) return [];
  const ev = new Map();
  let from = null; // the window being read, until its first event is marked

  const at = eventUrl =>
    !eventUrl
      ? {}
      : { u: url && eventUrl.toLowerCase().startsWith(url.toLowerCase()) ? eventUrl.slice(url.length) : eventUrl };

  const whom = actor => (isBot(actor) ? null : actor.login === me ? '' : actor.login);

  const add = (id, event) => {
    ev.set(id, { id, ...event, ...(from && { edge: 1 }) });
    from = null;
  };

  const put = (kind, by, when, more = {}) => {
    if (!when || !by?.login || isBot(by)) return;

    const id = `${kind}:${by.login}:${when}${more.s ? `:${more.s}` : ''}`;
    const was = ev.get(id);

    if (was) {
      was.n = (was.n || 1) + 1;
      from = null;
    } else add(id, { k: kind, w: by.login === me ? '' : by.login, a: when, ...more });
  };

  const read = (name, visit) => {
    const nodes = pr[name]?.nodes || [];

    from = nodes.length >= WINDOWS[name] ? name : null;
    for (const node of nodes) if (node) visit(node);
    from = null;
  };

  put('opened', pr.author, pr.createdAt);

  read('reviews', review => {
    if (review.state !== 'PENDING') {
      put('review', review.author, review.submittedAt, { s: review.state, ...at(review.url) });
    }
  });

  read('comments', comment => put('comment', comment.author, comment.createdAt, at(comment.url)));

  read('pushes', node => {
    if (node.__typename === 'HeadRefForcePushedEvent') put('push', node.actor, node.createdAt, { f: 1 });
    else put('push', node.commit?.author?.user || pr.author, node.commit?.committedDate, at(node.url)); // a commit GitHub ties to no one is the author's
  });

  read('asks', ask => {
    const reviewer = ask.requestedReviewer;

    if (!ask.createdAt || (isBot(reviewer) && reviewer?.login)) return; // a bot asked to review is nobody, as a bot's review is

    if (reviewer?.login === me) add(`ask:${ask.createdAt}`, { k: 'ask', w: null, a: ask.createdAt });
    else {
      const requested = reviewer?.login || reviewer?.slug || null;

      add(`asked:${requested}:${ask.createdAt}`, {
        k: 'asked',
        w: ask.actor ? whom(ask.actor) : null,
        x: requested,
        a: ask.createdAt,
      });
    }
  });

  const MARKS = {
    MergedEvent: 'merged',
    ClosedEvent: 'closed',
    ReopenedEvent: 'reopened',
    ReadyForReviewEvent: 'ready',
  };

  const merged = (pr.marks?.nodes || [])
    .filter(node => node?.__typename === 'MergedEvent')
    .map(node => Date.parse(node.createdAt));

  read('marks', node => {
    const kind = MARKS[node.__typename];

    if (!kind || !node.createdAt) return;
    if (kind === 'closed' && merged.some(mergedAt => Math.abs(mergedAt - Date.parse(node.createdAt)) < 60_000)) return; // GitHub writes a merge's close too

    add(`${kind}:${node.createdAt}`, {
      k: kind,
      w: node.actor ? whom(node.actor) : null,
      a: node.createdAt,
      ...at(node.url),
    });
  });

  return [...ev.values()];
}

/**
 * The head's checks turned green or red since the last look (pure; 2026-10-17): `known` that look's prStatus, none on
 * a first look — a PR seen for the first time says nothing of a change. Pending is no event; a new head whose checks
 * read as the old one's did is one (the rollup is the head's). At the look's time: GitHub gives a rollup none.
 */
export function ciEvent(known, checks, head, now = Date.now()) {
  if (!known || known.missing || (checks !== 'pass' && checks !== 'fail')) return null;
  if (known.checks === checks && (!head || known.refs?.headOid === head)) return null;
  const at = isoS(now);

  return { id: `ci:${checks}:${head || at}`, k: 'ci', w: null, s: checks, a: at, u: '/checks' };
}

const logOf = url => (prLogs[url] ||= { ev: [], r: [], v: 0 });

export const loggedOf = url => prLogs[url]?.v || 0;

/** A ledger changed: its count (`v`, each chat's `pr.logged`) moves, so the page knows to ask for it again. */
export const bumpLog = url => {
  const log = logOf(url);

  log.v = (log.v || 0) + 1;
  setTurnsDirty(true);
};

/** Events into a PR's ledger by id: one it has is kept, a rebase's count grows, and once full one older than the oldest
 *  kept stays out — GitHub's windows still hold what the ledger let go, and would bring it back on every look. What
 *  it let go, or a full window's oldest it never had (prEvents' `edge`), marks it `older`: GitHub has more before. */
export function logEvents(url, evs) {
  if (!evs.length) return false;

  const log = logOf(url);
  const byId = new Map(log.ev.map(event => [event.id, event]));

  let added = false;
  let older = false;

  for (const { edge, ...event } of evs) {
    const was = byId.get(event.id);

    if (was) {
      if ((event.n || 1) > (was.n || 1)) {
        was.n = event.n;
        added = true;
      }

      continue;
    }

    if (edge) older = true;

    if (log.ev.length >= LOG_EV_MAX && event.a < log.ev[0].a) {
      older = true;
      continue;
    }

    log.ev.push(event);
    byId.set(event.id, event);
    added = true;
  }

  if (older && !log.older) {
    log.older = 1;
    added = true;
  }

  if (!added) return false;
  log.ev.sort((left, right) => left.a.localeCompare(right.a));

  if (log.ev.length > LOG_EV_MAX) {
    log.ev.splice(0, log.ev.length - LOG_EV_MAX);
    log.older = 1;
  }

  bumpLog(url);
  return true;
}

/** What the board did with a PR — let go, back again — into its ledger. */
export function logBoard(url, what, at = Date.now()) {
  const stamp = isoS(at);

  logEvents(url, [{ id: `board:${what}:${stamp}`, k: 'board', w: '', x: what, a: stamp }]);
}

export const openRound = url => {
  const round = prLogs[url]?.r.at(-1);

  return round && !round.end ? round : null;
};

/** The rounds the page shows: the last three, the newest last. */
export const roundsOf = url => (prLogs[url]?.r.length ? prLogs[url].r.slice(-3).map(round => ({ ...round })) : null);

/**
 * A look's turn (`turn`, prTurn's) on the PR's rounds; `moved` is moveTurn's. At your move with no round open, one opens
 * at GitHub's time for its reason; a move past a round let go ends that one and opens the next; more news keeps the
 * round and its new reasons. Their move closes the open round only on a word of yours at or after its start (`said`),
 * else it is marked (`them`) and ended as `gone` ROUND_GONE_MS later; at your move again, the mark goes. `null`: the PR
 * merged, closed, or none of yours — the round ends there.
 */
export function noteRounds(url, turn, moved, now = Date.now(), state = null) {
  if (turn === undefined) return false;
  const nowS = isoS(now);

  let open = openRound(url);
  let changed = false;

  if (!turn) {
    if (!open) return false;
    Object.assign(open, { end: nowS, how: state === 'merged' || state === 'closed' ? state : 'gone' });
    delete open.them;
    bumpLog(url);
    return true;
  }

  if (turn.you) {
    if (open?.let && moved) {
      Object.assign(open, { end: nowS, how: 'let go' });
      open = null;
    }

    if (!open) {
      logOf(url).r.push({ from: turn.at || nowS, why: turn.why });
      changed = true;
    } else {
      if (open.why !== turn.why) {
        open.why = turn.why;
        changed = true;
      }

      if (open.them) {
        delete open.them;
        changed = true;
      }
    }
  } else if (open) {
    if (turn.said && turn.said >= open.from) {
      Object.assign(open, { end: turn.said, how: 'answered' }, byChat(url, open, nowS));
      delete open.them;
      changed = true;
    } else if (!open.them) {
      open.them = nowS;
      changed = true;
    } else if (now - Date.parse(open.them) > ROUND_GONE_MS) {
      Object.assign(open, { end: open.them, how: 'gone' });
      delete open.them;
      changed = true;
    }
  }

  const rounds = prLogs[url]?.r;

  if (rounds && rounds.length > LOG_ROUNDS_MAX) rounds.splice(0, rounds.length - LOG_ROUNDS_MAX);
  if (changed) bumpLog(url);
  return changed;
}
