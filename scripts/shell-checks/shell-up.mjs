// The shell itself on its throwaway server, out of the way of the app in use (2026-11-04): the page knows it is in the
// app and has the key, the shell's own log is the fake home's, the fill's word reaches the page, and it never came forward.
export const meta = {};
export default async function (ctx) {
  await ctx.board();
  ctx.assert.equal(await ctx.js(`return !!window.webkit?.messageHandlers?.hub`), true, 'the page knows it is in the app');
  ctx.assert.equal(await ctx.js(`return window.PEIX_KEY`), ctx.server.key, 'the key given as the app gives it, from the fake home');
  const w = await ctx.win();
  ctx.assert.ok(w.titled && !w.fill && !w.full, 'a normal window, as the app starts on a Mac it has not run on');
  ctx.assert.equal(w.active, false, 'never in front');
  ctx.assert.equal(w.seen, true, 'seen, one pixel of it: WebKit runs its frames');
  ctx.assert.equal(await ctx.js(`return document.visibilityState`), 'visible');
  ctx.assert.match(ctx.appLog(), /pane: the page starts/, 'its log is the fake home\'s');
  await ctx.full();
  await ctx.until(`peix.state().fill === true`, 'the page told of the fill');
  const f = await ctx.win();
  ctx.assert.ok(f.fill && !f.titled, 'the fill: borderless');
  ctx.assert.equal(f.w, w.w, 'its frame not the screen\'s');
  await ctx.full();
  await ctx.until(`peix.state().fill === false`, 'the page told it is over');
  ctx.assert.equal((await ctx.win()).active, false, 'never in front, the fill included');
  return { inset: w.inset, size: `${w.w}×${w.h}` };
}
