// Lanes that fold (2026-10-11, later; three state chips filtered the list before): a lane's head is a toggle — its
// cards fold away, the head and its count stay — and Done is folded to begin with (the board's own default, asked for
// here: the harness opens every lane otherwise). A chat ticked done folds into it; a click opens it, another folds the
// Ready lane; ⏎ on a head does the same; a reload keeps what was folded; a query shows every match, folded or not.
// And Idle (2026-10-12): a chat untouched for longer than four days is Idle, folded to begin with — on a board saved
// with Done alone folded too, once. A reply the board has not shown stays where its last word puts it (a lane of its
// own that morning) and is what the funnel's New replies shows — every match, under heads that do not fold — until the
// chat is opened, which the server keeps, so a reload does not bring it back. (The funnel's Your move: pr-turn.mjs.)
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, replyLines, slugOf } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { lanesShut: ['done'] } };

const lanes = ctx => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#slist > *')].map(e => e.classList.contains('lane') ? 'lane:' + e.dataset.lane + (e.classList.contains('shut') ? ' (folded)' : '') + ' ' + e.querySelector('b').textContent : e.classList.contains('card') ? 'card' : null).filter(Boolean))`).then(JSON.parse);

export default async function (ctx) {
  const out = {}, [one, two] = ctx.fixture.chats;
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 2`, { what: 'the fixture\'s two chats' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('.fchip').length`), 0, 'no state chips any more, in the bar or the list\'s foot');
  ctx.assert.deepEqual((await ctx.peix('prefs()')).lanesShut, ['done', 'idle'], 'Done folded to begin with, and Idle once with it');

  // a chat ticked done goes into the folded Done lane: its card folds away, the lane's head counts it
  await ctx.server.post(`api/sessions/${two.id}/done`, { done: true });
  await ctx.waitFor(`document.querySelector('#slist > .gsep.lane.done.shut')`, { what: 'the Done lane, folded' });
  await ctx.settle(); await ctx.waitFor(`!document.querySelector('.rn.rolling')`);
  out.ticked = await lanes(ctx);
  ctx.assert.deepEqual(out.ticked, ['lane:ready 1', 'card', 'lane:done (folded) 1'], 'the ticked card out of sight, counted on its folded head, Done last');

  // a click opens Done; another folds Ready
  const click = g => ctx.evaluate(`document.querySelector('#slist > .gsep.lane[data-lane="${g}"]').click()`);
  await click('done');
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 2`, { what: 'the done card back' });
  out.open = await lanes(ctx);
  ctx.assert.deepEqual(out.open, ['lane:ready 1', 'card', 'lane:done 1', 'card'], 'Done open');
  await click('ready');
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 1`, { what: 'the ready card folded away' });
  await ctx.settle();
  out.folded = { lanes: await lanes(ctx), moves: (await ctx.peix('motion()')).filter(m => m.kind === 'leave' || m.kind === 'fold').map(m => m.kind) };
  ctx.assert.deepEqual(out.folded.lanes, ['lane:ready (folded) 1', 'lane:done 1', 'card'], 'Ready folded, its head and count kept');
  ctx.assert.ok(out.folded.moves.includes('fold') && out.folded.moves.includes('leave'), 'the card folded away, as a ticked one does');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#slist > .gsep.lane[data-lane="ready"]').getAttribute('aria-expanded')`), 'false');

  // ⏎ on a head opens it again, and the keys stay on it
  await ctx.evaluate(`document.querySelector('#slist > .gsep.lane[data-lane="ready"]').focus()`);
  await ctx.evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 2`, { what: 'Ready open again by ⏎' });
  ctx.assert.equal(await ctx.evaluate(`document.activeElement?.dataset?.lane`), 'ready', 'the keys on the head drawn anew');

  // a reload keeps it: fold Done again, reload
  await click('done'); await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 1`);
  await ctx.reload();
  await ctx.waitFor(`document.querySelector('#slist > .gsep.lane.done.shut') && document.querySelectorAll('#slist > .card').length === 1`, { what: 'Done still folded after a reload' });

  // a query shows every match, folded or not
  await ctx.fill('#q', 'plain');
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 1 && !document.querySelector('#slist > .gsep.lane')`, { what: 'the match, no heads' });
  out.query = await ctx.evaluate(`document.querySelector('#slist > .card .title').textContent`);
  ctx.assert.equal(out.query, (await ctx.peix(`session('${two.id}')`)).title, 'the done chat found though its lane is folded');
  await ctx.fill('#q', '');
  await ctx.settle();
  await ctx.shot('lanes', { x: 0, y: 0, width: 420, height: 320 });

  // an old chat is Idle, folded; a reply the board has not shown is Ready as any, and the funnel's New replies
  const [old] = makeFixture(ctx.fixture.dir, [{ cwd: one.cwd, title: 'an old one', prompt: 'from last week', reply: 'yes', at: new Date(Date.now() - 9 * 86_400_000) }]).chats;
  await ctx.waitFor(`document.querySelector('#slist > .gsep.lane.idle.shut')?.querySelector('b')?.textContent === '1'`, { what: 'the old chat, counted on the folded Idle head' });
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#slist > .card[data-id="${old.id}"]')`), false, 'its card folded away');
  appendFileSync(join(ctx.fixture.dir, 'projects', slugOf(one.cwd), one.id + '.jsonl'), replyLines({ id: one.id, cwd: one.cwd, text: 'And one more thing.' }).map(l => JSON.stringify(l)).join('\n') + '\n');
  await ctx.waitFor(`(s => s?.lastReplyAt > s?.seenAt)(window.peix.session('${one.id}'))`, { what: 'the reply, after the board last showed the chat' });
  await ctx.settle(); await ctx.waitFor(`!document.querySelector('.rn.rolling')`);
  out.replied = await lanes(ctx);
  ctx.assert.deepEqual(out.replied, ['lane:ready 1', 'card', 'lane:idle (folded) 1', 'lane:done (folded) 1'], 'no lane of its own: Ready, by its last word');
  const menu = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#ctxm button')].map(b => b.textContent + (b.getAttribute('aria-checked') === 'true' ? ' ✓' : '')))`).then(JSON.parse);
  const choose = async t => { await ctx.evaluate(`document.querySelector('#fBtn').click()`); await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: 'the funnel\'s menu' });
    await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.textContent.startsWith(${JSON.stringify(t)})).click()`); };
  await ctx.evaluate(`document.querySelector('#fBtn').click()`);
  out.menu = await menu();
  ctx.assert.deepEqual(out.menu, ['Every chat ✓', 'Your move0', 'New replies1'], 'the funnel: every chat, or one of the two, each counted');
  await ctx.evaluate(`document.querySelector('#ctxm').close()`);
  await choose('New replies');
  await ctx.waitFor(`document.querySelector('#fBtn.on')`, { what: 'the funnel on' });
  await ctx.settle(); await ctx.waitFor(`!document.querySelector('.rn.rolling')`);
  out.filtered = { lanes: await lanes(ctx), still: await ctx.evaluate(`!!document.querySelector('#slist > .gsep.lane.ready.still') && !document.querySelector('#slist > .gsep.lane.ready[role]')`),
    says: await ctx.evaluate(`document.querySelector('#fBtn .fl').textContent`) };
  ctx.assert.deepEqual(out.filtered, { lanes: ['lane:ready 1', 'card'], still: true, says: 'New replies · 1' }, 'the new reply alone, its head one that does not fold, the funnel saying so');
  await ctx.shot('filter', { x: 0, y: 0, width: 420, height: 200 });
  await ctx.openChat(one.id);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 0 && document.querySelector('#slist .none b')?.textContent === 'No new replies'`, { what: 'opened, it is no new reply' });
  await ctx.reload();
  await ctx.waitFor(`document.querySelector('#fBtn.on') && document.querySelector('#slist .none b')?.textContent === 'No new replies'`, { what: 'after a reload too: the server kept that it was shown, the page the filter' });
  ctx.assert.ok((await ctx.peix(`session('${one.id}')`)).seenAt > (await ctx.peix(`session('${one.id}')`)).lastReplyAt, 'seen after its reply');
  await choose('Every chat');
  await ctx.waitFor(`!document.querySelector('#fBtn.on') && document.querySelectorAll('#slist > .card').length === 1`, { what: 'every chat again' });
  ctx.assert.deepEqual(await lanes(ctx), ['lane:ready 1', 'card', 'lane:idle (folded) 1', 'lane:done (folded) 1'], 'the folds as they were');
  return out;
}
