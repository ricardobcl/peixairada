// Chats that talk (2026-10-31): a message another chat sent this one — delivered, absorbed mid-turn, or still queued —
// read off the transcript in the shapes Claude Code writes (scripts/fixture.mjs's peerLines), its sender found, and
// never counted as a word of yours. The folding without a server; who sent what through one, with a registry.
import './env.mjs';   // first: server.mjs reads where its state lives as it is imported
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { chatLines, makeFixture, peerLines, yesterday } from '../scripts/fixture.mjs';
import { fold, newSession, summary } from '../server.mjs';

const A = { id: 'a1a1a1a1-0000-4000-8000-000000000001', cwd: '/tmp/acme/storefront' }, B = { id: 'b2b2b2b2-0000-4000-8000-000000000002', cwd: '/tmp/acme/billing-api' };
const at = new Date(Date.UTC(2026, 9, 31, 12, 0, 0));
const lines = (o = {}) => peerLines({ from: A, to: B, fromName: 'storefront-1', toName: 'billing-api', pid: 4242, body: 'The retry module is merged — import it from `@acme/payments`.', at, ...o });
const loaded = id => { const s = newSession(id, `/x/${id}.jsonl`); s.loaded = true; return s; };

test('a message delivered from another chat is a row of its own, and no word of yours', () => {
  const s = loaded(B.id), L = lines();
  for (const l of chatLines({ id: B.id, cwd: B.cwd, prompt: 'set up the invoice webhooks', reply: 'Queued them.', at })) fold(s, l);
  const before = { lastUserAt: s.lastUserAt, lastPrompt: s.lastPrompt, lastActivity: s.lastActivity, lastReplyAt: s.lastReplyAt, status: s.status, turnStart: s.turnStart };
  assert.equal(fold(s, L.delivered[0]), true, 'the summary changed: a message came');
  const e = s.entries.at(-1);
  assert.equal(e.kind, 'peer'); assert.equal(e.role, 'peer');
  assert.equal(e.name, 'storefront-1'); assert.equal(e.mode, 'prompting'); assert.equal(e.pid, 4242); assert.equal(e.verified, true);
  assert.equal(e.text, 'The retry module is merged — import it from `@acme/payments`.', 'the body, not Claude Code\'s framing around it');
  assert.deepEqual({ lastUserAt: s.lastUserAt, lastPrompt: s.lastPrompt, lastActivity: s.lastActivity, lastReplyAt: s.lastReplyAt, status: s.status, turnStart: s.turnStart }, before,
    'no prompt, no last word, no turn, no status of yours');
  const sum = summary(s);
  assert.equal(sum.lastPrompt, 'set up the invoice webhooks'); assert.equal(sum.lastUserAt, before.lastUserAt);
  assert.equal(sum.peerIn.name, 'storefront-1'); assert.equal(sum.peerIn.queued, false); assert.equal(sum.peerIn.at, L.delivered[0].timestamp);
  assert.equal(sum.peerQueue, null, 'nothing waiting');
  // the reply to it is Claude's, and counts as Claude's
  fold(s, { ...L.delivered[0], type: 'assistant', isMeta: undefined, origin: undefined, timestamp: new Date(at.getTime() + 20_000).toISOString(),
    message: { role: 'assistant', model: 'fixture-1', id: 'msg_r', content: [{ type: 'text', text: 'Imported it.' }], stop_reason: 'end_turn' } });
  assert.equal(s.lastReply, 'Imported it.'); assert.equal(s.lastUserAt, before.lastUserAt, 'still your word from before');
});

test('a PR or a ticket in a message is not one you named', () => {
  const s = loaded(B.id);
  fold(s, lines({ body: 'Review https://github.com/acme/storefront/pull/482 for ACME-12 please.' }).delivered[0]);
  assert.deepEqual(s.prs, []); assert.deepEqual(s.tickets, []);
});

test('queued while the chat works, then delivered: the queue empties, one row', () => {
  const s = loaded(B.id), L = lines();
  s.alive = true;
  assert.equal(fold(s, L.queued[0]), true, 'enqueued');
  assert.equal(s.peerQueue.length, 1);
  let sum = summary(s);
  assert.equal(sum.peerQueue.length, 1); assert.equal(sum.peerQueue[0].name, 'storefront-1'); assert.equal(sum.peerQueue[0].mode, 'prompting');
  assert.match(sum.peerQueue[0].text, /retry module/); assert.equal(sum.peerIn.queued, true);
  s.alive = false; assert.equal(summary(s).peerQueue, null, 'a chat with no claude takes nothing in: no queue shown'); s.alive = true;
  assert.equal(fold(s, L.queued[1]), false, 'a dequeue says nothing of its own');
  fold(s, L.delivered[0]);
  sum = summary(s);
  assert.equal(sum.peerQueue, null, 'taken off the queue'); assert.equal(sum.peerIn.queued, false);
  assert.equal(s.entries.filter(e => e.kind === 'peer').length, 1);
  assert.equal(fold(s, L.absorbed[0]), false, 'the same message (its msg_id) again: once');
});

test('absorbed mid-turn: a queued_command attachment is the delivery; a remove takes a queued one off', () => {
  const s = loaded(B.id), L = lines();
  s.alive = true;
  fold(s, L.queued[0]);
  assert.equal(fold(s, { ...L.queued[0], operation: 'remove', reason: 'absorbed_mid_turn' }), true);
  assert.equal(s.peerQueue.length, 0);
  assert.equal(fold(s, L.absorbed[0]), true);
  assert.equal(s.entries.at(-1).kind, 'peer'); assert.equal(s.entries.at(-1).name, 'storefront-1');
  assert.equal(s.lastUserAt, null);
});

test('what is not another chat\'s message: its own agent reporting back, other peers, a sidechain, a malformed origin', () => {
  const s = loaded(B.id), L = lines(), d = L.delivered[0];
  const agent = { ...d, message: { role: 'user', content: '<agent-message from="areview">done</agent-message>' }, origin: { kind: 'peer', from: 'a1b2c3', name: 'review', body: 'done', senderTaskId: 't1', handback: true } };
  assert.equal(fold(s, agent), false, 'a sub-agent\'s handback: its own, not a chat');
  assert.equal(fold(s, { ...d, message: { role: 'user', content: 'plain' }, origin: { kind: 'peer', name: 'x' } }), false, 'no envelope, no pid, no mode: not a chat\'s');
  assert.equal(fold(s, { ...d, origin: 'peer' }), false, 'an origin that is no object');
  assert.equal(fold(s, { ...d, isSidechain: true }), false);
  assert.equal(fold(s, { ...L.absorbed[0], isSidechain: true }), false);
  assert.equal(s.entries.length, 0);
  // unknown fields are let be; a missing body is the envelope's; the name's entities decoded
  const odd = lines({ fromName: 'web "beta" & co', body: 'two\nlines' }).delivered[0];
  fold(s, { ...odd, someNewKey: { deep: [1] }, origin: { ...odd.origin, body: undefined, name: undefined, verifiedPeerPid: 'nope', future: true } });
  const e = s.entries.at(-1);
  assert.equal(e.text, 'two\nlines'); assert.equal(e.name, 'web "beta" & co'); assert.equal(e.pid, null); assert.equal(e.verified, false);
});

test('the sending side: a SendMessage that reached a chat keeps its msg_id; one to a teammate does not', () => {
  const s = loaded(A.id), L = lines();
  for (const l of L.sent) fold(s, l);
  const call = s.entries.find(e => e.kind === 'tool_use');
  assert.equal(call.name, 'SendMessage'); assert.equal(call.to, 'billing-api'); assert.equal(call.msgId, L.delivered[0].origin.msg_id);
  const t = loaded('c3c3c3c3-0000-4000-8000-000000000003'), M = lines();
  fold(t, M.sent[0]); fold(t, { ...M.sent[1], toolUseResult: { success: true, message: 'sent', msg_id: 'x', routing: { sender: 'team-lead', target: '@review' } } });
  const tc = t.entries.find(e => e.kind === 'tool_use');
  assert.equal(tc.team, true); assert.equal(tc.msgId, undefined);
  assert.equal(s.lastUserAt, null, 'sending is Claude\'s doing');
});

/** A process that stands for a chat's claude: the server only asks whether the pid is there (and when it started). */
const standIn = () => spawn('sleep', ['120'], { stdio: 'ignore' });

test('who sent it, through the registry: the verified pid, the name, the msg_id — and where a SendMessage went', { timeout: 40_000 }, async () => {
  const pa = standIn(), pb = standIn();
  const fx = makeFixture(tmpDir('peix-fx-'), [
    { ...A, title: 'Retry declined payments', prompt: 'retry the declined payments', reply: 'Done; telling billing.', at: yesterday(), live: { pid: pa.pid, name: 'storefront-1' } },
    { ...B, title: 'Queue for invoice webhooks', prompt: 'queue the invoice webhooks', reply: 'Queued.', at: yesterday(), live: { pid: pb.pid, name: 'billing-api' } },
  ]);
  const [a, b] = fx.chats, L = lines({ pid: pa.pid, at: new Date() });
  const add = (c, ls) => appendFileSync(c.file, ls.map(l => JSON.stringify(l)).join('\n') + '\n');
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    const chat = async id => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);
    await waitFor(async () => (await chat(b.id))?.alive && (await chat(a.id))?.alive, { what: 'both chats alive' });
    const yours = (await chat(b.id)).lastUserAt;
    // queued first: the envelope's address names the sender's socket, hence its pid
    add(b, [L.queued[0]]);
    const q = await waitFor(async () => (await chat(b.id))?.peerQueue, { what: 'the queued message' });
    assert.equal(q[0].id, a.id, 'the queued message names the chat that sent it');
    assert.equal((await chat(b.id)).peerIn.queued, true);
    add(a, L.sent); add(b, L.delivered);
    const mark = await waitFor(async () => { const s = await chat(b.id); return s?.peerIn && !s.peerIn.queued && s.peerIn; }, { what: 'the delivered message' });
    assert.equal(mark.id, a.id); assert.equal((await chat(b.id)).peerQueue, null);
    const got = (await srv.api(`api/sessions/${b.id}/messages`)).body.entries.find(e => e.kind === 'peer');
    assert.equal(got.fromId, a.id, 'the row links to the sender');
    const sent = (await srv.api(`api/sessions/${a.id}/messages`)).body.entries.find(e => e.name === 'SendMessage');
    assert.equal(sent.toId, b.id, 'the SendMessage links to where it went');
    const bs = await chat(b.id);
    assert.equal(bs.lastPrompt, 'queue the invoice webhooks', 'still your prompt'); assert.equal(bs.lastUserAt, yours, 'and your last word where it was');
    // a pid that is no chat's any more, no msg_id: the name it sent under
    const N = lines({ pid: 999_999, at: new Date(Date.now() + 1000) }), o = N.delivered[0];
    add(b, [{ ...o, origin: { ...o.origin, msg_id: undefined } }]);
    await srv.api(`api/sessions/${b.id}/messages`);
    const rows = await waitFor(async () => { const r = (await srv.api(`api/sessions/${b.id}/messages`)).body.entries.filter(e => e.kind === 'peer'); return r.length === 2 && r; }, { what: 'the second message' });
    assert.equal(rows[1].fromId, a.id, 'found by the name the registry gave the sender');
  } finally { await srv.stop(); pa.kill(); pb.kill(); }
});

test('with neither chat running, the msg_id still ties the two ends together', { timeout: 30_000 }, async () => {
  const L = lines({ pid: 999_998 });
  const fx = makeFixture(tmpDir('peix-fx-'), [
    { ...A, title: 'Retry declined payments', prompt: 'retry them', reply: 'Done.', at: yesterday(), lines: () => L.sent },
    { ...B, title: 'Queue for invoice webhooks', prompt: 'queue them', reply: 'Queued.', at: yesterday(), lines: () => [...L.queued, ...L.delivered] },
  ]);
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    const b = (await srv.api(`api/sessions/${B.id}/messages`)).body;
    assert.equal(b.entries.find(e => e.kind === 'peer').fromId, A.id);
    assert.equal(b.session.peerIn.id, A.id); assert.equal(b.session.peerQueue, null);
    const a = (await srv.api(`api/sessions/${A.id}/messages`)).body;
    assert.equal(a.entries.find(e => e.name === 'SendMessage').toId, B.id);
  } finally { await srv.stop(); }
});
