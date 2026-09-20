// The drawer after a re-attach: hide it, open it again with >_, and the screen must be whole — prompt, rules,
// status bar — not the lone digits of a truncated replay (2026-09-20). Runs the fake claude on a fixture chat.
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  await ctx.openChat(chat.id);
  await ctx.key('KeyT');                       // ⌥⌘T: resume it in the drawer
  await ctx.waitPrompt();
  await ctx.sleep(4000);                       // a few status ticks — cells rewritten, nothing else
  const live = await ctx.screen();
  await ctx.shot('0-live', { x: 430, y: 0, width: 1270, height: 1000 });
  await ctx.evaluate(`[...document.querySelectorAll('#term .thead button')].find(b => b.textContent.trim() === 'hide').click()`);
  await ctx.sleep(800);
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#term').hidden`), true, 'the drawer hid');
  await ctx.evaluate(`document.querySelector('#termBtn').click()`);
  await ctx.waitPrompt();
  await ctx.sleep(1500);
  const back = await ctx.screen();
  await ctx.shot('1-reattached', { x: 430, y: 0, width: 1270, height: 1000 });
  const has = (rows, re) => rows.some(r => re.test(r));
  ctx.assert.ok(has(back, /^❯/), 'the prompt is back');
  ctx.assert.ok(has(back, /^─{20,}/), 'the rules are back');
  ctx.assert.ok(has(back, /fake mode on/), 'the status bar is whole');
  ctx.assert.ok(has(back, /elapsed \d+m \d\ds/), 'the timer line is whole, not lone digits');
  ctx.assert.ok(has(back, /fake claude · session/), 'the scrollback came back with the screen');
  const t = (await ctx.server.terminals())[0];
  ctx.assert.ok(t.lastSnapshotChars > 200, 'the page was served a snapshot');
  return { rowsLive: live.length, rowsBack: back.length, snapshotChars: t.lastSnapshotChars, tail: back.slice(-4) };
}
