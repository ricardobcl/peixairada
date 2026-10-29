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
    // …and the glyphs keep to the grid (2026-10-20): the last of a rule the width of the screen ends where its row does —
    // a glyph's width read to a whole px over 32 drifted every column, and the last one past its row was clipped
    const e = await ctx.evaluate(`(() => {
      const row = [...document.querySelectorAll('#termBody .xterm-rows > div')].find(r => /^─{20,}$/.test(r.textContent));
      if (!row) return null;
      const w = document.createTreeWalker(row, NodeFilter.SHOW_TEXT); let t, n; while ((n = w.nextNode())) t = n;
      const g = document.createRange(); g.setStart(t, t.length - 1); g.setEnd(t, t.length);
      return { cols: row.textContent.length, past: g.getBoundingClientRect().right - row.getBoundingClientRect().right };
    })()`);
    ctx.assert.ok(e, `${label}: a rule across the screen`);
    ctx.assert.ok(Math.abs(e.past) < 0.25, `${label}: the last of ${e.cols} columns ends at its row's edge (${e.past.toFixed(3)} px past it)`);
    return { ...d, past: e.past };
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
  // The rows hold at every height (2026-10-29): xterm rounds its screen to whole CSS px and divides back, so at 2× an
  // odd device cell (16.5 px) read 16.51 at an odd row count, and a body that screen's height exactly held one row
  // fewer by the fit addon — and one more at the row fewer: a see-saw, a resize at every fit. The heights where that
  // happens for this cell, each fitted three times over.
  const cell = Math.round(c.dpr * c.screen.h / c.rows), tricky = [];
  for (let n = 30; n < 64; n++) { const H = Math.round(n * cell / c.dpr); if (Math.floor(H / (H / n)) < n) tricky.push({ n, H }); }
  ctx.assert.ok(tricky.length > 1, `heights where a rounded row misleads the fit, for a ${cell} px cell at ${c.dpr}× (${JSON.stringify(tricky)})`);
  const bodyH = () => ctx.evaluate(`parseInt(getComputedStyle(document.querySelector('#termBody')).height)`);
  const tall = h => ctx.send('Emulation.setDeviceMetricsOverride', { width: 1700, height: h, deviceScaleFactor: 2, mobile: false }).then(() => ctx.sleep(500));
  const seesaw = [];
  for (const { n, H } of tricky.slice(-2)) {
    let h = 1000 + H - await bodyH(); await tall(h);
    h += H - await bodyH(); await tall(h);
    ctx.assert.equal(await bodyH(), H, `the body at ${H} px`);
    const rows = [];
    for (let i = 0; i < 3; i++) { await ctx.evaluate(`window.dispatchEvent(new Event('focus'))`); await ctx.sleep(400); rows.push((await ctx.peix('term()')).rows); }
    seesaw.push({ H, rows });
    ctx.assert.deepEqual(rows, [n, n, n], `a ${H} px body holds ${n} rows, fit after fit (${rows.join(' → ')})`);
    await fits(`at ${H} px`);
  }
  await tall(1000);
  await ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', metaKey: true, bubbles: true, cancelable: true }))`); await ctx.sleep(800);
  const z = await fits('after ⌘0');
  await fills('after ⌘0');
  // Another page on the same drawer sizes the PTY (a second window, a browser beside the app); this one, back in front,
  // says its size again (2026-10-14) — it kept quiet for good, its own last size unchanged, and drew a screen painted for another
  const id = (await ctx.peix('state()')).termId, size = async () => { const t = (await ctx.server.terminals()).find(t => t.id === id); return `${t.cols}×${t.rows}`; };
  const other = new WebSocket(ctx.server.ws(`api/terminals/${id}/ws`));
  await new Promise(r => other.addEventListener('open', r, { once: true }));
  other.send(JSON.stringify({ t: 'resize', cols: 60, rows: 15 }));
  await waitFor(async () => (await size()) === '60×15', { what: 'the other page\'s size on the PTY' });
  other.close();
  await ctx.evaluate(`window.dispatchEvent(new Event('focus'))`);
  await waitFor(async () => (await size()) === `${z.cols}×${z.rows}`, { what: `this page's size (${z.cols}×${z.rows}) back on the PTY once it is in front`, timeout: 5000 });
  return { attach: a, scale2: b, zoomed: c, seesaw };
}
