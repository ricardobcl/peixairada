// While you were out (2026-11-01, round XIX's M3): back after ten minutes away, one line over the fish's lane says what
// changed. What this checks: a short absence says nothing, a long one with nothing new says nothing, a long one says what
// landed and whether anything asked, a question is counted, and a click on the line is Next.
import { spawn } from 'node:child_process';
import { appendFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeFixture, replyLines } from '../fixture.mjs';
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.reload();
  const line = () => ctx.evaluate(`document.querySelector('#sbSwim .lnews')?.textContent ?? null`);
  const away = min => ctx.evaluate(`window.peixFront(false, Date.now() - ${min} * 60000)`);
  const back = async () => { await ctx.evaluate(`window.peixFront(true)`); await ctx.sleep(600); };
  await away(2); await back();
  ctx.assert.equal(await line(), null, 'two minutes away: nothing said');
  await away(30); await back();
  ctx.assert.equal(await line(), null, 'half an hour with nothing new: nothing said');
  // two replies land while you are out
  const [a, b] = ctx.fixture.chats;
  await away(30);
  for (const c of [a, b]) appendFileSync(c.file, replyLines({ id: c.id, cwd: c.cwd, text: 'Done, have a look.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
  await ctx.waitFor(`window.__posts.filter(m => m.type === 'state').pop().replied.length === 2`, { what: 'the two replies', timeout: 15000 });
  await back();
  ctx.assert.equal(await line(), '2 landed·nothing asked', 'what landed, and that nothing asked');
  // a click on it is Next, and it goes
  const box = await ctx.evaluate(`(r => ({ c: r.height > 15 }))(document.querySelector('#sbSwim .lnews').getBoundingClientRect())`);
  ctx.assert.ok(box.c, 'it covers the lane');
  await ctx.evaluate(`document.querySelector('#sbSwim .lnews').click()`);
  await ctx.waitFor(`!!window.peix.state().current`, { what: 'the first of them open' });
  ctx.assert.equal(await line(), null, 'the line gone');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#ov')?.open || false`), false, "the lane's own click, the overview, not run");
  // a question counts, whenever it began
  const sleep = spawn('sleep', ['60'], { stdio: 'ignore' });
  try {
    const cwd = realpathSync(tmpdir());
    makeFixture(ctx.fixture.dir, [{ cwd, title: 'A question', prompt: 'go', reply: 'one question', at: new Date(Date.now() - 60e3), live: { pid: sleep.pid, startedAt: Date.now() - 3600e3, status: 'waiting', waitingFor: 'input needed' } }]);
    await ctx.waitFor(`document.querySelector('#sbLeft .seg.nx.ask')`, { what: 'the question', timeout: 15000 });
    await away(30); await back();
    ctx.assert.match(await line(), /1 asking/, 'said in red, over the rest');
  } finally { sleep.kill(); }
  return 'ok';
}
