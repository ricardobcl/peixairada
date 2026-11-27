// What a turn is doing now (2026-10-11): the newest tool call since your last word, which the card's live line names
// and flips to the next — none before the turn calls one, none once you have spoken again.
import './env.mjs'; // first: server.mjs reads where its state lives as it is imported
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { doingOf, fold, newSession } from '../server.mjs';

const T0 = Date.parse('2026-10-11T09:00:00Z');
const at = seconds => new Date(T0 + seconds * 1000).toISOString();

const user = (seconds, text) => ({ type: 'user', timestamp: at(seconds), message: { role: 'user', content: text } });

const tool = (seconds, id, name, input) => ({
  type: 'assistant',
  timestamp: at(seconds),
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' },
});

const result = (seconds, id) => ({
  type: 'user',
  timestamp: at(seconds),
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
});

const say = (seconds, text) => ({
  type: 'assistant',
  timestamp: at(seconds),
  message: { role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'tool_use' },
});

test('the newest tool call of the turn, and none across your word', () => {
  const session = newSession(randomUUID(), null);

  fold(session, user(0, 'make the tests pass'));
  assert.equal(doingOf(session), null, 'nothing called yet');
  fold(session, tool(1, 'r1', 'Read', { file_path: '/repo/src/retry.ts' }));
  assert.equal(doingOf(session).name, 'Read');
  assert.match(doingOf(session).text, /retry\.ts/);
  fold(session, result(2, 'r1'));
  fold(session, say(3, 'Running them now.'));
  fold(session, tool(4, 'b1', 'Bash', { command: 'npm test', description: 'run the tests' }));

  assert.deepEqual(
    [doingOf(session).name, doingOf(session).ts],
    ['Bash', at(4)],
    "the newest, past a result and Claude's words",
  );

  fold(session, result(5, 'b1'));
  fold(session, user(6, 'and the linter'));
  assert.equal(doingOf(session), null, 'your word starts a turn that has called nothing');
});
