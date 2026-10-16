// A drawer whose claude sits idle with no page on it is ended after DRAWER_IDLE_MS (2026-09-27: a week of chats had
// left 72 of them at 13 GB); one with a page attached stays. Two fake claudes on a throwaway server with the window
// at 3 s and the registry poll at 1.2 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alive, startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture } from '../scripts/fixture.mjs';

test('an idle drawer with no page on it is ended after DRAWER_IDLE_MS; one with a page attached is not', { timeout: 40_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true, env: { DRAWER_IDLE_MS: '3000' } });
  try {
    // A page on each until both are tied to their chats — a drawer not yet tied is judged by its own start, and a slow
    // shell had a's ended before its fake registered (2026-10-03) — then a's page leaves. Each page goes on as soon as
    // its drawer is there (2026-10-13: waiting for both, a's sat alone while b's holder was still starting — slow with
    // every test file spawning at once — and was ended before it was looked at).
    const page = async t => { const ws = new WebSocket(srv.ws(`api/terminals/${t.body.terminal.id}/ws`)); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); return ws; };
    const start = async () => { const t = await srv.post('api/terminals', { cwd: process.cwd(), cols: 90, rows: 24 }); assert.equal(t.status, 201, JSON.stringify(t.body)); return [t, await page(t)]; };
    const [[a, wa], [b, ws]] = await Promise.all([start(), start()]);
    await waitFor(async () => (await srv.terminals()).filter(t => t.sessionId).length === 2, { what: 'both fakes registered and tied to their drawers' });
    wa.close();
    await waitFor(async () => (await srv.terminals()).find(t => t.id === a.body.terminal.id)?.exited != null, { what: 'the drawer nobody looks at to be ended' });
    assert.match(srv.logText(), /idle 0 h with no page on it — ending it \(chat /);
    const tb = (await srv.terminals()).find(t => t.id === b.body.terminal.id);
    assert.equal(tb.exited, null, 'the one with a page attached runs on'); assert.ok(alive(tb.pid));
    ws.close();
  } finally { await srv.stop(); }
});
