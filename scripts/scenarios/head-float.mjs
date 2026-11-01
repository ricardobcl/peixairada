// The floating header (2026-10-09, the design studies' E; the only header since 2026-10-14), in the sidebar a toolbar
// (2026-10-30; the one layout since 2026-11-01 — the rounded bar inset from the tile's edges, and its dip round the
// camera housing, were the tiles'): flush with the column's top and sides, the PR rows under it alike. And it floats
// (2026-10-11, late morning): the transcript runs up behind it to the column's top, its words starting under it and
// faint over that height — under the PR rows too when they are open. (At the notch: notch.mjs, sidebar-layout.mjs.)
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const [two] = ctx.fixture.chats, out = {};
  const head = () => ctx.evaluate(`JSON.stringify((() => { const h = document.querySelector('#shead'), ch = document.querySelector('#chat'), c = ch.getBoundingClientRect(), r = h.getBoundingClientRect(), cs = getComputedStyle(h), bw = ch.clientLeft;   // inside the tile's border
    return { attr: document.documentElement.dataset.head || null, radius: cs.borderTopLeftRadius, left: Math.round(r.left - c.left - bw), right: Math.round(c.right - r.right - bw), top: Math.round(r.top - c.top - bw),
      chips: document.querySelectorAll('#shead .hpr:not(.more):not([hidden])').length, more: !!document.querySelector('#moreBtn') }; })())`).then(JSON.parse);
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelectorAll('#shead .hpr').length >= 2`, { what: 'the header with its PRs' });
  await ctx.settle();
  out.float = await head();
  ctx.assert.deepEqual([out.float.attr, out.float.radius, out.float.left, out.float.right, out.float.top], ['float', '0px', 0, 0, 0], `the toolbar, flush (${JSON.stringify(out.float)})`);
  ctx.assert.ok(out.float.chips >= 1 && out.float.more, 'its chips and ··· still in it');
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  await ctx.settle();
  out.rows = await ctx.evaluate(`(r => Math.round(r.left - document.querySelector('#chat').getBoundingClientRect().left - document.querySelector('#chat').clientLeft))(document.querySelector('#prlist').getBoundingClientRect())`);
  ctx.assert.equal(out.rows, 0, 'the PR rows under it flush alike');
  await ctx.shot('float', { x: 380, y: 0, width: 1320, height: 140 });
  const behind = () => ctx.evaluate(`JSON.stringify((() => { const g = document.querySelector('#groups').getBoundingClientRect(), log = document.querySelector('#log'), l = log.getBoundingClientRect(),
    under = Math.max(...['#shead', '#prlist'].map(id => document.querySelector(id)).filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect().bottom)),
    first = log.querySelector(':scope > .msg, :scope > .sysline').getBoundingClientRect().top;
    return { logTop: Math.round(l.top - g.top), fh: getComputedStyle(document.querySelector('#chat')).getPropertyValue('--float-h'), under: Math.round(under - g.top), gap: Math.round(first - under), mask: getComputedStyle(log).maskImage.slice(0, 40) }; })())`).then(JSON.parse);
  out.behindRows = await behind();
  ctx.assert.equal(out.behindRows.logTop, 0, `the transcript runs up to the column's top: ${JSON.stringify(out.behindRows)}`);
  ctx.assert.equal(out.behindRows.fh, `${out.behindRows.under}px`, 'its rows\' height, the PR rows in it (flush: the tiles\' 4 px under them went with them)');
  ctx.assert.ok(out.behindRows.gap > 0, 'the first words start under the PR rows');
  ctx.assert.match(out.behindRows.mask, /^linear-gradient/, 'and fade over that height');
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  await ctx.waitFor(`getComputedStyle(document.querySelector('#chat')).getPropertyValue('--float-h') !== '${out.behindRows.fh}'`, { what: 'the rows\' height without the PR rows' });
  await ctx.settle();
  out.behind = await behind();
  ctx.assert.equal(out.behind.fh, `${out.behind.under}px`, 'the PR rows folded: the header alone');
  ctx.assert.ok(out.behind.under < out.behindRows.under && Math.abs(out.behind.gap - out.behindRows.gap) <= 1, `the words move up with it, a pixel of rounding either way: ${JSON.stringify([out.behind, out.behindRows])}`);

  return out;
}
