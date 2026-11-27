// ---- constellations (2026-11-24, `prefs.spLinks`): the chats' ties (`links`: merge, fold, branch, gone on) as dashed lines
// from box to box under the nodes, one per pair, named at its middle; read after the layout, again when the grid moves
const SP_TIE = { merge: 'merged', fold: 'folded', branch: 'branch', continued: 'went on' };

const spLinksSoon = () => {
  if (!sp.lraf) {
    sp.lraf = requestAnimationFrame(() => {
      sp.lraf = 0;
      spDrawLinks();
    });
  }
};

function spDrawLinks() {
  const svg = $('#splinks');
  const field = $('#spfield');

  if (!svg || !prefs.space) return;

  if (prefs.spLinks === false) {
    setHtml(svg, '');
    return;
  }

  const boxes = new Map(
    [...document.querySelectorAll('#spgrid .spt[data-id]')].map(node => [
      node.dataset.id,
      node.querySelector('.spbox'),
    ]),
  );

  const fieldRect = field.getBoundingClientRect();

  const at = box => {
    const rect = box.getBoundingClientRect();

    return [
      rect.left - fieldRect.left + field.scrollLeft + rect.width / 2,
      rect.top - fieldRect.top + field.scrollTop + rect.height / 2,
    ];
  };

  const seen = new Set();
  const lines = [];

  for (const [id, box] of boxes) {
    for (const link of state.sessions.get(id)?.links || []) {
      const other = boxes.get(link.id);
      const key = [id, link.id].sort().join('|');

      if (!other || seen.has(key)) continue;
      seen.add(key);

      const [x1, y1] = at(box);
      const [x2, y2] = at(other);

      lines.push(
        `<g data-a="${esc(id)}" data-b="${esc(link.id)}"><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/><text x="${((x1 + x2) / 2).toFixed(1)}" y="${((y1 + y2) / 2 - 4).toFixed(1)}" text-anchor="middle">${esc(SP_TIE[link.k] || link.k)}</text></g>`,
      );
    }
  }

  svg.setAttribute('width', '1');
  svg.setAttribute('height', '1'); // its lines drawn past its box (overflow: visible): sized to the field, it widened the field it was sized by
  setHtml(svg, lines.join(''));
  spLitLinks();
}

/** The lines of the node under the pointer, lit. */
function spLitLinks(id = sp.over) {
  for (const group of document.querySelectorAll('#splinks g')) {
    group.classList.toggle('lit', !!id && (group.dataset.a === id || group.dataset.b === id));
  }
}
