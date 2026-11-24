// Space's favourites (2026-11-18, v11): a chat starred is the summary's `fav`, kept in the state file; nothing under ~/.claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture } from '../scripts/fixture.mjs';

test('a chat starred and unstarred: the summary says so, the state file keeps it, a bad ask is refused', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const chat = fx.chats[0], was = readFileSync(chat.file, 'utf8');
  const srv = await startTestServer({ claudeDir: fx.dir });
  const favOf = async () => (await srv.api('api/sessions')).body.sessions.find(s => s.id === chat.id)?.fav;
  try {
    assert.equal(await favOf(), false, 'none starred at first');
    const r = await srv.post(`api/sessions/${chat.id}/favorite`, { on: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.fav, true);
    assert.equal(await favOf(), true, 'the summary says so');
    await waitFor(() => { try { return JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).favChats?.[chat.id]; } catch { return false; } }, { what: 'kept in the state file' });
    assert.equal((await srv.post(`api/sessions/${chat.id}/favorite`, { on: 'yes' })).status, 400, 'on must be a boolean');
    assert.equal((await srv.post('api/sessions/nobody/favorite', { on: true })).status, 404, 'an unknown chat');
    assert.equal((await srv.post(`api/sessions/${chat.id}/favorite`, { on: false })).body.fav, false);
    assert.equal(await favOf(), false, 'unstarred');
    assert.equal(readFileSync(chat.file, 'utf8'), was, 'nothing under the transcripts is touched');
  } finally { await srv.stop(); }
});
