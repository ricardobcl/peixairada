// ⌥⌘Z's hero's face (2026-10-30): Settings frames a picture and PUTs the oval's box, a PNG, kept beside the setup file;
// GET hands it back as a data: URL, null with none or one past ZE_FACE_MAX; DELETE lets it go. Only with the board's key
// — it is a picture of a person.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer } from '../lib/testserver.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('/api/ze: a PNG put, read back, refused when not one or too large, deleted; keyed', { timeout: 30_000 }, async () => {
  const srv = await startTestServer();
  try {
    const face = join(srv.dir, 'ze.png');   // the test server's setup file is beside its state file
    const put = body => srv.api('api/ze', { method: 'PUT', headers: { 'content-type': 'image/png' }, body });
    assert.deepEqual((await srv.api('api/ze')).body, { face: null }, 'none: the page draws a face');
    const r = await put(PNG);
    assert.equal(r.status, 200);
    assert.equal(r.body.face, `data:image/png;base64,${PNG.toString('base64')}`);
    assert.deepEqual(readFileSync(face), PNG, 'kept beside the setup file');
    assert.equal(statSync(face).mode & 0o777, 0o600, 'a picture of a person: the user\'s alone');
    assert.equal((await srv.api('api/ze')).body.face, r.body.face, 'and handed back');
    assert.equal((await put(Buffer.from('GIF89a…'))).status, 400, 'not a PNG');
    assert.equal((await put(Buffer.concat([PNG, Buffer.alloc(2 << 20)]))).status, 413, 'past ZE_FACE_MAX');
    assert.deepEqual(readFileSync(face), PNG, 'a refused one leaves the face as it was');
    for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await fetch(srv.url + 'api/ze', { method })).status, 401, `${method} without the key: nothing`);
    assert.deepEqual((await srv.api('api/ze', { method: 'DELETE' })).body, { face: null });
    assert.equal(existsSync(face), false, 'deleted: gone');
    writeFileSync(face, PNG);
    assert.equal((await srv.api('api/ze')).body.face, r.body.face, 'one put there by hand is worn too, read on each ask');
    rmSync(face);
  } finally { await srv.stop(); }
});
