// A long lane (2026-10-13): Idle and Done show their newest LANE_CAP (30) cards and a line for the rest — every card
// in the page is restyled, laid out and walked on each render, and those two lanes only grow. A click on the line
// shows the rest until the page is loaded again; the open chat's card is there whatever its place; a query shows every
// match. Here, 34 chats untouched for over a week: the Idle lane.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFixture } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-long', 'long-repo'), day = 86_400_000, now = Date.now();
  const { chats } = makeFixture(ctx.fixture.dir, Array.from({ length: 34 }, (_, i) => ({
    cwd, title: `Old chat ${String(i).padStart(2, '0')}`, prompt: `an old question ${i}`, reply: 'an old answer', at: new Date(now - 8 * day - i * 3_600_000) })));
  const idle = () => ctx.evaluate(`JSON.stringify({ cards: document.querySelectorAll('#slist > .card[data-rank="idle"]').length,
    more: [...document.querySelectorAll('#slist > .gsep.more')].map(e => e.dataset.more + ':' + e.querySelector('.mn').textContent),
    head: document.querySelector('#slist > .gsep.lane[data-lane="idle"] b')?.textContent })`).then(JSON.parse);
  await ctx.waitFor(`document.querySelector('#slist > .gsep.lane[data-lane="idle"]') && document.querySelector('#slist > .gsep.more')`, { what: 'the Idle lane and its line', timeout: 15000 });
  await ctx.settle();

  out.capped = await idle();
  ctx.assert.deepEqual(out.capped, { cards: 30, more: ['idle:4 more idle chats'], head: '34' }, `the newest thirty, a line for the other four, the head counting all: ${JSON.stringify(out.capped)}`);
  out.order = await ctx.evaluate(`[...document.querySelectorAll('#slist > .card[data-rank="idle"] .title')].slice(-1)[0].textContent`);
  ctx.assert.equal(out.order, 'Old chat 29', 'the newest thirty, in the lane\'s order');

  // the line shows the rest
  await ctx.evaluate(`document.querySelector('#slist > .gsep.more').click()`);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card[data-rank="idle"]').length === 34`, { what: 'the rest of the lane' });
  out.all = await idle();
  ctx.assert.deepEqual(out.all.more, [], 'no line once it is all there');

  // a reload holds it back again; the open chat's card is there though it is past the thirty
  const oldest = chats[33].id;
  await ctx.evaluate(`location.hash = '${oldest}'`);
  await ctx.reload();
  await ctx.waitFor(`window.peix.state().current === '${oldest}' && document.querySelector('#slist > .gsep.more')`, { what: 'the oldest chat open after a reload, the lane held back' });
  out.open = await idle();
  ctx.assert.deepEqual([out.open.cards, out.open.more], [31, ['idle:3 more idle chats']], `the thirty and the open one, three held back: ${JSON.stringify(out.open)}`);
  ctx.assert.ok(await ctx.evaluate(`!!document.querySelector('#slist > .card.active[data-id="${oldest}"]')`), 'the open chat\'s card in the list');

  // a query shows every match
  await ctx.fill('#q', 'old chat');
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 34 && !document.querySelector('#slist > .gsep.more')`, { what: 'every match, no line' });
  await ctx.fill('#q', '');
  return out;
}
