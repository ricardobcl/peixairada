// The drawer's grid fits its body: after attach, after a display-scale change, and after a zoom step — no row
// clipped at the bottom, no column past the right edge (the 2026-09-20 geometry fixes, kept honest). And the PTY is this
// page's size again once it is back in front, after another page on the drawer sized it (2026-10-14).
import { waitFor } from '../../lib/testserver.mjs';

export const meta = { server: true, fake: true, fixture: 'auto' };

export default async function (ctx) {
  const chat = ctx.fixture.chats[1];

  await ctx.openChat(chat.id);
  await ctx.key('KeyC');
  await ctx.waitPrompt();
  await ctx.sleep(500);

  const fits = async label => {
    const term = await ctx.peix('term()');

    ctx.assert.ok(
      term.screen.w <= term.body.w + 0.5 && term.screen.h <= term.body.h + 0.5,
      `${label}: the screen (${term.screen.w}×${term.screen.h}) fits the body (${term.body.w}×${term.body.h})`,
    );

    ctx.assert.deepEqual(
      { cols: term.propose.cols, rows: term.propose.rows },
      { cols: term.cols, rows: term.rows },
      `${label}: fit would change nothing`,
    );

    // …and the glyphs keep to the grid (2026-10-20): the last of a rule the width of the screen ends where its row does —
    // a glyph's width read to a whole px over 32 drifted every column, and the last one past its row was clipped
    const rule = await ctx.evaluate(`(() => {
      const row = [...document.querySelectorAll('#termBody .xterm-rows > div')].find(r => /^─{20,}$/.test(r.textContent));
      if (!row) return null;
      const w = document.createTreeWalker(row, NodeFilter.SHOW_TEXT); let t, n; while ((n = w.nextNode())) t = n;
      const g = document.createRange(); g.setStart(t, t.length - 1); g.setEnd(t, t.length);
      return { cols: row.textContent.length, past: g.getBoundingClientRect().right - row.getBoundingClientRect().right };
    })()`);

    ctx.assert.ok(rule, `${label}: a rule across the screen`);

    ctx.assert.ok(
      Math.abs(rule.past) < 0.25,
      `${label}: the last of ${rule.cols} columns ends at its row's edge (${rule.past.toFixed(3)} px past it)`,
    );

    return { ...term, past: rule.past };
  };

  // The body must fill its half, strip or no strip: a hidden strip is display:none, and a half whose rows are not
  // placed by hand slides the body into the `auto` row, where it sizes itself to the terminal instead of the pane
  // — the drawer then keeps whatever height it was first drawn at, with black under it (2026-09-22).
  const fills = async label => {
    const heights = await ctx
      .evaluate(
        `JSON.stringify(['#grp', '#gbody', '#ptabs'].map(s => { const e = document.querySelector(s); return e.hidden ? 0 : Math.round(e.getBoundingClientRect().height); }))`,
      )
      .then(JSON.parse);

    ctx.assert.ok(
      Math.abs(heights[0] - heights[1] - heights[2]) <= 1,
      `${label}: the body (${heights[1]}) and the strip (${heights[2]}) fill the half (${heights[0]})`,
    );

    ctx.assert.ok(heights[1] > 400, `${label}: the body is the pane's height, not the terminal's (${heights[1]})`);
  };

  await fills('no strip');
  const attached = await fits('after attach');

  await ctx.send('Emulation.setDeviceMetricsOverride', {
    width: 1700,
    height: 1000,
    deviceScaleFactor: 2,
    mobile: false,
  });

  await ctx.sleep(1200);
  const scaled = await fits('at scale 2');

  await ctx.evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', metaKey: true, bubbles: true, cancelable: true }))`,
  );

  await ctx.sleep(1200);
  const zoomed = await fits('after ⌘+');

  ctx.assert.ok(zoomed.zoom > attached.zoom, 'the zoom step took');

  // The rows hold at every height (2026-10-29): xterm rounds its screen to whole CSS px and divides back, so at 2× an
  // odd device cell (16.5 px) read 16.51 at an odd row count, and a body that screen's height exactly held one row
  // fewer by the fit addon — and one more at the row fewer: a see-saw, a resize at every fit. The heights where that
  // happens for this cell, each fitted three times over.
  const cell = Math.round((zoomed.dpr * zoomed.screen.h) / zoomed.rows);
  const tricky = [];

  for (let rowCount = 30; rowCount < 64; rowCount++) {
    const bodyHeight = Math.round((rowCount * cell) / zoomed.dpr);

    if (Math.floor(bodyHeight / (bodyHeight / rowCount)) < rowCount) tricky.push({ n: rowCount, H: bodyHeight });
  }

  ctx.assert.ok(
    tricky.length > 1,
    `heights where a rounded row misleads the fit, for a ${cell} px cell at ${zoomed.dpr}× (${JSON.stringify(tricky)})`,
  );

  const bodyH = () => ctx.evaluate(`parseInt(getComputedStyle(document.querySelector('#termBody')).height)`);

  const tall = height =>
    ctx
      .send('Emulation.setDeviceMetricsOverride', { width: 1700, height, deviceScaleFactor: 2, mobile: false })
      .then(() => ctx.sleep(500));

  const seesaw = [];

  for (const { n: rowCount, H: bodyHeight } of tricky.slice(-2)) {
    let windowHeight = 1000 + bodyHeight - (await bodyH());

    await tall(windowHeight);
    windowHeight += bodyHeight - (await bodyH());
    await tall(windowHeight);
    ctx.assert.equal(await bodyH(), bodyHeight, `the body at ${bodyHeight} px`);
    const rows = [];

    for (let round = 0; round < 3; round++) {
      await ctx.evaluate(`window.dispatchEvent(new Event('focus'))`);
      await ctx.sleep(400);
      rows.push((await ctx.peix('term()')).rows);
    }

    seesaw.push({ H: bodyHeight, rows });

    ctx.assert.deepEqual(
      rows,
      [rowCount, rowCount, rowCount],
      `a ${bodyHeight} px body holds ${rowCount} rows, fit after fit (${rows.join(' → ')})`,
    );

    await fits(`at ${bodyHeight} px`);
  }

  await tall(1000);

  await ctx.evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', metaKey: true, bubbles: true, cancelable: true }))`,
  );

  await ctx.sleep(800);
  const unzoomed = await fits('after ⌘0');

  await fills('after ⌘0');

  // Another page on the same drawer sizes the PTY (a second window, a browser beside the app); this one, back in front,
  // says its size again (2026-10-14) — it kept quiet for good, its own last size unchanged, and drew a screen painted for another
  const id = (await ctx.peix('state()')).termId;

  const size = async () => {
    const term = (await ctx.server.terminals()).find(entry => entry.id === id);

    return `${term.cols}×${term.rows}`;
  };

  const other = new WebSocket(ctx.server.ws(`api/terminals/${id}/ws`));

  await new Promise(resolve => other.addEventListener('open', resolve, { once: true }));
  other.send(JSON.stringify({ t: 'resize', cols: 60, rows: 15 }));
  await waitFor(async () => (await size()) === '60×15', { what: "the other page's size on the PTY" });
  other.close();
  await ctx.evaluate(`window.dispatchEvent(new Event('focus'))`);

  await waitFor(async () => (await size()) === `${unzoomed.cols}×${unzoomed.rows}`, {
    what: `this page's size (${unzoomed.cols}×${unzoomed.rows}) back on the PTY once it is in front`,
    timeout: 5000,
  });

  return { attach: attached, scale2: scaled, zoomed, seesaw };
}
