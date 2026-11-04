// A background command that runs for hours (2026-11-04): it stays while the machine says it runs, whatever its age, and
// one that started past the tail the boot read is found by the registry's `shell` — pure functions of server.mjs, with a
// fake lsof (findBin keeps the first path it finds, so the one script answers as `says` tells it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chmodSync, writeFileSync } from 'node:fs';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-long-');
const said = join(tmp, 'lsof-says'), lsof = join(tmp, 'lsof');
writeFileSync(lsof, `#!/bin/sh
case "$(cat '${said}')" in
  held) for a in "$@"; do case "$a" in /*) echo "n$a";; esac; done ;;
  nobody) exit 1 ;;
  *) exit 2 ;;
esac
`);
chmodSync(lsof, 0o755);
const says = word => writeFileSync(said, word);
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off'; process.env.LSOF_BIN = lsof; process.env.TAIL_BYTES = '4000';
const srv = await import('../server.mjs');
const { summary, pruneTasks, findTasks, sweepTasks, indexFile, sessions } = srv;

const HOUR = 3600_000;
const at = ago => new Date(Date.now() - ago).toISOString();
const started = (id, ago, out) => [
  { type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5', id: `m${id}`, content: [{ type: 'tool_use', name: 'Bash', id: `c${id}`, input: { command: 'while true; do sleep 180; done', description: 'the watch loop', run_in_background: true } }], stop_reason: 'tool_use' }, timestamp: at(ago), cwd: '/tmp/repo' },
  { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `c${id}`, content: `Command running in background with ID: ${id}. Output is being written to: ${out}. You will be notified when it completes.` }] }, timestamp: at(ago - 1000), cwd: '/tmp/repo' },
];
const write = (name, lines) => { const f = join(tmp, `${name}.jsonl`); writeFileSync(f, lines.map(l => JSON.stringify(l)).join('\n') + '\n'); return f; };
const output = name => { const f = join(tmp, `${name}.output`); writeFileSync(f, ''); return f; };
const read = (file, status = 'idle') => { const s = indexFile(file); s.alive = true; s.live = { pid: process.pid, startedAt: Date.now() - 8 * HOUR, status }; return s; };
const ids = s => summary(s).tasks.map(t => t.id);
const leave = s => { clearTimeout(s.pushTimer); sessions.delete(s.id); };

test('a command the machine says runs outlives the cap; the cap counts from its last word', async () => {
  const s0 = read(write('old', started('oldrun', 7 * HOUR, output('oldrun'))));
  assert.deepEqual(ids(s0), [], 'an old line read anew: not shown before the machine has had its look');
  assert.equal(pruneTasks(s0), false, 'and not let go either');

  says('no answer');
  await sweepTasks();
  assert.equal(s0.tasks.has('oldrun'), true, 'lsof itself failing is no verdict');
  assert.equal(pruneTasks(s0), false, 'nor a look had');

  says('held');
  await sweepTasks();
  assert.deepEqual(ids(s0), ['oldrun'], 'held: running, seven hours in');
  assert.ok(s0.pushTimer, 'and pushed, for the card that did not show it');
  assert.equal(pruneTasks(s0), false);

  const s1 = indexFile(s0.file, { full: true });
  assert.deepEqual(ids(s1), ['oldrun'], 'read again whole, it keeps the machine\'s word: no flicker out of the lane');

  s1.tasks.get('oldrun').heldAt = Date.now() - 7 * HOUR;   // what the machine last said, too long ago (no file left to ask about)
  assert.deepEqual(ids(s1), [], 'the cap, from there');
  assert.equal(pruneTasks(s1), true, 'and goes');
  leave(s1);
});

test('a command nobody holds goes, in silence when it was never shown; one with no file left goes after its look', async () => {
  says('nobody');
  const quiet = read(write('quiet', started('quietrun', 7 * HOUR, output('quietrun'))));
  await sweepTasks();
  assert.equal(quiet.tasks.size, 0, 'let go');
  assert.equal(quiet.pushTimer, null, 'never shown: nothing changed on the card');
  leave(quiet);

  const young = read(write('young', started('youngrun', 10 * 60_000, output('youngrun'))));
  assert.deepEqual(ids(young), ['youngrun'], 'under the cap and unasked: shown, as ever');
  await sweepTasks();
  assert.deepEqual(ids(young), [], 'let go');
  assert.ok(young.pushTimer, 'and pushed: the card showed it');
  leave(young);

  const gone = read(write('gone', started('gonerun', 7 * HOUR, join(tmp, 'no-such.output'))));
  assert.equal(pruneTasks(gone), false, 'not looked at yet');
  await sweepTasks();
  assert.equal(pruneTasks(gone), true, 'looked at, nothing there to ask: the cap has it');
  leave(gone);
});

test('the registry says shell and the tail names no task: the chat is read whole, once', async () => {
  const padding = Array.from({ length: 20 }, (_, i) => ({ type: 'system', subtype: 'informational', content: 'x'.repeat(500), timestamp: at(30_000 - i) }));
  const end = { type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5', id: 'mend', content: [{ type: 'text', text: 'watching' }], stop_reason: 'end_turn' }, timestamp: at(20_000), cwd: '/tmp/repo' };
  const s0 = read(write('far', [...started('farrun', 60_000, output('farrun')), ...padding, end]));
  assert.equal(s0.loaded, false, 'the boot\'s tail'); assert.deepEqual(ids(s0), [], 'which does not reach the start');

  findTasks();
  assert.equal(sessions.get(s0.id), s0, 'idle says nothing runs: not read');

  s0.live.status = 'shell';
  findTasks();
  const s1 = sessions.get(s0.id);
  assert.equal(s1.loaded, true); assert.equal(s1.alive, true);
  assert.deepEqual(summary(s1).tasks.map(t => [t.id, t.what]), [['farrun', 'the watch loop']]);

  says('nobody');
  await sweepTasks();
  assert.deepEqual(ids(s1), [], 'the command ended');
  findTasks();
  assert.equal(sessions.get(s0.id), s1, 'shell with nothing to find: read once, not every poll');
  leave(s1);
});
