// A chat's sub-agents, a row each (2026-11-02): what each was asked, what it does now, how it ended — from its .meta.json, its
// transcript and the notice it sends the chat — for the last round only, a failure from before kept; through a throwaway server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { agentFiles, agentNoteLine, makeFixture, toolLines } from '../scripts/fixture.mjs';

const standIn = () => spawn('sleep', ['120'], { stdio: 'ignore' });
const MIN = 60_000;
const setup = (agents, notices = []) => {
  const p = standIn(), dir = tmpDir('peix-fx-'), started = Date.now() - 60 * MIN, now = new Date();
  const fx = makeFixture(dir, [{ cwd: '/tmp/acme/infra', title: 'Review the plan', prompt: 'review it', reply: 'Sending reviewers out.', at: new Date(Date.now() - 30 * MIN),
    live: { pid: p.pid, startedAt: started }, lines: id => notices.map(n => agentNoteLine({ id, cwd: '/tmp/acme/infra', at: new Date(Date.now() - MIN).toISOString(), ...n })) }]);
  const chat = fx.chats[0], made = agentFiles({ dir, lead: chat, agents, at: now });
  return { p, fx, chat, ...made };
};
const rowsOf = async (srv, id) => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id)?.agentRows;

test('a row per agent of the last round: asked, doing, how it ended; a failure from a round before stays', { timeout: 30_000 }, async () => {
  const { p, fx, chat } = setup([
    { id: 'early', asked: 'An earlier look', ago: 40 * MIN, quiet: 35 * MIN, report: '## Long done' },
    { id: 'oldfail', asked: 'An earlier failure', ago: 38 * MIN, quiet: 34 * MIN, tool: 'toolu_oldfail', steps: ['Read it'] },
    { id: 'sec', asked: 'Review the plan for security', ago: 10 * MIN, steps: ['Read the plan', 'Parse the ingress rules'], branch: 'agent/sec', tree: '/tmp/acme/infra/.claude/worktrees/sec' },
    { id: 'cost', asked: 'Price the gateways', kind: 'code-reviewer', ago: 9 * MIN, quiet: MIN, report: '## Three **gateways** where one would do\n\nThe rest of it.', tool: 'toolu_cost', finished: true },
    { id: 'logs', asked: 'Check flow logs', ago: 8 * MIN, quiet: MIN, tool: 'toolu_logs', steps: ['Read the logs'], finished: true },
    { id: 'hand', asked: 'Stopped by hand', ago: 7 * MIN, quiet: 2 * MIN, steps: ['Look'], stopped: true, finished: true },
    { id: 'prev', asked: 'Compare with last month', ago: 6 * MIN, quiet: MIN, said: 'Started a diff in the background.', tool: 'toolu_prev' },
    { id: 'noted', ago: 5 * MIN, quiet: MIN, prompt: 'A prompt as its only words', said: 'Done.' },
  ], [
    { tool: 'toolu_cost', asked: 'Price the gateways' },
    { tool: 'toolu_logs', asked: 'Check flow logs', status: 'failed', said: 'failed: Agent terminated early due to an API error' },
    { tool: 'toolu_oldfail', asked: 'An earlier failure', status: 'failed', said: 'failed: Agent terminated early due to an API error' },
    { tool: 'toolu_prev', asked: 'Compare with last month', said: 'is waiting on its own background work' },
  ]);
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    const rows = await waitFor(async () => { const r = await rowsOf(srv, chat.id); return r?.length >= 7 && r; }, { what: 'the rows' });
    const by = id => rows.find(r => r.id === id);
    assert.deepEqual(rows.map(r => r.id), ['oldfail', 'sec', 'cost', 'logs', 'hand', 'prev', 'noted'], 'by start, the old round gone but its failure');
    assert.equal(by('oldfail').old, true, 'said to be from a round before');
    assert.equal(by('oldfail').st, 'fail');
    assert.deepEqual([by('sec').st, by('sec').asked, by('sec').last, by('sec').end, by('sec').branch], ['run', 'Review the plan for security', { kind: 'tool', name: 'Bash', text: 'Parse the ingress rules' }, null, 'agent/sec'], 'at work: what it calls, in words');
    assert.equal(by('sec').kind, null, 'general-purpose says nothing');
    assert.equal(by('cost').kind, 'code-reviewer');
    assert.deepEqual([by('cost').st, by('cost').last], ['done', { kind: 'report', text: 'Three gateways where one would do' }], 'done: its report\'s first line, a sentence');
    assert.ok(by('cost').end, 'an end time');
    assert.deepEqual([by('logs').st, by('logs').why], ['fail', 'Agent terminated early due to an API error'], 'its notice says why');
    assert.equal(by('hand').st, 'stop');
    assert.equal(by('prev').st, 'wait', 'its turn over, its background work on');
    assert.equal(by('prev').end, null, 'not ended');
    assert.equal(by('noted').asked, 'A prompt as its only words', 'no description: its first prompt');
    assert.equal((await srv.api('api/sessions')).body.sessions.find(s => s.id === chat.id).agents, 1, 'only the one at work counts; a finished one with no end of its own does not');
    assert.ok((await srv.api(`api/sessions/${chat.id}/messages`)).body.session.agentRows?.length === 7, 'kept over a re-read');
  } finally { await srv.stop(); p.kill(); }
});

test('a notice arriving ends the row; a new round replaces the last; a finished agent resumed is at work again', { timeout: 30_000 }, async () => {
  const { p, fx, chat, files } = setup([{ id: 'one', asked: 'First', ago: 5 * MIN, tool: 'toolu_one', steps: ['Look around'] }]);
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    await waitFor(async () => (await rowsOf(srv, chat.id))?.[0]?.st === 'run', { what: 'at work' });
    appendFileSync(chat.file, JSON.stringify(agentNoteLine({ id: chat.id, cwd: chat.cwd, tool: 'toolu_one', asked: 'First', status: 'failed', said: 'failed: Agent terminated early due to an API error' })) + '\n');
    writeFileSync(files.one.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'First', toolUseId: 'toolu_one', finished: true }));
    const r = await waitFor(async () => { const x = (await rowsOf(srv, chat.id))?.[0]; return x?.st === 'fail' && x; }, { what: 'failed by its notice' });
    assert.equal(r.why, 'Agent terminated early due to an API error');
    assert.doesNotMatch(srv.logText(), /could not be folded/, 'a notice is a line like any other');   // 2026-11-04: agentsSoon, out of reach inside main()
    // words again: written after its meta, it is at work
    await new Promise(res => setTimeout(res, 1700));
    appendFileSync(files.one, JSON.stringify({ isSidechain: true, type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_z', name: 'Bash', input: { description: 'Try again' } }], stop_reason: 'tool_use' } }) + '\n');
    const back = await waitFor(async () => { const x = (await rowsOf(srv, chat.id))?.[0]; return x?.st === 'run' && x; }, { what: 'resumed' });
    assert.deepEqual(back.last, { kind: 'tool', name: 'Bash', text: 'Try again' });
  } finally { await srv.stop(); p.kill(); }
});

test('a row holds its words AGENT_WORDS_MS, whatever its agent does meanwhile', { timeout: 30_000 }, async () => {
  const { p, fx, chat, files } = setup([{ id: 'one', asked: 'First', ago: 5 * MIN, steps: ['Look around'] }]);
  const srv = await startTestServer({ claudeDir: fx.dir, env: { AGENT_WORDS_MS: '60000' } });
  try {
    await waitFor(async () => (await rowsOf(srv, chat.id))?.[0]?.last?.text === 'Look around', { what: 'its first words' });
    appendFileSync(files.one, JSON.stringify({ isSidechain: true, type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_z', name: 'Bash', input: { description: 'Something new' } }], stop_reason: 'tool_use' } }) + '\n');
    await new Promise(res => setTimeout(res, 1800));   // the watcher's and the poll's chance to take it
    assert.equal((await rowsOf(srv, chat.id))[0].last.text, 'Look around', 'held');
  } finally { await srv.stop(); p.kill(); }
});

test('one agent on demand: what it was asked, its totals, its transcript a piece at a time', { timeout: 30_000 }, async () => {
  const { p, fx, chat, files } = setup([{ id: 'one', asked: 'First', prompt: 'Look at the plan closely.', ago: 5 * MIN, steps: ['Read it', 'Check it'], report: '## Found two\n\nDetails.' }]);
  const srv = await startTestServer({ claudeDir: fx.dir });
  try {
    await waitFor(async () => (await rowsOf(srv, chat.id))?.length, { what: 'the row' });
    const a = (await srv.api(`api/sessions/${chat.id}/agents/one`)).body;
    assert.deepEqual([a.prompt, a.tools, a.tokens], ['Look at the plan closely.', 3, 1030], 'totals: its calls, the context at its last call');
    assert.equal(a.entries, undefined, 'no transcript unless asked');
    const b = (await srv.api(`api/sessions/${chat.id}/agents/one?after=0`)).body;
    assert.deepEqual(b.entries.map(e => e.kind), ['text', 'tool_use', 'tool_result', 'tool_use', 'tool_result', 'text'], 'its report, and nothing of the call that handed it back');
    assert.equal(b.entries[5].text, '## Found two\n\nDetails.', 'its report is words');
    assert.equal(b.upto, b.entries.length);
    appendFileSync(files.one, JSON.stringify({ isSidechain: true, type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'And one more thing.' }], stop_reason: 'end_turn' } }) + '\n');
    const c = (await srv.api(`api/sessions/${chat.id}/agents/one?after=${b.upto}`)).body;
    assert.deepEqual(c.entries.map(e => e.text), ['And one more thing.'], 'only what came');
    assert.equal((await srv.api(`api/sessions/${chat.id}/agents/nope`)).status, 404);
    assert.equal((await srv.api(`api/sessions/${chat.id}/agents/..%2Fx`)).status, 404, 'an id is a name, never a path');
  } finally { await srv.stop(); p.kill(); }
});

/** The `alert` events of a server's stream, from its snapshot on (as drift.test reads them). */
async function alerts(url, key) {
  const seen = [], ac = new AbortController();
  await new Promise((resolve, reject) => {
    fetch(`${url}events`, { signal: ac.signal, headers: { 'x-peix-key': key } }).then(async res => {
      let buf = '';
      for await (const chunk of res.body) {
        buf += Buffer.from(chunk).toString();
        let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = /^event: (\w+)\ndata: (.*)$/s.exec(buf.slice(0, i)); buf = buf.slice(i + 2); if (m?.[1] === 'snapshot') resolve(); if (m?.[1] === 'alert') seen.push(JSON.parse(m[2])); }
      }
    }).catch(e => { if (!ac.signal.aborted) reject(e); });
  });
  return { seen, stop: () => ac.abort() };
}

test('a result that names an agent says which, on its entry: an Agent call\u2019s, a forked Skill\u2019s; nothing else does', { timeout: 30_000 }, async () => {
  const dir = tmpDir('peix-fx-'), cwd = '/tmp/acme/infra';
  const fx = makeFixture(dir, [{ cwd, title: 'Its calls', prompt: 'go', reply: 'Done.', at: new Date(Date.now() - 30 * MIN), lines: id => [
    ...toolLines({ id, cwd, name: 'Agent', input: { description: 'Look at it', name: 'looker', prompt: 'go' }, result: 'launched', toolUseResult: { status: 'async_launched', agentId: 'abc-1', description: 'Look at it' } }),
    ...toolLines({ id, cwd, name: 'Skill', input: { skill: 'code-review' }, result: 'launched', toolUseResult: { status: 'forked', commandName: 'code-review', agentId: 'abc-2' } }),
    ...toolLines({ id, cwd, name: 'Agent', input: { description: 'A bad id' }, result: 'launched', toolUseResult: { agentId: '../../etc' } }),
    ...toolLines({ id, cwd, name: 'Bash', input: { command: 'ls' }, result: 'a file', toolUseResult: { stdout: 'a file' } }),
  ] }]);
  const srv = await startTestServer({ claudeDir: dir });
  try {
    const { entries } = (await srv.api(`api/sessions/${fx.chats[0].id}/messages`)).body;
    const results = entries.filter(e => e.kind === 'tool_result');
    assert.deepEqual(results.map(e => e.agent ?? null), [{ id: 'abc-1', name: null, asked: 'Look at it' }, { id: 'abc-2', name: 'code-review', asked: null }, null, null]);
    assert.equal(entries.find(e => e.kind === 'tool_use' && e.name === 'Agent').who, 'looker', 'the name the call gave it');
    assert.equal(entries.filter(e => e.kind === 'tool_use' && e.who).length, 1, 'no name, no word');
  } finally { await srv.stop(); }
});

test('an agent that fails is an alert, once, with what it was asked and why; one that finishes is none', { timeout: 30_000 }, async () => {
  const { p, fx, chat } = setup([
    { id: 'a', asked: 'Price the gateways', ago: 5 * MIN, tool: 'toolu_a', steps: ['Count them'] },
    { id: 'b', asked: 'Check flow logs', ago: 4 * MIN, tool: 'toolu_b', steps: ['Read the logs'] },
    { id: 'gone', asked: 'From before', ago: 9 * MIN, tool: 'toolu_gone', steps: ['Look'] },
  ], [{ tool: 'toolu_gone', asked: 'From before', status: 'failed', said: 'failed: Agent terminated early due to an API error' }]);
  const srv = await startTestServer({ claudeDir: fx.dir });
  let a;
  try {
    await waitFor(async () => (await rowsOf(srv, chat.id))?.length, { what: 'the rows' });
    a = await alerts(srv.url, srv.key);
    const note = n => appendFileSync(chat.file, JSON.stringify(agentNoteLine({ id: chat.id, cwd: chat.cwd, ...n })) + '\n');
    note({ tool: 'toolu_a', asked: 'Price the gateways' });
    await new Promise(res => setTimeout(res, 900));
    assert.deepEqual(a.seen.filter(x => x.kind === 'agent-failed'), [], 'one that finished: no word');
    note({ tool: 'toolu_b', asked: 'Check flow logs', status: 'failed', said: 'failed: Agent terminated early due to an API error' });
    await waitFor(() => a.seen.some(x => x.kind === 'agent-failed'), { what: 'the alert' });
    const f = a.seen.find(x => x.kind === 'agent-failed');
    assert.deepEqual([f.sessionId, f.heading, f.snippet], [chat.id, 'An agent failed · infra', 'Check flow logs: Agent terminated early due to an API error']);
    note({ tool: 'toolu_b', asked: 'Check flow logs', status: 'failed', said: 'failed: Agent terminated early due to an API error' });   // a notice again
    await srv.api(`api/sessions/${chat.id}/messages`);   // and a re-read of the chat
    await new Promise(res => setTimeout(res, 900));
    assert.equal(a.seen.filter(x => x.kind === 'agent-failed').length, 1, 'said once; the failure before the server came up, never');
  } finally { a?.stop(); await srv.stop(); p.kill(); }
});
