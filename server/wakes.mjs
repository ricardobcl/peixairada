// Wake-ups (2026-10-31): a chat that set itself to wake — ScheduleWakeup, CronCreate — and when next.
import { resultText, snippet } from './transcript/text.mjs';

// ---- wake-ups: a chat that set itself to wake (2026-10-31, round XIII's I8) ------------------------------------
// `/loop` without an interval paces itself with ScheduleWakeup ({delaySeconds, prompt, reason} — its result's
// toolUseResult {scheduledFor: ms, clampedDelaySeconds}; {stop: true} cancels), with one `CronCreate` ({cron, prompt,
// recurring, durable}; CronDelete {id}) for a fixed interval or a time. Both live in the claude that set them (a durable
// job aside) and fire only while it is idle, as a user line `turnOrigin: "scheduled"` — a meta one for ScheduleWakeup.
// Such a chat is Watching till the time and a grace after, or till the turn it set comes.
export const WAKE_TOOLS = new Set(['ScheduleWakeup', 'CronCreate', 'CronDelete']);
const WAKE_GRACE_MS = Number(process.env.WAKE_GRACE_MS || 5 * 60_000); // a fire waits for an idle claude, a recurring job up to a share of its period
const CRON_MAX_MS = 7 * 86_400_000; // a recurring job expires on its own

export function noteWakeCall(session, block, ts) {
  (session.wakeCalls ||= new Map()).set(block.id, { name: block.name, input: block.input || {}, ts });
  while (session.wakeCalls.size > 20) session.wakeCalls.delete(session.wakeCalls.keys().next().value);
}

/** The call's result: the wake-up it set, its time the harness's own when it says one. True when the wakes changed. */
export function startWake(session, res, out, ts) {
  const call = session.wakeCalls.get(res.tool_use_id);

  if (!call) return false;
  session.wakeCalls.delete(res.tool_use_id);
  if (res.is_error) return false;

  const input = call.input;
  const wakes = (session.wakes ||= new Map());
  const from = Date.parse(ts) || Date.now();

  const ms = value => (typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN);

  if (call.name === 'ScheduleWakeup') {
    if (input.stop || out?.stopped) return wakes.delete('loop');
    let at = ms(out?.scheduledFor);

    if (!(at > 0)) {
      at = (Date.parse(call.ts) || from) + (Number(out?.clampedDelaySeconds ?? input.delaySeconds) || 0) * 1000;
    }

    if (!(at > from - 60_000)) return false;
    wakes.set('loop', { kind: 'loop', at, recurring: false, what: snippet(input.reason || '', 90), from });
    return true;
  }

  if (call.name === 'CronDelete') return wakes.delete(`cron:${input.id}`);
  const id = out?.id || /\b(?:job|task) ([\w-]+)/.exec(resultText(res))?.[1];

  if (!id) return false;
  const recurring = input.recurring !== false;
  let at = ms(out?.nextFireAt ?? out?.nextRunAt ?? out?.scheduledFor);

  if (!(at > 0)) at = cronNext(input.cron, from);
  if (!(at > 0)) return false;

  wakes.set(`cron:${id}`, {
    kind: 'cron',
    at,
    recurring,
    cron: input.cron,
    what: snippet(input.prompt || '', 90),
    from,
  });

  return true;
}

/** A scheduled turn began: the wake-up it was — the soonest due by then — is spent, a recurring job moved to its next. */
export function wakeFired(session, ts) {
  if (!session.wakes?.size) return false;
  const firedAt = Date.parse(ts) || Date.now();

  const due = [...session.wakes]
    .filter(([, wake]) => wake.at <= firedAt + 60_000)
    .sort((left, right) => left[1].at - right[1].at)[0];

  if (!due) return false;
  const next = due[1].recurring ? cronNext(due[1].cron, firedAt) : NaN;

  if (next > 0) due[1].at = next;
  else session.wakes.delete(due[0]);
  return true;
}

/** The first minute after `after` (ms) a five-field cron expression — "M H DoM Mon DoW", the Mac's local time — matches,
 *  within a year; NaN for one it cannot read. A day matches either of DoM and DoW when both are set, as cron's does. */
export function cronNext(expr, after) {
  const fields = String(expr || '')
    .trim()
    .split(/\s+/);

  if (fields.length !== 5) return NaN;

  const field = (src, lo, hi) => {
    const out = new Set();

    for (const part of src.split(',')) {
      const match = /^(?:(\*)|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);

      if (!match) return null;

      const start = match[1] ? lo : +match[2];
      const end = match[1] || (match[4] && match[3] == null) ? hi : match[3] != null ? +match[3] : start;
      const step = match[4] ? +match[4] : 1;

      if (start < lo || end > hi || start > end || step < 1) return null;
      for (let value = start; value <= end; value += step) out.add(value);
    }

    return out;
  };

  const [minuteSet, hourSet, monthDaySet, Mo, weekDaySet] = [
    field(fields[0], 0, 59),
    field(fields[1], 0, 23),
    field(fields[2], 1, 31),
    field(fields[3], 1, 12),
    field(fields[4], 0, 7),
  ];

  if (!minuteSet || !hourSet || !monthDaySet || !Mo || !weekDaySet || !(after >= 0)) return NaN;

  const days = new Set([...weekDaySet].map(weekDay => weekDay % 7));
  const anyD = fields[2] === '*';
  const anyW = fields[4] === '*';

  const mins = [...minuteSet].sort((left, right) => left - right);
  const hours = [...hourSet].sort((left, right) => left - right);
  const afterDay = new Date(after);

  for (let dayOffset = 0; dayOffset < 367; dayOffset++) {
    const day = new Date(afterDay.getFullYear(), afterDay.getMonth(), afterDay.getDate() + dayOffset);

    if (!Mo.has(day.getMonth() + 1)) continue;

    const dm = monthDaySet.has(day.getDate());
    const dw = days.has(day.getDay());

    if (!(anyD && anyW ? true : anyD ? dw : anyW ? dm : dm || dw)) continue;

    for (const hour of hours) {
      for (const minute of mins) {
        const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();

        if (at > after) return at;
      }
    }
  }

  return NaN;
}

/** What wakes it next, for the summary — reads only: a live claude's, set since it started, not past its grace. */
export function nextWake(session, now = Date.now()) {
  if (!session.alive || !session.wakes?.size) return null;
  const born = Number(session.live?.startedAt) || 0;
  let best = null;

  for (const wake of session.wakes.values()) {
    if (wake.from >= born && now <= wake.at + WAKE_GRACE_MS && (!best || wake.at < best.at)) best = wake;
  }

  return best && { at: new Date(best.at).toISOString(), kind: best.kind, recurring: best.recurring, what: best.what };
}

/** The poll's half: a wake-up of a claude gone goes with it, one past its grace goes — a recurring one to its next time,
 *  till it expires. True when any changed. */
export function pruneWakes(session, now = Date.now()) {
  if (!session.wakes?.size) return false;

  const sizeBefore = session.wakes.size;
  const born = Number(session.live?.startedAt) || 0;

  let moved = false;

  for (const [key, wake] of session.wakes) {
    if (!session.alive || wake.from < born) {
      session.wakes.delete(key);
      continue;
    }

    if (now <= wake.at + WAKE_GRACE_MS) continue;
    const next = wake.recurring && now - wake.from < CRON_MAX_MS ? cronNext(wake.cron, now) : NaN;

    if (next > 0) {
      wake.at = next;
      moved = true;
    } else session.wakes.delete(key);
  }

  return moved || session.wakes.size !== sizeBefore;
}
