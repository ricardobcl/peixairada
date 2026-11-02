// A chat muted (2026-11-02): its alerts still reach every page, for its card's own count, but `quiet` and `muted`, so no
// poster shows a banner and the page makes no sound. Questions too. It lasts until you unmute it, over a restart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture, replyLines } from '../scripts/fixture.mjs';

const tmp = tmpDir('peix-test-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { mutedChats, newSession, prAlertChat } = await import('../server.mjs');

/** The `alert` events of the stream, once its snapshot is in. */
async function alerts(url, key) {
  const res = await fetch(`${url}events?key=${key}`); assert.ok(res.ok, `the event stream: ${res.status}`);
  const reader = res.body.getReader(), dec = new TextDecoder(), got = [];
  const { promise: snapshot, resolve } = Promise.withResolvers();
  (async () => {
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /^event: (\w+)\ndata: (.*)$/s.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m?.[1] === 'snapshot') resolve(); if (m?.[1] === 'alert') got.push(JSON.parse(m[2])); }
    }
  })().catch(() => {});
  await snapshot;
  return { got, stop: () => reader.cancel().catch(() => {}) };
}
const said = (chat, text) => appendFileSync(chat.file, replyLines({ id: chat.id, cwd: chat.cwd, text, at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
const summaryOf = async (srv, id) => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);

test("a muted chat's reply goes out quiet and muted, another chat's as ever, and unmuted it is loud again", { timeout: 30_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-')), [one, two] = fx.chats;
  const srv = await startTestServer({ claudeDir: fx.dir });
  let a;
  try {
    assert.equal((await summaryOf(srv, one.id)).muted, false, 'not muted to begin with');
    assert.deepEqual((await srv.post(`api/sessions/${one.id}/mute`, { on: true })).body, { ok: true, muted: true });
    assert.equal((await summaryOf(srv, one.id)).muted, true, 'the summary says so');
    assert.equal((await summaryOf(srv, two.id)).muted, false, 'that chat alone');
    a = await alerts(srv.url, srv.key);
    said(one, 'from the muted one');
    await waitFor(() => a.got.length === 1, { what: "the muted chat's alert" });
    assert.deepEqual([a.got[0].sessionId, a.got[0].quiet, a.got[0].muted], [one.id, true, true]);
    said(two, 'from the other');
    await waitFor(() => a.got.length === 2, { what: "the other chat's alert" });
    assert.deepEqual([a.got[1].sessionId, a.got[1].quiet, a.got[1].muted], [two.id, false, false]);
    await srv.post(`api/sessions/${one.id}/mute`, { on: false });
    said(one, 'loud again');
    await waitFor(() => a.got.length === 3, { what: 'the alert once unmuted' });
    assert.deepEqual([a.got[2].sessionId, a.got[2].quiet, a.got[2].muted], [one.id, false, false]);
  } finally { a?.stop(); await srv.stop(); }
});

test('a question from a muted chat is silent too', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-')), chat = fx.chats[1];
  const entry = { pid: process.pid, sessionId: chat.id, cwd: chat.cwd, startedAt: Date.now(), version: 'fixture', kind: 'interactive', entrypoint: 'cli', status: 'idle' }, reg = join(fx.dir, 'sessions', `${process.pid}.json`);
  writeFileSync(reg, JSON.stringify(entry));
  const srv = await startTestServer({ claudeDir: fx.dir });
  let a;
  try {
    await waitFor(async () => (await summaryOf(srv, chat.id))?.alive, { what: 'the chat alive' });
    await srv.post(`api/sessions/${chat.id}/mute`, { on: true });
    a = await alerts(srv.url, srv.key);
    writeFileSync(reg, JSON.stringify({ ...entry, status: 'waiting', waitingFor: 'input needed', statusUpdatedAt: Date.now() }));
    await waitFor(() => a.got.some(x => x.kind === 'needs-input'), { what: 'the question' });
    const q = a.got.find(x => x.kind === 'needs-input');
    assert.deepEqual([q.quiet, q.muted], [true, true]);
    assert.equal((await summaryOf(srv, chat.id)).status, 'needs-input', 'its card still says it is asking');
  } finally { a?.stop(); await srv.stop(); }
});

test('it outlasts a restart, is kept in the state file, and the route takes only a yes or a no', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-')), chat = fx.chats[0];
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    await srv.post(`api/sessions/${chat.id}/mute`, { on: true });
    assert.ok(JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).mutedChats[chat.id], 'in the state file');
    await srv.restart();
    assert.equal((await summaryOf(srv, chat.id)).muted, true, 'after a restart');
    assert.equal((await srv.post(`api/sessions/${chat.id}/mute`, { on: 'yes' })).status, 400, 'anything but a boolean is refused');
    assert.equal((await summaryOf(srv, chat.id)).muted, true, 'and changes nothing');
    assert.equal((await srv.post('api/sessions/no-such-chat/mute', { on: true })).status, 404, 'no such chat');
    await srv.post(`api/sessions/${chat.id}/mute`, { on: false });
    assert.equal(JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).mutedChats[chat.id], undefined, 'unmuted, gone from the file');
  } finally { await srv.stop(); }
});

test("a PR's alert goes to a chat that is not muted, and to a muted one only when all are", () => {
  const recent = newSession('recent', '/x/recent.jsonl'), older = newSession('older', '/x/older.jsonl');
  recent.lastActivity = '2026-11-02T12:00:00Z'; older.lastActivity = '2026-11-02T09:00:00Z';
  assert.equal(prAlertChat([older, recent]), recent, 'the chat touched last');
  mutedChats.recent = 'now';
  assert.equal(prAlertChat([older, recent]), older, 'unless it is muted and another names the PR');
  mutedChats.older = 'now';
  assert.equal(prAlertChat([older, recent]), recent, 'all muted: the chat touched last, to go out quiet');
  assert.equal(prAlertChat([]), null, 'nobody to say it');
  delete mutedChats.recent; delete mutedChats.older;
});
