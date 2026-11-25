// Wake-ups (2026-10-31): a chat that set itself to wake — ScheduleWakeup, CronCreate — and when next.
import { resultText, snippet } from './transcript/text.mjs';

// ---- wake-ups: a chat that set itself to wake (2026-10-31, round XIII's I8) ------------------------------------
// `/loop` without an interval paces itself with ScheduleWakeup ({delaySeconds, prompt, reason} — its result's
// toolUseResult {scheduledFor: ms, clampedDelaySeconds}; {stop: true} cancels), with one `CronCreate` ({cron, prompt,
// recurring, durable}; CronDelete {id}) for a fixed interval or a time. Both live in the claude that set them (a durable
// job aside) and fire only while it is idle, as a user line `turnOrigin: "scheduled"` — a meta one for ScheduleWakeup.
// Such a chat is Watching till the time and a grace after, or till the turn it set comes.
export const WAKE_TOOLS = new Set(['ScheduleWakeup', 'CronCreate', 'CronDelete']);
const WAKE_GRACE_MS = Number(process.env.WAKE_GRACE_MS || 5 * 60_000);   // a fire waits for an idle claude, a recurring job up to a share of its period
const CRON_MAX_MS = 7 * 86_400_000;   // a recurring job expires on its own
export function noteWakeCall(s, b, ts) {
  (s.wakeCalls ||= new Map()).set(b.id, { name: b.name, input: b.input || {}, ts });
  while (s.wakeCalls.size > 20) s.wakeCalls.delete(s.wakeCalls.keys().next().value);
}
/** The call's result: the wake-up it set, its time the harness's own when it says one. True when the wakes changed. */
export function startWake(s, res, out, ts) {
  const c = s.wakeCalls.get(res.tool_use_id); if (!c) return false;
  s.wakeCalls.delete(res.tool_use_id);
  if (res.is_error) return false;
  const i = c.input, wakes = (s.wakes ||= new Map()), from = Date.parse(ts) || Date.now();
  const ms = v => typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN;
  if (c.name === 'ScheduleWakeup') {
    if (i.stop || out?.stopped) return wakes.delete('loop');
    let at = ms(out?.scheduledFor);
    if (!(at > 0)) at = (Date.parse(c.ts) || from) + (Number(out?.clampedDelaySeconds ?? i.delaySeconds) || 0) * 1000;
    if (!(at > from - 60_000)) return false;
    wakes.set('loop', { kind: 'loop', at, recurring: false, what: snippet(i.reason || '', 90), from });
    return true;
  }
  if (c.name === 'CronDelete') return wakes.delete('cron:' + i.id);
  const id = out?.id || /\b(?:job|task) ([\w-]+)/.exec(resultText(res))?.[1]; if (!id) return false;
  const recurring = i.recurring !== false;
  let at = ms(out?.nextFireAt ?? out?.nextRunAt ?? out?.scheduledFor); if (!(at > 0)) at = cronNext(i.cron, from);
  if (!(at > 0)) return false;
  wakes.set('cron:' + id, { kind: 'cron', at, recurring, cron: i.cron, what: snippet(i.prompt || '', 90), from });
  return true;
}
/** A scheduled turn began: the wake-up it was — the soonest due by then — is spent, a recurring job moved to its next. */
export function wakeFired(s, ts) {
  if (!s.wakes?.size) return false;
  const t = Date.parse(ts) || Date.now();
  const w = [...s.wakes].filter(([, w]) => w.at <= t + 60_000).sort((a, b) => a[1].at - b[1].at)[0]; if (!w) return false;
  const next = w[1].recurring ? cronNext(w[1].cron, t) : NaN;
  if (next > 0) w[1].at = next; else s.wakes.delete(w[0]);
  return true;
}
/** The first minute after `after` (ms) a five-field cron expression — "M H DoM Mon DoW", the Mac's local time — matches,
 *  within a year; NaN for one it cannot read. A day matches either of DoM and DoW when both are set, as cron's does. */
export function cronNext(expr, after) {
  const f = String(expr || '').trim().split(/\s+/); if (f.length !== 5) return NaN;
  const field = (src, lo, hi) => {
    const out = new Set();
    for (const part of src.split(',')) {
      const m = /^(?:(\*)|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part); if (!m) return null;
      const a = m[1] ? lo : +m[2], b = m[1] || (m[4] && m[3] == null) ? hi : m[3] != null ? +m[3] : a, step = m[4] ? +m[4] : 1;
      if (a < lo || b > hi || a > b || step < 1) return null;
      for (let v = a; v <= b; v += step) out.add(v);
    }
    return out;
  };
  const [M, H, D, Mo, W] = [field(f[0], 0, 59), field(f[1], 0, 23), field(f[2], 1, 31), field(f[3], 1, 12), field(f[4], 0, 7)];
  if (!M || !H || !D || !Mo || !W || !(after >= 0)) return NaN;
  const days = new Set([...W].map(v => v % 7)), anyD = f[2] === '*', anyW = f[4] === '*';
  const mins = [...M].sort((a, b) => a - b), hours = [...H].sort((a, b) => a - b), t = new Date(after);
  for (let d = 0; d < 367; d++) {
    const day = new Date(t.getFullYear(), t.getMonth(), t.getDate() + d);
    if (!Mo.has(day.getMonth() + 1)) continue;
    const dm = D.has(day.getDate()), dw = days.has(day.getDay());
    if (!(anyD && anyW ? true : anyD ? dw : anyW ? dm : dm || dw)) continue;
    for (const h of hours) for (const m of mins) { const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime(); if (at > after) return at; }
  }
  return NaN;
}
/** What wakes it next, for the summary — reads only: a live claude's, set since it started, not past its grace. */
export function nextWake(s, now = Date.now()) {
  if (!s.alive || !s.wakes?.size) return null;
  const born = Number(s.live?.startedAt) || 0;
  let best = null;
  for (const w of s.wakes.values()) if (w.from >= born && now <= w.at + WAKE_GRACE_MS && (!best || w.at < best.at)) best = w;
  return best && { at: new Date(best.at).toISOString(), kind: best.kind, recurring: best.recurring, what: best.what };
}
/** The poll's half: a wake-up of a claude gone goes with it, one past its grace goes — a recurring one to its next time,
 *  till it expires. True when any changed. */
export function pruneWakes(s, now = Date.now()) {
  if (!s.wakes?.size) return false;
  const n = s.wakes.size, born = Number(s.live?.startedAt) || 0;
  let moved = false;
  for (const [k, w] of s.wakes) {
    if (!s.alive || w.from < born) { s.wakes.delete(k); continue; }
    if (now <= w.at + WAKE_GRACE_MS) continue;
    const next = w.recurring && now - w.from < CRON_MAX_MS ? cronNext(w.cron, now) : NaN;
    if (next > 0) { w.at = next; moved = true; } else s.wakes.delete(k);
  }
  return moved || s.wakes.size !== n;
}
