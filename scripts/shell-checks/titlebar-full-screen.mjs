// A theme's title bar in macOS's own full screen (2026-11-24): there the bar slides down over the head row when the
// pointer reaches the top, so it is opaque — a clear one leaves the lights and the title over the toolbar's controls —,
// and clear again once the window is back. Only with `npm run shell -- --space`: it takes a Space of its own for some
// seconds, as macos-full-screen.mjs does.
export const meta = { space: true };

export default async function (ctx) {
  // the window in or out, and a moment for the delegate's call after the style mask (the last sample is what's asserted)
  const settled = async (want, what) => {
    let win;

    for (const end = Date.now() + 15_000; Date.now() < end; await new Promise(resolve => setTimeout(resolve, 200))) {
      win = await ctx.win();
      if (win.full === want && win.barClear === !want) return win;
    }

    if (win?.full !== want) throw new Error(`timed out waiting for ${what}`);
    return win;
  };

  await ctx.board({ theme: 'flashbang', skinFollow: false, look: 'light', fullSpace: true });
  await ctx.until(`document.documentElement.dataset.skin === 'flashbang'`, 'Flashbang worn');
  ctx.assert.ok((await ctx.win()).barClear, 'a window: the bar clear');
  await ctx.full();
  const full = await settled(true, "macOS's full screen");

  ctx.assert.ok(!full.barClear, 'full screen: the bar opaque');
  ctx.assert.equal(full.ground, 'ffffff', "the ground still the theme's white");
  await ctx.full();
  const back = await settled(false, 'a window again');

  ctx.assert.ok(back.barClear, 'a window again: the bar clear');
  return { full: full.barClear, back: back.barClear };
}
