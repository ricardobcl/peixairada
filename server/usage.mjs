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
      const token = JSON.parse(raw)?.claudeAiOauth?.accessToken;

      return typeof token === 'string' && token ? token : null;
    } catch {
      return null;
    }
  };

  const file = join(CLAUDE_DIR, '.credentials.json');

  if (existsSync(file)) {
    try {
      const token = parse(readFileSync(file, 'utf8'));

      return token ? { token } : { why: 'no OAuth token in .credentials.json' };
    } catch (error) {
      return { why: String(error.message || error) };
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

export function usageWindows(usage) {
  const windows = [];
  const other = [];

  const add = (key, label, percent, resetsAt, more) => {
    if (typeof percent === 'number' && !windows.some(existing => existing.key === key)) {
      windows.push({ key, label, percent: Math.round(percent), resetsAt: resetsAt || null, ...more });
    }
  };

  const named = { seven_day: 'week · all models', seven_day_opus: 'week · Opus', seven_day_sonnet: 'week · Sonnet' };
  const buckets = { cinder_cove: 'Claude Code & Cowork credit' };
  const ex = usage.extra_usage && typeof usage.extra_usage === 'object' ? usage.extra_usage : null;
  const cents = amount => (typeof amount === 'number' && Number.isFinite(amount) ? amount / 100 : null);

  const money =
    ex && typeof ex.monthly_limit === 'number'
      ? {
          used: cents(ex.used_credits) ?? 0,
          limit: cents(ex.monthly_limit),
          currency: String(ex.currency || 'USD').toUpperCase(),
        }
      : null;

  let spent = false; // the dollars are on a spend row already

  for (const [key, label] of Object.entries(named)) {
    if (usage[key] && typeof usage[key] === 'object') add(key, label, usage[key].utilization, usage[key].resets_at);
  }

  for (const row of Array.isArray(usage.limits) ? usage.limits : []) {
    if (!row || typeof row !== 'object' || typeof row.percent !== 'number') continue;

    if (row.kind === 'spend') {
      const group = String(row.group || 'monthly');
      const mine = money && (row.is_active || usage.limits.filter(limitRow => limitRow?.kind === 'spend').length === 1);

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

  const we = usage.wattle_ember;

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

  for (const [key, bucket] of Object.entries(usage)) {
    if (
      key in named ||
      key === 'five_hour' ||
      key === 'limits' ||
      key === 'extra_usage' ||
      key === 'wattle_ember' ||
      !bucket ||
      typeof bucket !== 'object' ||
      typeof bucket.utilization !== 'number'
    ) {
      continue;
    }

    if (bucket.utilization > 0) add(key, buckets[key] || key.replace(/_/g, ' '), bucket.utilization, bucket.resets_at);
    else other.push(key);
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
    .then(answer => Object.assign(usageCache, answer, { at: Date.now() }))
    .finally(() => {
      usageAsk = null;
    }));
}

async function askUsage() {
  const { token, why } = await oauthToken();

  if (!token) return { code: 503, body: { error: why } };

  try {
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    const usage = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        code: response.status === 401 ? 503 : 502,
        body: { error: usage?.error?.message || `usage API: HTTP ${response.status}` },
      };
    }

    return { code: 200, body: { ...usageWindows(usage), fetchedAt: new Date().toISOString() } };
  } catch (error) {
    return { code: 502, body: { error: `usage API: ${error.message || error}` } };
  }
}
