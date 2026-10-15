// Home (2026-10-10). Three chats from today: one asked a question that waited on you a quarter of an hour, one a plain
// turn, one clauding now. What this checks: with no chat open the column is the home — the fish and the board's facts,
// and the day: a row per chat with its turns, the question hatched as a wait, the clauding one running to now, and the
// sum (one question, the longest wait its chat's); a row opens its chat, and ⌥⌘0 comes back home from it; and the sea
// rests after a minute alone (2026-10-15), until the pointer moves.
import { spawn } from 'node:child_process';
import { makeFixture, replyLines, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const now = Date.now(), cwd = ctx.fixture.chats[0]?.cwd || process.cwd(), out = {};
  const sleeper = spawn('sleep', ['300'], { stdio: 'ignore' });
  const ago = m => new Date(now - m * 60_000);
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Queue the webhooks', prompt: 'move webhooks off the request path', reply: 'One question first.', at: ago(60),
        lines: id => [...toolLines({ id, cwd, name: 'AskUserQuestion', at: ago(55), result: 'SQS', input: { questions: [{ question: 'Which queue?', header: 'Queue', options: [{ label: 'SQS' }, { label: 'Redis' }] }] } }).map((l, i) => i ? { ...l, timestamp: ago(40).toISOString() } : l),
          ...replyLines({ id, cwd, text: 'SQS it is — done.', at: ago(35) })] },
      { cwd, title: 'Fix the flaky test', prompt: 'the refunds test flakes', reply: 'Each test has its own clock now.', at: ago(30) },
      { cwd, title: 'Retry declined payments', prompt: 'retry declined cards', reply: 'Reading the client.', at: ago(10), live: { pid: sleeper.pid, startedAt: now - 3600_000 },
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test', description: 'Run the tests' }, at: ago(2) }) },
    ]);
    const [asked, plain, busy] = chats;
    await ctx.waitFor(`window.peix.session('${busy.id}')?.status === 'working'`, { what: 'the clauding chat', timeout: 15000 });
    await ctx.reload();   // the home is drawn once the day is in: a page that loaded before the chats were made has no rows for them
    await ctx.waitFor(`document.querySelectorAll('#home .hrow').length >= 3`, { what: 'the day’s rows', timeout: 15000 });
    ctx.assert.match(await ctx.evaluate(`document.querySelector('#home .hkv').textContent`), /Chats.*1 live.*1 clauding.*Today.*Claude worked/s);
    const row = id => `[...document.querySelectorAll('#home .hrow')].findIndex(r => r.dataset.id === '${id}')`;
    const track = id => `document.querySelectorAll('#home .htrack')[${row(id)}]`;
    ctx.assert.ok(await ctx.evaluate(`!!${track(asked.id)}.querySelector('i.a') && !!${track(asked.id)}.querySelector('i.w')`), 'the question as a wait inside its turn');
    ctx.assert.ok(await ctx.evaluate(`!!${track(busy.id)}.querySelector('i.w.now')`), 'the clauding one runs to now');
    ctx.assert.equal(await ctx.evaluate(`${row(busy.id)}`), 0, 'the most recent first');
    out.sum = await ctx.evaluate(`document.querySelector('#home .hsum').textContent`);
    ctx.assert.match(out.sum, /1 question today, answered in 15m on the median/);
    ctx.assert.match(out.sum, /the longest wait: 15m/);
    await ctx.settle(); await ctx.shot('home');

    // the home is drawn again as the clock and the machine move — every 3 s with the CPU — but what is clicked keeps its
    // node (2026-10-14): now is a CSS variable on the day, not a place in its markup, and each fact its own line; a row
    // pressed through two redraws still opens its chat
    out.nodes = await ctx.evaluate(`(window.__home = [...document.querySelectorAll('#home .hrow, #home .hgo')]).length`);
    await ctx.evaluate(`(real => { Date.now = () => real() + 300_000; })(Date.now)`);   // five minutes on: the day's now moves
    const held = await ctx.evaluate(`(r => ({ x: r.left + 20, y: (r.top + r.bottom) / 2 }))(document.querySelectorAll('#home .hrow')[${await ctx.evaluate(row(asked.id))}].getBoundingClientRect())`);
    const mouse = (type, x, y) => ctx.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    await mouse('mouseMoved', held.x, held.y); await mouse('mousePressed', held.x, held.y);
    await ctx.sleep(3600);
    out.kept = await ctx.evaluate(`window.__home.filter(n => n.isConnected).length`);
    out.now = await ctx.evaluate(`document.querySelector('#home .hgrid').style.getPropertyValue('--now')`);
    await mouse('mouseReleased', held.x, held.y);
    await ctx.waitFor(`window.peix.state().current === '${asked.id}'`, { what: 'the row held 3.6 s opened its chat' });
    ctx.assert.equal(out.kept, out.nodes, 'every row and link of the home kept its node');
    ctx.assert.match(out.now, /^\d+(\.\d+)?%$/, 'now is the day’s --now');
    await ctx.key('Digit0');
    await ctx.waitFor(`!window.peix.state().current && document.querySelectorAll('#home .hrow').length >= 3`, { what: 'home after the press' });

    // a row opens its chat; ⌥⌘0 comes back
    await ctx.evaluate(`document.querySelectorAll('#home .hrow')[${await ctx.evaluate(row(plain.id))}].click()`);
    await ctx.waitFor(`window.peix.state().current === '${plain.id}' && !document.querySelector('#home')`, { what: 'the row’s chat open' });
    await ctx.key('Digit0');
    await ctx.waitFor(`!window.peix.state().current && document.querySelectorAll('#home .hrow').length >= 3`, { what: 'home again' });

    // the sea rests after a minute with nothing from the pointer, the keys or the wheel (2026-10-15), on the frame it drew
    // last, and a move of the pointer starts it again
    await ctx.waitFor(`window.peix.sea().running && window.peix.sea().frames > 0`, { what: 'the sea running' });
    await ctx.waitFor(`window.peix.sea().resting && !window.peix.sea().running`, { what: 'the sea at rest after a minute alone', timeout: 75_000, every: 1000 });
    out.still = await ctx.evaluate(`window.peix.sea().frames`); await ctx.sleep(1500);
    ctx.assert.equal(await ctx.evaluate(`window.peix.sea().frames`), out.still, 'no frame drawn at rest');
    await mouse('mouseMoved', 300, 300);
    await ctx.waitFor(`window.peix.sea().running && window.peix.sea().frames > ${out.still}`, { what: 'the sea again after a move' });
    return out;
  } finally { try { sleeper.kill(); } catch {} }
}
