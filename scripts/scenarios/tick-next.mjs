// Ticking the open chat moves on (2026-09-30, Ricardo: "when I mark as done, we should move the the next chat (up or
// down)"). Three chats in one folder, minutes old, over the fixture's two a day old: the list reads First, Second,
// Third, Plain chat, Two PRs mentioned. What is checked: ✓ on the open card opens the card below it; on the last card
// still to do it opens the one above, stepping over the done cards under it; ✓ on a card that is not open leaves the
// open chat alone; ↩ moves nothing; and the chats step's ✓ (⌥⌘N) moves on the same way.
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeFixture } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

const byTitle = t => `[...document.querySelectorAll('#slist > .card')].find(c => c.querySelector('.title').textContent === ${JSON.stringify(t)})`;
const order = ctx => ctx.evaluate(`[...document.querySelectorAll('#slist > .card')].map(c => c.querySelector('.title').textContent + (c.classList.contains('done') ? ' ✓' : ''))`);
const current = ctx => ctx.evaluate(`window.peix.state().current`);

export default async function (ctx) {
  const out = {};
  const cwd = join(tmpdir(), 'peix-tick-next', 'ticks-repo');
  const m = n => new Date(Date.now() - n * 60_000);
  const [first, second, third] = makeFixture(ctx.fixture.dir, [
    { cwd, title: 'First', prompt: 'one', reply: 'done one', at: m(10) },
    { cwd, title: 'Second', prompt: 'two', reply: 'done two', at: m(20) },
    { cwd, title: 'Third', prompt: 'three', reply: 'done three', at: m(30) },
  ]).chats;
  const [twoPrs, plain] = ctx.fixture.chats;
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 5`, { what: 'the three chats and the fixture\'s two' });
  out.order = await order(ctx);
  ctx.assert.deepEqual(out.order, ['First', 'Second', 'Third', 'Plain chat', 'Two PRs mentioned'], 'the newest first');
  const tick = async t => { await ctx.evaluate(`${byTitle(t)}.querySelector('.act').click()`); };
  const isDone = id => ctx.peix(`session(${JSON.stringify(id)})`).then(s => s.done);

  // ---- ✓ on the open chat: the card below opens ----
  await ctx.openChat(second.id);
  await tick('Second');
  await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(third.id)}`, { what: 'Third, the card below, open' });
  await ctx.waitFor(`window.peix.session(${JSON.stringify(second.id)}).done`, { what: 'Second done' });
  await ctx.waitFor(`location.hash === '#${third.id}' && ${byTitle('Third')}.classList.contains('active')`, { what: 'Third the active card' });
  await ctx.settle();
  out.afterDown = await order(ctx);
  ctx.assert.deepEqual(out.afterDown, ['First', 'Third', 'Plain chat', 'Two PRs mentioned', 'Second ✓'], 'Second went to the done cards');
  await ctx.shot('moved-down');

  // ---- ✓ on the last chat still to do: the one above, over the done card under it ----
  await ctx.openChat(twoPrs.id);
  await tick('Two PRs mentioned');
  await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(plain.id)}`, { what: 'Plain chat, the card above, open' });
  await ctx.waitFor(`window.peix.session(${JSON.stringify(twoPrs.id)}).done`, { what: 'Two PRs mentioned done' });

  // ---- ✓ on a card that is not open: the open chat stays ----
  await tick('First');
  await ctx.waitFor(`window.peix.session(${JSON.stringify(first.id)}).done`, { what: 'First done' });
  await ctx.sleep(300);
  ctx.assert.equal(await current(ctx), plain.id, 'ticking another card leaves the open chat where it is');

  // ---- ↩ moves nothing ----
  await ctx.evaluate(`${byTitle('First')}.querySelector('.act[data-act="reopen"]').click()`);
  await ctx.waitFor(`!window.peix.session(${JSON.stringify(first.id)}).done`, { what: 'First back' });
  ctx.assert.equal(await current(ctx), plain.id, 'unticking moves nothing');

  // ---- the chats step's ✓ on the open chat moves on the same way ----
  await ctx.settle();
  out.beforePick = await order(ctx);
  ctx.assert.deepEqual(out.beforePick, ['First', 'Third', 'Plain chat', 'Second ✓', 'Two PRs mentioned ✓'], 'First is back on top');
  await ctx.openChat(third.id);
  await ctx.key('KeyN');
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('New chat — a project')`, { what: 'the project step' });
  await ctx.fill('#pickq', 'ticks-repo');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('ticks-repo — an open chat')`, { what: 'the chats step' });
  const row = await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow')].findIndex(r => r.querySelector('button.pkdone')?.dataset.id === ${JSON.stringify(third.id)})`);
  ctx.assert.ok(row > 0, 'Third has its row, with a ✓');
  await ctx.evaluate(`document.querySelectorAll('#picklist .pkrow')[${row}].querySelector('button.pkdone').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))`);
  await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(plain.id)}`, { what: 'Plain chat, the card below Third, open' });
  await ctx.waitFor(`window.peix.session(${JSON.stringify(third.id)}).done`, { what: 'Third done' });
  ctx.assert.ok(await ctx.evaluate(`document.querySelector('#pick').open`), 'the picker stays up');
  await ctx.shot('moved-from-picker');
  await ctx.evaluate(`document.querySelector('#pick').close()`);
  out.isDone = { first: await isDone(first.id), second: await isDone(second.id), third: await isDone(third.id), twoPrs: await isDone(twoPrs.id), plain: await isDone(plain.id) };
  return out;
}
