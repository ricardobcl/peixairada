// /clear in the drawer (2026-09-20): Claude Code keeps the process and takes a new session id — the registry file
// says so — and the board must follow: the server re-links the holder to the new chat, the page opens it with the
// drawer still attached, and the old chat is a stale card. Runs the fake claude, whose /clear does what the real one does.
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  await ctx.openChat(chat.id);
  await ctx.key('KeyC'); await ctx.waitPrompt();
  const before = await ctx.peix('state()');
  ctx.assert.equal(before.termSession, chat.id, 'the drawer runs the chat');
  const type = async text => {
    await ctx.evaluate(`document.querySelector('#termBody textarea').dispatchEvent(new InputEvent('input', { data: ${JSON.stringify(text)}, inputType: 'insertText', bubbles: true }))`);
    await ctx.evaluate(`document.querySelector('#termBody textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))`);
  };
  await type('/clear');
  await ctx.waitFor(`window.peix.state().current && window.peix.state().current !== ${JSON.stringify(chat.id)}`, { what: 'the board following the process to its new chat', timeout: 15_000 });
  const after = await ctx.peix('state()');
  ctx.assert.equal(after.termId, before.termId, 'the same drawer, still attached');
  ctx.assert.equal(after.termSession, after.current, 'on the new chat');
  await ctx.waitPrompt();
  await ctx.sleep(500);
  ctx.assert.ok((await ctx.screen()).some(r => /\(cleared\)/.test(r)), 'the fake started over on screen');
  // The old chat goes stale on the registry poll, not with the switch: wait for it rather than race it. It used
  // to time out one run in six, because the chat a holder *leaves* was never pushed — linkTermToRegistry told
  // the new chat and nobody else, so the old card kept a drawer that had moved on (fixed 2026-09-22).
  await ctx.waitFor(`(s => s && !s.terminal && !s.alive)(window.peix.session(${JSON.stringify(chat.id)}))`,
    { what: 'the old chat a stale card now, without a drawer', timeout: 20_000 });
  const terms = await ctx.server.terminals();
  ctx.assert.equal(terms.filter(t => !t.shell && t.exited === null).length, 1, 'one claude process, not a second resume');
  ctx.assert.equal(terms.find(t => !t.shell).sessionId, after.current, "the holder is the new chat's");
  await ctx.shot('cleared', { x: 430, y: 0, width: 1270, height: 600 });
  return { from: chat.id, to: after.current, term: after.termId };
}
