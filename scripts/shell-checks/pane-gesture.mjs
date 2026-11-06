// A page in the pane hands a link on to another app only when the click is the user's (2026-11-06, `gestured`): a
// script's click() on a link to an editor's scheme arrives at the shell as a link clicked in the main frame, and was
// handed on with no click at all. The scheme is VS Code Insiders', which this Mac need not have: a shell that still
// hands it on (--src on the old code) asks the system for an app that is not there.
export const meta = {};
export default async function (ctx) {
  const [, plain] = ctx.fixture.chats;
  await ctx.board();
  await ctx.openChat(plain.id);
  const url = ctx.solid('00ff00');
  await ctx.link(url);
  const { key } = await ctx.halfOf(url);
  const t0 = Date.now();
  while (!(await ctx.win()).panes[key]?.up && Date.now() - t0 < 10_000) await new Promise(r => setTimeout(r, 100));
  await ctx.page(key, `await new Promise(r => document.readyState === 'complete' ? r() : addEventListener('load', r)); return true`);
  await ctx.page(key, `const a = document.createElement('a'); a.href = 'vscode-insiders://peix-nothing/nowhere'; a.textContent = 'x'; document.body.append(a); a.click(); return true`);
  const said = /pane: vscode-insiders: not opened, from \S+ — no click or key of yours there/;
  const t1 = Date.now();
  while (!said.test(ctx.appLog()) && Date.now() - t1 < 5000) await new Promise(r => setTimeout(r, 100));
  ctx.assert.match(ctx.appLog(), said, 'a script\'s click on an editor link is not handed on');
  ctx.assert.doesNotMatch(ctx.appLog(), /open: vscode-insiders/, 'nothing asked of the system');
  return { key };
}
