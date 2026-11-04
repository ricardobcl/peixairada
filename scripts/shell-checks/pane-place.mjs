// A page in the pane under its strip and down to its half's foot, by the window's pixels (2026-11-04), in the real shell.
// It sat 32 pt too high in a normal window for six weeks: the page right in its own coordinates (Chrome's scenarios), the
// overlay right in the window's, and the title bar's inset between them, which only the app has. So every way a page's
// place crosses the bridge: a window, the fill and back; a window resized; the board zoomed (the rects × the zoom); side
// by side and one over the other; a page in each half and one alone. And every way a page gets there: a link, a page's
// new window, the editor's (2026-10-21: it followed in the editor's own view, which has no strip).
import { paintStrips, placer } from '../../lib/paneplace.mjs';

export const meta = {};
const MAGENTA = 'ff00ff', GREEN = '00ff00', BLUE = '0000ff';
export default async function (ctx) {
  const [two, plain] = ctx.fixture.chats, seen = {}, placed = placer(ctx);
  // Each look a window, the fill, a window again: only two of them have a title bar over the page.
  const everyWay = async (label, ...pages) => {
    for (const [word, turn] of [['a window', false], ['the fill', true], ['a window again', true]]) {
      if (turn) await ctx.full();
      for (const [url, hex] of pages) seen[`${label}, ${word}`] = await placed(`${label}, ${word}`, url, hex);
    }
    const w = await ctx.win();
    ctx.assert.ok(w.titled && !w.fill, 'back to a normal window');
  };
  await ctx.board();
  await paintStrips(ctx);
  await ctx.openChat(plain.id);
  const one = ctx.solid(MAGENTA);
  await ctx.link(one);
  const first = await ctx.win();
  ctx.assert.ok(first.titled, 'it starts as a normal window');
  await everyWay('side by side', [one, MAGENTA]);
  await ctx.full();
  ctx.assert.equal((await ctx.win()).inset, 0, 'the fill has no title bar to go under');
  await ctx.full();
  ctx.assert.equal((await ctx.win()).inset, seen['side by side, a window'].pageStarts, 'the overlay starts where WebKit put the page');

  // The window dragged smaller, and back.
  const { w, h } = await ctx.win();
  await ctx.size(1100, 700);
  await placed('a smaller window', one, MAGENTA);
  await ctx.size(w, h);
  await placed('the size it was', one, MAGENTA);

  // The rects are the page's CSS px × the zoom.
  await ctx.zoom(1.25);
  await everyWay('at 125 %', [one, MAGENTA]);
  await ctx.zoom(1);

  // ⌥⌘2 turns the split one over the other, ⌘2 back.
  await ctx.key('Digit2');
  await ctx.until(`peix.state().stacked === true`, 'one half over the other');
  await everyWay('one over the other', [one, MAGENTA]);
  await ctx.key('Digit2', 'cmd');
  await ctx.until(`peix.state().stacked === false`, 'side by side again');

  // A page's new window is a tab beside it, under the same strip.
  const next = ctx.solid(GREEN);
  await ctx.page((await ctx.halfOf(one)).key, `window.open(${JSON.stringify(next)}); return true`);
  await placed('a page\'s new window', next, GREEN);
  ctx.assert.equal((await ctx.js(`return peix.state().tabs`)).filter(k => /^gh\d*:/.test(k)).length, 2, 'two pages, on two tabs');

  // A page in each half: the one behind dragged across, as a hand does.
  await ctx.js(`const k = ${JSON.stringify('gh:' + one)}, b = document.querySelector('#ptabsB .ptab[data-tab="' + k + '"]'), r = document.querySelector('#gbody').getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y })); window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y })); return true`);
  await ctx.until(`peix.state().halves[0]?.endsWith(${JSON.stringify(one)})`, 'the page dragged into the left half');
  await everyWay('a page in each half', [one, MAGENTA], [next, GREEN]);

  // A dialog up lowers the pane; its close brings it back where it was.
  await ctx.key('Comma', 'cmd');
  await ctx.until(`document.querySelector('#settings').open`, 'the settings up');
  const low = await ctx.win();
  ctx.assert.ok(Object.values(low.panes).every(p => !p.up), 'no page over a dialog');
  await ctx.js(`document.querySelector('#settings').close(); return true`);
  await placed('a dialog gone', one, MAGENTA);

  // The editor's new window (2026-10-21): the editor alone on the right has no strip, so a page followed in its view had
  // no address and no way back. It is a tab beside the editor, and the strip comes back with it.
  await ctx.openChat(two.id);
  await ctx.key('KeyE');
  const ide = await ctx.until(`peix.state().halves.find(k => (k || '').startsWith('ide:'))`, 'the editor on a tab', 20_000);
  ctx.assert.equal(await ctx.js(`return document.querySelector(${JSON.stringify('#ptabsB')}).classList.contains('lone')`), true, 'the editor alone has no strip');
  const fromEditor = ctx.solid(BLUE);
  await ctx.page(ide, `window.open(${JSON.stringify(fromEditor)}); return true`);
  await everyWay('the editor\'s new window', [fromEditor, BLUE]);
  ctx.assert.equal(await ctx.page(ide, 'return location.port'), new URL(ide.slice(4)).port, 'the editor\'s own view is still the editor');

  // A page alone, the column whole: ⌘0 from its half.
  await ctx.key('Digit0', 'cmd');
  await ctx.until(`peix.state().split === false`, 'one half');
  await everyWay('a page alone', [fromEditor, BLUE]);

  const last = await ctx.win();
  ctx.assert.equal(last.active, false, 'never in front, all the way through');
  return { steps: Object.keys(seen).length, window: seen['side by side, a window'], fill: seen['side by side, the fill'], zoomed: seen['at 125 %, a window'] };
}
