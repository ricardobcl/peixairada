// The transcript folder and the PR bookkeeping — pure functions of server.mjs, imported without booting it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-test-');

process.env.STATE_FILE = join(tmp, 'state.json');
process.env.CLAUDE_DIR = join(tmp, 'claude');
process.env.USAGE = 'off';
process.env.NOTIFY = 'off';
const srv = await import('../server.mjs');
const { fold, newSession, summary, notePr, prTitle, cleanPrompt, snippet, textOf } = srv;

const ts = (seconds = 0) => new Date(Date.UTC(2026, 8, 20, 12, 0, seconds)).toISOString();
// Tasks are judged against the real clock — running or not running — so their tests date from a minute ago.
const now = (seconds = 0) => new Date(Date.now() - 60_000 + seconds * 1000).toISOString();

const user = (text, extra = {}) => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'text', text }] },
  timestamp: ts(extra.i || 0),
  cwd: '/tmp/repo',
  entrypoint: 'cli',
  uuid: `u${extra.i || 0}`,
  ...extra,
});

const assistant = (blocks, stop = 'end_turn', step = 1) => ({
  type: 'assistant',
  message: { role: 'assistant', model: 'claude-opus-5', id: `msg${step}`, content: blocks, stop_reason: stop },
  timestamp: ts(step),
  cwd: '/tmp/repo',
  entrypoint: 'cli',
});

test('a prompt then a reply: working → idle, snippets, model, cwd', () => {
  const session = newSession('s1', '/x/s1.jsonl');

  assert.equal(fold(session, user('what day is it?')), true);
  assert.equal(session.status, 'working');
  assert.equal(session.lastPrompt, 'what day is it?');
  assert.equal(session.lastUserAt, ts(0));
  assert.equal(session.cwd, '/tmp/repo');
  fold(session, assistant([{ type: 'text', text: 'Saturday.' }]));
  assert.equal(session.status, 'idle');
  assert.equal(session.lastReply, 'Saturday.');
  assert.equal(session.model, 'claude-opus-5');
  assert.equal(session.lastReplyAt, ts(1));
  assert.equal(summary(session).status, 'stale'); // no live process → stale on the summary, idle underneath
  assert.equal(summary(session).rawStatus, 'idle');
});

test('tool use keeps working; a question waits on the user; the answer is the user acting', () => {
  const session = newSession('s2', '/x/s2.jsonl');

  fold(session, user('do it'));
  fold(session, assistant([{ type: 'tool_use', name: 'Bash', id: 't1', input: { command: 'ls' } }], 'tool_use'));
  assert.equal(session.status, 'working');
  fold(session, assistant([{ type: 'tool_use', name: 'AskUserQuestion', id: 't2', input: {} }], 'tool_use', 2));
  assert.equal(session.status, 'needs-input');

  fold(session, {
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: 'yes' }] },
    timestamp: ts(3),
  });

  assert.equal(session.status, 'working');
  assert.equal(session.lastUserAt, ts(3));
});

test('what is not a prompt: sidechains, meta lines, synthetic command lines, system reminders', () => {
  const session = newSession('s3', '/x/s3.jsonl');

  assert.equal(fold(session, user('hidden', { isSidechain: true })), false);
  assert.equal(fold(session, user('hidden', { isMeta: true })), false);
  assert.equal(fold(session, user('<local-command-stdout>ok</local-command-stdout>')), false);
  fold(session, user('<system-reminder>injected</system-reminder>real question'));
  assert.equal(session.lastPrompt, 'real question');
  assert.equal(cleanPrompt('  <system-reminder>x</system-reminder> hi  '), 'hi');
  assert.equal(snippet('a'.repeat(300), 10).length <= 11, true);
  assert.equal(textOf([{ type: 'text', text: 'a' }, { type: 'tool_use' }, { type: 'text', text: 'b' }]), 'a\nb');
});

test('an interrupt is you acting on the chat, and ends the turn', () => {
  const session = newSession('s4', '/x/s4.jsonl');

  fold(session, user('go'));
  fold(session, assistant([{ type: 'tool_use', name: 'Bash', id: 't', input: {} }], 'tool_use'));
  fold(session, user('[Request interrupted by user]', { i: 2 }));
  assert.equal(session.status, 'idle');
  assert.equal(session.lastUserAt, ts(2));
});

test("titles: the board title beats the user's, which beats the PR's, which beats Claude's", () => {
  const session = newSession('s5', '/x/s5.jsonl');

  fold(session, { type: 'ai-title', aiTitle: 'Claude says' });
  assert.equal(summary(session).title, 'Claude says');
  notePr(session, 'https://github.com/acme/r/pull/1', ts(0), 'user');
  srv.sessions.set('s5', session);
  // no title from gh yet → Claude's stays
  assert.equal(summary(session).title, 'Claude says');
  session.prs[0].title = 'PR one';
  session.prs[0].state = 'open';
  assert.equal(summary(session).title, 'PR one');
  fold(session, { type: 'custom-title', customTitle: 'Mine' });
  assert.equal(summary(session).title, 'Mine');
});

test("PRs: most recently mentioned first, mentions counted; the chat's own PR names it", () => {
  const session = newSession('s6', '/x/s6.jsonl');

  fold(session, user('see https://github.com/acme/r/pull/10 and https://github.com/acme/r/pull/11', { i: 0 }));

  fold(
    session,
    assistant(
      [
        {
          type: 'text',
          text: 'Also https://github.com/acme/r/pull/10 again, and https://github.com/acme/r/pull/12/files',
        },
      ],
      'end_turn',
      1,
    ),
  );

  assert.deepEqual(
    session.prs.map(pr => pr.number),
    [12, 10, 11],
  );

  assert.equal(session.prs.find(pr => pr.number === 10).count, 2);
  assert.equal(session.prs.find(pr => pr.number === 12).label, 'r#12');
  assert.equal(session.prs.find(pr => pr.number === 12).url, 'https://github.com/acme/r/pull/12'); // /files stripped
  assert.equal(prTitle(session), null); // nothing titled yet

  for (const pr of session.prs) {
    pr.title = `PR ${pr.number}`;
    pr.state = pr.number === 12 ? 'open' : 'merged';
  }

  assert.equal(prTitle(session), 'PR 10', 'the first you named, merged, over the open one Claude brought up');
  session.prs.find(pr => pr.number === 10).title = null;
  assert.equal(prTitle(session), null, "its title not in yet: none, not the next one's");
  session.prs.find(pr => pr.number === 10).title = 'PR 10';
  fold(session, { type: 'pr-link', prUrl: 'https://github.com/acme/r/pull/11', timestamp: ts(5) });
  assert.equal(session.prs[0].number, 11); // a pr-link line reorders but does not count as a mention
  assert.equal(session.prs[0].count, 1);
  assert.equal(prTitle(session), 'PR 11', 'one the chat opened or pushed to before one you named');
});

test("PRs Claude only mentioned title nothing, and the cap puts them aside before the chat's own", () => {
  const session = newSession('s7', '/x/s7.jsonl');

  fold(session, user('review https://github.com/acme/r/pull/1', { i: 0 }));
  fold(session, assistant([{ type: 'text', text: 'Related: https://github.com/acme/r/pull/2' }], 'end_turn', 1));

  for (const pr of session.prs) {
    pr.title = `PR ${pr.number}`;
    pr.state = pr.number === 1 ? 'merged' : 'open';
  }

  assert.equal(prTitle(session), 'PR 1', 'merged, it still names the chat');
  const other = newSession('s8', '/x/s8.jsonl');

  fold(other, assistant([{ type: 'text', text: 'Related: https://github.com/acme/r/pull/2' }], 'end_turn', 1));
  other.prs[0].title = 'PR 2';
  other.prs[0].state = 'open';
  assert.equal(prTitle(other), null, "a PR Claude brought up is not the chat's");

  // forty more, one at a time: the oldest heard of goes first, the one you named stays
  for (let number = 100; number < 140; number++) {
    fold(session, assistant([{ type: 'text', text: `see https://github.com/acme/r/pull/${number}` }], 'end_turn', 2));
  }

  assert.equal(session.prs.length, 40);

  assert.ok(
    session.prs.some(pr => pr.number === 1),
    "the chat's own is kept",
  );

  assert.ok(!session.prs.some(pr => pr.number === 2), 'the oldest it only heard of went');
  assert.equal(prTitle(session), 'PR 1');
  fold(session, user('and https://github.com/acme/r/pull/2 again?', { i: 9 }));
  const back = session.prs.find(pr => pr.number === 2);

  assert.deepEqual(
    [back.firstAt, back.count, back.named != null],
    [ts(1), 2, true],
    'named again, it is back as it was, first heard at its first sighting',
  );
});

test('a listing of other PRs puts none on the chat; a report on its own, or your list, does', () => {
  const pulls = (from, count) =>
    Array.from({ length: count }, (_, index) => `https://github.com/acme/r/pull/${from + index}`).join(', ');

  const session = newSession('s9', '/x/s9.jsonl');

  fold(session, user('review https://github.com/acme/r/pull/1', { i: 0 }));
  fold(session, assistant([{ type: 'text', text: `Your open PRs: ${pulls(100, 10)}` }], 'end_turn', 1));

  assert.deepEqual(
    session.prs.map(pr => pr.number),
    [1],
    'ten at once, all new: a listing, none taken',
  );

  fold(session, assistant([{ type: 'text', text: `Related: ${pulls(200, 9)}` }], 'end_turn', 2));
  assert.equal(session.prs.length, 10, 'nine is no listing');

  fold(
    session,
    assistant(
      [
        {
          type: 'text',
          text: `Where they stand: ${pulls(200, 9)} and https://github.com/acme/r/pull/1, https://github.com/acme/r/pull/300`,
        },
      ],
      'end_turn',
      3,
    ),
  );

  assert.equal(session.prs.length, 11, "eleven, most of them the chat's already: a report, the new one taken");
  assert.equal(session.prs[0].number, 300);
  fold(session, user(`these too: ${pulls(400, 12)}`, { i: 4 }));
  assert.equal(session.prs.length, 23, 'a list of yours is yours');
  fold(session, assistant([{ type: 'text', text: `Still open: ${pulls(100, 10)}` }], 'end_turn', 5));
  assert.equal(session.prs.length, 33, "listed again, they are the chat's business: a review's second report");
  assert.equal(session.prs.find(pr => pr.number === 100).firstAt, ts(1), 'first heard when they were first listed');
});

test("a gh pr create the chat ran makes what it printed the chat's own, a loop's too; words about it do not", () => {
  const session = newSession('s10', '/x/s10.jsonl');

  const call = (id, command, step) =>
    assistant([{ type: 'tool_use', name: 'Bash', id, input: { command } }], 'tool_use', step);

  const result = (id, content, step, isError = false) => ({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] },
    timestamp: ts(step),
    cwd: '/tmp/repo',
  });

  fold(session, user('open the PRs', { i: 0 }));
  fold(session, call('t1', 'for r in a b; do gh pr create -R acme/$r --fill; done', 1));
  fold(session, result('t1', 'https://github.com/acme/a/pull/7\nhttps://github.com/acme/b/pull/9', 2));
  fold(session, call('t2', 'grep -n "gh pr create" notes.md', 3));
  fold(session, result('t2', 'notes.md:3: gh pr create gave https://github.com/acme/c/pull/5', 4));
  fold(session, call('t3', 'gh pr create --fill', 5));
  fold(session, result('t3', 'failed, see https://github.com/acme/d/pull/2', 6, true));

  assert.deepEqual(
    session.prs.map(pr => [pr.label, pr.linked != null, pr.count]),
    [
      ['b#9', true, 0],
      ['a#7', true, 0],
    ],
  );

  for (const pr of session.prs) {
    pr.title = pr.label;
    pr.state = 'open';
  }

  assert.equal(prTitle(session), 'a#7', 'the first it opened names it');
});

// Work that outlives the turn: a Monitor (or a background Bash) keeps running after the reply, and the transcript
// says so — the tool_result carries the task's id, `<task-notification>` lines its events, and one with a <status>
// its end. The summary only reports what a *live* claude could still be running (see runningTasks).
test('a monitor runs from its tool result until the notification that ends it', () => {
  const session = newSession('s5', '/x/s5.jsonl');

  session.alive = true;
  session.live = { pid: 1, startedAt: Date.now() - 600_000 };

  const note = (body, step) => ({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: body }] },
    timestamp: now(step),
    cwd: '/tmp/repo',
  });

  const result = (id, text, step) => ({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text }] },
    timestamp: now(step),
    cwd: '/tmp/repo',
  });

  fold(session, user('watch the CI'));

  fold(session, {
    ...assistant(
      [
        {
          type: 'tool_use',
          name: 'Monitor',
          id: 'tm',
          input: { description: 'CI on #382', command: 'gh pr checks', timeout_ms: 1800_000 },
        },
      ],
      'tool_use',
      1,
    ),
    timestamp: now(1),
  });

  assert.deepEqual(summary(session).tasks, [], 'nothing runs until the harness has answered with a task id');
  fold(session, result('tm', 'Monitor started (task ab12cd34, expires in 30m unless the source ends first).', 2));
  fold(session, { ...assistant([{ type: 'text', text: 'watching' }], 'end_turn', 3), timestamp: now(3) });
  assert.equal(session.status, 'idle', 'the chat is ready: the turn ended');
  const [task] = summary(session).tasks;

  assert.equal(task.kind, 'monitor');
  assert.equal(task.what, 'CI on #382');
  assert.equal(task.events, 0);
  assert.equal(Date.parse(task.until) - Date.parse(task.at), 1800_000, 'it expires when the Monitor said it would');

  assert.equal(
    fold(
      session,
      note(
        '<task-notification>\n<task-id>ab12cd34</task-id>\n<summary>Monitor event</summary>\n<event>Build: pass</event>\n</task-notification>',
        4,
      ),
    ),
    true,
  );

  assert.equal(summary(session).tasks[0].events, 1, 'an event is counted, and the line is still no prompt of yours');
  assert.equal(session.lastPrompt, 'watch the CI', '…the card keeps showing what you actually said');

  fold(
    session,
    note(
      '<task-notification>\n<task-id>ab12cd34</task-id>\n<status>completed</status>\n<summary>Monitor completed</summary>\n</task-notification>',
      5,
    ),
  );

  assert.deepEqual(summary(session).tasks, [], 'a notification with a status is the end of it');
});

test('a task belongs to the claude that started it, and to no other', () => {
  const session = newSession('s6', '/x/s6.jsonl');

  session.alive = true;
  session.live = { pid: 1, startedAt: Date.now() - 600_000 };

  fold(session, {
    ...assistant(
      [
        {
          type: 'tool_use',
          name: 'Bash',
          id: 'tb',
          input: { command: 'npm test', description: 'the suite', run_in_background: true },
        },
      ],
      'tool_use',
      1,
    ),
    timestamp: now(1),
  });

  fold(session, {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tb',
          content: 'Command running in background with ID: bu7htdtrz. Output is being written to: /tmp/x.output.',
        },
      ],
    },
    timestamp: now(2),
    cwd: '/tmp/repo',
  });

  assert.deepEqual(
    summary(session).tasks.map(task => [task.kind, task.what]),
    [['bash', 'the suite']],
  );

  session.live = { pid: 2, startedAt: Date.now() }; // the chat was resumed: a new claude, and the old task died with the old one
  assert.deepEqual(summary(session).tasks, []);
  session.live = { pid: 2, startedAt: Date.now() - 600_000 };
  session.alive = false;
  assert.deepEqual(summary(session).tasks, [], 'and nothing runs in a chat with no process at all');
});

// lsof's verdict lands on the chat as it is then (2026-10-14): a re-read while it ran replaced the object it started with.
test('a background command nobody holds the output of is let go from the chat as it is now', async () => {
  const { writeFileSync } = await import('node:fs');

  process.env.LSOF_BIN = '/usr/bin/false'; // lsof's own "held by nobody": exit 1, nothing named
  const out = join(tmp, 'bg.output');

  writeFileSync(out, '');

  const task = () =>
    new Map([['bgdone1', { kind: 'bash', what: 'the build', at: now(0), until: null, events: 0, out }]]);

  const was = newSession('s-sweep', '/x/s-sweep.jsonl');

  was.alive = true;
  was.live = { pid: 1, startedAt: Date.now() - 600_000 };
  was.tasks = task();
  srv.sessions.set(was.id, was);
  const sweep = srv.sweepTasks();
  const session = newSession('s-sweep', '/x/s-sweep.jsonl');

  session.alive = true;
  session.live = was.live;
  session.tasks = task(); // read again meanwhile
  srv.sessions.set(session.id, session);
  await sweep;
  assert.equal(session.tasks.size, 0, 'the chat as it is now let it go');
  assert.ok(session.pushTimer, 'and pushed');
  assert.equal(was.pushTimer, null, 'never the object it replaced');
  clearTimeout(session.pushTimer);
  srv.sessions.delete(session.id);
});

test('a task the poll let go stays gone when the chat is read again whole (2026-10-14)', async () => {
  const { writeFileSync } = await import('node:fs');

  process.env.LSOF_BIN = '/usr/bin/false';
  const out = join(tmp, 'bg2.output');

  writeFileSync(out, '');
  const file = join(tmp, 's-gone.jsonl');

  const call = {
    ...assistant(
      [
        {
          type: 'tool_use',
          name: 'Bash',
          id: 'tg',
          input: { command: 'npm run build', description: 'the build', run_in_background: true },
        },
      ],
      'tool_use',
      1,
    ),
    timestamp: now(1),
  };

  const res = {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tg',
          content: `Command running in background with ID: bggone1. Output is being written to: ${out}.`,
        },
      ],
    },
    timestamp: now(2),
    cwd: '/tmp/repo',
  };

  writeFileSync(
    file,
    `${[user('build it', { timestamp: now(0) }), call, res].map(line => JSON.stringify(line)).join('\n')}\n`,
  );

  const session = srv.indexFile(file);

  session.alive = true;
  session.live = { pid: 1, startedAt: Date.now() - 600_000 };

  assert.deepEqual(
    summary(session).tasks.map(task => task.id),
    ['bggone1'],
  );

  await srv.sweepTasks();
  assert.deepEqual(summary(srv.sessions.get(session.id)).tasks, [], 'nobody holds its output: let go');
  const again = srv.indexFile(file, { full: true });

  assert.deepEqual(summary(again).tasks, [], 'and its first line read again does not start it again');
  clearTimeout(session.pushTimer);
  clearTimeout(again.pushTimer);
  srv.sessions.delete(session.id);
});

test('the question on the card is the one still waiting for an answer', () => {
  const session = newSession('s7', '/x/s7.jsonl');

  session.alive = true;
  session.live = { pid: 1, startedAt: Date.now() - 600_000 };
  fold(session, user('set up the database'));

  fold(
    session,
    assistant(
      [
        {
          type: 'tool_use',
          name: 'AskUserQuestion',
          id: 'tq',
          input: { questions: [{ question: 'Which database?', options: [{ label: 'Postgres' }, { label: 'MySQL' }] }] },
        },
      ],
      'tool_use',
      1,
    ),
  );

  assert.deepEqual(summary(session).ask, {
    tool: 'AskUserQuestion',
    text: 'Which database?',
    options: 2,
    labels: ['Postgres', 'MySQL'],
  });

  fold(session, {
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tq', content: 'Postgres' }] },
    timestamp: ts(2),
    cwd: '/tmp/repo',
  });

  assert.equal(summary(session).ask, null, 'answered: the card has nothing to ask you');
  assert.equal(session.status, 'working');

  // options that are no list (2026-10-14): a question with no answers to offer, not a throw out of the fold
  fold(
    session,
    assistant(
      [
        {
          type: 'tool_use',
          name: 'AskUserQuestion',
          id: 'tq2',
          input: { questions: [{ question: 'Which one?', options: '[{"label":"a"}]' }] },
        },
      ],
      'tool_use',
      3,
    ),
  );

  assert.deepEqual(summary(session).ask, { tool: 'AskUserQuestion', text: 'Which one?', options: 0, labels: [] });
});

// The registry is Claude Code's own word on whether it is blocked on you (2026-09-22): the transcript line that asks
// is written *with* its answer, and a permission prompt never reaches the transcript at all — so a chat whose
// transcript reads as work in flight is asking the moment its process says `status: "waiting"`.
test('a process that says it is waiting is asking, whatever the transcript reads', () => {
  const session = newSession('s8', '/x/s8.jsonl');

  session.alive = true;
  session.live = { pid: 1, startedAt: Date.now() - 600_000, status: 'busy' };
  fold(session, user('clean up the branches'));

  fold(
    session,
    assistant([{ type: 'tool_use', name: 'Bash', id: 'tb', input: { command: 'git branch -D old' } }], 'tool_use', 1),
  );

  assert.equal(summary(session).status, 'working', 'busy, and a tool call in flight: work');
  session.live = { ...session.live, status: 'waiting', waitingFor: 'permission prompt' };

  assert.equal(
    summary(session).status,
    'needs-input',
    'the prompt is up: asking, though the transcript never heard of it',
  );

  assert.deepEqual(
    summary(session).ask,
    { tool: null, text: null, options: 0, waitingFor: 'permission prompt' },
    'and the card says what it waits on',
  );

  session.agentsRunning = 2;
  assert.equal(summary(session).status, 'needs-input', 'a question beats the agents at work');
  session.agentsRunning = 0;
  session.live = { ...session.live, status: 'busy', waitingFor: undefined };
  assert.equal(summary(session).status, 'working', 'answered: back to work');
  assert.equal(summary(session).ask, null);
});

test('the registry is the word on asking when it says anything; the transcript is only the fallback', () => {
  const session = newSession('s9', '/x/s9.jsonl');

  session.alive = true;
  session.live = { pid: 1, startedAt: Date.now() - 600_000 };
  fold(session, user('set up the database'));

  fold(
    session,
    assistant(
      [
        {
          type: 'tool_use',
          name: 'AskUserQuestion',
          id: 'tq',
          input: { questions: [{ question: 'Which database?', options: [{ label: 'Postgres' }, { label: 'MySQL' }] }] },
        },
      ],
      'tool_use',
      1,
    ),
  );

  assert.equal(
    summary(session).status,
    'needs-input',
    'a claude that reports no status: the pending question in the transcript is the word',
  );

  session.live = { ...session.live, status: 'waiting', waitingFor: 'permission prompt' };

  assert.deepEqual(
    summary(session).ask,
    { tool: 'AskUserQuestion', text: 'Which database?', options: 2, labels: ['Postgres', 'MySQL'] },
    'both agree: the transcript has the question itself',
  );

  session.live = { ...session.live, status: 'busy', waitingFor: undefined };
  assert.equal(summary(session).status, 'working', 'the process says it is past the question: it is');
  session.live = { ...session.live, status: 'idle' };
  assert.equal(summary(session).status, 'idle');
  session.live = { ...session.live, status: 'idle' };
  session.rivals = [{ pid: 2, startedAt: Date.now(), status: 'waiting', waitingFor: 'input needed' }];
  assert.equal(summary(session).status, 'needs-input', 'any live process on the chat that waits is the chat waiting');
  session.rivals = [{ pid: 2, startedAt: Date.now(), status: 'waiting', waitingFor: 'dialog open' }];
  assert.equal(summary(session).status, 'idle', 'a dialog you opened yourself (/model, /config) is not a question');
  session.alive = false;
  assert.equal(summary(session).status, 'stale', 'and nothing waits on a chat with no process');
});

test('a turn the transcript never closes ends when the process says idle — /compact (2026-09-29)', () => {
  const session = newSession('s10', '/x/s10.jsonl');

  session.alive = true;

  session.live = {
    pid: 1,
    startedAt: Date.now() - 600_000,
    status: 'busy',
    statusAt: Date.parse('2026-09-28T22:28:45.800Z'),
  };

  // Claude Code 2.1.283: the typed command as a plain prompt, then — compacted — the boundary, the summary and the
  // command's own tagged lines, and no assistant line at all
  fold(session, {
    type: 'user',
    message: { role: 'user', content: '/compact' },
    timestamp: '2026-09-28T22:28:45.706Z',
  });

  assert.equal(summary(session).status, 'working', 'compacting: clauding, as the process says');

  fold(session, {
    type: 'system',
    subtype: 'compact_boundary',
    content: 'Conversation compacted',
    timestamp: '2026-09-28T22:30:14.325Z',
  });

  fold(session, {
    type: 'user',
    isCompactSummary: true,
    message: { role: 'user', content: 'This session is being continued…' },
    timestamp: '2026-09-28T22:30:14.285Z',
  });

  fold(session, {
    type: 'user',
    message: { role: 'user', content: '<command-name>/compact</command-name>' },
    timestamp: '2026-09-28T22:28:45.712Z',
  });

  fold(session, {
    type: 'user',
    message: { role: 'user', content: '<local-command-stdout>Compacted</local-command-stdout>' },
    timestamp: '2026-09-28T22:30:14.424Z',
  });

  assert.equal(session.status, 'idle', 'the boundary after the /compact you typed ends its turn (2026-10-14)');
  assert.equal(session.turnStart, null);
  session.status = 'working';
  session.turnStart = '2026-09-28T22:28:45.706Z'; // …and before that, the transcript alone never said it was over
  session.live = { ...session.live, status: 'idle', statusAt: Date.parse('2026-09-28T22:30:14.500Z') };
  assert.equal(summary(session).status, 'idle', 'the process went idle after the turn began: done');
  session.status = 'idle';
  session.turnStart = null;
  // a prompt the transcript has before the registry has caught up: the idle is the last turn's, and it is clauding
  fold(session, user('and now the tests', { timestamp: '2026-09-28T22:31:00.000Z' }));
  assert.equal(summary(session).status, 'working', 'an idle older than the prompt is the turn before');
  assert.equal(session.turnStart, '2026-09-28T22:31:00.000Z', "its own turn, not the /compact's");
  session.live = { ...session.live, statusAt: undefined };
  assert.equal(summary(session).status, 'working', 'a claude that says nothing of when: the transcript stands');
});

test('a turn that ran out of tokens or was refused has ended; one cut off mid tool call has not', () => {
  const session = srv.newSession('t-ends', null);

  const say = (stop_reason, content = [{ type: 'text', text: 'partial answer' }]) =>
    srv.fold(session, {
      type: 'assistant',
      timestamp: '2026-10-03T10:00:00Z',
      message: { role: 'assistant', stop_reason, content },
    });

  srv.fold(session, { type: 'user', timestamp: '2026-10-03T09:59:00Z', message: { role: 'user', content: 'go' } });
  say('max_tokens');
  assert.equal(session.status, 'idle', 'max_tokens');
  srv.fold(session, { type: 'user', timestamp: '2026-10-03T10:01:00Z', message: { role: 'user', content: 'again' } });
  say('refusal');
  assert.equal(session.status, 'idle', 'refusal');

  srv.fold(session, {
    type: 'user',
    timestamp: '2026-10-03T10:02:00Z',
    message: { role: 'user', content: 'and again' },
  });

  say('max_tokens', [{ type: 'tool_use', id: 'x', name: 'Write', input: {} }]);
  assert.equal(session.status, 'working', 'a tool call cut short goes on');
});

test('a tool call is summed up by what it was given: a notebook by its path, several edits by their file (2026-10-14)', () => {
  const { summarizeToolInput } = srv;

  assert.equal(
    summarizeToolInput('NotebookEdit', { notebook_path: '/tmp/repo/a.ipynb', cell_id: 'c1', new_source: 'x = 1' }),
    '/tmp/repo/a.ipynb',
  );

  assert.equal(
    summarizeToolInput('MultiEdit', { file_path: '/tmp/repo/b.js', edits: [{ old_string: 'a', new_string: 'b' }] }),
    '/tmp/repo/b.js',
  );

  assert.equal(
    summarizeToolInput('Edit', { file_path: '/tmp/repo/c.js', old_string: 'a', new_string: 'b' }),
    '/tmp/repo/c.js',
  );
});

test('a snippet never ends in half an emoji', () => {
  const text = srv.snippet(`${'x'.repeat(238)}😀 and more`, 240);

  assert.ok(text.isWellFormed(), JSON.stringify(text.slice(-4)));
  assert.ok(text.endsWith('…'));
});

test("a card's snippet is markdown as a sentence: links, headings, items, tables and GitHub URLs (2026-10-12)", () => {
  const { plain } = srv;

  assert.equal(
    plain('[Snapshot report](https://claude.ai/code/artifact/3f9c1e27-58aa-4c0b-9d1e-7b2f0c4a91d3) is up.'),
    'Snapshot report is up.',
  );

  assert.equal(
    plain('## What changed\n- Rebased onto `main`\n- **Updated** the goldens'),
    'What changed\n· Rebased onto `main`\n· Updated the goldens',
  );

  assert.equal(
    plain('review https://github.com/acme/storefront/pull/479/files and acme/storefront#12'),
    'review storefront#479 and acme/storefront#12',
  );

  assert.equal(
    plain('see https://example.com/a/very-long-segment-that-goes-on-and-on/x'),
    'see example.com/a/very-long-se…/x',
  );

  assert.equal(plain('| PR | Finding |\n|---|---|\n| #1 | a |'), 'PR · Finding\n\n#1 · a');
  assert.equal(plain('> quoted\n```js\nconst a = 1;\n```'), 'quoted\n\nconst a = 1;\n');
  assert.equal(plain('a * b * c and snake_case_name stay'), 'a * b * c and snake_case_name stay');
  assert.equal(plain('an *emphasis* here'), 'an emphasis here');

  assert.equal(
    plain('|:-:|---|\n---\n- - -\n|-|'),
    '\n\n· - -\n-',
    'a rule is two dashes running, in a line of nothing else',
  );

  const t0 = performance.now();

  plain(`${'-'.repeat(1999)}x\n${'| -'.repeat(600)}|x`);

  assert.ok(
    performance.now() - t0 < 50,
    `a long run of dashes is read in linear time (2026-10-14): ${Math.round(performance.now() - t0)} ms`,
  );

  const session = newSession('md', '/x/md.jsonl');

  fold(session, user('review https://github.com/acme/widgets/pull/7'));
  assert.equal(session.lastPrompt, 'review widgets#7');
  fold(session, assistant([{ type: 'text', text: '## Done\n- [the doc](https://x.y/z) is up' }]));
  assert.equal(session.lastReply, 'Done · the doc is up');
});
