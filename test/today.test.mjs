// The day (2026-10-10): the home's timeline of every chat — its turns, the questions it waited on you for, its
// monitors — from the transcript as it is folded. A chat that asked mid-turn worked the turn less the wait; a chat
// clauding now, or asking now, has a span to now; the totals' median and longest wait are the questions'. And what the
// page asks of a throwaway server: the day (GET /api/today), and the overview's tails (GET /api/tails).
import './env.mjs'; // first: server.mjs reads where its state lives as it is imported
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { dayOf, fold, newSession } from '../server.mjs';
import { startTestServer, tmpDir } from '../lib/testserver.mjs';
import { makeFixture, toolLines } from '../scripts/fixture.mjs';

const T0 = Date.parse('2026-10-10T09:00:00Z');
const at = min => new Date(T0 + min * 60_000).toISOString();

const user = (min, text) => ({ type: 'user', timestamp: at(min), message: { role: 'user', content: text } });

const result = (min, id) => ({
  type: 'user',
  timestamp: at(min),
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
});

const tool = (min, id, name, input = {}) => ({
  type: 'assistant',
  timestamp: at(min),
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' },
});

const reply = (min, text = 'done') => ({
  type: 'assistant',
  timestamp: at(min),
  message: { role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn' },
});

test('a turn, a question inside it, a monitor; the totals', () => {
  const asking = newSession(randomUUID(), null);

  for (const line of [
    user(0, 'do it'),
    tool(5, 'q1', 'AskUserQuestion', { questions: [{ question: 'Which?', options: [{ label: 'x' }] }] }),
    result(20, 'q1'),
    tool(21, 'b1', 'Bash', {}),
    result(25, 'b1'),
    reply(30),
  ]) {
    fold(asking, line);
  }

  assert.deepEqual(asking.day, [
    { k: 'a', from: at(5), to: at(20) },
    { k: 'w', from: at(0), to: at(30) },
  ]);

  const watching = newSession(randomUUID(), null);

  for (const line of [
    user(40, 'watch it'),
    tool(41, 'm1', 'Monitor', { description: 'the build', timeout_ms: 3600_000 }),
    {
      ...result(42, 'm1'),
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'm1', content: 'Monitor started (task mon1abc, expires in 60m).' },
        ],
      },
    },
    reply(43),
    user(
      70,
      '<task-notification>\n<task-id>mon1abc</task-id>\n<status>completed</status>\n<summary>done</summary>\n</task-notification>',
    ),
  ]) {
    fold(watching, line);
  }

  assert.deepEqual(
    watching.day.map(span => span.k),
    ['w', 'm'],
  );

  assert.deepEqual(watching.day[1], { k: 'm', from: at(42), to: at(70) });

  const day = dayOf([asking, watching], T0 - 3600_000, T0 + 120 * 60_000);

  const ca = day.chats.find(chat => chat.id === asking.id);
  const cb = day.chats.find(chat => chat.id === watching.id);

  assert.equal(ca.worked, 15 * 60_000, 'thirty minutes of turn, less the fifteen it waited on you');
  assert.equal(ca.waited, 15 * 60_000);
  assert.equal(ca.questions, 1);
  assert.equal(cb.worked, 3 * 60_000);

  assert.deepEqual(
    day.chats.map(chat => chat.id),
    [watching.id, asking.id],
    'the most recent first',
  );

  assert.equal(day.totals.questions, 1);
  assert.equal(day.totals.median, 15 * 60_000);
  assert.equal(day.totals.longest.id, asking.id);
});

test('what is going on now runs to now; what ended before the day is not there', () => {
  const session = newSession(randomUUID(), null);

  for (const line of [user(-200, 'yesterday'), reply(-190), user(10, 'now')]) fold(session, line);
  session.alive = true;
  session.live = { status: 'busy' };
  const day = dayOf([session], T0, T0 + 30 * 60_000);

  assert.deepEqual(
    day.chats[0].spans,
    [{ k: 'w', from: at(10), to: null }],
    'the turn before the day is left out, the one now runs on',
  );

  assert.equal(day.chats[0].worked, 20 * 60_000);
});

test('a turn nothing closed lends its start to no other: a /compact you typed, a claude killed mid-turn (2026-10-14)', () => {
  const compacted = newSession(randomUUID(), null);

  compacted.loaded = true;

  for (const line of [
    user(0, '/compact'),
    { type: 'system', subtype: 'compact_boundary', timestamp: at(2) },
    user(180, 'next thing'),
    reply(181),
  ]) {
    fold(compacted, line);
  }

  assert.deepEqual(
    compacted.day,
    [
      { k: 'w', from: at(0), to: at(2) },
      { k: 'w', from: at(180), to: at(181) },
    ],
    'the compaction, then the turn — not three hours of work',
  );

  assert.equal(compacted.entries.at(-1).worked, 60_000, 'worked for a minute, not 181');
  const auto = newSession(randomUUID(), null); // a compaction Claude Code ran on its own, mid-turn: the turn goes on

  for (const line of [
    user(0, 'big job'),
    tool(1, 'b1', 'Bash', {}),
    { type: 'system', subtype: 'compact_boundary', timestamp: at(2) },
    result(3, 'b1'),
    reply(4),
  ]) {
    fold(auto, line);
  }

  assert.deepEqual(auto.day, [{ k: 'w', from: at(0), to: at(4) }]);

  const killed = newSession(randomUUID(), null);

  killed.loaded = true;
  for (const line of [user(0, 'go'), tool(1, 'b1', 'Bash', {}), user(2, 'and this too')]) fold(killed, line); // typed mid-turn: part of it
  assert.equal(killed.turnStart, at(0));
  killed.live = { pid: 2, startedAt: T0 + 60 * 60_000 }; // killed at minute 2; the chat resumed in a claude started at 60
  fold(killed, user(61, 'where were we'));
  fold(killed, reply(62));

  assert.deepEqual(
    killed.day,
    [
      { k: 'w', from: at(0), to: at(2) },
      { k: 'w', from: at(61), to: at(62) },
    ],
    'the killed turn as far as it went, then the new one',
  );

  assert.equal(killed.entries.at(-1).worked, 60_000);
});

test(
  "GET /api/today: the chats with a span since the page's midnight, their spans and the totals (2026-10-14)",
  { timeout: 60_000 },
  async () => {
    const now = Date.now();

    const fx = makeFixture(tmpDir('peix-fx-'), [
      {
        cwd: '/Users/test/widgets',
        title: "Today's chat",
        prompt: 'do it',
        reply: 'done',
        at: new Date(now - 10 * 60_000),
      },
      {
        cwd: '/Users/test/widgets',
        title: 'An old chat',
        prompt: 'then',
        reply: 'then done',
        at: new Date(now - 3 * 86_400_000),
      },
    ]);

    const [today, old] = fx.chats;
    const srv = await startTestServer({ claudeDir: fx.dir });

    try {
      const since = now - 3600_000;
      const response = await srv.api(`api/today?since=${since}`);

      assert.equal(response.status, 200);
      assert.deepEqual(Object.keys(response.body).sort(), ['chats', 'now', 'since', 'totals']);
      assert.equal(response.body.since, since);

      assert.deepEqual(
        response.body.chats.map(chat => chat.id),
        [today.id],
        'a chat with nothing since is not there',
      );

      const chatRow = response.body.chats[0];

      assert.deepEqual(Object.keys(chatRow).sort(), [
        'cwd',
        'id',
        'last',
        'project',
        'questions',
        'spans',
        'status',
        'title',
        'waited',
        'worked',
      ]);

      assert.deepEqual(
        chatRow.spans,
        [{ k: 'w', from: new Date(now - 11 * 60_000).toISOString(), to: new Date(now - 10 * 60_000).toISOString() }],
        'its turn, prompt to reply',
      );

      assert.deepEqual(
        [chatRow.title, chatRow.cwd, chatRow.worked, chatRow.waited, chatRow.questions, chatRow.last],
        ["Today's chat", '/Users/test/widgets', 60_000, 0, 0, now - 10 * 60_000],
      );

      assert.deepEqual(response.body.totals, { worked: 60_000, waited: 0, questions: 0, median: null, longest: null });

      assert.deepEqual(
        (await srv.api(`api/today?since=${now - 4 * 86_400_000}`)).body.chats.map(chat => chat.id),
        [today.id, old.id],
        'further back, the old one too, newest first',
      );

      assert.equal(
        (await srv.api('api/today?since=soon')).body.since,
        new Date().setHours(0, 0, 0, 0),
        'no number: this midnight',
      );
    } finally {
      await srv.stop();
    }
  },
);

test(
  'GET /api/tails: the last things each chat asked about did, sixteen at most, and nothing for one the board has not (2026-10-14)',
  { timeout: 60_000 },
  async () => {
    const cwd = '/Users/test/widgets';

    const calls = id =>
      Array.from({ length: 10 }, (_, index) =>
        toolLines({ id, cwd, name: 'Bash', input: { command: `echo ${index}` }, result: `${index}` }),
      ).flat();

    const fx = makeFixture(tmpDir('peix-fx-'), [
      { cwd, prompt: 'look', reply: 'looked' },
      { cwd, prompt: 'run them', reply: 'ran them', lines: calls },
    ]);

    const [plain, busy] = fx.chats;
    const srv = await startTestServer({ claudeDir: fx.dir });

    try {
      const response = await srv.api(`api/tails?ids=${plain.id},${busy.id},nobody`);

      assert.equal(response.status, 200);
      assert.deepEqual(Object.keys(response.body.tails), [plain.id, busy.id, 'nobody']);

      assert.deepEqual(
        response.body.tails[plain.id].map(entry => [entry.role, entry.kind, entry.text]),
        [
          ['user', 'text', 'look'],
          ['assistant', 'text', 'looked'],
        ],
      );

      assert.ok(response.body.tails[plain.id].every(entry => typeof entry.ts === 'string'));
      const tail = response.body.tails[busy.id];

      assert.equal(tail.length, 16, 'the newest sixteen of twenty-two');

      assert.deepEqual(
        tail.slice(-2).map(entry => [entry.role, entry.kind, entry.name ?? null, entry.text]),
        [
          ['assistant', 'tool_use', 'Bash', tail.at(-2).text],
          ['user', 'tool_result', null, '9'],
        ],
      );

      assert.equal(tail.at(-1).toolUseId, tail.at(-2).toolUseId, 'a result names its call');
      assert.match(tail.at(-2).text, /echo 9/);
      assert.deepEqual(response.body.tails.nobody, []);
      assert.deepEqual((await srv.api('api/tails')).body, { tails: {} });
      const many = Array.from({ length: 45 }, (_, index) => `id-${index}`).join(',');

      assert.equal(Object.keys((await srv.api(`api/tails?ids=${many}`)).body.tails).length, 40, 'forty at most');
    } finally {
      await srv.stop();
    }
  },
);
