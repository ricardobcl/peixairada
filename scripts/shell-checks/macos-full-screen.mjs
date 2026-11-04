// A page under its strip in macOS's own full screen (2026-11-04), which Settings › General can pick for ⌃⌘F. Only with
// `npm run shell -- --space`: this one the shell does not do aside, so the app comes forward, takes a Space of its own for
// some seconds and hands it back, and what is typed meanwhile goes to it.
import { paintStrips, placer } from '../../lib/paneplace.mjs';

export const meta = { space: true };
const MAGENTA = 'ff00ff';
export default async function (ctx) {
  const [, plain] = ctx.fixture.chats, placed = placer(ctx);
  await ctx.board({ fullSpace: true });
  await paintStrips(ctx);
  await ctx.openChat(plain.id);
  const one = ctx.solid(MAGENTA);
  await ctx.link(one);
  const window = await placed('a window', one, MAGENTA);
  await ctx.full();
  ctx.assert.ok((await ctx.win()).full, 'in macOS\'s full screen');
  const full = await placed('macOS full screen', one, MAGENTA, 15_000);
  await ctx.full();
  ctx.assert.ok(!(await ctx.win()).full, 'out of it');
  const back = await placed('a window again', one, MAGENTA, 15_000);
  return { window, full, back };
}
