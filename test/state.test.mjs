// Project input, Peacock's colours moved into the setup once (2026-10-15), and the state file itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-test-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { projectInput, movePeacock, termSummary, summarizeToolInput, toolResultSnippet } = await import('../server.mjs');

test('projectInput: a name and absolute folders, trimmed and deduplicated; errors for the rest', () => {
  const v = projectInput({ name: '  Fees  ', cwds: ['/a/b', '/a/b/', ' /c ', ''] }, { cwds: [] });
  assert.equal(v.name, 'Fees'); assert.deepEqual(v.cwds, ['/a/b', '/c']);
  assert.deepEqual(projectInput({ name: 'x', cwds: ['~/code/x'] }, {}).cwds, [join(homedir(), 'code/x')], '~ is the home, as the placeholder writes it');
  assert.match(projectInput({ name: 'x', cwds: ['/a', 'relative'] }, {}).error, /not relative/, 'a folder that is not absolute is said, not dropped');
  assert.ok(projectInput({ name: '', cwds: ['/a'] }, {}).error);
  assert.ok(projectInput({ name: 'x', cwds: 'nope' }, { cwds: [] }).error);
});

test('small renderers', () => {
  assert.equal(termSummary(null), null);
  assert.match(summarizeToolInput('Bash', { command: 'ls -la' }), /ls -la/);
  assert.match(summarizeToolInput('Read', { file_path: '/a/b.txt' }), /b\.txt/);
  assert.equal(typeof toolResultSnippet({ type: 'tool_result', content: 'hello' }), 'string');
});

// A project's colour was Peacock's until 2026-10-15 — now the setup's, and the first boot since moves what Peacock said
// there under each project's shown name, so the board keeps the colours it showed.
test('movePeacock: each folder\'s Peacock colour under its project\'s name — the nearest settings file, comments seen through', () => {
  const root = join(tmp, 'pc'), put = (dir, text) => { mkdirSync(join(root, dir, '.vscode'), { recursive: true }); writeFileSync(join(root, dir, '.vscode', 'settings.json'), text); };
  put('api', '{\n  // "peacock.color": "#00ff00",\n  "peacock.color": "#0000FF",\n}\n');   // the live key, not the commented one; a trailing comma
  put('web', '{ "workbench.colorCustomizations": { "activityBar.background": "#123456" } }');   // Peacock's derived colour alone
  put('plain', '{ "editor.tabSize": 2 }');
  mkdirSync(join(root, 'api', 'apps', 'x'), { recursive: true });
  mkdirSync(join(root, 'api', '.claude', 'worktrees', 'wt', '.vscode'), { recursive: true });
  writeFileSync(join(root, 'api', '.claude', 'worktrees', 'wt', '.vscode', 'settings.json'), '{ "peacock.color": "#999999" }');
  const cwds = [join(root, 'api', '.claude', 'worktrees', 'wt'), join(root, 'api'), join(root, 'web'), join(root, 'plain'), join(root, 'api', 'apps', 'x'), join(root, 'none')];
  const projs = { api: { abbr: 'A', color: '#ffffff' }, plain: { color: '#abcdef' }, other: { abbr: 'O' } };
  const out = movePeacock(cwds, projs);
  assert.deepEqual(out, {
    api: { abbr: 'A', color: '#0000ff' },   // Peacock's won on the page, over the setup's; the folder before its worktree
    web: { color: '#123456' },
    x: { color: '#0000ff' },                // a folder below a repo wore the repo's
    plain: { color: '#abcdef' }, other: { abbr: 'O' },   // nothing from Peacock: as they were
  });
  assert.equal(projs.api.color, '#ffffff', 'the setup handed in is not changed');
  assert.equal(movePeacock(cwds, out), null, 'nothing new: nothing to write');
  assert.equal(movePeacock([join(root, 'plain')], undefined), null);
});

test('the first boot moves Peacock\'s colours into the setup, and never again', { timeout: 60_000 }, async () => {
  const { startTestServer } = await import('../lib/testserver.mjs');
  const dir = tmpDir('peix-'), cwd = join(tmpDir('peix-pc-'), 'shop');
  mkdirSync(join(cwd, '.vscode'), { recursive: true });
  writeFileSync(join(cwd, '.vscode', 'settings.json'), '{ "peacock.color": "#2f7fd8" }');
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ pinned: [cwd] }));   // a folder the board knows
  const srv = await startTestServer({ dir });
  try {
    const config = () => JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    assert.deepEqual(config().projects, { shop: { color: '#2f7fd8' } });
    assert.match(JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')).peacockMoved, /^20\d\d-/);
    assert.deepEqual((await srv.api('api/config')).body.projects, { shop: { color: '#2f7fd8' } }, 'the board paints it');
    writeFileSync(join(cwd, '.vscode', 'settings.json'), '{ "peacock.color": "#000000" }');
    await srv.restart();
    assert.deepEqual(config().projects, { shop: { color: '#2f7fd8' } }, 'read once: Peacock is no longer the board\'s');
  } finally { await srv.stop(); }
});

test('a state file that does not read is kept aside, not written over; a save is whole or nothing', { timeout: 30_000 }, async () => {
  const { startTestServer } = await import('../lib/testserver.mjs');
  const { readdirSync } = await import('node:fs');
  const dir = tmpDir('peix-');
  writeFileSync(join(dir, 'state.json'), '{"done": {"x": "2026-10-0');   // cut off mid-write
  const srv = await startTestServer({ dir });
  try {
    const bad = readdirSync(dir).filter(f => f.startsWith('state.json.bad-'));
    assert.equal(bad.length, 1, 'kept beside itself');
    assert.equal(readFileSync(join(dir, bad[0]), 'utf8'), '{"done": {"x": "2026-10-0', 'as it was');
    assert.equal((await srv.api('api/notifications', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: false }) })).status, 200);
    assert.equal(JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')).notifications, false, 'the next save is a whole file');
    assert.deepEqual(readdirSync(dir).filter(f => f.endsWith('.tmp')), [], 'and leaves nothing behind');
  } finally { await srv.stop(); }
});

// A server that waits behind another for the port reads the state file once it has the port, not at its start
// (2026-10-14): one that waited (the agent behind the app's own, an npm start beside the agent) booted on the copy it had
// read then and saved it over what the live one had kept meanwhile.
test('a server that waited for the port reads the state as the one before it left it, and saves nothing over it', { timeout: 60_000 }, async () => {
  const { startTestServer, waitFor, sleep } = await import('../lib/testserver.mjs');
  const { spawn } = await import('node:child_process');
  const { closeSync, openSync } = await import('node:fs');
  const a = await startTestServer({ keep: true });
  const blog = join(a.dir, 'b.log'), fd = openSync(blog, 'a');
  // stdin a pipe, held open: a.env carries PEIX_TEST_PARENT, and a test server ends when its stdin does
  let b; try { b = spawn(process.execPath, [join(import.meta.dirname, '..', 'server.mjs')], { env: a.env, stdio: ['pipe', fd, fd] }); } finally { closeSync(fd); }
  const said = re => re.test(readFileSync(blog, 'utf8'));
  const put = (path, body) => fetch(a.url + path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  try {
    await waitFor(() => said(/port \d+ is busy/), { what: 'the second server waiting on the port' });
    assert.deepEqual((await put('api/pins', { pins: ['/acme/made-while-it-waited'] })).pins, ['/acme/made-while-it-waited']);
    await a.stop();
    await waitFor(() => said(/listening on/), { what: 'the second server taking the port' });
    await waitFor(async () => { try { return (await fetch(a.url + 'api/projects')).ok; } catch { return false; } }, { what: 'the second server answering' });
    assert.deepEqual((await (await fetch(a.url + 'api/sessions')).json()).pins, ['/acme/made-while-it-waited'], 'the pin made while it waited');
    await put('api/notifications', { on: false });   // a save
    const st = JSON.parse(readFileSync(a.env.STATE_FILE, 'utf8'));
    assert.deepEqual([st.pinned, st.notifications], [['/acme/made-while-it-waited'], false], 'saved over nothing');
  } finally {
    if (b.exitCode === null) { b.kill('SIGTERM'); await waitFor(() => b.exitCode !== null || b.signalCode, { what: 'the second server ended' }).catch(() => b.kill('SIGKILL')); }
    await sleep(100);
  }
});

// Imported (the tests), the module reads no state file, moves none and writes none (2026-10-14): six test files import it
// with no STATE_FILE of their own, and ran the legacy move and the read on this Mac's real files. A child with a home of
// its own, so the files it would have touched are the test's.
test('an import with no STATE_FILE neither moves the legacy state file nor reads one', { timeout: 30_000 }, async () => {
  const { execFileSync } = await import('node:child_process');
  const { existsSync } = await import('node:fs');
  const home = tmpDir('peix-home-'), legacy = join(home, '.peixairada', 'state.json'), now = join(home, 'Library', 'Application Support', 'peixAIrada', 'state.json');
  mkdirSync(dirname(legacy), { recursive: true }); writeFileSync(legacy, JSON.stringify({ done: { x: '2026-10-01T00:00:00.000Z' } }));
  const env = { ...process.env, HOME: home, CLAUDE_DIR: join(home, 'claude'), USAGE: 'off', NOTIFY: 'off' };
  for (const k of ['STATE_FILE', 'CONFIG_FILE', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME']) delete env[k];
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(new URL('../server.mjs', import.meta.url).href)}); console.log(JSON.stringify(m.doneMarks)); process.exit(0);`], { env, encoding: 'utf8' });
  assert.equal(out.trim().split('\n').at(-1), '{}', 'nothing read');
  assert.ok(existsSync(legacy) && !existsSync(now), 'nothing moved');
});
