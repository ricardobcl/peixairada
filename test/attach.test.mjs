// A file dropped on the board from a browser (PUT /api/attach?session=&name=): its bytes written beside the state file,
// per chat, under a name that cannot leave that folder, deduplicated; and one over ATTACH_MAX refused with a 413 that
// reaches the page, said or streamed, and `connection: close` (2026-10-14: nothing tested it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { startTestServer } from '../lib/testserver.mjs';

const MAX = 50 * 1024 * 1024;   // server.mjs's ATTACH_MAX
/** A request by hand, for what fetch hides: the body in `chunks` written one by one (no content-length: chunked), and
 *  the answer's headers; `sent` says how writing the body ended. With `none`, the head alone goes and the answer is
 *  awaited before a byte of the body: a refusal said up front. */
function send(srv, method, path, { chunks = [], headers = {}, none = false } = {}) {
  return new Promise((resolve, reject) => {
    let answer = null, sent = none ? 'none' : null;
    const settle = () => { if (answer && sent) { resolve({ ...answer, sent }); if (none) req.destroy(); } };
    const req = request(new URL(path, srv.url), { method, headers: { 'x-peix-key': srv.key, ...headers } }, res => {
      let body = '';
      res.setEncoding('utf8'); res.on('data', c => { body += c; });
      res.on('end', () => { answer = { status: res.statusCode, headers: res.headers, body: JSON.parse(body || 'null') }; settle(); });
    });
    req.on('error', e => { if (!answer) return reject(e); sent ||= e.code || e.message; settle(); });
    req.on('finish', () => { sent ||= 'sent'; settle(); });
    if (none) return req.flushHeaders();
    (async () => { for (const c of chunks) { if (!req.write(c)) await new Promise(r => req.once('drain', r)); } req.end(); })().catch(() => {});
  });
}
const put = (srv, query, buf) => send(srv, 'PUT', `api/attach?${new URLSearchParams(query)}`, { chunks: [buf], headers: { 'content-length': buf.length } });

test('a dropped file: written under the chat, its name made safe and kept apart from one already there', { timeout: 60_000 }, async () => {
  const srv = await startTestServer();
  const dir = join(srv.dir, 'attachments');
  try {
    const a = await put(srv, { session: 'chat-1', name: 'notes.txt' }, Buffer.from('hello'));
    assert.equal(a.status, 200);
    assert.deepEqual(a.body, { ok: true, path: join(dir, 'chat-1', 'notes.txt'), bytes: 5 });
    assert.equal(readFileSync(a.body.path, 'utf8'), 'hello');
    const again = await put(srv, { session: 'chat-1', name: 'notes.txt' }, Buffer.from('second'));
    assert.equal(again.body.path, join(dir, 'chat-1', 'notes-2.txt'), 'the same name again is another file');
    assert.equal(readFileSync(join(dir, 'chat-1', 'notes.txt'), 'utf8'), 'hello', 'and the first stands');

    const name = async (n, session = 'chat-1') => (await put(srv, { session, name: n }, Buffer.from('x'))).body.path;
    assert.equal(await name('../../escape me?.txt'), join(dir, 'chat-1', 'escape me_.txt'), 'the path is dropped, the odd characters become _');
    assert.equal(await name('...hidden'), join(dir, 'chat-1', 'hidden'), 'no dot file');
    assert.equal(await name('relatório (1).pdf'), join(dir, 'chat-1', 'relat_rio (1).pdf'));
    assert.equal(await name('n'.repeat(300) + '.txt'), join(dir, 'chat-1', 'n'.repeat(120)), 'a long name is cut');
    assert.equal(await name('..'), join(dir, 'chat-1', 'file'), 'nothing left is "file"');
    assert.equal(await name('ok.txt', '../elsewhere'), join(dir, 'inbox', 'ok.txt'), 'a session that is no id: the inbox');
    assert.equal((await put(srv, { session: 'chat-2' }, Buffer.from('x'))).body.path, join(dir, 'chat-2', 'file'), 'no name: "file"');
    assert.deepEqual(readdirSync(dir).sort(), ['chat-1', 'chat-2', 'inbox'], 'nothing written outside a chat\'s folder');
  } finally { await srv.stop(); }
});

test('over 50 MB: a 413 that reaches the page, the connection closed after it, nothing written', { timeout: 120_000 }, async () => {
  const srv = await startTestServer();
  try {
    // said up front: read to its end all the same, kept nowhere, then refused — refused at once, the close after the
    // answer met the body still coming, and its reset beat the answer to the page (2026-10-14, 1 run in 9 under load)
    for (let i = 0; i < 3; i++) {
      const said = await send(srv, 'PUT', 'api/attach?session=chat-1&name=big.bin', { headers: { 'content-length': MAX + 1 }, chunks: [Buffer.alloc(MAX + 1, 0x61)] });
      assert.equal(said.status, 413);
      assert.deepEqual(said.body, { error: 'larger than 50 MB' });
      assert.equal(said.headers.connection, 'close');
      assert.equal(said.sent, 'sent', 'the whole body went: nothing was reset under it');
    }
    // not said (chunked): read to its end — the whole body sent —, then refused the same way
    const chunks = Array.from({ length: 51 }, () => Buffer.alloc(1024 * 1024, 0x62));
    const streamed = await send(srv, 'PUT', 'api/attach?session=chat-1&name=stream.bin', { chunks });
    assert.equal(streamed.status, 413);
    assert.equal(streamed.headers.connection, 'close');
    assert.equal(streamed.sent, 'sent');
    assert.equal(existsSync(join(srv.dir, 'attachments', 'chat-1')), false, 'nothing written for either');
    // the server is none the worse, and the limit itself is accepted
    const fits = await put(srv, { session: 'chat-1', name: 'fits.bin' }, Buffer.alloc(MAX, 0x63));
    assert.equal(fits.status, 200); assert.equal(fits.body.bytes, MAX);
  } finally { await srv.stop(); }
});
