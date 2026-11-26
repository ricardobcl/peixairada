// ⌥⌘⇧←→ pressed on a pane page (2026-11-26): the forwarder takes them only while they move a tile — Auto-tiling on and
// the column split, as the page says (`tiles`, its `arrows`). One half, the page would drop them, so they stay the
// page's own: VS Code Web's column select. ⌘D goes with the setting alone.
export const meta = {};
export default async function (ctx) {
  const [, chat] = ctx.fixture.chats;
  await ctx.board({ autoTile: true });
  await ctx.openChat(chat.id);
  const key = (code, chars, mods) => ctx.ask('hotkey', { code, chars, mods }),
    left = () => key(123, '', ['cmd', 'alt', 'shift']),
    right = () => key(124, '', ['cmd', 'alt', 'shift']),
    cmdD = () => key(2, 'd', ['cmd']);
  // what the page posts reaches the shell a moment on: asked until it says so, or 10 s
  const said = async (fn, want, what) => {
    const t0 = Date.now();
    let got = await fn();
    while (JSON.stringify(got) !== JSON.stringify(want) && Date.now() - t0 < 10_000) {
      await new Promise(r => setTimeout(r, 100));
      got = await fn();
    }
    ctx.assert.deepEqual(got, want, what);
  };
  await said(cmdD, ['KeyD', 'cmd'], 'Auto-tiling on: ⌘D forwarded');
  await said(left, null, 'one half: ⌥⌘⇧← left to the page');
  ctx.assert.equal(await right(), null, '…and ⌥⌘⇧→');
  ctx.assert.deepEqual(await key(126, '', ['cmd', 'alt', 'shift']), ['ArrowUp', 'shift'], '⌥⌘⇧↑ ever the board’s');
  // ⌘2: the column split — the arrows move a tile now, from a page as from the board
  await ctx.key('Digit2', 'cmd');
  await ctx.until(`peix.state().split === true`, 'the column split');
  await said(left, ['ArrowLeft', 'shift'], 'split: ⌥⌘⇧← forwarded');
  ctx.assert.deepEqual(await right(), ['ArrowRight', 'shift'], '…and ⌥⌘⇧→');
  // one half again: back to the page
  await ctx.key('Digit0', 'cmd');
  await ctx.until(`peix.state().split === false`, 'one half again');
  await said(left, null, 'one half again: ⌥⌘⇧← the page’s');
  // the setting off, split or not: none of the tiles' keys
  await ctx.key('Digit2', 'cmd');
  await ctx.until(`peix.state().split === true`, 'the column split again');
  await said(left, ['ArrowLeft', 'shift'], 'split again: forwarded');
  await ctx.js(`document.querySelector('#autoTile').click(); return true`);
  await said(left, null, 'Auto-tiling off: ⌥⌘⇧← the page’s');
  await said(cmdD, null, 'Auto-tiling off: ⌘D the page’s');
  return { ok: true };
}
