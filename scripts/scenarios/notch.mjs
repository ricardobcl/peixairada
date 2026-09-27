// The app filling the screen to the notch (2026-09-27, Ricardo: "fullscreen app on a macbook with a notch, we don't
// really use that upper real estate"): the shell says where the camera housing is (peixFill) and the page lays its top
// row around it. What this checks, with a 16" MacBook Pro's housing (a 32 px strip, the housing from x 771.5 to
// 956.5, measured): the chat list's head stays at the top while the list ends short of the housing; the chat header
// keeps its title left of the housing and its chips and ··· right of it, nothing of the row under it; a list dragged
// under the housing pads its head down, and the header, too far left for a title, pads down too; a list past the
// housing leaves a header that lifts as it is; the rail is the lifted case; and the fill going off puts it all back.
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
      headPad: parseFloat(getComputedStyle(head).paddingTop), h2Right: Math.round(h2.getBoundingClientRect().right), h2Flex: h2.style.flex,
      afterLeft: after ? Math.round(after.getBoundingClientRect().left) : null, afterTop: after ? Math.round(after.getBoundingClientRect().top) : null,
      underHousing: parts.filter(under).map(el => el.textContent.trim().slice(0, 30)),
      chips: [...head.querySelectorAll('#prToggle .hpr:not(.more)')].filter(c => !c.hidden).length, more: head.querySelector('.hpr.more')?.hidden === false,
      title: h2.querySelector('.t')?.getBoundingClientRect().width | 0, oneLine: after ? Math.abs(after.getBoundingClientRect().top - h2.getBoundingClientRect().top) < 12 : null };
  })())`).then(JSON.parse);

  out.off = await read();
  ctx.assert.deepEqual([out.off.notch, out.off.listPad, out.off.chatPad, out.off.hole], [false, false, false, false], 'no fill: nothing of it on the page');

  // The fill, the list at its usual width: both heads in the strip, the header with a hole where the housing is
  await fill(true);
  out.on = await read();
  ctx.assert.deepEqual([out.on.notch, out.on.top, out.on.listPad, out.on.chatPad, out.on.hole], [true, '32px', false, false, true], 'filled: the list lifted, the header holed');
  ctx.assert.ok(out.on.listRight < NOTCH.left, `the list ends short of the housing (${out.on.listRight})`);
  ctx.assert.deepEqual([out.on.fishTop < 32, out.on.shdPad, out.on.headPad], [true, 7, 7], 'both heads at the top, their own padding');
  ctx.assert.ok(out.on.h2Right <= NOTCH.left - 9 && out.on.h2Right > NOTCH.left - 40, `the title ends just short of the housing (${out.on.h2Right})`);
  ctx.assert.ok(out.on.afterLeft >= NOTCH.right + 9 && out.on.afterLeft < NOTCH.right + 40, `the chips start just past it (${out.on.afterLeft})`);
  ctx.assert.deepEqual([out.on.underHousing, out.on.oneLine], [[], true], 'nothing of the row under the housing, and the row is one line');
  ctx.assert.ok(out.on.title > 150, `the title keeps room (${out.on.title} px)`);
  ctx.assert.equal(out.on.chips, 6, 'the six chips fit right of the housing');
  await ctx.shot('1-filled', { x: 0, y: 0, width: 1728, height: 60 });

  // The list dragged under the housing: its head pads down, and the header — no room for a title left of the
  // housing — pads down too, everything below the strip
  await listWidth(820);
  out.wide = await read();
  ctx.assert.deepEqual([out.wide.listPad, out.wide.chatPad, out.wide.hole, out.wide.h2Flex], [true, true, false, ''], 'the list under the housing: both pad, no hole');
  ctx.assert.deepEqual([out.wide.shdPad, out.wide.headPad, out.wide.fishTop >= 32, out.wide.afterTop >= 32], [39, 39, true, true], '…by the strip, and the rows are under it');
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
  await ctx.cmd('KeyB'); await ctx.sleep(250);
  out.rail = await read();
  ctx.assert.deepEqual([out.rail.listPad, out.rail.chatPad, out.rail.hole], [false, false, true], 'the rail: lifted, the header holed');
  ctx.assert.deepEqual(out.rail.underHousing, [], 'nothing under the housing on the rail');
  await ctx.shot('3-rail', { x: 0, y: 0, width: 1728, height: 60 });
  await ctx.cmd('KeyB'); await ctx.sleep(250);

  // A redraw of the header keeps the hole (the h2 is rebuilt): the chips' fold toggled
  await ctx.evaluate(`document.querySelector('#prToggle').click()`); await ctx.sleep(250);
  out.redrawn = await read();
  ctx.assert.deepEqual([out.redrawn.hole, out.redrawn.underHousing], [true, []], 'redrawn, the hole is there again');
  await ctx.evaluate(`document.querySelector('#prToggle').click()`); await ctx.sleep(100);

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
