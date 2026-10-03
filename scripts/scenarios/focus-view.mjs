// The chat header's focus-view button (#viewBtn): with a drawer running, a click types /focus into that holder and
// the button lights from what the session answers — "Focus view enabled" / "…disabled" — never from what we asked
// for. A second click turns it off again. On the zsh tab the command still goes to the chat's claude holder — since
// 2026-09-22 a second tab splits the column, so that holder is attached in the half next door; it is the chat's
// session the button acts on, not the tab's. And a /focus typed in the drawer by hand is picked up by the next
// attach, which reads the newest such line off the screen. The fake claude answers /focus with the real one's line.
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  const out = {};
  const lit = () => ctx.evaluate(`document.querySelector('#viewBtn')?.classList.contains('on') ?? null`);
  const noted = re => ctx.waitFor(`${re}.test(document.querySelector('.note')?.textContent || '')`, { what: `the note ${re}` });
  const said = re => ctx.peix('buffer()').then(rows => rows.filter(r => re.test(r)).length);
  const type = (text, g = 0) => ctx.type(text, g);   // the drawer's keyboard, as a hand would use it

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

  // the zsh, which is this chat's second tab: it splits the column and opens beside the claude drawer, which is
  // still attached — so the button types into that holder from here. `said` reads the half the keys are in, the zsh.
  await ctx.key('KeyT');
  await ctx.waitFor(`window.peix.state().tab === 'shell'`, { what: 'the zsh tab, in the half the split made' });
  await ctx.evaluate(`document.querySelector('#viewBtn').click()`);
  await noted('/Focus view on/');
  out.fromShell = { lit: await lit(), typedInShell: await said(/focus/) };
  ctx.assert.deepEqual(out.fromShell, { lit: true, typedInShell: 0 }, "the chat's claude took the command, and nothing was typed into the shell");
  await ctx.evaluate(`document.querySelector('#viewBtn').click()`);   // …and off again, so what follows starts from a session that says off
  await noted('/Focus view off/');

  // a /focus typed in the drawer by hand never reaches the board — the next attach reads it off the screen instead.
  // ⌥⌘C takes the keys back to the claude drawer, which kept the left half (2026-09-25: a split never moves claude
  // out of it), so nothing re-attaches on the way.
  await ctx.key('KeyC');
  await ctx.waitFor(`window.peix.state().tab === 'chat' && window.peix.state().focusG === 0 && window.peix.state().termId === window.peix.session().terminal.id`, { what: 'the claude drawer under the keys, in the left half' });
  await ctx.waitPrompt(30_000, 0);
  const wasOn = await said(/Focus view enabled/);
  await type('/focus', 0);
  await ctx.waitFor(`window.peix.buffer().filter(r => /Focus view enabled/.test(r)).length === ${wasOn + 1}`, { what: 'the session turned its focus view on, by hand' });
  out.byHand = { litBefore: await lit() };
  ctx.assert.equal(out.byHand.litBefore, false, 'the board was not told — nothing lights yet');
  // The next attach is a reloaded board — what the app does every time it is restarted, and the one re-attach that
  // cannot be spoiled by a resize: the page's screen is built from the holder's snapshot into a fresh xterm. Moving
  // the drawer between halves re-attaches it too, but it resizes it on the way, and the page's emulator and the
  // holder's then disagree by a line for as long as nothing re-syncs them — the read finds whichever line that
  // leaves on screen (measured 2026-09-22; the re-sync is still not written).
  await ctx.reload();
  await ctx.openChat(chat.id);
  await ctx.waitFor(`document.querySelector('#viewBtn')?.classList.contains('on') === true`, { what: 'the button lit by what the re-attached screen says' });
  out.byHand.litAfterReattach = await lit();
  await ctx.shot('2-read-back');
  return out;
}
