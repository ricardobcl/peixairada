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

  // ---- 3 · a count rolls: tick a chat done and the Ready lane's count, the chips' and the Done count slide to their
  // new value, then read as plain numbers again ----
  const [one, two] = ctx.fixture.chats;
  await ctx.server.post(`api/sessions/${two.id}/done`, { done: true });
  await ctx.waitFor(`window.peix.motion().some(m => m.kind === 'roll' && m.id === 'lane:ready')`, { what: 'the Ready lane\'s count to roll' });
  out.rolling = await ctx.evaluate(`[...document.querySelectorAll('.rn.rolling')].map(e => e.dataset.rk + ':' + e.querySelectorAll('.rcol').length)`);
  ctx.assert.ok(out.rolling.some(r => r.startsWith('lane:ready:')), 'the lane\'s count is a strip of digits while it rolls');
  await ctx.waitFor(`!document.querySelector('.rn.rolling')`, { what: 'the counts landed, plain text again' });
  await ctx.settle();
  out.rolled = await ctx.evaluate(`({ lane: document.querySelector('.gsep.lane.ready b')?.textContent, chips: [...document.querySelectorAll('.fchip .n')].map(n => n.textContent), left: document.querySelectorAll('.rn.rolling').length, rolls: window.peix.motion().filter(m => m.kind === 'roll').map(m => m.id) })`);
  ctx.assert.equal(out.rolled.lane, '1', 'the Ready lane counts one, as text');
  ctx.assert.equal(out.rolled.left, 0, 'nothing is left rolling');
  ctx.assert.ok(out.rolled.rolls.includes('chip:ready') && out.rolled.rolls.includes('chip:done'), 'the chips rolled too');
  await ctx.server.post(`api/sessions/${two.id}/done`, { done: false });
  await ctx.waitFor(`document.querySelector('.gsep.lane.ready b')?.textContent === '2'`, { what: 'both ready again' });
  await ctx.settle();

  // ---- 4 · a tick is felt: the ✓ fills and draws its stroke, and only then is the server told — the card goes to the
  // done ones and the Done count rolls on ----
  const card2 = `document.querySelector('#slist > .card[data-id="${two.id}"]')`;
  await ctx.evaluate(`${card2}.querySelector('.act[data-act="done"]').click()`);
  out.tick = await ctx.evaluate(`({ mark: !!${card2}.querySelector('.act.tk .tk'), done: ${card2}.classList.contains('done'), drawing: ${card2}.querySelector('.act.tk path').getAnimations().map(a => a.animationName) })`);
  ctx.assert.deepEqual(out.tick, { mark: true, done: false, drawing: ['tkdraw'] }, 'the ✓ draws itself before the card is done');
  await ctx.waitFor(`${card2}?.classList.contains('done')`, { what: 'the card ticked done once the stroke is drawn' });
  await ctx.settle();
  out.ticked = await ctx.evaluate(`({ done: document.querySelector('.gsep.lane.done b')?.textContent, rolled: window.peix.motion().filter(m => m.kind === 'roll').map(m => m.id).slice(-3) })`);
  ctx.assert.equal(out.ticked.done, '1', 'the Done lane counts it');
  await ctx.server.post(`api/sessions/${two.id}/done`, { done: false });
  await ctx.waitFor(`document.querySelector('.gsep.lane.ready b')?.textContent === '2'`, { what: 'both ready again' });
  await ctx.settle();
  return out;
}
