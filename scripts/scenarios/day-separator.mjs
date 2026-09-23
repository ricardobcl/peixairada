// The day's lines in the chat list. The fish have swum between the clauding cards and the ready ones since
// 2026-09-20; since 2026-09-22 a second school swims the other way where the day turns over, and since 2026-09-23
// there is one such line under every day's run of cards, naming it — "today", else DD-MM-YYYY — so a line closes
// the day *above* it and the oldest day in the list gets one too. Each is a kept node with an animation phased to
// the document clock (a re-render must not restart them), so what this checks is the lines' places and names, that
// a day the list brings back (a done card from today, after older ready ones) gets a line of its own, and that a
// re-render puts the same nodes back.
import { makeFixture } from '../fixture.mjs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const meta = { server: true, fixture: 'auto' };

// What #slist holds, in order: a card is its title, a line is its kind, the day it names and the way its fish point.
const strip = ctx => ctx.evaluate(`JSON.stringify([...document.querySelector('#slist').children].map(el => el.classList.contains('gsep')
  ? { sep: el.classList.contains('day') ? 'day' : 'fish', day: el.querySelector('b')?.textContent || '', fish: el.querySelector('span').textContent.slice(0, 3), anim: el.querySelector('span').getAnimations().length }
  : { card: el.querySelector('.title')?.textContent || '' }))`).then(JSON.parse);
const pad2 = n => String(n).padStart(2, '0');
const ddmmyyyy = d => `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
const filter = (ctx, q) => ctx.evaluate(`(() => { const q = document.querySelector('#q'); q.value = ${JSON.stringify(q)}; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);

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
  await filter(ctx, 'daylines-repo');
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 5`, { what: 'the list filtered to the five' });

  out.all = await strip(ctx);
  await ctx.shot('day-lines');
  const expect = [
    { card: 'a minute ago' }, { card: 'this morning' }, { sep: 'day', day: 'today' },
    { card: 'two days back, later' }, { card: 'two days back' }, { sep: 'day', day: ddmmyyyy(d2) },
    { card: 'three days back' }, { sep: 'day', day: ddmmyyyy(d3) },
  ];
  ctx.assert.deepEqual(out.all.map(x => x.sep ? { sep: x.sep, day: x.day } : x), expect, 'a line under each day, naming it: today, then DD-MM-YYYY');
  ctx.assert.ok(out.all.filter(x => x.sep).every(x => x.fish === '<><' && x.anim === 1), 'the fish on every line face left, and swim');

  // A re-render — the list is redrawn on every update the board gets — puts the *same* nodes back, mid-swim: the
  // whole reason they are kept nodes and not innerHTML (a new animation every few seconds is a visible stutter).
  await ctx.evaluate(`document.querySelectorAll('#slist .gsep.day').forEach(el => { el.dataset.seen = '1'; })`);
  await ctx.evaluate(`document.querySelector('#q').dispatchEvent(new Event('input', { bubbles: true }))`);
  out.kept = await ctx.evaluate(`[...document.querySelectorAll('#slist .gsep.day')].map(el => ({ seen: el.dataset.seen === '1', running: el.querySelector('span').getAnimations()[0]?.playState || null }))`);
  ctx.assert.deepEqual(out.kept, expect.filter(x => x.sep).map(() => ({ seen: true, running: 'running' })), 'the re-render moves those very nodes back, still swimming');

  // Done cards come last, whatever their day: ticking today's newest brings today back after the older days, and
  // that run gets a line of its own
  // (a tick only holds once the chat's last activity is behind it, and today's two are stamped up to a second ahead)
  const tick = () => ctx.server.api(`api/sessions/${chats[1].id}/done`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ done: true }) });
  for (let i = 0; i < 70 && !(await tick()).body.done; i++) await ctx.sleep(1000);
  await ctx.waitFor(`[...document.querySelectorAll('#slist > .card')].pop()?.querySelector('.title')?.textContent === 'a minute ago'`, { what: 'the done card at the bottom' });
  out.done = (await strip(ctx)).map(x => x.sep ? x.day : x.card);
  ctx.assert.deepEqual(out.done, ['this morning', 'today', 'two days back, later', 'two days back', ddmmyyyy(d2), 'three days back', ddmmyyyy(d3), 'a minute ago', 'today'], 'today twice, each run under its own line');

  // Only today's chats in view: still one line, under them, saying so
  await filter(ctx, 'this morning');
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 1`, { what: 'one of today\'s chats' });
  out.filtered = (await strip(ctx)).map(x => x.sep ? x.day : x.card);
  ctx.assert.deepEqual(out.filtered, ['this morning', 'today'], 'the day closes under its only card');
  return out;
}
