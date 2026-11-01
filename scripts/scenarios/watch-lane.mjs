// The Watching lane (2026-10-31, round XIII): a chat with a monitor or a command still running behind the turn is a lane
// of its own after Clauding — whatever its age —, a question and work beating it, as the ring ranks them. A turn its own
// monitor's notice woke keeps it there (the clauding ring lit on it), so a chatty watch does not bounce the card; your
// word or the last task ending moves it. Its ✓ says what Done would end and asks once more — from the card, and from
// its right-click menu. A wake-up the chat set itself (ScheduleWakeup, CronCreate) is a watch too: Watching till it goes
// off, saying when on its live line at every card size.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFixture, replyLines, scheduledLine, taskNoteLine, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto', env: { REGISTRY_POLL_MS: '1200' } };

const lanes = ctx => ctx.evaluate(`[...document.querySelectorAll('#slist > *')].map(e => e.classList.contains('lane') ? 'lane:' + e.dataset.lane + ' ' + (e.querySelector('b')?.textContent || '') : e.classList.contains('card') ? e.querySelector('.title').textContent : null).filter(Boolean)`);

export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-watch', 'watch-repo');
  const sleeps = Array.from({ length: 8 }, () => spawn('sleep', ['300'], { stdio: 'ignore' }));
  const live = i => ({ pid: sleeps[i].pid, startedAt: Date.now() - 3600_000 });
  const now = Date.now(), at = ms => new Date(now - ms), mon = 'monwl7c1', dep = 'mondep42';
  const monitor = (id, task, what, ms) => toolLines({ id, cwd, name: 'Monitor', input: { command: 'gh pr checks', description: what, timeout_ms: 3600_000 },
    result: `Monitor started (task ${task}, expires in 60m unless the source ends first).`, at: at(ms) });
  const wakeAt = now + 52 * 60_000 + 20_000, dueAt = now - 20_000;
  const wakeup = (id, scheduledFor, ms) => toolLines({ id, cwd, name: 'ScheduleWakeup', input: { delaySeconds: 1200, prompt: '/loop check the canary', reason: 'the canary needs its hour', noop: false },
    result: 'Scheduled.', toolUseResult: { scheduledFor, clampedDelaySeconds: 1200, wasClamped: false }, at: at(ms) });
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      // a watch whose last word is older than the ready chat's: the lane is not the age's
      { cwd, title: 'Watching CI', prompt: 'watch the CI on #382', reply: 'watching', at: at(900_000), live: live(0),
        lines: id => [...monitor(id, mon, 'CI checks on PR #382', 890_000), ...replyLines({ id, cwd, text: 'Watching it.', at: at(880_000) })] },
      { cwd, title: 'Watching the deploy', prompt: 'tell me when the deploy lands', reply: 'on it', at: at(800_000), live: live(1),
        lines: id => [...monitor(id, dep, 'the deploy run', 790_000), ...replyLines({ id, cwd, text: 'Watching the deploy.', at: at(780_000) })] },
      { cwd, title: 'Plain and ready', prompt: 'what day is it?', reply: 'Saturday.', at: at(60_000), live: live(2) },
      { cwd, title: 'At work', prompt: 'refactor the parser', reply: 'on it', at: at(300_000), live: live(3),
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test', description: 'run the tests' }, at: at(30_000) }) },
      // work beats a watch: a turn of yours with a monitor out
      { cwd, title: 'Work and a watch', prompt: 'ship it while the CI runs', reply: 'on it', at: at(700_000), live: live(4),
        lines: id => [...monitor(id, 'monboth9', 'the release run', 200_000), ...toolLines({ id, cwd, name: 'Bash', input: { command: 'npm run build' }, at: at(20_000) })] },
      // a question beats a watch
      { cwd, title: 'Asking, watching', prompt: 'set it up', reply: 'one question', at: at(600_000), live: { ...live(5), status: 'waiting', waitingFor: 'permission prompt' },
        lines: id => [...monitor(id, 'monask11', 'the logs', 500_000), ...toolLines({ id, cwd, name: 'Bash', input: { command: 'rm -rf build' }, at: at(10_000) })] },
      // wake-ups it set itself: one in 52 minutes, one due
      { cwd, title: 'Back in an hour', prompt: '/loop check the canary', reply: 'set', at: at(1000_000), live: live(6),
        lines: id => [...wakeup(id, wakeAt, 995_000), ...replyLines({ id, cwd, text: 'I will look again in 52 minutes.', at: at(990_000) })] },
      { cwd, title: 'Due now', prompt: '/loop check the queue', reply: 'set', at: at(1100_000), live: live(7),
        lines: id => [...wakeup(id, dueAt, 1095_000), ...replyLines({ id, cwd, text: 'Back soon.', at: at(1090_000) })] },
    ]);
    const chat = t => chats.find(c => c.title === t), ci = chat('Watching CI'), card = `document.querySelector('#slist > .card[data-id="${ci.id}"]')`;
    await ctx.waitFor(`window.peix.sessions().filter(s => s.cwd === ${JSON.stringify(cwd)}).length === 8 && document.querySelector('#slist > .gsep.lane[data-lane="watching"]')`, { what: 'the eight chats, a Watching lane' });
    await ctx.settle(); await ctx.waitFor(`!document.querySelector('.rn.rolling')`);
    const mine = l => l.filter(x => x.startsWith('lane:') || chats.some(c => c.title === x));
    out.lanes = mine(await lanes(ctx));
    ctx.assert.deepEqual(out.lanes.slice(0, 11), ['lane:asking 1', 'Asking, watching', 'lane:working 2', 'At work', 'Work and a watch', 'lane:watching 4', 'Watching the deploy', 'Watching CI', 'Back in an hour', 'Due now', 'lane:ready 3'],
      `asking, then clauding — each beating a watch —, then Watching by its last word whatever its age, then Ready: ${JSON.stringify(out.lanes)}`);
    out.counts = await ctx.evaluate(`({ title: document.title, vh: ${card}.querySelector('.top .vh').textContent })`);
    ctx.assert.equal(out.counts.vh, 'Watching — ', 'the card says its lane once');
    await ctx.shot('watch-lane', { x: 0, y: 0, width: 420, height: 900 });

    // ---- a wake-up says when, at every card size ----
    const bk = chat('Back in an hour'), due = chat('Due now'), line = id => `document.querySelector('#slist > .card[data-id="${id}"] .state.live')`;
    await ctx.waitFor(`/in \\d/.test(${line(bk.id)}?.textContent || '')`, { what: 'the wake-up on its card' });
    const hm = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    out.wake = await ctx.evaluate(`({ said: ${line(bk.id)}.textContent, due: ${line(due.id)}.textContent, tip: ${line(bk.id)}.querySelector('[title]')?.title,
      compact: (document.querySelector('#sessions').dataset.cards = 'compact', getComputedStyle(${line(bk.id)}).display), plain: getComputedStyle(document.querySelector('#slist > .card[data-id="${ci.id}"] .state.live') || document.body).display })`);
    await ctx.settle(); await ctx.shot('watch-wake-compact', { x: 0, y: 0, width: 420, height: 700 });
    await ctx.evaluate(`document.querySelector('#sessions').dataset.cards = window.peix.prefs().cards`);
    ctx.assert.match(out.wake.said, new RegExp(`^wakes at ${hm(wakeAt)} · in 5[23] min$`), `when it wakes: ${JSON.stringify(out.wake)}`);
    ctx.assert.equal(out.wake.due, `wakes at ${hm(dueAt)} · due now`);
    ctx.assert.equal(out.wake.tip, `Claude set itself to wake at ${hm(wakeAt)} — the canary needs its hour`);
    ctx.assert.equal(out.wake.compact, 'grid', 'a compact card shows it: it is why the card is here');
    // its Done names it: the wake-up dies with the claude
    await ctx.evaluate(`(c => c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: c.getBoundingClientRect().left + 40, clientY: c.getBoundingClientRect().top + 20 })))(document.querySelector('#slist > .card[data-id="${bk.id}"]'))`);
    await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: 'its menu' });
    out.wake.menu = await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.querySelector('.ct')?.textContent === 'Done')?.querySelector('.csub')?.textContent`);
    await ctx.evaluate(`document.querySelector('#ctxm').close()`);
    ctx.assert.equal(out.wake.menu, `ends its watch — the wake-up at ${hm(wakeAt)}`);
    // the time it set comes: its turn spends the wake-up, and the chat is Ready (or Clauding, at work)
    appendFileSync(due.file, JSON.stringify(scheduledLine({ id: due.id, cwd })) + '\n');
    await ctx.waitFor(`!window.peix.session('${due.id}').wake && document.querySelector('#slist > .card[data-id="${due.id}"]')?.dataset.rank === 'ready'`, { what: 'the wake-up spent' });

    // ---- no ping-pong: a turn its monitor's notice woke stays in Watching, the clauding ring lit on it ----
    const append = lines => appendFileSync(ci.file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
    append([taskNoteLine({ id: ci.id, cwd, taskId: mon, summary: 'Monitor event', event: 'Build: pass' }), ...toolLines({ id: ci.id, cwd, name: 'Bash', input: { command: 'gh pr checks 382' } })]);
    await ctx.waitFor(`window.peix.session('${ci.id}')?.woken === true && ${card}?.classList.contains('working')`, { what: 'the woken turn, its card at work' });
    await ctx.settle();
    out.woken = { rank: await ctx.evaluate(`${card}.dataset.rank`), before: await ctx.evaluate(`${card}.previousElementSibling?.classList.contains('lane') ? ${card}.previousElementSibling.dataset.lane : ${card}.previousElementSibling?.querySelector('.title')?.textContent`),
      ov: null };
    ctx.assert.equal(out.woken.rank, 'watching', 'woken by its own monitor: still Watching');
    await ctx.key('KeyA');
    await ctx.waitFor(`document.querySelector('#ov').open`, { what: 'the overview' });
    await ctx.waitFor(`document.querySelector('#ovcols > section .ot')`, { what: 'its tiles' });
    out.woken.ov = await ctx.evaluate(`[...document.querySelectorAll('#ovcols > section')].filter(c => [...c.querySelectorAll('.ot h3')].some(h => h.textContent === 'Watching CI')).map(c => c.querySelector('h2 span').textContent)`);
    await ctx.evaluate(`document.querySelector('#ov').close()`);
    ctx.assert.deepEqual(out.woken.ov, ['Watching'], `the overview's Watching column too: ${JSON.stringify(out.woken.ov)}`);
    // your word: Clauding
    append([{ isSidechain: false, userType: 'external', entrypoint: 'cli', cwd, sessionId: ci.id, version: 'fixture', gitBranch: 'main', parentUuid: null, type: 'user', uuid: 'u-' + Date.now(), timestamp: new Date().toISOString(),
      message: { role: 'user', content: [{ type: 'text', text: 'and the lint too' }] } }]);
    await ctx.waitFor(`window.peix.session('${ci.id}')?.woken === false && ${card}?.dataset.rank === 'working'`, { what: 'your word: Clauding' });
    // its end: Watching again
    append(replyLines({ id: ci.id, cwd, text: 'Lint is clean; still watching.' }));
    await ctx.waitFor(`${card}?.dataset.rank === 'watching'`, { what: 'the turn ended: Watching' });
    // the last task ending moves a woken turn to Clauding
    append([taskNoteLine({ id: ci.id, cwd, taskId: mon, summary: 'Monitor completed', status: 'completed' }), ...toolLines({ id: ci.id, cwd, name: 'Bash', input: { command: 'gh pr view 382' } })]);
    await ctx.waitFor(`${card}?.dataset.rank === 'working' && !(window.peix.session('${ci.id}').tasks || []).length`, { what: 'the watch over: Clauding' });
    append(replyLines({ id: ci.id, cwd, text: 'All green.' }));
    await ctx.waitFor(`${card}?.dataset.rank === 'ready'`, { what: 'and Ready once it answered' });

    // ---- ✓ says what it ends, and asks once more ----
    const dp = chat('Watching the deploy'), dcard = `document.querySelector('#slist > .card[data-id="${dp.id}"]')`;
    const posts = () => ctx.evaluate(`window.peix.session('${dp.id}').done`);
    await ctx.evaluate(`${dcard}.querySelector('.act').click()`);
    await ctx.waitFor(`${dcard}?.querySelector('.act.armed')`, { what: 'the ✓ armed' });
    out.armed = await ctx.evaluate(`(b => ({ text: b.textContent.trim(), title: b.title, shown: getComputedStyle(b).opacity }))(${dcard}.querySelector('.act.armed'))`);
    ctx.assert.equal(out.armed.text, 'ends monitor · the deploy run', `it names what Done ends: ${JSON.stringify(out.armed)}`);
    ctx.assert.equal(out.armed.shown, '1', 'shown without the pointer');
    await ctx.sleep(400);
    ctx.assert.equal(await posts(), false, 'one click ticks nothing');
    await ctx.settle();
    await ctx.shot('watch-armed', await ctx.evaluate(`(r => ({ x: r.left - 4, y: r.top - 4, width: r.width + 8, height: Math.min(r.height + 8, 220), scale: 2 }))(${dcard}.getBoundingClientRect())`));
    // let be, it lets go
    await ctx.waitFor(`!${dcard}?.querySelector('.act.armed')`, { what: 'the ✓ let go after a while', timeout: 8000 });
    // the right-click menu's Done names it too, and arms the card's ✓ rather than ticking
    await ctx.evaluate(`(c => c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: c.getBoundingClientRect().left + 40, clientY: c.getBoundingClientRect().top + 20 })))(${dcard})`);
    await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: 'the card\'s menu' });
    out.menu = await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.querySelector('.ct')?.textContent === 'Done')?.textContent`);
    ctx.assert.equal(out.menu, 'Doneends its watch — monitor · the deploy run');
    await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.querySelector('.ct')?.textContent === 'Done').click()`);
    await ctx.waitFor(`${dcard}?.querySelector('.act.armed')`, { what: 'armed from the menu' });
    ctx.assert.equal(await posts(), false, 'the menu\'s Done asked once more too');
    // the second click ticks: the chat done, its claude ended as Done always does
    await ctx.evaluate(`${dcard}.querySelector('.act.armed').click()`);
    await ctx.waitFor(`window.peix.session('${dp.id}')?.done === true`, { what: 'ticked by the second click' });
    // a ready chat's ✓ ticks at once, as before
    const pl = chat('Plain and ready');
    await ctx.evaluate(`document.querySelector('#slist > .card[data-id="${pl.id}"] .act').click()`);
    await ctx.waitFor(`window.peix.session('${pl.id}')?.done === true`, { what: 'a plain chat ticked at once' });
    return out;
  } finally { for (const p of sleeps) try { p.kill(); } catch {} }
}
