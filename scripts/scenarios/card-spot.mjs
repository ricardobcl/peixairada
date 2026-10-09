// The glow under the pointer (2026-10-09): a round light of the card's colour follows the pointer over the card it is
// on — --mx / --my, the pointer's place in the card, written once a frame — and fades in and out with it (--spot); the
// edge's glow stays as at rest meanwhile, and a card the pointer is not on has no light. The switch in the settings
// turns it off — hover spreads the edge's glow across the card again — and the choice outlives a reload.
export const meta = { server: true, fixture: 'auto' };

const at = i => `document.querySelectorAll('#slist > .card')[${i}]`;
const look = (ctx, i) => ctx.evaluate(`JSON.stringify((c => { const cs = getComputedStyle(c);
  return { mx: c.style.getPropertyValue('--mx'), my: c.style.getPropertyValue('--my'), spot: cs.getPropertyValue('--spot'), tint: cs.getPropertyValue('--tint'),
    radial: (cs.backgroundImage.match(/radial-gradient\\([^)]*\\)/) || [''])[0] }; })(${at(i)}))`).then(JSON.parse);
const rect = (ctx, i) => ctx.evaluate(`JSON.stringify((b => ({ x: b.x, y: b.y, w: b.width, h: b.height }))(${at(i)}.getBoundingClientRect()))`).then(JSON.parse);
const point = async (ctx, r, fx, fy) => {
  const x = Math.round(r.x + r.w * fx), y = Math.round(r.y + r.h * fy);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  return { x: x - Math.round(r.x), y: y - Math.round(r.y) };
};

export default async function (ctx) {
  const out = {};
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 2`, { what: 'the two chats' });
  await ctx.settle();
  ctx.assert.equal(await ctx.evaluate(`'spot' in document.documentElement.dataset`), true, 'on by default');
  const r = await rect(ctx, 0);

  // ---- the light where the pointer is, and only on its card ----
  const p1 = await point(ctx, r, .25, .4);
  await ctx.waitFor(`(c => c.style.getPropertyValue('--mx') === '${p1.x}px' && getComputedStyle(c).getPropertyValue('--spot') === '55%')(${at(0)})`, { what: 'the light at the pointer, faded in' });
  out.first = await look(ctx, 0);
  ctx.assert.equal(out.first.my, `${p1.y}px`, 'at the pointer\'s height in the card');
  ctx.assert.match(out.first.radial, new RegExp(`at ${p1.x}px ${p1.y}px`), `the card's background lights there: ${out.first.radial}`);
  ctx.assert.equal(out.first.tint, '50%', 'the edge\'s glow as at rest');
  out.other = await look(ctx, 1);
  ctx.assert.equal(out.other.spot, '0%', 'no light on a card the pointer is not on');

  const p2 = await point(ctx, r, .8, .7);
  await ctx.waitFor(`${at(0)}.style.getPropertyValue('--mx') === '${p2.x}px'`, { what: 'the light following the pointer' });
  out.second = await look(ctx, 0);
  ctx.assert.equal(out.second.my, `${p2.y}px`, 'down with the pointer');
  await ctx.shot('follows', { x: 0, y: Math.max(0, Math.round(r.y) - 20), width: 400, height: Math.round(r.h) + 40 });

  // ---- the pointer gone: the light fades where it stood ----
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1000, y: 500 });
  await ctx.waitFor(`getComputedStyle(${at(0)}).getPropertyValue('--spot') === '0%'`, { what: 'the light faded out' });
  out.left = await look(ctx, 0);
  ctx.assert.equal(out.left.mx, `${p2.x}px`, 'where the pointer left it');

  // ---- the switch off: hover spreads the edge's glow again, and stays off over a reload ----
  await ctx.evaluate(`document.querySelector('#cardSpot').click()`);
  ctx.assert.equal(await ctx.evaluate(`'spot' in document.documentElement.dataset`), false, 'off');
  await ctx.reload();
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 2`, { what: 'the two chats again' });
  await ctx.settle();
  ctx.assert.equal(await ctx.evaluate(`!document.querySelector('#cardSpot').checked && !('spot' in document.documentElement.dataset)`), true, 'the choice outlives a reload');
  const r2 = await rect(ctx, 0);
  await point(ctx, r2, .5, .5);
  await ctx.waitFor(`getComputedStyle(${at(0)}).getPropertyValue('--tint') === '60%'`, { what: 'hover\'s glow spread across the card' });
  out.off = await look(ctx, 0);
  ctx.assert.equal(out.off.spot, '0%', 'no light under the pointer');
  return out;
}
