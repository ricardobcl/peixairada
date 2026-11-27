// The Watching lane's server half (2026-10-31, round XIII): a turn its own task's notice woke (`woken`), the wake-ups a
// chat sets itself (`wake`, from ScheduleWakeup and CronCreate as Claude Code writes them), and a turn that stopped short
// (`stopped`: an API error after its retries, the token limit, a refusal) — pure functions of server.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-watch-');

process.env.STATE_FILE = join(tmp, 'state.json');
process.env.CLAUDE_DIR = join(tmp, 'claude');
process.env.USAGE = 'off';
process.env.NOTIFY = 'off';
const { fold, newSession, summary, cronNext, pruneWakes } = await import('../server.mjs');

// judged against the real clock, as tasks are: the lines date from a few minutes ago
const t0 = Date.now() - 5 * 60_000;
const at = seconds => new Date(t0 + seconds * 1000).toISOString();

const live = id => {
  const session = newSession(id, `/x/${id}.jsonl`);

  session.alive = true;
  session.live = { pid: 1, startedAt: t0 - 3600_000 };
  return session;
};

const user = (text, seconds, extra = {}) => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'text', text }] },
  timestamp: at(seconds),
  cwd: '/tmp/repo',
  ...extra,
});

const said = (blocks, stop, seconds, extra = {}) => ({
  type: 'assistant',
  message: { role: 'assistant', model: 'claude-opus-5', id: `m${seconds}`, content: blocks, stop_reason: stop },
  timestamp: at(seconds),
  cwd: '/tmp/repo',
  ...extra,
});

const call = (id, name, input, seconds) => said([{ type: 'tool_use', id, name, input }], 'tool_use', seconds);

const result = (id, content, seconds, toolUseResult) => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] },
  timestamp: at(seconds),
  cwd: '/tmp/repo',
  ...(toolUseResult && { toolUseResult }),
});

const note = (task, seconds, status) =>
  user(
    `<task-notification>\n<task-id>${task}</task-id>\n${status ? `<status>${status}</status>\n` : ''}<summary>Monitor event</summary>\n<event>Build: pass</event>\n</task-notification>`,
    seconds,
    { origin: { kind: 'task-notification' }, promptSource: 'system' },
  );

test("a turn the chat's own monitor woke is woken; your word, its end and the reply are not", () => {
  const session = live('w1');

  fold(session, user('watch the CI', 0));
  fold(session, call('tm', 'Monitor', { description: 'CI on #382', timeout_ms: 1800_000 }, 1));
  fold(session, result('tm', 'Monitor started (task mon1abc, expires in 30m).', 2));
  fold(session, said([{ type: 'text', text: 'watching' }], 'end_turn', 3));
  assert.equal(summary(session).woken, false, 'your turn, ended');
  assert.equal(fold(session, note('mon1abc', 10)), true, 'the notice between turns is news');
  fold(session, call('tb', 'Bash', { command: 'gh pr checks' }, 11));
  let sum = summary(session);

  assert.equal(sum.status, 'working');
  assert.equal(sum.woken, true, "the turn it woke is the monitor's");
  assert.equal(sum.tasks.length, 1);
  fold(session, note('mon1abc', 12)); // another event mid-turn: still the same woken turn
  assert.equal(summary(session).woken, true);
  fold(session, said([{ type: 'text', text: 'still waiting' }], 'end_turn', 13));
  assert.equal(summary(session).woken, false, 'ended: idle, and Watching by its task');
  fold(session, note('mon1abc', 20));
  fold(session, call('tc', 'Bash', { command: 'ls' }, 21));
  assert.equal(summary(session).woken, true);
  fold(session, user('and the lint?', 22));
  assert.equal(summary(session).woken, false, 'your word mid-turn makes it yours');
  fold(session, said([{ type: 'text', text: 'clean' }], 'end_turn', 23));
  // a notice mid-turn of yours does not make your turn the monitor's
  fold(session, user('deploy it', 30));
  fold(session, note('mon1abc', 31));
  fold(session, call('td', 'Bash', { command: 'make deploy' }, 32));
  assert.equal(summary(session).woken, false, 'a notice inside your turn is no wake');
  fold(session, said([{ type: 'text', text: 'deployed' }], 'end_turn', 33));
  // the last task ending: the woken turn is plain work (the page: Clauding)
  fold(session, note('mon1abc', 40, 'completed'));
  fold(session, call('te', 'Bash', { command: 'ls' }, 41));
  sum = summary(session);

  assert.deepEqual(
    [sum.woken, sum.tasks.length],
    [true, 0],
    'still woken by it, but nothing runs: the page ranks it by work',
  );
});

test('ScheduleWakeup: a wake-up at its time, until it fires, is stopped or its grace runs out', () => {
  const session = live('w2');
  const when = Date.now() + 20 * 60_000;

  fold(session, user('/loop check the deploy', 0));

  fold(
    session,
    call(
      'sw',
      'ScheduleWakeup',
      { delaySeconds: 1200, prompt: 'check the deploy', reason: 'the canary needs twenty minutes', noop: false },
      1,
    ),
  );

  fold(session, result('sw', 'Scheduled.', 2, { scheduledFor: when, clampedDelaySeconds: 1200, wasClamped: false }));
  fold(session, said([{ type: 'text', text: 'back in twenty' }], 'end_turn', 3));

  assert.deepEqual(summary(session).wake, {
    at: new Date(when).toISOString(),
    kind: 'loop',
    recurring: false,
    what: 'the canary needs twenty minutes',
  });

  // set again: one wake-up a chat, the newer
  fold(session, call('sx', 'ScheduleWakeup', { delaySeconds: 600, prompt: 'p', reason: 'sooner' }, 4));

  fold(
    session,
    result('sx', 'Scheduled.', 5, { scheduledFor: when - 600_000, clampedDelaySeconds: 600, wasClamped: false }),
  );

  assert.equal(summary(session).wake.what, 'sooner');
  // stopped
  fold(session, call('sy', 'ScheduleWakeup', { stop: true }, 6));

  fold(
    session,
    result('sy', 'Stopped.', 7, {
      scheduledFor: 0,
      clampedDelaySeconds: 0,
      wasClamped: false,
      stopped: true,
      cancelledWakeups: 1,
    }),
  );

  assert.equal(summary(session).wake, null, 'stopped');
  // a result with no toolUseResult: the call's own delay, from its time
  fold(session, call('sz', 'ScheduleWakeup', { delaySeconds: 1800, prompt: 'p', reason: 'later' }, 8));
  fold(session, result('sz', 'Scheduled.', 9));
  assert.equal(Date.parse(summary(session).wake.at), Date.parse(at(8)) + 1800_000);
  // its claude gone: no wake
  session.alive = false;
  assert.equal(summary(session).wake, null);
  session.alive = true;

  // fired: the scheduled turn's meta line spends it
  const s2 = live('w2b');
  const soon = Date.now() - 30_000;

  fold(s2, call('sw', 'ScheduleWakeup', { delaySeconds: 60, prompt: 'p', reason: 'r' }, 0));
  fold(s2, result('sw', 'Scheduled.', 1, { scheduledFor: soon }));
  assert.ok(summary(s2).wake, 'due, within its grace');

  assert.equal(
    fold(s2, {
      type: 'user',
      isMeta: true,
      promptSource: 'system',
      turnOrigin: 'scheduled',
      message: { role: 'user', content: 'p' },
      timestamp: new Date(soon + 500).toISOString(),
    }),
    true,
    'the fire is news',
  );

  assert.equal(summary(s2).wake, null, 'spent');
  // past its grace, the poll lets it go
  const s3 = live('w2c');

  fold(s3, call('sw', 'ScheduleWakeup', { delaySeconds: 60, prompt: 'p', reason: 'r' }, 0));
  fold(s3, result('sw', 'Scheduled.', 1, { scheduledFor: Date.now() - 60_000 }));
  assert.equal(pruneWakes(s3, Date.now() + 10 * 60_000), true);
  assert.equal(s3.wakes.size, 0);
});

test("CronCreate: a job's next run, moved on as it fires, gone with CronDelete", () => {
  const session = live('w3');
  const next = Date.now() + 4 * 60_000;

  fold(session, call('cc', 'CronCreate', { cron: '*/5 * * * *', prompt: '/babysit-prs', recurring: true }, 0));

  fold(
    session,
    result(
      'cc',
      'Scheduled recurring job 7f3a2b (every 5 minutes). Session-only (not written to disk, dies when Claude exits) Next run: soon.',
      1,
      { id: '7f3a2b', humanSchedule: 'every 5 minutes', recurring: true, nextFireAt: next },
    ),
  );

  assert.deepEqual(summary(session).wake, {
    at: new Date(next).toISOString(),
    kind: 'cron',
    recurring: true,
    what: '/babysit-prs',
  });

  fold(session, {
    type: 'user',
    turnOrigin: 'scheduled',
    promptSource: 'system',
    message: { role: 'user', content: [{ type: 'text', text: '/babysit-prs' }] },
    timestamp: new Date(next).toISOString(),
  });

  assert.equal(Date.parse(summary(session).wake.at), cronNext('*/5 * * * *', next), 'fired: the next match');
  fold(session, call('cd', 'CronDelete', { id: '7f3a2b' }, 2));
  fold(session, result('cd', 'Cancelled job 7f3a2b.', 3));
  assert.equal(summary(session).wake, null);
  // the id from the words, the time from the expression, when the result has neither as fields
  fold(session, call('ce', 'CronCreate', { cron: '30 14 * * *', prompt: 'look at the canary', recurring: false }, 4));
  fold(session, result('ce', 'Scheduled one-shot task 9c1d (at 14:30). It will fire once then auto-delete.', 5));
  assert.equal(Date.parse(summary(session).wake.at), cronNext('30 14 * * *', Date.parse(at(5))));
  assert.equal(summary(session).wake.recurring, false);
});

test('cronNext reads the five fields in local time', () => {
  const base = new Date(2026, 9, 31, 10, 7, 30).getTime(); // Saturday 31-10-2026 10:07:30

  const dayTime = ms => {
    const date = new Date(ms);

    return `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  assert.equal(dayTime(cronNext('*/5 * * * *', base)), '31/10 10:10');
  assert.equal(dayTime(cronNext('30 14 * * *', base)), '31/10 14:30');
  assert.equal(dayTime(cronNext('0 9 * * 1-5', base)), '2/11 9:00', 'the weekdays: Monday next');
  assert.equal(dayTime(cronNext('15 8 1 * *', base)), '1/11 8:15');
  assert.equal(dayTime(cronNext('0 0 * * 7', base)), '1/11 0:00', '7 is Sunday');
  assert.equal(dayTime(cronNext('0 12 15 * 1', base)), '2/11 12:00', 'a day of the month or of the week, either');
  assert.ok(Number.isNaN(cronNext('every five minutes', base)));
  assert.ok(Number.isNaN(cronNext('61 * * * *', base)));
});

test('a turn that stopped short says why; your next word clears it', () => {
  const session = live('w4');

  fold(session, user('migrate the ledger', 0));

  fold(
    session,
    said(
      [{ type: 'text', text: 'API Error: Connection lost mid-response. The response may be incomplete.' }],
      'stop_sequence',
      1,
      {
        isApiErrorMessage: true,
        error: 'server_error',
        message: {
          role: 'assistant',
          model: '<synthetic>',
          id: 'mx',
          content: [{ type: 'text', text: 'API Error: Connection lost mid-response. The response may be incomplete.' }],
          stop_reason: 'stop_sequence',
        },
      },
    ),
  );

  const sum = summary(session);

  assert.equal(sum.status, 'idle');

  assert.deepEqual(
    { ...sum.stopped, at: null },
    { why: 'api', text: 'Connection lost mid-response.', kind: 'server_error', at: null },
  );

  assert.equal(session.model, null, 'a synthetic line is no model');
  fold(session, user('go on', 2));
  assert.equal(summary(session).stopped, null, 'your word: working, and the stop behind it');

  fold(
    session,
    said(
      [
        {
          type: 'text',
          text: 'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
        },
      ],
      'stop_sequence',
      3,
      { isApiErrorMessage: true },
    ),
  );

  assert.equal(summary(session).stopped.text, '529 · Overloaded');
  fold(session, user('again', 4));
  fold(session, said([{ type: 'text', text: 'half a rep' }], 'max_tokens', 5));
  assert.equal(summary(session).stopped.why, 'max_tokens');
  fold(session, user('and?', 6));
  fold(session, said([{ type: 'text', text: "I can't help with that." }], 'refusal', 7));
  assert.equal(summary(session).stopped.why, 'refusal');
  fold(session, user('fine', 8));
  fold(session, said([{ type: 'text', text: 'Done.' }], 'end_turn', 9));
  assert.equal(summary(session).stopped, null, 'an answer');
  fold(session, user('more', 10));
  fold(session, said([{ type: 'text', text: 'API Error: x' }], 'stop_sequence', 11, { isApiErrorMessage: true }));
  fold(session, user('[Request interrupted by user]', 12));
  assert.equal(summary(session).stopped, null, 'an interrupt is yours, not an error');
  // a max_tokens that cut a tool call is no stop: Claude Code goes on with it
  fold(session, user('more', 13));
  fold(session, said([{ type: 'tool_use', id: 'tz', name: 'Bash', input: {} }], 'max_tokens', 14));
  assert.equal(summary(session).stopped, null);
});
