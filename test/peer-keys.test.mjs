// What the board never opens under ~/.claude (2026-10-31): the `<pid>.<hash>.key` beside each registry file — a chat's
// peer token, with which any process could pass for that chat —, `shell-snapshots/`, `history.jsonl` and a team's
// mailboxes. Each is a FIFO here, a tripwire: a FIFO opened to read blocks the opener until a writer comes, and opening
// it to write without blocking fails with ENXIO for as long as no reader holds it. So, after the boot, the registry read
// again and again, a team read and a chat opened, every one must still have no reader — and the server still answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, constants as fsc, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { makeFixture, teamFiles, yesterday } from '../scripts/fixture.mjs';

const fifo = path => { execFileSync('/usr/bin/mkfifo', ['-m', '600', path]); return path; };
/** Whether anyone has the FIFO open to read: a non-blocking open for writing succeeds only then. */
function readBy(path) {
  try { closeSync(openSync(path, fsc.O_WRONLY | fsc.O_NONBLOCK)); return true; }
  catch (e) { if (e.code === 'ENXIO') return false; throw e; }
}

test('the peer keys, the shell snapshots, the prompt history and the team mailboxes are never opened', { timeout: 40_000 }, async () => {
  const p = spawn('sleep', ['120'], { stdio: 'ignore' }), dir = tmpDir('peix-fx-');
  const fx = makeFixture(dir, [{ cwd: '/tmp/acme/storefront', title: 'Keys stay shut', prompt: 'hello', reply: 'hi', at: yesterday(), live: { pid: p.pid, name: 'storefront-1' } }]);
  const [chat] = fx.chats;
  const { team } = teamFiles({ dir, lead: chat, mates: [{ name: 'reviewer', summary: 'Review it', work: 'Read the diff' }] });
  mkdirSync(join(dir, 'shell-snapshots')); mkdirSync(join(dir, 'teams', team, 'inboxes'));
  const wires = [
    fifo(join(dir, 'sessions', `${p.pid}.${'ab'.repeat(32)}.key`)),
    fifo(join(dir, 'shell-snapshots', 'snapshot-zsh-1761900000000-abcdef.sh')),
    fifo(join(dir, 'history.jsonl')),
    fifo(join(dir, 'teams', team, 'inboxes', 'team-lead.json')),
  ];
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    const sum = async () => (await srv.api('api/sessions')).body.sessions.find(s => s.id === chat.id);
    await waitFor(async () => (await sum())?.alive && (await sum())?.agentRows, { what: 'the chat alive, read from the .json beside the key, and its team' });
    // the registry read on an event as well as on the poll: another file beside them
    writeFileSync(join(dir, 'sessions', '1.json'), JSON.stringify({ pid: 1, sessionId: 'nobody', cwd: '/tmp' }));
    await (await srv.api(`api/sessions/${chat.id}/messages`));
    const polls = Date.now(); await waitFor(() => Date.now() - polls > 3000, { what: 'two registry polls' });
    assert.equal((await srv.api('api/sessions')).status, 200, 'the server answers: nothing of it is stuck opening a FIFO');
    for (const w of wires) assert.equal(readBy(w), false, `never opened: ${w.slice(dir.length)}`);
  } finally { await srv.stop(); p.kill(); }
});
