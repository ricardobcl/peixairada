// A new chat as an agent (2026-11-06, round XXVIII): the agents a folder's chat can start as, read from the files as
// Claude Code finds them; `--agent` on a new chat's command line and never on a resume; the agent a chat runs as, from its
// transcript or its claude's registry file — against the fake claude, which takes --agent as Claude Code 2.1.319 does.
import './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { makeFixture, yesterday } from '../scripts/fixture.mjs';
import { agentFront } from '../server.mjs';

const md = (front, body = 'You do the thing.') => `---\n${front}\n---\n\n${body}\n`;
/** A checkout with agents of its own and in a folder of it, one more above its git root, and a user's and a plugin's in
 *  the config: what a chat in `<repo>/web` lists, and what it must not. */
function world() {
  const top = realpathSync(tmpDir('peix-agents-')), claude = join(top, 'claude'), repo = join(top, 'code', 'storefront'), web = join(repo, 'web'), kit = join(top, 'kit');
  for (const d of [join(top, 'code', '.claude', 'agents'), join(repo, '.git'), join(repo, '.claude', 'agents'), join(web, '.claude', 'agents'), join(claude, 'agents'), join(kit, 'agents'), join(claude, 'plugins'), join(claude, 'sessions')]) mkdirSync(d, { recursive: true });
  writeFileSync(join(top, 'code', '.claude', 'agents', 'outside.md'), md('name: outside\ndescription: above the git root'));
  writeFileSync(join(repo, '.claude', 'agents', 'reviewer.md'), md('name: reviewer\ndescription: Reviews the diff against main and lists what to fix\nmodel: sonnet\ncolor: purple'));
  writeFileSync(join(web, '.claude', 'agents', 'a11y.md'), md('name: a11y-auditor\ndescription: "Checks the components against WCAG"\ncolor: green'));
  writeFileSync(join(web, '.claude', 'agents', 'notes.txt'), 'not an agent');
  writeFileSync(join(claude, 'agents', 'scout.md'), md('name: scout\ndescription: |\n  Reads only: maps the code.\n\n  Examples:\n  <example>…</example>\nmodel: inherit\ncolor: teal'));
  writeFileSync(join(kit, 'agents', 'code-reviewer.md'), md('name: code-reviewer\ndescription: Reviews code against the guidelines\nmodel: opus\ncolor: green'));
  writeFileSync(join(claude, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'kit@market': [{ scope: 'user', installPath: kit }], 'off@market': [{ scope: 'user', installPath: kit }] } }));
  writeFileSync(join(claude, 'settings.json'), JSON.stringify({ enabledPlugins: { 'kit@market': true, 'off@market': false } }));
  return { top, claude, repo, web };
}

test('an agent file\'s frontmatter: plain, quoted and block values', () => {
  assert.deepEqual(agentFront(md('name: a\ndescription: "said: quoted"\nmodel: sonnet')), { name: 'a', description: 'said: quoted', model: 'sonnet' });
  assert.equal(agentFront(md('name: b\ndescription: |\n  line one\n  line two\ncolor: red')).description, 'line one\nline two');
  assert.equal(agentFront(md('description: >-\n  folded\n  together\nname: c')).name, 'c');
  assert.equal(agentFront('no frontmatter here'), null);
});

test('GET /api/agents: the folder\'s and up to its git root, yours, an enabled plugin\'s, Claude Code\'s own — and the folder\'s setting', { timeout: 30_000 }, async () => {
  const w = world();
  const srv = await startTestServer({ claudeDir: w.claude });
  try {
    let r = await srv.api(`api/agents?cwd=${encodeURIComponent(w.web)}`);
    assert.equal(r.status, 200);
    const names = r.body.agents.map(a => a.name);
    assert.deepEqual(names, ['a11y-auditor', 'reviewer', 'scout', 'kit:code-reviewer', 'Plan', 'Explore', 'general-purpose', 'statusline-setup'], 'nearest first; nothing above the git root, from a plugin switched off, nor Claude Code\'s `claude`');
    const by = Object.fromEntries(r.body.agents.map(a => [a.name, a]));
    assert.deepEqual([by['a11y-auditor'].source, by['a11y-auditor'].at, by.reviewer.at], ['folder', w.web, w.repo]);
    assert.deepEqual([by.reviewer.model, by.reviewer.color, by.reviewer.description], ['sonnet', 'purple', 'Reviews the diff against main and lists what to fix']);
    assert.deepEqual([by.scout.source, by.scout.description, by.scout.color], ['user', 'Reads only: maps the code.', null], 'a block\'s first paragraph; a colour Claude Code has not, none');
    assert.deepEqual([by['kit:code-reviewer'].source, by['kit:code-reviewer'].plugin], ['plugin', 'kit']);
    assert.equal(by.Plan.source, 'builtin');
    assert.deepEqual([r.body.setting, r.body.launchers], [null, 0]);
    writeFileSync(join(w.repo, '.claude', 'settings.json'), JSON.stringify({ agent: 'reviewer' }));
    r = await srv.api(`api/agents?cwd=${encodeURIComponent(w.repo)}`);
    assert.deepEqual(r.body.setting, { name: 'reviewer', from: 'folder' });
    writeFileSync(join(w.repo, '.claude', 'settings.local.json'), JSON.stringify({ agent: 'scout' }));
    assert.deepEqual((await srv.api(`api/agents?cwd=${encodeURIComponent(w.repo)}`)).body.setting, { name: 'scout', from: 'local' }, 'the local settings over the folder\'s');
    assert.equal((await srv.api('api/agents?cwd=relative')).status, 400);
  } finally { await srv.stop(); }
});

test('a new chat as an agent: --agent on its command line, the registry\'s and then the transcript\'s word on its card; a name no folder has is refused; a resume passes none', { timeout: 60_000 }, async () => {
  const w = world();
  const srv = await startTestServer({ claudeDir: w.claude, fake: true });
  try {
    const argsOf = async () => (await waitFor(() => srv.holders().find(h => !h.shell && h.args?.includes('--agent')) || null, { what: 'a holder started with --agent' })).args;
    let r = await srv.post('api/terminals', { cwd: w.repo, agent: 'nosuch' });
    assert.equal(r.status, 400); assert.match(r.body.error, /no agent named nosuch/);
    r = await srv.post('api/terminals', { cwd: w.repo, agent: '../x' });
    assert.equal(r.status, 400, 'not a name');
    r = await srv.post('api/terminals', { cwd: w.repo, agent: 'reviewer', task: 'dev' });
    assert.equal(r.status, 400, 'a launcher takes none');
    r = await srv.post('api/terminals', { cwd: w.repo, agent: 'reviewer', cols: 100, rows: 30 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(await argsOf(), ['--agent', 'reviewer']);
    const live = await waitFor(async () => (await srv.api('api/sessions')).body.sessions.find(s => s.alive && s.cwd === w.repo) || null, { what: 'the new chat, registered' });
    assert.deepEqual([live.agent, live.agentColor], ['reviewer', 'purple'], 'before a word: the registry\'s agent, its colour the folder\'s file\'s');
    await srv.killTerminals();

    // its first word written (a prompt, the merge's way in): the transcript's first line says the agent; resumed, the
    // command line has none and the card still says it
    r = await srv.post('api/terminals', { cwd: w.web, agent: 'kit:code-reviewer', prompt: 'look at it', cols: 100, rows: 30 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const id = r.body.sessionId;
    await waitFor(async () => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id && s.lastReply) || null, { what: 'its reply' });
    await srv.killTerminals();
    const gone = await waitFor(async () => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id && !s.alive) || null, { what: 'its claude gone' });
    assert.equal(gone.agent, 'kit:code-reviewer', 'from the transcript');
    r = await srv.post(`api/sessions/${id}/terminal`, { cols: 100, rows: 30 });
    assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));
    const resumed = await waitFor(() => srv.holders().find(h => !h.shell && h.args?.[0] === '--resume') || null, { what: 'the resume' });
    assert.deepEqual(resumed.args, ['--resume', id], 'no --agent beside --resume');
  } finally { await srv.stop(); }
});

test('Claude over a folder\'s own agent: --agent \'\' — the chat runs as none, where with no flag it is the folder\'s', { timeout: 60_000 }, async () => {
  const w = world();
  writeFileSync(join(w.repo, '.claude', 'settings.json'), JSON.stringify({ agent: 'reviewer' }));
  const srv = await startTestServer({ claudeDir: w.claude, fake: true });
  try {
    let r = await srv.post('api/terminals', { cwd: w.repo, agent: '', prompt: 'plain, please', cols: 100, rows: 30 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const plain = r.body.sessionId;
    r = await srv.post('api/terminals', { cwd: w.repo, prompt: 'as the folder has it', cols: 100, rows: 30 });
    const dflt = r.body.sessionId;
    const both = await waitFor(async () => { const l = (await srv.api('api/sessions')).body.sessions; const a = l.find(s => s.id === plain && s.lastReply), b = l.find(s => s.id === dflt && s.lastReply); return a && b ? [a, b] : null; }, { what: 'both replies' });
    assert.deepEqual(both.map(s => s.agent ?? null), [null, 'reviewer']);
    assert.ok(srv.holders().some(h => h.sessionId === plain && h.args.join(' ').includes('--agent ')), 'the empty name passed as its own argument');
  } finally { await srv.stop(); }
});

test('the agent of a chat the boot read only the tail of: its first line, from the head', { timeout: 30_000 }, async () => {
  const dir = tmpDir('peix-fx-'), cwd = realpathSync(tmpDir('peix-cwd-')), at = yesterday();
  const long = Array.from({ length: 60 }, (_, i) => ({ type: 'user', message: { role: 'user', content: `filler ${i} ${'x'.repeat(400)}` }, uuid: randomUUID(), timestamp: new Date(at.getTime() + i * 1000).toISOString(), cwd, sessionId: 'x', userType: 'external', entrypoint: 'cli' }));
  const fx = makeFixture(dir, [{ cwd, at, title: 'As a reviewer', prompt: 'review it', reply: 'Done.', lines: () => long }]);
  const file = fx.chats[0].file, { readFileSync } = await import('node:fs');
  writeFileSync(file, JSON.stringify({ type: 'agent-setting', agentSetting: 'reviewer', sessionId: fx.chats[0].id }) + '\n' + readFileSync(file, 'utf8'));
  const srv = await startTestServer({ claudeDir: fx.dir, env: { TAIL_BYTES: '4000' } });
  try {
    const s = (await srv.api('api/sessions')).body.sessions.find(x => x.id === fx.chats[0].id);
    assert.equal(s.agent, 'reviewer');
  } finally { await srv.stop(); }
});
