// The Watching lane's server half (2026-10-31, round XIII): a turn its own task's notice woke (`woken`) — pure functions
// of server.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-watch-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { fold, newSession, summary } = await import('../server.mjs');

// judged against the real clock, as tasks are: the lines date from a few minutes ago
const t0 = Date.now() - 5 * 60_000, at = i => new Date(t0 + i * 1000).toISOString();
const live = id => { const s = newSession(id, `/x/${id}.jsonl`); s.alive = true; s.live = { pid: 1, startedAt: t0 - 3600_000 }; return s; };
const user = (text, i, extra = {}) => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, timestamp: at(i), cwd: '/tmp/repo', ...extra });
const said = (blocks, stop, i, extra = {}) => ({ type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5', id: 'm' + i, content: blocks, stop_reason: stop }, timestamp: at(i), cwd: '/tmp/repo', ...extra });
const call = (id, name, input, i) => said([{ type: 'tool_use', id, name, input }], 'tool_use', i);
const result = (id, content, i) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] }, timestamp: at(i), cwd: '/tmp/repo' });
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
