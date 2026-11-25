// The day (2026-10-10): when each chat clauded, waited on you, watched — for home.
import { statusOf, summary } from './sessions.mjs';

// ---- the day: when each chat clauded, waited on you, watched (2026-10-10) ---------------------------------------------
// The home's timeline. Spans from the transcript as it is folded: a turn from its first line to the reply that ends it
// (or the interrupt), a question from its asking to its answer (both written at the answer, with their own times), a
// monitor from its start to its end. A day and a half of them a chat, the oldest dropped; what is still going is
// added at the asking (dayOf), from the registry for a question the transcript does not have yet.
const DAY_KEEP_MS = 36 * 3600_000;
export function noteSpan(s, k, from, to) {
  if (!from || !to || Date.parse(to) <= Date.parse(from)) return;
  const spans = (s.day ||= []); spans.push({ k, from, to });
  const cut = Date.parse(to) - DAY_KEEP_MS; while (spans.length && (Date.parse(spans[0].to) < cut || spans.length > 400)) spans.shift();
}
/** Of a list of spans, the time they cover between a and b — overlaps once. */
function covered(spans, a, b) {
  const xs = spans.map(x => [Math.max(a, Date.parse(x.from)), Math.min(b, x.to ? Date.parse(x.to) : b)]).filter(([x, y]) => y > x).sort((p, q) => p[0] - q[0]);
  let n = 0, end = -Infinity;
  for (const [x, y] of xs) { if (y <= end) continue; n += y - Math.max(x, end); end = y; }
  return n;
}
/** Every chat's day since `since` (ms): its spans, what it worked (turns, less the time they waited on you), what it
 *  waited, how many questions; and the board's totals — the median answer and the longest wait among them. */
export function dayOf(list, since, now = Date.now()) {
  const chats = [], waits = [];
  for (const s of list) {
    const spans = [...(s.day || [])];
    const st = statusOf(s);
    if (s.turnStart && st === 'working') spans.push({ k: 'w', from: s.turnStart, to: null });
    if (st === 'needs-input') spans.push({ k: 'a', from: s.askOpen?.from || (s.live?.statusAt ? new Date(s.live.statusAt).toISOString() : s.statusSince), to: null });
    for (const t of s.alive ? s.tasks?.values() || [] : []) spans.push({ k: 'm', from: t.at, to: null });
    const mine = spans.filter(x => x.from && (x.to ? Date.parse(x.to) : now) > since);
    if (!mine.length) continue;
    const asks = mine.filter(x => x.k === 'a'), work = mine.filter(x => x.k === 'w');
    const worked = Math.max(0, covered(work, since, now) - covered(asks, since, now));
    for (const a of asks) waits.push({ ms: (a.to ? Date.parse(a.to) : now) - Date.parse(a.from), id: s.id, at: a.from, open: !a.to });
    const sm = summary(s);
    chats.push({ id: s.id, title: sm.title, project: sm.project, cwd: sm.cwd, status: st, spans: mine, worked, waited: covered(asks, since, now), questions: asks.length, last: mine.reduce((m, x) => Math.max(m, x.to ? Date.parse(x.to) : now), 0) });
  }
  chats.sort((a, b) => b.last - a.last);
  const ms = waits.map(w => w.ms).sort((a, b) => a - b), longest = waits.reduce((m, w) => !m || w.ms > m.ms ? w : m, null);
  return { since, now, chats, totals: { worked: chats.reduce((n, c) => n + c.worked, 0), waited: chats.reduce((n, c) => n + c.waited, 0), questions: waits.length,
    median: ms.length ? ms[ms.length >> 1] : null, longest } };
}
