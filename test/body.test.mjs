// A JSON body as every route reads it (jsonBody over readRaw): none, unparseable, not an object or past BODY_MAX — said
// up front or streamed — all read as {}, and the route answers as for an empty body; the server is none the worse.
// Decoded whole: a character split across two chunks arrives as itself (2026-10-03). Through PUT /api/pins, which
// says what it read, and POST /api/projects (2026-10-14: nothing tested it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { startTestServer } from '../lib/testserver.mjs';

/** A request by hand: the body in `chunks`, each written after a pause (no content-length unless given: chunked). */
function send(srv, method, path, chunks, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, srv.url), { method, headers: { 'content-type': 'application/json', 'x-peix-key': srv.key, ...headers } }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || 'null') }));
    });
    req.on('error', reject);
    (async () => { for (const c of chunks) { req.write(c); await new Promise(r => setTimeout(r, 60)); } req.end(); })().catch(reject);
  });
}
const pins = (srv, text, headers) => send(srv, 'PUT', 'api/pins', text === null ? [] : [Buffer.from(text)], headers);
const EMPTY = { status: 400, body: { error: 'expected {pins: [key]}' } };

test('a body that is not a JSON object reads as {}: none, unparseable, an array, a string, null', { timeout: 60_000 }, async () => {
  const srv = await startTestServer();
  try {
    assert.deepEqual(await pins(srv, '{"pins": ["/a"]}'), { status: 200, body: { ok: true, pins: ['/a'] } }, 'an object is read');
    for (const text of [null, '', '{"pins": [', 'pins=/b', '[["/b"]]', '"/b"', 'null', '42']) assert.deepEqual(await pins(srv, text), EMPTY, `body ${JSON.stringify(text)}`);
    assert.deepEqual(JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).pinned, ['/a'], 'nothing it could not read was saved');
  } finally { await srv.stop(); }
});

test('past BODY_MAX, said up front or streamed, a body reads as {}; one at the limit is read', { timeout: 60_000 }, async () => {
  const srv = await startTestServer();
  try {
    const padded = n => JSON.stringify({ pins: ['/big'], pad: 'x'.repeat(n) });
    const over = padded(1e6), under = padded(1e6 - padded(0).length);
    assert.equal(Buffer.byteLength(under), 1e6);
    assert.deepEqual(await pins(srv, over, { 'content-length': Buffer.byteLength(over) }), EMPTY, 'said up front');
    const halves = [over.slice(0, 600_000), over.slice(600_000)].map(s => Buffer.from(s));
    assert.deepEqual(await send(srv, 'PUT', 'api/pins', halves), EMPTY, 'streamed');
    assert.deepEqual(await pins(srv, under), { status: 200, body: { ok: true, pins: ['/big'] } }, 'the limit itself');
    assert.equal((await srv.api('api/projects')).status, 200, 'and the server answers on');
  } finally { await srv.stop(); }
});

test('a character split across two chunks is read whole', { timeout: 60_000 }, async () => {
  const srv = await startTestServer();
  try {
    const body = Buffer.from(JSON.stringify({ name: 'Ação — não', cwds: ['/work/ação'] })), cut = body.indexOf(Buffer.from('ç')) + 1;
    const r = await send(srv, 'POST', 'api/projects', [body.subarray(0, cut), body.subarray(cut)]);
    assert.equal(r.status, 201);
    assert.equal(r.body.project.name, 'Ação — não');
    assert.deepEqual(r.body.project.cwds, ['/work/ação']);
  } finally { await srv.stop(); }
});
