// ⌥ as the compose key in the drawer (2026-09-20): macOptionIsMeta reads every ⌥ chord as Meta, which costs a
// Portuguese keyboard its @ (⌥2) — the one character Claude Code asks for by name. Over a digit or a punctuation
// key the drawer now sends what macOS composed (the browser already hands it over as `e.key`); over a letter ⌥
// stays Meta, where readline's word moves want it — unless what it composed is an ASCII character and no letter, as
// German's ⌥L @ (2026-10-14). The fake claude reads ESC b as the real one does, a word back (2026-10-14; it dropped the
// ESC and typed the b before), so `❯ x@` — an x typed after ⌥b lands before the @ — is the two behaviours side by side;
// the @ and | composed over letters then land where the x left the cursor.
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  await ctx.openChat(chat.id);
  await ctx.key('KeyC');                       // ⌥⌘C: resume it in the drawer
  await ctx.waitPrompt();

  const alt = (key, code, keyCode) => ctx.evaluate(`document.querySelector('#termBody textarea').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)}, keyCode: ${keyCode}, altKey: true, bubbles: true, cancelable: true }))`);
  const promptHas = text => `[...document.querySelectorAll('#termBody .xterm-rows > div')].some(r => r.textContent.includes('❯') && r.textContent.includes(${JSON.stringify(text)}))`;
  const prompt = async () => (await ctx.screen()).find(r => r.includes('❯')) || '';

  await alt('@', 'Digit2', 50);                // ⌥2 on a Portuguese layout — the composed character is e.key
  await ctx.waitFor(promptHas('@'), { what: 'the composed @ in the drawer' });
  await alt('∫', 'KeyB', 66);                  // ⌥b — Meta, still: ESC b, a word back, so what is typed next goes before the @
  await ctx.evaluate(`document.querySelector('#termBody textarea').dispatchEvent(new InputEvent('input', { data: 'x', inputType: 'insertText', bubbles: true }))`);
  await ctx.waitFor(promptHas('x@'), { what: 'the x before the @: ESC b moved the cursor' });
  // over a letter too, when what macOS composed is ASCII and no letter (2026-10-14): German's @ is ⌥L, Swiss's ⌥G,
  // French's | ⌥⇧L — all Meta before, so those keyboards had no @ or | in the drawer
  await alt('@', 'KeyL', 76);                  // ⌥L on a German layout
  await alt('|', 'KeyL', 76);                  // ⌥⇧L on a French one
  await ctx.waitFor(promptHas('x@|@'), { what: 'the @ and the | composed over letters, where the x left the cursor' });

  const line = await prompt();
  ctx.assert.ok(!line.includes('∫'), '⌥+letter was not composed into the prompt');
  await ctx.shot('composed');
  return { prompt: line.trim() };
}
