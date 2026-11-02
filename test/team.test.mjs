// An agent team under its lead (2026-10-31; rows like any agent's since 2026-11-02): the lead chat's teammates — its
// sub-agent files whose meta says an in-process teammate, and the roster in teams/session-<id8>/config.json — each with its
// name, at work or done, and its last line; nothing for a team that is only the lead, nor for a lead whose claude has ended.
// Through a throwaway server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { makeFixture, teamFiles, yesterday } from '../scripts/fixture.mjs';

const standIn = () => spawn('sleep', ['120'], { stdio: 'ignore' });

test('a lead\'s teammates: name, at work or done, last line — the roster\'s too; none for a lead alone or a lead gone', { timeout: 40_000 }, async () => {
  const p1 = standIn(), p2 = standIn(), started = Date.now() - 3600_000;
  const dir = tmpDir('peix-fx-');
  const fx = makeFixture(dir, [
    { cwd: '/tmp/acme/storefront', title: 'Review the payments stack', prompt: 'review it as a team', reply: 'Team spun up.', at: yesterday(), live: { pid: p1.pid, startedAt: started } },
    { cwd: '/tmp/acme/billing-api', title: 'Alone', prompt: 'just me', reply: 'Fine.', at: yesterday(), live: { pid: p2.pid, startedAt: started } },
    { cwd: '/tmp/acme/web', title: 'Ended lead', prompt: 'team up', reply: 'Done.', at: yesterday() },
  ]);
  const [lead, alone, ended] = fx.chats;
  const { sub } = teamFiles({ dir, lead, plain: true, also: ['scribe'], mates: [
    { name: 'reviewer', summary: 'Review PR 71', work: 'Run the payment tests', color: 'green' },
    { name: 'tester', summary: 'Test the retry path', said: 'All **12** retry tests pass.' },
    { name: 'old-hand', summary: 'From before', said: 'Old news.' },
  ] });
  // a teammate last written before the lead's claude started died with the one before
  const old = readdirSync(sub).find(n => n.includes('old-hand') && n.endsWith('.jsonl')), t = new Date(started - 600_000);
  utimesSync(join(sub, old), t, t);
  teamFiles({ dir, lead: alone, mates: [] });   // a team of the lead alone, as every chat on this Mac has
  teamFiles({ dir, lead: ended, mates: [{ name: 'gone', summary: 'too late', said: 'Bye.' }] });
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    const chat = async id => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);
    const mates = rows => rows.filter(m => m.mate).sort((a, b) => a.name.localeCompare(b.name));
    const team = mates(await waitFor(async () => (await chat(lead.id))?.agentRows, { what: 'the lead\'s rows' }));
    assert.deepEqual(team.map(m => [m.name, m.st]), [['old-hand', 'joined'], ['reviewer', 'run'], ['scribe', 'joined'], ['tester', 'done']],
      'by name; the old hand\'s file left out (the roster still names it), the explore agent no teammate');
    assert.deepEqual(team[1].last, { kind: 'tool', name: 'Bash', text: 'Run the payment tests' }, 'at work: what it is calling');
    assert.deepEqual(team[3].last, { kind: 'text', text: 'All 12 retry tests pass.' }, 'done: what it said last, as a sentence');
    assert.deepEqual([team[2].name, team[2].st, team[2].last], ['scribe', 'joined', null], 'on the roster with no file yet: joined');
    assert.equal((await chat(lead.id)).agentRows.filter(m => !m.mate).length, 1, 'the explore agent, a row of its own');
    assert.equal((await chat(lead.id)).agents, 1, 'the one at work still counts as a sub-agent at work');
    assert.equal((await chat(alone.id)).agentRows, null, 'a team of the lead alone is none');
    assert.equal((await chat(ended.id)).agentRows, null, 'a lead with no claude has no team');
    // the teammate at work finishes: done, its last word
    const rf = readdirSync(sub).find(n => n.includes('areviewer-') && n.endsWith('.jsonl'));
    appendFileSync(join(sub, rf), JSON.stringify({ isSidechain: true, type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'Approved with one nit.' }], stop_reason: 'end_turn' } }) + '\n');
    const after = await waitFor(async () => { const t = (await chat(lead.id))?.agentRows; return t?.find(m => m.name === 'reviewer')?.st === 'done' && t; }, { what: 'the reviewer done' });
    assert.deepEqual(after.find(m => m.name === 'reviewer').last, { kind: 'text', text: 'Approved with one nit.' });
    // a re-read of the lead (opening it) keeps its team
    assert.ok((await srv.api(`api/sessions/${lead.id}/messages`)).body.session.agentRows?.length, 'kept over a re-read');
    // the lead's claude ends: no team on its card
    p1.kill();
    await waitFor(async () => !(await chat(lead.id)).alive, { what: 'the lead gone' });
    assert.equal((await chat(lead.id)).agentRows, null);
  } finally { await srv.stop(); p1.kill(); p2.kill(); }
});

test('a teammate\'s first prompt is its last line until it says or calls something', { timeout: 30_000 }, async () => {
  const p = standIn(), dir = tmpDir('peix-fx-');
  const fx = makeFixture(dir, [{ cwd: '/tmp/acme/storefront', title: 'Lead', prompt: 'go', reply: 'ok', at: yesterday(), live: { pid: p.pid, startedAt: Date.now() - 3600_000 } }]);
  const { sub } = teamFiles({ dir, lead: fx.chats[0], mates: [{ name: 'reader', summary: 'Read the &quot;old&quot; client', said: 'x' }] });
  const f = readdirSync(sub).find(n => n.endsWith('.jsonl'));
  writeFileSync(join(sub, f), readFileSync(join(sub, f), 'utf8').split('\n')[0] + '\n');   // the lead's ask alone
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    const team = await waitFor(async () => (await srv.api('api/sessions')).body.sessions[0]?.agentRows, { what: 'the team' });
    assert.deepEqual([team[0].name, team[0].st, team[0].last], ['reader', 'run', { kind: 'asked', text: 'Read the "old" client' }]);
  } finally { await srv.stop(); p.kill(); }
});
