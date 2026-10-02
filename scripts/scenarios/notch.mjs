// The app filling the screen to the notch (2026-09-27): the shell says where the camera housing is (peixFill) and the
// page lays its top row around it. What this checks, with a 16" MacBook Pro's housing (a 32 px strip, the housing from
// x 771.5 to 956.5, measured): the chat list's head stays at the top while the list ends short of the housing; the chat
// header keeps its title left of the housing and its chips and ··· right of it, nothing of the row under it; a list
// dragged under the housing pads its head down, and the header, too far left for a title, pads down too; a list past
// the housing leaves a header that lifts as it is; the rail is the lifted case; and the fill going off puts it all
// back. Since 2026-09-28: what follows the title stands at the far right, the header is black from the project's name
// on, and a title that does not fit left of the housing goes right of it — a short one stays left.
import { makeFixture } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };
const NOTCH = { top: 32, left: 771.5, right: 956.5 };

export default async function (ctx) {
  const out = {};
  await ctx.send('Emulation.setDeviceMetricsOverride', { width: 1728, height: 1117, deviceScaleFactor: 1, mobile: false });
  const urls = Array.from({ length: 6 }, (_, i) => `https://github.com/acme/repo-a/pull/${201 + i}`);
  const [chat] = makeFixture(ctx.fixture.dir, [{ cwd: '/Users/test/repo-a', title: 'A long enough title to be truncated left of the housing, surely', prompt: `The stack: ${urls.join(' ')}`, reply: 'Six.' }]).chats;
  await ctx.waitFor(`!!window.peix.session(${JSON.stringify(chat.id)})`, { what: 'the chat on the board' });
  await ctx.openChat(chat.id);
  await ctx.waitFor(`document.querySelectorAll('#prToggle .hpr:not(.more)').length === 6`, { what: 'the chips drawn' });
  const fill = (on, notch = NOTCH) => ctx.evaluate(`window.peixFill(${on}, ${JSON.stringify(notch)})`).then(() => ctx.sleep(250));
  const listWidth = w => ctx.evaluate(`document.querySelector('#sessions').style.width = '${w}px'`).then(() => ctx.sleep(250));
  // The row, measured: what is in the strip, and whether anything of the header sits under the housing (x within it,
  // and its top above the strip's bottom).
  const read = () => ctx.evaluate(`JSON.stringify((() => {
    const N = ${JSON.stringify(NOTCH)}, main = document.querySelector('#main'), list = document.querySelector('#sessions'), chat = document.querySelector('#chat');
    const head = document.querySelector('#shead'), h2 = head.querySelector('h2'), shd = document.querySelector('#shd');
    const under = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top < N.top && r.right > N.left && r.left < N.right; };
    const parts = [...head.querySelectorAll('*')].filter(el => el.getClientRects().length && el.textContent.trim() && !el.querySelector('*'));
    const after = [...head.children].find(el => el !== h2 && !el.classList.contains('details') && el.getClientRects().length);
    return { notch: main.classList.contains('notch'), top: main.style.getPropertyValue('--notch-top'),
      listPad: list.classList.contains('npad'), chatPad: chat.classList.contains('npad'), hole: head.classList.contains('hole'),
      listRight: Math.round(list.getBoundingClientRect().right), headLeft: Math.round(head.getBoundingClientRect().left),
      fishTop: Math.round(document.querySelector('#brandBtn').getBoundingClientRect().top), shdPad: parseFloat(getComputedStyle(shd).paddingTop),
      listPad0: parseFloat(getComputedStyle(document.querySelector('#slist')).paddingTop), cardTop: Math.round(document.querySelector('#slist > .card')?.getBoundingClientRect().top ?? -1),
      headPad: parseFloat(getComputedStyle(head).paddingTop), h2Right: Math.round(h2.getBoundingClientRect().right), h2Flex: h2.style.flex,
      afterLeft: after ? Math.round(after.getBoundingClientRect().left) : null, afterTop: after ? Math.round(after.getBoundingClientRect().top) : null,
      underHousing: parts.filter(under).map(el => el.textContent.trim().slice(0, 30)),
      chips: [...head.querySelectorAll('#prToggle .hpr:not(.more)')].filter(c => !c.hidden).length, more: head.querySelector('.hpr.more')?.hidden === false,
      title: h2.querySelector('.t')?.getBoundingClientRect().width | 0, tright: head.classList.contains('tright'),
      tLeft: Math.round(h2.querySelector('.t').getBoundingClientRect().left), tRight: Math.round(h2.querySelector('.t').getBoundingClientRect().right),
      repoRight: Math.round(h2.querySelector('.repo').getBoundingClientRect().right), sepRight: Math.round(h2.querySelector('.sep').getBoundingClientRect().right),
      tailRight: Math.round(head.querySelector('.hmore').getBoundingClientRect().right + parseFloat(getComputedStyle(head.querySelector('.hmore')).marginRight)), headInner: Math.round(head.getBoundingClientRect().right - parseFloat(getComputedStyle(head).paddingRight)),
      split: Math.round(head.getBoundingClientRect().left + parseFloat(head.style.getPropertyValue('--hsplit'))), oneLine: after ? Math.abs(after.getBoundingClientRect().top - h2.getBoundingClientRect().top) < 12 : null };
  })())`).then(JSON.parse);

  out.off = await read();
  ctx.assert.deepEqual([out.off.notch, out.off.listPad, out.off.chatPad, out.off.hole], [false, false, false, false], 'no fill: nothing of it on the page');

  // The fill, the list at its usual width: both heads in the strip, the header with a hole where the housing is
  await fill(true);
  out.on = await read();
  ctx.assert.deepEqual([out.on.notch, out.on.top, out.on.listPad, out.on.chatPad, out.on.hole], [true, '32px', false, false, true], 'filled: the list lifted, the header holed');
  ctx.assert.ok(out.on.listRight < NOTCH.left, `the list ends short of the housing (${out.on.listRight})`);
  ctx.assert.deepEqual([out.on.listPad0, out.on.headPad], [0, 7], 'the list\'s cards and the chat\'s header at the top, their own padding — the list\'s row is at its foot (2026-09-28, later), the first card flush with the top (2026-09-29)');
  ctx.assert.ok(out.on.fishTop > 500, `the fish at the foot (${out.on.fishTop})`);
  ctx.assert.ok(out.on.repoRight < NOTCH.left - 9, `the project's name left of the housing (${out.on.repoRight})`);
  ctx.assert.ok(out.on.tright && out.on.tLeft >= NOTCH.right + 9 && out.on.tLeft < NOTCH.right + 20, `a title too long for the left goes right of the housing (${out.on.tLeft})`);
  ctx.assert.ok(out.on.afterLeft >= NOTCH.right + 9, `the chips start past it (${out.on.afterLeft})`);
  ctx.assert.equal(out.on.tailRight, out.on.headInner, 'and what follows the title stands at the far right (2026-09-28)');
  ctx.assert.equal(out.on.split, out.on.sepRight, `the header is black from the project's name on, the housing inside it (${out.on.split})`);
  ctx.assert.deepEqual([out.on.underHousing, out.on.oneLine], [[], true], 'nothing of the row under the housing, and the row is one line');
  ctx.assert.ok(out.on.title > 150, `the title keeps room (${out.on.title} px)`);
  ctx.assert.equal(out.on.chips, 6, 'the six chips fit right of the housing');
  await ctx.shot('1-filled', { x: 0, y: 0, width: 1728, height: 60 });

  // The list dragged under the housing: its cards start under the strip, and the header — no room for a title left of
  // the housing — pads down too, everything below the strip
  await listWidth(820);
  out.wide = await read();
  ctx.assert.deepEqual([out.wide.listPad, out.wide.chatPad, out.wide.hole, out.wide.h2Flex], [true, true, false, ''], 'the list under the housing: both pad, no hole');
  ctx.assert.deepEqual([out.wide.listPad0, out.wide.headPad, out.wide.cardTop >= 32, out.wide.afterTop >= 32], [32, 39, true, true], '…by the strip, and the rows are under it');
  ctx.assert.deepEqual(out.wide.underHousing, [], 'nothing under the housing');
  await ctx.shot('2-list-under', { x: 0, y: 0, width: 1728, height: 90 });

  // The list past the housing: the header is wholly right of it and lifts as it is
  await listWidth(1000);
  out.past = await read();
  ctx.assert.deepEqual([out.past.listPad, out.past.chatPad, out.past.hole], [true, false, false], 'the header past the housing lifts, the list still pads');
  ctx.assert.ok(out.past.headLeft >= NOTCH.right, `the header starts past the housing (${out.past.headLeft})`);
  ctx.assert.equal(out.past.headPad, 7, '…at its own padding');

  // Back to the usual width, and the rail: the lifted case with a hole
  await listWidth(380);
  await ctx.key('KeyB'); await ctx.sleep(250);
  out.rail = await read();
  ctx.assert.deepEqual([out.rail.listPad, out.rail.chatPad, out.rail.hole], [false, false, true], 'the rail: lifted, the header holed');
  ctx.assert.deepEqual(out.rail.underHousing, [], 'nothing under the housing on the rail');
  await ctx.shot('3-rail', { x: 0, y: 0, width: 1728, height: 60 });
  await ctx.key('KeyB'); await ctx.sleep(250);

  // A redraw of the header keeps the hole (the h2 is rebuilt): the chips' fold toggled
  await ctx.evaluate(`document.querySelector('#prToggle').click()`); await ctx.sleep(250);
  out.redrawn = await read();
  ctx.assert.deepEqual([out.redrawn.hole, out.redrawn.underHousing], [true, []], 'redrawn, the hole is there again');
  await ctx.evaluate(`document.querySelector('#prToggle').click()`); await ctx.sleep(100);

  // A title short enough for the left of the housing stays there, the chips still at the far right
  await ctx.server.api(`api/sessions/${chat.id}/title`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'A short title' }) });
  await ctx.waitFor(`document.querySelector('#shead h2 .t').textContent === 'A short title'`, { what: 'the short title drawn' });
  await ctx.sleep(250);
  out.short = await read();
  ctx.assert.ok(!out.short.tright && out.short.tRight <= NOTCH.left - 9, `a short title left of the housing (${out.short.tRight})`);
  ctx.assert.deepEqual([out.short.underHousing, out.short.tailRight], [[], out.short.headInner], 'nothing under it, the chips at the far right');
  await ctx.shot('4-short-title', { x: 0, y: 0, width: 1728, height: 60 });

  // A screen without a housing (an external display): filled, but nothing to lay around
  await fill(true, null);
  out.plain = await read();
  ctx.assert.deepEqual([out.plain.notch, out.plain.hole, out.plain.h2Flex], [false, false, ''], 'filled on a plain screen: no hole, no pad');
  ctx.assert.equal(await ctx.evaluate(`window.peix.state().fill`), true, '…though the fill is on');

  // Off: everything back
  await fill(false, null);
  out.back = await read();
  ctx.assert.deepEqual([out.back.notch, out.back.listPad, out.back.chatPad, out.back.hole, out.back.h2Flex, out.back.headPad], [false, false, false, false, '', 7], 'off: the row as it was');
  ctx.assert.equal(await ctx.evaluate(`window.peix.state().fill`), false);
  return out;
}
