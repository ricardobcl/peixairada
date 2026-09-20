// The chat header's focus-view button (#viewBtn): with a drawer running, a click types /focus into that holder and
// the button lights from what the session answers — "Focus view enabled" / "…disabled" — never from what we asked
// for. A second click turns it off again. On the zsh tab the click shows the claude session instead of typing a
// slash command into a shell. And a /focus typed in the drawer by hand is picked up by the next attach, which reads
// the newest such line off the screen. The fake claude answers /focus with the real one's line (2026-09-20).
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  const out = {};
  const lit = () => ctx.evaluate(`document.querySelector('#viewBtn')?.classList.contains('on') ?? null`);
  const noted = re => ctx.waitFor(`${re}.test(document.querySelector('.note')?.textContent || '')`, { what: `the note ${re}` });
  const said = re => ctx.peix('buffer()').then(rows => rows.filter(r => re.test(r)).length);
  const type = async text => {   // the drawer's keyboard, as a hand would use it (see drawer-clear)
    await ctx.evaluate(`document.querySelector('#termBody textarea').dispatchEvent(new InputEvent('input', { data: ${JSON.stringify(text)}, inputType: 'insertText', bubbles: true }))`);
    await ctx.evaluate(`document.querySelector('#termBody textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))`);
  };

  await ctx.openChat(chat.id);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#viewBtn')`), false, 'no drawer, no button');
  await ctx.key('KeyC');                       // ⌥⌘C: resume it in the drawer
  await ctx.waitPrompt();
  await ctx.waitFor(`!!document.querySelector('#viewBtn')`, { what: 'the focus-view button, once a claude runs here' });
  out.startsUnlit = await lit();
  ctx.assert.equal(out.startsUnlit, false, 'the board claims nothing until the session says something');

  await ctx.evaluate(`document.querySelector('#viewBtn').click()`);
  await noted('/Focus view on/');
  out.on = { lit: await lit(), said: await said(/Focus view enabled/) };
  ctx.assert.deepEqual(out.on, { lit: true, said: 1 }, 'the session was told /focus, and its answer lit the button');
  await ctx.shot('1-on');

  await ctx.evaluate(`document.querySelector('#viewBtn').click()`);
  await noted('/Focus view off/');
  out.off = { lit: await lit(), said: await said(/Focus view disabled/) };
  ctx.assert.deepEqual(out.off, { lit: false, said: 1 }, 'and again, the other way');

  // the zsh tab: the other holder is attached, so the click brings the claude session back instead of typing there
  await ctx.key('KeyT');
  await ctx.waitFor(`window.peix.state().tab === 'shell'`, { what: 'the zsh tab' });
  await ctx.evaluate(`document.querySelector('#viewBtn').click()`);
  await noted('/claude session first/');
  out.fromShell = { tab: (await ctx.peix('state()')).tab, typed: await said(/\/focus/) };
  ctx.assert.deepEqual(out.fromShell, { tab: 'chat', typed: 0 }, 'the claude session came back, nothing typed into the shell');

  // a /focus typed in the drawer by hand never reaches the board — the next attach reads it off the screen instead.
  // ⌥⌘T then ⌥⌘C is the clean re-attach (a chat switch would resize the drawer by itself).
  await ctx.waitFor(`window.peix.state().termId === window.peix.session().terminal.id`, { what: 'the claude drawer attached again' });
  await type('/focus');
  await ctx.waitFor(`window.peix.buffer().filter(r => /Focus view enabled/.test(r)).length === 2`, { what: 'the session turned its focus view on, by hand' });
  out.byHand = { litBefore: await lit() };
  ctx.assert.equal(out.byHand.litBefore, false, 'the board was not told — nothing lights yet');
  await ctx.key('KeyT'); await ctx.waitFor(`window.peix.state().tab === 'shell'`, { what: 'the zsh tab' });
  await ctx.key('KeyC');
  await ctx.waitFor(`document.querySelector('#viewBtn')?.classList.contains('on') === true`, { what: 'the button lit by what the re-attached screen says' });
  out.byHand.litAfterReattach = await lit();
  await ctx.shot('2-read-back');
  return out;
}
