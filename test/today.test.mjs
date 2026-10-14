// The day (2026-10-10): the home's timeline of every chat — its turns, the questions it waited on you for, its
// monitors — from the transcript as it is folded. A chat that asked mid-turn worked the turn less the wait; a chat
// clauding now, or asking now, has a span to now; the totals' median and longest wait are the questions'. And what the
// page asks of a throwaway server: the day (GET /api/today), and the overview's tails (GET /api/tails).
import './env.mjs';   // first: server.mjs reads where its state lives as it is imported
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { dayOf, fold, newSession } from '../server.mjs';
import { startTestServer, tmpDir } from '../lib/testserver.mjs';
import { makeFixture, toolLines } from '../scripts/fixture.mjs';

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

test('GET /api/today: the chats with a span since the page\'s midnight, their spans and the totals (2026-10-14)', { timeout: 60_000 }, async () => {
  const now = Date.now(), fx = makeFixture(tmpDir('peix-fx-'), [
    { cwd: '/Users/test/widgets', title: 'Today\'s chat', prompt: 'do it', reply: 'done', at: new Date(now - 10 * 60_000) },
    { cwd: '/Users/test/widgets', title: 'An old chat', prompt: 'then', reply: 'then done', at: new Date(now - 3 * 86_400_000) },
  ]);
  const [today, old] = fx.chats, srv = await startTestServer({ claudeDir: fx.dir });
  try {
    const since = now - 3600_000, r = await srv.api(`api/today?since=${since}`);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ['chats', 'now', 'since', 'totals']);
    assert.equal(r.body.since, since);
    assert.deepEqual(r.body.chats.map(c => c.id), [today.id], 'a chat with nothing since is not there');
    const c = r.body.chats[0];
    assert.deepEqual(Object.keys(c).sort(), ['cwd', 'id', 'last', 'project', 'questions', 'spans', 'status', 'title', 'waited', 'worked']);
    assert.deepEqual(c.spans, [{ k: 'w', from: new Date(now - 11 * 60_000).toISOString(), to: new Date(now - 10 * 60_000).toISOString() }], 'its turn, prompt to reply');
    assert.deepEqual([c.title, c.cwd, c.worked, c.waited, c.questions, c.last], ['Today\'s chat', '/Users/test/widgets', 60_000, 0, 0, now - 10 * 60_000]);
    assert.deepEqual(r.body.totals, { worked: 60_000, waited: 0, questions: 0, median: null, longest: null });
    assert.deepEqual((await srv.api(`api/today?since=${now - 4 * 86_400_000}`)).body.chats.map(c => c.id), [today.id, old.id], 'further back, the old one too, newest first');
    assert.equal((await srv.api('api/today?since=soon')).body.since, new Date().setHours(0, 0, 0, 0), 'no number: this midnight');
  } finally { await srv.stop(); }
});

test('GET /api/tails: the last things each chat asked about did, sixteen at most, and nothing for one the board has not (2026-10-14)', { timeout: 60_000 }, async () => {
  const cwd = '/Users/test/widgets', calls = id => Array.from({ length: 10 }, (_, i) => toolLines({ id, cwd, name: 'Bash', input: { command: `echo ${i}` }, result: `${i}` })).flat();
  const fx = makeFixture(tmpDir('peix-fx-'), [{ cwd, prompt: 'look', reply: 'looked' }, { cwd, prompt: 'run them', reply: 'ran them', lines: calls }]);
  const [plain, busy] = fx.chats, srv = await startTestServer({ claudeDir: fx.dir });
  try {
    const r = await srv.api(`api/tails?ids=${plain.id},${busy.id},nobody`);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body.tails), [plain.id, busy.id, 'nobody']);
    assert.deepEqual(r.body.tails[plain.id].map(x => [x.role, x.kind, x.text]), [['user', 'text', 'look'], ['assistant', 'text', 'looked']]);
    assert.ok(r.body.tails[plain.id].every(x => typeof x.ts === 'string'));
    const tail = r.body.tails[busy.id];
    assert.equal(tail.length, 16, 'the newest sixteen of twenty-two');
    assert.deepEqual(tail.slice(-2).map(x => [x.role, x.kind, x.name ?? null, x.text]), [['assistant', 'tool_use', 'Bash', tail.at(-2).text], ['user', 'tool_result', null, '9']]);
    assert.equal(tail.at(-1).toolUseId, tail.at(-2).toolUseId, 'a result names its call');
    assert.match(tail.at(-2).text, /echo 9/);
    assert.deepEqual(r.body.tails.nobody, []);
    assert.deepEqual((await srv.api('api/tails')).body, { tails: {} });
    const many = Array.from({ length: 45 }, (_, i) => `id-${i}`).join(',');
    assert.equal(Object.keys((await srv.api(`api/tails?ids=${many}`)).body.tails).length, 40, 'forty at most');
  } finally { await srv.stop(); }
});
