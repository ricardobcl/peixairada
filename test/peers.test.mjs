// Chats that talk (2026-10-31): a message another chat sent this one — delivered, absorbed mid-turn, or still queued —
// read off the transcript in the shapes Claude Code writes (scripts/fixture.mjs's peerLines), its sender found, and
// never counted as a word of yours. The folding without a server; who sent what through one, with a registry.
import './env.mjs'; // first: server.mjs reads where its state lives as it is imported
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { chatLines, makeFixture, peerLines, yesterday } from '../scripts/fixture.mjs';
import { fold, newSession, summary } from '../server.mjs';

const SENDER = { id: 'a1a1a1a1-0000-4000-8000-000000000001', cwd: '/tmp/acme/storefront' };
const RECEIVER = { id: 'b2b2b2b2-0000-4000-8000-000000000002', cwd: '/tmp/acme/billing-api' };

const at = new Date(Date.UTC(2026, 9, 31, 12, 0, 0));

const lines = (overrides = {}) =>
  peerLines({
    from: SENDER,
    to: RECEIVER,
    fromName: 'storefront-1',
    toName: 'billing-api',
    pid: 4242,
    body: 'The retry module is merged — import it from `@acme/payments`.',
    at,
    ...overrides,
  });

const loaded = id => {
  const session = newSession(id, `/x/${id}.jsonl`);

  session.loaded = true;
  return session;
};

test('a message delivered from another chat is a row of its own, and no word of yours', () => {
  const session = loaded(RECEIVER.id);
  const messages = lines();

  for (const line of chatLines({
    id: RECEIVER.id,
    cwd: RECEIVER.cwd,
    prompt: 'set up the invoice webhooks',
    reply: 'Queued them.',
    at,
  })) {
    fold(session, line);
  }

  const before = {
    lastUserAt: session.lastUserAt,
    lastPrompt: session.lastPrompt,
    lastActivity: session.lastActivity,
    lastReplyAt: session.lastReplyAt,
    status: session.status,
    turnStart: session.turnStart,
  };

  assert.equal(fold(session, messages.delivered[0]), true, 'the summary changed: a message came');
  const entry = session.entries.at(-1);

  assert.equal(entry.kind, 'peer');
  assert.equal(entry.role, 'peer');
  assert.equal(entry.name, 'storefront-1');
  assert.equal(entry.mode, 'prompting');
  assert.equal(entry.pid, 4242);
  assert.equal(entry.verified, true);

  assert.equal(
    entry.text,
    'The retry module is merged — import it from `@acme/payments`.',
    "the body, not Claude Code's framing around it",
  );

  assert.deepEqual(
    {
      lastUserAt: session.lastUserAt,
      lastPrompt: session.lastPrompt,
      lastActivity: session.lastActivity,
      lastReplyAt: session.lastReplyAt,
      status: session.status,
      turnStart: session.turnStart,
    },
    before,
    'no prompt, no last word, no turn, no status of yours',
  );

  const sum = summary(session);

  assert.equal(sum.lastPrompt, 'set up the invoice webhooks');
  assert.equal(sum.lastUserAt, before.lastUserAt);
  assert.equal(sum.peerIn.name, 'storefront-1');
  assert.equal(sum.peerIn.queued, false);
  assert.equal(sum.peerIn.at, messages.delivered[0].timestamp);
  assert.equal(sum.peerQueue, null, 'nothing waiting');

  // the reply to it is Claude's, and counts as Claude's
  fold(session, {
    ...messages.delivered[0],
    type: 'assistant',
    isMeta: undefined,
    origin: undefined,
    timestamp: new Date(at.getTime() + 20_000).toISOString(),
    message: {
      role: 'assistant',
      model: 'fixture-1',
      id: 'msg_r',
      content: [{ type: 'text', text: 'Imported it.' }],
      stop_reason: 'end_turn',
    },
  });

  assert.equal(session.lastReply, 'Imported it.');
  assert.equal(session.lastUserAt, before.lastUserAt, 'still your word from before');
});

test('a PR or a ticket in a message is not one you named', () => {
  const session = loaded(RECEIVER.id);

  fold(session, lines({ body: 'Review https://github.com/acme/storefront/pull/482 for ACME-12 please.' }).delivered[0]);
  assert.deepEqual(session.prs, []);
  assert.deepEqual(session.tickets, []);
});

test('queued while the chat works, then delivered: the queue empties, one row', () => {
  const session = loaded(RECEIVER.id);
  const messages = lines();

  session.alive = true;
  assert.equal(fold(session, messages.queued[0]), true, 'enqueued');
  assert.equal(session.peerQueue.length, 1);
  let sum = summary(session);

  assert.equal(sum.peerQueue.length, 1);
  assert.equal(sum.peerQueue[0].name, 'storefront-1');
  assert.equal(sum.peerQueue[0].mode, 'prompting');
  assert.match(sum.peerQueue[0].text, /retry module/);
  assert.equal(sum.peerIn.queued, true);
  session.alive = false;
  assert.equal(summary(session).peerQueue, null, 'a chat with no claude takes nothing in: no queue shown');
  session.alive = true;
  assert.equal(fold(session, messages.queued[1]), false, 'a dequeue says nothing of its own');
  fold(session, messages.delivered[0]);
  sum = summary(session);
  assert.equal(sum.peerQueue, null, 'taken off the queue');
  assert.equal(sum.peerIn.queued, false);
  assert.equal(session.entries.filter(entry => entry.kind === 'peer').length, 1);
  assert.equal(fold(session, messages.absorbed[0]), false, 'the same message (its msg_id) again: once');
});

test('absorbed mid-turn: a queued_command attachment is the delivery; a remove takes a queued one off', () => {
  const session = loaded(RECEIVER.id);
  const messages = lines();

  session.alive = true;
  fold(session, messages.queued[0]);
  assert.equal(fold(session, { ...messages.queued[0], operation: 'remove', reason: 'absorbed_mid_turn' }), true);
  assert.equal(session.peerQueue.length, 0);
  assert.equal(fold(session, messages.absorbed[0]), true);
  assert.equal(session.entries.at(-1).kind, 'peer');
  assert.equal(session.entries.at(-1).name, 'storefront-1');
  assert.equal(session.lastUserAt, null);
});

test("what is not another chat's message: its own agent reporting back, other peers, a sidechain, a malformed origin", () => {
  const session = loaded(RECEIVER.id);
  const messages = lines();
  const delivered = messages.delivered[0];

  const agent = {
    ...delivered,
    message: { role: 'user', content: '<agent-message from="areview">done</agent-message>' },
    origin: { kind: 'peer', from: 'a1b2c3', name: 'review', body: 'done', senderTaskId: 't1', handback: true },
  };

  assert.equal(fold(session, agent), false, "a sub-agent's handback: its own, not a chat");

  assert.equal(
    fold(session, { ...delivered, message: { role: 'user', content: 'plain' }, origin: { kind: 'peer', name: 'x' } }),
    false,
    "no envelope, no pid, no mode: not a chat's",
  );

  assert.equal(fold(session, { ...delivered, origin: 'peer' }), false, 'an origin that is no object');
  assert.equal(fold(session, { ...delivered, isSidechain: true }), false);
  assert.equal(fold(session, { ...messages.absorbed[0], isSidechain: true }), false);
  assert.equal(session.entries.length, 0);
  // unknown fields are let be; a missing body is the envelope's; the name's entities decoded
  const odd = lines({ fromName: 'web "beta" & co', body: 'two\nlines' }).delivered[0];

  fold(session, {
    ...odd,
    someNewKey: { deep: [1] },
    origin: { ...odd.origin, body: undefined, name: undefined, verifiedPeerPid: 'nope', future: true },
  });

  const entry = session.entries.at(-1);

  assert.equal(entry.text, 'two\nlines');
  assert.equal(entry.name, 'web "beta" & co');
  assert.equal(entry.pid, null);
  assert.equal(entry.verified, false);
});

test('the sending side: a SendMessage that reached a chat keeps its msg_id; one to a teammate does not', () => {
  const session = loaded(SENDER.id);
  const messages = lines();

  for (const line of messages.sent) fold(session, line);
  const call = session.entries.find(entry => entry.kind === 'tool_use');

  assert.equal(call.name, 'SendMessage');
  assert.equal(call.to, 'billing-api');
  assert.equal(call.msgId, messages.delivered[0].origin.msg_id);

  const teamSender = loaded('c3c3c3c3-0000-4000-8000-000000000003');
  const teamMessages = lines();

  fold(teamSender, teamMessages.sent[0]);

  fold(teamSender, {
    ...teamMessages.sent[1],
    toolUseResult: { success: true, message: 'sent', msg_id: 'x', routing: { sender: 'team-lead', target: '@review' } },
  });

  const tc = teamSender.entries.find(entry => entry.kind === 'tool_use');

  assert.equal(tc.team, true);
  assert.equal(tc.msgId, undefined);
  assert.equal(session.lastUserAt, null, "sending is Claude's doing");
});

/** A process that stands for a chat's claude: the server only asks whether the pid is there (and when it started). */
const standIn = () => spawn('sleep', ['120'], { stdio: 'ignore' });

test(
  'who sent it, through the registry: the verified pid, the name, the msg_id — and where a SendMessage went',
  { timeout: 40_000 },
  async () => {
    const pa = standIn();
    const pb = standIn();

    const fx = makeFixture(tmpDir('peix-fx-'), [
      {
        ...SENDER,
        title: 'Retry declined payments',
        prompt: 'retry the declined payments',
        reply: 'Done; telling billing.',
        at: yesterday(),
        live: { pid: pa.pid, name: 'storefront-1' },
      },
      {
        ...RECEIVER,
        title: 'Queue for invoice webhooks',
        prompt: 'queue the invoice webhooks',
        reply: 'Queued.',
        at: yesterday(),
        live: { pid: pb.pid, name: 'billing-api' },
      },
    ]);

    const [sender, receiver] = fx.chats;
    const messages = lines({ pid: pa.pid, at: new Date() });

    const add = (chat, ls) => appendFileSync(chat.file, `${ls.map(line => JSON.stringify(line)).join('\n')}\n`);
    const srv = await startTestServer({ claudeDir: fx.dir });

    try {
      const chat = async id => (await srv.api('api/sessions')).body.sessions.find(session => session.id === id);

      await waitFor(async () => (await chat(receiver.id))?.alive && (await chat(sender.id))?.alive, {
        what: 'both chats alive',
      });

      const yours = (await chat(receiver.id)).lastUserAt;

      // queued first: the envelope's address names the sender's socket, hence its pid
      add(receiver, [messages.queued[0]]);
      const queue = await waitFor(async () => (await chat(receiver.id))?.peerQueue, { what: 'the queued message' });

      assert.equal(queue[0].id, sender.id, 'the queued message names the chat that sent it');
      assert.equal((await chat(receiver.id)).peerIn.queued, true);
      add(sender, messages.sent);
      add(receiver, messages.delivered);

      const mark = await waitFor(
        async () => {
          const session = await chat(receiver.id);

          return session?.peerIn && !session.peerIn.queued && session.peerIn;
        },
        { what: 'the delivered message' },
      );

      assert.equal(mark.id, sender.id);
      assert.equal((await chat(receiver.id)).peerQueue, null);

      const got = (await srv.api(`api/sessions/${receiver.id}/messages`)).body.entries.find(
        entry => entry.kind === 'peer',
      );

      assert.equal(got.fromId, sender.id, 'the row links to the sender');

      const sent = (await srv.api(`api/sessions/${sender.id}/messages`)).body.entries.find(
        entry => entry.name === 'SendMessage',
      );

      assert.equal(sent.toId, receiver.id, 'the SendMessage links to where it went');
      const bs = await chat(receiver.id);

      assert.equal(bs.lastPrompt, 'queue the invoice webhooks', 'still your prompt');
      assert.equal(bs.lastUserAt, yours, 'and your last word where it was');

      // a pid that is no chat's any more, no msg_id: the name it sent under
      const stray = lines({ pid: 999_999, at: new Date(Date.now() + 1000) });
      const line = stray.delivered[0];

      add(receiver, [{ ...line, origin: { ...line.origin, msg_id: undefined } }]);
      await srv.api(`api/sessions/${receiver.id}/messages`);

      const rows = await waitFor(
        async () => {
          const peerEntries = (await srv.api(`api/sessions/${receiver.id}/messages`)).body.entries.filter(
            entry => entry.kind === 'peer',
          );

          return peerEntries.length === 2 && peerEntries;
        },
        { what: 'the second message' },
      );

      assert.equal(rows[1].fromId, sender.id, 'found by the name the registry gave the sender');
    } finally {
      await srv.stop();
      pa.kill();
      pb.kill();
    }
  },
);

test('with neither chat running, the msg_id still ties the two ends together', { timeout: 30_000 }, async () => {
  const messages = lines({ pid: 999_998 });

  const fx = makeFixture(tmpDir('peix-fx-'), [
    {
      ...SENDER,
      title: 'Retry declined payments',
      prompt: 'retry them',
      reply: 'Done.',
      at: yesterday(),
      lines: () => messages.sent,
    },
    {
      ...RECEIVER,
      title: 'Queue for invoice webhooks',
      prompt: 'queue them',
      reply: 'Queued.',
      at: yesterday(),
      lines: () => [...messages.queued, ...messages.delivered],
    },
  ]);

  const srv = await startTestServer({ claudeDir: fx.dir });

  try {
    const receiverLog = (await srv.api(`api/sessions/${RECEIVER.id}/messages`)).body;

    assert.equal(receiverLog.entries.find(entry => entry.kind === 'peer').fromId, SENDER.id);
    assert.equal(receiverLog.session.peerIn.id, SENDER.id);
    assert.equal(receiverLog.session.peerQueue, null);
    const senderLog = (await srv.api(`api/sessions/${SENDER.id}/messages`)).body;

    assert.equal(senderLog.entries.find(entry => entry.name === 'SendMessage').toId, RECEIVER.id);
  } finally {
    await srv.stop();
  }
});
