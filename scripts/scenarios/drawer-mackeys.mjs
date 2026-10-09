// The Mac's line-editing keys in the drawer (2026-10-09), as iTerm's Natural Text Editing preset sends them: xterm
// sends nothing for ⌘← / ⌘→ and a plain DEL for ⌘⌫, so the drawer sends the control codes Claude Code and zsh both
// read — ⌃A / ⌃E the line's start and end, ⌃U / ⌃K delete to them, ESC d the word ahead (⌥⌦). What reaches the
// holder is read off the drawer's socket. ⌥← keeps xterm's ESC b, a plain ← its own sequence, and ⌥⌘← stays the
// board's: nothing sent.
export const meta = { server: true, fake: true, fixture: 'auto' };

const KEYS = {   // key → [code, keyCode]
  ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39], Backspace: ['Backspace', 8], Delete: ['Delete', 46],
};

export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  await ctx.openChat(chat.id);
  await ctx.key('KeyC');                       // ⌥⌘C: resume it in the drawer
  await ctx.waitPrompt();
  // every keystroke the page sends its holder, from here on
  await ctx.evaluate(`(() => { window.__sent = []; const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) { try { const m = JSON.parse(d); if (m.t === 'in') window.__sent.push(m.d); } catch {} return send.call(this, d); }; })()`);
  const press = async (key, mods = {}) => {
    await ctx.evaluate(`window.__sent.length = 0`);
    const [code, keyCode] = KEYS[key];
    await ctx.evaluate(`(t => { const o = { key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)}, keyCode: ${keyCode}, bubbles: true, cancelable: true, ...${JSON.stringify(mods)} };
      t.dispatchEvent(new KeyboardEvent('keydown', o)); t.dispatchEvent(new KeyboardEvent('keyup', o)); })(document.querySelector('#termBody textarea'))`);
    await ctx.sleep(150);
    return ctx.evaluate(`window.__sent.join('')`);
  };

  const out = {
    cmdLeft: await press('ArrowLeft', { metaKey: true }),
    cmdRight: await press('ArrowRight', { metaKey: true }),
    cmdBackspace: await press('Backspace', { metaKey: true }),
    cmdDelete: await press('Delete', { metaKey: true }),
    altDelete: await press('Delete', { altKey: true }),
    altLeft: await press('ArrowLeft', { altKey: true }),
    altBackspace: await press('Backspace', { altKey: true }),
    left: await press('ArrowLeft'),
    shiftCmdLeft: await press('ArrowLeft', { metaKey: true, shiftKey: true }),
  };
  ctx.assert.equal(out.cmdLeft, '\x01', '⌘← is ⌃A, the line\'s start');
  ctx.assert.equal(out.cmdRight, '\x05', '⌘→ is ⌃E, its end');
  ctx.assert.equal(out.cmdBackspace, '\x15', '⌘⌫ is ⌃U, delete to the start');
  ctx.assert.equal(out.cmdDelete, '\x0b', '⌘⌦ is ⌃K, delete to the end');
  ctx.assert.equal(out.altDelete, '\x1bd', '⌥⌦ is ESC d, the word ahead');
  ctx.assert.equal(out.altLeft, '\x1bb', '⌥← still xterm\'s ESC b');
  ctx.assert.equal(out.altBackspace, '\x1b\x7f', '⌥⌫ still xterm\'s ESC DEL');
  ctx.assert.ok(out.left === '\x1b[D' || out.left === '\x1bOD', `a plain ← its own sequence: ${JSON.stringify(out.left)}`);
  ctx.assert.equal(out.shiftCmdLeft, '', '⇧⌘← is not one of them');

  // ⌥⌘← is the board's (the tab beside), and nothing of it reaches the holder
  await ctx.evaluate(`window.__sent.length = 0`);
  await ctx.evaluate(`document.querySelector('#termBody textarea')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, metaKey: true, altKey: true, bubbles: true, cancelable: true }))`);
  await ctx.sleep(150);
  out.altCmdLeft = await ctx.evaluate(`window.__sent.join('')`);
  ctx.assert.equal(out.altCmdLeft, '', '⌥⌘← sends nothing to claude');
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, JSON.stringify(v)]));
}
