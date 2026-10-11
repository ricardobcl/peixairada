// The small motions of 2026-10-11 (the third studies, 1–28), one section each, on the auto fixture's two chats. What
// is checked is what each one promises a hand would see: a press dips, a count rolls, a moment plays once — read off
// computed styles and the page's own motion log, since a 200 ms move is over before a screenshot would catch it.
export const meta = { server: true, fixture: 'auto' };

const at = sel => `(r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }))(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`;

export default async function (ctx) {
  const out = {};
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 2`, { what: 'the fixture\'s two chats' });
  await ctx.settle();
  const mouse = (type, p) => ctx.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });

  // ---- 2 · a press dips: the card to 99 %, a control to 97 %, and a press on a control inside a card dips the control alone.
  // Let go off it, so nothing is clicked. ----
  const press = async (sel, read) => {
    await ctx.settle();   // a draw between the press and the read replaces the node, and the new one is not :active
    const p = await ctx.evaluate(at(sel));
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await mouse('mousePressed', p);
    // held: read until the dip has settled — two reads alike, 80 ms apart (a page out of sight runs late)
    let seen = null;
    for (let i = 0, last; i < 12; i++) { await ctx.sleep(80); const v = JSON.stringify(await ctx.evaluate(read)); if (v === last) { seen = JSON.parse(v); break; } last = v; }
    // let go somewhere else, so the press is not a click (a ✓ would tick the chat, a chip would filter the list) — out in
    // the chat column: the list's left edge calls the timeline out, which then lies over the cards
    const off = { x: 1000, y: 500 };
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: off.x, y: off.y, buttons: 1 });
    await mouse('mouseReleased', off); await ctx.sleep(400);
    return seen;
  };
  // what a held element's scale comes to: its transitions run to their end first — a page out of sight draws no frames
  // for a while, and a transition then stands at its start however long the press is held
  const held = sel => `(e => { e.getAnimations().forEach(a => { try { a.finish(); } catch {} }); return getComputedStyle(e).scale; })(document.querySelector(${JSON.stringify(sel)}))`;
  out.press = {
    card: await press('#slist > .card:nth-of-type(2) .title', held('#slist > .card:nth-of-type(2)')),
    chip: await press('.fchip', held('.fchip')),
    tick: await press('#slist > .card:nth-of-type(2) .top .act', `[${held('#slist > .card:nth-of-type(2)')}, ${held('#slist > .card:nth-of-type(2) .top .act')}]`),
    after: await ctx.evaluate(held('.fchip')),
  };
  ctx.assert.equal(out.press.card, '0.99', 'a card held down dips to 99 %');
  ctx.assert.equal(out.press.chip, '0.97', 'a chip held down dips to 97 %');
  ctx.assert.deepEqual(out.press.tick, ['none', '0.97'], 'the ✓ dips, the card under it does not');
  ctx.assert.equal(out.press.after, 'none', 'and springs back on release');
  return out;
}
