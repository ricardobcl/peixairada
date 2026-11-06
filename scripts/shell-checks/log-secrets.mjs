// The app's log writes no secret an address carries (2026-11-06, `redacted`): VS Code Web's token rode the pane's keys
// (`ide:…?tkn=…`) into it, dozens of times a day. A page in the pane with a token in its address, and the log read.
export const meta = {};
export default async function (ctx) {
  const [, plain] = ctx.fixture.chats, secret = `peix${Date.now()}secret`;
  await ctx.board();
  await ctx.openChat(plain.id);
  const url = `${ctx.solid('0000ff')}?folder=/x&tkn=${secret}`;
  await ctx.link(url);
  await ctx.halfOf(url);
  const t0 = Date.now();
  while (!/pane: gh:.*solid\/0000ff/.test(ctx.appLog()) && Date.now() - t0 < 10_000) await new Promise(r => setTimeout(r, 100));
  ctx.assert.match(ctx.appLog(), /pane: gh:.*solid\/0000ff\?folder=\/x&tkn=…/, 'the page is logged, its token not');
  ctx.assert.equal(ctx.appLog().includes(secret), false, 'the token nowhere in the log');
  return { redacted: (ctx.appLog().match(/tkn=…/g) || []).length };
}
