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
  const at = u => (!u ? {} : { u: url && u.toLowerCase().startsWith(url.toLowerCase()) ? u.slice(url.length) : u });
  const whom = a => (isBot(a) ? null : a.login === me ? '' : a.login);

  const add = (id, e) => {
    ev.set(id, { id, ...e, ...(from && { edge: 1 }) });
    from = null;
  };

  const put = (k, by, a, more = {}) => {
    if (!a || !by?.login || isBot(by)) return;

    const id = `${k}:${by.login}:${a}${more.s ? `:${more.s}` : ''}`;
    const was = ev.get(id);

    if (was) {
      was.n = (was.n || 1) + 1;
      from = null;
    } else add(id, { k, w: by.login === me ? '' : by.login, a, ...more });
  };

  const read = (name, f) => {
    const nodes = pr[name]?.nodes || [];

    from = nodes.length >= WINDOWS[name] ? name : null;
    for (const n of nodes) if (n) f(n);
    from = null;
  };

  put('opened', pr.author, pr.createdAt);

  read('reviews', r => {
    if (r.state !== 'PENDING') put('review', r.author, r.submittedAt, { s: r.state, ...at(r.url) });
  });

  read('comments', c => put('comment', c.author, c.createdAt, at(c.url)));

  read('pushes', n => {
    if (n.__typename === 'HeadRefForcePushedEvent') put('push', n.actor, n.createdAt, { f: 1 });
    else put('push', n.commit?.author?.user || pr.author, n.commit?.committedDate, at(n.url)); // a commit GitHub ties to no one is the author's
  });

  read('asks', a => {
    const r = a.requestedReviewer;

    if (!a.createdAt || (isBot(r) && r?.login)) return; // a bot asked to review is nobody, as a bot's review is

    if (r?.login === me) add(`ask:${a.createdAt}`, { k: 'ask', w: null, a: a.createdAt });
    else {
      const x = r?.login || r?.slug || null;

      add(`asked:${x}:${a.createdAt}`, { k: 'asked', w: a.actor ? whom(a.actor) : null, x, a: a.createdAt });
    }
  });

  const MARKS = {
    MergedEvent: 'merged',
    ClosedEvent: 'closed',
    ReopenedEvent: 'reopened',
    ReadyForReviewEvent: 'ready',
  };

  const merged = (pr.marks?.nodes || []).filter(n => n?.__typename === 'MergedEvent').map(n => Date.parse(n.createdAt));

  read('marks', n => {
    const k = MARKS[n.__typename];

    if (!k || !n.createdAt) return;
    if (k === 'closed' && merged.some(m => Math.abs(m - Date.parse(n.createdAt)) < 60_000)) return; // GitHub writes a merge's close too
    add(`${k}:${n.createdAt}`, { k, w: n.actor ? whom(n.actor) : null, a: n.createdAt, ...at(n.url) });
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
  const a = isoS(now);

  return { id: `ci:${checks}:${head || a}`, k: 'ci', w: null, s: checks, a, u: '/checks' };
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
  const byId = new Map(log.ev.map(e => [e.id, e]));

  let added = false;
  let older = false;

  for (const { edge, ...e } of evs) {
    const was = byId.get(e.id);

    if (was) {
      if ((e.n || 1) > (was.n || 1)) {
        was.n = e.n;
        added = true;
      }

      continue;
    }

    if (edge) older = true;

    if (log.ev.length >= LOG_EV_MAX && e.a < log.ev[0].a) {
      older = true;
      continue;
    }

    log.ev.push(e);
    byId.set(e.id, e);
    added = true;
  }

  if (older && !log.older) {
    log.older = 1;
    added = true;
  }

  if (!added) return false;
  log.ev.sort((a, b) => a.a.localeCompare(b.a));

  if (log.ev.length > LOG_EV_MAX) {
    log.ev.splice(0, log.ev.length - LOG_EV_MAX);
    log.older = 1;
  }

  bumpLog(url);
  return true;
}

/** What the board did with a PR — let go, back again — into its ledger. */
export function logBoard(url, what, at = Date.now()) {
  const a = isoS(at);

  logEvents(url, [{ id: `board:${what}:${a}`, k: 'board', w: '', x: what, a }]);
}

export const openRound = url => {
  const r = prLogs[url]?.r.at(-1);

  return r && !r.end ? r : null;
};

/** The rounds the page shows: the last three, the newest last. */
export const roundsOf = url => (prLogs[url]?.r.length ? prLogs[url].r.slice(-3).map(r => ({ ...r })) : null);

/**
 * A look's turn (`t`, prTurn's) on the PR's rounds; `moved` is moveTurn's. At your move with no round open, one opens
 * at GitHub's time for its reason; a move past a round let go ends that one and opens the next; more news keeps the
 * round and its new reasons. Their move closes the open round only on a word of yours at or after its start (`said`),
 * else it is marked (`them`) and ended as `gone` ROUND_GONE_MS later; at your move again, the mark goes. `null`: the PR
 * merged, closed, or none of yours — the round ends there.
 */
export function noteRounds(url, t, moved, now = Date.now(), state = null) {
  if (t === undefined) return false;
  const nowS = isoS(now);

  let open = openRound(url);
  let changed = false;

  if (!t) {
    if (!open) return false;
    Object.assign(open, { end: nowS, how: state === 'merged' || state === 'closed' ? state : 'gone' });
    delete open.them;
    bumpLog(url);
    return true;
  }

  if (t.you) {
    if (open?.let && moved) {
      Object.assign(open, { end: nowS, how: 'let go' });
      open = null;
    }

    if (!open) {
      logOf(url).r.push({ from: t.at || nowS, why: t.why });
      changed = true;
    } else {
      if (open.why !== t.why) {
        open.why = t.why;
        changed = true;
      }

      if (open.them) {
        delete open.them;
        changed = true;
      }
    }
  } else if (open) {
    if (t.said && t.said >= open.from) {
      Object.assign(open, { end: t.said, how: 'answered' }, byChat(url, open, nowS));
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

  const r = prLogs[url]?.r;

  if (r && r.length > LOG_ROUNDS_MAX) r.splice(0, r.length - LOG_ROUNDS_MAX);
  if (changed) bumpLog(url);
  return changed;
}
