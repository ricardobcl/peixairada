// ---- the two halves: ⌘1 and ⌘2 -----------------------------------------------------
// ⌘2 splits the chat column and puts the keys in the right half; ⌘1 brings them back to the left (2026-09-22). Both
// halves pick from the one chat's tabs, and a tab is only ever in one of them (setTab trades places). ⨯ on the right
// half's strip closes the split: whatever the keys were in stays, the other half's tab goes back to being one the
// strip offers. ⌥⌘1 and ⌥⌘2 are the same two panes one over the other (2026-09-27): the digit
// is the pane, the modifier the layout, and a key pressed on the other layout turns it. ⌘0 and ⌘W carry no layout.
function applySplit() {
  const on = splitNow();
  const stack = stackNow();
  const tree = on ? trees.get(state.current) : null;

  const gs = tree ? leavesOf(tree) : on ? [0, 1] : [0];

  if (tree) ensureGroups(Math.max(...gs) + 1);
  if (!gs.includes(focusG)) focusG = gs[0]; // a group this chat has (2026-11-26): a tile of the chat left is none of two halves'
  postTiles(); // whether ⌥⌘⇧←→ move a tile now, for the app's forwarder
  if (zoomed.has(state.current) && (!on || zoomed.get(state.current) !== focusG)) zoomed.delete(state.current); // the keys left the half that filled the column
  const zoomedGroup = zoomed.get(state.current) ?? null;

  $('#main').classList.toggle('split', on);
  $('#groups').classList.toggle('stack', stack && zoomedGroup === null); // one half showing is laid out as a column, whichever it is
  $('#groups').classList.toggle('zoomed', zoomedGroup !== null);
  $('#groups').classList.toggle('tiled', !!tree);

  if (tree) {
    tileLayout(zoomedGroup !== null ? { g: zoomedGroup } : tree);
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

    for (const divider of tdivs) divider.hidden = true;
  }

  $('#grp').hidden = zoomedGroup === 1;
  $('#grpB').hidden = !on || zoomedGroup === 0;
  $('#gsplit').hidden = !on || zoomedGroup !== null;
  const at = Math.max(0.15, Math.min(0.85, (stack ? prefs.stackAt : prefs.splitAt) || 0.5));

  $('#grp').style.flex = on && zoomedGroup === null ? `${at} 1 0` : '1 1 0';
  $('#grpB').style.flex = zoomedGroup === 1 ? '1 1 0' : `${1 - at} 1 0`;
}

// The tree as a grid (2026-11-25): its leaves cut the unit square, every cut a grid line, so each tile spans the tracks
// between its own — the halves' flex basis has no third part. fr shares in ten-thousandths: under 1 in all, fr leaves
// the rest of the room empty.
function tileLayout(node) {
  applySplit.tiled = true;
  const rects = tileRects(node);

  const quantize = value => Math.round(value * 1e4);

  const lines = axis =>
    [...new Set(Object.values(rects).flatMap(rect => [quantize(rect[axis]), quantize(rect[axis + 2])]))].sort(
      (left, right) => left - right,
    );

  const xs = lines(0);
  const ys = lines(1);

  const tracks = edges =>
    edges
      .slice(1)
      .map((edge, index) => `minmax(0, ${edge - edges[index]}fr)`)
      .join(' ');

  const box = $('#groups');

  box.style.gridTemplateColumns = tracks(xs);
  box.style.gridTemplateRows = tracks(ys);

  for (const tm of terms) {
    const rect = rects[tm.g];
    const grp = $(tm.el.grp);

    grp.hidden = !rect;
    grp.style.flex = '';

    if (rect) {
      grp.style.gridArea = `${ys.indexOf(quantize(rect[1])) + 1} / ${xs.indexOf(quantize(rect[0])) + 1} / ${ys.indexOf(quantize(rect[3])) + 1} / ${xs.indexOf(quantize(rect[2])) + 1}`;
    }
  }

  $('#gsplit').hidden = true;
  dividersSoon();
}

// One divider a split, over the gap it makes, dragged to move it (2026-11-25). Placed by the tiles' boxes once they
// are laid out — a frame on, and whenever a tile changes size — never in the same pass as the layout that moves them.
const tdivs = [];

const splitsOf = (node, path = '') =>
  !node || 'g' in node ? [] : [{ n: node, path }, ...splitsOf(node.a, `${path}a`), ...splitsOf(node.b, `${path}b`)];

const nodeAt = (node, path) =>
  [...path].reduce((current, side) => (current && !('g' in current) ? current[side] : null), node);

/** A subtree's box in #groups' own coordinates, from its tiles'. */
function boxOf(node, br) {
  const rs = leavesOf(node).map(group => $(GEL[group].grp).getBoundingClientRect());

  return {
    l: Math.min(...rs.map(rect => rect.left)) - br.left,
    t: Math.min(...rs.map(rect => rect.top)) - br.top,
    r: Math.max(...rs.map(rect => rect.right)) - br.left,
    b: Math.max(...rs.map(rect => rect.bottom)) - br.top,
  };
}

function placeDividers() {
  dividersSoon.f = 0;

  const session = state.sessions.get(state.current);
  const tree = isTiled(session) && !zoomed.has(session.id) ? trees.get(session.id) : null;
  const list = splitsOf(tree);

  const box = $('#groups');
  const br = box.getBoundingClientRect();

  while (tdivs.length < list.length) {
    const divider = html2el('<div class="tdiv" role="separator" title="Drag to resize these tiles" hidden></div>');

    box.append(divider);
    tdivs.push(divider);
  }

  tdivs.forEach((divider, index) => {
    const split = list[index];

    divider.hidden = !split;
    if (!split) return;

    const boxA = boxOf(split.n.a, br);
    const boxB = boxOf(split.n.b, br);
    const all = boxOf(split.n, br);
    const row = split.n.d === 'row';

    divider.dataset.path = split.path;
    divider.classList.toggle('col', !row);
    divider.setAttribute('aria-orientation', row ? 'vertical' : 'horizontal');

    Object.assign(
      divider.style,
      row
        ? {
            left: `${boxA.r}px`,
            width: `${Math.max(1, boxB.l - boxA.r)}px`,
            top: `${all.t}px`,
            height: `${all.b - all.t}px`,
          }
        : {
            top: `${boxA.b}px`,
            height: `${Math.max(1, boxB.t - boxA.b)}px`,
            left: `${all.l}px`,
            width: `${all.r - all.l}px`,
          },
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

  $('#groups').addEventListener('pointerdown', event => {
    const divider = event.target.closest?.('.tdiv');
    const session = state.sessions.get(state.current);

    if (!divider || !isTiled(session)) return;
    const node = nodeAt(trees.get(session.id), divider.dataset.path);

    if (!node || 'g' in node) return;
    event.preventDefault();
    event.stopPropagation();
    divider.classList.add('drag');
    document.body.style.userSelect = 'none';

    const at = boxOf(node, $('#groups').getBoundingClientRect());
    const br0 = $('#groups').getBoundingClientRect();

    let snapped = false;

    const move = ev => {
      const row = node.d === 'row';
      const len = row ? at.r - at.l : at.b - at.t;

      const raw = Math.max(
        0.15,
        Math.min(0.85, (row ? ev.clientX - br0.left - at.l : ev.clientY - br0.top - at.t) / len),
      );

      const near = Math.abs(raw - 0.5) * len <= SNAP_PX; // even parts pull, as the halves' divider does

      if (near && !snapped) haptic('alignment');
      snapped = near;
      node.r = near ? 0.5 : raw;
      applySplit();
    };

    // let go however the press ends (2026-11-26): a release out of the window, or ⌘-Tab mid-drag, brings no pointerup
    const ends = ['pointerup', 'pointercancel', 'blur'];

    const up = () => {
      removeEventListener('pointermove', move);
      for (const ev of ends) removeEventListener(ev, up);
      divider.classList.remove('drag');
      document.body.style.userSelect = '';
      keepTabsSoon();
      fitTerm();
    };

    addEventListener('pointermove', move);
    for (const ev of ends) addEventListener(ev, up);
  });
}

/** The half the keys are in fills the column, or the two come back. False with nothing split. */
function toggleZoom(session) {
  if (!isSplit(session)) return false;
  if (zoomed.get(session.id) === focusG) zoomed.delete(session.id);
  else zoomed.set(session.id, focusG);
  syncTerm(session);

  if (!isPaneTab(tabOf(session))) {
    focusBoard();
    focusTerm();
  } // a page keeps the keys: the shell gives them to it again

  return true;
}

/** Which half the keys are in. Re-renders the strips (the rule moves) and tells the shell which page to focus. */
function focusGroup(group) {
  const to = splitNow() ? group : 0;

  if (to === focusG || (tiledNow() && !leavesOf(trees.get(state.current)).includes(to))) return;
  focusG = to;
  if (zoomed.has(state.current)) applySplit(); // into the half behind the one filling the column: both come back
  const session = state.sessions.get(state.current);

  renderTabs(session || null);
  postPane(session || null);
  if (session) renderHead(session);
}

function splitOn(stack = false) {
  const session = state.sessions.get(state.current);

  if (!session) return noChat();
  splitChat(session, false); // asked for by hand: it keeps its empty half
  if (stack) stacked.add(session.id);
  else stacked.delete(session.id);
  applySplit();
  focusG = 1;
  syncTerm(session);
  renderHead(session);
  focusBoard();
  focusTerm();
}

/** One half closed — ⌘W on the one the keys are in, or the ⨯ in a half's own strip. The other half's tab is
      what the column keeps; a half that was showing nothing leaves the closer's tab behind rather than none. */
function closeHalf(half) {
  const session = state.sessions.get(state.current) || null;

  if (session && isTiled(session) && groupsOf(session).length > 2) {
    closeTile(session, half);
    syncTerm(session);
    renderHead(session);
    focusBoard();
    focusTerm();
    return;
  } // a tile: the rest stay

  if (session) {
    const place = placeOf(session);
    const other = groupsOf(session).find(group => group !== half) ?? (half ? 0 : 1);

    unsplit(session, place[other] || place[half]);
  }

  focusG = 0;
  applySplit();
  syncTerm(session);
  if (session) renderHead(session);
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

  const session = state.sessions.get(state.current);
  const key = session && tabOf(session);

  if (key && key !== 'chat') {
    dropTab(session, key);
    return true;
  }

  if (!splitNow()) {
    if (prefs.space && session) {
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

  const session = state.sessions.get(state.current);

  if (isTiled(session) && groupsOf(session).length > 2) {
    unsplit(session, placeOf(session)[focusG]);
    focusG = 0;
    applySplit();
    syncTerm(session);
    renderHead(session);
    focusBoard();
    focusTerm();
    return true;
  } // tiles: all but this one

  closeHalf(groupsOf(session).find(group => group !== focusG) ?? (focusG ? 0 : 1));
  return true;
}

/** ⌘1 / ⌘2 (side by side) and ⌥⌘1 / ⌥⌘2 (one over the other): the keys to that pane, the split made or turned first. */
function hotGroup(group, stack = false) {
  if (group === 1 && !splitNow()) return splitOn(stack);
  if (!splitNow()) return; // ⌘1 / ⌥⌘1 with one half is where you already are
  const session = state.sessions.get(state.current);

  if (isTiled(session)) {
    // tiles: the digit is the tile's place in the tree; the modifier turns the split it is half of, and the next one
    const to = groupsOf(session)[group];

    if (to === undefined) return;
    focusGroup(to);

    if (stacked.has(session.id) !== stack || (parentOf(trees.get(session.id), to)?.d === 'col') !== stack) {
      stackSplit(session, stack);
    }

    focusBoard();
    focusTerm();
    return;
  }

  if (session && stacked.has(session.id) !== stack) stackSplit(session, stack);
  focusGroup(group);
  focusBoard();
  focusTerm();
}

/** This chat's halves the other way round — one over the other, or side by side again. syncTerm re-attaches
      nothing (the same terminals in the same halves) and reposts the pane; the terminals refit to their new bodies. */
function stackSplit(session, on) {
  if (on) stacked.add(session.id);
  else stacked.delete(session.id);
  const par = isTiled(session) && parentOf(trees.get(session.id), focusG);

  if (par) par.d = on ? 'col' : 'row'; // tiled: the split the keys' tile is half of
  syncTerm(session);
  fitTerm();
}

// The tiles by the arrows (2026-11-25): with Auto-tiling on and the column split, ⌥⌘←→↑↓ take the keys to the
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
function tileToward(session, tree, group, dir) {
  const rects = tileRects(tree);
  const ownRect = rects[group];
  const [ax, sg] = TILE_DIRS[dir];
  const crossAxis = 1 - ax;
  const EPSILON = 1e-4;

  if (!ownRect) return null;

  const seen = tileSeen.get(session.id) || [];

  const last = candidate => {
    const index = seen.indexOf(candidate);

    return index < 0 ? Infinity : index;
  };

  const near = Object.entries(rects)
    .map(([key, rect]) => ({
      g: +key,
      first: rect[crossAxis],
      gap: sg > 0 ? rect[ax] - ownRect[ax + 2] : ownRect[ax] - rect[ax + 2],
      over: Math.min(rect[crossAxis + 2], ownRect[crossAxis + 2]) - Math.max(rect[crossAxis], ownRect[crossAxis]),
    }))
    .filter(tile => tile.g !== group && Math.abs(tile.gap) < EPSILON && tile.over > EPSILON)
    .sort((left, right) => last(left.g) - last(right.g) || left.first - right.first);

  return near[0]?.g ?? null;
}

function hotTileGo(dir) {
  const session = state.sessions.get(state.current);
  const to = tileToward(session, trees.get(session.id) || halvesTree(session), focusG, dir);

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
  const session = state.sessions.get(state.current);
  const group = focusG;
  const tree = trees.get(session.id) || halvesTree(session);
  const [, , words, edge] = TILE_DIRS[dir];

  const next = i3Move(tree, group, dir, tileSeen.get(session.id) || []);

  if (!next) return note($('#shead'), `It is the column's whole ${edge} already`);
  if (!tilesFit(session, next)) return note($('#shead'), `No room for it ${words}`);
  trees.set(session.id, next);
  zoomed.delete(session.id);
  applySplit();
  syncTerm(session);
  fitTerm();
  focusBoard();
  focusTerm();
}

// i3's containers over the binary tree: { g } | { d, kids: [{ n, w }] }, w each part's share of its list (summing to 1).
const clampR = ratio => Math.max(0.15, Math.min(0.85, ratio || 0.5));

function toKids(node) {
  if ('g' in node) return { g: node.g };

  const kids = [];

  const add = (subtree, weight) => {
    if (!('g' in subtree) && subtree.d === node.d) {
      const ratio = clampR(subtree.r);

      add(subtree.a, weight * ratio);
      add(subtree.b, weight * (1 - ratio));
    } else kids.push({ n: toKids(subtree), w: weight });
  };

  add(node, 1);
  return { d: node.d, kids };
}

function fromKids(node) {
  if ('g' in node) return { g: node.g };
  if (node.kids.length === 1) return fromKids(node.kids[0].n);

  const sum = node.kids.reduce((total, kid) => total + kid.w, 0);
  const [k0, ...rest] = node.kids;

  return { d: node.d, r: k0.w / sum, a: fromKids(k0.n), b: fromKids({ d: node.d, kids: rest }) };
}

/** A list as i3 keeps it: a part of one, the part; a part running the same way, its parts in its place. */
function tidyKids(node) {
  if ('g' in node) return node;
  const kids = [];

  for (const kid of node.kids) {
    const child = tidyKids(kid.n);

    if (!('g' in child) && child.d === node.d) {
      for (const inner of child.kids) kids.push({ n: inner.n, w: inner.w * kid.w });
    } else kids.push({ n: child, w: kid.w });
  }

  if (kids.length === 1) return kids[0].n;
  const sum = kids.reduce((total, kid) => total + kid.w, 0);

  for (const kid of kids) kid.w /= sum;
  return { d: node.d, kids };
}

const kidLeaves = node => ('g' in node ? [node.g] : node.kids.flatMap(kid => kidLeaves(kid.n)));

const kidOut = (list, index) => {
  list.kids.splice(index, 1);
  const sum = list.kids.reduce((total, kid) => total + kid.w, 0) || 1;

  for (const kid of list.kids) kid.w /= sum;
};

const kidIn = (list, index, node) => {
  const count = list.kids.length;

  for (const kid of list.kids) kid.w *= count / (count + 1);
  list.kids.splice(index, 0, { n: node, w: 1 / (count + 1) });
}; // an even share, as i3 gives

/** The tree with g moved that way as i3 would, or null when it is that whole side already. */
function i3Move(tree, group, dir, seen) {
  const [ax, sg] = TILE_DIRS[dir];
  const direction = ax ? 'col' : 'row';
  const root = toKids(tree);
  const path = [];

  const find = node => {
    if ('g' in node) return node.g === group;

    for (let kidIndex = 0; kidIndex < node.kids.length; kidIndex++) {
      path.push({ n: node, i: kidIndex });
      if (find(node.kids[kidIndex].n)) return true;
      path.pop();
    }

    return false;
  };

  if (!find(root)) return null;

  const { n: parent, i: index } = path.at(-1);
  const leaf = parent.kids[index].n;
  const neighbor = parent.d === direction ? parent.kids[index + sg] : null;

  if (neighbor && 'g' in neighbor.n) {
    parent.kids[index + sg] = { n: leaf, w: neighbor.w };
    parent.kids[index] = { n: neighbor.n, w: parent.kids[index].w };
    return fromKids(tidyKids(root));
  } // its neighbour: trade places, the room where it was

  if (neighbor) {
    // a list across the arrow: into it, after the part the keys were in last
    const list = neighbor.n;
    const ls = kidLeaves(list);
    const last = seen.find(candidate => ls.includes(candidate)) ?? ls.at(-1);
    const kidIndex = list.kids.findIndex(kid => kidLeaves(kid.n).includes(last));

    kidOut(parent, index);
    kidIn(list, kidIndex + 1, leaf);
    return fromKids(tidyKids(root));
  }

  let depth = path.length - 2;

  while (depth >= 0 && path[depth].n.d !== direction) depth--; // out: the nearest list the arrow's way above
  if (depth < 0 && parent === root && parent.d === direction) return null; // its end already
  kidOut(parent, index);

  if (depth >= 0) {
    const { n: ancestor, i: ancestorIndex } = path[depth];

    kidIn(ancestor, sg > 0 ? ancestorIndex + 1 : ancestorIndex, leaf);
    return fromKids(tidyKids(root));
  }

  const rest = tidyKids(root);

  const half = [
    { n: rest, w: 0.5 },
    { n: leaf, w: 0.5 },
  ];

  return fromKids(tidyKids({ d: direction, kids: sg > 0 ? half : half.reverse() })); // none: the column's whole side, round the rest
}

/** The tiles tidied (2026-11-25): groups gs cut in turn, the first along the column's longer side, each the first
 *  part — the left, or the top — of the room left and the rest in its second, the cuts taking turns: the bigger tiles
 *  left and up, the smaller ones winding down to the bottom right. Every cut even. */
function tidyTree(gs, direction) {
  if (gs.length === 1) return { g: gs[0] };
  return { d: direction, r: 0.5, a: { g: gs[0] }, b: tidyTree(gs.slice(1), direction === 'row' ? 'col' : 'row') };
}

/** Every tile of the open chat put back in order, Claude's first, then the one the keys are in, then the rest in the
 *  tree's order (2026-11-26) — the left, on a wide column. Each tile keeps its
 *  group (its tabs, its terminal attached), the keys stay where they were; the halves of an untiled split go side by
 *  side, even — Claude's dragged to the second, they trade places as two tiles do (2026-11-26). */
function hotTidy() {
  const session = state.sessions.get(state.current);

  if (!session) return noChat();
  if (!prefs.autoTile) return note($('#shead'), 'Auto-tiling is off — Settings › Terminal › Auto-tiling');
  if (!isSplit(session)) return note($('#shead'), 'One tile — nothing to tidy');

  const rect = $('#groups').getBoundingClientRect();
  const direction = rect.width >= rect.height ? 'row' : 'col';

  if (!isTiled(session) && homeOf(session, 'chat') === 0) {
    if (direction === 'row') prefs.splitAt = 0.5;
    else prefs.stackAt = 0.5;
    savePrefs();
    zoomed.delete(session.id);
    if (stacked.has(session.id) !== (direction === 'col')) return stackSplit(session, direction === 'col');
    applySplit();
    fitTerm();
    return;
  }

  const gs = groupsOf(session);
  const cg = gs.find(group => keysIn(session, group).includes('chat')) ?? gs[0];

  const fg = gs.includes(focusG) && focusG !== cg ? [focusG] : []; // the keys' tile next: the biggest after claude's
  const next = tidyTree([cg, ...fg, ...gs.filter(group => group !== cg && !fg.includes(group))], direction);

  if (!tilesFit(session, next)) return note($('#shead'), `No room to tidy ${gs.length} tiles`);
  trees.set(session.id, next);
  zoomed.delete(session.id);
  applySplit();
  syncTerm(session);
  fitTerm();
  focusBoard();
  focusTerm();
}

/** ⌘D side by side, ⇧⌘D one over the other (2026-11-25, iTerm's pair): a new zsh in a tile cut from this one that way. */
function hotSplitTile(direction) {
  const session = state.sessions.get(state.current);

  if (!session) return noChat();
  if (!prefs.autoTile) return note($('#shead'), 'Auto-tiling is off — Settings › Terminal › Auto-tiling');
  focusBoard();
  startShell(session, true, direction);
}

// A tile by the mouse (2026-11-26, i3's floating modifier): with ⌥⌘⇧ held, Auto-tiling on and the column split, the
// pointer is the move cursor over the tiles (body.tilegrab) and a press anywhere on one lifts the whole tile — strip or
// none, a terminal's screen too, never a selection there. Dropped on another tile's outer quarter that way, it is a tile
// on that side of it (the room it left closing up); on its middle or its strip, its tabs join that tile's, as a tab
// dropped there does, and it folds (2026-11-26, later). Where it would go is shown while held (#tdrop).
/** The tree with tile g dropped at a side of tile t: out of where it was, a split of t with g there. */
function tileDropTree(tree, group, target, side) {
  const rest = treeMap(tree, group, () => null);
  const direction = side === 'left' || side === 'right' ? 'row' : 'col';
  const before = side === 'left' || side === 'top';

  return treeMap(rest, target, leaf =>
    before ? { d: direction, r: 0.5, a: { g: group }, b: leaf } : { d: direction, r: 0.5, a: leaf, b: { g: group } },
  );
}

{
  const grabbing = event => !!(event.metaKey && event.altKey && event.shiftKey && !event.ctrlKey) && tileKeysOn();
  const grabSync = event => document.body.classList.toggle('tilegrab', grabbing(event));

  for (const ev of ['keydown', 'keyup']) window.addEventListener(ev, grabSync, true);
  window.addEventListener('blur', () => document.body.classList.remove('tilegrab'));
  let lift = null;

  const zoneEl = () =>
    $('#tdrop') ||
    document.body.appendChild(Object.assign(document.createElement('div'), { id: 'tdrop', hidden: true }));

  /** Where a tile held at (x, y) would go: the tile under it, and a side of it or none (into its tabs); null over its own. */
  const dropAt = (pointerX, pointerY) => {
    const grp = document.elementFromPoint(pointerX, pointerY)?.closest('#groups > .grp');

    if (!grp || grp.hidden || +grp.dataset.g === lift.g) return null;

    const target = +grp.dataset.g;
    const rect = grp.getBoundingClientRect();
    const fx = (pointerX - rect.left) / rect.width;
    const fy = (pointerY - rect.top) / rect.height;

    const [side, near] = [
      ['left', fx],
      ['right', 1 - fx],
      ['top', fy],
      ['bottom', 1 - fy],
    ].sort((left, right) => left[1] - right[1])[0];

    const session = state.sessions.get(state.current);
    const edge = near <= 0.25 && !document.elementFromPoint(pointerX, pointerY).closest('.ptabs') ? side : null;
    const next = edge ? tileDropTree(trees.get(session.id) || halvesTree(session), lift.g, target, edge) : null;

    if (next && !tilesFit(session, next)) return null;

    const box =
      edge === 'left'
        ? [rect.left, rect.top, rect.width / 2, rect.height]
        : edge === 'right'
          ? [rect.left + rect.width / 2, rect.top, rect.width / 2, rect.height]
          : edge === 'top'
            ? [rect.left, rect.top, rect.width, rect.height / 2]
            : edge === 'bottom'
              ? [rect.left, rect.top + rect.height / 2, rect.width, rect.height / 2]
              : [rect.left, rect.top, rect.width, rect.height];

    return { t: target, side: edge || 'into', next, box };
  };

  // the two intentions drawn as a tab's drag draws them (2026-11-26): a tile moved, the solid half it would take
  // (#tdrop); its tabs into a group, the tile's own dashed outline (.grp.drop)
  const show = zone => {
    const el = zoneEl();
    const into = zone?.side === 'into';

    el.hidden = !zone || into;

    for (const tile of document.querySelectorAll('#groups > .grp.drop')) {
      tile.classList.toggle('drop', into && +tile.dataset.g === zone.t);
    }

    if (into && GEL[zone.t]) $(GEL[zone.t].grp).classList.add('drop');
    if (!zone || into) return;

    Object.assign(el.style, {
      left: `${zone.box[0]}px`,
      top: `${zone.box[1]}px`,
      width: `${zone.box[2]}px`,
      height: `${zone.box[3]}px`,
    });

    el.dataset.side = zone.side;
  };

  const end = () => {
    if (!lift) return;
    if (GEL[lift.g]) $(GEL[lift.g].grp).classList.remove('lifted');
    document.body.classList.remove('tiledrag');
    show(null);
    lift = null;
  };

  // capture: before a terminal's own mousedown, which would start a selection
  $('#groups').addEventListener(
    'pointerdown',
    event => {
      if (event.button !== 0 || !grabbing(event) || event.target.closest('.tdiv')) return;
      const grp = event.target.closest('#groups > .grp');

      if (!grp) return;
      event.preventDefault();
      event.stopPropagation();
      lift = { g: +grp.dataset.g, x: event.clientX, y: event.clientY, moved: false, zone: null };
      focusGroup(lift.g);
    },
    true,
  );

  $('#groups').addEventListener(
    'mousedown',
    event => {
      if (!lift && !grabbing(event)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );

  window.addEventListener('pointermove', event => {
    if (!lift) return grabSync(event);

    if (!lift.moved) {
      if (Math.hypot(event.clientX - lift.x, event.clientY - lift.y) < 5) return;
      lift.moved = true;
      $(GEL[lift.g].grp).classList.add('lifted');
      document.body.classList.add('tiledrag');
    }

    lift.zone = dropAt(event.clientX, event.clientY);
    show(lift.zone);
  });

  window.addEventListener('pointerup', () => {
    if (!lift) return;

    const { g: group, zone: dropZone } = lift;
    const session = state.sessions.get(state.current);

    end();
    if (!dropZone || !session) return;
    haptic('generic');
    zoomed.delete(session.id);
    if (dropZone.next) {
      trees.set(session.id, dropZone.next);
      focusG = group;
    } else tileInto(session, group, dropZone.t);
    applySplit();
    syncTerm(session);
    fitTerm();
    focusBoard();
    focusTerm();
  });

  window.addEventListener('pointercancel', end);
  window.addEventListener('blur', end);
}

/** Tile g's tabs into tile t's strip (2026-11-26), its front tab in front there, and g folded — down to one tile, the
 *  column one half. */
function tileInto(session, group, target) {
  if (!homes.has(session.id)) homes.set(session.id, new Map());
  const front = placeOf(session)[group];

  for (const key of keysIn(session, group)) homes.get(session.id).set(key, target);
  if (!isTiled(session)) trees.set(session.id, halvesTree(session));
  focusG = target;
  dropLeaf(session, group);
  if (front) setTab(session, front);
}

applySplit();

{
  const bar = $('#gsplit');
  let dragging = false;

  bar.addEventListener('mousedown', event => {
    dragging = true;
    bar.classList.add('drag');
    document.body.style.userSelect = 'none';
    event.preventDefault();
  });

  window.addEventListener('mousemove', event => {
    if (!dragging) return;

    const rect = $('#groups').getBoundingClientRect();
    const stack = stackNow();

    const raw = Math.max(
      0.15,
      Math.min(0.85, stack ? (event.clientY - rect.top) / rect.height : (event.clientX - rect.left) / rect.width),
    );

    const near = Math.abs(raw - 0.5) * (stack ? rect.height : rect.width) <= SNAP_PX;
    const at = near ? 0.5 : raw; // even halves pull (2026-10-11)

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
function closeTab(session, key) {
  // vim is asked to quit (2026-10-21): its tab goes when it does — and stays in front, saying why, over unsaved work
  if (isVimTab(session, key)) {
    api('DELETE', `/api/terminals/${shellOfTab(session, key).id}`).catch(error =>
      note(seen($('#ptabs')), `Could not quit vim: ${error.message}`, true),
    );

    return false;
  }

  const place = placeOf(session);
  const half = place.indexOf(key);

  if (half >= 0) {
    const ks = keysIn(session, half);
    const index = ks.indexOf(key);

    place[half] = ks[index + 1] || ks[index - 1] || null;
    tabs.set(session.id, place);
  }

  if (isShellTab(key)) {
    const shell = shellOfTab(session, key);

    if (shell) {
      api('DELETE', `/api/terminals/${shell.id}`).catch(error =>
        note(seen($('#ptabs')), `Could not end the zsh: ${error.message}`, true),
      );
    }

    syncTerm(session);
    return;
  }

  if (key === 'changes') changesOpen.delete(session.id);
  else if (key === 'timeline') timelineOpen.delete(session.id);
  else if (isAgentTab(key)) {
    const remaining = (agentTabs.get(session.id) || []).filter(tab => `agent:${tab.id}` !== key);

    if (remaining.length) agentTabs.set(session.id, remaining);
    else agentTabs.delete(session.id);
  } else if (isPageTab(key)) {
    state.paneGh.set(
      session.id,
      (state.paneGh.get(session.id) || []).filter(other => other !== key),
    );
  } else if (isBlankTab(key)) {
    blanks.set(
      session.id,
      (blanks.get(session.id) || []).filter(blank => `new:${blank.n}` !== key),
    );
  } else if ((state.paneWt.get(session.id) || []).includes(pageUrl(key))) {
    state.paneWt.set(
      session.id,
      state.paneWt.get(session.id).filter(url => url !== pageUrl(key)),
    );
  } else if (session.cwd) state.paneIde.delete(session.cwd);
  homes.get(session.id)?.delete(key);
  syncTerm(session);
}

/** A tab closed from anywhere but its own × — ⌥⌘W, the ··· menu (2026-09-28): the × is gone from a half the tab
      has to itself, which is exactly the half that empties. When the keys are in that half they go back to the chat,
      rather than stay in an empty half or on a zsh on its way out (a zsh ends when the server says so, a moment on). */
function dropTab(session, key) {
  const half = isSplit(session) ? homeOf(session, key) : 0;
  const last = keysIn(session, half).length === 1;

  if (closeTab(session, key) === false) return; // vim, asked to quit

  if (last && half === focusG) {
    if (isTiled(session) && groupsOf(session).length > 2) focusG = backOf(trees.get(session.id), half) ?? 0;
    else showChat(session);
    syncTerm(session);
  } // tiles: back to the one it was cut from

  focusBoard();
  focusTerm();
}

// ⌥⌘W: the tab the keys are in, closed — the zsh ended, a page or the editor let go. The split the board made for it
// folds with it; one asked for by hand keeps its half, empty. The chat's own tab has no ×, and no ⌥⌘W either.
function hotCloseTab() {
  const session = state.sessions.get(state.current);

  if (!session) return noChat();
  const key = tabOf(session);

  if (!key || key === 'chat') return note($('#shead'), 'The chat tab stays — ⌘W closes a half, ✓ ends the chat');
  dropTab(session, key);
}

// The take-over tooltip is the warning: for a VS Code chat it spells out what the tab there loses.
const VSC_COST =
  ' Its tab in VS Code goes dead and will not follow the chat — close it there; opening the chat in VS Code again starts another claude on it, and a bar here will say so.';

const takeTip = session => {
  const vs = inVsCode(session);

  const what = vs
    ? `the claude VS Code runs on this chat (pid ${session.live.pid})`
    : `claude (pid ${session.live.pid}) in its terminal`;

  return (
    (drawer.arm === session.id
      ? `Click again to end ${what} and resume the chat here${session.status === 'working' ? ' — Claude is mid-reply, and that reply will be lost' : ''}.`
      : `Take over: end ${what} and resume the chat here.`) + (vs ? VSC_COST : '')
  );
};

const sureWord = session =>
  session.status === 'working' ? 'sure? mid-reply' : inVsCode(session) ? 'sure? ends VS Code’s' : 'sure?';

const KEY_C = ' · ⌥⌘C'; // on every tip the button acts on; the disabled and failed ones say why instead

const termTip = session =>
  drawer.err
    ? drawer.err
    : termLive(session)
      ? (termFor(session.terminal.id)
          ? 'This chat runs here — the terminal is the pane'
          : "Show this chat's claude session") + KEY_C
      : takeable(session)
        ? takeTip(session) + KEY_C
        : attachable(session)
          ? ATTACH_TIP + KEY_C
          : session.alive
            ? `Live in ${entryLabel(session)} — it cannot be attached from here`
            : inVsCode(session)
              ? `Open a terminal on this chat (claude --resume). It was last continued in VS Code: from here on it is a CLI chat, and the tab there, if still open, will not follow it${
                  KEY_C
                }`
              : `Open a terminal on this chat (claude --resume)${KEY_C}`;

// Live somewhere that is not our drawer — iTerm, VS Code. Nothing respawns a CLI claude, and VS Code's
// extension does not respawn its own either (it launches one when a tab opens a chat, never after a
// death — measured 2026-09-20), so ending it and resuming here leaves one writer.
// A background session is not: `claude attach` opens it in a drawer, the one running, and closing the drawer leaves it so (2026-11-04).
const attachable = session => !!(session?.alive && inBackground(session) && session.live?.jobId && !termLive(session));
const takeable = session => !!(session?.alive && session.live?.pid && !termLive(session) && !attachable(session));
const ATTACH_TIP = 'Open this background session here (claude attach): it keeps running when the drawer closes';

// Two clicks, six seconds apart at most: the first arms the button (it turns red and says so), the
// second ends the other claude. renderHead re-runs on every update and reads the armed state back.
function armTakeOver(session) {
  drawer.arm = session.id;
  clearTimeout(drawer.armTimer);

  drawer.armTimer = setTimeout(() => {
    if (drawer.arm === session.id) {
      drawer.arm = null;
      renderHead(state.sessions.get(session.id) || session);
    }
  }, 6000);

  renderHead(session);
}

async function takeOver(session) {
  drawer.arm = null;
  clearTimeout(drawer.armTimer);
  renderResume(session);
  const tb = $('#termBtn');

  if (tb) {
    tb.disabled = true;
    const label = tb.querySelector('.lbl');

    if (label) label.textContent = 'ending…';
  }

  let result = null;

  try {
    result = await api('POST', `/api/sessions/${session.id}/takeover`, termSize());
  } catch (error) {
    drawer.err = error.message;
  }

  if (result) showTerminal(session, result.terminal);
  renderHead(state.sessions.get(session.id) || session);
}
