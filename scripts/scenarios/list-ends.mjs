// The chat list's two ends (2026-09-25): a pill at the top and one at the bottom counting the cards more than half
// out of sight that way, with a dot when one of them is asking you (red) or clauding (the working colour). What
// this checks is the counts against the cards' own rectangles at the top, in the middle and at the end of the list,
// the dot, a click on a pill scrolling a screenful, the counts following the cog's card size without a scroll, and
// the folded rail keeping the number without the word. The list is narrowed to the scenario's folder with ⌥⌘P.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeFixture, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

// What the pills say, and what the cards' rectangles say they should: a card is out of sight above when its middle is
// above the list's visible top, below when under its visible bottom.
const ends = ctx => ctx.evaluate(`(() => {
  const l = document.querySelector('#slist'), r = l.getBoundingClientRect(), top = r.top + l.clientTop, bottom = top + l.clientHeight;
  const cards = [...l.querySelectorAll(':scope > .card')].map(c => { const b = c.getBoundingClientRect(); return (b.top + b.bottom) / 2; });
  // an end that is off keeps its last words while it fades out: what it says counts only while it is on
  const pill = id => { const e = document.querySelector(id), on = e.classList.contains('on'); return { on, n: on ? +(e.querySelector('b')?.textContent || 0) : 0, dot: on ? e.querySelector('i')?.className || null : null, text: on ? e.textContent.trim() : '' }; };
  return JSON.stringify({ up: pill('#sup'), down: pill('#sdown'), want: [cards.filter(m => m < top).length, cards.filter(m => m > bottom).length], total: cards.length, scroll: Math.round(l.scrollTop) });
})()`).then(JSON.parse);
const settle = ctx => ctx.sleep(250);   // a frame for the pills, and the smooth scroll's end
const scrollTo = async (ctx, where) => { await ctx.evaluate(`(l => { l.scrollTop = ${where}; })(document.querySelector('#slist'))`); await settle(ctx); };

export default async function (ctx) {
  const out = {};
  const cwd = join(tmpdir(), 'peix-ends', 'ends-repo');
  const sleeps = [0, 1].map(() => spawn('sleep', ['120'], { stdio: 'ignore' }));
  const live = (i, extra = {}) => ({ pid: sleeps[i].pid, startedAt: Date.now() - 3600_000, ...extra });
  const long = 'This is a reply long enough to fill the three lines a large card gives it, so that the list runs well past the bottom of the window and has cards out of sight both ways once it is scrolled.';
  const now = Date.now();
  makeFixture(ctx.fixture.dir, [
    // asking and clauding sort to the top of the list, so they are out of sight above once it is scrolled down
    { cwd, title: 'Asking you', prompt: 'may I?', reply: long, at: new Date(now - 60_000), live: live(0, { status: 'waiting', waitingFor: 'permission prompt' }) },
    { cwd, title: 'Clauding away', prompt: 'build it', reply: long, at: new Date(now - 120_000), live: live(1),
      lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm run build', description: 'build' }, at: new Date(now - 30_000) }) },
    ...Array.from({ length: 22 }, (_, i) => ({ cwd, title: `Ready chat ${i + 1}`, prompt: `question number ${i + 1}, asked at some length so the card has a prompt to show`, reply: long, at: new Date(now - (i + 3) * 3600_000) })),
  ]);
  try {
    await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 26`, { what: 'the twenty-four chats and the fixture\'s two' });
    await ctx.key('KeyP');
    await ctx.evaluate(`(() => { const q = document.querySelector('#pickq'); q.value = 'ends-repo'; q.dispatchEvent(new Event('input', { bubbles: true })); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`);
    await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 24 && document.querySelector('#slist > .card.asking') && document.querySelector('#slist > .card.working')`, { what: 'the list narrowed to the twenty-four, one asking and one clauding' });
    await settle(ctx);

    // at the top: nothing above, the rest below
    out.top = await ends(ctx);
    ctx.assert.equal(out.top.up.on, false, 'nothing is out of sight above the top');
    ctx.assert.ok(out.top.down.on && out.top.down.n === out.top.want[1] && out.top.down.n > 3, `the bottom counts what is below (${out.top.down.n} of ${out.top.want[1]})`);
    ctx.assert.match(out.top.down.text, /^↓ \d+ more$/, 'an arrow, the number, the word');
    ctx.assert.equal(out.top.down.dot, null, 'no dot: every card below is only ready');
    await ctx.shot('top');

    // in the middle: both ends count, and the asking card up there puts its red dot on the top one
    await scrollTo(ctx, 700);
    out.mid = await ends(ctx);
    ctx.assert.ok(out.mid.up.on && out.mid.down.on, 'both ends count in the middle');
    ctx.assert.deepEqual([out.mid.up.n, out.mid.down.n], out.mid.want, 'the counts are the cards\' own');
    ctx.assert.equal(out.mid.up.dot, 'ask', 'a card asking you is out of sight above: the red dot, over the clauding one');
    ctx.assert.match(await ctx.evaluate(`document.querySelector('#sup button').title`), /asking you/, 'and the tooltip says so');
    await ctx.shot('middle');

    // a click on the bottom pill: a screenful down
    await ctx.evaluate(`document.querySelector('#sdown button').click()`);
    await ctx.waitFor(`document.querySelector('#slist').scrollTop > ${out.mid.scroll + 300}`, { what: 'the list a screenful further down' });
    for (let last = -1, now; (now = await ctx.evaluate(`document.querySelector('#slist').scrollTop`)) !== last; last = now) await ctx.sleep(150);   // the smooth scroll to its end
    await settle(ctx);
    out.clicked = await ends(ctx);
    ctx.assert.deepEqual([out.clicked.up.n, out.clicked.down.n], out.clicked.want, `still the cards' own after the scroll: ${JSON.stringify(out.clicked)}`);

    // at the end: nothing below
    await scrollTo(ctx, 1e6);
    out.end = await ends(ctx);
    ctx.assert.equal(out.end.down.on, false, 'nothing is out of sight below the end');
    ctx.assert.equal(out.end.up.n, out.end.want[0], 'the top counts all of it');

    // the cog's compact cards: shorter cards under the same scroll position, and the counts follow without a scroll
    await scrollTo(ctx, 700);
    const before = await ends(ctx);
    await ctx.evaluate(`(e => { e.value = 2; e.dispatchEvent(new Event('input', { bubbles: true })); })(document.querySelector('#cardsSize'))`);
    await settle(ctx);
    out.compact = await ends(ctx);
    ctx.assert.deepEqual([out.compact.up.n, out.compact.down.n], out.compact.want, 'compact cards, counted again');
    ctx.assert.notDeepEqual([out.compact.up.n, out.compact.down.n], [before.up.n, before.down.n], 'and the counts moved with them');
    await ctx.evaluate(`(e => { e.value = 0; e.dispatchEvent(new Event('input', { bubbles: true })); })(document.querySelector('#cardsSize'))`);

    // folded to the rail: the number and the arrow, no word
    await ctx.cmd('KeyB');
    await ctx.waitFor(`document.querySelector('#main').classList.contains('scompact')`, { what: 'the rail' });
    await scrollTo(ctx, 150);
    out.rail = await ends(ctx);
    ctx.assert.ok(out.rail.up.on && out.rail.down.on, 'twenty-four squares run past the rail both ways');
    ctx.assert.deepEqual([out.rail.up.n, out.rail.down.n], out.rail.want, 'the rail counts its squares the same way');
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#sdown .w')).display`), 'none', 'the word is left out on the rail');
    const fits = await ctx.evaluate(`(() => { const s = document.querySelector('#sessions').getBoundingClientRect(), b = document.querySelector('#sdown button').getBoundingClientRect(); return b.left >= s.left && b.right <= s.right; })()`);
    ctx.assert.ok(fits, 'the pill fits the rail');
    await ctx.shot('rail', { x: 0, y: 0, width: 200, height: 1000 });
    await ctx.cmd('KeyB');
    return out;
  } finally {
    for (const p of sleeps) p.kill();
  }
}
