// A snooze's end (2026-11-24): its time, or the event it waits on — said as a chat come back.
import { hushOf, nativeNotify } from './notify.mjs';
import { shownPr } from './prs/refs.mjs';
import { statusOf, summary } from './sessions.mjs';
import { broadcast, schedulePush } from './sse.mjs';
import {
  doneMarks,
  indexing,
  isDone,
  isRemoved,
  saveState,
  sessions,
  SNOOZE_MAX_MS,
  SNOOZE_ON,
  snoozed,
  woke,
} from './state.mjs';
import { runningTasks } from './tasks.mjs';

// ---- a snooze's end (2026-11-24, round XXX) ----------------------------------------------------------------------------
// A snoozed chat wakes by itself at its time, or on the event it waits for — said once, by a `back` alert (the reply's own
// when that was it) — and ends with no mark when something of yours or a question came first. Looked at on every push
// of the chat (so the snooze is gone before a reply's or a question's alert, 400 ms on, reads hushOf), on the registry
// poll (a Mac asleep through the time) and by one timer to the nearest time (armSnoozes).
const QUIET_WAKE = Object.freeze({ quiet: true });
const isoMs = t => Date.parse(t || '') || 0;

/** Why the snooze `z` of chat `s` ends now: null (it holds), `{ quiet }` (it ends with no mark and no alert) or
 *  `{ kind, why }`. Reads only. */
export function wakeWhy(s, z, now = Date.now()) {
  const at = isoMs(z.at);

  if (isRemoved(s)) return QUIET_WAKE;
  if (isDone(s) && isoMs(doneMarks[s.id]) > at) return QUIET_WAKE; // ticked since
  if (statusOf(s) === 'needs-input') return QUIET_WAKE; // the question's own alert speaks
  if (isoMs(s.lastUserAt) > at) return QUIET_WAKE; // you were back in it yourself
  if (z.until && isoMs(z.until) <= now) return { kind: 'time', why: 'its time came' };
  const pr = z.pr ? s.prs.find(p => p.url === z.pr && shownPr(p)) : null;

  if (z.on === 'pr' && pr?.turn?.you && isoMs(pr.turn.movedAt) > at) {
    return { kind: 'pr', why: `${pr.label} came round to you` };
  }

  if (z.on === 'pr' && (!pr || pr.state === 'merged' || pr.state === 'closed')) {
    return { kind: 'pr', why: !pr ? 'its PR left the chat' : `${pr.label} was ${pr.state}` };
  }

  if (z.on === 'ci' && pr?.checks !== 'pending') {
    return {
      kind: 'ci',
      why:
        pr?.checks === 'pass'
          ? 'its checks passed'
          : pr?.checks === 'fail'
            ? 'its checks failed'
            : 'its checks finished',
    };
  }

  if (z.on === 'reply' && statusOf(s) !== 'working') {
    return s.alive ? { kind: 'reply', why: 'Claude replied' } : { kind: 'ended', why: 'its claude ended' };
  }

  if (z.on === 'mon' && !runningTasks(s).length) return { kind: 'mon', why: 'its monitor ended' };
  return null;
}

/** The snooze ended, if it has: dropped, the mark kept (`woke`) and the `back` alert owed to the chat's next push — after
 *  the summary that says it. True when it ended; the caller pushes the chat (the push's own call pushes on). Not while
 *  the boot reads, nor on a chat being re-read. A reply's wake owes nothing: its alert is queued already. */
export function wakeCheck(s, now = Date.now()) {
  const z = snoozed[s.id];

  if (!z || indexing || s.silent) return false;
  const w = wakeWhy(s, z, now);

  if (!w) return false;
  delete snoozed[s.id];

  if (!w.quiet) {
    woke[s.id] = { at: new Date(now).toISOString(), why: w.why };
    if (!(w.kind === 'reply' && s.pendingNotify?.has('reply'))) s.backOwed = w.why;
    console.log(`[peixairada] chat ${s.id}: back from its snooze — ${w.why}`);
  }

  saveState();
  armSnoozes();
  return true;
}

/** Every snoozed chat looked at: the poll's, and the timer's. One the board no longer has is let go. */
export function wakeAll() {
  for (const id of Object.keys(snoozed)) {
    const s = sessions.get(id);

    if (!s) {
      delete snoozed[id];
      continue;
    }

    if (wakeCheck(s)) schedulePush(s);
  }

  armSnoozes();
}

let snoozeTimer = null;

/** One timer, to the nearest snooze's time (setTimeout's cap at most); a time already past is looked at again a moment on,
 *  so a check the boot or a re-read held back is not a loop. */
export function armSnoozes() {
  clearTimeout(snoozeTimer);
  snoozeTimer = null;
  const next = Math.min(...Object.values(snoozed).map(z => isoMs(z.until) || Infinity));

  if (Number.isFinite(next)) {
    snoozeTimer = setTimeout(wakeAll, Math.min(Math.max(next - Date.now() + 20, 250), 2 ** 31 - 1));
  }
}

/** A snooze as asked (`POST …/snooze`): `{ snooze }`, or `{ code, error }`. */
export function snoozeOf(s, body, now = Date.now()) {
  if (isRemoved(s)) return { code: 409, error: 'it is deleted from the board' };
  if (statusOf(s) === 'needs-input') return { code: 409, error: 'it is asking you: a question wakes it' };
  const z = { at: new Date(now).toISOString() };

  if (body.until != null) {
    const t =
      typeof body.until === 'number' ? body.until : typeof body.until === 'string' ? Date.parse(body.until) : NaN;

    if (!Number.isFinite(t)) return { code: 400, error: 'until: not a time' };
    if (t <= now) return { code: 400, error: 'until: that time is past' };
    if (t - now > SNOOZE_MAX_MS) return { code: 400, error: 'until: more than a year away' };
    z.until = new Date(t).toISOString();
  }

  if (body.on != null) {
    if (!SNOOZE_ON.has(body.on)) return { code: 400, error: `on: one of ${[...SNOOZE_ON].join(', ')}` };

    if (body.on === 'pr' || body.on === 'ci') {
      const pr = typeof body.pr === 'string' ? s.prs.find(p => p.url === body.pr && shownPr(p)) : null;

      if (!pr) return { code: 404, error: 'not a PR of this chat' };
      if (body.on === 'ci' && pr.checks !== 'pending') return { code: 409, error: 'its checks are not running' };
      z.pr = pr.url;
    }

    if (body.on === 'reply' && statusOf(s) !== 'working') return { code: 409, error: 'Claude is not at work in it' };
    if (body.on === 'mon' && !runningTasks(s).length) return { code: 409, error: 'no monitor runs in it' };
    z.on = body.on;
  }

  if (!z.until && !z.on) return { code: 400, error: 'expected {until} or {on}' };
  return { snooze: z };
}

/** The chat's back alert, once its summary is out: as a moved branch's, with a heading of its own. */
export function backNotify(s, why) {
  const sum = summary(s);
  const heading = `Back · ${sum.project}`;

  const evt = {
    kind: 'back',
    sessionId: s.id,
    project: sum.project,
    title: sum.title,
    heading,
    name: s.live?.name || null,
    cwd: s.cwd,
    snippet: why,
    ts: new Date().toISOString(),
    ...hushOf(s),
  };

  broadcast('alert', evt);
  if (!evt.quiet) nativeNotify(heading, sum.title, why);
}
