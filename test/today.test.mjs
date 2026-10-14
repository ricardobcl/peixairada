// The day (2026-10-10): the home's timeline of every chat — its turns, the questions it waited on you for, its
// monitors — from the transcript as it is folded. A chat that asked mid-turn worked the turn less the wait; a chat
// clauding now, or asking now, has a span to now; the totals' median and longest wait are the questions'.
import './env.mjs';   // first: server.mjs reads where its state lives as it is imported
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { dayOf, fold, newSession } from '../server.mjs';

const T0 = Date.parse('2026-10-10T09:00:00Z'), at = min => new Date(T0 + min * 60_000).toISOString();
const user = (min, text) => ({ type: 'user', timestamp: at(min), message: { role: 'user', content: text } });
const result = (min, id) => ({ type: 'user', timestamp: at(min), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
const tool = (min, id, name, input = {}) => ({ type: 'assistant', timestamp: at(min), message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' } });
const reply = (min, text = 'done') => ({ type: 'assistant', timestamp: at(min), message: { role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn' } });

test('a turn, a question inside it, a monitor; the totals', () => {
  const a = newSession(randomUUID(), null);
  for (const l of [user(0, 'do it'), tool(5, 'q1', 'AskUserQuestion', { questions: [{ question: 'Which?', options: [{ label: 'x' }] }] }), result(20, 'q1'), tool(21, 'b1', 'Bash', {}), result(25, 'b1'), reply(30)]) fold(a, l);
  assert.deepEqual(a.day, [{ k: 'a', from: at(5), to: at(20) }, { k: 'w', from: at(0), to: at(30) }]);
  const b = newSession(randomUUID(), null);
  for (const l of [user(40, 'watch it'), tool(41, 'm1', 'Monitor', { description: 'the build', timeout_ms: 3600_000 }), { ...result(42, 'm1'), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'm1', content: 'Monitor started (task mon1abc, expires in 60m).' }] } }, reply(43),
    user(70, '<task-notification>\n<task-id>mon1abc</task-id>\n<status>completed</status>\n<summary>done</summary>\n</task-notification>')]) fold(b, l);
  assert.deepEqual(b.day.map(x => x.k), ['w', 'm']);
  assert.deepEqual(b.day[1], { k: 'm', from: at(42), to: at(70) });

  const d = dayOf([a, b], T0 - 3600_000, T0 + 120 * 60_000);
  const ca = d.chats.find(c => c.id === a.id), cb = d.chats.find(c => c.id === b.id);
  assert.equal(ca.worked, 15 * 60_000, 'thirty minutes of turn, less the fifteen it waited on you');
  assert.equal(ca.waited, 15 * 60_000); assert.equal(ca.questions, 1);
  assert.equal(cb.worked, 3 * 60_000);
  assert.deepEqual(d.chats.map(c => c.id), [b.id, a.id], 'the most recent first');
  assert.equal(d.totals.questions, 1); assert.equal(d.totals.median, 15 * 60_000); assert.equal(d.totals.longest.id, a.id);
});

test('what is going on now runs to now; what ended before the day is not there', () => {
  const s = newSession(randomUUID(), null);
  for (const l of [user(-200, 'yesterday'), reply(-190), user(10, 'now')]) fold(s, l);
  s.alive = true; s.live = { status: 'busy' };
  const d = dayOf([s], T0, T0 + 30 * 60_000);
  assert.deepEqual(d.chats[0].spans, [{ k: 'w', from: at(10), to: null }], 'the turn before the day is left out, the one now runs on');
  assert.equal(d.chats[0].worked, 20 * 60_000);
});

test('a turn nothing closed lends its start to no other: a /compact you typed, a claude killed mid-turn (2026-10-14)', () => {
  const c = newSession(randomUUID(), null); c.loaded = true;
  for (const l of [user(0, '/compact'), { type: 'system', subtype: 'compact_boundary', timestamp: at(2) }, user(180, 'next thing'), reply(181)]) fold(c, l);
  assert.deepEqual(c.day, [{ k: 'w', from: at(0), to: at(2) }, { k: 'w', from: at(180), to: at(181) }], 'the compaction, then the turn — not three hours of work');
  assert.equal(c.entries.at(-1).worked, 60_000, 'worked for a minute, not 181');
  const auto = newSession(randomUUID(), null);   // a compaction Claude Code ran on its own, mid-turn: the turn goes on
  for (const l of [user(0, 'big job'), tool(1, 'b1', 'Bash', {}), { type: 'system', subtype: 'compact_boundary', timestamp: at(2) }, result(3, 'b1'), reply(4)]) fold(auto, l);
  assert.deepEqual(auto.day, [{ k: 'w', from: at(0), to: at(4) }]);

  const k = newSession(randomUUID(), null); k.loaded = true;
  for (const l of [user(0, 'go'), tool(1, 'b1', 'Bash', {}), user(2, 'and this too')]) fold(k, l);   // typed mid-turn: part of it
  assert.equal(k.turnStart, at(0));
  k.live = { pid: 2, startedAt: T0 + 60 * 60_000 };   // killed at minute 2; the chat resumed in a claude started at 60
  fold(k, user(61, 'where were we')); fold(k, reply(62));
  assert.deepEqual(k.day, [{ k: 'w', from: at(0), to: at(2) }, { k: 'w', from: at(61), to: at(62) }], 'the killed turn as far as it went, then the new one');
  assert.equal(k.entries.at(-1).worked, 60_000);
});
