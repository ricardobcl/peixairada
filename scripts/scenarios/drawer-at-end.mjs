// A drawer switched to comes up at its end (2026-10-29): in WebKit, a chat clicked open sometimes showed its drawer
// scrolled to the very top of its scrollback, and stuck there. The attach's reset shrinks xterm's scroll area, WebKit
// clamps the old scroll position to 0 and says so with a scroll event a frame later — after the snapshot has been
// parsed, before xterm has put its scrollbar back at the end — and xterm reads that 0 as a hand scrolling to the top.
// Chrome sends no such event, so it is made here: once the new snapshot is in and xterm has drawn it (two frames), the
// scroller is put at 0 and the browser says so with its own scroll event, as WebKit's comes. Each switch must end at
// the bottom, the prompt on screen, and new output followed; a scroll after the drawer has settled is the hand's, and
// stays.
export const meta = { server: true, fixture: 'auto', fake: true };

export default async function (ctx) {
  const [a, b] = ctx.fixture.chats, out = { switches: [] };
  for (const id of [a.id, b.id]) {
    await ctx.openChat(id);
    await ctx.key('KeyC');
    await ctx.waitPrompt(15000);
    for (let i = 0; i < 12; i++) { await ctx.type(`line ${i} of ${id.slice(0, 4)}\r`); await ctx.sleep(250); }
  }
  await ctx.sleep(1200); await ctx.settle();
  const VP = `document.querySelector('#termBody .xterm-viewport')`;
  const view = () => ctx.evaluate(`(() => { const v = ${VP}, rows = window.peix.screen(0);
    return { top: Math.round(v.scrollTop), max: v.scrollHeight - v.clientHeight, prompt: rows.some(r => /^❯/.test(r)), lines: window.peix.buffer().length }; })()`);
  for (const [label, to] of [['a', a], ['b', b], ['a again', a]]) {
    const term = await ctx.evaluate(`window.peix.session(${JSON.stringify(to.id)}).terminal.id`);
    // WebKit's late scroll event, once the new snapshot is parsed: the buffer is the new drawer's and long
    const stale = ctx.evaluate(`new Promise(done => { const t0 = performance.now();
      (function look() {
        const st = window.peix.state();
        if (st.termId === ${JSON.stringify(term)} && window.peix.buffer().length > window.peix.term(0).rows + 20) {
          return requestAnimationFrame(() => requestAnimationFrame(() => { ${VP}.scrollTop = 0; done(Math.round(performance.now() - t0)); }));
        }
        if (performance.now() - t0 > 3000) return done(null);
        setTimeout(look, 2);
      })(); })`);
    await ctx.evaluate(`document.querySelector('#slist > .card[data-id="${to.id}"] .title').click()`);
    const at = await stale;
    ctx.assert.ok(at !== null, `${label}: the snapshot came in`);
    await ctx.sleep(1500);
    const v = await view();
    out.switches.push({ label, staleAt: at, ...v });
    ctx.assert.ok(v.max > 0, `${label}: the drawer has scrollback to be at the top of (${v.max})`);
    ctx.assert.ok(v.max - v.top <= 2, `${label}: the drawer is at its end, not scrolled up (${v.top} of ${v.max})`);
    ctx.assert.ok(v.prompt, `${label}: the prompt is on screen`);
  }
  // still following: a new turn's lines land at the end and the view goes with them
  await ctx.type('one more\r'); await ctx.sleep(1200);
  const more = await view();
  ctx.assert.ok(more.max - more.top <= 2 && more.prompt, `new output followed (${more.top} of ${more.max})`);
  // a scroll once the drawer has settled is a hand's, and stays
  await ctx.evaluate(`(v => { v.scrollTop = 0; v.dispatchEvent(new Event('scroll')); })(${VP})`);
  await ctx.sleep(600);
  const hand = await view();
  ctx.assert.ok(hand.top < hand.max / 2 && !hand.prompt, `a scroll after it settled is kept (${hand.top} of ${hand.max})`);
  out.hand = hand;
  return out;
}
