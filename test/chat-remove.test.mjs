// Delete from the board (2026-11-04): any chat, whatever it is doing. Its claude ends, its transcript stays where it is, and it
// is off the list and every count until a word in it, a claude started on it, a resume or {undo}.
import './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture } from '../scripts/fixture.mjs';

const chatOf = async (srv, id) => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);
const start = pid => execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' } }).trim();
/** A claude live outside the board, as far as the registry says. */
function elsewhere(fx, chat, more = {}) {
  const p = spawn('sleep', ['60'], { stdio: 'ignore' });
  writeFileSync(join(fx.dir, 'sessions', `${p.pid}.json`), JSON.stringify({ pid: p.pid, sessionId: chat.id, cwd: chat.cwd, startedAt: Date.now(), procStart: start(p.pid), kind: 'interactive', entrypoint: 'cli', status: 'idle', statusUpdatedAt: Date.now(), ...more }));
  return p;
}
const word = (chat, text = 'and one more thing') => appendFileSync(chat.file, JSON.stringify({ parentUuid: null, isSidechain: false, type: 'user', uuid: randomUUID(), timestamp: new Date(Date.now() + 1000).toISOString(), cwd: chat.cwd, sessionId: chat.id, message: { role: 'user', content: text } }) + '\n');

test('deleted: off the board for good across a restart, its transcript untouched, in no count; {undo} puts it back', { timeout: 40_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const chat = fx.chats[1], was = readFileSync(chat.file, 'utf8');
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  try {
    const r = await srv.post(`api/sessions/${chat.id}/remove`, {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const s = await chatOf(srv, chat.id);
    assert.deepEqual([s.removed, s.done, s.forGood], [true, true, true], 'a tick for good, and off the list');
    assert.equal(readFileSync(chat.file, 'utf8'), was, 'nothing under the transcripts is touched');
    assert.ok(existsSync(chat.file));
    const today = (await srv.api(`api/today?since=${Date.now() - 7 * 86_400_000}`)).body;
    assert.ok(!JSON.stringify(today).includes(chat.id), 'nor is it in the day');
    await srv.restart();
    assert.equal((await chatOf(srv, chat.id)).removed, true, 'a restart keeps it off');
    assert.deepEqual((await srv.post(`api/sessions/${chat.id}/remove`, { undo: true })).body, { ok: true, removed: false });
    const back = await chatOf(srv, chat.id);
    assert.deepEqual([back.removed, back.done, back.forGood], [false, false, false], 'put back as a chat with no tick');
    assert.equal((await srv.post('api/sessions/nope/remove', {})).status, 404);
  } finally { await srv.stop(); }
});

test('whatever it is doing: its drawer and a claude elsewhere end, its question or turn with them, and what they write does not bring it back', { timeout: 40_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const [first, second] = fx.chats;
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  let asker;
  try {
    // a drawer's claude, and its zsh
    const d = await srv.post(`api/sessions/${second.id}/terminal`, { cols: 90, rows: 24 });
    assert.equal(d.status, 201);
    await waitFor(async () => (await chatOf(srv, second.id))?.alive, { what: 'the drawer up' });
    const z = await srv.post(`api/sessions/${second.id}/shell`, { cols: 90, rows: 24 });
    const pid = (await chatOf(srv, second.id)).live.pid;
    const r = await srv.post(`api/sessions/${second.id}/remove`, {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.removed, true);
    await waitFor(async () => { const c = await chatOf(srv, second.id); return !c.alive && c.terminal?.exited != null && c.removed; }, { what: 'its claude ended, the chat still off' });
    assert.throws(() => process.kill(pid, 0), 'its claude is gone');
    if (z.status < 300) await waitFor(async () => (await srv.api('api/terminals')).body.terminals.find(t => t.id === z.body.terminal.id)?.exited != null || !(await srv.api('api/terminals')).body.terminals.some(t => t.id === z.body.terminal.id), { what: 'its zsh ended' });

    // a claude elsewhere, asking
    asker = elsewhere(fx, first, { status: 'waiting', waitingFor: 'input needed' });
    await waitFor(async () => (await chatOf(srv, first.id))?.status === 'needs-input', { what: 'the chat asking' });
    const q = await srv.post(`api/sessions/${first.id}/remove`, {});
    assert.equal(q.status, 200, JSON.stringify(q.body));
    await waitFor(() => asker.exitCode !== null || asker.signalCode, { what: 'the claude elsewhere ended' });
    assert.equal((await chatOf(srv, first.id)).removed, true);
  } finally { try { asker?.kill(); } catch {} await srv.stop(); }
});

test('a word in it, a claude started on it or a resume brings it back', { timeout: 40_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const [first, second] = fx.chats;
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  let later;
  try {
    await srv.post(`api/sessions/${first.id}/remove`, {});
    await srv.post(`api/sessions/${second.id}/remove`, {});
    word(first);
    await waitFor(async () => { const c = await chatOf(srv, first.id); return !c.removed && !c.done; }, { what: 'a word bringing it back' });
    later = elsewhere(fx, second);
    await waitFor(async () => { const c = await chatOf(srv, second.id); return c.alive && !c.removed && !c.done; }, { what: 'a claude started on it bringing it back' });
    later.kill();
    await waitFor(async () => !(await chatOf(srv, second.id)).alive, { what: 'that claude gone' });
    await srv.post(`api/sessions/${second.id}/remove`, {});
    assert.equal((await chatOf(srv, second.id)).removed, true);
    const d = await srv.post(`api/sessions/${second.id}/terminal`, { cols: 90, rows: 24 });
    assert.equal(d.status, 201, JSON.stringify(d.body));
    assert.equal((await chatOf(srv, second.id)).removed, false, 'a resume is the plainest way of asking for it back');
  } finally { try { later?.kill(); } catch {} await srv.stop(); }
});

test('vim with unsaved work is not killed over them: the chat stays, and says why', { timeout: 40_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const chat = fx.chats[1];
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true, env: { FAKE_VIM_DIRTY: '1' } });
  try {
    const v = await srv.post(`api/sessions/${chat.id}/shell`, { cols: 90, rows: 24, vim: true, dir: chat.cwd });
    assert.ok(v.status < 300, JSON.stringify(v.body));
    const r = await srv.post(`api/sessions/${chat.id}/remove`, {});
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.match(r.body.error, /vim has unsaved work/);
    const s = await chatOf(srv, chat.id);
    assert.deepEqual([s.removed, s.done], [false, false], 'back on the board');
    assert.ok((await srv.api('api/terminals')).body.terminals.some(t => t.id === v.body.terminal.id && t.exited === null), 'vim still up');
  } finally { await srv.stop(); }
});
