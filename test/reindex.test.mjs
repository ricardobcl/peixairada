// Re-reading a chat the board already holds (opening one longer than TAIL_BYTES reads the whole file) must not alert
// for the replies in it — they were news once — while the first lines of a chat the registry announced before its
// transcript existed are news. Both through a throwaway server and its SSE stream, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestServer } from '../lib/testserver.mjs';
import { chatLines, defaultFixture, slugOf } from '../scripts/fixture.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
/** The `alert` events of the stream, as they come. */
async function alerts(url) {
  const res = await fetch(url + 'events'); const reader = res.body.getReader(); const dec = new TextDecoder(); const got = [];
  (async () => {
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /^event: (\w+)\ndata: (.*)$/s.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m?.[1] === 'alert') got.push(JSON.parse(m[2])); }
    }
  })().catch(() => {});
  return { got, stop: () => reader.cancel().catch(() => {}) };
}

test('opening a chat the boot only tailed reads it whole without alerting for its old reply', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(mkdtempSync(join(tmpdir(), 'peix-fx-')));
  const srv = await startTestServer({ claudeDir: fx.dir, env: { TAIL_BYTES: '64' } });
  const chat = fx.chats[1];
  try {
    const before = (await srv.api('api/sessions')).body.sessions.find(s => s.id === chat.id);
    assert.equal(before.loaded, false, 'the boot read only the tail');
    const a = await alerts(srv.url); await sleep(200);
    const r = await srv.api(`api/sessions/${chat.id}/messages`);
    assert.equal(r.status, 200); assert.equal(r.body.session.loaded, true); assert.equal(r.body.entries.length, 2, 'the whole transcript now');
    assert.equal(r.body.session.lastReply, 'It is a fixture. No PRs here.');
    await sleep(900);   // the alert debounce is 400 ms
    a.stop();
    assert.deepEqual(a.got, [], 'no alert for a reply that happened a day ago');
  } finally { await srv.stop(); }
});

test('a chat the registry announced first alerts when its transcript lands with a reply', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(mkdtempSync(join(tmpdir(), 'peix-fx-')));
  const id = randomUUID(), cwd = fx.chats[1].cwd;
  writeFileSync(join(fx.dir, 'sessions', `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: id, cwd, startedAt: Date.now(), version: 'fixture', kind: 'interactive', entrypoint: 'cli', status: 'idle' }));
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    const placeholder = (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);
    assert.ok(placeholder?.alive && !placeholder.file, 'a live chat with no transcript yet');
    const a = await alerts(srv.url); await sleep(200);
    const lines = chatLines({ id, cwd, prompt: 'first words', reply: 'first answer', at: new Date() });
    writeFileSync(join(fx.dir, 'projects', slugOf(cwd), `${id}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
    for (let i = 0; i < 30 && !a.got.length; i++) await sleep(100);
    a.stop();
    assert.equal(a.got.length, 1, 'one alert'); assert.equal(a.got[0].kind, 'reply'); assert.equal(a.got[0].snippet, 'first answer');
    const s = (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);
    assert.ok(s.file && s.alive, 'the chat has its transcript and is still the live one');
  } finally { await srv.stop(); }
});
