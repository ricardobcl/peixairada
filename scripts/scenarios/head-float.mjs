// The floating header (2026-10-09, the design studies' E), a switch to compare with the plain one: on, the chat
// header is a rounded bar inset from the column's edges, the PR rows under it inset alike; the choice outlives a
// reload; off, the header runs edge to edge again.
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const [two] = ctx.fixture.chats, out = {};
  const head = () => ctx.evaluate(`JSON.stringify((() => { const h = document.querySelector('#shead'), c = document.querySelector('#chat').getBoundingClientRect(), r = h.getBoundingClientRect(), cs = getComputedStyle(h);
    return { attr: document.documentElement.dataset.head || null, radius: cs.borderTopLeftRadius, left: Math.round(r.left - c.left), right: Math.round(c.right - r.right), top: Math.round(r.top - c.top),
      chips: document.querySelectorAll('#shead .hpr:not(.more):not([hidden])').length, more: !!document.querySelector('#moreBtn') }; })())`).then(JSON.parse);
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelectorAll('#shead .hpr').length >= 2`, { what: 'the header with its PRs' });
  out.plain = await head();
  ctx.assert.deepEqual([out.plain.attr, out.plain.radius, out.plain.left, out.plain.top], [null, '0px', 0, 0], `plain: edge to edge (${JSON.stringify(out.plain)})`);

  await ctx.evaluate(`document.querySelector('#headFloat').click()`);
  await ctx.settle();
  out.float = await head();
  ctx.assert.deepEqual([out.float.attr, out.float.radius, out.float.left, out.float.right, out.float.top], ['float', '14px', 14, 14, 10], `floating: a rounded bar inset (${JSON.stringify(out.float)})`);
  ctx.assert.ok(out.float.chips >= 1 && out.float.more, 'its chips and ··· still in it');
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  await ctx.settle();
  out.rows = await ctx.evaluate(`(r => Math.round(r.left - document.querySelector('#chat').getBoundingClientRect().left))(document.querySelector('#prlist').getBoundingClientRect())`);
  ctx.assert.equal(out.rows, 14, 'the PR rows under it inset alike');
  await ctx.shot('float', { x: 380, y: 0, width: 1320, height: 140 });
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);

  await ctx.reload();
  await ctx.openChat(two.id);
  ctx.assert.equal((await head()).attr, 'float', 'the choice outlives a reload');
  await ctx.evaluate(`document.querySelector('#headFloat').click()`);
  await ctx.settle();
  out.off = await head();
  ctx.assert.deepEqual([out.off.attr, out.off.radius, out.off.left], [null, '0px', 0], 'off: edge to edge again');
  return out;
}
