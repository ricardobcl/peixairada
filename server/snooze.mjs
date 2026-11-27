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
const isoMs = time => Date.parse(time || '') || 0;

/** Why the snooze (`snooze`) of the chat (`session`) ends now: null (it holds), `{ quiet }` (it ends with no mark and no alert) or
 *  `{ kind, why }`. Reads only. */
export function wakeWhy(session, snooze, now = Date.now()) {
  const at = isoMs(snooze.at);

  if (isRemoved(session)) return QUIET_WAKE;
  if (isDone(session) && isoMs(doneMarks[session.id]) > at) return QUIET_WAKE; // ticked since
  if (statusOf(session) === 'needs-input') return QUIET_WAKE; // the question's own alert speaks
  if (isoMs(session.lastUserAt) > at) return QUIET_WAKE; // you were back in it yourself
  if (snooze.until && isoMs(snooze.until) <= now) return { kind: 'time', why: 'its time came' };
  const pr = snooze.pr ? session.prs.find(entry => entry.url === snooze.pr && shownPr(entry)) : null;

  if (snooze.on === 'pr' && pr?.turn?.you && isoMs(pr.turn.movedAt) > at) {
    return { kind: 'pr', why: `${pr.label} came round to you` };
  }

  if (snooze.on === 'pr' && (!pr || pr.state === 'merged' || pr.state === 'closed')) {
    return { kind: 'pr', why: !pr ? 'its PR left the chat' : `${pr.label} was ${pr.state}` };
  }

  if (snooze.on === 'ci' && pr?.checks !== 'pending') {
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

  if (snooze.on === 'reply' && statusOf(session) !== 'working') {
    return session.alive ? { kind: 'reply', why: 'Claude replied' } : { kind: 'ended', why: 'its claude ended' };
  }

  if (snooze.on === 'mon' && !runningTasks(session).length) return { kind: 'mon', why: 'its monitor ended' };
  return null;
}

/** The snooze ended, if it has: dropped, the mark kept (`woke`) and the `back` alert owed to the chat's next push — after
 *  the summary that says it. True when it ended; the caller pushes the chat (the push's own call pushes on). Not while
 *  the boot reads, nor on a chat being re-read. A reply's wake owes nothing: its alert is queued already. */
export function wakeCheck(session, now = Date.now()) {
  const snooze = snoozed[session.id];

  if (!snooze || indexing || session.silent) return false;
  const wake = wakeWhy(session, snooze, now);

  if (!wake) return false;
  delete snoozed[session.id];

  if (!wake.quiet) {
    woke[session.id] = { at: new Date(now).toISOString(), why: wake.why };
    if (!(wake.kind === 'reply' && session.pendingNotify?.has('reply'))) session.backOwed = wake.why;
    console.log(`[peixairada] chat ${session.id}: back from its snooze — ${wake.why}`);
  }

  saveState();
  armSnoozes();
  return true;
}

/** Every snoozed chat looked at: the poll's, and the timer's. One the board no longer has is let go. */
export function wakeAll() {
  for (const id of Object.keys(snoozed)) {
    const session = sessions.get(id);

    if (!session) {
      delete snoozed[id];
      continue;
    }

    if (wakeCheck(session)) schedulePush(session);
  }

  armSnoozes();
}

let snoozeTimer = null;

/** One timer, to the nearest snooze's time (setTimeout's cap at most); a time already past is looked at again a moment on,
 *  so a check the boot or a re-read held back is not a loop. */
export function armSnoozes() {
  clearTimeout(snoozeTimer);
  snoozeTimer = null;
  const next = Math.min(...Object.values(snoozed).map(snooze => isoMs(snooze.until) || Infinity));

  if (Number.isFinite(next)) {
    snoozeTimer = setTimeout(wakeAll, Math.min(Math.max(next - Date.now() + 20, 250), 2 ** 31 - 1));
  }
}

/** A snooze as asked (`POST …/snooze`): `{ snooze }`, or `{ code, error }`. */
export function snoozeOf(session, body, now = Date.now()) {
  if (isRemoved(session)) return { code: 409, error: 'it is deleted from the board' };
  if (statusOf(session) === 'needs-input') return { code: 409, error: 'it is asking you: a question wakes it' };
  const snooze = { at: new Date(now).toISOString() };

  if (body.until != null) {
    const until =
      typeof body.until === 'number' ? body.until : typeof body.until === 'string' ? Date.parse(body.until) : NaN;

    if (!Number.isFinite(until)) return { code: 400, error: 'until: not a time' };
    if (until <= now) return { code: 400, error: 'until: that time is past' };
    if (until - now > SNOOZE_MAX_MS) return { code: 400, error: 'until: more than a year away' };
    snooze.until = new Date(until).toISOString();
  }

  if (body.on != null) {
    if (!SNOOZE_ON.has(body.on)) return { code: 400, error: `on: one of ${[...SNOOZE_ON].join(', ')}` };

    if (body.on === 'pr' || body.on === 'ci') {
      const pr =
        typeof body.pr === 'string' ? session.prs.find(entry => entry.url === body.pr && shownPr(entry)) : null;

      if (!pr) return { code: 404, error: 'not a PR of this chat' };
      if (body.on === 'ci' && pr.checks !== 'pending') return { code: 409, error: 'its checks are not running' };
      snooze.pr = pr.url;
    }

    if (body.on === 'reply' && statusOf(session) !== 'working') {
      return { code: 409, error: 'Claude is not at work in it' };
    }

    if (body.on === 'mon' && !runningTasks(session).length) return { code: 409, error: 'no monitor runs in it' };
    snooze.on = body.on;
  }

  if (!snooze.until && !snooze.on) return { code: 400, error: 'expected {until} or {on}' };
  return { snooze };
}

/** The chat's back alert, once its summary is out: as a moved branch's, with a heading of its own. */
export function backNotify(session, why) {
  const sum = summary(session);
  const heading = `Back · ${sum.project}`;

  const evt = {
    kind: 'back',
    sessionId: session.id,
    project: sum.project,
    title: sum.title,
    heading,
    name: session.live?.name || null,
    cwd: session.cwd,
    snippet: why,
    ts: new Date().toISOString(),
    ...hushOf(session),
  };

  broadcast('alert', evt);
  if (!evt.quiet) nativeNotify(heading, sum.title, why);
}
