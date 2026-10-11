// What a turn is doing now (2026-10-11): the newest tool call since your last word, which the card's live line names
// and flips to the next — none before the turn calls one, none once you have spoken again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { doingOf, fold, newSession } from '../server.mjs';

const T0 = Date.parse('2026-10-11T09:00:00Z'), at = s => new Date(T0 + s * 1000).toISOString();
const user = (t, text) => ({ type: 'user', timestamp: at(t), message: { role: 'user', content: text } });
const tool = (t, id, name, input) => ({ type: 'assistant', timestamp: at(t), message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' } });
const result = (t, id) => ({ type: 'user', timestamp: at(t), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
const say = (t, text) => ({ type: 'assistant', timestamp: at(t), message: { role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'tool_use' } });

test('the newest tool call of the turn, and none across your word', () => {
  const s = newSession(randomUUID(), null);
  fold(s, user(0, 'make the tests pass'));
  assert.equal(doingOf(s), null, 'nothing called yet');
  fold(s, tool(1, 'r1', 'Read', { file_path: '/repo/src/retry.ts' }));
  assert.equal(doingOf(s).name, 'Read');
  assert.match(doingOf(s).text, /retry\.ts/);
  fold(s, result(2, 'r1')); fold(s, say(3, 'Running them now.'));
  fold(s, tool(4, 'b1', 'Bash', { command: 'npm test', description: 'run the tests' }));
  assert.deepEqual([doingOf(s).name, doingOf(s).ts], ['Bash', at(4)], 'the newest, past a result and Claude\'s words');
  fold(s, result(5, 'b1')); fold(s, user(6, 'and the linter'));
  assert.equal(doingOf(s), null, 'your word starts a turn that has called nothing');
});
