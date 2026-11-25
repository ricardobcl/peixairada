// ---- constellations (2026-11-24, `prefs.spLinks`): the chats' ties (`links`: merge, fold, branch, gone on) as dashed lines
// from box to box under the nodes, one per pair, named at its middle; read after the layout, again when the grid moves
const SP_TIE = { merge: 'merged', fold: 'folded', branch: 'branch', continued: 'went on' };
const spLinksSoon = () => {
  if (!sp.lraf)
    sp.lraf = requestAnimationFrame(() => {
      sp.lraf = 0;
      spDrawLinks();
    });
};
function spDrawLinks() {
  const svg = $('#splinks'),
    field = $('#spfield');
  if (!svg || !prefs.space) return;
  if (prefs.spLinks === false) {
    setHtml(svg, '');
    return;
  }
  const boxes = new Map(
    [...document.querySelectorAll('#spgrid .spt[data-id]')].map(n => [n.dataset.id, n.querySelector('.spbox')]),
  );
  const f = field.getBoundingClientRect(),
    at = b => {
      const r = b.getBoundingClientRect();
      return [r.left - f.left + field.scrollLeft + r.width / 2, r.top - f.top + field.scrollTop + r.height / 2];
    };
  const seen = new Set(),
    lines = [];
  for (const [id, box] of boxes)
    for (const l of state.sessions.get(id)?.links || []) {
      const other = boxes.get(l.id),
        key = [id, l.id].sort().join('|');
      if (!other || seen.has(key)) continue;
      seen.add(key);
      const [x1, y1] = at(box),
        [x2, y2] = at(other);
      lines.push(
        `<g data-a="${esc(id)}" data-b="${esc(l.id)}"><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/><text x="${((x1 + x2) / 2).toFixed(1)}" y="${((y1 + y2) / 2 - 4).toFixed(1)}" text-anchor="middle">${esc(SP_TIE[l.k] || l.k)}</text></g>`,
      );
    }
  svg.setAttribute('width', '1');
  svg.setAttribute('height', '1'); // its lines drawn past its box (overflow: visible): sized to the field, it widened the field it was sized by
  setHtml(svg, lines.join(''));
  spLitLinks();
}
/** The lines of the node under the pointer, lit. */
function spLitLinks(id = sp.over) {
  for (const g of document.querySelectorAll('#splinks g'))
    g.classList.toggle('lit', !!id && (g.dataset.a === id || g.dataset.b === id));
}
