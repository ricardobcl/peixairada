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

process.env.STATE_FILE = join(tmp, 'state.json');
process.env.CLAUDE_DIR = join(tmp, 'claude');
process.env.USAGE = 'off';
process.env.NOTIFY = 'off';
const { wakeWhy, newSession, doneMarks } = await import('../server.mjs');

/** The `alert` events of the stream, once its snapshot is in. */
async function alerts(srv) {
  const res = await fetch(`${srv.url}events?key=${srv.key}`);

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
  return {
    got,
    of: (id, kind) => got.filter(alert => alert.sessionId === id && (!kind || alert.kind === kind)),
    stop: () => reader.cancel().catch(() => {}),
  };
}

const append = (chat, lines) => appendFileSync(chat.file, `${lines.map(line => JSON.stringify(line)).join('\n')}\n`);
const said = (chat, text) => append(chat, replyLines({ id: chat.id, cwd: chat.cwd, text, at: new Date() }));

/** A word of yours, now. */
const typed = (chat, text) =>
  append(chat, [
    {
      isSidechain: false,
      userType: 'external',
      entrypoint: 'cli',
      cwd: chat.cwd,
      sessionId: chat.id,
      version: 'fixture',
      gitBranch: 'main',
      parentUuid: null,
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text }] },
      uuid: randomUUID(),
      timestamp: new Date().toISOString(),
    },
  ]);

const summaryOf = async (srv, id) => (await srv.api('api/sessions')).body.sessions.find(session => session.id === id);
const snooze = (srv, id, body) => srv.post(`api/sessions/${id}/snooze`, body);

test('wakeWhy: what ends a snooze, and how', () => {
  const at = '2026-11-24T10:00:00.000Z';
  const now = Date.parse('2026-11-24T11:00:00.000Z');
  const after = '2026-11-24T10:30:00.000Z';
  const before = '2026-11-24T09:00:00.000Z';

  const url = 'https://github.com/acme/widgets/pull/12';

  const chat = () => {
    const made = newSession(randomUUID(), '/x/a.jsonl');

    made.alive = true;
    made.live = { pid: 1, status: 'idle', startedAt: 0 };
    made.status = 'idle';
    made.lastActivity = before;
    return made;
  };

  let session = chat();

  assert.equal(wakeWhy(session, { at, until: '2026-11-24T12:00:00.000Z' }, now), null, 'its time not come');
  assert.deepEqual(wakeWhy(session, { at, until: after }, now), { kind: 'time', why: 'its time came' });
  session.lastUserAt = before;
  assert.equal(wakeWhy(session, { at, until: '2026-11-24T12:00:00.000Z' }, now), null, 'a word of yours from before');
  session.lastUserAt = after;

  assert.deepEqual(
    wakeWhy(session, { at, until: after }, now),
    { quiet: true },
    'your word since: no mark, even past its time',
  );

  session = chat();
  session.live.status = 'waiting';
  session.live.waitingFor = 'input needed';

  assert.deepEqual(
    wakeWhy(session, { at, until: '2026-11-24T12:00:00.000Z' }, now),
    { quiet: true },
    'a question: its own alert speaks',
  );

  session = chat();
  doneMarks[session.id] = after;

  assert.deepEqual(
    wakeWhy(session, { at, until: '2026-11-24T12:00:00.000Z' }, now),
    { quiet: true },
    'ticked done since',
  );

  doneMarks[session.id] = before;

  assert.equal(
    wakeWhy(session, { at, until: '2026-11-24T12:00:00.000Z' }, now),
    null,
    'a tick from before holds nothing',
  );

  delete doneMarks[session.id];

  session = chat();
  const pr = { url, label: 'widgets#12', state: 'open', checks: 'pending', turn: { you: false, movedAt: before } };

  session.prs = [pr];
  const onPr = { at, on: 'pr', pr: url };

  assert.equal(wakeWhy(session, onPr, now), null, 'their move');
  pr.turn = { you: true, movedAt: before };
  assert.equal(wakeWhy(session, onPr, now), null, 'your move from before the snooze');
  pr.turn = { you: true, movedAt: after };
  assert.deepEqual(wakeWhy(session, onPr, now), { kind: 'pr', why: 'widgets#12 came round to you' });
  pr.turn = null;
  pr.state = 'merged';
  assert.deepEqual(wakeWhy(session, onPr, now), { kind: 'pr', why: 'widgets#12 was merged' });
  pr.state = 'open';
  const onCi = { at, on: 'ci', pr: url };

  assert.equal(wakeWhy(session, onCi, now), null, 'its checks running');

  for (const [checks, why] of [
    ['pass', 'its checks passed'],
    ['fail', 'its checks failed'],
    [null, 'its checks finished'],
  ]) {
    pr.checks = checks;
    assert.deepEqual(wakeWhy(session, onCi, now), { kind: 'ci', why });
  }

  session.prs = [];
  assert.deepEqual(wakeWhy(session, onPr, now), { kind: 'pr', why: 'its PR left the chat' });
  assert.deepEqual(wakeWhy(session, onCi, now), { kind: 'ci', why: 'its checks finished' });

  session = chat();
  session.status = 'working';
  session.live.status = 'busy';
  assert.equal(wakeWhy(session, { at, on: 'reply' }, now), null, 'still at work');
  session.status = 'idle';
  session.live.status = 'idle';
  assert.deepEqual(wakeWhy(session, { at, on: 'reply' }, now), { kind: 'reply', why: 'Claude replied' });
  session.alive = false;

  assert.deepEqual(
    wakeWhy(session, { at, on: 'reply' }, now),
    { kind: 'ended', why: 'its claude ended' },
    'its claude gone: no reply to speak for it',
  );

  session = chat();
  session.tasks = new Map([['bg1', { kind: 'monitor', what: 'the deploy', at: new Date().toISOString() }]]);
  assert.equal(wakeWhy(session, { at, on: 'mon' }, now), null, 'its monitor runs');
  session.tasks = new Map();
  assert.deepEqual(wakeWhy(session, { at, on: 'mon' }, now), { kind: 'mon', why: 'its monitor ended' });

  assert.deepEqual(
    wakeWhy(session, { at, on: 'mon', until: after }, now),
    { kind: 'time', why: 'its time came' },
    'both: whichever first',
  );
});

test('the route takes a time ahead or an event that can come, and nothing else', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'));
  const [one] = fx.chats;

  const srv = await startTestServer({ claudeDir: fx.dir });

  try {
    assert.equal((await snooze(srv, 'no-such-chat', { until: Date.now() + 60_000 })).status, 404, 'no such chat');
    assert.equal((await snooze(srv, one.id, {})).status, 400, 'neither a time nor an event');
    assert.equal((await snooze(srv, one.id, { until: Date.now() - 1000 })).status, 400, 'a time past');

    assert.equal(
      (await snooze(srv, one.id, { until: Date.now() + 400 * 86_400_000 })).status,
      400,
      'more than a year away',
    );

    assert.equal((await snooze(srv, one.id, { until: 'soon' })).status, 400, 'not a time');
    assert.equal((await snooze(srv, one.id, { on: 'later' })).status, 400, 'no such event');
    assert.equal((await snooze(srv, one.id, { on: 'reply' })).status, 409, 'Claude is not at work in it');
    assert.equal((await snooze(srv, one.id, { on: 'mon' })).status, 409, 'no monitor runs');

    assert.equal(
      (await snooze(srv, one.id, { on: 'pr', pr: 'https://github.com/acme/other/pull/1' })).status,
      404,
      'not its PR',
    );

    assert.equal((await summaryOf(srv, one.id)).snooze, null, 'no refusal snoozed it');

    const until = new Date(Date.now() + 3_600_000).toISOString();
    const response = await snooze(srv, one.id, { until });

    assert.equal(response.status, 200);
    assert.deepEqual([response.body.snooze.until, typeof response.body.snooze.at], [until, 'string']);
    assert.deepEqual((await summaryOf(srv, one.id)).snooze, response.body.snooze, 'on the summary');

    assert.deepEqual(
      JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).snoozed[one.id],
      response.body.snooze,
      'in the state file',
    );

    await srv.restart();
    assert.deepEqual((await summaryOf(srv, one.id)).snooze, response.body.snooze, 'after a restart');
  } finally {
    await srv.stop();
  }
});

test('a chat asking you is not snoozed', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'));
  const chat = fx.chats[1];

  writeFileSync(
    join(fx.dir, 'sessions', `${process.pid}.json`),
    JSON.stringify({
      pid: process.pid,
      sessionId: chat.id,
      cwd: chat.cwd,
      startedAt: Date.now(),
      version: 'fixture',
      kind: 'interactive',
      entrypoint: 'cli',
      status: 'waiting',
      waitingFor: 'input needed',
      statusUpdatedAt: Date.now(),
    }),
  );

  const srv = await startTestServer({ claudeDir: fx.dir });

  try {
    await waitFor(async () => (await summaryOf(srv, chat.id))?.status === 'needs-input', { what: 'the chat asking' });
    const response = await snooze(srv, chat.id, { until: Date.now() + 60_000 });

    assert.equal(response.status, 409);
    assert.match(response.body.error, /question wakes it/);
  } finally {
    await srv.stop();
  }
});

test(
  'its time come, it is back by itself: marked, first in the list, one back alert — quiet when muted',
  { timeout: 40_000 },
  async () => {
    const fx = defaultFixture(tmpDir('peix-fx-'));
    const [one, two] = fx.chats; // one is the older

    const srv = await startTestServer({ claudeDir: fx.dir });
    let alertFeed;

    try {
      assert.equal((await srv.api('api/sessions')).body.sessions[0].id, two.id, 'the newer first, to begin with');
      alertFeed = await alerts(srv);
      await snooze(srv, one.id, { until: Date.now() + 1500 });
      await waitFor(() => alertFeed.of(one.id, 'back').length, { what: 'the back alert' });
      const back = alertFeed.of(one.id, 'back')[0];

      assert.deepEqual(
        [back.heading, back.snippet, back.quiet, back.muted, back.snoozed],
        ['Back · repo-a', 'its time came', false, false, undefined],
      );

      const sum = await summaryOf(srv, one.id);

      assert.deepEqual([sum.snooze, sum.wokeWhy, typeof sum.wokeAt], [null, 'its time came', 'string']);
      assert.equal((await srv.api('api/sessions')).body.sessions[0].id, one.id, 'back at the top: its wake is a word');

      assert.equal(
        JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).woke[one.id].why,
        'its time came',
        'the mark is kept',
      );

      await srv.post(`api/sessions/${two.id}/mute`, { on: true });
      await snooze(srv, two.id, { until: Date.now() + 800 });
      await waitFor(() => alertFeed.of(two.id, 'back').length, { what: "the muted chat's back alert" });
      assert.deepEqual([alertFeed.of(two.id, 'back')[0].quiet, alertFeed.of(two.id, 'back')[0].muted], [true, true]);
      await sleep(600);
      assert.equal(alertFeed.got.filter(alert => alert.kind === 'back').length, 2, 'once each');
    } finally {
      alertFeed?.stop();
      await srv.stop();
    }
  },
);

test(
  'your word, an undo or a tick end it with no mark and no alert; a reply meanwhile goes out quiet',
  { timeout: 40_000 },
  async () => {
    const fx = defaultFixture(tmpDir('peix-fx-'));
    const [one, two] = fx.chats;

    const srv = await startTestServer({ claudeDir: fx.dir });
    let alertFeed;

    try {
      alertFeed = await alerts(srv);
      const later = () => Date.now() + 3_600_000;

      await snooze(srv, one.id, { until: later() });
      said(one, 'a reply while it is away');
      await waitFor(() => alertFeed.of(one.id, 'reply').length, { what: 'the reply alert' });

      assert.deepEqual(
        [alertFeed.of(one.id, 'reply')[0].quiet, alertFeed.of(one.id, 'reply')[0].snoozed],
        [true, true],
        'it calls you on nothing',
      );

      assert.ok((await summaryOf(srv, one.id)).snooze, 'and a reply is not what it waits for');

      typed(one, 'back to this one');
      await waitFor(async () => (await summaryOf(srv, one.id)).snooze === null, { what: 'your word to end it' });
      assert.equal((await summaryOf(srv, one.id)).wokeAt, null, 'no mark');

      await snooze(srv, two.id, { until: later() });
      assert.deepEqual((await snooze(srv, two.id, { undo: true })).body, { ok: true, snooze: null });
      assert.equal((await summaryOf(srv, two.id)).wokeAt, null, 'an undo leaves no mark');

      await snooze(srv, two.id, { until: later() });
      await srv.post(`api/sessions/${two.id}/done`, { done: true });
      assert.equal((await summaryOf(srv, two.id)).snooze, null, 'a tick ends it');

      assert.equal(
        JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).snoozed[two.id],
        undefined,
        'gone from the state file',
      );

      await sleep(600);
      assert.equal(alertFeed.got.filter(alert => alert.kind === 'back').length, 0, 'no back alert for any of them');
    } finally {
      alertFeed?.stop();
      await srv.stop();
    }
  },
);

test(
  "snoozed till Claude replies: the reply wakes it, said by the reply's own alert alone",
  { timeout: 40_000 },
  async () => {
    const cwd = '/Users/test/repo-w';

    const fx = makeFixture(tmpDir('peix-fx-'), [
      {
        cwd,
        prompt: 'deploy it',
        reply: 'on it',
        at: new Date(Date.now() - 120_000),
        live: { pid: process.pid, status: 'busy' },
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'sleep 30' } }),
      },
    ]);

    const chat = fx.chats[0];
    const srv = await startTestServer({ claudeDir: fx.dir });
    let alertFeed;

    try {
      await waitFor(async () => (await summaryOf(srv, chat.id))?.status === 'working', { what: 'the chat at work' });
      alertFeed = await alerts(srv);
      const response = await snooze(srv, chat.id, { on: 'reply' });

      assert.deepEqual([response.status, response.body.snooze?.on], [200, 'reply']);
      said(chat, 'deployed');
      await waitFor(() => alertFeed.of(chat.id, 'reply').length, { what: 'the reply alert' });
      const reply = alertFeed.of(chat.id, 'reply')[0];

      assert.deepEqual([reply.quiet, reply.snoozed], [false, undefined], 'loud: the snooze was gone before it went');
      const sum = await summaryOf(srv, chat.id);

      assert.deepEqual([sum.snooze, sum.wokeWhy], [null, 'Claude replied']);
      await sleep(600);

      assert.deepEqual(
        alertFeed.of(chat.id).map(alert => alert.kind),
        ['reply'],
        'no back alert besides',
      );
    } finally {
      alertFeed?.stop();
      await srv.stop();
    }
  },
);
