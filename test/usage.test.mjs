// What the plan's usage endpoint answers, down to the windows the chat list's foot draws (usageWindows). The rolling
// windows of a Pro/Max plan, and since 2026-10-08 a cap counted in money: an enterprise seat's monthly spend cap, which
// came with no rolling window at all — the foot said "nothing reported" — and extra usage switched on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-test-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { usageWindows } = await import('../server.mjs');

const at = '2026-10-12T04:59:59.688Z';

test('a Max plan: the rolling windows and a model\'s own week', () => {
  const { windows, other } = usageWindows({
    five_hour: { utilization: 7.4, resets_at: at }, seven_day: { utilization: 22, resets_at: at }, seven_day_opus: null,
    extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null },
    limits: [{ kind: 'session', percent: 7, resets_at: at }, { kind: 'weekly_scoped', percent: 8, resets_at: at, scope: { model: { display_name: 'Fable' } } }],
    nimbus_quill: { utilization: 0, resets_at: null },
  });
  assert.deepEqual(windows.map(w => [w.key, w.percent]), [['five_hour', 7], ['seven_day', 22], ['limits:weekly_scoped:Fable', 8]]);
  assert.ok(windows.every(w => !('limit' in w)), 'no money on a plan of windows');
  assert.deepEqual(other, ['nimbus_quill']);
});

test('a monthly spend cap: one window, its dollars from extra_usage, in whole units', () => {
  const { windows } = usageWindows({
    five_hour: null, seven_day: null,
    extra_usage: { is_enabled: true, monthly_limit: 50000, used_credits: 27140, utilization: 54, currency: 'usd' },
    limits: [{ kind: 'spend', group: 'monthly', percent: 54, resets_at: '2026-11-01T00:00:00.000Z', severity: 'normal', is_active: true }],
  });
  assert.deepEqual(windows, [{ key: 'spend:monthly', label: 'spend · this month', percent: 54, resetsAt: '2026-11-01T00:00:00.000Z', period: 'monthly', used: 271.4, limit: 500, currency: 'USD' }]);
});

test('several caps: the dollars go with the active one only', () => {
  const { windows } = usageWindows({
    extra_usage: { is_enabled: true, monthly_limit: 2000, used_credits: 1900, utilization: 95, currency: 'USD' },
    limits: [
      { kind: 'spend', group: 'daily', percent: 95, resets_at: at, is_active: true },
      { kind: 'spend', group: 'monthly', percent: 30, resets_at: '2026-11-01T00:00:00.000Z', is_active: false },
    ],
  });
  assert.deepEqual(windows.map(w => [w.key, w.label, w.limit ?? null]), [['spend:daily', 'spend · today', 20], ['spend:monthly', 'spend · this month', null]]);
});

test('extra usage on a plan of windows, with no spend row: a window of its own', () => {
  const { windows } = usageWindows({
    five_hour: { utilization: 100, resets_at: at },
    extra_usage: { is_enabled: true, monthly_limit: 10000, used_credits: 2500, utilization: null, currency: 'EUR' },
  });
  assert.deepEqual(windows.map(w => w.key), ['five_hour', 'extra_usage']);
  assert.deepEqual(windows[1], { key: 'extra_usage', label: 'extra usage · this month', percent: 25, resetsAt: null, period: 'monthly', used: 25, limit: 100, currency: 'EUR' });
});

test('extra usage switched off, or with no limit, is no window', () => {
  assert.deepEqual(usageWindows({ extra_usage: { is_enabled: false, monthly_limit: 5000, used_credits: 0, utilization: 0 } }).windows, []);
  assert.deepEqual(usageWindows({ extra_usage: { is_enabled: true, monthly_limit: null, used_credits: 300, utilization: null } }).windows, []);
});

test('a grant counted in dollars keeps its label and amounts', () => {
  const { windows } = usageWindows({ wattle_ember: { utilization: 40, resets_at: null, label: 'Team credit', limit_dollars: 50, used_dollars: 20, remaining_dollars: 30 } });
  assert.deepEqual(windows, [{ key: 'wattle_ember', label: 'Team credit', percent: 40, resetsAt: null, used: 20, limit: 50, currency: 'USD' }]);
});
