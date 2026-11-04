// About's Copy details from the real shell (2026-11-04): its word on the window, the views where they really are, and the
// clipboard left alone. A report used to be a commit hash, and whether it was a normal window was a guess.
export const meta = {};
export default async function (ctx) {
  const [, plain] = ctx.fixture.chats;
  await ctx.board();
  await ctx.openChat(plain.id);
  await ctx.link(ctx.solid('ff00ff'));
  await ctx.until(`peix.state().paneVisible === true`, 'a page up');
  // Never this Mac's clipboard: the click below is a real one's path, as far as the system.
  await ctx.js(`window.__clip = []; navigator.clipboard.writeText = t => { window.__clip.push(t); return Promise.resolve(); }; document.execCommand = () => false; return true`);
  const about = async () => {
    await ctx.js(`document.querySelector('#sbar .conn').click(); return true`);
    await ctx.until(`document.querySelector('#about').open && /^window: /m.test(peix.details())`, 'About, and the shell\'s word');
    return ctx.js(`return peix.details()`);
  };
  const close = () => ctx.js(`document.querySelector('#about').close(); return true`);
  const inWindow = await about();
  ctx.assert.ok(Object.values((await ctx.win()).panes).every(p => !p.up), 'About over the page, not under it: a dialog up lowers the pane');
  ctx.log(`\n${inWindow}`);
  const w = await ctx.win();
  ctx.assert.match(inWindow, /^macOS: .*\d/m, 'which macOS');
  ctx.assert.match(inWindow, new RegExp(`^window: a normal window, ${w.w}×${w.h}, the page ${w.inset} pt down, zoom 1$`, 'm'), 'its shape');
  ctx.assert.match(inWindow, /^column: side by side · tabs chat \| gh · the keys in half 2$/m, 'the column, a page by its kind');
  const place = Object.values(w.panes)[0], body = /^half 2 in the page's px: strip (\d+)–(\d+), body (\d+)–(\d+), from x (\d+)$/m.exec(inWindow), view = /^pages' views in the window's pt: (\d+)×(\d+) at (\d+),(\d+)$/m.exec(inWindow);
  ctx.assert.ok(body && view, 'the half in the page\'s terms, the view in the window\'s');
  ctx.assert.deepEqual(view.slice(1).map(Number), [place.w, place.h, place.x, place.y], 'the view where it is, the dialog\'s hiding it notwithstanding');
  ctx.assert.equal(Number(view[4]) - Number(body[3]), w.inset, 'the page\'s px and the window\'s points apart by the inset: what a report of this bug would have shown');
  for (const word of ['127.0.0.1', '/Users', '/private', '/var/', 'Plain chat', 'solid']) ctx.assert.ok(!inWindow.includes(word), `no address, path or chat: ${word}`);

  // A click: the text in sight, and handed to the clipboard.
  await ctx.js(`document.querySelector('#aboutCopy').click(); return true`);
  await ctx.until(`document.querySelector('#aboutCopy').textContent === 'Copied'`, 'the button says so');
  ctx.assert.equal(await ctx.js(`return window.__clip[0]`), inWindow, 'that text went');
  ctx.assert.equal(await ctx.js(`return document.querySelector('#aboutDetails').hidden ? '' : document.querySelector('#aboutDetails').textContent`), inWindow, 'and is in sight');
  await ctx.settle();
  const pic = await ctx.shot('about');
  await close();

  // The fill says so.
  await ctx.full();
  const filled = await about();
  ctx.assert.match(filled, /^window: the fill, /m, 'the fill');
  ctx.assert.match(filled, /, the page 0 pt down, /, 'no title bar over it');
  await close();
  await ctx.full();
  return { pic };
}
