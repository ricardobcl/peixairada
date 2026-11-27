// Claude plan usage: the numbers /usage shows, from the OAuth usage endpoint with Claude Code's own token.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUDE_DIR, execFileP } from './env.mjs';

// ---- Claude plan usage, for the chat list's footer: the numbers `/usage` shows in the CLI --------------
// GET https://api.anthropic.com/api/oauth/usage with Claude Code's own OAuth token (the CLI's endpoint and
// beta header, read off the 2.1.278 binary). The token is where Claude Code keeps it — the macOS Keychain
// item "Claude Code-credentials" (the first read asks you to allow `security`; *Always Allow* ends that),
// or ~/.claude/.credentials.json elsewhere. It is used for that one request and never leaves this process:
// the browser gets percentages and reset times. The second thing here that talks to the network, after gh.
// USAGE=off disables the route (no keychain prompt, no call); answers are cached for a minute.
/** The OAuth token, or why there is none: { token } | { why }. */
async function oauthToken() {
  const parse = raw => {
    try {
      const t = JSON.parse(raw)?.claudeAiOauth?.accessToken;

      return typeof t === 'string' && t ? t : null;
    } catch {
      return null;
    }
  };

  const file = join(CLAUDE_DIR, '.credentials.json');

  if (existsSync(file)) {
    try {
      const token = parse(readFileSync(file, 'utf8'));

      return token ? { token } : { why: 'no OAuth token in .credentials.json' };
    } catch (e) {
      return { why: String(e.message || e) };
    }
  }

  if (process.platform !== 'darwin') return { why: 'no ~/.claude/.credentials.json' };

  try {
    const { stdout } = await execFileP(
      '/usr/bin/security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { timeout: 60000 },
    );

    const token = parse(stdout.trim());

    return token ? { token } : { why: 'the keychain item holds no OAuth token — API-key logins have no plan usage' };
  } catch (err) {
    return {
      why: /could not be found/i.test(String(err.message || err))
        ? 'no Claude Code login in the keychain'
        : 'keychain access refused (allow `security` when asked)',
    };
  }
}

// What the usage endpoint answers, as far as the 2.1.278 binary shows: top-level windows — seven_day,
// seven_day_sonnet/opus ({utilization: 0–100, resets_at}) — plus codename buckets of the same
// shape (cinder_cove is the CLI's "Claude Code and Cowork credit", a one-time grant; nimbus_quill turned up
// at 0 % on 2026-09-20 and this CLI has no label for it, so it never shows there) and limits[]: the server's
// own rows, {kind: session | weekly_all | weekly_scoped, percent, resets_at, scope: {model: {display_name}}}.
// The CLI draws the known windows and adds "Current week (<model>)" from the weekly_scoped rows behind an
// allowlist; here every scoped row shows — a per-model allowance (Fable's) is exactly what you want apart.
// Codename buckets show only once they are non-zero; the zero ones come back under `other`.
// No five-hour window (2026-11-02): Claude's plans dropped it, so a `five_hour` field, or a limits[] row of kind
// `session`, is no window whatever it says — and no codename bucket either, whose tag would read F like Fable's.
// A plan capped in money (2026-10-08, read off the 2.1.295 binary — an enterprise seat with a monthly $ cap had no
// rolling windows at all, and the bar said nothing): `extra_usage` {is_enabled, monthly_limit, used_credits — cents of
// `currency` —, utilization 0–100} and one limits[] row per cap, {kind: 'spend', group: 'monthly' | …, percent,
// resets_at, is_active}, the dollars belonging to the row `is_active`; `wattle_ember` is a grant counted in dollars
// ({label, limit_dollars, used_dollars, utilization, resets_at}). A window with money carries `used`, `limit` (whole
// units) and `currency`.
const SPEND_PERIOD = { daily: 'today', weekly: 'this week', monthly: 'this month' }; // the CLI's own words

export function usageWindows(d) {
  const windows = [];
  const other = [];

  const add = (key, label, percent, resetsAt, more) => {
    if (typeof percent === 'number' && !windows.some(x => x.key === key)) {
      windows.push({ key, label, percent: Math.round(percent), resetsAt: resetsAt || null, ...more });
    }
  };

  const named = { seven_day: 'week · all models', seven_day_opus: 'week · Opus', seven_day_sonnet: 'week · Sonnet' };
  const buckets = { cinder_cove: 'Claude Code & Cowork credit' };
  const ex = d.extra_usage && typeof d.extra_usage === 'object' ? d.extra_usage : null;
  const cents = n => (typeof n === 'number' && Number.isFinite(n) ? n / 100 : null);

  const money =
    ex && typeof ex.monthly_limit === 'number'
      ? {
          used: cents(ex.used_credits) ?? 0,
          limit: cents(ex.monthly_limit),
          currency: String(ex.currency || 'USD').toUpperCase(),
        }
      : null;

  let spent = false; // the dollars are on a spend row already

  for (const [k, label] of Object.entries(named)) {
    if (d[k] && typeof d[k] === 'object') add(k, label, d[k].utilization, d[k].resets_at);
  }

  for (const row of Array.isArray(d.limits) ? d.limits : []) {
    if (!row || typeof row !== 'object' || typeof row.percent !== 'number') continue;

    if (row.kind === 'spend') {
      const group = String(row.group || 'monthly');
      const mine = money && (row.is_active || d.limits.filter(r => r?.kind === 'spend').length === 1);

      add(`spend:${group}`, `spend · ${SPEND_PERIOD[group] || group.replace(/_/g, ' ')}`, row.percent, row.resets_at, {
        period: group,
        ...(mine && money),
      });

      if (mine) spent = true;
      continue;
    }

    const who =
      row.scope?.model?.display_name || row.scope?.surface?.display_name || row.scope?.display_name || row.label;

    if (!who || row.kind === 'session' || row.kind === 'weekly_all') continue; // the week's is the window above; the session's is gone

    add(
      `limits:${row.kind}:${who}`,
      `${row.kind === 'weekly_scoped' ? 'week' : String(row.kind).replace(/_/g, ' ')} · ${who}`,
      row.percent,
      row.resets_at,
    );
  }

  // Extra usage switched on, and no spend row to hang it on: its own window, the month's (the field's name; no reset given)
  if (money && !spent && ex.is_enabled !== false && money.limit > 0) {
    add(
      'extra_usage',
      'extra usage · this month',
      typeof ex.utilization === 'number' ? ex.utilization : (money.used / money.limit) * 100,
      null,
      { period: 'monthly', ...money },
    );
  }

  const we = d.wattle_ember;

  if (
    we &&
    typeof we === 'object' &&
    typeof we.utilization === 'number' &&
    (we.utilization > 0 || typeof we.limit_dollars === 'number')
  ) {
    add(
      'wattle_ember',
      typeof we.label === 'string' && we.label.trim() ? we.label.trim() : 'credit',
      we.utilization,
      we.resets_at,
      typeof we.limit_dollars === 'number'
        ? {
            used: typeof we.used_dollars === 'number' ? we.used_dollars : null,
            limit: we.limit_dollars,
            currency: 'USD',
          }
        : {},
    );
  }

  for (const [k, w] of Object.entries(d)) {
    if (
      k in named ||
      k === 'five_hour' ||
      k === 'limits' ||
      k === 'extra_usage' ||
      k === 'wattle_ember' ||
      !w ||
      typeof w !== 'object' ||
      typeof w.utilization !== 'number'
    ) {
      continue;
    }

    if (w.utilization > 0) add(k, buckets[k] || k.replace(/_/g, ' '), w.utilization, w.resets_at);
    else other.push(k);
  }

  return { windows, other };
}

/** { code, body } for the route. One question at a time, and its answer kept: a minute when it is the numbers, half
 *  a minute when it is a failure (2026-10-03: every page and every reload asked on its own — a keychain refused, or
 *  its prompt still up, was a `security` and a prompt per ask). */
const usageCache = { at: 0, code: 0, body: null };
let usageAsk = null;

export function planUsage() {
  if (process.env.USAGE === 'off') {
    return Promise.resolve({ code: 503, body: { error: 'usage disabled (USAGE=off)', off: true } });
  } // off: the page hides its bar

  if (usageCache.body && Date.now() - usageCache.at < (usageCache.code === 200 ? 60_000 : 30_000)) {
    return Promise.resolve(usageCache);
  }

  return (usageAsk ??= askUsage()
    .then(r => Object.assign(usageCache, r, { at: Date.now() }))
    .finally(() => {
      usageAsk = null;
    }));
}

async function askUsage() {
  const { token, why } = await oauthToken();

  if (!token) return { code: 503, body: { error: why } };

  try {
    const r = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    const d = await r.json().catch(() => ({}));

    if (!r.ok) {
      return {
        code: r.status === 401 ? 503 : 502,
        body: { error: d?.error?.message || `usage API: HTTP ${r.status}` },
      };
    }

    return { code: 200, body: { ...usageWindows(d), fetchedAt: new Date().toISOString() } };
  } catch (e) {
    return { code: 502, body: { error: `usage API: ${e.message || e}` } };
  }
}
