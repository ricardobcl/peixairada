// Who may ask the server: its own page and no browser at all — never another site's page, which a browser lets POST
// to loopback and open WebSockets there (2026-09-27). Against a throwaway server, with node:http for the Host header
// (fetch will not set it) and the ws client for a WebSocket with an Origin of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { hostname } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { startTestServer, tmpDir } from '../lib/testserver.mjs';

const ask = (srv, headers, method = 'GET', path = '/api/sessions') => new Promise((res, rej) => {
  const r = request({ host: '127.0.0.1', port: srv.port, method, path, headers }, resp => { resp.resume(); resp.on('end', () => res(resp.statusCode)); });
  r.on('error', rej); r.end();
});
/** The status the upgrade was refused with, or 'open' */
const wsStatus = (srv, headers) => new Promise(res => {
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/api/terminals/nothing/ws`, { headers });
  ws.on('unexpected-response', (_req, resp) => { res(resp.statusCode); ws.terminate(); });
  ws.on('open', () => { res('open'); ws.close() }); ws.on('error', e => res(`error: ${e.code || e.message}`));   // a refused connection fails now, not at the test's timeout
});

test('another origin is refused on every route and on the terminal socket; the board and no browser are not', { timeout: 20_000 }, async () => {
  const srv = await startTestServer({});
  try {
    const mine = `http://127.0.0.1:${srv.port}`;
    assert.equal(await ask(srv, {}), 200, 'no Origin: curl, the app, the tests');
    assert.equal(await ask(srv, { origin: mine }), 200, 'the board\'s own page');
    assert.equal(await ask(srv, { origin: `http://localhost:${srv.port}` }), 200, 'the board by another loopback name');
    assert.equal(await ask(srv, { origin: 'https://evil.example' }), 403, 'another site\'s page');
    assert.equal(await ask(srv, { origin: 'http://127.0.0.1:1' }), 403, 'loopback, but not this server');
    assert.equal(await ask(srv, { origin: 'null' }), 403, 'a file:// page or a sandboxed frame');
    assert.equal(await ask(srv, { origin: 'https://evil.example' }, 'POST', '/api/terminals'), 403, 'the routes that start things');
    assert.equal(await ask(srv, { host: 'board.evil.example' }), 403, 'a DNS name pointed at 127.0.0.1');
    assert.equal(await ask(srv, { host: `localhost:${srv.port}` }), 200);
    assert.equal(await wsStatus(srv, { origin: 'https://evil.example' }), 403, 'the terminal socket refuses before it looks the terminal up');
    assert.equal(await wsStatus(srv, {}), 404, 'no Origin reaches the lookup (and this terminal does not exist)');
    assert.equal(await wsStatus(srv, { origin: mine }), 404, 'so does the board\'s page');
    // a browser sends no Origin on an <img>, a <script> or a navigation — Sec-Fetch-Site says whose page it was
    assert.equal(await ask(srv, { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' }, 'GET', '/api/launchers?cwd=/tmp'), 403, 'another site\'s <img> on a route');
    assert.equal(await ask(srv, { 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'navigate' }, 'GET', '/api/sessions'), 403, 'another port\'s page sending the tab to a route');
    assert.equal(await ask(srv, { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }, 'GET', '/'), 200, 'a link to the board itself');
    assert.equal(await ask(srv, { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' }), 200, 'the board\'s own fetch');
    assert.equal(await ask(srv, { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate' }), 200, 'the address typed');
  } finally { await srv.stop(); }
});

// Bound past loopback (HOST 0.0.0.0, or one of the LAN's addresses): judged by foreignTo itself, since a test server bound
// so would have the firewall ask the user whether node may take connections (2026-10-14). A name rebound to the Mac's
// address — the page and its Origin both on it — was the board's own page; and with HOST a LAN address, a client on the
// LAN that sent no Origin reached every route.
test('bound past loopback, only an address, a loopback name or this Mac\'s name is a Host, and no Origin is only for this Mac', async () => {
  const tmp = tmpDir();
  process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
  const { foreignTo } = await import('../server.mjs');
  const me = hostname().toLowerCase(), lan = '203.0.113.7';   // TEST-NET: no Mac's own address
  const req = (headers, remoteAddress = '127.0.0.1') => ({ headers, url: '/api/terminals', socket: { remoteAddress } });
  for (const bind of ['0.0.0.0', '::', '192.168.1.5']) {
    const foreign = foreignTo(bind, 7331), says = (r, what) => assert.ok(foreign(r), `${bind}: ${what} is refused`), ok = (r, what) => assert.equal(foreign(r), null, `${bind}: ${what} passes`);
    says(req({ host: 'rebind.acme.example:7331', origin: 'http://rebind.acme.example:7331', 'sec-fetch-site': 'same-origin' }), 'a rebound name, from this Mac');
    says(req({ host: 'rebind.acme.example:7331', origin: 'http://rebind.acme.example:7331', 'sec-fetch-site': 'same-origin' }, lan), 'a rebound name, from the LAN');
    says(req({ host: 'rebind.acme.example:7331' }), 'a rebound name with no Origin');
    says(req({ host: '192.168.1.5:7331' }, lan), 'no Origin from the LAN');
    says(req({ host: '192.168.1.5:7331', origin: 'http://192.168.1.20:7331' }, lan), 'another machine\'s page');
    ok(req({ host: '192.168.1.5:7331', origin: 'http://192.168.1.5:7331' }, lan), 'a browser on the LAN at the board\'s address');
    ok(req({ host: '127.0.0.1:7331' }), 'no Origin on this Mac');
    ok(req({ host: '127.0.0.1:7331', origin: 'http://127.0.0.1:7331' }), 'the board\'s own page');
    ok(req({ host: '[::1]:7331', origin: 'http://[::1]:7331' }, '::1'), 'the board by v6 loopback');
    ok(req({ host: `${me}:7331`, origin: `http://${me}:7331` }), 'this Mac\'s own name');
    ok(req({ host: `${me.replace(/\.local$/, '')}.local:7331`, origin: `http://${me.replace(/\.local$/, '')}.local:7331` }, lan), 'this Mac\'s .local name, from the LAN');
  }
  const loop = foreignTo('127.0.0.1', 7331);
  assert.ok(loop(req({ host: '192.168.1.5:7331' })), 'on loopback, an address is no Host');
  assert.ok(loop(req({ host: `${me}:7331` })), '…nor this Mac\'s name');
  assert.equal(loop(req({ host: 'localhost:7331' })), null);
});
