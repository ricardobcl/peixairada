// Project input and the Peacock colour written into a JSONC settings file — the pure parts, no server running.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpDir } from '../lib/testserver.mjs';

const tmp = tmpDir('peix-test-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { projectInput, writePeacock, readPeacock, termSummary, summarizeToolInput, toolResultSnippet } = await import('../server.mjs');

test('projectInput: a name and absolute folders, trimmed and deduplicated; errors for the rest', () => {
  const v = projectInput({ name: '  Fees  ', cwds: ['/a/b', '/a/b/', 'relative', '/c'] }, { cwds: [] });
  assert.equal(v.name, 'Fees'); assert.deepEqual(v.cwds, ['/a/b', '/c']);
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
