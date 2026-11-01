// Chats that talk (2026-10-31, round XIV): what the board hands one chat from you or from another — a message sent to a
// chat, a handoff merged into a new one or folded into another, a branch of a chat — against the fake claude.
import './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture, makeFixture, yesterday } from '../scripts/fixture.mjs';
import { handoffText } from '../server.mjs';

const chatOf = async (srv, id) => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);
const linksOf = async (srv, id) => (await chatOf(srv, id))?.links || [];
/** Claude Code's recap, as this Mac's transcripts have it: a system line, its words in `content`. */
const awayLine = (id, cwd, text, at) => ({ parentUuid: null, isSidechain: false, type: 'system', subtype: 'away_summary', content: text, timestamp: at.toISOString(), uuid: randomUUID(), isMeta: false, userType: 'external', entrypoint: 'cli', cwd, sessionId: id, version: 'fixture', gitBranch: 'main' });

test('a handoff\'s words: each chat\'s title, folder and branch, PRs, what was asked, Claude Code\'s recap — and the last reply only when it came after', () => {
  const a = { title: 'Retry declined payments', cwd: '~/acme/storefront', branch: 'fix/retry', prs: [{ url: 'https://github.com/acme/storefront/pull/482', state: 'open', title: 'Retry declined payments' }],
    first: 'make declined payments retry', last: 'and log each try', away: { text: 'Retries are in; the PR waits on review.', at: '2026-10-31T10:00:00Z' }, reply: { text: 'Done — pushed.', at: '2026-10-31T09:00:00Z' }, file: '~/.claude/projects/x/a.jsonl' };
  const b = { title: 'Queue for invoice webhooks', cwd: '~/acme/billing-api', branch: null, prs: [], first: 'a queue for webhooks', last: 'a queue for webhooks', away: null, reply: { text: 'SQS it is.\nThe module is set up.', at: '2026-10-31T11:00:00Z' }, file: null };
  const t = handoffText([a, b]);
  assert.match(t, /^A handoff: 2 chats of mine, merged into this one/);
  assert.match(t, /## 1\. Retry declined payments\nFolder: ~\/acme\/storefront · branch fix\/retry\nPRs: https:\/\/github\.com\/acme\/storefront\/pull\/482 \(open\) — Retry declined payments/);
  assert.match(t, /First asked: make declined payments retry\nLast asked: and log each try/);
  assert.match(t, /Where it stands — Claude Code's recap, 2026-10-31 \d\d:\d\d:\n> Retries are in; the PR waits on review\./);
  assert.doesNotMatch(t, /Done — pushed/, 'a reply older than the recap says nothing the recap does not');
  assert.match(t, /## 2\. Queue for invoice webhooks\nFolder: ~\/acme\/billing-api\nLast asked: a queue for webhooks\nClaude's last reply, [\d-]+ [\d:]+:\n> SQS it is\.\n> The module is set up\./, 'the same first and last words once; the reply quoted line by line');
  assert.doesNotMatch(t, /First asked: a queue/);
  assert.match(t, /Its transcript, to read for more: ~\/\.claude\/projects\/x\/a\.jsonl/);
  assert.match(t, /then wait for what I ask next\.$/);
  assert.match(handoffText([b], 'fold'), /^Another chat of mine, folded into this one[\s\S]*Take it in, then wait for what I ask next\.$/);
});

test('Merge: the handoff of two chats starts a new one under an id the board picked, its first prompt; both are tied to it, kept in the state file', { timeout: 40_000 }, async () => {
  const dir = tmpDir('peix-fx-'), at = yesterday();
  const fx = makeFixture(dir, [
    { cwd: process.cwd(), at, title: 'Retry declined payments', prompt: 'make declined payments retry', reply: 'Retries are in.', lines: id => [awayLine(id, process.cwd(), 'The retries are in and the PR waits on review.', new Date(at.getTime() + 5000))] },
    { cwd: tmpdir(), at: new Date(at.getTime() + 1000), title: 'Queue for invoice webhooks', prompt: 'a queue for the webhooks', reply: 'SQS it is.' },
  ]);
  const [a, b] = fx.chats;
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  try {
    const h = await srv.api(`api/handoff?ids=${a.id},${b.id}`);
    assert.equal(h.status, 200, JSON.stringify(h.body));
    assert.match(h.body.text, /## 1\. Retry declined payments[\s\S]*Claude Code's recap[^\n]*:\n> The retries are in and the PR waits on review\.[\s\S]*## 2\. Queue for invoice webhooks[\s\S]*> SQS it is\./, h.body.text);
    assert.deepEqual(h.body.chats.map(c => c.id), [a.id, b.id]);
    assert.equal((await srv.api('api/handoff?ids=nope')).status, 404, 'a chat the board does not have is said, not skipped');
    const r = await srv.post('api/terminals', { cwd: process.cwd(), cols: 90, rows: 24, prompt: h.body.text, from: [a.id, b.id] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const id = r.body.sessionId;
    assert.match(id, /^[0-9a-f-]{36}$/); assert.equal(r.body.terminal.sessionId, id, 'the drawer is the new chat\'s from its start');
    assert.ok(!srv.logText().includes('waits on review'), 'the handoff is not the log\'s');
    assert.deepEqual((await linksOf(srv, id)).map(l => [l.k, l.dir, l.id]).sort(), [['merge', 'in', a.id], ['merge', 'in', b.id]].sort(), 'the new chat: merged from both');
    assert.deepEqual((await linksOf(srv, a.id)).map(l => [l.k, l.dir, l.id]), [['merge', 'out', id]], 'each old one: merged into it');
    const s = await waitFor(async () => { const c = await chatOf(srv, id); return c?.alive && c.lastPrompt?.startsWith('A handoff: 2 chats') && c; }, { what: 'the new chat alive, the handoff its first prompt' });
    assert.equal(s.terminal?.id, r.body.terminal.id);
    const st = JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8'));
    assert.deepEqual(st.links.map(l => [l.k, l.from, l.to]).sort(), [['merge', a.id, id], ['merge', b.id, id]].sort(), 'kept in the state file');
    // a restart reads them back
    await srv.restart();
    assert.deepEqual((await linksOf(srv, b.id)).map(l => [l.k, l.dir, l.id]), [['merge', 'out', id]]);
    await srv.api(`api/terminals/${r.body.terminal.id}`, { method: 'DELETE' });
  } finally { await srv.stop(); }
});

test('Fold: the tie from the chat folded to the one it went into, said both ways; none to itself or to a chat the board lacks', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const [a, b] = fx.chats;
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    assert.equal((await srv.post(`api/sessions/${a.id}/fold`, { into: a.id })).status, 400);
    assert.equal((await srv.post(`api/sessions/${a.id}/fold`, { into: 'nope' })).status, 404);
    const r = await srv.post(`api/sessions/${a.id}/fold`, { into: b.id });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await linksOf(srv, a.id)).map(l => [l.k, l.dir, l.id]), [['fold', 'out', b.id]]);
    assert.deepEqual((await linksOf(srv, b.id)).map(l => [l.k, l.dir, l.id]), [['fold', 'in', a.id]]);
    const h = await srv.api(`api/handoff?kind=fold&ids=${a.id}`);
    assert.match(h.body.text, /^Another chat of mine, folded into this one[\s\S]*Two PRs mentioned[\s\S]*Take it in, then wait for what I ask next\.$/);
  } finally { await srv.stop(); }
});

test('Send to…: a chat with no process resumes with your words as its first prompt — never logged — and one with a drawer is not handed them again', { timeout: 40_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const chat = fx.chats[1];
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  try {
    const r = await srv.post(`api/sessions/${chat.id}/terminal`, { cols: 100, rows: 30, prompt: 'carry on\nwith the queue' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.prompted, true, 'the words went in with the resume');
    await waitFor(() => readFileSync(chat.file, 'utf8').includes(JSON.stringify('carry on\nwith the queue')), { what: 'the prompt in its transcript, as written' });
    await waitFor(async () => (await chatOf(srv, chat.id))?.lastReply?.includes('You said: carry on'), { what: 'its Claude answering it' });
    assert.doesNotMatch(srv.logText(), /with the queue/, 'the words are not the log\'s');
    assert.match(srv.logText(), /--resume \S+ -- <a prompt of yours>/, 'the log says a prompt went in');
    // the drawer is there now: the route answers with it and hands it nothing — the page types the words in instead
    const again = await srv.post(`api/sessions/${chat.id}/terminal`, { cols: 100, rows: 30, prompt: 'twice?' });
    assert.equal(again.status, 200); assert.equal(again.body.prompted, false);
    assert.equal(again.body.terminal.id, r.body.terminal.id);
    await srv.api(`api/terminals/${r.body.terminal.id}`, { method: 'DELETE' });
  } finally { await srv.stop(); }
});
