// Chats that talk (2026-10-31, round XIV): what the board hands one chat from you or from another — a message sent to a
// chat, a handoff merged into a new one or folded into another, a branch of a chat — against the fake claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture } from '../scripts/fixture.mjs';

const chatOf = async (srv, id) => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);

test('Send to…: a chat with no process resumes with your words as its first prompt — never logged — and one with a drawer is not handed them again', { timeout: 40_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const chat = fx.chats[1];
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  try {
    const r = await srv.post(`api/sessions/${chat.id}/terminal`, { cols: 100, rows: 30, prompt: 'carry on\nwith the queue' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.prompted, true, 'the words went in with the resume');
    await waitFor(() => readFileSync(chat.file, 'utf8').includes(JSON.stringify('carry on\nwith the queue')), { what: 'the prompt in its transcript, as written' });
    await waitFor(async () => (await chatOf(srv, chat.id))?.lastReply?.includes('You said: carry on'), { what: 'its Claude answering it' });
    assert.doesNotMatch(srv.logText(), /with the queue/, 'the words are not the log\'s');
    assert.match(srv.logText(), /--resume \S+ -- <a prompt of yours>/, 'the log says a prompt went in');
    // the drawer is there now: the route answers with it and hands it nothing — the page types the words in instead
    const again = await srv.post(`api/sessions/${chat.id}/terminal`, { cols: 100, rows: 30, prompt: 'twice?' });
    assert.equal(again.status, 200); assert.equal(again.body.prompted, false);
    assert.equal(again.body.terminal.id, r.body.terminal.id);
    await srv.api(`api/terminals/${r.body.terminal.id}`, { method: 'DELETE' });
  } finally { await srv.stop(); }
});
