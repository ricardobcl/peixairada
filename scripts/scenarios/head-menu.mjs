// The chat header's ··· (2026-09-24, Ricardo: "on the chat top bar, every icon that's on the right should live under
// a discrete '...' borderless button"). What this checks: the header row holds the title, the PR chips and ··· — no
// button of its own; ··· opens a menu of the actions under it, right-aligned, with the buttons' own ids; a toggle
// leaves it up with its new state; Esc, a click elsewhere and an action close it; a hotkey is not swallowed by it.
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const [two] = ctx.fixture.chats;
  const out = {};
  const open = () => ctx.evaluate(`document.querySelector('#hmenu').open`);
  await ctx.openChat(two.id);
  await ctx.waitFor(`!!document.querySelector('#moreBtn')`, { what: 'the header' });

  out.row = await ctx.evaluate(`JSON.stringify({ buttons: [...document.querySelectorAll('#shead > button')].map(b => b.id),
    more: (b => ({ border: getComputedStyle(b).borderTopWidth, last: b === [...document.querySelectorAll('#shead > :not(.details)')].pop() }))(document.querySelector('#moreBtn')) })`).then(JSON.parse);
  ctx.assert.deepEqual(out.row.buttons, ['prToggle', 'moreBtn'], 'the PRs and ··· are the only buttons in the row');
  ctx.assert.deepEqual(out.row.more, { border: '0px', last: true }, '··· is borderless, and last');
  await ctx.shot('1-row', { x: 380, y: 0, width: 1320, height: 60 });

  // ··· opens the menu under itself, right-aligned
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  ctx.assert.equal(await open(), true, '··· opens the menu');
  out.menu = await ctx.evaluate(`JSON.stringify({ ids: [...document.querySelectorAll('#hmenu button')].map(b => b.id),
    right: Math.round(document.querySelector('#moreBtn').getBoundingClientRect().right - document.querySelector('#hmenu').getBoundingClientRect().right),
    below: Math.round(document.querySelector('#hmenu').getBoundingClientRect().top - document.querySelector('#moreBtn').getBoundingClientRect().bottom) })`).then(JSON.parse);
  ctx.assert.deepEqual(out.menu.ids, ['termBtn', 'webBtn', 'detailsBtn', 'settingsBtn'], 'the actions, by their own ids — the settings last, no { } since long code is always folded (2026-09-28), no open in VS Code (2026-09-29)');
  ctx.assert.ok(Math.abs(out.menu.right) <= 1 && out.menu.below === 4, 'right-aligned, just under ···');
  await ctx.shot('2-menu', { x: 1100, y: 0, width: 600, height: 300 });

  // a toggle keeps it up, with the new state on its row
  const details = () => ctx.evaluate(`document.querySelector('#detailsBtn .k').textContent`);
  const was = await details();
  await ctx.evaluate(`document.querySelector('#detailsBtn').click()`);
  ctx.assert.equal(await open(), true, 'a toggle leaves the menu up');
  ctx.assert.notEqual(await details(), was, '…and its row says the new state');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#shead .details').hidden`), false, 'details: path and branch under the title');
  await ctx.evaluate(`document.querySelector('#detailsBtn').click()`);

  // Esc, a click elsewhere, a hotkey
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  ctx.assert.equal(await open(), false, 'Esc closes it');
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  await ctx.evaluate(`document.querySelector('#log').click()`);
  ctx.assert.equal(await open(), false, 'a click elsewhere closes it');
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  await ctx.key('KeyK');
  out.hotkey = await ctx.evaluate(`JSON.stringify({ menu: document.querySelector('#hmenu').open, pick: document.querySelector('#pick').open })`).then(JSON.parse);
  ctx.assert.deepEqual(out.hotkey, { menu: false, pick: true }, 'a hotkey closes the menu and does its own thing');
  await ctx.evaluate(`document.querySelector('#pick').close()`);
  return out;
}
