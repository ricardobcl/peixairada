// The chat list's magnifier, fuzzy since 2026-09-25, and ⌥⌘F, which
// opens it from anywhere. What is checked: the key opens the box with the keyboard in it — the rail opening first when
// the list is folded —; the box matches the way ⌥⌘K does (letters in order, no chat holding the query literally) and
// the best match leads, *against* the board's order; the lines between states and days are left out while a query is
// on and come back with Esc; the letters that matched are bolded on the card; ↑↓ walk the cards from the box and ⏎
// opens the one marked, keeping the query; and the cog lists the key.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFixture } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

const titles = ctx => ctx.evaluate(`[...document.querySelectorAll('#slist > .card .title')].map(t => t.textContent)`);
const type = (ctx, q) => ctx.fill('#q', q);
const keyIn = (ctx, key) => ctx.evaluate(`document.querySelector('#q').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }))`);
const marked = ctx => ctx.evaluate(`[...document.querySelectorAll('#slist > .card.qsel .title')].map(t => t.textContent)`);

export default async function (ctx) {
  const out = {};
  const cwd = join(tmpdir(), 'peix-chat-filter', 'filter-repo');
  // `res` is literally inside *arrest*, and at the start of a word in *resolvers*: the newer chat is the arrest one, so
  // the board puts it first and only a ranking by the match puts the resolvers first.
  const now = Date.now();
  const [arrest, resolvers] = makeFixture(ctx.fixture.dir, [
    { cwd, title: 'Arrest the drift', prompt: 'why does the drawer drift?', reply: 'a resize read at another size', at: new Date(now - 60_000) },
    { cwd, title: 'Wallet resolvers', prompt: 'tidy the graphql layer', reply: 'done', at: new Date(now - 3600_000) },
  ]).chats;
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 4`, { what: 'the two chats and the fixture\'s two' });
  out.before = { cards: await titles(ctx), lines: await ctx.evaluate(`document.querySelectorAll('#slist .gsep.day').length`) };
  ctx.assert.ok(out.before.lines >= 1, 'with nothing typed the day lines are there');
  ctx.assert.ok(out.before.cards.indexOf('Arrest the drift') < out.before.cards.indexOf('Wallet resolvers'), 'the board puts the newer chat first');

  // ⌥⌘F, the list folded to its rail: the list opens and the box has the keyboard
  await ctx.cmd('KeyB'); ctx.assert.equal(!!(await ctx.peix('prefs()')).sessionsCompact, false, 'plain ⌘B is not the board\'s since 2026-10-02');
  await ctx.key('KeyB'); ctx.assert.equal((await ctx.peix('prefs()')).sessionsCompact, true, '⌥⌘B folds the list');
  await ctx.key('KeyF');
  out.opened = {
    folded: (await ctx.peix('prefs()')).sessionsCompact,
    hidden: await ctx.evaluate(`document.querySelector('#q').hidden`),
    focused: await ctx.evaluate(`document.activeElement?.id || null`),
    searching: await ctx.evaluate(`document.querySelector('#filters').classList.contains('searching')`),
  };
  ctx.assert.deepEqual(out.opened, { folded: false, hidden: false, focused: 'q', searching: true }, '⌥⌘F opens the rail and puts the keyboard in the box');

  // fuzzy: no chat holds `pln cht` anywhere, the plain chat leads, its letters bolded, the lines gone, the first card marked
  await type(ctx, 'pln cht');
  out.fuzzy = {
    cards: await titles(ctx),
    literal: await ctx.evaluate(`window.peix.sessions().map(s => window.peix.session(s.id)).filter(s => JSON.stringify(s).toLowerCase().includes('pln cht')).length`),
    marks: await ctx.evaluate(`[...document.querySelector('#slist > .card').querySelectorAll('.title b')].map(b => b.textContent)`),
    lines: await ctx.evaluate(`document.querySelectorAll('#slist .gsep').length`),
    marked: await marked(ctx),
    lit: await ctx.evaluate(`document.querySelector('#qBtn').classList.contains('on')`),
  };
  ctx.assert.equal(out.fuzzy.literal, 0, 'no chat holds the query literally — only a fuzzy match finds one');
  ctx.assert.equal(out.fuzzy.cards[0], 'Plain chat', 'the best match leads');
  ctx.assert.deepEqual(out.fuzzy.marks, ['Pl', 'n', 'ch', 't'], 'the letters that matched are bolded, runs merged');
  ctx.assert.equal(out.fuzzy.lines, 0, 'no state or day lines while a query orders the list');
  ctx.assert.deepEqual(out.fuzzy.marked, ['Plain chat'], 'the best match is the one ⏎ would open');
  ctx.assert.equal(out.fuzzy.lit, true);
  await ctx.shot('fuzzy', { x: 0, y: 0, width: 420, height: 420 });

  // ranked against the board: `res` starts a word in the older chat's title, and sits inside a word of the newer one's
  await type(ctx, 'res');
  out.ranked = await titles(ctx);
  ctx.assert.ok(out.ranked.indexOf('Wallet resolvers') < out.ranked.indexOf('Arrest the drift'), `the word's start beats the board's order: ${out.ranked}`);
  ctx.assert.equal(out.ranked[0], 'Wallet resolvers');

  // ↓ ↑ walk the marked card, ⏎ opens it and keeps the query
  await keyIn(ctx, 'ArrowDown'); out.down = await marked(ctx);
  ctx.assert.deepEqual(out.down, [out.ranked[1]], '↓ marks the next card');
  await keyIn(ctx, 'ArrowUp'); await keyIn(ctx, 'ArrowUp'); out.up = await marked(ctx);
  ctx.assert.deepEqual(out.up, [out.ranked[0]], '↑ goes back, and stops at the top');
  await keyIn(ctx, 'Enter');
  await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(resolvers.id)}`, { what: 'the marked chat opened' });
  out.enter = { q: await ctx.evaluate(`document.querySelector('#q').value`), marked: await marked(ctx), focused: await ctx.evaluate(`document.activeElement?.id || null`) };
  ctx.assert.deepEqual(out.enter, { q: 'res', marked: [], focused: null }, '⏎ opens it, the query stays, the box lets go of the keyboard');

  // ⌥⌘F again: the box has the keyboard back, the query selected so typing replaces it
  await ctx.key('KeyF');
  out.again = await ctx.evaluate(`(() => { const b = document.querySelector('#q'); return { focused: document.activeElement === b, selected: b.selectionStart === 0 && b.selectionEnd === b.value.length }; })()`);
  ctx.assert.deepEqual(out.again, { focused: true, selected: true });

  // Esc empties the box, closes it, and the board's order and lines come back
  await keyIn(ctx, 'Escape');
  out.esc = { hidden: await ctx.evaluate(`document.querySelector('#q').hidden`), cards: await titles(ctx), lines: await ctx.evaluate(`document.querySelectorAll('#slist .gsep.day').length`) };
  ctx.assert.equal(out.esc.hidden, true);
  ctx.assert.deepEqual(out.esc.cards, out.before.cards, 'the board\'s order is back');
  ctx.assert.equal(out.esc.lines, out.before.lines, 'and its lines');

  // the cog lists the key, beside K
  out.cog = await ctx.evaluate(`[...document.querySelectorAll('#settings .keys kbd')].map(k => k.textContent)`);
  ctx.assert.equal(out.cog[out.cog.indexOf('⌥⌘K') + 1], '⌥⌘F');
  out.arrest = arrest.id.slice(0, 8);
  return out;
}
