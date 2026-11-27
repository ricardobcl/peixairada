// The day (2026-10-10): when each chat clauded, waited on you, watched — for home.
import { statusOf, summary } from './sessions.mjs';

// ---- the day: when each chat clauded, waited on you, watched (2026-10-10) ---------------------------------------------
// The home's timeline. Spans from the transcript as it is folded: a turn from its first line to the reply that ends it
// (or the interrupt), a question from its asking to its answer (both written at the answer, with their own times), a
// monitor from its start to its end. A day and a half of them a chat, the oldest dropped; what is still going is
// added at the asking (dayOf), from the registry for a question the transcript does not have yet.
const DAY_KEEP_MS = 36 * 3600_000;

export function noteSpan(session, kind, from, to) {
  if (!from || !to || Date.parse(to) <= Date.parse(from)) return;
  const spans = (session.day ||= []);

  spans.push({ k: kind, from, to });
  const cut = Date.parse(to) - DAY_KEEP_MS;

  while (spans.length && (Date.parse(spans[0].to) < cut || spans.length > 400)) spans.shift();
}

/** Of a list of spans, the time they cover between a and b — overlaps once. */
function covered(spans, from, to) {
  const xs = spans
    .map(span => [Math.max(from, Date.parse(span.from)), Math.min(to, span.to ? Date.parse(span.to) : to)])
    .filter(([start, stop]) => stop > start)
    .sort((left, right) => left[0] - right[0]);

  let total = 0;
  let end = -Infinity;

  for (const [start, stop] of xs) {
    if (stop <= end) continue;
    total += stop - Math.max(start, end);
    end = stop;
  }

  return total;
}

/** Every chat's day since `since` (ms): its spans, what it worked (turns, less the time they waited on you), what it
 *  waited, how many questions; and the board's totals — the median answer and the longest wait among them. */
export function dayOf(list, since, now = Date.now()) {
  const chats = [];
  const waits = [];

  for (const session of list) {
    const spans = [...(session.day || [])];
    const st = statusOf(session);

    if (session.turnStart && st === 'working') spans.push({ k: 'w', from: session.turnStart, to: null });

    if (st === 'needs-input') {
      spans.push({
        k: 'a',
        from:
          session.askOpen?.from ||
          (session.live?.statusAt ? new Date(session.live.statusAt).toISOString() : session.statusSince),
        to: null,
      });
    }

    for (const task of session.alive ? session.tasks?.values() || [] : []) {
      spans.push({ k: 'm', from: task.at, to: null });
    }

    const mine = spans.filter(span => span.from && (span.to ? Date.parse(span.to) : now) > since);

    if (!mine.length) continue;

    const asks = mine.filter(span => span.k === 'a');
    const work = mine.filter(span => span.k === 'w');

    const worked = Math.max(0, covered(work, since, now) - covered(asks, since, now));

    for (const ask of asks) {
      waits.push({
        ms: (ask.to ? Date.parse(ask.to) : now) - Date.parse(ask.from),
        id: session.id,
        at: ask.from,
        open: !ask.to,
      });
    }

    const sm = summary(session);

    chats.push({
      id: session.id,
      title: sm.title,
      project: sm.project,
      cwd: sm.cwd,
      status: st,
      spans: mine,
      worked,
      waited: covered(asks, since, now),
      questions: asks.length,
      last: mine.reduce((latest, span) => Math.max(latest, span.to ? Date.parse(span.to) : now), 0),
    });
  }

  chats.sort((left, right) => right.last - left.last);

  const ms = waits.map(wait => wait.ms).sort((left, right) => left - right);
  const longest = waits.reduce((best, wait) => (!best || wait.ms > best.ms ? wait : best), null);

  return {
    since,
    now,
    chats,
    totals: {
      worked: chats.reduce((sum, chat) => sum + chat.worked, 0),
      waited: chats.reduce((sum, chat) => sum + chat.waited, 0),
      questions: waits.length,
      median: ms.length ? ms[ms.length >> 1] : null,
      longest,
    },
  };
}
