// Gone fishing (2026-11-01, round XIX's M4): a quiet you choose, with a sign in the lane. What this checks: the bar's right-
// click starts it; replies and PR moves come in without a sound or a banner (quiet to the app), still counted; a question
// and a branch moved ring as ever; it outlives a reload; the sign's click ends it, and the catch is one line and one
// banner; and its time running out does the same by itself. The app hears it for its fish and its menu.
import { appendFileSync } from 'node:fs';
import { replyLines } from '../fixture.mjs';
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.reload();
  const posts = type => ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === '${type}'))`).then(JSON.parse);
  const sign = () => ctx.evaluate(`document.querySelector('#sbSwim .fsign')?.textContent ?? null`);
  ctx.assert.equal(await sign(), null, 'no sign at rest');
  // the bar's right-click has the row
  await ctx.evaluate(`document.querySelector('#sbRight').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 600, clientY: 880 }))`);
  await ctx.waitFor(`[...document.querySelectorAll('#ctxm button')].some(b => /Go fishing, 25 min/.test(b.textContent))`, { what: 'the row in the menu' });
  await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => /Go fishing/.test(b.textContent)).click()`);
  await ctx.waitFor(`document.querySelector('#sbSwim .fsign')`, { what: 'the sign' });
  ctx.assert.equal(await sign(), 'GONE FISHING');
  const fish = (await posts('state')).pop();
  ctx.assert.match(fish.fishing, /^\d\d:\d\d$/, 'the app hears till when');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#sbSwim').classList.contains('rest')`), true, 'the fish rests');
  // it holds a reply and a PR's move, and lets a question ring
  const [a] = ctx.fixture.chats, alert = (kind, id = a.id) => ctx.evaluate(`window.peix.alert({ kind: '${kind}', sessionId: '${id}', project: 'p', title: 't', snippet: '' })`);
  await alert('reply'); await alert('pr'); await alert('needs-input');
  const told = (await posts('alert')).map(m => [m.kind, m.quiet]);
  ctx.assert.deepEqual(told, [['reply', true], ['pr', true], ['needs-input', false]], 'quiet to the app but for the question');
  // it outlives a reload
  await ctx.reload();
  await ctx.waitFor(`document.querySelector('#sbSwim .fsign')`, { what: 'the sign after a reload' });
  // a reply lands; the sign's click comes back, and the catch says so
  appendFileSync(a.file, replyLines({ id: a.id, cwd: a.cwd, text: 'Done, have a look.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
  await ctx.waitFor(`window.__posts.filter(m => m.type === 'state').pop().replied.some(r => r.id === '${a.id}')`, { what: 'the reply in', timeout: 15000 });
  await ctx.evaluate(`document.querySelector('#sbSwim .fsign').click()`);
  await ctx.waitFor(`document.querySelector('#sbSwim .lnews')`, { what: 'the catch' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#sbSwim .lnews').textContent`), 'The catch:1 landed·nothing asked');
  ctx.assert.equal(await sign(), null, 'the sign gone');
  ctx.assert.equal((await posts('state')).pop().fishing, '', 'and the app hears');
  const banner = (await posts('alert')).pop();
  ctx.assert.deepEqual([banner.heading, banner.title], ['The catch', '1 landed · nothing asked'], 'one banner, if the app is behind');
  // time up, by itself
  await ctx.evaluate(`window.peixFishing(true, 0.005)`);
  await ctx.waitFor(`document.querySelector('#sbSwim .fsign')`, { what: 'the sign again' });
  await ctx.waitFor(`!document.querySelector('#sbSwim .fsign')`, { what: 'the time up', timeout: 4000 });
  return 'ok';
}
