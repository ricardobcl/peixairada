// The day's labels in the chat list. The fish have swum between the clauding cards and the ready ones since
// 2026-09-20; since 2026-09-22 a second school marked where the day turned over, and from 2026-09-23 a line under
// every day's run of cards named it in the middle. Since 2026-10-12 the label is *over* its run, at the left with a
// hairline after it — under it, it read as the next run's — and names the day as a person would: Today, Yesterday,
// the weekday within the week, else DD-MM-YYYY; a lane whose cards are all from today has none. What this checks is
// the labels' places and names, that the day stands at the left with nothing on it moving, and that a day the list
// brings back (a done card from today, after older ready ones) gets a label of its own. The list is narrowed to the
// scenario's folder by the project picker, not the magnifier: a query orders the list by the match since 2026-09-25,
// and leaves the labels out (scripts/scenarios/chat-filter.mjs).
import { makeFixture } from '../fixture.mjs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const meta = { server: true, fixture: 'auto' };

// What #slist holds, in order: a card is its title, a line is its kind and the day it names. A day's line also says
// where its day sits against the line's middle, whatever stands either side of it (nothing, since 2026-09-27), and
// how many animations run anywhere on it.
const strip = ctx => ctx.evaluate(`JSON.stringify([...document.querySelector('#slist').children].map(el => {
  if (!el.classList.contains('gsep')) return { card: el.querySelector('.title')?.textContent || '' };
  if (el.classList.contains('lane')) return { lane: [...el.classList].find(c => !['gsep', 'lane'].includes(c)) };   // a group's head (2026-10-09)
  const b = el.querySelector('b'), r = el.getBoundingClientRect(), br = b?.getBoundingClientRect();
  const side = box => { const r = box.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), text: box.textContent }; };
  return { sep: el.classList.contains('day') ? 'day' : 'divider', day: b?.textContent || '', off: br ? Math.round(br.left - r.left) : null,
    sides: b ? [...el.querySelectorAll('i')].map(side) : null, anim: el.getAnimations({ subtree: true }).length };
}))`).then(JSON.parse);
const pad2 = n => String(n).padStart(2, '0');
const ddmmyyyy = d => `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
// the page's name for a day this many days back: the weekday within the week
const named = (d, back) => back === 1 ? 'Yesterday' : back < 7 ? d.toLocaleDateString('en', { weekday: 'long' }) : ddmmyyyy(d);
// ⌥⌘P, the folder's name, ⏎: the list is that project's
const project = async (ctx, name) => {
  await ctx.key('KeyP');
  await ctx.evaluate(`(() => { const q = document.querySelector('#pickq'); q.value = ${JSON.stringify(name)}; q.dispatchEvent(new Event('input', { bubbles: true })); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`);
};

export default async function (ctx) {
  const out = {};
  const cwd = join(tmpdir(), 'peix-day-sep', 'daylines-repo');
  // Two chats touched today — now, or a minute into the day when the clock is just past midnight — two from noon two
  // days back and one from three days back. The fixture's own two (a day old) are filtered out by the folder's name.
  const today = new Date(Math.max(Date.now(), new Date().setHours(0, 0, 0, 0) + 61_000));
  const noon = back => { const d = new Date(); d.setDate(d.getDate() - back); d.setHours(12, 0, 0, 0); return d; };
  const [d2, d3] = [noon(2), noon(3)];
  const chats = makeFixture(ctx.fixture.dir, [
    { cwd, title: 'this morning', prompt: 'what is on today?', reply: 'this and that', at: today },
    { cwd, title: 'a minute ago', prompt: 'and now?', reply: 'the same', at: new Date(today.getTime() + 1000) },
    { cwd, title: 'two days back', prompt: 'then?', reply: 'then', at: d2 },
    { cwd, title: 'two days back, later', prompt: 'and later?', reply: 'later', at: new Date(d2.getTime() + 60_000) },
    { cwd, title: 'three days back', prompt: 'before that?', reply: 'before', at: d3 },
  ]).chats;
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 7`, { what: 'the five chats and the fixture\'s two' });
  await project(ctx, 'daylines-repo');
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 5`, { what: 'the list narrowed to the five' });
  await ctx.settle();   // the other project's cards fold out of the list first (2026-09-27, night); strip reads every child

  out.all = await strip(ctx);
  await ctx.shot('day-lines');
  const expect = [
    { lane: 'ready' }, { sep: 'day', day: 'Today' }, { card: 'a minute ago' }, { card: 'this morning' },
    { sep: 'day', day: named(d2, 2) }, { card: 'two days back, later' }, { card: 'two days back' },
    { sep: 'day', day: named(d3, 3) }, { card: 'three days back' },
  ];
  ctx.assert.deepEqual(out.all.map(x => x.sep ? { sep: x.sep, day: x.day } : x), expect, 'a label over each day, naming it: Today, then the weekday');
  for (const x of out.all.filter(x => x.sep)) {
    ctx.assert.ok(Math.abs(x.off) <= 1, `${x.day} starts its line (${x.off}px in)`);
    ctx.assert.deepEqual(x.sides, [], `${x.day} stands alone on its line`);
    ctx.assert.equal(x.anim, 0, `and nothing on ${x.day}'s line moves`);
  }

  // Done cards come last, whatever their day: ticking today's newest brings today back after the older days, and
  // that run gets a line of its own
  // (a tick only holds once the chat's last activity is behind it, and today's two are stamped up to a second ahead)
  const tick = () => ctx.server.api(`api/sessions/${chats[1].id}/done`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ done: true }) });
  for (let i = 0; i < 70 && !(await tick()).body.done; i++) await ctx.sleep(1000);
  await ctx.waitFor(`[...document.querySelectorAll('#slist > .card')].pop()?.querySelector('.title')?.textContent === 'a minute ago'`, { what: 'the done card at the bottom' });
  await ctx.settle();
  out.done = (await strip(ctx)).map(x => x.lane ? `[${x.lane}]` : x.sep ? x.day : x.card);
  ctx.assert.deepEqual(out.done, ['[ready]', 'Today', 'this morning', named(d2, 2), 'two days back, later', 'two days back', named(d3, 3), 'three days back', '[done]', 'a minute ago'], 'today again in the done lane, which needs no label of its own — the done one in its lane');

  // Only the done card in view — the Ready lane folded (its chip off, before 2026-10-11): still one line, under it
  await ctx.evaluate(`document.querySelector('#slist > .gsep.lane[data-lane="ready"]').click()`);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 1`, { what: 'the done card alone' });
  await ctx.settle();   // the ready cards fold out first; strip reads every child of the list
  out.filtered = (await strip(ctx)).map(x => x.lane ? `[${x.lane}]` : x.sep ? x.day : x.card);
  ctx.assert.deepEqual(out.filtered, ['[ready]', '[done]', 'a minute ago'], 'the folded lane\'s head, and no label over a lane of today alone');
  return out;
}
