// Jira tickets named in a chat (2026-10-08): which words are tickets (ticketsIn), the setup's site and login
// (cleanSetup), and end to end against a fake Jira — a key said in prose, a link, the branch; a key whose project the
// site has not got, never asked; one Jira has no issue for, never shown; the token kept apart from the setup file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { makeFixture } from '../scripts/fixture.mjs';
import { startFakeJira } from '../scripts/fakejira.mjs';

const tmp = tmpDir('peix-test-');
process.env.STATE_FILE = join(tmp, 'state.json'); process.env.CLAUDE_DIR = join(tmp, 'claude'); process.env.USAGE = 'off'; process.env.NOTIFY = 'off';
const { ticketsIn, cleanSetup } = await import('../server.mjs');

test('ticketsIn: keys in prose and in inline code, links with their URL; not in fenced code, nor glued to words', () => {
  const said = ticketsIn('Fix ACME-12 and `OPS-7`, see https://acme.atlassian.net/browse/ACME-40 — not x-ACME-1, ACME-2b, nor\n```\nACME-99\n```\nbut feature/OPS-8 yes.');
  assert.deepEqual(said.map(t => [t.key, t.url]), [['ACME-12', null], ['OPS-7', null], ['ACME-40', 'https://acme.atlassian.net/browse/ACME-40'], ['OPS-8', null]]);
  assert.deepEqual(ticketsIn('UTF-8, SHA-256 and GPT-4 look like keys').map(t => t.key), ['UTF-8', 'SHA-256', 'GPT-4'], 'they look like keys — the site\'s projects say which are');
  assert.deepEqual(ticketsIn('acme-12 is lower case, ACME-012 starts at 0').map(t => t.key), []);
});

test('cleanSetup: a site as its origin and a login; http only on loopback; both empty is none', () => {
  assert.deepEqual(cleanSetup({ jira: { site: 'acme.atlassian.net/jira/your-work', email: ' me@acme.com ' } }, true).setup.jira, { site: 'https://acme.atlassian.net', email: 'me@acme.com' });
  assert.deepEqual(cleanSetup({ jira: { site: 'http://127.0.0.1:9999', email: 'me@x.y' } }, true).setup.jira, { site: 'http://127.0.0.1:9999', email: 'me@x.y' });
  assert.match(cleanSetup({ jira: { site: 'http://acme.example', email: 'me@x.y' } }, true).error, /not a Jira site/);
  assert.match(cleanSetup({ jira: { site: 'acme.atlassian.net', email: 'me' } }, true).error, /not an email/);
  assert.equal(cleanSetup({ jira: { site: '', email: '' } }, true).setup.jira, null);
  assert.equal(cleanSetup({ jira: null }, true).setup.jira, null);
});

test('end to end: what Jira knows wears its status, what it does not is never shown', { timeout: 40_000 }, async () => {
  const jira = await startFakeJira({ projects: ['ACME', 'OPS'], issues: {
    'ACME-12': { summary: 'Fees for the new market', status: 'In Progress', cat: 'indeterminate', type: 'Story', assignee: 'me' },
    'OPS-7': { summary: 'Rotate the keys', status: 'Done', cat: 'done', assignee: 'Ana' },
    'ACME-31': { summary: 'The branch\'s own', status: 'To Do', cat: 'new' },
  } });
  const fx = makeFixture(tmpDir('peix-fx-'), [{ cwd: process.cwd(), prompt: 'Pick up ACME-12 and OPS-7; UTF-8 is not one, ACME-404 is gone.', reply: 'On https://x.atlassian.net/browse/ACME-12 now.' }]);
  const branched = makeFixture(fx.dir, [{ cwd: process.cwd(), prompt: 'carry on', reply: 'ok' }]).chats[0];
  // that chat's branch names its ticket
  const f = branched.file, lines = readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  for (const l of lines) if (l.gitBranch) l.gitBranch = 'feature/acme-31-the-branch';
  (await import('node:fs')).writeFileSync(f, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  const srv = await startTestServer({ claudeDir: fx.dir, env: { JIRA_API_TOKEN: jira.token, PR_TTL_MS: '0' } });
  try {
    const chat = id => srv.api('api/sessions').then(r => r.body.sessions.find(s => s.id === id));
    assert.deepEqual((await chat(fx.chats[0].id)).tickets, [], 'no site, no tickets');
    assert.equal(jira.bulk.length, 0, 'and nothing asked');
    const put = await srv.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jira: { site: jira.url, email: jira.email } }) });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    await waitFor(async () => (await chat(fx.chats[0].id)).tickets.length === 2, { timeout: 10_000, what: 'the chat\'s two tickets' });
    const t = (await chat(fx.chats[0].id)).tickets;
    assert.deepEqual(t.map(x => [x.key, x.cat, x.status, x.summary]), [['ACME-12', 'doing', 'In Progress', 'Fees for the new market'], ['OPS-7', 'done', 'Done', 'Rotate the keys']]);
    assert.equal(t[0].url, `${jira.url}/browse/ACME-12`, 'the site\'s own link');
    assert.deepEqual([t[0].assignee.name, t[0].assignee.me, t[1].assignee.me], ['Me Myself', true, false]);
    await waitFor(async () => (await chat(branched.id)).tickets[0]?.key === 'ACME-31', { what: 'the branch\'s ticket' });
    assert.equal((await chat(branched.id)).tickets[0].branch, true);
    const asked = jira.bulk.flat();
    assert.ok(!asked.includes('UTF-8'), `a key whose project the site has not got is never asked: ${asked}`);
    assert.ok(asked.includes('ACME-404'));
    const info = (await srv.api('api/jira')).body;
    assert.deepEqual([info.site, info.token, info.me, info.error], [jira.url, 'env', 'Me Myself', null]);
    assert.equal(JSON.parse(readFileSync(join(srv.dir, 'config.json'), 'utf8')).jira.email, jira.email, 'the site and login in the setup file…');
    assert.ok(!readFileSync(join(srv.dir, 'config.json'), 'utf8').includes(jira.token), '…and never the token');
  } finally { await srv.stop(); await jira.close(); }
});

test('the token from the Setup: kept apart (the keychain; a file in a test), and a wrong one said', { timeout: 30_000 }, async () => {
  const jira = await startFakeJira({ issues: { 'ACME-1': { summary: 'one' } } });
  const srv = await startTestServer();
  try {
    const put = (path, body, method = 'PUT') => srv.api(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await put('api/jira/token', { token: 'abc' })).status, 400, 'too short to be a token');
    assert.match((await put('api/jira/token', { token: 'a-real-looking-token' })).body.error, /site and your email first/);
    await put('api/config', { jira: { site: jira.url, email: jira.email } });
    let info = (await srv.api('api/jira')).body;
    assert.deepEqual([info.token, info.me], [null, null]);
    assert.match(info.error, /no API token/);
    info = (await put('api/jira/token', { token: 'wrong-token-1234' })).body;
    assert.deepEqual([info.token, info.me], ['file', null]);
    assert.match(info.error, /refused|authenticated/i, 'a token Jira refuses is said');
    info = (await put('api/jira/token', { token: jira.token })).body;
    assert.deepEqual([info.token, info.me, info.error], ['file', 'Me Myself', null]);
    assert.equal(readFileSync(join(srv.dir, 'jira-token'), 'utf8'), jira.token);
    info = (await srv.api('api/jira/token', { method: 'DELETE' })).body;
    assert.equal(info.token, null); assert.ok(!existsSync(join(srv.dir, 'jira-token')));
  } finally { await srv.stop(); await jira.close(); }
});
