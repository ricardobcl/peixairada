// When the board last showed a chat (2026-10-12): the New replies lane is a reply after it. The server keeps it in its
// state file; a chat never shown counts from the first boot that kept it, so nothing older is new.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture } from '../scripts/fixture.mjs';

test('seenAt: the first boot is every chat\'s, a POST moves one, the state file keeps it over a restart', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'));
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    const one = fx.chats[0].id;
    const chat = async () => (await (await fetch(srv.url + 'api/sessions')).json()).sessions.find(s => s.id === one);
    await waitFor(async () => !!(await chat()), { what: 'the fixture indexed' });
    const first = await chat();
    assert.ok(first.seenAt && first.seenAt > first.lastReplyAt, 'never shown: the boot\'s time, after its reply — no new reply');
    const r = await srv.post(`api/sessions/${one}/seen`, {});
    assert.equal(r.status, 200); assert.ok(r.body.seenAt >= first.seenAt);
    assert.equal((await chat()).seenAt, r.body.seenAt);
    assert.equal(JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).seen[one], r.body.seenAt, 'in the state file');
    assert.equal((await srv.post('api/sessions/nope/seen', {})).status, 404);
    await srv.restart();
    await waitFor(async () => (await chat())?.seenAt === r.body.seenAt, { what: 'the same after a restart' });
  } finally { await srv.stop(); }
});
