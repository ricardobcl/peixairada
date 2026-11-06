// What the board types for you is text, never keys (2026-11-06). A review's quoted diff lines and paths, a PR's words,
// a handoff, a banner's reply: a PTY reads every byte as a key, so a carriage return in one submitted the prompt there and
// then, a ⌃U wiped what came before it, an ESC [Z cycled Claude Code's permission mode. Through typable() a lone CR is a
// line break, a tab two spaces, every other control gone. What this checks, against the fake claude in a drawer: a banner's
// reply with a CR, a ⌃U and an ESC [Z in it is one prompt with all its words; a dropped file whose name has a control
// character is refused and said so, a plain one typed.
export const meta = { server: true, fake: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {}, [, two] = ctx.fixture.chats;
  await ctx.openChat(two.id);
  await ctx.key('KeyC');                       // ⌥⌘C: Claude on it, in a drawer here
  await ctx.waitPrompt();
  const prompts = () => ctx.evaluate(`fetch('/api/sessions/${two.id}/messages', { headers: { 'x-peix-key': window.PEIX_KEY } }).then(r => r.json()).then(d => JSON.stringify((d.entries || []).filter(e => e.role === 'user' && e.kind === 'text').map(e => e.text)))`).then(JSON.parse);
  const before = (await prompts()).length;
  ctx.assert.equal(await ctx.evaluate(`window.peixReply(${JSON.stringify(two.id)}, 'first\\rsecond\\x15third\\x1b[Z end')`), true, 'the reply went');
  await ctx.waitFor(`fetch('/api/sessions/${two.id}/messages', { headers: { 'x-peix-key': window.PEIX_KEY } }).then(r => r.json()).then(d => (d.entries || []).filter(e => e.role === 'user' && e.kind === 'text').length > ${before})`, { what: 'the reply, a prompt of the chat' });
  await ctx.sleep(1500);   // a CR typed raw would have sent a second prompt by now
  out.prompts = (await prompts()).slice(before);
  ctx.assert.equal(out.prompts.length, 1, 'one prompt: the CR inside it was a line break, not a send');
  ctx.assert.ok(/first[\s\S]*second[\s\S]*third/.test(out.prompts[0]), 'every word is in it: no ⌃U wiped one');
  ctx.assert.ok(!/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(out.prompts[0]), 'and no control character reached it');
  // a drop: a name with a control character is refused, a plain one typed
  out.dropBad = await ctx.evaluate(`window.peixDrop(['/tmp/evil\\rname.txt'])`);
  ctx.assert.equal(out.dropBad, false, 'a dropped name with a CR in it is not typed');
  out.said = await ctx.evaluate(`[...document.querySelectorAll('.note')].map(n => n.textContent).join(' | ')`);
  ctx.assert.match(out.said, /control character/, 'and the board says why');
  out.dropOk = await ctx.evaluate(`window.peixDrop(['/tmp/plain name.txt'])`);
  ctx.assert.equal(out.dropOk, true, 'a plain name is typed');
  await ctx.waitFor(`(window.peix.screen() || []).join(' ').includes('@/tmp/plain\\\\ name.txt')`, { what: 'the @-mention on the prompt line' });
  return out;
}
