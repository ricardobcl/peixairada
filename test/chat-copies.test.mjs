// A chat twice (2026-11-04): what ties a copy Claude Code made to the chat it came from. `/bg` says so in a `continued-in` line; a
// copy keeps the chat's uuids under a new id, and the oldest file is the chat.
import './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture } from '../scripts/fixture.mjs';

const chatOf = async (srv, id) => (await srv.api('api/sessions')).body.sessions.find(session => session.id === id);
const linksOf = async (srv, id) => ((await chatOf(srv, id))?.links || []).map(link => [link.k, link.dir, link.id]);

/** The chat's lines under a new id, uuids kept, as Claude Code writes a copy. */
function copyOf(chat, id = randomUUID()) {
  const file = join(dirname(chat.file), `${id}.jsonl`);

  writeFileSync(
    file,
    readFileSync(chat.file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const parsed = JSON.parse(line);

        if ('sessionId' in parsed) parsed.sessionId = id;
        return `${JSON.stringify(parsed)}\n`;
      })
      .join(''),
  );

  return { id, file, cwd: chat.cwd };
}

async function alertsOf(srv) {
  const res = await fetch(`${srv.url}events?key=${srv.key}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const got = [];
  const { promise: snapshot, resolve } = Promise.withResolvers();

  (async () => {
    let buf = '';

    for (;;) {
      const { value, done } = await reader.read();

      if (done) break;
      buf += dec.decode(value, { stream: true });
      let index;

      while ((index = buf.indexOf('\n\n')) >= 0) {
        const match = /^event: (\w+)\ndata: (.*)$/s.exec(buf.slice(0, index));

        buf = buf.slice(index + 2);
        if (match?.[1] === 'snapshot') resolve();
        if (match?.[1] === 'alert') got.push(JSON.parse(match[2]));
      }
    }
  })().catch(() => {});

  await snapshot;
  return { got, stop: () => reader.cancel().catch(() => {}) };
}

test(
  'a copy is tied to the chat by its first line, the oldest file the chat, with its copied past no news; another chat is not',
  { timeout: 40_000 },
  async () => {
    const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
    const [other, chat] = fx.chats;
    const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
    const alerts = await alertsOf(srv);

    try {
      await new Promise(resolve => setTimeout(resolve, 30)); // a birth of its own
      const copy = copyOf(chat);

      await waitFor(async () => (await linksOf(srv, copy.id)).length, { what: 'the copy tied' });
      assert.deepEqual(await linksOf(srv, copy.id), [['branch', 'in', chat.id]], 'the copy, branched from the chat');
      assert.deepEqual(await linksOf(srv, chat.id), [['branch', 'out', copy.id]], 'the chat, its branch');
      assert.deepEqual(await linksOf(srv, other.id), [], 'and nothing on a chat that begins otherwise');
      await new Promise(resolve => setTimeout(resolve, 900)); // the alert debounce is 400 ms
      assert.deepEqual(alerts.got, [], 'its copied past is no news');
      await srv.restart();

      assert.deepEqual(
        await linksOf(srv, copy.id),
        [['branch', 'in', chat.id]],
        'a boot reads both and ties nothing twice',
      );
    } finally {
      alerts.stop();
      await srv.stop();
    }
  },
);

test(
  '/bg: a continued-in line ties the chat to where it went on and ticks it once; a tick undone stays undone',
  { timeout: 40_000 },
  async () => {
    const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });

    const chat = fx.chats[1];
    const to = randomUUID();

    const srv = await startTestServer({ claudeDir: fx.dir, fake: true });

    try {
      writeFileSync(
        join(dirname(chat.file), `${to}.jsonl`),
        `${JSON.stringify({ type: 'ai-title', sessionId: to, aiTitle: 'Plain chat' })}\n`,
      );

      await waitFor(() => chatOf(srv, to), { what: 'the chat it went on as' });

      appendFileSync(
        chat.file,
        `${JSON.stringify({
          type: 'continued-in',
          timestamp: new Date().toISOString(),
          sessionId: chat.id,
          continuedInSessionId: to,
        })}\n`,
      );

      await waitFor(async () => (await chatOf(srv, chat.id)).done, { what: 'the chat ticked done' });
      assert.deepEqual(await linksOf(srv, chat.id), [['continued', 'out', to]]);
      assert.deepEqual(await linksOf(srv, to), [['continued', 'in', chat.id]]);
      await srv.post(`api/sessions/${chat.id}/done`, { done: false });
      assert.equal((await chatOf(srv, chat.id)).done, false);
      await srv.restart();
      assert.equal((await chatOf(srv, chat.id)).done, false, 'a boot reads the line again, and does not tick it again');
      assert.deepEqual(await linksOf(srv, chat.id), [['continued', 'out', to]]);

      // a first word in what went on: its copy begins with the chat's line, and is the same tie, not a second
      const lines = readFileSync(chat.file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
        .filter(line => line.type === 'user');

      appendFileSync(
        join(dirname(chat.file), `${to}.jsonl`),
        lines.map(line => `${JSON.stringify({ ...line, sessionId: to })}\n`).join(''),
      );

      await waitFor(async () => (await chatOf(srv, to)).lastUserAt, { what: 'its first lines read' });
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.deepEqual(await linksOf(srv, to), [['continued', 'in', chat.id]], 'one tie');
    } finally {
      await srv.stop();
    }
  },
);
