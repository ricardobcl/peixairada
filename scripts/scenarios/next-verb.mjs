// Next (2026-11-01, round XIX's M1): one key and one button that say what the fleet needs, in a fixed, stated order, and
// always arrive. What this checks: the order (questions by longest wait, then a PR at your move, then what to read), ⌥⌘⏎
// and a click walking it and coming round, the bar naming the next thing, a reply read leaving the queue, *caught up* with
// nothing left, the launcher's row, and the app's `next`.
import { spawn } from 'node:child_process';
import { appendFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeFixture, replyLines } from '../fixture.mjs';
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.reload();
  const seg = () => ctx.evaluate(`document.querySelector('#sbLeft .seg.nx').textContent.trim()`);
  await ctx.waitFor(`document.querySelector('#sbLeft .seg.nx')`, { what: 'the Next segment' });
  ctx.assert.equal(await seg(), 'caught up', 'nothing wants you: it says so, and offers nothing');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#sbLeft .seg.nx').tagName`), 'SPAN', 'not a button then');

  const cwd = realpathSync(tmpdir()), sleeps = Array.from({ length: 2 }, () => spawn('sleep', ['120'], { stdio: 'ignore' }));
  try {
    const ago = m => Date.now() - m * 60_000;
    makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Newer question', prompt: 'go', reply: 'one question', at: new Date(ago(1)), live: { pid: sleeps[0].pid, startedAt: ago(90), status: 'waiting', waitingFor: 'input needed', statusAt: ago(5) } },
      { cwd, title: 'Older question', prompt: 'go', reply: 'one question', at: new Date(ago(40)), live: { pid: sleeps[1].pid, startedAt: ago(90), status: 'waiting', waitingFor: 'input needed', statusAt: ago(30) } },
    ]);
    await ctx.waitFor(`document.querySelector('#sbLeft .seg.nx.ask')?.textContent.includes('2 asking')`, { what: 'the questions in the bar', timeout: 15000 });
    ctx.assert.equal(await seg(), `2 asking · 30m▸ Answer ${cwd.split('/').pop()}`, 'the count, the longest wait, and who is next');
    // a reply to read comes after the questions
    const [read] = ctx.fixture.chats;
    appendFileSync(read.file, replyLines({ id: read.id, cwd: read.cwd, text: 'Done, have a look.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
    await ctx.waitFor(`window.__posts.filter(m => m.type === 'state').pop().replied.some(r => r.id === '${read.id}')`, { what: 'a reply wanting you', timeout: 15000 });
    const title = () => ctx.evaluate(`window.peix.session(window.peix.state().current)?.title`);
    const walk = [];
    await ctx.key('Enter'); await ctx.sleep(250); walk.push(await title());
    await ctx.evaluate(`document.querySelector('#sbLeft .seg.nx').click()`); await ctx.sleep(250); walk.push(await title());
    await ctx.key('Enter'); await ctx.sleep(250); walk.push(await title());
    const readTitle = await ctx.evaluate(`window.peix.session('${read.id}').title`);
    ctx.assert.deepEqual(walk, ['Older question', 'Newer question', readTitle], 'the longest wait, the next question, then what to read: ⌥⌘⏎ and a click alike');
    // read, it has left the queue, and Next comes round to the top
    await ctx.waitFor(`!window.__posts.filter(m => m.type === 'state').pop().replied.some(r => r.id === '${read.id}')`, { what: 'the reply read by opening it' });
    await ctx.key('Enter'); await ctx.sleep(250);
    ctx.assert.equal(await title(), 'Older question', 'round again, the read one gone');
    const post = await ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'state').pop().next)`).then(JSON.parse);
    ctx.assert.equal(post.sub, 'Older question', "the app's first row names it");
    ctx.assert.ok(Math.abs((Date.now() - Number(post.since)) / 60000 - 30) < 2, 'and when it began');
    // the launcher has it
    await ctx.key('KeyL'); await ctx.waitFor(`document.querySelector('#pick[open]')`, { what: 'the launcher' });
    await ctx.fill('#pickq', '>next');
    await ctx.waitFor(`[...document.querySelectorAll('#picklist .pkrow')].some(r => /Next: Answer/.test(r.textContent))`, { what: "the launcher's row" });
    await ctx.evaluate(`document.querySelector('#pick').close()`);
    return { walk };
  } finally { for (const s of sleeps) s.kill(); }
}
