// The board's view shows the board (2026-11-06): a script's `location` to another origin is refused as a link there is,
// so the shell never goes on talking to a page that is not the board's.
export const meta = {};
export default async function (ctx) {
  await ctx.board();
  const away = ctx.solid('ff0000');
  await ctx.js(`setTimeout(() => { location.href = ${JSON.stringify(away)}; }, 0); return true`);
  const t = Date.now();
  while (!/board: a navigation to http:\/\/127\.0\.0\.1 refused/.test(ctx.appLog()) && Date.now() - t < 5000) await new Promise(r => setTimeout(r, 100));
  ctx.assert.match(ctx.appLog(), /board: a navigation to http:\/\/127\.0\.0\.1 refused/, 'a script\'s navigation off the board is refused');
  await new Promise(r => setTimeout(r, 500));
  ctx.assert.equal(await ctx.js(`return location.port`), String(ctx.server.port), 'the view is still on the board');
  ctx.assert.equal(await ctx.js(`return !!window.peix`), true, 'and it is the board');
  return { stayed: true };
}
