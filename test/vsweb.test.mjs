// VS Code Web kept on its newest build (2026-10-11): the board asks VS Code's update service which build is the newest
// and, when serve-web's cache has not got it, asks serve-web for that build by name — the download happens then, not
// when the pane is opened — and asks nothing while the cache has it. A fake update service and scripts/fakecode.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, sleep, startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';

test('the newest build is fetched in the background, once, and serve-web started for it', { timeout: 60_000 }, async () => {
  const cli = tmpDir('peix-vscli-'), log = join(cli, 'requests');
  let newest = { name: '1.142.0', version: 'a'.repeat(40) };
  const asked = [];
  const upd = createServer((req, res) => { asked.push(req.url); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(newest)); });
  await new Promise(r => upd.listen(0, '127.0.0.1', r));
  const srv = await startTestServer({ env: {
    CODE_BIN: fileURLToPath(new URL('../scripts/fakecode.mjs', import.meta.url)), VSWEB_PORT: String(await freePort()), VSCODE_CLI_DATA_DIR: cli, FAKE_CODE_LOG: log,
    VSWEB_UPDATE_URL: `http://127.0.0.1:${upd.address().port}/api/latest`, VSWEB_FRESH_MS: '400' } });
  const requests = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  try {
    await waitFor(() => existsSync(join(cli, 'serve-web', 'a'.repeat(40), 'product.json')), { what: 'the newest build in serve-web\'s cache' });
    assert.match(asked[0], /^\/api\/latest\/server-darwin-(arm64|x64)-web\/stable$/, 'the update service asked for the web server build of this Mac');
    assert.deepEqual(requests(), [`GET /stable-${'a'.repeat(40)}/`], 'serve-web started for it and asked for that build by name — not its root, which starts a server');
    assert.match(srv.logText(), /VS Code Web: 1\.142\.0 is out — serve-web fetching it in the background, started for it/);
    await sleep(1500);
    assert.ok(asked.length >= 3, 'asked again on every tick');
    assert.equal(requests().length, 1, 'the cache has it: serve-web is asked nothing more');
    newest = { name: '1.143.0', version: 'b'.repeat(40) };   // a release comes out
    await waitFor(() => existsSync(join(cli, 'serve-web', 'b'.repeat(40), 'product.json')), { what: 'the next build' });
    assert.deepEqual(requests(), [`GET /stable-${'a'.repeat(40)}/`, `GET /stable-${'b'.repeat(40)}/`], 'the next one fetched the same way, from the serve-web already running');
  } finally {
    await srv.stop(); upd.close();
  }
});
