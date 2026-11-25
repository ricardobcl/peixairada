// ---- the two halves: ⌘1 and ⌘2 -----------------------------------------------------
// ⌘2 splits the chat column and puts the keys in the right half; ⌘1 brings them back to the left (2026-09-22). Both
// halves pick from the one chat's tabs, and a tab is only ever in one of them (setTab trades places). ⨯ on the right
// half's strip closes the split: whatever the keys were in stays, the other half's tab goes back to being one the
// strip offers. ⌥⌘1 and ⌥⌘2 are the same two panes one over the other (2026-09-27): the digit
// is the pane, the modifier the layout, and a key pressed on the other layout turns it. ⌘0 and ⌘W carry no layout.
function applySplit() {
  const on = splitNow(),
    stack = stackNow(),
    tree = on ? trees.get(state.current) : null;
  if (!on) focusG = 0;
  if (tree) {
    const gs = leavesOf(tree);
    ensureGroups(Math.max(...gs) + 1);
    if (!gs.includes(focusG)) focusG = gs[0];
  }
  if (zoomed.has(state.current) && (!on || zoomed.get(state.current) !== focusG)) zoomed.delete(state.current); // the keys left the half that filled the column
  const z = zoomed.get(state.current) ?? null;
  $('#main').classList.toggle('split', on);
  $('#groups').classList.toggle('stack', stack && z === null); // one half showing is laid out as a column, whichever it is
  $('#groups').classList.toggle('zoomed', z !== null);
  $('#groups').classList.toggle('tiled', !!tree);
  if (tree) {
    tileLayout(z !== null ? { g: z } : tree);
    return;
  }
  if (applySplit.tiled) {
    // out of a tree: the grid's placements go, and the tiles past the halves
    applySplit.tiled = false;
    $('#groups').style.gridTemplateColumns = $('#groups').style.gridTemplateRows = '';
    for (const tm of terms) {
      $(tm.el.grp).style.gridArea = '';
      if (tm.g > 1) $(tm.el.grp).hidden = true;
    }
    for (const d of tdivs) d.hidden = true;
  }
  $('#grp').hidden = z === 1;
  $('#grpB').hidden = !on || z === 0;
  $('#gsplit').hidden = !on || z !== null;
  const at = Math.max(0.15, Math.min(0.85, (stack ? prefs.stackAt : prefs.splitAt) || 0.5));
  $('#grp').style.flex = on && z === null ? `${at} 1 0` : '1 1 0';
  $('#grpB').style.flex = z === 1 ? '1 1 0' : `${1 - at} 1 0`;
}
// The tree as a grid (2026-11-25): its leaves cut the unit square, every cut a grid line, so each tile spans the tracks
// between its own — the halves' flex basis has no third part. fr shares in ten-thousandths: under 1 in all, fr leaves
// the rest of the room empty.
function tileLayout(node) {
  applySplit.tiled = true;
  const rects = tileRects(node);
  const q = v => Math.round(v * 1e4),
    lines = i => [...new Set(Object.values(rects).flatMap(r => [q(r[i]), q(r[i + 2])]))].sort((a, b) => a - b);
  const xs = lines(0),
    ys = lines(1),
    tracks = l =>
      l
        .slice(1)
        .map((v, i) => `minmax(0, ${v - l[i]}fr)`)
        .join(' ');
  const box = $('#groups');
  box.style.gridTemplateColumns = tracks(xs);
  box.style.gridTemplateRows = tracks(ys);
  for (const tm of terms) {
    const r = rects[tm.g],
      grp = $(tm.el.grp);
    grp.hidden = !r;
    grp.style.flex = '';
    if (r)
      grp.style.gridArea = `${ys.indexOf(q(r[1])) + 1} / ${xs.indexOf(q(r[0])) + 1} / ${ys.indexOf(q(r[3])) + 1} / ${xs.indexOf(q(r[2])) + 1}`;
  }
  $('#gsplit').hidden = true;
  dividersSoon();
}
// One divider a split, over the gap it makes, dragged to move it (2026-11-25). Placed by the tiles' boxes once they
// are laid out — a frame on, and whenever a tile changes size — never in the same pass as the layout that moves them.
const tdivs = [];
const splitsOf = (n, path = '') =>
  !n || 'g' in n ? [] : [{ n, path }, ...splitsOf(n.a, path + 'a'), ...splitsOf(n.b, path + 'b')];
const nodeAt = (n, path) => [...path].reduce((x, c) => (x && !('g' in x) ? x[c] : null), n);
/** A subtree's box in #groups' own coordinates, from its tiles'. */
function boxOf(n, br) {
  const rs = leavesOf(n).map(g => $(GEL[g].grp).getBoundingClientRect());
  return {
    l: Math.min(...rs.map(r => r.left)) - br.left,
    t: Math.min(...rs.map(r => r.top)) - br.top,
    r: Math.max(...rs.map(r => r.right)) - br.left,
    b: Math.max(...rs.map(r => r.bottom)) - br.top,
  };
}
function placeDividers() {
  dividersSoon.f = 0;
  const s = state.sessions.get(state.current),
    tree = isTiled(s) && !zoomed.has(s.id) ? trees.get(s.id) : null,
    list = splitsOf(tree);
  const box = $('#groups'),
    br = box.getBoundingClientRect();
  while (tdivs.length < list.length) {
    const d = html2el('<div class="tdiv" role="separator" title="Drag to resize these tiles" hidden></div>');
    box.append(d);
    tdivs.push(d);
  }
  tdivs.forEach((d, i) => {
    const x = list[i];
    d.hidden = !x;
    if (!x) return;
    const a = boxOf(x.n.a, br),
      b = boxOf(x.n.b, br),
      all = boxOf(x.n, br),
      row = x.n.d === 'row';
    d.dataset.path = x.path;
    d.classList.toggle('col', !row);
    d.setAttribute('aria-orientation', row ? 'vertical' : 'horizontal');
    Object.assign(
      d.style,
      row
        ? { left: a.r + 'px', width: Math.max(1, b.l - a.r) + 'px', top: all.t + 'px', height: all.b - all.t + 'px' }
        : { top: a.b + 'px', height: Math.max(1, b.t - a.b) + 'px', left: all.l + 'px', width: all.r - all.l + 'px' },
    );
  });
}
function dividersSoon() {
  if (!dividersSoon.f) dividersSoon.f = requestAnimationFrame(placeDividers);
} // a function: applySplit runs before this line has
{
  const ro = new ResizeObserver(() => {
    if (tiledNow()) dividersSoon();
  });
  onGroup(tm => ro.observe($(tm.el.grp)));
  $('#groups').addEventListener('pointerdown', e => {
    const d = e.target.closest?.('.tdiv'),
      s = state.sessions.get(state.current);
    if (!d || !isTiled(s)) return;
    const n = nodeAt(trees.get(s.id), d.dataset.path);
    if (!n || 'g' in n) return;
    e.preventDefault();
    e.stopPropagation();
    d.classList.add('drag');
    document.body.style.userSelect = 'none';
    const at = boxOf(n, $('#groups').getBoundingClientRect()),
      br0 = $('#groups').getBoundingClientRect();
    let snapped = false;
    const move = ev => {
      const row = n.d === 'row',
        len = row ? at.r - at.l : at.b - at.t;
      const raw = Math.max(
        0.15,
        Math.min(0.85, (row ? ev.clientX - br0.left - at.l : ev.clientY - br0.top - at.t) / len),
      );
      const near = Math.abs(raw - 0.5) * len <= SNAP_PX; // even parts pull, as the halves' divider does
      if (near && !snapped) haptic('alignment');
      snapped = near;
      n.r = near ? 0.5 : raw;
      applySplit();
    };
    const up = () => {
      removeEventListener('pointermove', move);
      d.classList.remove('drag');
      document.body.style.userSelect = '';
      keepTabsSoon();
      fitTerm();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up, { once: true });
  });
}
/** The half the keys are in fills the column, or the two come back. False with nothing split. */
function toggleZoom(s) {
  if (!isSplit(s)) return false;
  if (zoomed.get(s.id) === focusG) zoomed.delete(s.id);
  else zoomed.set(s.id, focusG);
  syncTerm(s);
  if (!isPaneTab(tabOf(s))) {
    focusBoard();
    focusTerm();
  } // a page keeps the keys: the shell gives them to it again
  return true;
}
/** Which half the keys are in. Re-renders the strips (the rule moves) and tells the shell which page to focus. */
function focusGroup(g) {
  const to = splitNow() ? g : 0;
  if (to === focusG || (tiledNow() && !leavesOf(trees.get(state.current)).includes(to))) return;
  focusG = to;
  if (zoomed.has(state.current)) applySplit(); // into the half behind the one filling the column: both come back
  const s = state.sessions.get(state.current);
  renderTabs(s || null);
  postPane(s || null);
  if (s) renderHead(s);
}
function splitOn(stack = false) {
  const s = state.sessions.get(state.current);
  if (!s) return noChat();
  splitChat(s, false); // asked for by hand: it keeps its empty half
  if (stack) stacked.add(s.id);
  else stacked.delete(s.id);
  applySplit();
  focusG = 1;
  syncTerm(s);
  renderHead(s);
  focusBoard();
  focusTerm();
}
/** One half closed — ⌘W on the one the keys are in, or the ⨯ in a half's own strip. The other half's tab is
      what the column keeps; a half that was showing nothing leaves the closer's tab behind rather than none. */
function closeHalf(g) {
  const s = state.sessions.get(state.current) || null;
  if (s && isTiled(s) && groupsOf(s).length > 2) {
    closeTile(s, g);
    syncTerm(s);
    renderHead(s);
    focusBoard();
    focusTerm();
    return;
  } // a tile: the rest stay
  if (s) {
    const p = placeOf(s),
      o = groupsOf(s).find(x => x !== g) ?? (g ? 0 : 1);
    unsplit(s, p[o] || p[g]);
  }
  focusG = 0;
  applySplit();
  syncTerm(s);
  if (s) renderHead(s);
  focusBoard();
  focusTerm();
}
// ⌘W (2026-10-13): the tab the keys are in, as a browser's or iTerm's ⌘W — a zsh ended, a page or the editor let go,
// the changes closed (dropTab, ⌥⌘W's). The chat's own tab is never closed: on it, or on a half with nothing, ⌘W
// closes the half (its whole job from 2026-09-22), and with one half there is nothing of the board's to close, so the
// key is handed back and the window takes it. A dialog goes first — with the picker up ⌘W is how you get rid of it.
function hotClose() {
  const dlg = document.querySelector('dialog[open]');
  if (dlg) {
    dlg.close();
    return true;
  }
  const s = state.sessions.get(state.current),
    k = s && tabOf(s);
  if (k && k !== 'chat') {
    dropTab(s, k);
    return true;
  }
  if (!splitNow()) {
    if (prefs.space && s) {
      spCloseChat();
      return true;
    }
    return false;
  } // Space: ⌘W on the chat closes its panel
  closeHalf(focusG);
  return true;
}
/** ⌘0: only this half. The *other* one closes, so the tab under the keys is what the column keeps — the opposite
      end of ⌘2, and ⌘W's mirror (that one closes the half you are in). Nothing split: ⌘0 is the zoom's again. */
function hotOnlyHalf() {
  if (!splitNow()) {
    prefs.chatZoom = 1;
    applyChatZoom();
    savePrefs();
    return true;
  }
  const s = state.sessions.get(state.current);
  if (isTiled(s) && groupsOf(s).length > 2) {
    unsplit(s, placeOf(s)[focusG]);
    focusG = 0;
    applySplit();
    syncTerm(s);
    renderHead(s);
    focusBoard();
    focusTerm();
    return true;
  } // tiles: all but this one
  closeHalf(groupsOf(s).find(x => x !== focusG) ?? (focusG ? 0 : 1));
  return true;
}
/** ⌘1 / ⌘2 (side by side) and ⌥⌘1 / ⌥⌘2 (one over the other): the keys to that pane, the split made or turned first. */
function hotGroup(g, stack = false) {
  if (g === 1 && !splitNow()) return splitOn(stack);
  if (!splitNow()) return; // ⌘1 / ⌥⌘1 with one half is where you already are
  const s = state.sessions.get(state.current);
  if (isTiled(s)) {
    // tiles: the digit is the tile's place in the tree; the modifier turns the split it is half of, and the next one
    const to = groupsOf(s)[g];
    if (to === undefined) return;
    focusGroup(to);
    if (stacked.has(s.id) !== stack || (parentOf(trees.get(s.id), to)?.d === 'col') !== stack) stackSplit(s, stack);
    focusBoard();
    focusTerm();
    return;
  }
  if (s && stacked.has(s.id) !== stack) stackSplit(s, stack);
  focusGroup(g);
  focusBoard();
  focusTerm();
}
/** This chat's halves the other way round — one over the other, or side by side again. syncTerm re-attaches
      nothing (the same terminals in the same halves) and reposts the pane; the terminals refit to their new bodies. */
function stackSplit(s, on) {
  if (on) stacked.add(s.id);
  else stacked.delete(s.id);
  const par = isTiled(s) && parentOf(trees.get(s.id), focusG);
  if (par) par.d = on ? 'col' : 'row'; // tiled: the split the keys' tile is half of
  syncTerm(s);
  fitTerm();
}
// The tiles by the arrows (2026-11-25): with Tile new terminals on and the column split, ⌥⌘←→↑↓ take the keys to the
// tile that way, by where the tiles stand — not their order — and ⌥⌘⇧ moves the tile itself, the rest closing over
// the room it left. Off, or one half, they are the tabs', the list's and the pinned cards' as ever.
const tileKeysOn = () => !!prefs.autoTile && splitNow() && state.sessions.has(state.current);
const TILE_DIRS = {
  ArrowLeft: [0, -1, 'to the left', 'left'],
  ArrowRight: [0, 1, 'to the right', 'right'],
  ArrowUp: [1, -1, 'above', 'top'],
  ArrowDown: [1, 1, 'below', 'bottom'],
}; // axis (0 x, 1 y), sign, words, edge
/** The tile next to g that way, as i3's focus has it (2026-11-25, later): of those sharing its edge and its span, the
 *  one the keys were in last (`tileSeen`) — i3's focus stack —, else the first: the topmost sideways, the leftmost up
 *  or down. */
function tileToward(s, tree, g, dir) {
  const R = tileRects(tree),
    c = R[g],
    [ax, sg] = TILE_DIRS[dir],
    o = 1 - ax,
    E = 1e-4;
  if (!c) return null;
  const seen = tileSeen.get(s.id) || [],
    last = x => {
      const i = seen.indexOf(x);
      return i < 0 ? Infinity : i;
    };
  const near = Object.entries(R)
    .map(([k, r]) => ({
      g: +k,
      first: r[o],
      gap: sg > 0 ? r[ax] - c[ax + 2] : c[ax] - r[ax + 2],
      over: Math.min(r[o + 2], c[o + 2]) - Math.max(r[o], c[o]),
    }))
    .filter(x => x.g !== g && Math.abs(x.gap) < E && x.over > E)
    .sort((a, b) => last(a.g) - last(b.g) || a.first - b.first);
  return near[0]?.g ?? null;
}
function hotTileGo(dir) {
  const s = state.sessions.get(state.current),
    to = tileToward(s, trees.get(s.id) || halvesTree(s), focusG, dir);
  if (to === null) return note($('#shead'), `No tile ${TILE_DIRS[dir][2]}`);
  focusGroup(to);
  focusBoard();
  focusTerm();
}
/** ⌥⌘⇧ + an arrow: i3's move (2026-11-25, later), on the tree read as i3's containers — a run of splits one way is one
 *  list (`toKids`). Beside a tile in its own list that way, the two trade places; beside a list across the arrow (a
 *  stack, side by side…), it goes into it, after the one of them the keys were in last. At its list's end, or in a
 *  list across the arrow, it leaves: into the nearest list that runs the arrow's way, just past the part it was in —
 *  out of a stack, a column of its own beside it. None: the whole column that way, a split round all of it. Every
 *  leaf keeps its group, so no terminal is attached again; each refits. */
function hotTileMove(dir) {
  const s = state.sessions.get(state.current),
    g = focusG,
    tree = trees.get(s.id) || halvesTree(s),
    [, , words, edge] = TILE_DIRS[dir];
  const next = i3Move(tree, g, dir, tileSeen.get(s.id) || []);
  if (!next) return note($('#shead'), `It is the column's whole ${edge} already`);
  if (!treeFits(next)) return note($('#shead'), `No room for it ${words}`);
  trees.set(s.id, next);
  zoomed.delete(s.id);
  applySplit();
  syncTerm(s);
  fitTerm();
  focusBoard();
  focusTerm();
}
// i3's containers over the binary tree: { g } | { d, kids: [{ n, w }] }, w each part's share of its list (summing to 1).
const clampR = r => Math.max(0.15, Math.min(0.85, r || 0.5));
function toKids(n) {
  if ('g' in n) return { g: n.g };
  const kids = [],
    add = (x, w) => {
      if (!('g' in x) && x.d === n.d) {
        const r = clampR(x.r);
        add(x.a, w * r);
        add(x.b, w * (1 - r));
      } else kids.push({ n: toKids(x), w });
    };
  add(n, 1);
  return { d: n.d, kids };
}
function fromKids(n) {
  if ('g' in n) return { g: n.g };
  if (n.kids.length === 1) return fromKids(n.kids[0].n);
  const sum = n.kids.reduce((x, k) => x + k.w, 0),
    [k0, ...rest] = n.kids;
  return { d: n.d, r: k0.w / sum, a: fromKids(k0.n), b: fromKids({ d: n.d, kids: rest }) };
}
/** A list as i3 keeps it: a part of one, the part; a part running the same way, its parts in its place. */
function tidyKids(n) {
  if ('g' in n) return n;
  const kids = [];
  for (const k of n.kids) {
    const c = tidyKids(k.n);
    if (!('g' in c) && c.d === n.d) for (const x of c.kids) kids.push({ n: x.n, w: x.w * k.w });
    else kids.push({ n: c, w: k.w });
  }
  if (kids.length === 1) return kids[0].n;
  const sum = kids.reduce((x, k) => x + k.w, 0);
  for (const k of kids) k.w /= sum;
  return { d: n.d, kids };
}
const kidLeaves = n => ('g' in n ? [n.g] : n.kids.flatMap(k => kidLeaves(k.n)));
const kidOut = (C, i) => {
  C.kids.splice(i, 1);
  const sum = C.kids.reduce((x, k) => x + k.w, 0) || 1;
  for (const k of C.kids) k.w /= sum;
};
const kidIn = (C, i, n) => {
  const m = C.kids.length;
  for (const k of C.kids) k.w *= m / (m + 1);
  C.kids.splice(i, 0, { n, w: 1 / (m + 1) });
}; // an even share, as i3 gives
/** The tree with g moved that way as i3 would, or null when it is that whole side already. */
function i3Move(tree, g, dir, seen) {
  const [ax, sg] = TILE_DIRS[dir],
    d = ax ? 'col' : 'row',
    root = toKids(tree),
    path = [];
  const find = n => {
    if ('g' in n) return n.g === g;
    for (let i = 0; i < n.kids.length; i++) {
      path.push({ n, i });
      if (find(n.kids[i].n)) return true;
      path.pop();
    }
    return false;
  };
  if (!find(root)) return null;
  const { n: P, i } = path.at(-1),
    leaf = P.kids[i].n,
    T = P.d === d ? P.kids[i + sg] : null;
  if (T && 'g' in T.n) {
    P.kids[i + sg] = { n: leaf, w: T.w };
    P.kids[i] = { n: T.n, w: P.kids[i].w };
    return fromKids(tidyKids(root));
  } // its neighbour: trade places, the room where it was
  if (T) {
    // a list across the arrow: into it, after the part the keys were in last
    const C = T.n,
      ls = kidLeaves(C),
      last = seen.find(x => ls.includes(x)) ?? ls.at(-1),
      j = C.kids.findIndex(k => kidLeaves(k.n).includes(last));
    kidOut(P, i);
    kidIn(C, j + 1, leaf);
    return fromKids(tidyKids(root));
  }
  let k = path.length - 2;
  while (k >= 0 && path[k].n.d !== d) k--; // out: the nearest list the arrow's way above
  if (k < 0 && P === root && P.d === d) return null; // its end already
  kidOut(P, i);
  if (k >= 0) {
    const { n: A, i: j } = path[k];
    kidIn(A, sg > 0 ? j + 1 : j, leaf);
    return fromKids(tidyKids(root));
  }
  const rest = tidyKids(root),
    half = [
      { n: rest, w: 0.5 },
      { n: leaf, w: 0.5 },
    ];
  return fromKids(tidyKids({ d, kids: sg > 0 ? half : half.reverse() })); // none: the column's whole side, round the rest
}
/** Whether every tile of a tree laid out in the column holds a terminal of TILE_MIN, by a drawn terminal's cell. */
function treeFits(tree) {
  const b = $('#groups').getBoundingClientRect(),
    tm = terms.find(t => t.xt?.cols && $(t.el.tbody).clientWidth);
  const cw = tm ? $(tm.el.tbody).clientWidth / tm.xt.cols : 8,
    ch = tm ? $(tm.el.tbody).clientHeight / tm.xt.rows : 17;
  return Object.values(tileRects(tree)).every(
    r => ((r[2] - r[0]) * b.width - 5) / cw >= TILE_MIN.cols && ((r[3] - r[1]) * b.height - 5) / ch >= TILE_MIN.rows,
  );
}
/** ⌘D side by side, ⇧⌘D one over the other (2026-11-25, iTerm's pair): a new zsh in a tile cut from this one that way. */
function hotSplitTile(d) {
  const s = state.sessions.get(state.current);
  if (!s) return noChat();
  if (!prefs.autoTile) return note($('#shead'), 'Tiles are off — Settings › Terminal › Tile new terminals');
  focusBoard();
  startShell(s, true, d);
}
applySplit();
{
  const bar = $('#gsplit');
  let dragging = false;
  bar.addEventListener('mousedown', e => {
    dragging = true;
    bar.classList.add('drag');
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const r = $('#groups').getBoundingClientRect(),
      stack = stackNow();
    const raw = Math.max(0.15, Math.min(0.85, stack ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width));
    const near = Math.abs(raw - 0.5) * (stack ? r.height : r.width) <= SNAP_PX,
      at = near ? 0.5 : raw; // even halves pull (2026-10-11)
    if (near && !bar.snapped) haptic('alignment');
    bar.snapped = near;
    if (stack) prefs.stackAt = at;
    else prefs.splitAt = at;
    applySplit();
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    bar.classList.remove('drag');
    document.body.style.userSelect = '';
    savePrefs();
    fitTerm();
  });
}
// × on a tab: the zsh ends (the server says so, and the tab goes with it); a page is forgotten here — its view
// lingers in the shell until it needs the room. The tab in front closed, the one beside it comes forward, as in a
// browser (2026-10-13; the half's first did before): the one to its right, else its left — a zsh's at once, while the
// server is still ending it.
function closeTab(s, k) {
  // vim is asked to quit (2026-10-21): its tab goes when it does — and stays in front, saying why, over unsaved work
  if (isVimTab(s, k)) {
    api('DELETE', `/api/terminals/${shellOfTab(s, k).id}`).catch(e =>
      note(seen($('#ptabs')), `Could not quit vim: ${e.message}`, true),
    );
    return false;
  }
  const p = placeOf(s),
    g = p.indexOf(k);
  if (g >= 0) {
    const ks = keysIn(s, g),
      i = ks.indexOf(k);
    p[g] = ks[i + 1] || ks[i - 1] || null;
    tabs.set(s.id, p);
  }
  if (isShellTab(k)) {
    const t = shellOfTab(s, k);
    if (t)
      api('DELETE', `/api/terminals/${t.id}`).catch(e =>
        note(seen($('#ptabs')), `Could not end the zsh: ${e.message}`, true),
      );
    syncTerm(s);
    return;
  }
  if (k === 'changes') changesOpen.delete(s.id);
  else if (k === 'timeline') timelineOpen.delete(s.id);
  else if (isAgentTab(k)) {
    const l = (agentTabs.get(s.id) || []).filter(a => 'agent:' + a.id !== k);
    if (l.length) agentTabs.set(s.id, l);
    else agentTabs.delete(s.id);
  } else if (isPageTab(k))
    state.paneGh.set(
      s.id,
      (state.paneGh.get(s.id) || []).filter(x => x !== k),
    );
  else if (isBlankTab(k))
    blanks.set(
      s.id,
      (blanks.get(s.id) || []).filter(b => 'new:' + b.n !== k),
    );
  else if ((state.paneWt.get(s.id) || []).includes(pageUrl(k)))
    state.paneWt.set(
      s.id,
      state.paneWt.get(s.id).filter(u => u !== pageUrl(k)),
    );
  else if (s.cwd) state.paneIde.delete(s.cwd);
  homes.get(s.id)?.delete(k);
  syncTerm(s);
}
/** A tab closed from anywhere but its own × — ⌥⌘W, the ··· menu (2026-09-28): the × is gone from a half the tab
      has to itself, which is exactly the half that empties. When the keys are in that half they go back to the chat,
      rather than stay in an empty half or on a zsh on its way out (a zsh ends when the server says so, a moment on). */
function dropTab(s, k) {
  const g = isSplit(s) ? homeOf(s, k) : 0,
    last = keysIn(s, g).length === 1;
  if (closeTab(s, k) === false) return; // vim, asked to quit
  if (last && g === focusG) {
    if (isTiled(s) && groupsOf(s).length > 2) focusG = backOf(trees.get(s.id), g) ?? 0;
    else showChat(s);
    syncTerm(s);
  } // tiles: back to the one it was cut from
  focusBoard();
  focusTerm();
}
// ⌥⌘W: the tab the keys are in, closed — the zsh ended, a page or the editor let go. The split the board made for it
// folds with it; one asked for by hand keeps its half, empty. The chat's own tab has no ×, and no ⌥⌘W either.
function hotCloseTab() {
  const s = state.sessions.get(state.current);
  if (!s) return noChat();
  const k = tabOf(s);
  if (!k || k === 'chat') return note($('#shead'), 'The chat tab stays — ⌘W closes a half, ✓ ends the chat');
  dropTab(s, k);
}
// The take-over tooltip is the warning: for a VS Code chat it spells out what the tab there loses.
const VSC_COST =
  ' Its tab in VS Code goes dead and will not follow the chat — close it there; opening the chat in VS Code again starts another claude on it, and a bar here will say so.';
const takeTip = s => {
  const vs = inVsCode(s),
    what = vs
      ? `the claude VS Code runs on this chat (pid ${s.live.pid})`
      : `claude (pid ${s.live.pid}) in its terminal`;
  return (
    (drawer.arm === s.id
      ? `Click again to end ${what} and resume the chat here${s.status === 'working' ? ' — Claude is mid-reply, and that reply will be lost' : ''}.`
      : `Take over: end ${what} and resume the chat here.`) + (vs ? VSC_COST : '')
  );
};
const sureWord = s => (s.status === 'working' ? 'sure? mid-reply' : inVsCode(s) ? 'sure? ends VS Code’s' : 'sure?');
const KEY_C = ' · ⌥⌘C'; // on every tip the button acts on; the disabled and failed ones say why instead
const termTip = s =>
  drawer.err
    ? drawer.err
    : termLive(s)
      ? (termFor(s.terminal.id)
          ? 'This chat runs here — the terminal is the pane'
          : "Show this chat's claude session") + KEY_C
      : takeable(s)
        ? takeTip(s) + KEY_C
        : attachable(s)
          ? ATTACH_TIP + KEY_C
          : s.alive
            ? `Live in ${entryLabel(s)} — it cannot be attached from here`
            : inVsCode(s)
              ? 'Open a terminal on this chat (claude --resume). It was last continued in VS Code: from here on it is a CLI chat, and the tab there, if still open, will not follow it' +
                KEY_C
              : 'Open a terminal on this chat (claude --resume)' + KEY_C;
// Live somewhere that is not our drawer — iTerm, VS Code. Nothing respawns a CLI claude, and VS Code's
// extension does not respawn its own either (it launches one when a tab opens a chat, never after a
// death — measured 2026-09-20), so ending it and resuming here leaves one writer.
// A background session is not: `claude attach` opens it in a drawer, the one running, and closing the drawer leaves it so (2026-11-04).
const attachable = s => !!(s?.alive && inBackground(s) && s.live?.jobId && !termLive(s));
const takeable = s => !!(s?.alive && s.live?.pid && !termLive(s) && !attachable(s));
const ATTACH_TIP = 'Open this background session here (claude attach): it keeps running when the drawer closes';
// Two clicks, six seconds apart at most: the first arms the button (it turns red and says so), the
// second ends the other claude. renderHead re-runs on every update and reads the armed state back.
function armTakeOver(s) {
  drawer.arm = s.id;
  clearTimeout(drawer.armTimer);
  drawer.armTimer = setTimeout(() => {
    if (drawer.arm === s.id) {
      drawer.arm = null;
      renderHead(state.sessions.get(s.id) || s);
    }
  }, 6000);
  renderHead(s);
}
async function takeOver(s) {
  drawer.arm = null;
  clearTimeout(drawer.armTimer);
  renderResume(s);
  const tb = $('#termBtn');
  if (tb) {
    tb.disabled = true;
    const l = tb.querySelector('.lbl');
    if (l) l.textContent = 'ending…';
  }
  let d = null;
  try {
    d = await api('POST', `/api/sessions/${s.id}/takeover`, termSize());
  } catch (e) {
    drawer.err = e.message;
  }
  if (d) showTerminal(s, d.terminal);
  renderHead(state.sessions.get(s.id) || s);
}
