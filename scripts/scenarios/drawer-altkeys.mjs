// ⌥ as the compose key in the drawer (2026-09-20): macOptionIsMeta reads every ⌥ chord as Meta, which costs a
// Portuguese keyboard its @ (⌥2) — the one character Claude Code asks for by name. Over a digit or a punctuation
// key the drawer now sends what macOS composed (the browser already hands it over as `e.key`); over a letter ⌥
// stays Meta, where readline's word moves want it. The fake claude drops a lone ESC and echoes the rest, so
// `❯ @b` on its prompt is exactly the two behaviours side by side.
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
  await alt('∫', 'KeyB', 66);                  // ⌥b — Meta, still: ESC b, and the fake shows the bare letter
  await ctx.waitFor(promptHas('@b'), { what: 'ESC b behind it' });

  const line = await prompt();
  ctx.assert.ok(!line.includes('∫'), '⌥+letter was not composed into the prompt');
  await ctx.shot('composed');
  return { prompt: line.trim() };
}
