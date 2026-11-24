// A theme's title bar (2026-11-16, Flashbang): the bar clear over the theme's frame, the board starting under it — never
// running under the traffic lights and taking the window's drags — and a page in the pane where it always was. The
// board starts under macOS's bar too, so turning the bar moves nothing: no jolt, the page's height the same.
import { paintStrips, placer } from '../../lib/paneplace.mjs';

export const meta = {};
export default async function (ctx) {
  const [, plain] = ctx.fixture.chats, placed = placer(ctx), page = ctx.solid('ff00ff');
  await ctx.board({ theme: 'flashbang', skinFollow: false, look: 'light' });
  await ctx.until(`document.documentElement.dataset.skin === 'flashbang'`, 'Flashbang worn');
  await paintStrips(ctx);
  const w = await ctx.win(), tall = await ctx.js(`return innerHeight`);
  ctx.assert.ok(w.titled && w.barClear, 'a normal window, its bar clear');
  ctx.assert.deepEqual([w.ground, w.under], ['ffffff', 'ffffff'], 'the window\'s ground and WebKit\'s the theme\'s white');
  ctx.assert.ok(w.inset > 0 && w.webTop === w.inset, `the board under the bar: ${w.webTop} pt down, the bar ${w.inset}`);
  await ctx.openChat(plain.id);
  await ctx.link(page);
  const seen = await placed('a page under the clear bar', page, 'ff00ff');
  ctx.assert.equal(seen.pageStarts, w.inset, 'the page starts where the overlay does');
  await ctx.full();
  ctx.assert.equal((await ctx.win()).webTop, 0, 'the fill: no bar to start under');
  await ctx.full();
  // Back to the board's own: macOS's bar, the board from the window's top again.
  await ctx.board({ theme: 'own', skinFollow: false, look: 'light' });
  const own = await ctx.win();
  ctx.assert.ok(!own.barClear && own.webTop === w.webTop, `the board's own: macOS's bar, the board where it was (${own.webTop} pt down)`);
  ctx.assert.deepEqual([own.ground, own.under], ['dedcd6', 'dedcd6'], 'both grounds the board\'s light --frame again');
  ctx.assert.equal(await ctx.js(`return innerHeight`), tall, 'the page the same height under either bar');
  return { flashbang: { inset: w.inset, webTop: w.webTop }, own: { webTop: own.webTop } };
}
