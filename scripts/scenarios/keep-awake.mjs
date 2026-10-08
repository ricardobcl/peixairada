// Keeping the Mac awake (2026-10-08): two rows of the chat header's ···, and while either holds a mark at the header's
// right end, before ··· — in a chat's header and in the empty one. What this checks, against the test server's fakes
// (caffeinate, pmset, no password): the rows switch and leave the menu up; the mark comes with them, a cup or, for the
// lid, a laptop; it is there with no chat open; a click on it lets the Mac sleep again; and the lid's setting is read
// from the system, so one changed elsewhere shows up by itself.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  const pmset = join(ctx.server.dir, 'pmset'), lid = () => { try { return readFileSync(pmset, 'utf8'); } catch { return '0'; } };
  const mark = () => ctx.evaluate(`JSON.stringify((m => m && { lid: m.classList.contains('lid'), text: m.textContent, beforeMore: m.nextElementSibling?.classList.contains('hmore'),
    right: Math.round(innerWidth - m.getBoundingClientRect().right), top: Math.round(m.getBoundingClientRect().top) })(document.querySelector('#shead #awakeMark')))`).then(JSON.parse);
  const rows = () => ctx.evaluate(`JSON.stringify(['#awakeBtn', '#lidBtn'].map(q => (b => b && [b.classList.contains('on'), b.querySelector('.k').textContent])(document.querySelector('#hmenu ' + q))))`).then(JSON.parse);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length > 0`, { what: 'the board' });
  ctx.assert.equal(await mark(), null, 'no mark while the Mac may sleep');

  await ctx.openChat(ctx.fixture.chats[0].id);
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  await ctx.waitFor(`document.querySelector('#hmenu').open`, { what: 'the menu' });
  ctx.assert.deepEqual(await rows(), [[false, 'off'], [false, 'off']], 'two rows in the menu, both off');

  // Keep awake: the row turns on, the menu stays up, the mark comes — a cup, before ···, at the header's right end
  await ctx.evaluate(`document.querySelector('#awakeBtn').click()`);
  await ctx.waitFor(`!!document.querySelector('#shead #awakeMark')`, { what: 'the mark' });
  ctx.assert.deepEqual(await rows(), [[true, 'on'], [false, 'off']]);
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#hmenu').open`), true, 'a toggle leaves the menu up');
  ctx.assert.equal((await ctx.server.api('api/awake')).body.awake, true, 'the server holds it');
  out.cup = await mark();
  ctx.assert.deepEqual([out.cup.lid, out.cup.text, out.cup.beforeMore], [false, 'awake', true], `a cup, saying awake, before ···: ${JSON.stringify(out.cup)}`);
  ctx.assert.ok(out.cup.right < 60 && out.cup.top < 30, `at the window's top right: ${JSON.stringify(out.cup)}`);

  // …with the lid closed too: the system's setting (the fake's file), the laptop
  await ctx.evaluate(`document.querySelector('#lidBtn').click()`);
  await ctx.waitFor(`document.querySelector('#shead #awakeMark')?.classList.contains('lid') && document.querySelector('#lidBtn .k').textContent === 'on'`, { what: 'the lid on the mark, and its row answered' });
  ctx.assert.equal(lid(), '1', 'pmset -a disablesleep 1');
  ctx.assert.deepEqual(await rows(), [[true, 'on'], [true, 'on']]);
  await ctx.settle();
  await ctx.shot('1-menu', await ctx.evaluate(`(r => ({ x: Math.max(0, r.left - 20), y: 0, width: r.width + 40, height: r.bottom + 20 }))(document.querySelector('#hmenu').getBoundingClientRect())`));
  await ctx.evaluate(`document.querySelector('#hmenu').close()`);
  await ctx.settle();
  await ctx.shot('1-chat', { x: 700, y: 0, width: 1000, height: 120 });

  // No chat open: the empty header wears it too
  await ctx.evaluate(`history.replaceState(null, '', location.pathname)`);
  await ctx.reload();
  await ctx.waitFor(`!!document.querySelector('#shead #noChatMore') && !!document.querySelector('#shead #awakeMark')`, { what: 'the mark in the empty header' });
  out.empty = await mark();
  ctx.assert.deepEqual([out.empty.lid, out.empty.beforeMore], [true, true], 'the laptop, before the empty header\'s ···');
  await ctx.shot('2-empty', { x: 700, y: 0, width: 1000, height: 120 });

  // A click on the mark lets the Mac sleep: both off, the mark gone
  await ctx.evaluate(`document.querySelector('#awakeMark').click()`);
  await ctx.waitFor(`!document.querySelector('#shead #awakeMark')`, { what: 'the mark gone' });
  ctx.assert.deepEqual((await ctx.server.api('api/awake')).body, { awake: false, lid: false });
  ctx.assert.equal(lid(), '0', 'pmset -a disablesleep 0');

  // Set elsewhere (pmset by hand, another app): the poll reads it, and the mark says so
  writeFileSync(pmset, '1');
  await ctx.waitFor(`document.querySelector('#shead #awakeMark')?.classList.contains('lid')`, { timeout: 8000, what: 'the lid set elsewhere, read back' });
  writeFileSync(pmset, '0');
  await ctx.waitFor(`!document.querySelector('#shead #awakeMark')`, { timeout: 8000, what: 'and let go elsewhere' });
  return out;
}
