// The routes that write the state file, each read back from the file itself and over a restart (2026-10-14: nothing
// tested them): a named project made, renamed and removed (POST /api/projects, PUT and DELETE /api/projects/:key — a
// removed one's pin goes with it), the pins and the hidden projects as whole lists (PUT /api/pins, /api/hidden — folder
// paths and c:<id>, each once, nothing else), and a chat's title typed on the board (PUT /api/sessions/:id/title — one
// line, 120 characters at most, empty clears it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir } from '../lib/testserver.mjs';
import { makeFixture } from '../scripts/fixture.mjs';

const call = (srv, method, path, body) => srv.api(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

test('projects, pins, hidden and titles: what each route answers is what the state file keeps, over a restart', { timeout: 60_000 }, async () => {
  const fx = makeFixture(tmpDir('peix-fx-'), [{ cwd: '/Users/test/widgets', title: 'Claude\'s title', prompt: 'go', reply: 'went' }]);
  const id = fx.chats[0].id, srv = await startTestServer({ claudeDir: fx.dir });
  const state = () => JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8'));
  const chat = async () => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);
  try {
    // a named project
    assert.deepEqual(await call(srv, 'POST', 'api/projects', { cwds: ['/a'] }), { status: 400, ok: false, body: { error: 'a project needs a name' } });
    assert.equal((await call(srv, 'POST', 'api/projects', { name: 'Work', cwds: ['relative'] })).status, 400, 'a folder is an absolute path');
    const made = await call(srv, 'POST', 'api/projects', { name: '  Work   and  play ', cwds: ['/a', '/b/', '/a'] });
    assert.equal(made.status, 201);
    const p = made.body.project, key = p.id;
    assert.match(key, /^p\w+$/);
    assert.deepEqual([p.name, p.cwds], ['Work and play', ['/a', '/b']], 'one line, each folder once, no trailing slash');
    assert.deepEqual(state().projects, { [key]: p });
    const renamed = await call(srv, 'PUT', `api/projects/${key}`, { name: 'Work' });
    assert.deepEqual(renamed.body.project, { ...p, name: 'Work' }, 'what is not given stands');
    assert.deepEqual(state().projects[key], { ...p, name: 'Work' });
    assert.equal((await call(srv, 'PUT', 'api/projects/nope', { name: 'x' })).status, 404);

    // the pins and the hidden, whole lists
    const pins = await call(srv, 'PUT', 'api/pins', { pins: ['/a', `c:${key}`, 'relative', 'c:with-dash', 7, '/a'] });
    assert.deepEqual(pins.body, { ok: true, pins: ['/a', `c:${key}`] }, 'folders and named projects, each once');
    assert.deepEqual(state().pinned, ['/a', `c:${key}`]);
    assert.equal((await call(srv, 'PUT', 'api/pins', { pins: '/a' })).status, 400);
    const hidden = await call(srv, 'PUT', 'api/hidden', { hidden: ['/old', 'c:gone', '~/x', '/old'] });
    assert.deepEqual(hidden.body, { ok: true, hidden: ['/old', 'c:gone'] });
    assert.deepEqual(state().hidden, ['/old', 'c:gone']);
    assert.equal((await call(srv, 'PUT', 'api/hidden', {})).status, 400);

    // a title typed on the board
    const t = await call(srv, 'PUT', `api/sessions/${id}/title`, { title: '  My\n  own   title ' });
    assert.deepEqual(t.body, { ok: true, title: 'My own title', boardTitle: 'My own title' });
    assert.deepEqual(state().titles, { [id]: 'My own title' });
    assert.equal((await chat()).title, 'My own title', 'it beats the transcript\'s');
    assert.equal((await call(srv, 'PUT', `api/sessions/${id}/title`, { title: 'x'.repeat(200) })).body.boardTitle, 'x'.repeat(120));
    assert.equal((await call(srv, 'PUT', 'api/sessions/nobody/title', { title: 'x' })).status, 404);

    // over a restart, all of it read back
    await call(srv, 'PUT', `api/sessions/${id}/title`, { title: 'Kept' });
    await srv.restart();
    const snap = (await srv.api('api/sessions')).body;
    assert.deepEqual([snap.pins, snap.hidden, snap.projects], [['/a', `c:${key}`], ['/old', 'c:gone'], [{ ...p, name: 'Work' }]]);
    assert.equal((await chat()).title, 'Kept');

    // a project removed takes its pin along; an empty title clears the board's
    assert.deepEqual((await call(srv, 'DELETE', `api/projects/${key}`)).body, { ok: true });
    assert.deepEqual([state().projects, state().pinned], [{}, ['/a']]);
    assert.equal((await call(srv, 'DELETE', `api/projects/${key}`)).status, 404);
    const cleared = await call(srv, 'PUT', `api/sessions/${id}/title`, { title: '   ' });
    assert.deepEqual(cleared.body, { ok: true, title: 'Claude\'s title', boardTitle: null });
    assert.deepEqual(state().titles, {});
  } finally { await srv.stop(); }
});
