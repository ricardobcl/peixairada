// A drawer whose claude sits idle with no page on it is ended after DRAWER_IDLE_MS (2026-09-27: a week of chats had
// left 72 of them at 13 GB); one with a page attached stays. Two fake claudes on a throwaway server with the window
// at 1.5 s and the registry poll at 1.2 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alive, startTestServer, waitFor } from '../lib/testserver.mjs';
import { defaultFixture } from '../scripts/fixture.mjs';

test('an idle drawer with no page on it is ended after DRAWER_IDLE_MS; one with a page attached is not', { timeout: 40_000 }, async () => {
  const fx = defaultFixture(mkdtempSync(join(tmpdir(), 'peix-fx-')), { cwdA: process.cwd(), cwdB: tmpdir() });
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true, env: { DRAWER_IDLE_MS: '1500' } });
  try {
    const start = () => srv.post('api/terminals', { cwd: process.cwd(), cols: 90, rows: 24 });
    const [a, b] = await Promise.all([start(), start()]);
    assert.equal(a.status, 201, JSON.stringify(a.body)); assert.equal(b.status, 201, JSON.stringify(b.body));
    const ws = new WebSocket(`${srv.url.replace(/^http/, 'ws')}api/terminals/${b.body.terminal.id}/ws`);   // a page on b
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    await waitFor(async () => (await srv.terminals()).filter(t => t.sessionId).length === 2, { what: 'both fakes registered and tied to their drawers' });
    await waitFor(async () => (await srv.terminals()).find(t => t.id === a.body.terminal.id)?.exited != null, { timeout: 10_000, what: 'the drawer nobody looks at to be ended' });
    assert.match(srv.logText(), /idle 0 h with no page on it — ending it \(chat /);
    const tb = (await srv.terminals()).find(t => t.id === b.body.terminal.id);
    assert.equal(tb.exited, null, 'the one with a page attached runs on'); assert.ok(alive(tb.pid));
    ws.close();
  } finally { await srv.stop(); }
});
