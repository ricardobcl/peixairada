// The floating header (2026-10-09, the design studies' E; the only header since 2026-10-14): the chat header is a
// rounded bar inset from the column's edges, the PR rows under it inset alike. And it floats (2026-10-11, late
// morning): the transcript runs up behind it to the column's top, its words starting under it and faint over that
// height — under the PR rows too when they are open; at the notch its top edge dips round the camera housing, the
// header keeping its place — bending into the tile's own line round the housing and following it, no second line under
// it (2026-10-11, afternoon).
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
  ctx.assert.deepEqual([out.float.attr, out.float.radius, out.float.left, out.float.right, out.float.top], ['float', '14px', 14, 14, 10], `floating: a rounded bar inset (${JSON.stringify(out.float)})`);
  ctx.assert.ok(out.float.chips >= 1 && out.float.more, 'its chips and ··· still in it');
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  await ctx.settle();
  out.rows = await ctx.evaluate(`(r => Math.round(r.left - document.querySelector('#chat').getBoundingClientRect().left - document.querySelector('#chat').clientLeft))(document.querySelector('#prlist').getBoundingClientRect())`);
  ctx.assert.equal(out.rows, 14, 'the PR rows under it inset alike');
  await ctx.shot('float', { x: 380, y: 0, width: 1320, height: 140 });
  const behind = () => ctx.evaluate(`JSON.stringify((() => { const g = document.querySelector('#groups').getBoundingClientRect(), log = document.querySelector('#log'), l = log.getBoundingClientRect(),
    under = Math.max(...['#shead', '#prlist'].map(id => document.querySelector(id)).filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect().bottom)),
    first = log.querySelector(':scope > .msg, :scope > .sysline').getBoundingClientRect().top;
    return { logTop: Math.round(l.top - g.top), fh: getComputedStyle(document.querySelector('#chat')).getPropertyValue('--float-h'), under: Math.round(under - g.top), gap: Math.round(first - under), mask: getComputedStyle(log).maskImage.slice(0, 40) }; })())`).then(JSON.parse);
  out.behindRows = await behind();
  ctx.assert.equal(out.behindRows.logTop, 0, `the transcript runs up to the column's top: ${JSON.stringify(out.behindRows)}`);
  ctx.assert.equal(out.behindRows.fh, `${out.behindRows.under + 4}px`, 'its rows\' height, the PR rows in it');
  ctx.assert.ok(out.behindRows.gap > 0, 'the first words start under the PR rows');
  ctx.assert.match(out.behindRows.mask, /^linear-gradient/, 'and fade over that height');
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  await ctx.waitFor(`getComputedStyle(document.querySelector('#chat')).getPropertyValue('--float-h') !== '${out.behindRows.fh}'`, { what: 'the rows\' height without the PR rows' });
  await ctx.settle();
  out.behind = await behind();
  ctx.assert.equal(out.behind.fh, `${out.behind.under + 4}px`, 'the PR rows folded: the header alone');
  ctx.assert.ok(out.behind.under < out.behindRows.under && out.behind.gap === out.behindRows.gap, `the words move up with it: ${JSON.stringify([out.behind, out.behindRows])}`);

  // at the notch: the top edge dips round the housing, the header where it was
  const N = await ctx.evaluate(`(r => ({ top: 32, left: Math.round(r.left + r.width / 2 - 92.5), right: Math.round(r.left + r.width / 2 + 92.5) }))(document.querySelector('#chat').getBoundingClientRect())`);
  await ctx.evaluate(`window.peixFill(true, ${JSON.stringify(N)})`);
  await ctx.waitFor(`!!document.querySelector('#chat > .hcut')`, { what: 'the dip round the housing' });
  await ctx.settle();
  // the dip is the tile's line: the header reaches up under it — a pixel past its outer edge, at the bottom and beside
  // the housing — and its own border is only the two bends into it
  await ctx.waitFor(`!!document.querySelector('#chat.ncutp > .ncut') && /M[^M]*M/.test(document.querySelector('#chat > .hcut path')?.getAttribute('d') || '')`, { what: 'the tile cut, and the header\'s two bends' });
  await ctx.settle();
  out.tiled = await ctx.evaluate(`JSON.stringify((() => { const c = document.querySelector('#chat > .ncut').getBoundingClientRect(), h = document.querySelector('#shead').getBoundingClientRect(), mid = (c.left + c.right) / 2;
    const at = (x, y) => document.elementFromPoint(x, y)?.closest('#shead') ? 'header' : 'behind';   // the line itself takes no pointer
    return { under: at(mid, c.bottom + 0.5), inside: at(mid, c.bottom - 3), beside: at(c.left - 0.5, h.top + 13), bends: document.querySelector('#chat > .hcut path').getAttribute('d').split('M').length - 1 }; })())`).then(JSON.parse);
  ctx.assert.deepEqual(out.tiled, { under: 'header', inside: 'behind', beside: 'header', bends: 2 }, `the header meets the tile's line: ${JSON.stringify(out.tiled)}`);
  await ctx.shot('notch-tiles', { x: N.left - 200, y: 0, width: 585, height: 90 });
  // a title longer than the room left of the housing runs on under it (2026-10-11, late night) rather than jump it: the
  // header lowered by what its glyphs need to clear the tile's line round the housing, a pixel or two, and the chips
  // right of the housing still
  const long = 'A title long enough to run on from the project, under the camera housing and well past it, to the chips beyond';
  await ctx.server.api(`/api/sessions/${two.id}/title`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: long }) });
  await ctx.waitFor(`document.querySelector('#shead h2 .t')?.textContent === ${JSON.stringify(long)} && document.querySelector('#shead').classList.contains('tunder')`, { what: 'the long title under the housing' });
  await ctx.settle();
  out.under = await ctx.evaluate(`JSON.stringify((() => { const h = document.querySelector('#shead'), t = h.querySelector('h2 .t'), r = document.createRange(); r.selectNodeContents(t);
    const tr = r.getBoundingClientRect(), cs = getComputedStyle(t), c = document.createElement('canvas').getContext('2d');
    c.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    const m = c.measureText(t.textContent), glyphs = tr.top + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent, line = document.querySelector('#chat > .ncut').getBoundingClientRect().bottom;
    return { jumps: h.classList.contains('tright') || !!t.style.marginLeft, from: Math.round(tr.left) < ${N.left}, past: Math.round(tr.right) > ${N.right}, clear: +(glyphs - line).toFixed(2),
      drop: parseFloat(h.style.getPropertyValue('--hdrop')) || 0, chips: Math.round(document.querySelector('#prToggle').getBoundingClientRect().left) >= ${N.right} }; })())`).then(JSON.parse);
  ctx.assert.ok(!out.under.jumps && out.under.from && out.under.past && out.under.chips, `the title from the left, on under the housing, the chips past it: ${JSON.stringify(out.under)}`);
  ctx.assert.ok(out.under.clear >= 1.5 && out.under.drop <= 8, `its glyphs clear of the line round the housing, the header lowered a little at most: ${JSON.stringify(out.under)}`);
  await ctx.shot('notch-under', { x: N.left - 300, y: 0, width: 785, height: 90 });
  await ctx.server.api(`/api/sessions/${two.id}/title`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '' }) });
  await ctx.waitFor(`!document.querySelector('#shead').classList.contains('tunder') && !document.querySelector('#shead').style.getPropertyValue('--hdrop')`, { what: 'its own title again, the header back up' });
  await ctx.evaluate(`window.peixFill(false, null)`);
  await ctx.settle();
  ctx.assert.equal(await ctx.evaluate(`!document.querySelector('#chat > .hcut') && !document.querySelector('#shead').style.clipPath`), true, 'out of the fill, no dip');

  return out;
}
