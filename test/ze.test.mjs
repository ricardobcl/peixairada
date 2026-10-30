// ⌥⌘Z's hero wears ze.png from beside the setup file (2026-10-30): GET /api/ze hands it to the page as a data: URL,
// null with none or one past ZE_FACE_MAX, and only with the board's key — it is a picture of a person.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer } from '../lib/testserver.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('GET /api/ze: the face beside the setup file, read on each ask, null without one, keyed', { timeout: 30_000 }, async () => {
  const srv = await startTestServer();
  try {
    const face = join(srv.dir, 'ze.png');   // the test server's setup file is beside its state file
    assert.deepEqual((await srv.api('api/ze')).body, { face: null }, 'no picture: the page draws a face');
    writeFileSync(face, PNG);
    const r = await srv.api('api/ze');
    assert.equal(r.status, 200);
    assert.equal(r.body.face, `data:image/png;base64,${PNG.toString('base64')}`, 'put there after the boot: worn at once');
    assert.equal((await fetch(srv.url + 'api/ze')).status, 401, 'without the key: nothing');
    writeFileSync(face, Buffer.alloc((2 << 20) + 1));
    assert.equal((await srv.api('api/ze')).body.face, null, 'past ZE_FACE_MAX: none');
    rmSync(face);
    assert.equal((await srv.api('api/ze')).body.face, null, 'taken away: gone');
  } finally { await srv.stop(); }
});
