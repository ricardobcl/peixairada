// The open chat's entries are numbered on the wire (2026-10-14: nothing tested it): GET /api/sessions/:id/messages and
// every `entries` event carry `gen` — which reading of the file — and `upto` — how many entries that reading has folded
// —, so the page keeps only what is past what it holds, and another gen or a gap is a fetch. An append is the same gen,
// further on; a file read again whole (one that shrank) is another gen. A chat the boot only tailed and nobody opened
// streams no entries: its first fetch reads it whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { chatLines, makeFixture } from '../scripts/fixture.mjs';

/** The stream's events, by name, as they come — handed back once its snapshot is in. */
async function stream(url, key) {
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
        else if (match) got.push({ event: match[1], data: JSON.parse(match[2]) });
      }
    }
  })().catch(() => {});

  await snapshot;
  return {
    got,
    entries: id =>
      got.filter(message => message.event === 'entries' && message.data.sessionId === id).map(message => message.data),
    stop: () => reader.cancel().catch(() => {}),
  };
}

const lines = (id, cwd, prompt, reply) =>
  chatLines({ id, cwd, prompt, reply, at: new Date() })
    .filter(line => line.type !== 'ai-title')
    .map(line => `${JSON.stringify(line)}\n`)
    .join('');

test(
  "gen and upto: a fetch, the stream's entries after it, and a reading of the whole file again",
  { timeout: 60_000 },
  async () => {
    const cwd = '/Users/test/widgets';

    const fx = makeFixture(tmpDir('peix-fx-'), [
      { cwd, prompt: 'first', reply: 'first done' },
      { cwd, prompt: 'other', reply: 'other done' },
    ]);

    const [chat, other] = fx.chats;
    const srv = await startTestServer({ claudeDir: fx.dir, env: { TAIL_BYTES: '64' } }); // the boot tails every chat: none is loaded

    try {
      const first = await srv.api(`api/sessions/${chat.id}/messages`);

      assert.equal(first.status, 200);
      const gen = first.body.gen;

      assert.ok(Number.isInteger(gen) && gen > 0);
      assert.equal(first.body.upto, 2);
      assert.equal(first.body.entries.length, 2);
      const again = await srv.api(`api/sessions/${chat.id}/messages`);

      assert.deepEqual([again.body.gen, again.body.upto], [gen, 2], 'fetched again, the same reading');

      const feed = await stream(srv.url, srv.key);

      appendFileSync(chat.file, lines(chat.id, cwd, 'second', 'second done'));
      appendFileSync(other.file, lines(other.id, cwd, 'unseen', 'unseen done'));

      const got = await waitFor(() => feed.entries(chat.id).at(-1)?.upto === 4 && feed.entries(chat.id), {
        what: 'the appended entries on the stream',
      });

      assert.ok(
        got.every(batch => batch.gen === gen),
        'an append is the same reading',
      );

      assert.deepEqual(
        got.flatMap(batch => batch.entries).map(entry => [entry.role, entry.text]),
        [
          ['user', 'second'],
          ['assistant', 'second done'],
        ],
      );

      assert.ok(
        got.every(
          (batch, index) =>
            batch.upto === 2 + got.slice(0, index + 1).reduce((total, earlier) => total + earlier.entries.length, 0),
        ),
        'each event ends where its entries do',
      );

      const later = await srv.api(`api/sessions/${chat.id}/messages`);

      assert.deepEqual([later.body.gen, later.body.upto, later.body.entries.length], [gen, 4, 4]);

      assert.deepEqual(
        later.body.entries.slice(2),
        got.flatMap(batch => batch.entries),
        'the fetch has what the stream said',
      );

      await waitFor(
        () =>
          feed.got.some(
            message =>
              message.event === 'session' && message.data.id === other.id && message.data.lastReply === 'unseen done',
          ),
        { what: "the other chat's append" },
      );

      assert.deepEqual(feed.entries(other.id), [], 'a chat nobody opened streams no entries');
      const otherMessages = await srv.api(`api/sessions/${other.id}/messages`);

      assert.deepEqual(
        [otherMessages.body.upto, otherMessages.body.entries.map(entry => entry.text)],
        [4, ['other', 'other done', 'unseen', 'unseen done']],
        'its first fetch reads it whole',
      );

      const two = `${readFileSync(chat.file, 'utf8').split('\n').filter(Boolean).slice(0, 2).join('\n')}\n`;

      writeFileSync(chat.file, two); // shorter than what was read: read again, whole

      const reread = await waitFor(
        async () => {
          const fetched = await srv.api(`api/sessions/${chat.id}/messages`);

          return fetched.body.gen !== gen && fetched;
        },
        { what: 'the file read again' },
      );

      assert.ok(reread.body.gen > gen, 'another reading, numbered after');
      assert.deepEqual([reread.body.upto, reread.body.entries.map(entry => entry.text)], [2, ['first', 'first done']]);
      feed.stop();
    } finally {
      await srv.stop();
    }
  },
);
