// The four readings of a card (2026-09-21): Claude at work, a monitor still running behind the turn, N sub-agents
// at work, and a question waiting on you. Each is a chat in the fixture with a live pid (a `sleep` of its own —
// the server only asks whether the pid is there), and what is checked is the server's word (tasks, ask, agents)
// and the card the page builds from it: the classes that drive the ring, how many lights it runs, the chips and
// the question line.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { makeFixture, replyLines, taskNoteLine, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto', env: { ORG_DIR: join(tmpdir(), 'peix-no-org-here') } };

const cards = ctx => ctx.evaluate(`[...document.querySelectorAll('#slist .card')].map(c => ({
  title: c.querySelector('.title')?.textContent || '',
  cls: [...c.classList].filter(x => ['working', 'watching', 'asking', 'idle', 'needs-input'].includes(x)).sort(),
  lights: c.style.getPropertyValue('--lights') || '',
  chips: [...c.querySelectorAll('.trow .chip')].map(x => x.textContent.trim()),
  state: c.querySelector('.state')?.textContent.trim() || '',
  lit: getComputedStyle(c).getPropertyValue('--lit').trim(),
}))`);

export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-signals', 'signals-repo');
  const sleeps = Array.from({ length: 4 }, () => spawn('sleep', ['180'], { stdio: 'ignore' }));
  const live = i => ({ pid: sleeps[i].pid, startedAt: Date.now() - 3600_000 });
  const now = Date.now(), at = ms => new Date(now - ms);
  const mon = 'mon7yk1x2';

  const { chats } = makeFixture(ctx.fixture.dir, [
    // 1 · plain work: a tool call with no answer yet — the turn is still going
    { cwd, title: 'Normal work', prompt: 'refactor the parser', reply: 'on it', at: at(300_000), live: live(0),
      lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test', description: 'run the tests' }, at: at(60_000) }) },
    // 2 · a monitor: it started, it has reported once, and the turn ended — ready, but something is still watching
    { cwd, title: 'Watching CI', prompt: 'watch the CI on #382', reply: 'watching', at: at(600_000), live: live(1),
      lines: id => [
        ...toolLines({ id, cwd, name: 'Monitor', input: { command: 'gh pr checks 382', description: 'CI checks on PR #382', timeout_ms: 1800_000 },
          result: `Monitor started (task ${mon}, expires in 30m unless the source ends first; you get one notice at expiry — re-arm if you still need the watch). You will be notified on each event.`, at: at(240_000) }),
        taskNoteLine({ id, cwd, taskId: mon, summary: 'Monitor event: "CI checks on PR #382"', event: 'Build: pass', at: at(120_000) }),
        ...replyLines({ id, cwd, text: 'Build passed; still waiting on the rest.', at: at(115_000) }),
      ] },
    // 3 · sub-agents: three of them at work behind one tool call
    { cwd, title: 'Three agents out', prompt: 'review the diff from every angle', reply: 'fanning out', at: at(400_000), live: live(2),
      lines: id => toolLines({ id, cwd, name: 'Agent', input: { description: 'review: bugs', prompt: 'look for bugs' }, at: at(90_000) }) },
    // 4 · a question, waiting: an AskUserQuestion with no answer
    { cwd, title: 'Waiting on you', prompt: 'set up the database', reply: 'one question first', at: at(500_000), live: live(3),
      lines: id => toolLines({ id, cwd, name: 'AskUserQuestion', at: at(30_000),
        input: { questions: [{ question: 'Which database should the service use?', header: 'Database', options: [{ label: 'Postgres' }, { label: 'MySQL' }, { label: 'SQLite' }] }] } }) },
  ]);
  // Three sub-agent transcripts for chat 3, each mid-turn: <slug>/<id>/subagents/agent-*.jsonl
  const agentDir = join(dirname(chats[2].file), chats[2].id, 'subagents');
  mkdirSync(agentDir, { recursive: true });
  for (const n of [1, 2, 3]) writeFileSync(join(agentDir, `agent-${n}.jsonl`), JSON.stringify({ isSidechain: true, type: 'user', message: { role: 'user', content: 'go' } }) + '\n');

  try {
    await ctx.server.restart();
    await ctx.send('Page.reload'); await ctx.sleep(1500);
    await ctx.waitFor(`window.peix.sessions().filter(s => s.cwd === ${JSON.stringify(cwd)}).length === 4`, { what: 'the four chats' });
    await ctx.waitFor(`window.peix.sessions().some(s => s.agents === 3)`, { what: 'the three sub-agents counted', timeout: 20000 });

    // ---- what the server says ----
    out.server = await ctx.peix(`sessions().filter(s => s.cwd === ${JSON.stringify(cwd)}).map(s => ({ title: s.title, status: s.status, agents: s.agents, tasks: (s.tasks || []).map(t => t.kind + ':' + t.what + ':' + t.events), ask: s.ask && (s.ask.tool + '/' + s.ask.options) }))`);
    const by = t => out.server.find(x => x.title === t);
    ctx.assert.equal(by('Normal work').status, 'working', 'a tool call with no answer is work in progress');
    ctx.assert.deepEqual(by('Watching CI').tasks, ['monitor:CI checks on PR #382:1'], 'the monitor is running, and its one event was counted');
    ctx.assert.equal(by('Watching CI').status, 'idle', '…while the chat itself is ready: the turn ended');
    ctx.assert.equal(by('Three agents out').agents, 3);
    ctx.assert.equal(by('Waiting on you').ask, 'AskUserQuestion/3', 'the question, and the three answers it offers');

    // ---- what the card does with it ----
    out.cards = (await cards(ctx)).filter(c => ['Normal work', 'Watching CI', 'Three agents out', 'Waiting on you'].includes(c.title));
    await ctx.shot('card-signals');
    // Both themes: the ring colours have to read on the light one too (--watch and --needs are a pair per theme).
    await ctx.evaluate(`document.documentElement.dataset.theme = 'light'`);
    await ctx.shot('card-signals-light');
    await ctx.evaluate(`delete document.documentElement.dataset.theme`);
    const card = t => out.cards.find(c => c.title === t);
    ctx.assert.deepEqual(card('Normal work').cls, ['working'], 'plain work: the clauding ring, nothing else');
    ctx.assert.equal(card('Normal work').lights, '', '…one light (the default)');
    ctx.assert.deepEqual(card('Watching CI').cls, ['idle', 'watching'], 'a ready card that is still watching something');
    ctx.assert.deepEqual(card('Watching CI').chips, ['monitor'], '…and says what is running');
    ctx.assert.equal(card('Three agents out').lights, '3', 'one light per sub-agent');
    ctx.assert.deepEqual(card('Three agents out').chips, ['3 agents']);
    ctx.assert.deepEqual(card('Waiting on you').cls, ['asking', 'needs-input'], 'the question stops the card');
    ctx.assert.match(card('Waiting on you').state, /asking you: Which database should the service use\?3 answers/, 'the question is on the card, with how many answers it offers');
    ctx.assert.notEqual(card('Waiting on you').lit, card('Normal work').lit, 'and it is lit in another colour than work');

    // ---- the end of a monitor takes the chip away ----
    const b = chats[1];
    writeFileSync(b.file, '', { flag: 'a' });
    const { appendFileSync } = await import('node:fs');
    appendFileSync(b.file, JSON.stringify(taskNoteLine({ id: b.id, cwd, taskId: mon, summary: 'Monitor "CI checks on PR #382" completed', status: 'completed' })) + '\n');
    await ctx.waitFor(`(window.peix.sessions().find(s => s.title === 'Watching CI')?.tasks || []).length === 0`, { what: 'the monitor gone when it reported its end' });
    out.afterEnd = (await cards(ctx)).find(c => c.title === 'Watching CI');
    ctx.assert.deepEqual(out.afterEnd.cls, ['idle'], 'the ring goes with it');
    ctx.assert.deepEqual(out.afterEnd.chips, [], '…and so does the chip');
    return out;
  } finally {
    for (const p of sleeps) { try { p.kill(); } catch {} }
  }
}
