// More tabs than the strip holds (2026-10-30), with the app's bridge faked so pages are tabs: fifteen pages in the right
// half's strip. The page in front keeps its address's width — 420 px, the strip's own where that is less — rather than
// shrink to its buttons to make room, and the tabs run on past the strip's ends in a box of their own (.ptrack), an end
// with more past it faded out (.ofl, .ofr). Whichever tab comes in front is scrolled into sight — a new one at the end,
// one clicked, one walked to with ⌥⌘←→ —; a sideways swipe scrolls the box, and so does a wheel turned down over it
// (tabsWheel); a redraw of the strip keeps it where it was scrolled to.
import { appendFileSync } from 'node:fs';
import { replyLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };
export default async function (ctx) {
  const [two] = ctx.fixture.chats;
  const out = {};
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.evaluate(`location.reload()`);
  await ctx.waitFor(`window.__posts && document.querySelectorAll('.card').length > 0`, { what: 'the board again, with the bridge' });
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelector('#shead .hpr')`, { what: 'the chat\'s PR chip' });
  await ctx.evaluate(`document.querySelector('#shead .hpr').click()`);
  await ctx.waitFor(`(document.querySelector('#ptabsB .ptab.on')?.dataset.tab || '').startsWith('gh:')`, { what: 'the PR on a tab in the right half' });
  const first = await ctx.evaluate(`window.peix.state().tab`);
  const urls = Array.from({ length: 14 }, (_, i) => `https://github.com/acme/widgets-service-${i}/pull/${100 + i}`);
  for (const u of urls) await ctx.evaluate(`window.peixPaneOpen(${JSON.stringify(first)}, ${JSON.stringify(u)})`);

  // the box, and the tab in front: its width, where it is in the box, whether it is in sight whole
  const look = () => ctx.evaluate(`(t => { const b = t.querySelector('.ptab.on'), x = t.scrollLeft; return JSON.stringify({ tab: b.dataset.tab, w: b.offsetWidth, room: t.clientWidth - 8,
    over: t.scrollWidth > t.clientWidth, x: Math.round(x), max: t.scrollWidth - t.clientWidth, seen: b.offsetLeft >= x - 1 && b.offsetLeft + b.offsetWidth <= x + t.clientWidth + 1,
    left: t.classList.contains('ofl'), right: t.classList.contains('ofr'), addr: b.classList.contains('addr') }); })(document.querySelector('#ptabsB .ptrack'))`).then(JSON.parse);
  const inSight = async (tab, what) => { await ctx.waitFor(`(t => { const b = t.querySelector('.ptab.on'), x = t.scrollLeft; return b?.dataset.tab === ${JSON.stringify(tab)} && b.offsetLeft >= x - 1 && b.offsetLeft + b.offsetWidth <= x + t.clientWidth + 1; })(document.querySelector('#ptabsB .ptrack'))`, { what }); await ctx.settle(); return look(); };
  const clip = () => ctx.evaluate(`(r => ({ x: r.left, y: r.top - 4, width: r.width, height: r.height + 8, scale: 2 }))(document.querySelector('#ptabsB').getBoundingClientRect())`);
  const last = await ctx.evaluate(`window.peix.state().tab`);
  ctx.assert.equal(last.slice(3), urls.at(-1), 'the page opened last is in front');

  // the newest tab, at the end: scrolled to once it has grown in, whole, at its address's width
  out.newest = await inSight(last, 'the newest tab in sight');
  ctx.assert.ok(out.newest.over, `more tabs than the strip holds: ${JSON.stringify(out.newest)}`);
  ctx.assert.ok(out.newest.addr && out.newest.w >= Math.min(420, out.newest.room) - 1, `the page in front keeps its address's width, not what the others leave it: ${JSON.stringify(out.newest)}`);
  ctx.assert.deepEqual([out.newest.left, out.newest.right], [true, false], 'scrolled to its end: the start fades, the end does not');
  await ctx.shot('newest', await clip());

  // the first, clicked from out of sight at the start: in sight, and the address's width is now its
  await ctx.evaluate(`document.querySelector('#ptabsB .ptab[data-tab="${first}"]').click()`);
  out.first = await inSight(first, 'the first tab in sight');
  ctx.assert.ok(out.first.addr && out.first.w >= Math.min(420, out.first.room) - 1, `its address at its width: ${JSON.stringify(out.first)}`);
  ctx.assert.deepEqual([out.first.x, out.first.left, out.first.right], [0, false, true], 'back at the start: the end fades');
  ctx.assert.ok(await ctx.evaluate(`document.querySelector('#ptabsB .ptab[data-tab="${last}"]').offsetWidth < 60`), 'the one left behind is its mark again');
  await ctx.shot('first', await clip());

  // a sideways swipe scrolls the box; a wheel turned down over it too, further along
  const mid = await ctx.evaluate(`JSON.stringify((r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))(document.querySelector('#ptabsB').getBoundingClientRect()))`).then(JSON.parse);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 80, deltaY: 0 });
  await ctx.waitFor(`document.querySelector('#ptabsB .ptrack').scrollLeft >= 79`, { what: 'the swipe scrolled the tabs' });
  out.swiped = await look();
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 0, deltaY: 80 });
  await ctx.waitFor(`document.querySelector('#ptabsB .ptrack').scrollLeft >= ${out.swiped.x + 79}`, { what: 'the wheel scrolled them further' });
  out.wheeled = await look();
  ctx.assert.deepEqual([out.wheeled.left, out.wheeled.right], [out.wheeled.x > 0, out.wheeled.x < out.wheeled.max - 1], `the fades follow: ${JSON.stringify(out.wheeled)}`);
  await ctx.shot('scrolled', await clip());

  // a redraw of the strip — the chat moving on, its markup forgotten — leaves it where it was scrolled to: a swipe away
  // from the tab in front is not undone by the next update
  await ctx.evaluate(`window.__track = document.querySelector('#ptabsB .ptrack'); document.querySelector('#ptabsB')._drawn = null`);
  appendFileSync(two.file, replyLines({ id: two.id, cwd: two.cwd, text: 'the strip drawn again' }).map(l => JSON.stringify(l) + '\n').join(''));
  await ctx.waitFor(`/the strip drawn again/.test(document.querySelector('#log').textContent)`, { what: 'the chat moved on' });
  await ctx.settle();
  out.redrawn = { fresh: await ctx.evaluate(`document.querySelector('#ptabsB .ptrack') !== window.__track`), ...await look() };
  ctx.assert.ok(out.redrawn.fresh, 'the strip was drawn anew');
  ctx.assert.equal(out.redrawn.x, out.wheeled.x, `…and stayed where it was scrolled to: ${JSON.stringify(out.redrawn)}`);

  // ⌥⌘← from the first page is the chat, in the left half; again, the last page (the walk goes round): in sight
  await ctx.key('ArrowLeft');
  await ctx.waitFor(`window.peix.state().tab === 'chat'`, { what: '⌥⌘←: the chat' });
  await ctx.key('ArrowLeft');
  out.walked = await inSight(last, '⌥⌘← again: the last page, in sight');
  ctx.assert.ok(out.walked.w >= Math.min(420, out.walked.room) - 1 && out.walked.left && !out.walked.right, `walked to: ${JSON.stringify(out.walked)}`);
  return out;
}
