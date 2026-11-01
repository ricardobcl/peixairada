// Questions go longest wait first, and the bar says how long (2026-11-01, round XIX's S4). Notifications favour whoever
// pinged last, so the status bar's count walked newest first and an old question sat behind every new one. What this
// checks: the count reads `3 asking · 1h` off the oldest, a click walks oldest → newest and comes round, and the app's
// `state` post carries the questions in that order with the moment each began, for the fish's menu to word.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeFixture } from '../fixture.mjs';
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.reload();
  const cwd = realpathSync(tmpdir()), sleeps = Array.from({ length: 3 }, () => spawn('sleep', ['120'], { stdio: 'ignore' }));
  try {
    const ago = m => Date.now() - m * 60_000;
    // the newest word is on the chat waiting longest, so neither the list's order nor the word's can pass for the wait's
    const asks = [['Waiting five minutes', 5, 90], ['Waiting ninety minutes', 90, 1], ['Waiting forty minutes', 40, 50]];
    makeFixture(ctx.fixture.dir, asks.map(([title, wait, word], i) => ({ cwd, title, prompt: 'go', reply: 'one question', at: new Date(ago(word)), live: { pid: sleeps[i].pid, startedAt: ago(120), status: 'waiting', waitingFor: 'input needed', statusAt: ago(wait) } })));
    await ctx.waitFor(`document.querySelector('#sbar .seg.ask')?.textContent.includes('3 asking')`, { what: 'the three questions counted', timeout: 15000 });
    const said = await ctx.evaluate(`document.querySelector('#sbar .seg.ask').textContent.trim()`);
    ctx.assert.equal(said, '3 asking · 1h', 'the count and the longest wait');
    const walk = [];
    for (let i = 0; i < 4; i++) {
      await ctx.evaluate(`document.querySelector('#sbar .seg.ask').click()`);
      await ctx.sleep(250);
      walk.push(await ctx.evaluate(`window.peix.session(window.peix.state().current)?.title`));
    }
    ctx.assert.deepEqual(walk, ['Waiting ninety minutes', 'Waiting forty minutes', 'Waiting five minutes', 'Waiting ninety minutes'], 'longest wait first, and round');
    const post = await ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'state').pop().needs.map(n => [n.title, Math.round((Date.now() - Number(n.since)) / 60000)]))`).then(JSON.parse);
    ctx.assert.deepEqual(post, [['Waiting ninety minutes', 90], ['Waiting forty minutes', 40], ['Waiting five minutes', 5]], "the app hears them in that order, each with its moment");
    return { said, walk };
  } finally { for (const s of sleeps) s.kill(); }
}
