// The boot's scan of every transcript (2026-10-14): a line that throws in the folding is that line lost, never the
// file nor the boot — one AskUserQuestion whose options were not a list ended the server for good; and what is written
// while the boot runs is read, the transcripts being watched before they are scanned. And the log says when (2026-10-21).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { slugOf } from '../scripts/fixture.mjs';

const cwd = '/Users/test/acme-widgets';
const at = s => new Date(Date.now() - 3_600_000 + s * 1000).toISOString();
const line = (id, o) => JSON.stringify({ isSidechain: false, cwd, sessionId: id, entrypoint: 'cli', ...o }) + '\n';
const prompt = (id, s, text) => line(id, { type: 'user', timestamp: at(s), uuid: randomUUID(), message: { role: 'user', content: text } });
const reply = (id, s, text) => line(id, { type: 'assistant', timestamp: at(s), message: { id: 'm' + s, role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text }] } });
/** A question whose options came as a string — a model's own input, not the list Claude Code's schema says. */
const badAsk = (id, s, tu) => line(id, { type: 'assistant', timestamp: at(s), message: { id: 'm' + s, role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: tu, name: 'AskUserQuestion', input: { questions: [{ question: 'Which?', options: '[{"label":"a"}]' }] } }] } });
/** A text block whose text is no string: fold's `.trim()` throws on it. */
const badText = (id, s) => line(id, { type: 'assistant', timestamp: at(s), message: { id: 'm' + s, role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'text', text: 5 }] } });
const answer = (id, s, tu) => line(id, { type: 'user', timestamp: at(s), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tu, content: 'a' }] } });

test('a line that throws is skipped: the boot comes up, the rest of the file and of an appended chunk is read', { timeout: 40_000 }, async () => {
  const dir = tmpDir('peix-boot-'), proj = join(dir, 'projects', slugOf(cwd));
  mkdirSync(proj, { recursive: true }); mkdirSync(join(dir, 'sessions'));
  const id = randomUUID(), file = join(proj, `${id}.jsonl`);
  writeFileSync(file, prompt(id, 0, 'ask me') + badAsk(id, 1, 'tu1') + answer(id, 2, 'tu1') + badText(id, 3) + reply(id, 4, 'read past the bad line'));
  const srv = await startTestServer({ claudeDir: dir });
  const chat = async () => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);
  try {
    assert.equal((await chat())?.lastReply, 'read past the bad line', 'the boot came up and read the file to its end');
    appendFileSync(file, prompt(id, 10, 'again') + badText(id, 11) + badAsk(id, 12, 'tu2') + answer(id, 13, 'tu2') + reply(id, 14, 'and past this one'));   // one chunk for the tail
    await waitFor(async () => (await chat())?.lastReply === 'and past this one', { what: 'the reply after the bad line in the same chunk' });
    const m = await srv.api(`api/sessions/${id}/messages`);
    assert.equal(m.status, 200, JSON.stringify(m.body).slice(0, 300));
    assert.equal(m.body.entries.findLast(e => e.role === 'assistant' && e.kind === 'text')?.text, 'and past this one');
    assert.equal((srv.logText().match(/a line could not be folded/g) || []).length, 1, 'said once for the file');
    // and every line it logged says when (2026-10-21)
    assert.match(srv.logText(), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z \[peixairada\] listening on /m);
    assert.doesNotMatch(srv.logText(), /^\[peixairada\]/m, 'no line without its time');
  } finally { await srv.stop(); }
});

test('a reply written while the boot runs is read, not left for the file\'s next line', { timeout: 40_000 }, async () => {
  const dir = tmpDir('peix-boot-'), proj = join(dir, 'projects', slugOf(cwd));
  mkdirSync(proj, { recursive: true }); mkdirSync(join(dir, 'sessions'));
  const id = randomUUID(), file = join(proj, `${id}.jsonl`);
  writeFileSync(file, prompt(id, 0, 'go'));
  // A holder that accepts and never says hello holds the boot in adoptHolders for HELLO_MS — after the scan, before
  // the boot is over: the reply goes in the moment the server connects to it.
  const state = tmpDir('peix-'), terms = join(state, 'terms'); mkdirSync(terms);
  const holder = spawn('sleep', ['60'], { stdio: 'ignore' });   // its pid alive, so the board leaves the drawer be
  writeFileSync(join(terms, 't1-boot.json'), JSON.stringify({ id: 't1-boot', pid: holder.pid, holderPid: holder.pid, cwd, startedAt: Date.now(), exited: null }));
  let wrote = false;
  const mute = createServer(sock => { sock.on('error', () => {}); if (!wrote) { wrote = true; appendFileSync(file, reply(id, 5, 'written mid-boot')); } }).listen(join(terms, 't1-boot.sock'));
  const srv = await startTestServer({ claudeDir: dir, dir: state });
  try {
    assert.ok(wrote, 'the boot asked the holder, after its scan');
    await waitFor(async () => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id)?.lastReply === 'written mid-boot', { timeout: 5000, what: 'the reply written while the boot ran' });
  } finally { mute.close(); for (const f of ['t1-boot.json', 't1-boot.sock']) rmSync(join(terms, f), { force: true }); holder.kill(); await srv.stop(); }
});
