// A page in the pane hands a link to another app only once asked (2026-11-27, `askOut`): a click of yours on it is a sheet
// naming the app and the link, as a browser asks — one click on a link laid over a whole page was enough. Cancelled,
// nothing is asked of the system. The scheme is VS Code Insiders', which this Mac need not have: a shell that hands it
// on at once (--src on the old code) asks the system for it, and never shows a sheet.
export const meta = {};

export default async function (ctx) {
  const [, plain] = ctx.fixture.chats;

  await ctx.board();
  await ctx.openChat(plain.id);
  const url = ctx.solid('00ff00');

  await ctx.link(url);
  const { key } = await ctx.halfOf(url);
  const t0 = Date.now();

  while (!(await ctx.win()).panes[key]?.up && Date.now() - t0 < 10_000) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  await ctx.page(
    key,
    `await new Promise(r => document.readyState === 'complete' ? r() : addEventListener('load', r)); return true`,
  );

  const wait = async re => {
    const startedAt = Date.now();

    while (!re.test(ctx.appLog()) && Date.now() - startedAt < 5000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return re.test(ctx.appLog());
  };

  ctx.assert.equal(await ctx.ask('gesture', { key }), true); // a press of yours in that view, a moment before

  await ctx.page(
    key,
    `const a = document.createElement('a'); a.href = 'vscode-insiders://peix-nothing/nowhere'; a.textContent = 'x'; document.body.append(a); a.click(); return true`,
  );

  ctx.assert.ok(await wait(/pane: vscode-insiders: asked before it is handed on/), 'a sheet asks first');
  ctx.assert.doesNotMatch(ctx.appLog(), /open: vscode-insiders/, 'nothing asked of the system yet');
  ctx.assert.equal(await ctx.ask('unsheet'), true, 'the sheet was up');
  ctx.assert.ok(await wait(/pane: vscode-insiders: not opened — cancelled/), 'cancelled');
  ctx.assert.doesNotMatch(ctx.appLog(), /open: vscode-insiders/, 'and nothing opened');
  return { key };
}
