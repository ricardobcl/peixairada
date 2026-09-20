// The transcript folder and the PR bookkeeping — pure functions of server.mjs, imported without booting it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'peix-test-'));
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const srv = await import('../server.mjs');
const { fold, newSession, summary, notePr, prTitle, cleanPrompt, snippet, textOf } = srv;

const ts = (i = 0) => new Date(Date.UTC(2026, 8, 20, 12, 0, i)).toISOString();
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
