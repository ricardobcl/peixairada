// The transcript folder and the PR bookkeeping — pure functions of server.mjs, imported without booting it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-test-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const srv = await import('../server.mjs');
const { fold, newSession, summary, notePr, prTitle, cleanPrompt, snippet, textOf } = srv;

const ts = (i = 0) => new Date(Date.UTC(2026, 8, 20, 12, 0, i)).toISOString();
// Tasks are judged against the real clock — running or not running — so their tests date from a minute ago.
const now = (i = 0) => new Date(Date.now() - 60_000 + i * 1000).toISOString();
const user = (text, extra = {}) => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, timestamp: ts(extra.i || 0), cwd: '/tmp/repo', entrypoint: 'cli', uuid: 'u' + (extra.i || 0), ...extra });
const assistant = (blocks, stop = 'end_turn', i = 1) => ({ type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5', id: 'msg' + i, content: blocks, stop_reason: stop }, timestamp: ts(i), cwd: '/tmp/repo', entrypoint: 'cli' });

test('a prompt then a reply: working → idle, snippets, model, cwd', () => {
  const s = newSession('s1', '/x/s1.jsonl');
  assert.equal(fold(s, user('what day is it?')), true);
  assert.equal(s.status, 'working'); assert.equal(s.lastPrompt, 'what day is it?'); assert.equal(s.lastUserAt, ts(0)); assert.equal(s.cwd, '/tmp/repo');
  fold(s, assistant([{ type: 'text', text: 'Saturday.' }]));
  assert.equal(s.status, 'idle'); assert.equal(s.lastReply, 'Saturday.'); assert.equal(s.model, 'claude-opus-5'); assert.equal(s.lastReplyAt, ts(1));
  assert.equal(summary(s).status, 'stale');   // no live process → stale on the summary, idle underneath
  assert.equal(summary(s).rawStatus, 'idle');
});

test('tool use keeps working; a question waits on the user; the answer is the user acting', () => {
  const s = newSession('s2', '/x/s2.jsonl');
  fold(s, user('do it'));
  fold(s, assistant([{ type: 'tool_use', name: 'Bash', id: 't1', input: { command: 'ls' } }], 'tool_use'));
  assert.equal(s.status, 'working');
  fold(s, assistant([{ type: 'tool_use', name: 'AskUserQuestion', id: 't2', input: {} }], 'tool_use', 2));
  assert.equal(s.status, 'needs-input');
  fold(s, { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: 'yes' }] }, timestamp: ts(3) });
  assert.equal(s.status, 'working'); assert.equal(s.lastUserAt, ts(3));
});

test('what is not a prompt: sidechains, meta lines, synthetic command lines, system reminders', () => {
  const s = newSession('s3', '/x/s3.jsonl');
  assert.equal(fold(s, user('hidden', { isSidechain: true })), false);
  assert.equal(fold(s, user('hidden', { isMeta: true })), false);
  assert.equal(fold(s, user('<local-command-stdout>ok</local-command-stdout>')), false);
  fold(s, user('<system-reminder>injected</system-reminder>real question'));
  assert.equal(s.lastPrompt, 'real question');
  assert.equal(cleanPrompt('  <system-reminder>x</system-reminder> hi  '), 'hi');
  assert.equal(snippet('a'.repeat(300), 10).length <= 11, true);
  assert.equal(textOf([{ type: 'text', text: 'a' }, { type: 'tool_use' }, { type: 'text', text: 'b' }]), 'a\nb');
});

test('an interrupt is you acting on the chat, and ends the turn', () => {
  const s = newSession('s4', '/x/s4.jsonl');
  fold(s, user('go')); fold(s, assistant([{ type: 'tool_use', name: 'Bash', id: 't', input: {} }], 'tool_use'));
  fold(s, user('[Request interrupted by user]', { i: 2 }));
  assert.equal(s.status, 'idle'); assert.equal(s.lastUserAt, ts(2));
});

test('titles: the board title beats the user\'s, which beats the PR\'s, which beats Claude\'s', () => {
  const s = newSession('s5', '/x/s5.jsonl');
  fold(s, { type: 'ai-title', aiTitle: 'Claude says' });
  assert.equal(summary(s).title, 'Claude says');
  notePr(s, 'https://github.com/acme/r/pull/1', ts(0), 'user'); srv.sessions.set('s5', s);
  // no title from gh yet → Claude's stays
  assert.equal(summary(s).title, 'Claude says');
  s.prs[0].title = 'PR one'; s.prs[0].state = 'open';
  assert.equal(summary(s).title, 'PR one');
  fold(s, { type: 'custom-title', customTitle: 'Mine' });
  assert.equal(summary(s).title, 'Mine');
});

test('PRs: most recently mentioned first, mentions counted, the oldest open one names the chat', () => {
  const s = newSession('s6', '/x/s6.jsonl');
  fold(s, user('see https://github.com/acme/r/pull/10 and https://github.com/acme/r/pull/11', { i: 0 }));
  fold(s, assistant([{ type: 'text', text: 'Also https://github.com/acme/r/pull/10 again, and https://github.com/acme/r/pull/12/files' }], 'end_turn', 1));
  assert.deepEqual(s.prs.map(p => p.number), [12, 10, 11]);
  assert.equal(s.prs.find(p => p.number === 10).count, 2);
  assert.equal(s.prs.find(p => p.number === 12).label, 'r#12');
  assert.equal(s.prs.find(p => p.number === 12).url, 'https://github.com/acme/r/pull/12');   // /files stripped
  assert.equal(prTitle(s), null);   // nothing titled yet
  for (const p of s.prs) { p.title = 'PR ' + p.number; p.state = p.number === 11 ? 'merged' : 'open'; }
  assert.equal(prTitle(s), 'PR 10');   // 10 and 12 open; 10 was mentioned first (firstAt)
  for (const p of s.prs) p.state = 'merged';
  assert.equal(prTitle(s), 'PR 10');   // none open → the oldest still wins, so the title survives the merge
  fold(s, { type: 'pr-link', prUrl: 'https://github.com/acme/r/pull/11', timestamp: ts(5) });
  assert.equal(s.prs[0].number, 11);   // a pr-link line reorders but does not count as a mention
  assert.equal(s.prs[0].count, 1);
});

// Work that outlives the turn: a Monitor (or a background Bash) keeps running after the reply, and the transcript
// says so — the tool_result carries the task's id, `<task-notification>` lines its events, and one with a <status>
// its end. The summary only reports what a *live* claude could still be running (see runningTasks).
test('a monitor runs from its tool result until the notification that ends it', () => {
  const s = newSession('s5', '/x/s5.jsonl');
  s.alive = true; s.live = { pid: 1, startedAt: Date.now() - 600_000 };
  const note = (body, i) => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: body }] }, timestamp: now(i), cwd: '/tmp/repo' });
  const result = (id, text, i) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text }] }, timestamp: now(i), cwd: '/tmp/repo' });

  fold(s, user('watch the CI'));
  fold(s, { ...assistant([{ type: 'tool_use', name: 'Monitor', id: 'tm', input: { description: 'CI on #382', command: 'gh pr checks', timeout_ms: 1800_000 } }], 'tool_use', 1), timestamp: now(1) });
  assert.deepEqual(summary(s).tasks, [], 'nothing runs until the harness has answered with a task id');
  fold(s, result('tm', 'Monitor started (task ab12cd34, expires in 30m unless the source ends first).', 2));
  fold(s, { ...assistant([{ type: 'text', text: 'watching' }], 'end_turn', 3), timestamp: now(3) });
  assert.equal(s.status, 'idle', 'the chat is ready: the turn ended');
  let [t] = summary(s).tasks;
  assert.equal(t.kind, 'monitor'); assert.equal(t.what, 'CI on #382'); assert.equal(t.events, 0);
  assert.equal(Date.parse(t.until) - Date.parse(t.at), 1800_000, 'it expires when the Monitor said it would');

  assert.equal(fold(s, note('<task-notification>\n<task-id>ab12cd34</task-id>\n<summary>Monitor event</summary>\n<event>Build: pass</event>\n</task-notification>', 4)), true);
  assert.equal(summary(s).tasks[0].events, 1, 'an event is counted, and the line is still no prompt of yours');
  assert.equal(s.lastPrompt, 'watch the CI', '…the card keeps showing what you actually said');

  fold(s, note('<task-notification>\n<task-id>ab12cd34</task-id>\n<status>completed</status>\n<summary>Monitor completed</summary>\n</task-notification>', 5));
  assert.deepEqual(summary(s).tasks, [], 'a notification with a status is the end of it');
});

test('a task belongs to the claude that started it, and to no other', () => {
  const s = newSession('s6', '/x/s6.jsonl');
  s.alive = true; s.live = { pid: 1, startedAt: Date.now() - 600_000 };
  fold(s, { ...assistant([{ type: 'tool_use', name: 'Bash', id: 'tb', input: { command: 'npm test', description: 'the suite', run_in_background: true } }], 'tool_use', 1), timestamp: now(1) });
  fold(s, { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tb', content: 'Command running in background with ID: bu7htdtrz. Output is being written to: /tmp/x.output.' }] }, timestamp: now(2), cwd: '/tmp/repo' });
  assert.deepEqual(summary(s).tasks.map(t => [t.kind, t.what]), [['bash', 'the suite']]);
  s.live = { pid: 2, startedAt: Date.now() };   // the chat was resumed: a new claude, and the old task died with the old one
  assert.deepEqual(summary(s).tasks, []);
  s.live = { pid: 2, startedAt: Date.now() - 600_000 }; s.alive = false;
  assert.deepEqual(summary(s).tasks, [], 'and nothing runs in a chat with no process at all');
});

// lsof's verdict lands on the chat as it is then (2026-10-14): a re-read while it ran replaced the object it started with.
test('a background command nobody holds the output of is let go from the chat as it is now', async () => {
  const { writeFileSync } = await import('node:fs');
  process.env.LSOF_BIN = '/usr/bin/false';   // lsof's own "held by nobody": exit 1, nothing named
  const out = join(tmp, 'bg.output'); writeFileSync(out, '');
  const task = () => new Map([['bgdone1', { kind: 'bash', what: 'the build', at: now(0), until: null, events: 0, out }]]);
  const was = newSession('s-sweep', '/x/s-sweep.jsonl'); was.alive = true; was.live = { pid: 1, startedAt: Date.now() - 600_000 }; was.tasks = task();
  srv.sessions.set(was.id, was);
  const sweep = srv.sweepTasks();
  const s = newSession('s-sweep', '/x/s-sweep.jsonl'); s.alive = true; s.live = was.live; s.tasks = task();   // read again meanwhile
  srv.sessions.set(s.id, s);
  await sweep;
  assert.equal(s.tasks.size, 0, 'the chat as it is now let it go');
  assert.ok(s.pushTimer, 'and pushed'); assert.equal(was.pushTimer, null, 'never the object it replaced');
  clearTimeout(s.pushTimer); srv.sessions.delete(s.id);
});

test('a task the poll let go stays gone when the chat is read again whole (2026-10-14)', async () => {
  const { writeFileSync } = await import('node:fs');
  process.env.LSOF_BIN = '/usr/bin/false';
  const out = join(tmp, 'bg2.output'); writeFileSync(out, '');
  const file = join(tmp, 's-gone.jsonl');
  const call = { ...assistant([{ type: 'tool_use', name: 'Bash', id: 'tg', input: { command: 'npm run build', description: 'the build', run_in_background: true } }], 'tool_use', 1), timestamp: now(1) };
  const res = { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tg', content: `Command running in background with ID: bggone1. Output is being written to: ${out}.` }] }, timestamp: now(2), cwd: '/tmp/repo' };
  writeFileSync(file, [user('build it', { timestamp: now(0) }), call, res].map(l => JSON.stringify(l)).join('\n') + '\n');
  const s = srv.indexFile(file); s.alive = true; s.live = { pid: 1, startedAt: Date.now() - 600_000 };
  assert.deepEqual(summary(s).tasks.map(t => t.id), ['bggone1']);
  await srv.sweepTasks();
  assert.deepEqual(summary(srv.sessions.get(s.id)).tasks, [], 'nobody holds its output: let go');
  const again = srv.indexFile(file, { full: true });
  assert.deepEqual(summary(again).tasks, [], 'and its first line read again does not start it again');
  clearTimeout(s.pushTimer); clearTimeout(again.pushTimer); srv.sessions.delete(s.id);
});

test('the question on the card is the one still waiting for an answer', () => {
  const s = newSession('s7', '/x/s7.jsonl');
  s.alive = true; s.live = { pid: 1, startedAt: Date.now() - 600_000 };
  fold(s, user('set up the database'));
  fold(s, assistant([{ type: 'tool_use', name: 'AskUserQuestion', id: 'tq', input: { questions: [{ question: 'Which database?', options: [{ label: 'Postgres' }, { label: 'MySQL' }] }] } }], 'tool_use', 1));
  assert.deepEqual(summary(s).ask, { tool: 'AskUserQuestion', text: 'Which database?', options: 2, labels: ['Postgres', 'MySQL'] });
  fold(s, { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tq', content: 'Postgres' }] }, timestamp: ts(2), cwd: '/tmp/repo' });
  assert.equal(summary(s).ask, null, 'answered: the card has nothing to ask you');
  assert.equal(s.status, 'working');
  // options that are no list (2026-10-14): a question with no answers to offer, not a throw out of the fold
  fold(s, assistant([{ type: 'tool_use', name: 'AskUserQuestion', id: 'tq2', input: { questions: [{ question: 'Which one?', options: '[{"label":"a"}]' }] } }], 'tool_use', 3));
  assert.deepEqual(summary(s).ask, { tool: 'AskUserQuestion', text: 'Which one?', options: 0, labels: [] });
});

// The registry is Claude Code's own word on whether it is blocked on you (2026-09-22): the transcript line that asks
// is written *with* its answer, and a permission prompt never reaches the transcript at all — so a chat whose
// transcript reads as work in flight is asking the moment its process says `status: "waiting"`.
test('a process that says it is waiting is asking, whatever the transcript reads', () => {
  const s = newSession('s8', '/x/s8.jsonl');
  s.alive = true; s.live = { pid: 1, startedAt: Date.now() - 600_000, status: 'busy' };
  fold(s, user('clean up the branches'));
  fold(s, assistant([{ type: 'tool_use', name: 'Bash', id: 'tb', input: { command: 'git branch -D old' } }], 'tool_use', 1));
  assert.equal(summary(s).status, 'working', 'busy, and a tool call in flight: work');
  s.live = { ...s.live, status: 'waiting', waitingFor: 'permission prompt' };
  assert.equal(summary(s).status, 'needs-input', 'the prompt is up: asking, though the transcript never heard of it');
  assert.deepEqual(summary(s).ask, { tool: null, text: null, options: 0, waitingFor: 'permission prompt' }, 'and the card says what it waits on');
  s.agentsRunning = 2;
  assert.equal(summary(s).status, 'needs-input', 'a question beats the agents at work');
  s.agentsRunning = 0;
  s.live = { ...s.live, status: 'busy', waitingFor: undefined };
  assert.equal(summary(s).status, 'working', 'answered: back to work');
  assert.equal(summary(s).ask, null);
});

test('the registry is the word on asking when it says anything; the transcript is only the fallback', () => {
  const s = newSession('s9', '/x/s9.jsonl');
  s.alive = true; s.live = { pid: 1, startedAt: Date.now() - 600_000 };
  fold(s, user('set up the database'));
  fold(s, assistant([{ type: 'tool_use', name: 'AskUserQuestion', id: 'tq', input: { questions: [{ question: 'Which database?', options: [{ label: 'Postgres' }, { label: 'MySQL' }] }] } }], 'tool_use', 1));
  assert.equal(summary(s).status, 'needs-input', 'a claude that reports no status: the pending question in the transcript is the word');
  s.live = { ...s.live, status: 'waiting', waitingFor: 'permission prompt' };
  assert.deepEqual(summary(s).ask, { tool: 'AskUserQuestion', text: 'Which database?', options: 2, labels: ['Postgres', 'MySQL'] }, 'both agree: the transcript has the question itself');
  s.live = { ...s.live, status: 'busy', waitingFor: undefined };
  assert.equal(summary(s).status, 'working', 'the process says it is past the question: it is');
  s.live = { ...s.live, status: 'idle' };
  assert.equal(summary(s).status, 'idle');
  s.live = { ...s.live, status: 'idle' }; s.rivals = [{ pid: 2, startedAt: Date.now(), status: 'waiting', waitingFor: 'input needed' }];
  assert.equal(summary(s).status, 'needs-input', 'any live process on the chat that waits is the chat waiting');
  s.rivals = [{ pid: 2, startedAt: Date.now(), status: 'waiting', waitingFor: 'dialog open' }];
  assert.equal(summary(s).status, 'idle', 'a dialog you opened yourself (/model, /config) is not a question');
  s.alive = false;
  assert.equal(summary(s).status, 'stale', 'and nothing waits on a chat with no process');
});

test('a turn the transcript never closes ends when the process says idle — /compact (2026-09-29)', () => {
  const s = newSession('s10', '/x/s10.jsonl');
  s.alive = true; s.live = { pid: 1, startedAt: Date.now() - 600_000, status: 'busy', statusAt: Date.parse('2026-09-28T22:28:45.800Z') };
  // Claude Code 2.1.283: the typed command as a plain prompt, then — compacted — the boundary, the summary and the
  // command's own tagged lines, and no assistant line at all
  fold(s, { type: 'user', message: { role: 'user', content: '/compact' }, timestamp: '2026-09-28T22:28:45.706Z' });
  assert.equal(summary(s).status, 'working', 'compacting: clauding, as the process says');
  fold(s, { type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', timestamp: '2026-09-28T22:30:14.325Z' });
  fold(s, { type: 'user', isCompactSummary: true, message: { role: 'user', content: 'This session is being continued…' }, timestamp: '2026-09-28T22:30:14.285Z' });
  fold(s, { type: 'user', message: { role: 'user', content: '<command-name>/compact</command-name>' }, timestamp: '2026-09-28T22:28:45.712Z' });
  fold(s, { type: 'user', message: { role: 'user', content: '<local-command-stdout>Compacted</local-command-stdout>' }, timestamp: '2026-09-28T22:30:14.424Z' });
  assert.equal(s.status, 'idle', 'the boundary after the /compact you typed ends its turn (2026-10-14)');
  assert.equal(s.turnStart, null);
  s.status = 'working'; s.turnStart = '2026-09-28T22:28:45.706Z';   // …and before that, the transcript alone never said it was over
  s.live = { ...s.live, status: 'idle', statusAt: Date.parse('2026-09-28T22:30:14.500Z') };
  assert.equal(summary(s).status, 'idle', 'the process went idle after the turn began: done');
  s.status = 'idle'; s.turnStart = null;
  // a prompt the transcript has before the registry has caught up: the idle is the last turn's, and it is clauding
  fold(s, user('and now the tests', { timestamp: '2026-09-28T22:31:00.000Z' }));
  assert.equal(summary(s).status, 'working', 'an idle older than the prompt is the turn before');
  assert.equal(s.turnStart, '2026-09-28T22:31:00.000Z', 'its own turn, not the /compact\'s');
  s.live = { ...s.live, statusAt: undefined };
  assert.equal(summary(s).status, 'working', 'a claude that says nothing of when: the transcript stands');
});

test('a turn that ran out of tokens or was refused has ended; one cut off mid tool call has not', () => {
  const s = srv.newSession('t-ends', null);
  const say = (stop_reason, content = [{ type: 'text', text: 'partial answer' }]) => srv.fold(s, { type: 'assistant', timestamp: '2026-10-03T10:00:00Z', message: { role: 'assistant', stop_reason, content } });
  srv.fold(s, { type: 'user', timestamp: '2026-10-03T09:59:00Z', message: { role: 'user', content: 'go' } });
  say('max_tokens');
  assert.equal(s.status, 'idle', 'max_tokens');
  srv.fold(s, { type: 'user', timestamp: '2026-10-03T10:01:00Z', message: { role: 'user', content: 'again' } });
  say('refusal');
  assert.equal(s.status, 'idle', 'refusal');
  srv.fold(s, { type: 'user', timestamp: '2026-10-03T10:02:00Z', message: { role: 'user', content: 'and again' } });
  say('max_tokens', [{ type: 'tool_use', id: 'x', name: 'Write', input: {} }]);
  assert.equal(s.status, 'working', 'a tool call cut short goes on');
});

test('a snippet never ends in half an emoji', () => {
  const t = srv.snippet('x'.repeat(238) + '😀 and more', 240);
  assert.ok(t.isWellFormed(), JSON.stringify(t.slice(-4)));
  assert.ok(t.endsWith('…'));
});

test('a card\'s snippet is markdown as a sentence: links, headings, items, tables and GitHub URLs (2026-10-12)', () => {
  const { plain } = srv;
  assert.equal(plain('[Snapshot report](https://claude.ai/code/artifact/3f9c1e27-58aa-4c0b-9d1e-7b2f0c4a91d3) is up.'), 'Snapshot report is up.');
  assert.equal(plain('## What changed\n- Rebased onto `main`\n- **Updated** the goldens'), 'What changed\n· Rebased onto `main`\n· Updated the goldens');
  assert.equal(plain('review https://github.com/acme/storefront/pull/479/files and acme/storefront#12'), 'review storefront#479 and acme/storefront#12');
  assert.equal(plain('see https://example.com/a/very-long-segment-that-goes-on-and-on/x'), 'see example.com/a/very-long-se…/x');
  assert.equal(plain('| PR | Finding |\n|---|---|\n| #1 | a |'), 'PR · Finding\n\n#1 · a');
  assert.equal(plain('> quoted\n```js\nconst a = 1;\n```'), 'quoted\n\nconst a = 1;\n');
  assert.equal(plain('a * b * c and snake_case_name stay'), 'a * b * c and snake_case_name stay');
  assert.equal(plain('an *emphasis* here'), 'an emphasis here');
  assert.equal(plain('|:-:|---|\n---\n- - -\n|-|'), '\n\n· - -\n-', 'a rule is two dashes running, in a line of nothing else');
  const t0 = performance.now(); plain('-'.repeat(1999) + 'x\n' + '| -'.repeat(600) + '|x');
  assert.ok(performance.now() - t0 < 50, `a long run of dashes is read in linear time (2026-10-14): ${Math.round(performance.now() - t0)} ms`);
  const s = newSession('md', '/x/md.jsonl');
  fold(s, user('review https://github.com/acme/widgets/pull/7'));
  assert.equal(s.lastPrompt, 'review widgets#7');
  fold(s, assistant([{ type: 'text', text: '## Done\n- [the doc](https://x.y/z) is up' }]));
  assert.equal(s.lastReply, 'Done · the doc is up');
});
