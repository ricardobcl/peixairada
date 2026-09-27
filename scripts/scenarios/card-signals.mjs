// The four readings of a card (2026-09-21): Claude at work, a monitor still running behind the turn, N sub-agents
// at work, and a question waiting on you — which is the registry's word, `status: "waiting"`, since the transcript
// only hears of a question with its answer and never of a permission prompt (2026-09-22). Each is a chat in the fixture with a live pid (a `sleep` of its own —
// the server only asks whether the pid is there), and what is checked is the server's word (tasks, ask, agents)
// and the card the page builds from it: the classes that drive the ring, how many lights it runs, the chips and
// the question line.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { makeFixture, replyLines, taskNoteLine, toolLines } from '../fixture.mjs';

// The sweep that asks the machine whether a background command is still running is on the registry poll, and it
// leaves a task alone for its first seconds (the file exists before the process has opened it): both are wound
// down here so the scenario does not wait half a minute for them.
export const meta = { server: true, fixture: 'auto', env: { REGISTRY_POLL_MS: '1200', TASK_GRACE_MS: '400' } };

const cards = ctx => ctx.evaluate(`[...document.querySelectorAll('#slist .card')].map(c => ({
  title: c.querySelector('.title')?.textContent || '',
  cls: [...c.classList].filter(x => ['working', 'watching', 'asking', 'idle', 'needs-input'].includes(x)).sort(),
  lights: c.style.getPropertyValue('--lights') || '',
  chips: [...c.querySelectorAll('.trow .chip')].map(x => x.textContent.trim()),
  state: c.querySelector('.state')?.textContent.trim() || '',
  lit: getComputedStyle(c).getPropertyValue('--lit').trim(),
  spins: getComputedStyle(c).getPropertyValue('--spins').trim(),
}))`);

export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-signals', 'signals-repo');
  const sleeps = Array.from({ length: 7 }, () => spawn('sleep', ['180'], { stdio: 'ignore' }));
  // The output file of that last chat's command, and something holding it open exactly as the harness's own
  // spawn does — this is what the server asks about, and killing it is that command ending.
  const outFile = join(mkdtempSync(join(tmpdir(), 'peix-task-')), 'bldx1y2z3.output');
  writeFileSync(outFile, '');
  const holder = spawn('/bin/sh', ['-c', `exec sleep 120 >> ${JSON.stringify(outFile)}`], { stdio: 'ignore' });
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
    // 5 · both at once — a monitor running *and* a turn in flight: the work ring must win, at the work pace
    { cwd, title: 'Both at once', prompt: 'ship it while the CI runs', reply: 'on it', at: at(700_000), live: live(4),
      lines: id => [
        ...toolLines({ id, cwd, name: 'Monitor', input: { command: 'gh run watch', description: 'the deploy run', timeout_ms: 1800_000 },
          result: 'Monitor started (task dep99zz11, expires in 30m unless the source ends first).', at: at(200_000) }),
        ...toolLines({ id, cwd, name: 'Bash', input: { command: 'npm run build', description: 'build' }, at: at(80_000) }),
      ] },
    // 6 · a background command with a real output file: held open while it runs, let go when it ends
    { cwd, title: 'A real background job', prompt: 'build it in the background', reply: 'building', at: at(800_000), live: live(5),
      lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm run build', description: 'the long build', run_in_background: true },
        result: `Command running in background with ID: bldx1y2z3. Output is being written to: ${outFile}. You will be notified when it completes.`, at: at(150_000) }) },
    // 4 · a question, waiting: an AskUserQuestion with no answer
    { cwd, title: 'Waiting on you', prompt: 'set up the database', reply: 'one question first', at: at(500_000), live: live(3),
      lines: id => toolLines({ id, cwd, name: 'AskUserQuestion', at: at(30_000),
        input: { questions: [{ question: 'Which database should the service use?', header: 'Database', options: [{ label: 'Postgres' }, { label: 'MySQL' }, { label: 'SQLite' }] }] } }) },
    // 7 · blocked on a permission prompt: the transcript reads as a tool call in flight, and only the registry knows
    { cwd, title: 'Blocked on a prompt', prompt: 'delete the old branches', reply: 'on it', at: at(450_000), live: { ...live(6), status: 'waiting', waitingFor: 'permission prompt' },
      lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'git branch -D old', description: 'delete the old branch' }, at: at(20_000) }) },
  ]);
  const chat = t => chats.find(c => c.title === t);
  // Three sub-agent transcripts for the agents chat, each mid-turn: <slug>/<id>/subagents/agent-*.jsonl
  const agents = chat('Three agents out');
  const agentDir = join(dirname(agents.file), agents.id, 'subagents');
  mkdirSync(agentDir, { recursive: true });
  for (const n of [1, 2, 3]) writeFileSync(join(agentDir, `agent-${n}.jsonl`), JSON.stringify({ isSidechain: true, type: 'user', message: { role: 'user', content: 'go' } }) + '\n');

  try {
    await ctx.server.restart();
    await ctx.send('Page.reload'); await ctx.sleep(1500);
    await ctx.waitFor(`window.peix.sessions().filter(s => s.cwd === ${JSON.stringify(cwd)}).length === 7`, { what: 'the seven chats' });
    await ctx.waitFor(`window.peix.sessions().some(s => s.agents === 3)`, { what: 'the three sub-agents counted', timeout: 20000 });

    // ---- what the server says ----
    out.server = await ctx.peix(`sessions().filter(s => s.cwd === ${JSON.stringify(cwd)}).map(s => ({ title: s.title, status: s.status, agents: s.agents, tasks: (s.tasks || []).map(t => t.kind + ':' + t.what + ':' + t.events), ask: s.ask && (s.ask.tool + '/' + s.ask.options + (s.ask.waitingFor ? '/' + s.ask.waitingFor : '')) }))`);
    const by = t => out.server.find(x => x.title === t);
    ctx.assert.equal(by('Normal work').status, 'working', 'a tool call with no answer is work in progress');
    ctx.assert.deepEqual(by('Watching CI').tasks, ['monitor:CI checks on PR #382:1'], 'the monitor is running, and its one event was counted');
    ctx.assert.equal(by('Watching CI').status, 'idle', '…while the chat itself is ready: the turn ended');
    ctx.assert.equal(by('Three agents out').agents, 3);
    ctx.assert.equal(by('Waiting on you').ask, 'AskUserQuestion/3', 'the question, and the three answers it offers');
    ctx.assert.equal(by('Blocked on a prompt').status, 'needs-input', 'a process waiting on a prompt is asking, though its transcript reads as work');
    ctx.assert.equal(by('Blocked on a prompt').ask, 'null/0/permission prompt', '…and all it can say is what it waits on');

    // ---- what the card does with it ----
    out.cards = (await cards(ctx)).filter(c => ['Normal work', 'Watching CI', 'Three agents out', 'Waiting on you', 'Both at once', 'Blocked on a prompt'].includes(c.title));
    await ctx.shot('card-signals');
    // Both themes: the ring colours have to read on the light one too (--watch and --needs are a pair per theme).
    await ctx.evaluate(`document.documentElement.dataset.theme = 'light'`);
    await ctx.shot('card-signals-light');
    await ctx.evaluate(`delete document.documentElement.dataset.theme`);
    const card = t => out.cards.find(c => c.title === t);
    ctx.assert.deepEqual(card('Normal work').cls, ['working'], 'plain work: the clauding ring, nothing else');
    ctx.assert.equal(card('Normal work').lights, '', '…one light (the default)');
    ctx.assert.deepEqual(card('Watching CI').cls, ['idle', 'watching'], 'a ready card that is still watching something');
    ctx.assert.deepEqual(card('Watching CI').chips, ['monitor · CI checks on PR #382'], '…and says what is running, not merely that something is');
    ctx.assert.equal(card('Three agents out').lights, '3', 'one light per sub-agent');
    ctx.assert.deepEqual(card('Three agents out').chips, ['3 agents']);
    ctx.assert.deepEqual(card('Waiting on you').cls, ['asking', 'needs-input'], 'the question stops the card');
    ctx.assert.deepEqual(card('Blocked on a prompt').cls, ['asking', 'needs-input'], 'and so does a permission prompt');
    ctx.assert.match(card('Blocked on a prompt').state, /^asking you — permission prompt$/, '…saying what it waits on');
    // …and it is the border blinking, not a light running round the edge (2026-09-22)
    const ask = await ctx.evaluate(`JSON.stringify((c => ({ anim: getComputedStyle(c).animationName, ring: getComputedStyle(c, '::before').content }))([...document.querySelectorAll('#slist .card')].find(c => c.querySelector('.title')?.textContent === 'Waiting on you')))`).then(JSON.parse);
    ctx.assert.equal(ask.anim, 'blink', 'the card itself blinks');
    ctx.assert.equal(ask.ring, 'none', 'and there is no ring on it');
    // ⌘B folds the list to a rail: one square per chat, the project's short name on it, the edge still saying
    // what is clauding, how many agents are out, what is watching and what is asking (2026-09-22)
    await ctx.cmd('KeyB');
    await ctx.waitFor(`document.querySelector('#main').classList.contains('scompact')`, { what: 'the folded list' });
    const rail = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#slist > .card')].map(c => ({
      abbr: c.querySelector('.abbr').textContent,
      w: Math.round(c.getBoundingClientRect().width),
      cls: [...c.classList].filter(x => ['working', 'watching', 'asking'].includes(x)).sort(),
      lights: getComputedStyle(c).getPropertyValue('--lights').trim(),
      shows: getComputedStyle(c.querySelector('.trow')).display,
    })))`).then(JSON.parse);
    ctx.assert.ok(rail.every(r => r.shows === 'none'), 'the cards show nothing but their short name');
    ctx.assert.ok(rail.every(r => r.w > 30 && r.w < 60), 'and they are squares in a rail');
    ctx.assert.deepEqual([...new Set(rail.map(r => r.abbr))], ['SR', 'T', 'PE'], 'signals-repo · T · peixairada');
    ctx.assert.ok(rail.some(r => r.cls.includes('asking')), 'the question still reads from the rail');
    ctx.assert.equal(rail.find(r => r.lights === '3')?.cls.join(), 'working', 'and so do the three agents');
    await ctx.shot('rail', { x: 0, y: 0, width: 300, height: 900 });
    await ctx.cmd('KeyB');
    await ctx.waitFor(`!document.querySelector('#main').classList.contains('scompact')`, { what: 'the list back' });
    ctx.assert.match(card('Waiting on you').state, /asking you: Which database should the service use\?3 answers/, 'the question is on the card, with how many answers it offers');
    ctx.assert.notEqual(card('Waiting on you').lit, card('Normal work').lit, 'and it is lit in another colour than work');
    ctx.assert.deepEqual(card('Both at once').cls, ['watching', 'working'], 'a chat can be both — clauding with a monitor of its own');
    ctx.assert.equal(card('Both at once').lit, card('Normal work').lit, '…and the work ring wins');
    ctx.assert.equal(card('Both at once').spins, '1.4s', '…at the work pace: every rule sets every variable, or the monitor\'s 6s leaks into it');
    ctx.assert.deepEqual(card('Both at once').chips, ['monitor · the deploy run'], '…while the chip still says what is running');

    // ---- the ring keeps its place across a render (2026-09-27) ----
    // Every SSE update rebuilds the cards, and a CSS animation starts over on a new node: the light jumped back to
    // its start on every update (Ricardo: "the animations like the border when clauding still reset randomly").
    // Now the ring is a transform animation — the compositor's, off the main thread — phased to the document clock
    // after each render, so the new card's light is where the old one's was. A line appended to the clauding
    // chat's transcript is one such update.
    const ring = () => ctx.evaluate(`JSON.stringify((c => {
      const a = c.getAnimations({ subtree: true }).find(a => a.animationName === 'ring');
      const m = new DOMMatrix(getComputedStyle(c, '::before').transform), doc = document.timeline.currentTime;
      c.__seen = (c.__seen || 0) + 1;
      return { seen: c.__seen, start: a && a.startTime, props: a && Object.keys(a.effect.getKeyframes().at(-1)).filter(k => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)),
        angle: Math.round((Math.atan2(m.b, m.a) * 180 / Math.PI + 360) % 360), expect: Math.round((doc % 1400) / 1400 * 360) };
    })([...document.querySelectorAll('#slist .card')].find(c => c.querySelector('.title')?.textContent === 'Normal work')))`).then(JSON.parse);
    out.ring = [await ring()];
    const work = chat('Normal work');
    appendFileSync(work.file, toolLines({ id: work.id, cwd, name: 'Bash', input: { command: 'npm run build', description: 'build' }, at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
    await ctx.waitFor(`(c => !!c && !c.__seen)([...document.querySelectorAll('#slist .card')].find(c => c.querySelector('.title')?.textContent === 'Normal work'))`, { what: 'the card rebuilt on the update' });
    out.ring.push(await ring());
    ctx.assert.deepEqual(out.ring.map(r => r.start), [0, 0], 'the ring is at start time 0 on the document clock, before the update and on the new card after it');
    ctx.assert.deepEqual(out.ring[1].props, ['transform'], 'and it is a transform animation, the kind the compositor runs');
    for (const r of out.ring) ctx.assert.ok(Math.min(Math.abs(r.angle - r.expect), 360 - Math.abs(r.angle - r.expect)) <= 3, `the light is where the clock says: ${r.angle}° for ${r.expect}°`);
    // The cog's switch (2026-09-27): off, each card's ring runs at a phase of its own, hashed from the chat's id —
    // steady across renders, only not shared; on again, all at 0
    const starts = () => ctx.evaluate(`JSON.stringify(Object.fromEntries([...document.querySelectorAll('#slist .card.working')].map(c => [c.querySelector('.title').textContent, c.getAnimations({ subtree: true }).find(a => a.animationName === 'ring')?.startTime])))`).then(JSON.parse);
    await ctx.evaluate(`document.querySelector('#ringsInStep').click()`);
    out.scattered = await starts();
    ctx.assert.ok(Object.keys(out.scattered).length >= 3 && Object.values(out.scattered).every(t => t < 0) && new Set(Object.values(out.scattered)).size > 1, `off, every ring has a start of its own: ${JSON.stringify(out.scattered)}`);
    ctx.assert.equal(await ctx.evaluate(`window.peix.prefs().ringsInStep`), false, '…and the choice is a pref');
    appendFileSync(work.file, toolLines({ id: work.id, cwd, name: 'Bash', input: { command: 'npm run lint', description: 'lint' }, at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
    await ctx.waitFor(`(c => !!c && !c.__seen)([...document.querySelectorAll('#slist .card')].find(c => c.querySelector('.title')?.textContent === 'Normal work'))`, { what: 'the card rebuilt once more' });
    ctx.assert.deepEqual(await starts(), out.scattered, '…and a rebuild keeps each ring where it was');
    await ctx.evaluate(`document.querySelector('#ringsInStep').click()`);
    ctx.assert.ok(Object.values(await starts()).every(t => t === 0), 'on again, every ring in step');

    // ---- and it leads the list: a question costs you a second and unblocks a turn (2026-09-21) ----
    out.order = await ctx.evaluate(`[...document.querySelectorAll('#slist > *')].map(e => e.classList.contains('gsep') ? 'divider' : e.querySelector('.title')?.textContent)`);
    ctx.assert.deepEqual(out.order.slice(0, 8), ['Blocked on a prompt', 'Waiting on you', 'Normal work', 'Three agents out', 'Both at once', 'A real background job', 'divider', 'Watching CI'],
      'the questions first, then the clauding chats by your last touch, then the divider, then the ready ones');
    // The divider is Claude's mark between two hairlines, turning and breathing on the document clock (2026-09-27;
    // a school of fish before)
    out.divider = await ctx.evaluate(`JSON.stringify((d => ({ svg: !!d.querySelector('svg'), lines: d.querySelectorAll('i').length, anims: d.getAnimations({ subtree: true }).map(a => a.animationName + '@' + a.startTime).sort() }))(document.querySelector('#slist .gsep.claude')))`).then(JSON.parse);
    ctx.assert.deepEqual(out.divider, { svg: true, lines: 2, anims: ['breathe@0', 'spin@0'] }, "the divider is Claude's mark between two hairlines, turning and breathing on the document clock");
    await ctx.key('KeyK');   // the chat picker goes by the same rank
    await ctx.waitFor(`document.querySelector('#pick').open && document.querySelectorAll('#picklist .pkrow').length > 3`, { what: 'the chat picker' });
    out.picker = await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow')].slice(0, 3).map(r => r.querySelector('.n').textContent.replace('current', '') + ' / ' + r.querySelector('.st').textContent)`);
    ctx.assert.deepEqual(out.picker.slice(0, 2), ['Blocked on a prompt / asking', 'Waiting on you / asking'], '⌥⌘K opens on them too');
    await ctx.evaluate(`document.querySelector('#pick').close()`);

    // ---- the open chat's header carries the same chip, where there is room for it ----
    await ctx.openChat(chat('A real background job').id);
    await ctx.waitFor(`document.querySelector('#shead .chip.watch')`, { what: "the header's chip" });
    out.headChip = await ctx.evaluate(`document.querySelector('#shead .chip.watch').textContent.trim()`);
    ctx.assert.equal(out.headChip, 'running · the long build', 'the open chat says what it is running, in its header');
    await ctx.shot('card-signals-header');

    // ---- a background command is let go when nothing holds its output file open any more ----
    ctx.assert.ok((await ctx.peix(`sessions().find(s => s.title === 'A real background job').tasks.length`)) === 1, 'it is running while something holds the file');
    holder.kill();
    await ctx.waitFor(`window.peix.sessions().find(s => s.title === 'A real background job').tasks.length === 0`,
      { what: 'the command let go once its output file was closed', timeout: 20000 });

    // ---- the end of a monitor takes the chip away ----
    const b = chat('Watching CI');
    writeFileSync(b.file, '', { flag: 'a' });
    appendFileSync(b.file, JSON.stringify(taskNoteLine({ id: b.id, cwd, taskId: mon, summary: 'Monitor "CI checks on PR #382" completed', status: 'completed' })) + '\n');
    await ctx.waitFor(`(window.peix.sessions().find(s => s.title === 'Watching CI')?.tasks || []).length === 0`, { what: 'the monitor gone when it reported its end' });
    out.afterEnd = (await cards(ctx)).find(c => c.title === 'Watching CI');
    ctx.assert.deepEqual(out.afterEnd.cls, ['idle'], 'the ring goes with it');
    ctx.assert.deepEqual(out.afterEnd.chips, [], '…and so does the chip');

    // ---- a prompt going up is the registry changing, and nothing else (2026-09-22) ----
    // Claude Code rewrites its registry file on every change of state; the transcript is not touched until the
    // prompt is answered. The card has to blink, and the alert go out, on the first alone.
    await ctx.evaluate(`window.__alerts = []; new EventSource('/events').addEventListener('alert', e => window.__alerts.push(JSON.parse(e.data)))`);
    await ctx.sleep(300);
    const nw = chat('Normal work'), regFile = join(ctx.fixture.dir, 'sessions', `${nw.pid}.json`);
    const reg = JSON.parse(readFileSync(regFile, 'utf8'));
    writeFileSync(regFile, JSON.stringify({ ...reg, status: 'waiting', waitingFor: 'permission prompt', statusUpdatedAt: Date.now() }));
    await ctx.waitFor(`[...document.querySelectorAll('#slist > .card')].find(c => c.querySelector('.title')?.textContent === 'Normal work')?.classList.contains('asking')`,
      { what: 'the card blinking on the registry alone', timeout: 5000 });
    await ctx.waitFor(`window.__alerts.some(a => a.title === 'Normal work' && a.kind === 'needs-input')`, { what: 'the alert, as the prompt went up', timeout: 3000 });
    out.alert = await ctx.evaluate(`window.__alerts.find(a => a.title === 'Normal work').snippet`);
    ctx.assert.equal(out.alert, 'Waiting on you: permission prompt');
    await ctx.shot('card-signals-prompt');
    // …answered: the registry says busy again, and the lines that asked and answered land together, as they do
    writeFileSync(regFile, JSON.stringify({ ...reg, status: 'busy', statusUpdatedAt: Date.now() }));
    appendFileSync(nw.file, toolLines({ id: nw.id, cwd, name: 'AskUserQuestion', result: 'Your questions have been answered: "Which one?"="this"',
      input: { questions: [{ question: 'Which one?', options: [{ label: 'this' }, { label: 'that' }] }] } }).map(l => JSON.stringify(l)).join('\n') + '\n');
    await ctx.waitFor(`[...document.querySelectorAll('#slist > .card')].find(c => c.querySelector('.title')?.textContent === 'Normal work')?.classList.contains('working')`,
      { what: 'the card back at work', timeout: 5000 });
    await ctx.sleep(1200);   // past the alert's debounce
    out.alertsAfter = await ctx.evaluate(`window.__alerts.filter(a => a.title === 'Normal work').map(a => a.kind)`);
    ctx.assert.deepEqual(out.alertsAfter, ['needs-input'], 'and no second alert for a question whose line arrived with its answer');
    return out;
  } finally {
    for (const p of [...sleeps, holder]) { try { p.kill(); } catch {} }
  }
}
