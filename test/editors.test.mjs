// Zed as the editor (2026-10-13): the server says whether Zed is on this Mac, and installs it with Homebrew when the page
// asks — one install at a time, its progress as `editor` events, Launch Services told of the app once it is there; a
// failure is said and the next ask tries again. The test server's own apps folder and scripts/fakebrew.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestServer, waitFor } from '../lib/testserver.mjs';

const FAKE = fileURLToPath(new URL('../scripts/fakebrew.mjs', import.meta.url));
const lines = f => existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n') : [];

test('Zed: not here, installed once however often asked, then here — and Launch Services told', { timeout: 30_000 }, async () => {
  const srv = await startTestServer({ env: { FAKE_BREW_MS: '150' } });
  const log = join(srv.dir, 'brew.log'); srv.env.FAKE_BREW_LOG = log; srv.env.LSREGISTER_BIN = FAKE;
  try {
    await srv.restart();   // with the log, and the fake as lsregister
    assert.deepEqual((await srv.api('api/editors')).body, { zed: { app: null, brew: true, installing: false, line: null, error: null } });
    const a = await srv.post('api/editors/zed/install', {}), b = await srv.post('api/editors/zed/install', {});
    assert.deepEqual([a.status, a.body.zed.installing, b.status, b.body.zed.installing], [202, true, 202, true], 'started, and a second ask joins it');
    const app = join(srv.dir, 'apps', 'Zed.app');
    await waitFor(async () => (await srv.api('api/editors')).body.zed.app === app, { timeout: 15_000, what: 'Zed.app in the apps folder' });
    assert.deepEqual((await srv.api('api/editors')).body.zed, { app, brew: true, installing: false, line: null, error: null });
    await waitFor(() => lines(log).length === 2, { what: 'lsregister asked' });
    assert.deepEqual(lines(log), ['install --cask zed', `-f ${app}`], 'one brew, then Launch Services told of the app');
    const c = await srv.post('api/editors/zed/install', {});
    assert.deepEqual([c.status, c.body.zed.app], [200, app], 'here already: nothing to do');
    assert.equal(lines(log).length, 2, 'no brew run for it');
    assert.match(srv.logText(), /Zed: installed, /);
  } finally { await srv.stop(); }
});

test('Zed: a failed install says brew\'s error, and the next ask tries again', { timeout: 30_000 }, async () => {
  const srv = await startTestServer({ env: { FAKE_BREW_FAIL: '1' } });
  try {
    assert.equal((await srv.post('api/editors/zed/install', {})).status, 202);
    await waitFor(async () => !!(await srv.api('api/editors')).body.zed.error, { timeout: 15_000, what: 'the failure said' });
    const z = (await srv.api('api/editors')).body.zed;
    assert.deepEqual([z.app, z.installing], [null, false]);
    assert.match(z.error, /^Error: Download failed on Cask 'zed'/, 'brew\'s own line');
    assert.equal((await srv.post('api/editors/zed/install', {})).status, 202, 'tried again');
  } finally { await srv.stop(); }
});
