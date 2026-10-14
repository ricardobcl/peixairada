// A sub-agent's transcript (<session>/subagents/agent-*.jsonl) counts as running until its last line is an end_turn —
// and not at all once it has gone quiet for a while (a killed agent never writes its end_turn).
import './env.mjs';   // first: server.mjs reads where its state lives as it is imported
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpDir } from '../lib/testserver.mjs';
import { agentRunning } from '../server.mjs';

test('a sub-agent file is running until its last line is an end_turn, never once it went quiet', () => {
  const f = join(tmpDir('peix-agents-'), 'agent-1.jsonl');
  const line = o => JSON.stringify({ isSidechain: true, agentId: '1', ...o }) + '\n';
  const user = line({ type: 'user', message: { role: 'user', content: 'go' } });
  writeFileSync(f, user);
  assert.equal(agentRunning(f), true, 'a prompt with no reply yet');
  writeFileSync(f, user + line({ type: 'assistant', message: { role: 'assistant', stop_reason: 'tool_use', content: [] } }));
  assert.equal(agentRunning(f), true, 'mid tool call');
  writeFileSync(f, user + line({ type: 'assistant', message: { role: 'assistant', stop_reason: 'end_turn', content: [] } }));
  assert.equal(agentRunning(f), false, 'done');
  writeFileSync(f, user + '{"type":"assistant","mess');
  assert.equal(agentRunning(f), true, 'a line still being written');
  writeFileSync(f, user + line({ type: 'assistant', message: { role: 'assistant', stop_reason: 'tool_use', content: [] } }));
  const old = new Date(Date.now() - 3600e3); utimesSync(f, old, old);
  assert.equal(agentRunning(f), false, 'quiet for an hour: not counted');
  writeFileSync(f, '');
  assert.equal(agentRunning(f), false, 'empty');
  assert.equal(agentRunning(f + '.missing'), false, 'gone');
});

test('an agent that handed its report back is done — no end_turn ever follows the handback — and so is one interrupted', () => {
  const f = join(tmpDir('peix-agents-'), 'agent-2.jsonl');
  const line = o => JSON.stringify({ isSidechain: true, agentId: '2', ...o }) + '\n';
  const user = line({ type: 'user', message: { role: 'user', content: 'review it' } });
  const handback = line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'SubagentHandback', input: { report: '…' } }] } });
  const delivered = line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: 'Report delivered' }] }] } });
  const other = line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_9', content: 'file contents' }] } });
  writeFileSync(f, user + handback);
  assert.equal(agentRunning(f), true, 'the handback asked for, not yet answered');
  writeFileSync(f, user + handback + delivered);
  assert.equal(agentRunning(f), false, 'its result in: done');
  writeFileSync(f, user + handback + other);
  assert.equal(agentRunning(f), true, 'a tool result for another call is an agent at work');
  writeFileSync(f, user + line({ type: 'attachment', attachment: { type: 'total_tokens_reminder' } }));
  assert.equal(agentRunning(f), true, 'a token reminder is an agent mid-way');
  writeFileSync(f, user + line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } }));
  assert.equal(agentRunning(f), false, 'interrupted');
});

test('an agent last written before the chat\'s claude started died with the one before; its turn ends as a chat\'s does (2026-10-14)', () => {
  const f = join(tmpDir('peix-agents-'), 'agent-3.jsonl');
  const line = o => JSON.stringify({ isSidechain: true, agentId: '3', ...o }) + '\n';
  const user = line({ type: 'user', message: { role: 'user', content: 'go' } });
  const said = (stop_reason, content = [{ type: 'text', text: 'partial' }]) => user + line({ type: 'assistant', message: { role: 'assistant', stop_reason, content } });
  writeFileSync(f, said('tool_use'));
  const written = Date.now() - 60_000; utimesSync(f, new Date(written), new Date(written));
  assert.equal(agentRunning(f, Date.now(), written - 1000), true, 'the claude that started it runs on');
  assert.equal(agentRunning(f, Date.now(), written + 1000), false, 'a claude started since — a take-over, a resume: not its agent');
  writeFileSync(f, said('max_tokens'));
  assert.equal(agentRunning(f), false, 'out of tokens: done');
  writeFileSync(f, said('refusal'));
  assert.equal(agentRunning(f), false, 'refused: done');
  writeFileSync(f, said('max_tokens', [{ type: 'tool_use', id: 'x', name: 'Write', input: {} }]));
  assert.equal(agentRunning(f), true, 'a tool call cut short goes on');
});
