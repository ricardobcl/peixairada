// The two rules in the chat list. The fish have swum between the clauding cards and the ready ones since
// 2026-09-20; since 2026-09-22 a second school swims the other way where today ends — above it the chats you
// were in today, below the ones from before. Both are one kept node with an animation phased to the document
// clock (a re-render must not restart them), so what this checks is that each is *the* node, in the right place,
// facing the right way, and that there is no line to draw when every card is from the same day.
import { makeFixture } from '../fixture.mjs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const meta = { server: true, fixture: 'auto' };

// What #slist holds, in order: a card is its title, a rule is its class and the way its fish point.
const strip = ctx => ctx.evaluate(`JSON.stringify([...document.querySelector('#slist').children].map(el => el.classList.contains('gsep')
  ? { sep: el.classList.contains('day') ? 'day' : 'fish', text: el.textContent.slice(0, 3), anim: el.querySelector('span').getAnimations().length }
  : { card: el.querySelector('.title')?.textContent || '' }))`).then(JSON.parse);

export default async function (ctx) {
  const out = {};
  const cwd = join(tmpdir(), 'peix-day-sep', 'today-repo');
  // Two chats touched today — now, or a minute into the day when the clock is just past midnight — beside the
  // fixture's own, which are a day old.
  const today = new Date(Math.max(Date.now(), new Date().setHours(0, 0, 0, 0) + 61_000));
  makeFixture(ctx.fixture.dir, [
    { cwd, title: 'this morning', prompt: 'what is on today?', reply: 'this and that', at: today },
    { cwd, title: 'a minute ago', prompt: 'and now?', reply: 'the same', at: new Date(today.getTime() + 1000) },
  ]);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 4`, { what: "the day's two chats and the fixture's two" });

  out.all = await strip(ctx);
  await ctx.shot('day-rule');
  const seps = out.all.filter(x => x.sep);
  ctx.assert.deepEqual(seps.map(x => x.sep), ['day'], 'one rule: nothing is clauding here, so only the day turns over');
  ctx.assert.equal(out.all.findIndex(x => x.sep), 2, 'and it sits under the two chats of today');
  ctx.assert.equal(seps[0].text, '<><', "the day's fish face the other way");
  ctx.assert.equal(seps[0].anim, 1, '…and they swim');
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#slist .gsep').length`), 1, 'one node, not one per render');

  // A re-render — the list is redrawn on every update the board gets — puts the *same* node back, mid-swim: the
  // whole reason it is a kept node and not innerHTML (a new animation every few seconds is a visible stutter).
  const was = await ctx.evaluate(`(el => { const a = el.querySelector('span').getAnimations()[0]; el.dataset.seen = '1'; return a.currentTime > 0; })(document.querySelector('#slist .gsep.day'))`);
  await ctx.evaluate(`document.querySelector('#q').dispatchEvent(new Event('input', { bubbles: true }))`);   // the column's filter box re-renders the list
  out.kept = await ctx.evaluate(`(el => el && { seen: el.dataset.seen === '1', running: el.querySelector('span').getAnimations()[0]?.playState || null })(document.querySelector('#slist .gsep.day'))`);
  ctx.assert.ok(was, 'the fish are mid-swim');
  ctx.assert.deepEqual(out.kept, { seen: true, running: 'running' }, 'and the re-render moves that very node back into the list, still swimming');

  // With only today's chats in view there is nothing to separate: the day's rule is not drawn at all
  await ctx.evaluate(`(() => { const q = document.querySelector('#q'); q.value = 'today-repo'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 2`, { what: "the list filtered to today's two" });
  out.filtered = await strip(ctx);
  ctx.assert.deepEqual(out.filtered.filter(x => x.sep), [], 'no crossing, no rule');
  return out;
}
