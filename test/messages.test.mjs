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
  const res = await fetch(`${url}events?key=${key}`); assert.ok(res.ok, `the event stream: ${res.status}`);
  const reader = res.body.getReader(), dec = new TextDecoder(), got = [];
  const { promise: snapshot, resolve } = Promise.withResolvers();
  (async () => {
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /^event: (\w+)\ndata: (.*)$/s.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m?.[1] === 'snapshot') resolve(); else if (m) got.push({ event: m[1], data: JSON.parse(m[2]) }); }
    }
  })().catch(() => {});
  await snapshot;
  return { got, entries: id => got.filter(e => e.event === 'entries' && e.data.sessionId === id).map(e => e.data), stop: () => reader.cancel().catch(() => {}) };
}
const lines = (id, cwd, prompt, reply) => chatLines({ id, cwd, prompt, reply, at: new Date() }).filter(l => l.type !== 'ai-title').map(l => JSON.stringify(l) + '\n').join('');

test('gen and upto: a fetch, the stream\'s entries after it, and a reading of the whole file again', { timeout: 60_000 }, async () => {
  const cwd = '/Users/test/widgets', fx = makeFixture(tmpDir('peix-fx-'), [{ cwd, prompt: 'first', reply: 'first done' }, { cwd, prompt: 'other', reply: 'other done' }]);
  const [chat, other] = fx.chats;
  const srv = await startTestServer({ claudeDir: fx.dir, env: { TAIL_BYTES: '64' } });   // the boot tails every chat: none is loaded
  try {
    const a = await srv.api(`api/sessions/${chat.id}/messages`);
    assert.equal(a.status, 200);
    const gen = a.body.gen;
    assert.ok(Number.isInteger(gen) && gen > 0);
    assert.equal(a.body.upto, 2); assert.equal(a.body.entries.length, 2);
    const b = await srv.api(`api/sessions/${chat.id}/messages`);
    assert.deepEqual([b.body.gen, b.body.upto], [gen, 2], 'fetched again, the same reading');

    const s = await stream(srv.url, srv.key);
    appendFileSync(chat.file, lines(chat.id, cwd, 'second', 'second done'));
    appendFileSync(other.file, lines(other.id, cwd, 'unseen', 'unseen done'));
    const got = await waitFor(() => s.entries(chat.id).at(-1)?.upto === 4 && s.entries(chat.id), { what: 'the appended entries on the stream' });
    assert.ok(got.every(e => e.gen === gen), 'an append is the same reading');
    assert.deepEqual(got.flatMap(e => e.entries).map(e => [e.role, e.text]), [['user', 'second'], ['assistant', 'second done']]);
    assert.ok(got.every((e, i) => e.upto === 2 + got.slice(0, i + 1).reduce((n, x) => n + x.entries.length, 0)), 'each event ends where its entries do');
    const c = await srv.api(`api/sessions/${chat.id}/messages`);
    assert.deepEqual([c.body.gen, c.body.upto, c.body.entries.length], [gen, 4, 4]);
    assert.deepEqual(c.body.entries.slice(2), got.flatMap(e => e.entries), 'the fetch has what the stream said');

    await waitFor(() => s.got.some(e => e.event === 'session' && e.data.id === other.id && e.data.lastReply === 'unseen done'), { what: 'the other chat\'s append' });
    assert.deepEqual(s.entries(other.id), [], 'a chat nobody opened streams no entries');
    const o = await srv.api(`api/sessions/${other.id}/messages`);
    assert.deepEqual([o.body.upto, o.body.entries.map(e => e.text)], [4, ['other', 'other done', 'unseen', 'unseen done']], 'its first fetch reads it whole');

    const two = readFileSync(chat.file, 'utf8').split('\n').filter(Boolean).slice(0, 2).join('\n') + '\n';
    writeFileSync(chat.file, two);   // shorter than what was read: read again, whole
    const d = await waitFor(async () => { const r = await srv.api(`api/sessions/${chat.id}/messages`); return r.body.gen !== gen && r; }, { what: 'the file read again' });
    assert.ok(d.body.gen > gen, 'another reading, numbered after');
    assert.deepEqual([d.body.upto, d.body.entries.map(e => e.text)], [2, ['first', 'first done']]);
    s.stop();
  } finally { await srv.stop(); }
});
