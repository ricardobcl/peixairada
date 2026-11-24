// Snooze (2026-11-24, round XXX): a chat put away until a time or an event of its own — a PR come round to you, its
// checks done, Claude's reply, its monitor ended. It calls you on nothing meanwhile (its alerts go out quiet). Woken by
// itself it comes back marked (`wokeAt`, `wokeWhy`), first in its lane, with one `back` alert — the reply's own when it
// was the reply; your word, a tick, a question or an undo end it with no mark and no alert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sleep, startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture, makeFixture, replyLines, toolLines } from '../scripts/fixture.mjs';

const tmp = tmpDir('peix-test-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { wakeWhy, newSession, doneMarks } = await import('../server.mjs');

/** The `alert` events of the stream, once its snapshot is in. */
async function alerts(srv) {
  const res = await fetch(`${srv.url}events?key=${srv.key}`); assert.ok(res.ok, `the event stream: ${res.status}`);
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
  return { got, of: (id, kind) => got.filter(a => a.sessionId === id && (!kind || a.kind === kind)), stop: () => reader.cancel().catch(() => {}) };
}
const append = (chat, lines) => appendFileSync(chat.file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
const said = (chat, text) => append(chat, replyLines({ id: chat.id, cwd: chat.cwd, text, at: new Date() }));
/** A word of yours, now. */
const typed = (chat, text) => append(chat, [{ isSidechain: false, userType: 'external', entrypoint: 'cli', cwd: chat.cwd, sessionId: chat.id, version: 'fixture', gitBranch: 'main',
  parentUuid: null, type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, uuid: randomUUID(), timestamp: new Date().toISOString() }]);
const summaryOf = async (srv, id) => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);
const snooze = (srv, id, body) => srv.post(`api/sessions/${id}/snooze`, body);

test('wakeWhy: what ends a snooze, and how', () => {
  const at = '2026-11-24T10:00:00.000Z', now = Date.parse('2026-11-24T11:00:00.000Z'), after = '2026-11-24T10:30:00.000Z', before = '2026-11-24T09:00:00.000Z';
  const url = 'https://github.com/acme/widgets/pull/12';
  const chat = () => { const s = newSession(randomUUID(), '/x/a.jsonl'); s.alive = true; s.live = { pid: 1, status: 'idle', startedAt: 0 }; s.status = 'idle'; s.lastActivity = before; return s; };
  let s = chat();
  assert.equal(wakeWhy(s, { at, until: '2026-11-24T12:00:00.000Z' }, now), null, 'its time not come');
  assert.deepEqual(wakeWhy(s, { at, until: after }, now), { kind: 'time', why: 'its time came' });
  s.lastUserAt = before;
  assert.equal(wakeWhy(s, { at, until: '2026-11-24T12:00:00.000Z' }, now), null, 'a word of yours from before');
  s.lastUserAt = after;
  assert.deepEqual(wakeWhy(s, { at, until: after }, now), { quiet: true }, 'your word since: no mark, even past its time');

  s = chat(); s.live.status = 'waiting'; s.live.waitingFor = 'input needed';
  assert.deepEqual(wakeWhy(s, { at, until: '2026-11-24T12:00:00.000Z' }, now), { quiet: true }, 'a question: its own alert speaks');

  s = chat(); doneMarks[s.id] = after;
  assert.deepEqual(wakeWhy(s, { at, until: '2026-11-24T12:00:00.000Z' }, now), { quiet: true }, 'ticked done since');
  doneMarks[s.id] = before;
  assert.equal(wakeWhy(s, { at, until: '2026-11-24T12:00:00.000Z' }, now), null, 'a tick from before holds nothing');
  delete doneMarks[s.id];

  s = chat(); const pr = { url, label: 'widgets#12', state: 'open', checks: 'pending', turn: { you: false, movedAt: before } }; s.prs = [pr];
  const onPr = { at, on: 'pr', pr: url };
  assert.equal(wakeWhy(s, onPr, now), null, 'their move');
  pr.turn = { you: true, movedAt: before };
  assert.equal(wakeWhy(s, onPr, now), null, 'your move from before the snooze');
  pr.turn = { you: true, movedAt: after };
  assert.deepEqual(wakeWhy(s, onPr, now), { kind: 'pr', why: 'widgets#12 came round to you' });
  pr.turn = null; pr.state = 'merged';
  assert.deepEqual(wakeWhy(s, onPr, now), { kind: 'pr', why: 'widgets#12 was merged' });
  pr.state = 'open';
  const onCi = { at, on: 'ci', pr: url };
  assert.equal(wakeWhy(s, onCi, now), null, 'its checks running');
  for (const [checks, why] of [['pass', 'its checks passed'], ['fail', 'its checks failed'], [null, 'its checks finished']]) { pr.checks = checks; assert.deepEqual(wakeWhy(s, onCi, now), { kind: 'ci', why }); }
  s.prs = [];
  assert.deepEqual(wakeWhy(s, onPr, now), { kind: 'pr', why: 'its PR left the chat' });
  assert.deepEqual(wakeWhy(s, onCi, now), { kind: 'ci', why: 'its checks finished' });

  s = chat(); s.status = 'working'; s.live.status = 'busy';
  assert.equal(wakeWhy(s, { at, on: 'reply' }, now), null, 'still at work');
  s.status = 'idle'; s.live.status = 'idle';
  assert.deepEqual(wakeWhy(s, { at, on: 'reply' }, now), { kind: 'reply', why: 'Claude replied' });
  s.alive = false;
  assert.deepEqual(wakeWhy(s, { at, on: 'reply' }, now), { kind: 'ended', why: 'its claude ended' }, 'its claude gone: no reply to speak for it');

  s = chat(); s.tasks = new Map([['bg1', { kind: 'monitor', what: 'the deploy', at: new Date().toISOString() }]]);
  assert.equal(wakeWhy(s, { at, on: 'mon' }, now), null, 'its monitor runs');
  s.tasks = new Map();
  assert.deepEqual(wakeWhy(s, { at, on: 'mon' }, now), { kind: 'mon', why: 'its monitor ended' });
  assert.deepEqual(wakeWhy(s, { at, on: 'mon', until: after }, now), { kind: 'time', why: 'its time came' }, 'both: whichever first');
});

test('the route takes a time ahead or an event that can come, and nothing else', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-')), [one] = fx.chats;
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    assert.equal((await snooze(srv, 'no-such-chat', { until: Date.now() + 60_000 })).status, 404, 'no such chat');
    assert.equal((await snooze(srv, one.id, {})).status, 400, 'neither a time nor an event');
    assert.equal((await snooze(srv, one.id, { until: Date.now() - 1000 })).status, 400, 'a time past');
    assert.equal((await snooze(srv, one.id, { until: Date.now() + 400 * 86_400_000 })).status, 400, 'more than a year away');
    assert.equal((await snooze(srv, one.id, { until: 'soon' })).status, 400, 'not a time');
    assert.equal((await snooze(srv, one.id, { on: 'later' })).status, 400, 'no such event');
    assert.equal((await snooze(srv, one.id, { on: 'reply' })).status, 409, 'Claude is not at work in it');
    assert.equal((await snooze(srv, one.id, { on: 'mon' })).status, 409, 'no monitor runs');
    assert.equal((await snooze(srv, one.id, { on: 'pr', pr: 'https://github.com/acme/other/pull/1' })).status, 404, 'not its PR');
    assert.equal((await summaryOf(srv, one.id)).snooze, null, 'no refusal snoozed it');
    const until = new Date(Date.now() + 3_600_000).toISOString(), r = await snooze(srv, one.id, { until });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.snooze.until, typeof r.body.snooze.at], [until, 'string']);
    assert.deepEqual((await summaryOf(srv, one.id)).snooze, r.body.snooze, 'on the summary');
    assert.deepEqual(JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).snoozed[one.id], r.body.snooze, 'in the state file');
    await srv.restart();
    assert.deepEqual((await summaryOf(srv, one.id)).snooze, r.body.snooze, 'after a restart');
  } finally { await srv.stop(); }
});

test('a chat asking you is not snoozed', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-')), chat = fx.chats[1];
  writeFileSync(join(fx.dir, 'sessions', `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: chat.id, cwd: chat.cwd, startedAt: Date.now(), version: 'fixture', kind: 'interactive', entrypoint: 'cli',
    status: 'waiting', waitingFor: 'input needed', statusUpdatedAt: Date.now() }));
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    await waitFor(async () => (await summaryOf(srv, chat.id))?.status === 'needs-input', { what: 'the chat asking' });
    const r = await snooze(srv, chat.id, { until: Date.now() + 60_000 });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /question wakes it/);
  } finally { await srv.stop(); }
});

test('its time come, it is back by itself: marked, first in the list, one back alert — quiet when muted', { timeout: 40_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-')), [one, two] = fx.chats;   // one is the older
  const srv = await startTestServer({ claudeDir: fx.dir });
  let a;
  try {
    assert.equal((await srv.api('api/sessions')).body.sessions[0].id, two.id, 'the newer first, to begin with');
    a = await alerts(srv);
    await snooze(srv, one.id, { until: Date.now() + 1500 });
    await waitFor(() => a.of(one.id, 'back').length, { what: 'the back alert' });
    const back = a.of(one.id, 'back')[0];
    assert.deepEqual([back.heading, back.snippet, back.quiet, back.muted, back.snoozed], ['Back · repo-a', 'its time came', false, false, undefined]);
    const sum = await summaryOf(srv, one.id);
    assert.deepEqual([sum.snooze, sum.wokeWhy, typeof sum.wokeAt], [null, 'its time came', 'string']);
    assert.equal((await srv.api('api/sessions')).body.sessions[0].id, one.id, 'back at the top: its wake is a word');
    assert.equal(JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).woke[one.id].why, 'its time came', 'the mark is kept');

    await srv.post(`api/sessions/${two.id}/mute`, { on: true });
    await snooze(srv, two.id, { until: Date.now() + 800 });
    await waitFor(() => a.of(two.id, 'back').length, { what: "the muted chat's back alert" });
    assert.deepEqual([a.of(two.id, 'back')[0].quiet, a.of(two.id, 'back')[0].muted], [true, true]);
    await sleep(600);
    assert.equal(a.got.filter(x => x.kind === 'back').length, 2, 'once each');
  } finally { a?.stop(); await srv.stop(); }
});

test('your word, an undo or a tick end it with no mark and no alert; a reply meanwhile goes out quiet', { timeout: 40_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-')), [one, two] = fx.chats;
  const srv = await startTestServer({ claudeDir: fx.dir });
  let a;
  try {
    a = await alerts(srv);
    const later = () => Date.now() + 3_600_000;
    await snooze(srv, one.id, { until: later() });
    said(one, 'a reply while it is away');
    await waitFor(() => a.of(one.id, 'reply').length, { what: 'the reply alert' });
    assert.deepEqual([a.of(one.id, 'reply')[0].quiet, a.of(one.id, 'reply')[0].snoozed], [true, true], 'it calls you on nothing');
    assert.ok((await summaryOf(srv, one.id)).snooze, "and a reply is not what it waits for");

    typed(one, 'back to this one');
    await waitFor(async () => (await summaryOf(srv, one.id)).snooze === null, { what: 'your word to end it' });
    assert.equal((await summaryOf(srv, one.id)).wokeAt, null, 'no mark');

    await snooze(srv, two.id, { until: later() });
    assert.deepEqual((await snooze(srv, two.id, { undo: true })).body, { ok: true, snooze: null });
    assert.equal((await summaryOf(srv, two.id)).wokeAt, null, 'an undo leaves no mark');

    await snooze(srv, two.id, { until: later() });
    await srv.post(`api/sessions/${two.id}/done`, { done: true });
    assert.equal((await summaryOf(srv, two.id)).snooze, null, 'a tick ends it');
    assert.equal(JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).snoozed[two.id], undefined, 'gone from the state file');
    await sleep(600);
    assert.equal(a.got.filter(x => x.kind === 'back').length, 0, 'no back alert for any of them');
  } finally { a?.stop(); await srv.stop(); }
});

test("snoozed till Claude replies: the reply wakes it, said by the reply's own alert alone", { timeout: 40_000 }, async () => {
  const cwd = '/Users/test/repo-w';
  const fx = makeFixture(tmpDir('peix-fx-'), [{ cwd, prompt: 'deploy it', reply: 'on it', at: new Date(Date.now() - 120_000), live: { pid: process.pid, status: 'busy' },
    lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'sleep 30' } }) }]);
  const chat = fx.chats[0];
  const srv = await startTestServer({ claudeDir: fx.dir });
  let a;
  try {
    await waitFor(async () => (await summaryOf(srv, chat.id))?.status === 'working', { what: 'the chat at work' });
    a = await alerts(srv);
    const r = await snooze(srv, chat.id, { on: 'reply' });
    assert.deepEqual([r.status, r.body.snooze?.on], [200, 'reply']);
    said(chat, 'deployed');
    await waitFor(() => a.of(chat.id, 'reply').length, { what: 'the reply alert' });
    const reply = a.of(chat.id, 'reply')[0];
    assert.deepEqual([reply.quiet, reply.snoozed], [false, undefined], 'loud: the snooze was gone before it went');
    const sum = await summaryOf(srv, chat.id);
    assert.deepEqual([sum.snooze, sum.wokeWhy], [null, 'Claude replied']);
    await sleep(600);
    assert.deepEqual(a.of(chat.id).map(x => x.kind), ['reply'], 'no back alert besides');
  } finally { a?.stop(); await srv.stop(); }
});
