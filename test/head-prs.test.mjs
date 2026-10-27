// A chat the boot reads only the tail of is read for its PRs at its head too (2026-10-27): its own PR is most often in
// its first prompt, and the card went without it until the chat was opened. Pure functions of server.mjs over a file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-test-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
process.env.TAIL_BYTES = '4096'; process.env.HEAD_BYTES = '4096';
const { indexFile, sessions } = await import('../server.mjs');

const ts = i => new Date(Date.UTC(2026, 9, 27, 12, 0, i)).toISOString();
const base = { isSidechain: false, cwd: '/tmp/repo', sessionId: 'head-1' };
const user = (text, i) => ({ ...base, type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, timestamp: ts(i) });
const assistant = (content, i, stop = 'end_turn') => ({ ...base, type: 'assistant', message: { role: 'assistant', id: `m${i}`, content, stop_reason: stop }, timestamp: ts(i) });
const pull = n => `https://github.com/acme/r/pull/${n}`;

test('the head\'s PRs are read as the whole file reads them; the rest of the head is not', () => {
  const lines = [
    user(`review ${pull(1)}`, 0),
    { ...base, type: 'user', isMeta: true, message: { role: 'user', content: [{ type: 'text', text: `a skill's text: ${pull(90)}` }] }, timestamp: ts(1) },
    user(`<command-name>/model</command-name> ${pull(91)}`, 2),
    assistant([{ type: 'text', text: `Related: ${pull(2)}` }, { type: 'tool_use', name: 'Bash', id: 'b1', input: { command: 'gh pr create --fill' } }], 3, 'tool_use'),
    { ...base, type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b1', content: pull(3) }] }, timestamp: ts(4) },
    { type: 'pr-link', sessionId: 'head-1', prUrl: pull(4), timestamp: ts(5) },
    { ...base, type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [{ type: 'text', text: pull(92) }] }, timestamp: ts(6) },
  ];
  // nothing names a PR for a while: the tail starts well past the head
  for (let i = 0; i < 60; i++) lines.push(assistant([{ type: 'text', text: `step ${i}: ${'x'.repeat(200)}` }], 10 + i));
  lines.push(user(`and ${pull(5)}`, 80), assistant([{ type: 'text', text: 'Done.' }], 81));
  const file = join(tmp, 'head-1.jsonl');
  writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');

  const tail = indexFile(file); sessions.clear();
  const whole = indexFile(file, { full: true }); sessions.clear();
  assert.equal(tail.loaded, false, 'the boot read a tail');
  const seen = s => s.prs.map(p => `${p.number} ${p.firstAt} ${p.linked != null} ${p.named != null}`);
  assert.deepEqual(seen(tail), seen(whole), 'the same PRs, first seen when they were, owned as they were');
  assert.deepEqual(tail.prs.map(p => p.number), [5, 4, 3, 2, 1]);
  assert.equal(tail.lastPrompt, `and ${pull(5)}`.replace('https://github.com/acme/r/pull/5', 'r#5'), 'the rest of the head is not read');
  assert.equal(tail.entryCount < whole.entryCount, true);
});
