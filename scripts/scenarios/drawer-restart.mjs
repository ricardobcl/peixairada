// The drawer across a server restart: the holder keeps the chat, the new server adopts it, the page reattaches
// after a reload and the screen is whole; typing still reaches the fake. What every server change used to cost.
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  await ctx.openChat(chat.id);
  await ctx.key('KeyC');                       // ⌥⌘C: resume it in the drawer
  await ctx.waitPrompt();
  const before = (await ctx.server.terminals())[0];
  ctx.log(`terminal ${before.id}: pid ${before.pid}, holder ${before.holderPid} — restarting the server under it`);
  await ctx.server.restart();
  const after = (await ctx.server.terminals())[0];
  ctx.assert.ok(after && after.id === before.id && after.exited === null, 'the new server adopted the drawer');
  ctx.assert.equal(after.pid, before.pid, 'same claude');
  // the page lost its SSE and socket with the old server; a reload is what the app does (the watchdog) — do the same
  await ctx.reload();
  await ctx.openChat(chat.id);
  await ctx.waitFor(`document.querySelector('#termBtn') && !document.querySelector('#termBtn').disabled`, { what: 'the >_ button' });
  await ctx.evaluate(`document.querySelector('#termBtn').click()`);
  await ctx.waitPrompt();
  await ctx.sleep(1200);
  const screen = await ctx.screen();
  await ctx.shot('1-after-restart', { x: 430, y: 0, width: 1270, height: 1000 });
  ctx.assert.ok(screen.some(r => /fake mode on/.test(r)) && screen.some(r => /^❯/.test(r)), 'the screen is whole after the restart');
  // type into the adopted drawer
  await ctx.evaluate(`document.querySelector('#termBody textarea').dispatchEvent(new InputEvent('input', { data: 'still here', inputType: 'insertText', bubbles: true }))`);
  await ctx.evaluate(`document.querySelector('#termBody textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))`);
  await ctx.waitFor(`[...document.querySelectorAll('#termBody .xterm-rows > div')].some(r => r.textContent.includes('You said: still here'))`, { timeout: 8000, what: 'the fake answering' });
  return { id: after.id, pid: after.pid, holder: after.holderPid, adoptedLog: /adopted/.test(ctx.server.logText()) };
}
