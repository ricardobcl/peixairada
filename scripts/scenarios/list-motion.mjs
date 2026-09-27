// The chat list moves rather than jumps (2026-09-27, night): a card that changes rank slides to its new place (FLIP),
// one that arrives fades in from a few pixels up, one that leaves folds shut where it stood before it goes. What this
// checks is the moves the page records (window.peix.motion — each animation's id, so a 200 ms slide need not be caught
// in the act): nothing on the first draw; a chat ticked done slides down and the cards under it slide up; a chat
// written into the fixture while the board is up fades in; the done chip switched off folds the done card, which
// takes no click meanwhile and is gone after. The list is narrowed to the scenario's folder with ⌥⌘P so nothing
// else moves.
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeFixture } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

const motion = ctx => ctx.peix('motion()');
const cards = ctx => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#slist > .card')].map(c => ({ id: c.dataset.id || null, title: c.querySelector('.title')?.textContent || '', leaving: c.classList.contains('leaving'), anims: c.getAnimations().map(a => a.id).filter(Boolean) })))`).then(JSON.parse);

export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-motion', 'motion-repo'), now = Date.now();
  const { chats } = makeFixture(ctx.fixture.dir, Array.from({ length: 5 }, (_, i) => ({
    cwd, title: `Chat ${i + 1}`, prompt: `prompt ${i + 1}`, reply: `reply ${i + 1}`, at: new Date(now - (i + 1) * 3600_000),
  })));
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 7`, { what: 'the five chats and the fixture\'s two' });
  // The five came in while the board was up, and moved in; the check that the *first* draw stands still is a reload
  // with them all there: the page comes back, the list is drawn, and nothing has moved.
  await ctx.send('Page.reload'); await ctx.sleep(900);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 7 && window.peix`, { what: 'the board back after the reload' });
  await ctx.sleep(300);
  out.first = await motion(ctx);
  ctx.assert.deepEqual(out.first, [], 'nothing moves on the first draw');
  // narrowed to the folder (the two others go, and the day lines with them, so cards may slide: counted from here on)
  await ctx.key('KeyP');
  await ctx.fill('#pickq', 'motion-repo');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 5`, { what: 'the list narrowed to the five' });
  await ctx.sleep(300);
  out.rest = await cards(ctx);
  ctx.assert.deepEqual(out.rest.map(c => c.title), ['Chat 1', 'Chat 2', 'Chat 3', 'Chat 4', 'Chat 5'], 'newest first');
  const since = async n => (await motion(ctx)).slice(n);
  let n0 = (await motion(ctx)).length;

  // Chat 2 ticked done: it slides to the bottom, and the three under it slide up into its place
  const id2 = chats[1].id;
  const tick = await ctx.server.post(`api/sessions/${id2}/done`, {});
  ctx.assert.ok(tick.ok, `done: ${tick.status}`);
  await ctx.waitFor(`window.peix.motion().slice(${n0}).some(m => m.id === ${JSON.stringify(id2)} && m.kind === 'flip')`, { what: 'the done card sliding', every: 40, timeout: 4000 });
  await ctx.shot('flip');
  out.flip = { motion: await since(n0), cards: await cards(ctx) };
  const slid = out.flip.motion.filter(m => m.kind === 'flip').map(m => m.id);
  ctx.assert.ok([chats[2].id, chats[3].id, chats[4].id].every(id => slid.includes(id)), `the cards below it slide up too (${slid.length} slid)`);
  ctx.assert.equal(out.flip.cards.at(-1).id, id2, 'the done card is last');
  ctx.assert.equal(out.flip.motion.filter(m => m.kind !== 'flip').length, 0, 'a slide, nothing else');
  n0 = (await motion(ctx)).length;

  // a chat written into the fixture while the board is up: its card fades in
  const id6 = makeFixture(ctx.fixture.dir, [{ cwd, title: 'Chat 6', prompt: 'new', reply: 'hello', at: new Date(now) }]).chats[0].id;
  await ctx.waitFor(`window.peix.motion().slice(${n0}).some(m => m.id === ${JSON.stringify(id6)} && m.kind === 'enter')`, { what: 'the new card fading in', every: 40, timeout: 6000 });
  out.enter = await cards(ctx);
  ctx.assert.equal(out.enter[0].id, id6, 'the new card leads');
  n0 = (await motion(ctx)).length;

  // the done chip switched off: the done card folds shut where it stands, takes no click meanwhile, and is gone after
  await ctx.evaluate(`document.querySelector('#fchips .fchip.done').click()`);
  await ctx.waitFor(`window.peix.motion().slice(${n0}).some(m => m.id === ${JSON.stringify(id2)} && m.kind === 'leave')`, { what: 'the done card folding', every: 40, timeout: 3000 });
  out.leave = await ctx.evaluate(`JSON.stringify((c => c ? { leaving: true, dataId: c.dataset.id || null, pointer: getComputedStyle(c).pointerEvents, anims: c.getAnimations().map(a => a.id) } : { leaving: false })(document.querySelector('#slist > .card.leaving')))`).then(JSON.parse);
  if (out.leave.leaving) {   // caught in the act: the fold is a WAAPI animation on a card with no id and no pointer
    ctx.assert.equal(out.leave.dataId, null, 'a leaving card has no data-id');
    ctx.assert.equal(out.leave.pointer, 'none', 'and takes no click');
    await ctx.shot('leave');
  }
  await ctx.waitFor(`!document.querySelector('#slist > .card.leaving') && document.querySelectorAll('#slist > .card').length === 5`, { what: 'and gone', every: 40, timeout: 3000 });
  out.after = (await cards(ctx)).map(c => c.title);
  ctx.assert.deepEqual(out.after, ['Chat 6', 'Chat 1', 'Chat 3', 'Chat 4', 'Chat 5'], 'the list without it');
  return out;
}
