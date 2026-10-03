// Who may ask the server: its own page and no browser at all — never another site's page, which a browser lets POST
// to loopback and open WebSockets there (2026-09-27). Against a throwaway server, with node:http for the Host header
// (fetch will not set it) and the ws client for a WebSocket with an Origin of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import WebSocket from 'ws';
import { startTestServer } from '../lib/testserver.mjs';

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
  } finally { await srv.stop(); }
});
