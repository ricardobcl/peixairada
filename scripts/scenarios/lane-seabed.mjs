// The seabed (2026-11-01, round XIX's W2; a switch, off by default): the lane's floor is your day. What this checks: off, no
// canvas and no asking of the day; on, the columns come from /api/today's spans (height how many at work, a chat counted once
// a column, red along the top where one waited), the first turn at its left; the hover says the hour; nothing animates and
// it draws once a minute at most; off, it goes.
export const meta = { server: true, fixture: 'auto' };

const DAY = `(() => { const real = window.fetch, day = new Date(); day.setHours(0, 0, 0, 0); const at = (h, m = 0) => new Date(day.getTime() + h * 3600e3 + m * 60e3).toISOString();
  window.__todayAsks = 0;
  window.fetch = (u, o) => { if (!String(u).includes('/api/today')) return real(u, o); window.__todayAsks++;
    return Promise.resolve(new Response(JSON.stringify({ chats: [
      { id: 'a', title: 'a', project: 'p', worked: 0, waited: 0, questions: 0, last: 0, spans: [{ k: 'w', from: at(9), to: at(9, 30) }, { k: 'w', from: at(9, 2), to: at(9, 4) }, { k: 'a', from: at(9, 30), to: at(9, 40) }] },
      { id: 'b', title: 'b', project: 'p', worked: 0, waited: 0, questions: 0, last: 0, spans: [{ k: 'w', from: at(9, 10), to: at(9, 20) }] } ], totals: { worked: 0, waited: 0, questions: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } })); }; })()`;

export default async function (ctx) {
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: DAY });
  await ctx.reload();
  await ctx.sleep(300);
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#sbSwim canvas.bed')`), null, 'off by default');
  await ctx.evaluate(`document.querySelector('#laneBed').click()`);
  await ctx.waitFor(`window.peix.motion().some(m => m.kind === 'bed:draw')`, { what: 'the seabed drawn' });
  // read the canvas: columns by time, nine o'clock at its left
  const look = await ctx.evaluate(`JSON.stringify((() => {
    const c = document.querySelector('#sbSwim canvas.bed'), x = c.getContext('2d'), w = c.width, h = c.height, cols = 96;   // 8 h of 5 min
    const at = (mins, top) => { const px = Math.floor((mins / 5 + .5) / cols * w); const d = x.getImageData(px, top ? 0 : h - 2, 1, 1).data; return d[3] > 0; };
    const tall = mins => { const px = Math.floor((mins / 5 + .5) / cols * w); let n = 0; for (let y = h - 1; y > 2; y--) if (x.getImageData(px, y, 1, 1).data[3] > 0) n++; return Math.round(n / (devicePixelRatio || 1)); };
    return { w, z: getComputedStyle(c).zIndex, floorAt0: at(0), floorAt35: at(35), floorAt200: at(200), redAt35: at(35, true), redAt5: at(5, true), one: tall(5), two: tall(12), anims: c.getAnimations().length };
  })())`).then(JSON.parse);
  ctx.assert.deepEqual([look.floorAt0, look.floorAt200], [true, false], 'the floor where a chat worked, none where none did');
  ctx.assert.deepEqual([look.redAt35, look.redAt5], [true, false], 'red along the top where one waited');
  ctx.assert.ok(look.two > look.one, `two chats at work stand taller than one, its own overlapping spans counted once: ${look.one} and ${look.two}`);
  ctx.assert.equal(look.anims, 0, 'it does not move');
  // once a minute at most, however often the bar draws
  const asks = await ctx.evaluate(`window.__todayAsks`);
  await ctx.evaluate(`(async () => { for (let i = 0; i < 5; i++) { document.querySelector('#laneBed').dispatchEvent(new Event('noop')); window.dispatchEvent(new Event('resize')); await new Promise(r => setTimeout(r, 40)); } })()`);
  ctx.assert.equal(await ctx.evaluate(`window.__todayAsks`), asks, 'the day not asked again');
  // the hover says the hour
  const r = await ctx.evaluate(`(r => ({ x: r.left + r.width * (10.5 / 96), y: r.top + r.height / 2 }))(document.querySelector('#sbSwim').getBoundingClientRect())`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await ctx.waitFor(`/^09:\\d\\d: \\d at work/.test(document.querySelector('#sbSwim').title)`, { what: 'the hour in the tooltip' });
  await ctx.evaluate(`document.querySelector('#laneBed').click()`);
  await ctx.waitFor(`!document.querySelector('#sbSwim canvas.bed')`, { what: 'the canvas gone' });
  return look;
}
