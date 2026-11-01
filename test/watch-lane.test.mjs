// The Watching lane's server half (2026-10-31, round XIII): a turn its own task's notice woke (`woken`), the wake-ups a
// chat sets itself (`wake`, from ScheduleWakeup and CronCreate as Claude Code writes them) — pure functions of server.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-watch-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { fold, newSession, summary, cronNext, pruneWakes } = await import('../server.mjs');

// judged against the real clock, as tasks are: the lines date from a few minutes ago
const t0 = Date.now() - 5 * 60_000, at = i => new Date(t0 + i * 1000).toISOString();
const live = id => { const s = newSession(id, `/x/${id}.jsonl`); s.alive = true; s.live = { pid: 1, startedAt: t0 - 3600_000 }; return s; };
const user = (text, i, extra = {}) => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, timestamp: at(i), cwd: '/tmp/repo', ...extra });
const said = (blocks, stop, i, extra = {}) => ({ type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5', id: 'm' + i, content: blocks, stop_reason: stop }, timestamp: at(i), cwd: '/tmp/repo', ...extra });
const call = (id, name, input, i) => said([{ type: 'tool_use', id, name, input }], 'tool_use', i);
const result = (id, content, i, toolUseResult) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] }, timestamp: at(i), cwd: '/tmp/repo', ...toolUseResult && { toolUseResult } });
const note = (task, i, status) => user(`<task-notification>\n<task-id>${task}</task-id>\n${status ? `<status>${status}</status>\n` : ''}<summary>Monitor event</summary>\n<event>Build: pass</event>\n</task-notification>`, i, { origin: { kind: 'task-notification' }, promptSource: 'system' });

test('a turn the chat\'s own monitor woke is woken; your word, its end and the reply are not', () => {
  const s = live('w1');
  fold(s, user('watch the CI', 0));
  fold(s, call('tm', 'Monitor', { description: 'CI on #382', timeout_ms: 1800_000 }, 1));
  fold(s, result('tm', 'Monitor started (task mon1abc, expires in 30m).', 2));
  fold(s, said([{ type: 'text', text: 'watching' }], 'end_turn', 3));
  assert.equal(summary(s).woken, false, 'your turn, ended');
  assert.equal(fold(s, note('mon1abc', 10)), true, 'the notice between turns is news');
  fold(s, call('tb', 'Bash', { command: 'gh pr checks' }, 11));
  let sum = summary(s);
  assert.equal(sum.status, 'working'); assert.equal(sum.woken, true, 'the turn it woke is the monitor\'s'); assert.equal(sum.tasks.length, 1);
  fold(s, note('mon1abc', 12));   // another event mid-turn: still the same woken turn
  assert.equal(summary(s).woken, true);
  fold(s, said([{ type: 'text', text: 'still waiting' }], 'end_turn', 13));
  assert.equal(summary(s).woken, false, 'ended: idle, and Watching by its task');
  fold(s, note('mon1abc', 20)); fold(s, call('tc', 'Bash', { command: 'ls' }, 21));
  assert.equal(summary(s).woken, true);
  fold(s, user('and the lint?', 22));
  assert.equal(summary(s).woken, false, 'your word mid-turn makes it yours');
  fold(s, said([{ type: 'text', text: 'clean' }], 'end_turn', 23));
  // a notice mid-turn of yours does not make your turn the monitor's
  fold(s, user('deploy it', 30)); fold(s, note('mon1abc', 31)); fold(s, call('td', 'Bash', { command: 'make deploy' }, 32));
  assert.equal(summary(s).woken, false, 'a notice inside your turn is no wake');
  fold(s, said([{ type: 'text', text: 'deployed' }], 'end_turn', 33));
  // the last task ending: the woken turn is plain work (the page: Clauding)
  fold(s, note('mon1abc', 40, 'completed')); fold(s, call('te', 'Bash', { command: 'ls' }, 41));
  sum = summary(s);
  assert.deepEqual([sum.woken, sum.tasks.length], [true, 0], 'still woken by it, but nothing runs: the page ranks it by work');
});

test('ScheduleWakeup: a wake-up at its time, until it fires, is stopped or its grace runs out', () => {
  const s = live('w2'), when = Date.now() + 20 * 60_000;
  fold(s, user('/loop check the deploy', 0));
  fold(s, call('sw', 'ScheduleWakeup', { delaySeconds: 1200, prompt: 'check the deploy', reason: 'the canary needs twenty minutes', noop: false }, 1));
  fold(s, result('sw', 'Scheduled.', 2, { scheduledFor: when, clampedDelaySeconds: 1200, wasClamped: false }));
  fold(s, said([{ type: 'text', text: 'back in twenty' }], 'end_turn', 3));
  assert.deepEqual(summary(s).wake, { at: new Date(when).toISOString(), kind: 'loop', recurring: false, what: 'the canary needs twenty minutes' });
  // set again: one wake-up a chat, the newer
  fold(s, call('sx', 'ScheduleWakeup', { delaySeconds: 600, prompt: 'p', reason: 'sooner' }, 4));
  fold(s, result('sx', 'Scheduled.', 5, { scheduledFor: when - 600_000, clampedDelaySeconds: 600, wasClamped: false }));
  assert.equal(summary(s).wake.what, 'sooner');
  // stopped
  fold(s, call('sy', 'ScheduleWakeup', { stop: true }, 6));
  fold(s, result('sy', 'Stopped.', 7, { scheduledFor: 0, clampedDelaySeconds: 0, wasClamped: false, stopped: true, cancelledWakeups: 1 }));
  assert.equal(summary(s).wake, null, 'stopped');
  // a result with no toolUseResult: the call's own delay, from its time
  fold(s, call('sz', 'ScheduleWakeup', { delaySeconds: 1800, prompt: 'p', reason: 'later' }, 8));
  fold(s, result('sz', 'Scheduled.', 9));
  assert.equal(Date.parse(summary(s).wake.at), Date.parse(at(8)) + 1800_000);
  // its claude gone: no wake
  s.alive = false; assert.equal(summary(s).wake, null); s.alive = true;
  // fired: the scheduled turn's meta line spends it
  const s2 = live('w2b'), soon = Date.now() - 30_000;
  fold(s2, call('sw', 'ScheduleWakeup', { delaySeconds: 60, prompt: 'p', reason: 'r' }, 0));
  fold(s2, result('sw', 'Scheduled.', 1, { scheduledFor: soon }));
  assert.ok(summary(s2).wake, 'due, within its grace');
  assert.equal(fold(s2, { type: 'user', isMeta: true, promptSource: 'system', turnOrigin: 'scheduled', message: { role: 'user', content: 'p' }, timestamp: new Date(soon + 500).toISOString() }), true, 'the fire is news');
  assert.equal(summary(s2).wake, null, 'spent');
  // past its grace, the poll lets it go
  const s3 = live('w2c');
  fold(s3, call('sw', 'ScheduleWakeup', { delaySeconds: 60, prompt: 'p', reason: 'r' }, 0));
  fold(s3, result('sw', 'Scheduled.', 1, { scheduledFor: Date.now() - 60_000 }));
  assert.equal(pruneWakes(s3, Date.now() + 10 * 60_000), true); assert.equal(s3.wakes.size, 0);
});

test('CronCreate: a job\'s next run, moved on as it fires, gone with CronDelete', () => {
  const s = live('w3'), next = Date.now() + 4 * 60_000;
  fold(s, call('cc', 'CronCreate', { cron: '*/5 * * * *', prompt: '/babysit-prs', recurring: true }, 0));
  fold(s, result('cc', 'Scheduled recurring job 7f3a2b (every 5 minutes). Session-only (not written to disk, dies when Claude exits) Next run: soon.', 1, { id: '7f3a2b', humanSchedule: 'every 5 minutes', recurring: true, nextFireAt: next }));
  assert.deepEqual(summary(s).wake, { at: new Date(next).toISOString(), kind: 'cron', recurring: true, what: '/babysit-prs' });
  fold(s, { type: 'user', turnOrigin: 'scheduled', promptSource: 'system', message: { role: 'user', content: [{ type: 'text', text: '/babysit-prs' }] }, timestamp: new Date(next).toISOString() });
  assert.equal(Date.parse(summary(s).wake.at), cronNext('*/5 * * * *', next), 'fired: the next match');
  fold(s, call('cd', 'CronDelete', { id: '7f3a2b' }, 2)); fold(s, result('cd', 'Cancelled job 7f3a2b.', 3));
  assert.equal(summary(s).wake, null);
  // the id from the words, the time from the expression, when the result has neither as fields
  fold(s, call('ce', 'CronCreate', { cron: '30 14 * * *', prompt: 'look at the canary', recurring: false }, 4));
  fold(s, result('ce', 'Scheduled one-shot task 9c1d (at 14:30). It will fire once then auto-delete.', 5));
  assert.equal(Date.parse(summary(s).wake.at), cronNext('30 14 * * *', Date.parse(at(5))));
  assert.equal(summary(s).wake.recurring, false);
});

test('cronNext reads the five fields in local time', () => {
  const base = new Date(2026, 9, 31, 10, 7, 30).getTime();   // Saturday 31-10-2026 10:07:30
  const t = ms => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  assert.equal(t(cronNext('*/5 * * * *', base)), '31/10 10:10');
  assert.equal(t(cronNext('30 14 * * *', base)), '31/10 14:30');
  assert.equal(t(cronNext('0 9 * * 1-5', base)), '2/11 9:00', 'the weekdays: Monday next');
  assert.equal(t(cronNext('15 8 1 * *', base)), '1/11 8:15');
  assert.equal(t(cronNext('0 0 * * 7', base)), '1/11 0:00', '7 is Sunday');
  assert.equal(t(cronNext('0 12 15 * 1', base)), '2/11 12:00', 'a day of the month or of the week, either');
  assert.ok(Number.isNaN(cronNext('every five minutes', base)));
  assert.ok(Number.isNaN(cronNext('61 * * * *', base)));
});
