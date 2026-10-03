// A sub-agent's transcript (<session>/subagents/agent-*.jsonl) counts as running until its last line is an end_turn —
// and not at all once it has gone quiet for a while (a killed agent never writes its end_turn).
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
