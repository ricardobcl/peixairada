// Project input and the Peacock colour written into a JSONC settings file — the pure parts, no server running.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-test-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { projectInput, writePeacock, readPeacock, termSummary, summarizeToolInput, toolResultSnippet } = await import('../server.mjs');

test('projectInput: a name and absolute folders, trimmed and deduplicated; errors for the rest', () => {
  const v = projectInput({ name: '  Fees  ', cwds: ['/a/b', '/a/b/', ' /c ', ''] }, { cwds: [] });
  assert.equal(v.name, 'Fees'); assert.deepEqual(v.cwds, ['/a/b', '/c']);
  assert.deepEqual(projectInput({ name: 'x', cwds: ['~/code/x'] }, {}).cwds, [join(homedir(), 'code/x')], '~ is the home, as the placeholder writes it');
  assert.match(projectInput({ name: 'x', cwds: ['/a', 'relative'] }, {}).error, /not relative/, 'a folder that is not absolute is said, not dropped');
  assert.ok(projectInput({ name: '', cwds: ['/a'] }, {}).error);
  assert.ok(projectInput({ name: 'x', cwds: 'nope' }, { cwds: [] }).error);
});

test('writePeacock: insert first, replace in place, remove with its comma — comments and other keys untouched', () => {
  const cwd = join(tmp, 'repo'); mkdirSync(join(cwd, '.vscode'), { recursive: true });
  const file = join(cwd, '.vscode', 'settings.json');
  writeFileSync(file, '{\n  // editor\n  "editor.tabSize": 2,\n  "files.exclude": { "a": true }\n}\n');
  let r = writePeacock(cwd, '#112233');
  assert.equal(r.file, file); assert.equal(r.changed, true);
  let text = readFileSync(file, 'utf8');
  assert.match(text, /"peacock\.color": "#112233"/); assert.match(text, /\/\/ editor/); assert.match(text, /"editor\.tabSize": 2/);
  assert.equal(readPeacock(cwd)?.color, '#112233');
  r = writePeacock(cwd, '#445566');
  text = readFileSync(file, 'utf8');
  assert.equal((text.match(/peacock\.color/g) || []).length, 1); assert.match(text, /#445566/);
  r = writePeacock(cwd, null);
  text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /peacock/); assert.match(text, /"editor\.tabSize": 2/); assert.match(text, /"files\.exclude"/);
  assert.doesNotThrow(() => JSON.parse(text.replace(/\/\/.*$/gm, '')));
});

// The JSONC as people write it (2026-10-14): taking the colour out ate the comment on the line after it and left a leading
// comma behind; a `null` typed in was not seen, and setting the colour added a second key; a file of comments alone lost
// them; a CRLF file got a bare LF.
test('writePeacock: comments after the key, commas that lead, a null value, a file of comments, CRLF', () => {
  const cwd = join(tmp, 'jsonc'); mkdirSync(join(cwd, '.vscode'), { recursive: true });
  const f = join(cwd, '.vscode', 'settings.json');
  const write = (text, color) => { writeFileSync(f, text); writePeacock(cwd, color); return readFileSync(f, 'utf8'); };
  const parses = text => JSON.parse(text.replace(/("(?:[^"\\\n]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? '').replace(/,(\s*[}\]])/g, '$1'));
  const cases = [
    ['{\n  "peacock.color": "#aabbcc"\n  // trailing\n  , "a": 1\n}\n', null, '{\n  // trailing\n   "a": 1\n}\n', 'the first, commas leading, a comment after it'],
    ['{\n  "a": 1,\n  "peacock.color": "#aabbcc"\n  // the colour above\n}\n', null, '{\n  "a": 1\n  // the colour above\n}\n', 'the last, a comment after it'],
    ['{\n  "a": 1\n  , "peacock.color": "#aabbcc"\n  , "b": 2\n}\n', null, '{\n  "a": 1\n  , "b": 2\n}\n', 'in the middle, commas leading'],
    ['{ "peacock.color": "#aabbcc"\n, "a": 1 }\n', null, '{ \n "a": 1 }\n', 'the first on the brace\'s line, commas leading'],
    ['{\n  "peacock.color": null\n}\n', null, '{\n}\n', 'a null taken out'],
    ['{\n  "editor.tabSize": 2,\n  "peacock.color": null\n}\n', '#112233', '{\n  "editor.tabSize": 2,\n  "peacock.color": "#112233"\n}\n', 'a null set: the one key'],
    ['// my settings\n', '#112233', '// my settings\n{\n  "peacock.color": "#112233"\n}\n', 'a file of comments keeps them'],
    ['{\r\n  "a": 1\r\n}\r\n', '#112233', '{\r\n  "peacock.color": "#112233",\r\n  "a": 1\r\n}\r\n', 'CRLF stays CRLF'],
  ];
  for (const [text, color, want, what] of cases) {
    const got = write(text, color);
    assert.equal(got, want, what);
    assert.doesNotThrow(() => parses(got), what);
  }
});

test('writePeacock: a folder without settings gets a new .vscode/settings.json', () => {
  const cwd = join(tmp, 'fresh'); mkdirSync(cwd, { recursive: true });
  const r = writePeacock(cwd, '#abcdef');
  assert.equal(r.file, join(cwd, '.vscode', 'settings.json'));
  assert.equal(JSON.parse(readFileSync(r.file, 'utf8'))['peacock.color'], '#abcdef');
});

test('small renderers', () => {
  assert.equal(termSummary(null), null);
  assert.match(summarizeToolInput('Bash', { command: 'ls -la' }), /ls -la/);
  assert.match(summarizeToolInput('Read', { file_path: '/a/b.txt' }), /b\.txt/);
  assert.equal(typeof toolResultSnippet({ type: 'tool_result', content: 'hello' }), 'string');
});

test('writePeacock and readPeacock see through comments: a brace or a key in one is neither written into nor read', () => {
  const cwd = join(tmp, 'commented'); mkdirSync(join(cwd, '.vscode'), { recursive: true });
  const f = join(cwd, '.vscode', 'settings.json');
  writeFileSync(f, '// shared settings, see {wiki}\n{\n  "editor.tabSize": 2\n}\n');
  writePeacock(cwd, '#123456');
  assert.equal(readFileSync(f, 'utf8'), '// shared settings, see {wiki}\n{\n  "peacock.color": "#123456",\n  "editor.tabSize": 2\n}\n', 'into the object, not the comment');
  writeFileSync(f, '{\n  // "peacock.color": "#00ff00",\n  "peacock.color": "#0000ff",\n  "a": 1\n}\n');
  assert.equal(readPeacock(cwd).color, '#0000ff', 'the live key, not the commented one');
  writePeacock(cwd, '#123456');
  assert.match(readFileSync(f, 'utf8'), /\/\/ "peacock.color": "#00ff00",\n  "peacock.color": "#123456"/, 'and the live one is the one written');
  writeFileSync(f, '{ "url": "http://x//y", "peacock.color": "#abcdef" }');
  writePeacock(cwd, null);
  assert.equal(readFileSync(f, 'utf8'), '{ "url": "http://x//y" }', 'a // in a string is no comment; the comma before a last key goes with it');
});

test('taking Peacock\'s colour out takes its activity-bar copy too, so the colour does not come straight back', () => {
  const cwd = join(tmp, 'derived'); mkdirSync(join(cwd, '.vscode'), { recursive: true });
  const f = join(cwd, '.vscode', 'settings.json');
  writeFileSync(f, '{\n  "peacock.color": "#ff0000",\n  "workbench.colorCustomizations": {\n    "titleBar.activeBackground": "#ff0000",\n    "activityBar.background": "#ff0000"\n  }\n}\n');
  writePeacock(cwd, null);
  assert.equal(readPeacock(cwd).color, null);
  assert.equal(readFileSync(f, 'utf8'), '{\n  "workbench.colorCustomizations": {\n    "titleBar.activeBackground": "#ff0000"\n  }\n}\n');
  writeFileSync(f, '{\n  "peacock.color": "#ff0000",\n  "workbench.colorCustomizations": { "activityBar.background": "#00ff00" }\n}\n');
  writePeacock(cwd, null);
  assert.equal(readPeacock(cwd).color, '#00ff00', 'an activity bar painted by hand stays');
});

// Never written: anything under ~/.claude (2026-10-14) — a chat run in it put the colour square on a folder whose
// settings file would be ~/.claude/.vscode/settings.json; nor through a folder linked into it, or another spelling of it.
test('the colour square writes nothing under CLAUDE_DIR, however the folder is spelt or reached', { timeout: 30_000 }, async () => {
  const { existsSync, symlinkSync } = await import('node:fs');
  const claude = process.env.CLAUDE_DIR;
  mkdirSync(join(claude, 'projects'), { recursive: true });
  symlinkSync(join(claude, 'projects'), join(tmp, 'linked'));
  const caps = claude.replace(/claude$/, 'Claude');   // the same folder where the disk ignores case
  for (const cwd of [claude, join(claude, 'projects'), join(tmp, 'linked'), ...existsSync(caps) ? [caps] : []]) {
    assert.throws(() => writePeacock(cwd, '#123456'), /the board writes nothing under/, cwd);
    assert.throws(() => writePeacock(cwd, null), /the board writes nothing under/, `${cwd}, the colour taken out`);
  }
  assert.ok(!existsSync(join(claude, '.vscode')) && !existsSync(join(claude, 'projects', '.vscode')), 'nothing made');
  const { startTestServer } = await import('../lib/testserver.mjs');
  const srv = await startTestServer({});
  try {
    const cd = srv.env.CLAUDE_DIR, put = (path, body) => srv.api(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await put('api/pins', { pins: [cd] })).status, 200);   // a folder the board knows, as a chat run there would be
    const r = await put('api/peacock', { cwd: cd, color: '#123456' });
    assert.equal(r.status, 400, r.body.error);
    assert.match(r.body.error, /writes nothing there/);
    assert.ok(!existsSync(join(cd, '.vscode')), 'no .vscode made in it');
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
  let b; try { b = spawn(process.execPath, [join(import.meta.dirname, '..', 'server.mjs')], { env: a.env, stdio: ['ignore', fd, fd] }); } finally { closeSync(fd); }
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
