// Re-reading a chat the board already holds (opening one longer than TAIL_BYTES reads the whole file) must not alert
// for the replies in it — they were news once — while the first lines of a chat the registry announced before its
// transcript existed are news. Both through a throwaway server and its SSE stream, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { chatLines, defaultFixture, replyLines, slugOf } from '../scripts/fixture.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The `alert` events of the stream, as they come — handed back once the stream's snapshot is in, so an empty list
 *  means a quiet stream, never one that did not connect (2026-10-03). */
async function alerts(url, key) {
  const res = await fetch(`${url}events?key=${key}`);

  assert.ok(res.ok, `the event stream: ${res.status}`);
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
  'opening a chat the boot only tailed reads it whole without alerting for its old reply',
  { timeout: 30_000 },
  async () => {
    const fx = defaultFixture(tmpDir('peix-fx-'));
    const srv = await startTestServer({ claudeDir: fx.dir, env: { TAIL_BYTES: '64' } });
    const chat = fx.chats[1];

    try {
      const before = (await srv.api('api/sessions')).body.sessions.find(session => session.id === chat.id);

      assert.equal(before.loaded, false, 'the boot read only the tail');
      const alertFeed = await alerts(srv.url, srv.key);
      const response = await srv.api(`api/sessions/${chat.id}/messages`);

      assert.equal(response.status, 200);
      assert.equal(response.body.session.loaded, true);
      assert.equal(response.body.entries.length, 2, 'the whole transcript now');
      assert.equal(response.body.session.lastReply, 'It is a fixture. No PRs here.');
      await sleep(900); // the alert debounce is 400 ms
      alertFeed.stop();
      assert.deepEqual(alertFeed.got, [], 'no alert for a reply that happened a day ago');
    } finally {
      await srv.stop();
    }
  },
);

test(
  'a chat the registry announced first alerts when its transcript lands with a reply',
  { timeout: 30_000 },
  async () => {
    const fx = defaultFixture(tmpDir('peix-fx-'));

    const id = randomUUID();
    const cwd = fx.chats[1].cwd;

    writeFileSync(
      join(fx.dir, 'sessions', `${process.pid}.json`),
      JSON.stringify({
        pid: process.pid,
        sessionId: id,
        cwd,
        startedAt: Date.now(),
        version: 'fixture',
        kind: 'interactive',
        entrypoint: 'cli',
        status: 'idle',
      }),
    );

    const srv = await startTestServer({ claudeDir: fx.dir });

    try {
      const placeholder = (await srv.api('api/sessions')).body.sessions.find(chat => chat.id === id);

      assert.ok(placeholder?.alive && !placeholder.file, 'a live chat with no transcript yet');
      const alertFeed = await alerts(srv.url, srv.key);
      const lines = chatLines({ id, cwd, prompt: 'first words', reply: 'first answer', at: new Date() });

      writeFileSync(
        join(fx.dir, 'projects', slugOf(cwd), `${id}.jsonl`),
        `${lines.map(line => JSON.stringify(line)).join('\n')}\n`,
      );

      await waitFor(() => alertFeed.got.length, { timeout: 8000, what: 'the alert' }).catch(() => {}); // the assertion below says what came
      alertFeed.stop();
      assert.equal(alertFeed.got.length, 1, 'one alert');
      assert.equal(alertFeed.got[0].kind, 'reply');
      assert.equal(alertFeed.got[0].snippet, 'first answer');
      const session = (await srv.api('api/sessions')).body.sessions.find(chat => chat.id === id);

      assert.ok(session.file && session.alive, 'the chat has its transcript and is still the live one');
    } finally {
      await srv.stop();
    }
  },
);

test('an append read while a character was half written decodes whole', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'));
  const srv = await startTestServer({ claudeDir: fx.dir });

  const chat = fx.chats[1];
  const file = join(fx.dir, 'projects', slugOf(chat.cwd), `${chat.id}.jsonl`);

  try {
    await srv.api(`api/sessions/${chat.id}/messages`); // open: entries are kept from here on

    const line = Buffer.from(
      `${replyLines({ id: chat.id, cwd: chat.cwd, text: 'não, ação' })
        .map(entry => JSON.stringify(entry))
        .join('\n')}\n`,
    );

    const cutAt = line.indexOf(Buffer.from('ã')) + 1; // between the two bytes of ã

    appendFileSync(file, line.subarray(0, cutAt));
    await sleep(400); // the board reads the first half on its own
    appendFileSync(file, line.subarray(cutAt));

    const last = await waitFor(
      async () =>
        (await srv.api(`api/sessions/${chat.id}/messages`)).body.entries
          .findLast(entry => entry.role === 'assistant')
          ?.text.includes('ação') &&
        (await srv.api(`api/sessions/${chat.id}/messages`)).body.entries.findLast(entry => entry.role === 'assistant')
          .text,
      { what: 'the reply read' },
    );

    assert.equal(last, 'não, ação');
  } finally {
    await srv.stop();
  }
});

test(
  'two kinds of alert within the debounce both go out — a branch moved under a chat at work, and its reply (2026-10-14)',
  { timeout: 30_000 },
  async () => {
    const fx = defaultFixture(tmpDir('peix-fx-'));

    const id = randomUUID();
    const cwd = fx.chats[1].cwd;

    writeFileSync(
      join(fx.dir, 'sessions', `${process.pid}.json`),
      JSON.stringify({
        pid: process.pid,
        sessionId: id,
        cwd,
        startedAt: Date.now(),
        version: 'fixture',
        kind: 'interactive',
        entrypoint: 'cli',
        status: 'busy',
      }),
    );

    const srv = await startTestServer({ claudeDir: fx.dir });

    try {
      const alertFeed = await alerts(srv.url, srv.key);

      // read in one go, as the first lines of a chat the registry announced: the move is judged at the read's end, the
      // reply queued while it was read — one window
      const isoAt = seconds => new Date(Date.now() - 30_000 + seconds * 1000).toISOString();

      const base = (seconds, gitBranch) => ({
        cwd,
        sessionId: id,
        entrypoint: 'cli',
        gitBranch,
        timestamp: isoAt(seconds),
      });

      const lines = [
        { ...base(0, 'feat/a'), type: 'user', uuid: randomUUID(), message: { role: 'user', content: 'round the tax' } },
        {
          ...base(1, 'feat/a'),
          type: 'assistant',
          message: { id: 'm1', role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'text', text: 'on it' }] },
        },
        {
          ...base(2, 'main'),
          type: 'assistant',
          message: {
            id: 'm2',
            role: 'assistant',
            stop_reason: 'tool_use',
            content: [{ type: 'text', text: 'still on it' }],
          },
        },
        {
          ...base(3, 'main'),
          type: 'assistant',
          message: {
            id: 'm3',
            role: 'assistant',
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'rounded' }],
          },
        },
      ];

      writeFileSync(
        join(fx.dir, 'projects', slugOf(cwd), `${id}.jsonl`),
        `${lines.map(line => JSON.stringify(line)).join('\n')}\n`,
      );

      await waitFor(() => alertFeed.got.length >= 2, { timeout: 8000, what: 'two alerts' }).catch(() => {}); // the assertion below says what came
      await sleep(600);
      alertFeed.stop();

      assert.deepEqual(
        alertFeed.got.map(alert => alert.kind).sort(),
        ['drift', 'reply'],
        JSON.stringify(alertFeed.got.map(alert => [alert.kind, alert.snippet])),
      );
    } finally {
      await srv.stop();
    }
  },
);
