// The chat header's focus-view button (#viewBtn): with a drawer running, a click types /focus into that holder and
// the button lights from what the session answers — "Focus view enabled" / "…disabled" — never from what we asked
// for. A second click turns it off again. On the zsh tab the click shows the claude session instead of typing a
// slash command into a shell. The fake claude answers /focus with the real one's line (2026-09-20).
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  const out = {};
  const lit = () => ctx.evaluate(`document.querySelector('#viewBtn')?.classList.contains('on') ?? null`);
  const noteText = () => ctx.evaluate(`(document.querySelector('.note')?.textContent || '').trim()`);
  const said = re => ctx.peix('buffer()').then(rows => rows.some(r => re.test(r)));

  await ctx.openChat(chat.id);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#viewBtn')`), false, 'no drawer, no button');
  await ctx.key('KeyC');                       // ⌥⌘C: resume it in the drawer
  await ctx.waitPrompt();
  await ctx.waitFor(`!!document.querySelector('#viewBtn')`, { what: 'the focus-view button, once a claude runs here' });
  out.startsUnlit = await lit();
  ctx.assert.equal(out.startsUnlit, false, 'the board claims nothing until the session says something');

  await ctx.evaluate(`document.querySelector('#viewBtn').click()`);
  await ctx.waitFor(`document.querySelector('#viewBtn')?.classList.contains('on') === true`, { what: 'the button lit by the session’s answer' });
  out.on = { note: await noteText(), said: await said(/Focus view enabled/) };
  ctx.assert.ok(out.on.said, 'the session was told /focus');
  ctx.assert.match(out.on.note, /Focus view on/);
  await ctx.shot('1-on');

  await ctx.evaluate(`document.querySelector('#viewBtn').click()`);
  await ctx.waitFor(`document.querySelector('#viewBtn')?.classList.contains('on') === false`, { what: 'the button unlit again' });
  out.off = { note: await noteText(), said: await said(/Focus view disabled/) };
  ctx.assert.ok(out.off.said, 'and told again');
  ctx.assert.match(out.off.note, /Focus view off/);

  // the zsh tab: the other holder is attached, so the click brings the claude session back instead of typing there
  await ctx.key('KeyT');
  await ctx.waitFor(`window.peix.state().tab === 'shell'`, { what: 'the zsh tab' });
  await ctx.evaluate(`document.querySelector('#viewBtn').click()`);
  await ctx.waitFor(`window.peix.state().tab === 'chat'`, { what: 'the claude session back' });
  out.fromShell = { note: await noteText(), tab: (await ctx.peix('state()')).tab };
  ctx.assert.match(out.fromShell.note, /claude session first/);
  ctx.assert.ok(!(await said(/\/focus/)), 'nothing typed the command into the shell');
  return out;
}
