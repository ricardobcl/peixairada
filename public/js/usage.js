// ---- plan usage: the status bar's pies and their rows ------------------------------------
// What `/usage` shows, always in view (2026-09-24; under the chat list until the status bar had it). Asked for on load, every
// USAGE_EVERY_MS while the page is in view — the server caches the answer for a minute, so any number of pages
// cost one call a minute at most —, as soon as a window's reset has passed, and on the way back to a hidden page.
// A failure keeps the last numbers, dimmed, the error on hover; with no numbers yet it is a sentence, not a blank:
// the first ask on a Mac is a keychain prompt, and an API-key login has none. Failures back off (twice as long
// each, to half an hour), so a keychain prompt you refused is not put back up every two minutes. USAGE=off on the
// server hides the bar's segment.
const USAGE_EVERY_MS = 120e3;
const usage = { data: null, err: '', off: false, at: 0, fails: 0, busy: false };
// Each window's tag (2026-09-28): the window's length, or a model's initial for its own week (F for Fable), CR for a
// credit grant — and $ for a cap counted in money (2026-10-08: a plan's monthly spend cap, extra usage).
const USAGE_SHORT = { seven_day: '1W', seven_day_opus: 'O', seven_day_sonnet: 'S', cinder_cove: 'CR' };
const uShort = w =>
  USAGE_SHORT[w.key] || (w.limit != null ? '$' : (String(w.label).split(' · ').pop().trim()[0] || '?').toUpperCase());
/** An amount in the window's currency — whole units from 100 up, cents under. */
const uMoney = (n, cur = 'USD') => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: n >= 100 ? 0 : 2,
    }).format(n);
  } catch {
    return `${n} ${cur}`;
  }
};
const uSpent = w =>
  w.limit != null ? `${w.used != null ? `${uMoney(w.used, w.currency)} of ` : ''}${uMoney(w.limit, w.currency)}` : '';
// a credit grant runs out rather than resets — and says no time; a cap in money says its amounts whether or not
const uGrant = w => !w.resetsAt && w.limit == null;
// Orange for what is spent, red once a window is nearly gone (2026-09-24 — it was green, amber from 70 %, red from 90
// %; amber under orange would have read as a step down).
const uColor = p => (p >= 90 ? 'var(--ink)' : 'var(--spend)'); // red is for a chat asking you alone (2026-11-01, round XIX's S3)
// How far through its window the clock is, 0–1 — for the windows whose length is known; a credit grant has none. A
// month is the calendar month before its reset.
const uSpan = (k, w = {}) =>
  /^seven_day|^limits:weekly/.test(k) || w.period === 'weekly'
    ? 7 * 86400e3
    : w.period === 'daily'
      ? 86400e3
      : w.period === 'monthly' && w.resetsAt
        ? (t => t - new Date(t).setUTCMonth(new Date(t).getUTCMonth() - 1))(new Date(w.resetsAt).getTime())
        : 0;
const uPace = w => {
  const len = uSpan(w.key, w),
    end = w.resetsAt ? new Date(w.resetsAt).getTime() : 0;
  if (!len || !end) return null;
  const f = 1 - (end - Date.now()) / len;
  return f >= 0 && f <= 1 ? f : null;
};
const untilReset = iso => {
  if (!iso) return '';
  const m = Math.max(0, Math.round((new Date(iso) - Date.now()) / 60000));
  return m >= 1440
    ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
    : m >= 60
      ? `${Math.floor(m / 60)}h ${m % 60}m`
      : `${m}m`;
};
const uTip = w => {
  const f = uPace(w);
  return `${w.label}: ${w.percent}% used${w.limit != null ? ` — ${uSpent(w)}` : ''}${f != null ? ` · ${Math.round(f * 100)}% of the window gone` : ''}${w.resetsAt ? ` · resets ${new Date(w.resetsAt).toLocaleString()}` : ''}`;
};
/** A row per window — name, bar with its clock's tick, percent, time to reset, and money for a cap in it — the status
 *  bar's panel. */
const usageRows = ws =>
  ws
    .map(w => {
      const f = uPace(w);
      return `<div class="urow" title="${esc(uTip(w))}"><span class="ul">${esc(w.label)}</span><span class="ubar"><i style="width:${Math.min(100, w.percent)}%;--u:${uColor(w.percent)}"></i>${f != null ? `<b style="left:${(f * 100).toFixed(1)}%"></b>` : ''}</span><span class="up">${w.percent}%</span><span class="ur">${untilReset(w.resetsAt)}</span>${w.limit != null ? `<span class="umoney">${esc(uSpent(w))}</span>` : ''}</div>`;
    })
    .join('');
async function loadUsage() {
  if (usage.busy) return;
  usage.busy = true;
  try {
    const d = await api('GET', '/api/usage');
    if (Array.isArray(d.windows)) Object.assign(usage, { data: d, err: '', off: false, fails: 0 });
    else Object.assign(usage, { err: 'no windows in the answer', fails: usage.fails + 1 });
  } catch (e) {
    Object.assign(usage, { err: e.message, off: !!e.body?.off, fails: usage.fails + 1 });
  }
  Object.assign(usage, { busy: false, at: Date.now() });
  renderBar();
}
// Due: the interval is up (longer after failures), or a window has reset since the last answer — its numbers are old.
const usageDue = () =>
  Date.now() - usage.at > USAGE_EVERY_MS * 2 ** Math.min(usage.fails, 4) ||
  !!usage.data?.windows.some(w => {
    const t = w.resetsAt ? new Date(w.resetsAt).getTime() : 0;
    return t > usage.at && t <= Date.now();
  });
setInterval(() => {
  if (!document.hidden) usageDue() ? loadUsage() : renderBar();
}, 30e3);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && usageDue()) loadUsage();
});
loadUsage();
