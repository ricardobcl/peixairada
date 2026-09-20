// The drawer's grid fits its body: after attach, after a display-scale change, and after a zoom step — no row
// clipped at the bottom, no column past the right edge (the 2026-09-20 geometry fixes, kept honest).
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  await ctx.openChat(chat.id);
  await ctx.key('KeyT'); await ctx.waitPrompt(); await ctx.sleep(500);
  const fits = async label => {
    const d = await ctx.peix('term()');
    ctx.assert.ok(d.screen.w <= d.body.w + 0.5 && d.screen.h <= d.body.h + 0.5, `${label}: the screen (${d.screen.w}×${d.screen.h}) fits the body (${d.body.w}×${d.body.h})`);
    ctx.assert.deepEqual({ cols: d.propose.cols, rows: d.propose.rows }, { cols: d.cols, rows: d.rows }, `${label}: fit would change nothing`);
    return d;
  };
  const a = await fits('after attach');
  await ctx.send('Emulation.setDeviceMetricsOverride', { width: 1700, height: 1000, deviceScaleFactor: 2, mobile: false }); await ctx.sleep(1200);
  const b = await fits('at scale 2');
  await ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', metaKey: true, bubbles: true, cancelable: true }))`); await ctx.sleep(1200);
  const c = await fits('after ⌘+');
  ctx.assert.ok(c.zoom > a.zoom, 'the zoom step took');
  await ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', metaKey: true, bubbles: true, cancelable: true }))`); await ctx.sleep(800);
  await fits('after ⌘0');
  return { attach: a, scale2: b, zoomed: c };
}
