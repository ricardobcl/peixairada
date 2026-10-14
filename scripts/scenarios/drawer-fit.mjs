// The drawer's grid fits its body: after attach, after a display-scale change, and after a zoom step — no row
// clipped at the bottom, no column past the right edge (the 2026-09-20 geometry fixes, kept honest). And the PTY is this
// page's size again once it is back in front, after another page on the drawer sized it (2026-10-14).
import { waitFor } from '../../lib/testserver.mjs';

export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  await ctx.openChat(chat.id);
  await ctx.key('KeyC'); await ctx.waitPrompt(); await ctx.sleep(500);
  const fits = async label => {
    const d = await ctx.peix('term()');
    ctx.assert.ok(d.screen.w <= d.body.w + 0.5 && d.screen.h <= d.body.h + 0.5, `${label}: the screen (${d.screen.w}×${d.screen.h}) fits the body (${d.body.w}×${d.body.h})`);
    ctx.assert.deepEqual({ cols: d.propose.cols, rows: d.propose.rows }, { cols: d.cols, rows: d.rows }, `${label}: fit would change nothing`);
    return d;
  };
  // The body must fill its half, strip or no strip: a hidden strip is display:none, and a half whose rows are not
  // placed by hand slides the body into the `auto` row, where it sizes itself to the terminal instead of the pane
  // — the drawer then keeps whatever height it was first drawn at, with black under it (2026-09-22).
  const fills = async label => {
    const g = await ctx.evaluate(`JSON.stringify(['#grp', '#gbody', '#ptabs'].map(s => { const e = document.querySelector(s); return e.hidden ? 0 : Math.round(e.getBoundingClientRect().height); }))`).then(JSON.parse);
    ctx.assert.ok(Math.abs(g[0] - g[1] - g[2]) <= 1, `${label}: the body (${g[1]}) and the strip (${g[2]}) fill the half (${g[0]})`);
    ctx.assert.ok(g[1] > 400, `${label}: the body is the pane's height, not the terminal's (${g[1]})`);
  };
  await fills('no strip');
  const a = await fits('after attach');
  await ctx.send('Emulation.setDeviceMetricsOverride', { width: 1700, height: 1000, deviceScaleFactor: 2, mobile: false }); await ctx.sleep(1200);
  const b = await fits('at scale 2');
  await ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', metaKey: true, bubbles: true, cancelable: true }))`); await ctx.sleep(1200);
  const c = await fits('after ⌘+');
  ctx.assert.ok(c.zoom > a.zoom, 'the zoom step took');
  await ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', metaKey: true, bubbles: true, cancelable: true }))`); await ctx.sleep(800);
  const z = await fits('after ⌘0');
  await fills('after ⌘0');
  // Another page on the same drawer sizes the PTY (a second window, a browser beside the app); this one, back in front,
  // says its size again (2026-10-14) — it kept quiet for good, its own last size unchanged, and drew a screen painted for another
  const id = (await ctx.peix('state()')).termId, size = async () => { const t = (await ctx.server.terminals()).find(t => t.id === id); return `${t.cols}×${t.rows}`; };
  const other = new WebSocket(`${ctx.server.url.replace(/^http/, 'ws')}api/terminals/${id}/ws`);
  await new Promise(r => other.addEventListener('open', r, { once: true }));
  other.send(JSON.stringify({ t: 'resize', cols: 60, rows: 15 }));
  await waitFor(async () => (await size()) === '60×15', { what: 'the other page\'s size on the PTY' });
  other.close();
  await ctx.evaluate(`window.dispatchEvent(new Event('focus'))`);
  await waitFor(async () => (await size()) === `${z.cols}×${z.rows}`, { what: `this page's size (${z.cols}×${z.rows}) back on the PTY once it is in front`, timeout: 5000 });
  return { attach: a, scale2: b, zoomed: c };
}
