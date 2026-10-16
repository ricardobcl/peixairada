// The board's key (2026-10-16): every route but the page itself wants it — a container, another account or the LAN that
// reaches the port writes its own Host and Origin, so foreign() alone let them read every transcript and type into a
// drawer. A wrong key is refused always; none, once the key is required: at once on a test server (KEY_MODE enforce),
// else from the app's page coming with it or a boot with no app to wait for. A browser gets it by a ticket on a tab the
// server opens itself (a fake `open` here, scripts/fakeopen.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';

const bare = (srv, path, opts = {}) => fetch(srv.url + path, opts).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
const as = key => ({ headers: { 'x-peix-key': key } });
/** The status a drawer's socket is refused with, or 'open'. */
const socket = url => new Promise(res => {
  const ws = new WebSocket(url);
  ws.onopen = () => { res('open'); ws.close(); };
  ws.onerror = () => res('refused');
});
/** A stream held open: its status, and whether the server has ended it. */
async function stream(url) {
  const ctl = new AbortController(), res = await fetch(url, { signal: ctl.signal });
  const reader = res.body?.getReader(), ended = res.ok ? (async () => { try { while (!(await reader.read()).done); } catch {} return true; })() : Promise.resolve(true);
  let over = false; ended.then(() => { over = true; });
  return { status: res.status, over: () => over, stop: () => ctl.abort() };
}

test('every route but the page wants the key: missing and wrong are 401s that say which, the stream and the sockets by ?key=', { timeout: 30_000 }, async () => {
  const srv = await startTestServer();
  try {
    const file = join(srv.dir, 'key');
    assert.equal(statSync(file).mode & 0o777, 0o600, 'the key is this user\'s alone');
    assert.match(srv.key, /^[0-9a-f]{64}$/);
    assert.equal((await fetch(srv.url)).status, 200, 'the page itself is open — it is code, no data');
    assert.equal((await fetch(srv.url + 'vendor/marked.min.js')).status, 200, '…and its vendored files');
    assert.equal((await fetch(srv.url + 'api/alive')).status, 204, '…and the probe of whether the server is up');
    assert.deepEqual(await bare(srv, 'api/sessions'), { status: 401, body: { error: 'this board wants its key', key: 'missing' } });
    assert.deepEqual(await bare(srv, 'api/sessions', as('0'.repeat(64))), { status: 401, body: { error: 'not this board\'s key', key: 'wrong' } });
    assert.equal((await bare(srv, 'api/sessions', as(srv.key))).status, 200);
    assert.equal((await bare(srv, `api/sessions?key=${srv.key}`)).status, 200, 'or in the query, where no header can go');
    assert.equal((await bare(srv, 'api/terminals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"cwd":"/tmp"}' })).status, 401, 'what starts a shell, above all');
    const keyless = await stream(srv.url + 'events'), keyed = await stream(`${srv.url}events?key=${srv.key}`);
    assert.deepEqual([keyless.status, keyed.status], [401, 200], 'the stream');
    keyed.stop();
    assert.equal(await socket(`${srv.url.replace(/^http/, 'ws')}api/terminals/nothing/ws`), 'refused', 'a drawer\'s socket with no key');
    assert.equal(await socket(`${srv.url.replace(/^http/, 'ws')}api/terminals/nothing/ws?key=${'0'.repeat(64)}`), 'refused', '…or a wrong one');
    const t = await srv.post('api/sessions/none/shell', {});   // no chat: a 404, past the key
    assert.equal(t.status, 404);
  } finally { await srv.stop(); }
});

test('a browser gets the key by a ticket on a tab the server opens itself: one use, a minute, one tab per 10 s', { timeout: 30_000 }, async () => {
  const srv = await startTestServer();
  try {
    const opened = () => existsSync(join(srv.dir, 'opened')) ? readFileSync(join(srv.dir, 'opened'), 'utf8').trim().split('\n') : [];
    const r = await bare(srv, 'api/key/open', { method: 'POST' });
    assert.equal(r.status, 202, 'open to anyone: the key goes to this Mac\'s screen, not to whoever asked');
    assert.equal(r.body.key, undefined);
    await waitFor(() => opened().length === 1, { what: 'the tab "opened"' });
    const [, ticket] = opened()[0].match(new RegExp(`^${srv.url.replace(/[.]/g, '\\.')}#ticket=([\\w-]+)$`)) || [];
    assert.ok(ticket, `a tab at the board with a ticket: ${opened()[0]}`);
    assert.equal((await bare(srv, 'api/key/open', { method: 'POST' })).status, 429, 'a second tab only after 10 s');
    const claim = t => bare(srv, 'api/key/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket: t }) });
    assert.equal((await claim('made-up')).status, 403);
    assert.deepEqual(await claim(ticket), { status: 200, body: { key: srv.key } }, 'the ticket is the key');
    assert.equal((await claim(ticket)).status, 403, 'once');
  } finally { await srv.stop(); }
});

test('a new key turns every page away but the one that asked for it, the open streams with them', { timeout: 30_000 }, async () => {
  const srv = await startTestServer();
  try {
    const old = srv.key, held = await stream(`${srv.url}events?key=${old}`);
    const r = await srv.post('api/key/new', {});
    assert.equal(r.status, 200); assert.notEqual(r.body.key, old); assert.equal(r.body.key, srv.key, 'written to the file');
    assert.equal((await bare(srv, 'api/sessions', as(old))).body.key, 'wrong');
    await waitFor(() => held.over(), { what: 'the stream with the old key ended' });
  } finally { await srv.stop(); }
});

test('on a board updated to it: no key is still answered while the app runs from before — until its page comes with the key, and for good', { timeout: 40_000 }, async () => {
  const dir = tmpDir('peix-');
  mkdirSync(join(dir, 'peixAIrada.app'));   // an app installed (BOARD_APP), one that may not hand its page the key yet
  const srv = await startTestServer({ dir, env: { KEY_MODE: '' } });
  try {
    assert.equal((await bare(srv, 'api/sessions')).status, 200, 'no key: answered while it is not required');
    assert.match(srv.logText(), /answered GET \/api\/sessions with no key — not required until the app's page brings it/);
    assert.equal((await bare(srv, 'api/sessions', as('0'.repeat(64)))).status, 401, 'a wrong one never');
    assert.equal((await bare(srv, 'api/sessions', as(srv.key))).status, 200, 'a browser with the key does not make it required');
    assert.equal((await bare(srv, 'api/sessions')).status, 200);
    const keyless = await stream(srv.url + 'events');
    assert.equal(keyless.status, 200);
    assert.equal((await bare(srv, 'api/sessions', { headers: { 'x-peix-key': srv.key, 'x-peix-app': '1' } })).status, 200, 'the app\'s page with the key');
    assert.match(srv.logText(), /the board's key is required from now on — the app's page came with it/);
    assert.equal((await bare(srv, 'api/sessions')).status, 401, 'no key is refused from then on');
    await waitFor(() => keyless.over(), { what: 'the stream that came in with no key ended' });
    assert.equal(JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')).keyEnforced, true);
    await srv.restart();
    assert.equal((await bare(srv, 'api/sessions')).status, 401, 'and for good');
  } finally { await srv.stop(); }
});

test('with no app installed the key is required from the first boot; Settings can require it any time', { timeout: 40_000 }, async () => {
  const srv = await startTestServer({ env: { KEY_MODE: '' } });   // BOARD_APP: an app the test server never has
  try {
    assert.equal((await bare(srv, 'api/sessions')).status, 401);
    assert.match(srv.logText(), /the board's key is required from now on — no app at .* to wait for/);
  } finally { await srv.stop(); }
  const dir = tmpDir('peix-'); mkdirSync(join(dir, 'peixAIrada.app'));
  const two = await startTestServer({ dir, env: { KEY_MODE: '' } });
  try {
    assert.deepEqual((await two.api('api/key')).body, { required: false, mode: null, file: join(dir, 'key') });
    assert.equal((await two.api('api/key', { method: 'PUT' })).body.required, true);
    assert.equal((await bare(two, 'api/sessions')).status, 401);
  } finally { await two.stop(); }
});
