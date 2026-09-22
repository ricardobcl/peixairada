// ⌘K clears the drawer (2026-09-20): xterm.js ships no such key and the shell cannot bind one — ⌃L is zsh's own
// and keeps the scrollback, which is not what ⌘K means in Terminal.app or iTerm. The page asks the holder, the
// holder clears the screen it serializes and echoes the clear back, and that echo is what wipes the page: every
// attached page drops the same rows, and the next attach gets the cleared screen rather than the one we hid.
// Driven on the zsh tab, where a marker is one `echo` away; the claude drawer takes the same path. The zsh is a
// second tab, so since 2026-09-22 it opens in the right half of the chat column — #termBodyB, and screen(1).
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  await ctx.openChat(chat.id);
  await ctx.key('KeyT');                       // ⌥⌘T: a zsh in the chat's folder, its own holder
  await ctx.waitFor(`window.peix.state().tab === 'shell' && window.peix.term().ws === 1`, { what: 'the zsh tab, attached' });

  const type = async text => {                 // the drawer's keyboard, as a hand would use it (see drawer-clear)
    await ctx.evaluate(`document.querySelector('#termBodyB textarea').dispatchEvent(new InputEvent('input', { data: ${JSON.stringify(text)}, inputType: 'insertText', bubbles: true }))`);
    await ctx.evaluate(`document.querySelector('#termBodyB textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))`);
  };
  const marked = negate => ctx.waitFor(`${negate ? '!' : ''}[...document.querySelectorAll('#termBodyB .xterm-rows > div')].some(r => /peixmark/.test(r.textContent))`,
    { what: `the marker ${negate ? 'gone from' : 'on'} the screen`, timeout: 20_000 });

  // printf, not echo: the marker must reach the screen as output only, never as the line being typed — zsh echoes
  // what you type long before it runs it, and a clear between the two is a race that proves nothing.
  await type("printf 'peix%s\\n' mark");
  await marked(false);
  await ctx.evaluate(`document.querySelector('#termBodyB textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', keyCode: 75, metaKey: true, bubbles: true, cancelable: true }))`);
  await marked(true);
  await ctx.shot('cleared');

  // What a re-attach would be handed: the holder's own screen, serialized. The marker must be gone from there too,
  // or the clear is a trick of this page and comes undone on the next attach (or the next server restart).
  const snap = await ctx.evaluate(`new Promise(res => {
    const ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/api/terminals/' + window.peix.term().id + '/ws');
    ws.binaryType = 'arraybuffer'; let text = '';
    ws.onmessage = e => { if (typeof e.data !== 'string') text += new TextDecoder().decode(new Uint8Array(e.data)); };
    setTimeout(() => { try { ws.close(); } catch {} res(text); }, 1500);
  })`);
  ctx.assert.ok(snap.length > 0, 'the second attach was served a screen at all');
  ctx.assert.ok(!/peixmark/.test(snap), "the holder's screen was cleared too, so a re-attach stays clear");

  await type("printf 'sec%s\\n' ond");                   // and the shell is still there, prompt and all
  await ctx.waitFor(`[...document.querySelectorAll('#termBodyB .xterm-rows > div')].some(r => /^second$/.test(r.textContent.trim()))`, { what: 'the shell still answering after the clear' });
  return { snapChars: snap.length, screen: (await ctx.screen(1)).slice(-4) };
}
