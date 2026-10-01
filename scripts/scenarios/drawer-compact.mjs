// /compact in the drawer (2026-09-29). Claude Code 2.1.28x writes the typed command as a plain prompt line, says busy
// while it summarises, and once compacted writes the boundary, the summary and the command's own tagged lines — no
// assistant line, so no end_turn. The transcript alone never says the turn is over; the registry going idle after it
// began does. Runs the fake claude, whose /compact writes what the real one does.
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  const card = `document.querySelector('#slist > .card[data-id=${JSON.stringify(chat.id)}]')`;
  await ctx.openChat(chat.id);
  await ctx.key('KeyC'); await ctx.waitPrompt();
  ctx.assert.equal((await ctx.peix('state()')).termSession, chat.id, 'the drawer runs the chat');
  await ctx.waitFor(`window.peix.session(${JSON.stringify(chat.id)}).status === 'idle'`, { what: 'the chat idle in its drawer', timeout: 8000 });
  await ctx.type('/compact');
  await ctx.waitFor(`window.peix.session(${JSON.stringify(chat.id)}).lastPrompt === '/compact'`, { what: 'the typed /compact, a prompt line', timeout: 8000 });
  // compacted: the card is ready again, the same chat, not clauding
  await ctx.waitFor(`window.peix.session(${JSON.stringify(chat.id)}).status === 'idle' && !${card}.classList.contains('working')`, { what: 'the chat ready once compacted', timeout: 10_000 });
  await ctx.shot('compacted', { x: 0, y: 0, width: 1270, height: 400 });
  return { status: await ctx.peix(`session(${JSON.stringify(chat.id)}).status`), compacted: await ctx.evaluate(`!!document.querySelector('#log .sysline')`) };
}
