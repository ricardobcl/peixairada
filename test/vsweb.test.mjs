// VS Code Web kept on its newest build (2026-10-11): the board asks VS Code's update service which build is the newest
// and, when serve-web's cache has not got it, asks serve-web for that build by name — the download happens then, not
// when the pane is opened — and asks nothing while the cache has it. A fake update service and scripts/fakecode.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
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

test('VS Code Web wants a token of the board\'s own (2026-10-16): kept in the state folder, 0600, handed to the page, traded by serve-web for its cookie, the same after a restart', { timeout: 40_000 }, async () => {
  const srv = await startTestServer();
  try {
    const r = await srv.post('api/vscode-web', {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const file = join(srv.dir, 'vsweb-token');
    assert.equal(statSync(file).mode & 0o777, 0o600, 'the token is this user\'s alone');
    assert.match(r.body.token, /^[0-9a-f]{64}$/); assert.equal(r.body.token, readFileSync(file, 'utf8').trim(), 'the page is given the file\'s');
    assert.equal((await fetch(r.body.url, { redirect: 'manual' })).status, 403, 'serve-web was started with it: no token, no editor');
    const traded = await fetch(`${r.body.url}?folder=%2Ftmp&tkn=${r.body.token}`, { redirect: 'manual' });
    assert.equal(traded.status, 302); assert.equal(traded.headers.get('location'), '/?folder=%2Ftmp', 'the address without it');
    assert.match(traded.headers.get('set-cookie'), new RegExp(`^vscode-tkn=${r.body.token};`));
    await srv.restart();
    const again = await srv.post('api/vscode-web', {});
    assert.equal(again.status, 200, JSON.stringify(again.body)); assert.equal(again.body.token, r.body.token, 'a restart keeps it — the pane\'s cookie with it');
  } finally { await srv.stop(); }
});

test('a VS Code Web on the port that wants no token — one started before 2026-10-16 that outlived its board — is not taken for the board\'s', { timeout: 40_000 }, async () => {
  const port = await freePort();
  const old = spawn(process.execPath, [fileURLToPath(new URL('../scripts/fakecode.mjs', import.meta.url)), 'serve-web', '--host', '127.0.0.1', '--port', String(port), '--without-connection-token'], { stdio: 'ignore' });
  const srv = await startTestServer({ env: { VSWEB_PORT: String(port) } });
  try {
    await waitFor(() => fetch(`http://127.0.0.1:${port}/`).then(r => r.status === 200, () => false), { what: 'the editor with no token answering' });
    const r = await srv.post('api/vscode-web', {});
    assert.equal(r.status, 409, JSON.stringify(r.body)); assert.match(r.body.error, /serves VS Code Web with no token — not this board's/);
    assert.equal(r.body.token, undefined, 'nor is the token handed out for it');
  } finally { await srv.stop(); old.kill(); }
});
