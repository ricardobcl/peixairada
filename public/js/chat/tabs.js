const termLive = session => !!(session?.terminal && session.terminal.exited === null);

/** The chat's zsh tabs (2026-10-13: ⌘T opens another beside the first): every live one, oldest first — the server's
      `shells`, each its tab `shell:<terminal id>`. */
const shellsOf = session =>
  (session?.shells || (session?.shell ? [session.shell] : [])).filter(term => term.exited === null);

// …and a vim of the in-app editor's is one of those tabs (2026-10-21, `editor`), never the chat's zsh
const zshsOf = session => shellsOf(session).filter(term => !term.editor);
const shellLive = session => zshsOf(session).length > 0;
const isShellTab = key => /^shell:/.test(key || '');
const shellOfTab = (session, key) => shellsOf(session).find(term => `shell:${term.id}` === key) || null;
const isVimTab = (session, key) => !!shellOfTab(session, key)?.editor;
// Which tab a chat is on — page state, per chat: 'chat' (the claude session while it runs here, else the rendered
// chat), 'shell:<id>' while a zsh of it lives, or one of its pages in the app's pane — 'gh:<url>' a GitHub page (a PR each),
// 'ide:<url>' its folder's editor (2026-09-20). The pages a chat opened are remembered here (state.paneGh per chat,
// state.paneIde per folder), so they come back with the chat; a tab whose page is gone falls back to the chat.
const tabs = new Map();
// Split, each tab belongs to one half's strip (2026-09-25): the chat's strip on the left and
// everything else on the right, until a tab is dragged across (moveTab). Written down only for the tabs that
// moved, and forgotten with the split — the next one starts from claude on the left again.
const homes = new Map(); // chat id → Map(tab → half), while that chat is split

const homeOf = (session, key) => {
  const half = homes.get(session.id)?.get(key) ?? (key === 'chat' ? 0 : 1);

  if (!isTiled(session)) return half;
  const gs = groupsOf(session); // a tile that went: its tabs went to the one beside it (closeTile), anything else to the first but the chat's

  if (gs.includes(half)) return half;
  const chatAt = key === 'chat' ? null : homeOf(session, 'chat');

  return gs.find(group => group !== chatAt) ?? gs[0];
};

/** The tabs a half's strip lists: every one of the chat's with one half, its own with two. */
const keysIn = (session, half) =>
  !isSplit(session) ? (half ? [] : tabKeys(session)) : tabKeys(session).filter(key => homeOf(session, key) === half);

const isPaneTab = key => /^(gh\d*|ide):/.test(key || '');
const isPageTab = key => /^gh\d*:/.test(key || ''); // a web page's: gh:<url>, or gh2:<url>… for the same page again

/** What each half is showing, read against the tabs it actually has now: a key that is gone falls away, and a
      half whose tab went shows the first of its own that is left — or nothing, which is what an emptied half says. */
function placeOf(session) {
  if (!session) return [null, null];

  const place = tabs.get(session.id) || [];
  const gs = groupsOf(session);

  return Array.from({ length: Math.max(2, ...gs.map(half => half + 1)) }, (_, half) => {
    if (!gs.includes(half)) return null;
    const ks = keysIn(session, half);

    return ks.includes(place[half]) ? place[half] : ks[0] || null;
  });
}

// Where each page actually is (2026-09-21): the key says where it was opened, the shell reports every navigation
// (peixPaneUrl, a KVO watch on the view's url), so a PR followed into a file or a review shows — and copies — the
// address on screen. Kept per key, so switching tabs and coming back keeps it; the shell re-sends on every pane
// message, which is what gives it back after a board reload.
const paneUrls = new Map();
let addrEdit = null; // a page's address being edited, { sid, key, q } (addrEditAt)
const bareUrl = url => url.replace(/^https?:\/\//, '');

/** An address as the strip shows it: no scheme, the host quieter than the rest (2026-10-11). */
const urlHtml = url => {
  const bare = bareUrl(url);
  const slash = bare.indexOf('/');

  return slash < 0
    ? `<span class="h">${esc(bare)}</span>`
    : `<span class="h">${esc(bare.slice(0, slash + 1))}</span>${esc(bare.slice(slash + 1))}`;
};

// The editor's address is its folder (2026-10-12): VS Code Web's is 127.0.0.1:7332/?folder=%2FUsers%2F… — it says
// VS Code · storefront, the URL in its tooltip, and a click still copies the URL.
const ideName = url => {
  try {
    const folder = new URL(url).searchParams.get('folder');

    return folder ? folder.replace(/\/+$/, '').split('/').pop() : '';
  } catch {
    return '';
  }
};

const ideLabels = new Map(); // a worktree's editor (2026-10-13): its URL → `<repo> @ <branch>`, the name of its tab
const ideLabel = key => ideLabels.get(pageUrl(key)) || null;

const addrHtml = (key, url) =>
  key.startsWith('ide:') && (ideLabel(key) || ideName(url))
    ? `<span class="h">VS Code · </span>${esc(ideLabel(key) || ideName(url))}`
    : urlHtml(url);

const pageUrl = key => key.slice(key.indexOf(':') + 1); // where a tab was opened — all the shell reads of its key
const purlTip = (key, url) => `${url} — ${/^gh\d*:/.test(key) ? 'click to change it' : 'click to copy'}`; // a page's address is edited, the editor's copied (2026-10-27)
const paneUrl = key => paneUrls.get(key) || pageUrl(key);

/** An address at a page: the page, or further into it — a PR's files, a comment on it, its checks. */
const atPage = (addr, url) => {
  const trimmed = url.replace(/\/+$/, '');

  return addr === url || (addr.startsWith(trimmed) && /^([/?#]|$)/.test(addr.slice(trimmed.length)));
};

/** The chat's tab for a page (2026-10-13): the one opened at it while it is still there, else any that is there now.
 *  A tab followed somewhere else is that somewhere's — opening the page again gives it a tab of its own. */
const pageTab = (session, url) => {
  const at = (state.paneGh.get(session.id) || []).filter(key => atPage(paneUrl(key), url));

  return at.find(key => pageUrl(key) === url) || at[0] || null;
};

/** A new tab's key for a page: gh:<url>, else gh2:<url>, gh3:<url>… — none a tab of the chat has, nor one whose view
 *  the shell keeps somewhere else (a closed tab's lingers where it was left, and a key is shown as its view stands). */
function pageKey(session, url) {
  const had = new Set(state.paneGh.get(session.id) || []);

  for (let copy = 1; ; copy++) {
    const key = `gh${copy > 1 ? copy : ''}:${url}`;

    if (!had.has(key) && (!paneUrls.has(key) || atPage(paneUrls.get(key), url))) return key;
  }
}

window.peixPaneUrl = (key, url) => {
  if (!url) return;
  if (paneUrls.get(key) !== url) keepTabsSoon(); // where a tab went decides what opening its page again does (pageTab)
  paneUrls.set(key, url);

  for (const el of document.querySelectorAll('.purl')) {
    if (el.dataset.key === key) {
      el.dataset.url = url;
      el.innerHTML = addrHtml(key, url);
      el.title = purlTip(key, url);
      el.closest('.ptabs')._drawn = null;
    }
  }
};

const ideKey = session =>
  inApp && session?.cwd && state.paneIde.get(session.cwd) ? `ide:${state.paneIde.get(session.cwd)}` : null;

const paneKeys = session =>
  !inApp || !session
    ? []
    : [
        ...(state.paneGh.get(session.id) || []),
        ...(ideKey(session) ? [ideKey(session)] : []),
        ...(state.paneWt.get(session.id) || []).map(url => `ide:${url}`),
      ];

// A blank tab (2026-10-13, ⌘T on a page): a browser's new tab — nothing on it yet, its address a box with the keys in
// it, and under it, in the half, what the box would open (blankHtml). `new:<n>`, after the pages; the page chosen
// takes its place (fillBlank). Page state only, as the changes tab is.
const blanks = new Map(); // chat id → [{ n, q, sel }]: the box's text and the row ⏎ opens
let blankSeq = 0;
const isBlankTab = key => /^new:/.test(key || '');

const blankOf = (session, key) =>
  ((session && blanks.get(session.id)) || []).find(blank => `new:${blank.n}` === key) || null;

const tabKeys = session => [
  'chat',
  ...shellsOf(session).map(term => `shell:${term.id}`),
  ...(session && changesOpen.has(session.id) ? ['changes'] : []),
  ...(session && timelineOpen.has(session.id) ? ['timeline'] : []),
  ...(session ? (agentTabs.get(session.id) || []).map(agent => `agent:${agent.id}`) : []),
  ...paneKeys(session),
  ...((session && blanks.get(session.id)) || []).map(blank => `new:${blank.n}`),
];

const tabOf = session => placeOf(session)[focusG];

/** A tab put on show, in the half whose strip lists it — the one there is, unsplit — and the keys go with it.
      There is one transcript, one xterm per half and one web view per page, so a tab lives in exactly one half;
      choosing it never pulls it across (that is a drag, moveTab). */
function setTab(session, key) {
  const half = isSplit(session) ? homeOf(session, key) : 0;
  const place = placeOf(session);

  place[half] = key;
  tabs.set(session.id, place);
  focusG = half;
}

/** A tab dragged onto the other half: its strip is that half's now, and it is on show there. The half it left
      shows the next of its own, or nothing — and a split the board made itself folds away then (syncTerm). */
function moveTab(session, key, half) {
  if (!isSplit(session)) return;
  haptic('generic'); // the tab let go in the other half: felt as it lands
  if (!homes.has(session.id)) homes.set(session.id, new Map());
  homes.get(session.id).set(key, half);
  setTab(session, key);
}

/** A tab that has just come into being — a zsh, a GitHub page, the editor — opens in the *second* half, and
 *  splits the column the first time (2026-09-22): what you open a second tab for is to have it beside the chat, not
 *  instead of it. Only the first one splits; after that a new tab lands wherever the keys are, like everything else.
 *  Choosing a tab that already exists is openTab's and never splits. The split the board makes itself goes again on
 *  its own, in syncTerm, once the chat is down to one tab — an empty half is what ⌘2 is for, not what a zsh's exit
 *  leaves. Claude keeps the first half (2026-09-25): a split puts the chat on the left whatever the column was
 *  showing, and a new tab goes into the half the chat is not in — so it never takes the chat's place. */
function openNewTab(session, key, cut) {
  if (cut === 'here') {
    // ⌥⌘⇧T: in the keys' strip, as if dragged there; one half stays one
    if (isSplit(session)) {
      if (!homes.has(session.id)) homes.set(session.id, new Map());
      homes.get(session.id).set(key, focusG);
    }

    return setTab(session, key);
  }

  if (prefs.autoTile && isShellTab(key) && tileTerm(session, key, cut)) return;

  if (!isSplit(session) && prefs.autoTile && isShellTab(key)) {
    if (cut ? cut === 'col' : tallOf('#groups')) stacked.add(session.id);
    else stacked.delete(session.id);
  } // the first split too, by the column's shape or ⌘D's

  if (!isSplit(session)) splitChat(session, true);
  homes.get(session.id).set(key, besideChat(session));
  setTab(session, key);
}

/** Where a tab opened beside the chat goes: the other half; tiled, the tile the keys are in when the chat is not
 *  there, else the first that is not the chat's. */
function besideChat(session) {
  const chatAt = homeOf(session, 'chat');

  if (!isTiled(session)) return 1 - chatAt;
  const gs = groupsOf(session);

  return focusG !== chatAt && gs.includes(focusG) ? focusG : (gs.find(group => group !== chatAt) ?? gs[0]);
}

// A terminal a tile of its own (2026-11-25, prefs.autoTile; zsh and vim — pages, the changes, the timeline and the
// agents stay tabs): an empty half or tile takes it, the one the keys are in first; else the tile the keys are in is
// cut in two along its longer side (2026-11-25, later: as i3's autotiling — taller than wide, one over the other,
// else side by side, so the cuts take turns as the tiles shrink), the new terminal in its second part. Not split yet,
// it is the first split, by the column's shape (false: openNewTab makes it). ⌘2 / ⌥⌘2 still turn a split after.
// A part under TILE_MIN is no tile: false, a tab beside the chat. ⌘D / ⇧⌘D (`cut`, 2026-11-25) name the direction, and
// always cut: no empty tile takes the terminal, and no room is said.
const tallOf = sel => {
  const rect = $(sel).getBoundingClientRect();

  return rect.height > rect.width;
};

/** Whether tile `group` is taller than wide as the tree lays it out (2026-11-26): zoomed, its own shape, not the column's. */
const tallTile = (session, group) => (size => size.h > size.w)(tileSizes(session, treeOf(session))[group]);
const TILE_MIN = { cols: 24, rows: 6 }; // the least a tile is for: a half side by side is under 80 already

function tileTerm(session, key, cut) {
  if (!isSplit(session)) return false;
  if (!homes.has(session.id)) homes.set(session.id, new Map());

  const gs = groupsOf(session);
  const empty = cut ? undefined : [focusG, ...gs].find(group => gs.includes(group) && !keysIn(session, group).length);

  if (empty !== undefined) {
    homes.get(session.id).set(key, empty);
    setTab(session, key);
    return true;
  }

  const at = gs.includes(focusG) ? focusG : gs[0];
  const direction = cut || (tallTile(session, at) ? 'col' : 'row');

  if (!roomFor(session, at, direction)) {
    if (cut) {
      note(
        $('#shead'),
        `No room to cut this tile ${cut === 'col' ? 'one over the other' : 'side by side'} — a tab beside it`,
      );
    }

    return false;
  }

  cutTile(session, key, at, direction, false);
  return true;
}

/** Tile `at` cut in two along `direction`, tab `key` alone in the new part — its second, or its first (`before`: the left or top). */
function cutTile(session, key, at, direction, before) {
  if (!trees.has(session.id)) trees.set(session.id, halvesTree(session)); // the halves as they stand
  const have = leavesOf(trees.get(session.id));
  let group = 1;

  while (have.includes(group)) group++;
  ensureGroups(group + 1);
  const place = tabs.get(session.id);

  if (place) place[group] = null; // whatever a tile there before showed

  trees.set(
    session.id,
    treeMap(trees.get(session.id), at, leaf =>
      before ? { d: direction, r: 0.5, a: { g: group }, b: leaf } : { d: direction, r: 0.5, a: leaf, b: { g: group } },
    ),
  );

  zoomed.delete(session.id);
  homes.get(session.id).set(key, group);
  setTab(session, key);
}

/** A tab put in a tile of its own at a side of tile `at` (2026-11-25; a drag to a tile's edge): the tile cut there. One
 *  half: the split, that side the tab's, the rest the other's. */
function tabToSide(session, key, at, side) {
  const direction = side === 'left' || side === 'right' ? 'row' : 'col';
  const before = side === 'left' || side === 'top';

  if (isSplit(session)) return cutTile(session, key, at, direction, before);
  if (direction === 'col') stacked.add(session.id);
  else stacked.delete(session.id);

  const here = keysIn(session, 0);
  const rest = here.filter(tab => tab !== key);
  const mine = before ? 0 : 1;

  splitChat(session, false);
  for (const tab of here) homes.get(session.id).set(tab, tab === key ? mine : 1 - mine);
  const place = [null, null];

  place[mine] = key;
  place[1 - mine] = rest.includes(placeOf(session)[0]) ? placeOf(session)[0] : rest[0];
  tabs.set(session.id, place);
  focusG = mine;
}

/** Whether both parts of `group`, cut in two along `direction`, hold a terminal of TILE_MIN — read off the tree (tileSizes). */
function roomFor(session, group, direction) {
  const NEW = -1; // the part to come: no group yet

  return tilesFit(
    session,
    treeMap(treeOf(session), group, leaf => ({ d: direction, r: 0.5, a: leaf, b: { g: NEW } })),
    [group, NEW],
  );
}

/** The chat's column as a tree: its tiles, its two halves, or its one. */
const treeOf = session =>
  isTiled(session) ? trees.get(session.id) : isSplit(session) ? halvesTree(session) : { g: 0 };

const TILE_GAP = 5; // #groups.tiled's gap, #gsplit's width (layout.css, sidebar.css)
const TILE_EDGE = 2; // a tile's border, a pixel a side (sidebar.css)
const STRIP_H = 38; // .ptabs' height, where none is drawn to read it off

/** Each tile's box and body in px as `tree` lays out the split column (2026-11-26): #groups' content box — split, it
 *  pads down under the floating header — cut along the tree's lines, less the gaps between tiles, each one's border,
 *  and its strip when its tabs give it one. The tree's reading, not the boxes': zoomed, a tile's box is the column's,
 *  and a tile to come has none. A group the chat does not show yet has no strip: a terminal alone in its tile. */
function tileSizes(session, tree) {
  const box = $('#groups');
  const cs = getComputedStyle(box);
  const px = value => parseFloat(value) || 0;
  const split = isSplit(session);
  const top = split ? px(cs.paddingTop) : px($('#chat').style.getPropertyValue('--float-h')); // one half pads its tile, not #groups
  const boxWidth = box.clientWidth - (split ? px(cs.paddingLeft) + px(cs.paddingRight) : 0);
  const boxHeight = box.clientHeight - top - (split ? px(cs.paddingBottom) : 0);

  const rects = tileRects(tree);
  const quantize = value => Math.round(value * 1e4);

  const lines = axis =>
    [...new Set(Object.values(rects).flatMap(rect => [quantize(rect[axis]), quantize(rect[axis + 2])]))].sort(
      (left, right) => left - right,
    );

  const xs = lines(0);
  const ys = lines(1);
  const span = (cuts, from, to) => cuts.indexOf(quantize(to)) - cuts.indexOf(quantize(from));
  const fw = boxWidth - (xs.length - 2) * TILE_GAP;
  const fh = boxHeight - (ys.length - 2) * TILE_GAP;

  const stripH = Math.max(0, ...terms.map(term => $(term.el.tabs).offsetHeight)) || STRIP_H;
  const gs = groupsOf(session);

  const strip = group => {
    if (!gs.includes(group)) return false;
    const ks = keysIn(session, group);

    return ks.length !== 1 || isPageTab(ks[0]) || isBlankTab(ks[0]); // renderTabs' .lone, the other way round
  };

  const out = {};

  for (const [group, rect] of Object.entries(rects)) {
    const width = (rect[2] - rect[0]) * fw + (span(xs, rect[0], rect[2]) - 1) * TILE_GAP;
    const height = (rect[3] - rect[1]) * fh + (span(ys, rect[1], rect[3]) - 1) * TILE_GAP;

    out[group] = { w: width, h: height, bw: width - TILE_EDGE, bh: height - TILE_EDGE - (strip(+group) ? stripH : 0) };
  }

  return out;
}

/** Whether the tiles `gs` of a tree (all of them, by default) each hold a terminal of TILE_MIN, by the cell of one drawn now. */
function tilesFit(session, tree, gs = null) {
  const sizes = tileSizes(session, tree);
  const { cw, ch } = termCell();

  return (gs || Object.keys(sizes)).every(
    group => sizes[group].bw / cw >= TILE_MIN.cols && sizes[group].bh / ch >= TILE_MIN.rows,
  );
}

/** A terminal's cell in px, read off a drawn terminal's screen (2026-11-26): its body is no measure — a TUI that has
 *  not filled it (claude's 14 rows in a tile of 30) made a row twice its height, and tiles that fit were refused. */
function termCell() {
  for (const term of terms) {
    const sc = term.xt?.cols && $(term.el.tbody)?.querySelector('.xterm-screen')?.getBoundingClientRect();

    if (sc?.width && sc.height) return { cw: sc.width / term.xt.cols, ch: sc.height / term.xt.rows };
  }

  return { cw: 8, ch: 17 };
}

/** Tile `group` closed (⌘W on it, its ⨯): its tabs go to the tile it was split from, and the room with them. */
function closeTile(session, group) {
  const to = backOf(trees.get(session.id), group);

  if (to === null) return;
  for (const key of keysIn(session, group)) homes.get(session.id).set(key, to);
  if (focusG === group) focusG = to;
  dropLeaf(session, group);
}

/** Leaf `group` out of the chat's tree, its sibling taking its place; down to one, the column is one again. */
function dropLeaf(session, group) {
  const back = backOf(trees.get(session.id), group);
  const tree = treeMap(trees.get(session.id), group, () => null);

  if (zoomed.get(session.id) === group) zoomed.delete(session.id);

  if (tree && !('g' in tree)) {
    trees.set(session.id, tree);
    if (!leavesOf(tree).includes(focusG)) focusG = back ?? leavesOf(tree)[0];
    return;
  }

  const left = tree ? placeOf(session)[tree.g] : null;

  unsplit(session, left || 'chat');
  focusG = 0;
}

/** A tile emptied — its zsh exited, its last tab dragged away — goes, as a split the board made goes with its half.
 *  Down to two tiles, they are a split's halves (2026-11-26): one asked for by hand keeps its empty half, moved or not. */
function foldTiles(session) {
  while (isTiled(session) && (autoSplit.has(session.id) || groupsOf(session).length > 2)) {
    const group = groupsOf(session).find(tile => !keysIn(session, tile).length);

    if (group === undefined) return;
    dropLeaf(session, group);
  }
}

/** The chat tab brought forward — Esc from a page, ⌥⌘C, the focus view's row: into its own half, the left one
 *  unless it was dragged, and the keys go there rather than the chat coming into the half they were in. */
const showChat = session => setTab(session, 'chat');

/** The column in two for this chat: the chat on the left and every other tab on the right, showing what the
 *  column was when that was not the chat — so ⌘2 over a zsh puts claude beside it rather than the other way round. */
function splitChat(session, auto) {
  const was = placeOf(session)[0];

  splits.add(session.id);
  trees.delete(session.id);
  if (auto) autoSplit.add(session.id);
  else autoSplit.delete(session.id);
  homes.set(session.id, new Map());
  tabs.set(session.id, ['chat', was !== 'chat' ? was : null]);
}

/** One half again: every tab back in the one strip, the one showing being what `keep` says. */
function unsplit(session, keep) {
  splits.delete(session.id);
  autoSplit.delete(session.id);
  homes.delete(session.id);
  trees.delete(session.id);
  tabs.set(session.id, [keep, null]);
}

/** A page's tab is named for where it is (2026-10-13; where it was opened before): a PR as repo#n, else its host. */
const paneLabel = url => {
  const match = /github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/.exec(url);

  if (match) return `${match[1]}#${match[2]}`;

  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'page';
  }
};

// Keep the pane right for the viewed chat: the body under the strip — its zsh on that tab, its claude drawer while
// it runs here (attached under a page's tab too: the native pane covers it, nothing re-attaches on the way back), the
// transcript otherwise — then the strip, then the shell's word (postPane). Runs on every open and SSE update, so it
// never re-attaches what it shows.
function syncTerm(session) {
  // the zsh exited, the page was forgotten, the last tab was dragged out: a split of the board's own goes with its half
  if (isTiled(session)) foldTiles(session);
  else if (session && autoSplit.has(session.id) && (!keysIn(session, 0).length || !keysIn(session, 1).length)) {
    const shown = placeOf(session);

    unsplit(session, shown[0] || shown[1]);
  }

  applySplit(); // the split belongs to the chat, so the column follows whichever is open
  const place = placeOf(session);

  for (const tm of terms) {
    const key = place[tm.g];

    const want =
      !session || !key
        ? null
        : isShellTab(key)
          ? shellOfTab(session, key)
          : key === 'chat' && termLive(session)
            ? session.terminal
            : null;

    if (want) {
      if (tm.id !== want.id || tm.lost) attachTerm(tm, want);
    } else if (tm.id) {
      detachTerm(tm);
      showDrawer(tm, false);
    }
  }

  placeLog(session, place);
  placeChanges(session, place);
  placeTimeline(session, place);
  placeAgent(session, place);
  renderTabs(session, place);
  placeBlanks(session, place);
  postPane(session, place);
  keepTabsSoon(); // the tabs as they stand outlive a reload (2026-10-16)
}

// There is one transcript and it goes to whichever half holds the chat tab — moved, not copied, so the renderer
// and its scroll position stay put. A live drawer is that half's body, so the transcript hides under it rather
// than move; a half with no tab at all says what would fill it.
function placeLog(session, place) {
  const el = $('#log');
  const at = session ? place.indexOf('chat') : 0;
  const half = at < 0 ? 0 : at; // shown nowhere: parked in the left half

  const host = $(GEL[half].body);

  if (el.parentElement !== host) {
    const top = el.scrollTop;

    host.insertBefore(el, host.firstChild);
    el.scrollTop = top;
  }

  const was = el.hidden;

  el.hidden = at < 0 || !!terms[half].id;
  for (const tm of terms) $(tm.el.body).classList.toggle('haslog', !el.hidden && el.parentElement === $(tm.el.body)); // as .nostrip
  if (was && !el.hidden) el.scrollTop = el.scrollHeight; // out from under the drawer: what came while it was hidden was never scrolled to

  for (const tm of terms) {
    const host = $(tm.el.body);
    const had = host.querySelector('.gempty');
    const want = isSplit(session) && !place[tm.g] && groupsOf(session).includes(tm.g);

    if (want && !had) {
      host.insertAdjacentHTML(
        'beforeend',
        '<div class="gempty">Nothing in this half.<br>⌥⌘T a zsh · ⌥⌘G its PR · ⌥⌘E the editor<br>— or drag a tab here from the other half</div>',
      );
    } else if (!want && had) had.remove();
  }
}

// A half's strip lists its own tabs — [claude|chat], [zsh ×], a [repo#n ×] per GitHub page, [VS Code ×] — the
// one on show marked `on`: with one half that is every tab the chat has, with two it is that half's (keysIn), and
// a tab goes across by being dragged there. The left half's strip hides while the chat is one tab and nothing is
// split, as it always did; an empty half's shows, since it is where a tab is dropped. While there are two, each
// strip ends in the ⨯ that closes *its* half (⌘W closes the one the keys are in). With a page's tab on, ‹ › ↻ ↗ for
// its view at the right, and the address it is at. A half whose one tab is not a web page — claude, the zsh, the
// editor — has no strip at all (.lone, 2026-09-28): ⌥⌘W and the ··· menu close what its × would
// have, ⌘W and ⌘0 the half, and ⌥⌘1 / ⌥⌘2 against ⌘1 / ⌘2 turn it.
function renderTabs(session, place = placeOf(session)) {
  const two = isSplit(session);

  if (session && two) {
    const recent = tileSeen.get(session.id) || [];

    if (recent[0] !== focusG) tileSeen.set(session.id, [focusG, ...recent.filter(group => group !== focusG)]);
  } // where the keys are, drawn: the arrows' memory

  for (const tm of terms) {
    const group = tm.g;
    const el = $(tm.el.tabs);
    const cur = place[group];
    const keys = session ? keysIn(session, group) : group ? [] : ['chat'];

    const lone = two && keys.length === 1 && !isPageTab(keys[0]) && !isBlankTab(keys[0]); // a page's or a blank tab's strip is its address

    $(tm.el.grp).classList.toggle('on', group === focusG);
    el.hidden = group === 0 ? !two && keys.length < 2 : false;
    $(tm.el.grp).classList.toggle('nostrip', el.hidden); // the floating header's rules read it — a class, not :has() (2026-10-13)
    el.classList.toggle('lone', lone);

    if (el.hidden || lone || (session ? !groupsOf(session).includes(group) : group > 0)) {
      setHtml(el, '');
      el._on = null;
      continue;
    } // nothing drawn, nothing left over to be found

    const tip = two ? ' · drag it to the other half to move it there' : '';

    // each tab with its mark before its name (2026-10-08, as the agent apps' strips have them): Claude's burst, the
    // shell's prompt, a PR's or a page's, VS Code's; its × drawn over the mark, under the pointer (2026-10-11, Q1); the
    // page in front its own address, with ‹ › ↻ ↗ in it (Q5) and a copy of the address (2026-10-20) — a div, since it
    // holds buttons
    const tab = (key, label, title, closeTip, icon = '') => {
      const close = closeTip ? `<span class="x" title="${esc(closeTip)}">${ICON.close}</span>` : '';

      if (cur === key && isBlankTab(key)) {
        return `<div class="ptab on addr blank" role="tab" aria-selected="true" data-tab="${esc(key)}" title="${esc(`A new tab — type an address, or words to search${tip}`)}">${icon}<input class="paddr" type="text" placeholder="Search or enter an address" aria-label="Address" spellcheck="false" autocomplete="off" autocapitalize="off">${close}</div>`;
      }

      const editing = cur === key && addrEdit?.sid === session?.id && addrEdit.key === key; // a page's address, clicked: a box (2026-10-27)

      if (cur === key && isPaneTab(key)) {
        return (
          `<div class="ptab on pane addr${editing ? ' editing' : ''}" role="tab" aria-selected="true" tabindex="0" data-tab="${esc(key)}" title="${esc(title + tip)}">${icon}${
            editing
              ? `<input class="pedit" type="text" data-key="${esc(key)}" aria-label="Address" spellcheck="false" autocomplete="off" autocapitalize="off">`
              : `<span class="purl" data-key="${esc(key)}" data-url="${esc(paneUrl(key))}" title="${esc(purlTip(key, paneUrl(key)))}">${addrHtml(key, paneUrl(key))}</span>`
          }<span class="navs">` +
          `<button class="nav" data-nav="back" title="Back">${ICON.back}</button><button class="nav" data-nav="forward" title="Forward">${ICON.forward}</button><button class="nav" data-nav="reload" title="Reload">${ICON.reload}</button><button class="nav pcopy" title="Copy this page's address">${ICON.copyAddr}${ICON.copied}</button><button class="nav" data-nav="external" title="Open this page in your browser">${ICON.external}</button></span>${close}</div>`
        );
      }

      return `<button class="ptab${cur === key ? ' on' : ''}${isPaneTab(key) ? ' pane' : ''}" role="tab" aria-selected="${cur === key}" data-tab="${esc(key)}" title="${esc(title + tip)}">${icon}${esc(label)}${close}</button>`;
    };

    // the half's own, ◫ (or ⊟) and ⨯, behind a ⋯ at the strip's end (Q5)
    const over = isTiled(session) ? parentOf(trees.get(session.id), group)?.d === 'col' : stackNow(); // tiled: the split this tile is half of

    const half = two
      ? `<button class="gmore" title="This half: turn the split, close it">${ICON.more}</button><span class="gacts">` +
        `<button class="nav gturn" data-to="${over ? 'side' : 'over'}" title="${over ? 'The halves side by side · ⌘1 ⌘2' : 'The halves one over the other · ⌥⌘1 ⌥⌘2'}">${over ? ICON.side : ICON.over}</button>${
          prefs.autoTile
            ? `<button class="nav gtidy" title="Tidy the tiles: Claude's on the left, each next one half of the room left, the bigger ones left and up">${ICON.tidy}</button>`
            : ''
        }<button class="nav gclose" title="Close this half — the other one becomes the whole column · ⌘0 from that one">${ICON.close}</button></span>`
      : '';

    const html = `<div class="ptrack">${keys
      .map(key =>
        key === 'chat'
          ? tab(
              key,
              termLive(session) ? 'claude' : 'chat',
              `${termLive(session) ? 'The claude session' : 'The rendered chat'} · ⌥⌘C`,
              '',
              ICON.claude,
            )
          : isVimTab(session, key)
            ? tab(
                key,
                shLabel(session, key),
                `Vim in ${shellOfTab(session, key).cwd || session.cwd || 'its folder'} · ⌥⌘E`,
                'Quit vim — it stays, saying so, over unsaved work',
                ICON.vim,
              )
            : isShellTab(key)
              ? tab(
                  key,
                  shLabel(session, key),
                  `A ${shName()} in ${session.cwd || 'its folder'} · ⌥⌘T · ⌘T another`,
                  'End this shell',
                  ICON.term,
                )
              : key === 'changes'
                ? tab(
                    key,
                    'changes',
                    `What this chat changed in ${session.cwd || 'its folder'} · ⌥⌘D`,
                    'Close the changes',
                    ICON.diff,
                  )
                : key === 'timeline'
                  ? tab(
                      key,
                      'timeline',
                      'This chat and its PRs in the order things happened · ⌥⌘J',
                      'Close the timeline',
                      ICON.timeline,
                    )
                  : isAgentTab(key)
                    ? tab(
                        key,
                        agTabName(session, key),
                        `${agTabName(session, key, true)} · an agent of this chat's, read-only`,
                        'Close this tab — the agent carries on',
                        ICON.lock,
                      )
                    : isPageTab(key)
                      ? tab(
                          key,
                          paneLabel(paneUrl(key)),
                          GH_PR.test(paneUrl(key)) ? `${paneUrl(key)} · ⌥⌘G` : paneUrl(key),
                          'Close this page',
                          GH_PR.test(paneUrl(key)) ? ICON.pr : ICON.globe,
                        )
                      : isBlankTab(key)
                        ? tab(key, 'New tab', 'A new tab, nothing on it yet · ⌘T', 'Close this tab', ICON.globe)
                        : ideLabel(key)
                          ? tab(
                              key,
                              ideLabel(key),
                              `${ideName(pageUrl(key))} — a worktree — in VS Code Web`,
                              'Close the editor',
                              ICON.vscode,
                            )
                          : tab(key, 'VS Code', `${session.cwd} in VS Code Web · ⌥⌘E`, 'Close the editor', ICON.vscode),
      )
      .join('')}${two && !keys.length ? '<span class="pdrop">drop a tab here</span>' : ''}</div>${half}`;

    // the strip moves (2026-10-11): what it held is read before it is drawn anew, for tabMotion — only when it will be
    const prev =
      el._drawn !== html && el._sid === session?.id && !REDUCED.matches
        ? [...el.querySelectorAll('.ptab[data-tab]')].map(element => ({
            k: element.dataset.tab,
            l: element.offsetLeft,
            w: element.offsetWidth,
            on: element.classList.contains('on'),
            html: element.innerHTML,
          }))
        : null;

    const box = el.querySelector('.ptab.blank .paddr, .ptab.editing .pedit');
    const typing = box && document.activeElement === box && [box.selectionStart, box.selectionEnd];

    const sl = el._drawn !== html ? el.querySelector('.ptrack')?.scrollLeft || 0 : 0; // the tabs' box is drawn anew: where it was scrolled to goes with it

    const drew = setHtml(el, html);
    const track = el.querySelector('.ptrack');

    if (drew && track) track.scrollLeft = sl;
    const grow = drew && prev?.length ? tabMotion(el, prev) : null; // a strip coming out of hiding just appears

    // the tab in front scrolled to when it is another (2026-10-30) — not on every draw, which would undo a swipe —,
    // once it has grown in if it is new: a box still growing is scrolled short of it (and may be drawn anew meanwhile)
    const on = track?.querySelector('.ptab.on[data-tab]');
    const at = `${session?.id} ${cur}`;
    const smooth = !!prev;

    if (on && el._on !== at) {
      el._on = at;

      const go = () => {
        const trackNow = el.querySelector('.ptrack');
        const front = trackNow?.querySelector('.ptab.on[data-tab]');

        if (front && el._on === at) revealTab(trackNow, front, smooth);
      };

      if (grow) grow.finished.then(go, go);
      else go();
    } else if (drew && track) trackEdges(track);
    // a blank tab's box keeps what was typed out of the markup, so typing redraws nothing — and is given it back when
    // something else redraws the strip, the keys and the caret too
    const nb = drew && el.querySelector('.ptab.blank .paddr, .ptab.editing .pedit'); // not a closed one's stand-in, folding

    if (nb) {
      nb.value = nb.matches('.pedit') ? addrEdit.q : blankOf(session, nb.closest('.ptab').dataset.tab)?.q || '';

      if (typing) {
        nb.focus();
        nb.setSelectionRange(...typing);
      }
    }

    if (el._drawn === html) fadeSoon();
    el._sid = session?.id;
  }

  if (addrEdit && !document.querySelector('.ptabs .ptab.editing')) addrEdit = null; // its tab gone from the front: let go
}

// A strip that changed under the same chat moves rather than jumps (2026-10-11, Linear's and Arc's strips): the
// highlight slides from the tab that had it to the one that has it (a pill over the strip, the new tab plain until it
// lands), a new tab grows in from nothing, and a closed one folds where it stood (a stand-in, .ptabgone, not a .ptab:
// whatever counts the tabs counts the real ones). A key's switch of tab slides too: it is one move, not a walk.
// The tabs' box (.ptrack) is where all of it happens: the stand-ins and the pill go in it, to scroll with the tabs.
// Returns the tab in front's growing in, when it is new.
function tabMotion(el, prev) {
  const track = el.querySelector('.ptrack');

  const now = [...el.querySelectorAll('.ptab[data-tab]')];
  const had = new Set(prev.map(old => old.k));
  const has = new Set(now.map(element => element.dataset.tab));

  let grow = null;

  for (const element of now) {
    if (!had.has(element.dataset.tab)) {
      const cs = getComputedStyle(element);
      const width = element.offsetWidth;

      const animation = element.animate(
        [
          { width: '0px', paddingLeft: '0px', paddingRight: '0px', opacity: 0 },
          { width: `${width}px`, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, opacity: 1 },
        ],
        { duration: 200, easing: EASE_OUT, id: 'tabgrow' },
      );

      if (element.classList.contains('on')) grow = animation;
      noteMotion(element.dataset.tab, 'tabgrow');
    }
  }

  prev.forEach((old, index) => {
    if (has.has(old.k)) return;

    const after = prev
      .slice(index + 1)
      .map(later => now.find(element => element.dataset.tab === later.k))
      .find(Boolean);

    const gone = html2el(`<span class="ptabgone" aria-hidden="true">${old.html}</span>`);

    gone.querySelector('.x')?.remove();
    track.insertBefore(gone, after || track.querySelector('.pdrop'));

    gone.animate(
      [
        { width: `${old.w}px`, opacity: 1 },
        { width: '0px', paddingLeft: '0px', paddingRight: '0px', marginLeft: '-4px', opacity: 0 },
      ],
      { duration: 180, easing: EASE_OUT, fill: 'forwards', id: 'tabfold' },
    ).onfinish = () => gone.remove();

    noteMotion(old.k, 'tabfold');
  });

  const was = prev.find(old => old.on);
  const on = el.querySelector('.ptab.on[data-tab]');

  if (!was || !on || was.k === on.dataset.tab) return grow;

  const from = now.find(element => element.dataset.tab === was.k);
  const fl = from ? from.offsetLeft : was.l;
  const fw = from ? from.offsetWidth : was.w;

  const pill = html2el('<i class="ptabpill" aria-hidden="true"></i>');

  track.append(pill);
  on.classList.add('slid');
  noteMotion(on.dataset.tab, 'tabslide');

  pill
    .animate(
      [
        { transform: `translateX(${fl}px)`, width: `${fw}px` },
        { transform: `translateX(${on.offsetLeft}px)`, width: `${on.offsetWidth}px` },
      ],
      { duration: 200, easing: EASE_OUT, fill: 'forwards', id: 'tabslide' },
    )
    .finished.catch(() => {})
    .then(() => {
      pill.remove();
      on.classList.remove('slid');
    });

  return grow;
}

/** The tab in front in sight (2026-10-30), clear of the box's fades (TRACK_FADE, the CSS's .ofl): scrolled the least that shows it
 *  whole — its start where it is wider than the box —, gliding when the strip moves (`smooth`), else at once. */
const TRACK_FADE = 24;

function revealTab(track, tab, smooth) {
  const start = tab.offsetLeft - TRACK_FADE;
  const end = tab.offsetLeft + tab.offsetWidth + TRACK_FADE;
  const scrolled = track.scrollLeft;
  const width = track.clientWidth;

  const to = start < scrolled ? start : end > scrolled + width ? Math.min(start, end - width) : null;

  if (to !== null) track.scrollTo({ left: Math.max(0, to), behavior: smooth && !REDUCED.matches ? 'smooth' : 'auto' });
  trackEdges(track);
}

/** Which ends of the tabs' box have tabs past them, faded out: on a draw, a scroll and a resize of the strip. */
function trackEdges(track) {
  const scrolled = track.scrollLeft;
  const moreLeft = scrolled > 1;
  const moreRight = scrolled + track.clientWidth < track.scrollWidth - 1;

  track.classList.toggle('ofl', moreLeft);
  track.classList.toggle('ofr', moreRight);
}

// The shell's word: the chat's pages, the ones to show and where each one goes — a half's body, in CSS px
// (points in the app). The overlay covers the whole window and each web view is placed inside it, so the two
// halves can each have a page up. `show`/`left`/`top` repeat the first of them for a shell built before the
// split existed. Sent by syncTerm, and again whenever that geometry moves.
const groupRect = half => {
  const rect = $(GEL[half].body).getBoundingClientRect();

  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
};

// A dialog open puts the pane down for as long as it is up (2026-09-22): a
// native view over the chat column covers a dialog centred on the board, and the picker used to sidle into the
// strip of board still showing rather than fight it. Lowering the pane instead leaves the dialog where every
// dialog belongs — the middle of the window, over a dimmed board — and hands the keyboard back on the way down.
// Nothing reloads: the shell only hides the web view, and the tab comes back with the dialog's close — the settings
// are a dialog too since 2026-09-28.
function postPane(session, place = placeOf(session)) {
  if (!inApp) return;
  const shut = !!document.querySelector('dialog[open]');

  const panes = shut
    ? []
    : place
        .map((key, half) => (isPaneTab(key) && !$(GEL[half].grp).hidden ? { key, ...groupRect(half) } : null))
        .filter(Boolean); // not behind a half filling the column

  // the page with the keys, or null when they are the board's — claude, a zsh, the changes — with a page beside them
  // (2026-10-14): the first page stood in for them, so the shell gave that page the keys on its next change, and as
  // the message did not change between the two, a move from claude back to the page was never posted
  const focus =
    !shut && isPaneTab(place[focusG]) && panes.some(pane => pane.key === place[focusG]) ? place[focusG] : null;

  const msg = {
    type: 'pane',
    id: session?.id || null,
    keys: paneKeys(session),
    panes,
    focus,
    show: focus || panes[0]?.key || null,
    left: panes[0]?.left || 0,
    top: panes[0]?.top || 0,
  };

  const sig = JSON.stringify(msg);

  if (sig === postPane.last) return; // syncTerm posts on every update of the open chat; the shell lays its views out again on each
  postPane.last = sig;
  post(msg);
}

const repostPane = () => postPane(state.sessions.get(state.current) || null);

if (inApp) {
  const repost = () => {
    const session = state.sessions.get(state.current);

    if (session && placeOf(session).some(isPaneTab)) postPane(session);
  };

  const ro = new ResizeObserver(repost);

  for (const id of ['#chat', '#groups']) ro.observe($(id));
  onGroup(tm => ro.observe($(tm.el.body)));
  window.addEventListener('resize', repost);
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', repostPane); // the pane comes back up
}

// Both strips, one handler: which half a click landed in is the strip it came from.
$('#groups').addEventListener('click', event => {
  const strip = event.target.closest('.ptabs');

  if (!strip) return;
  const half = +strip.closest('.grp').dataset.g;

  if (event.target.closest('.gmore')) return void strip.classList.toggle('gopen');
  if (event.target.closest('.gclose')) return closeHalf(half);
  const session = state.sessions.get(state.current);

  if (!session) return;

  if (event.target.closest('.gtidy')) {
    focusGroup(half);
    return hotTidy();
  } // the tile whose ⋯ it is: the keys' tile, next after claude's

  if (event.target.closest('.gturn')) {
    if (!isTiled(session)) return stackSplit(session, !stacked.has(session.id));
    focusGroup(half);
    return stackSplit(session, parentOf(trees.get(session.id), half)?.d !== 'col');
  }

  const cp = event.target.closest('.pcopy');

  if (cp) {
    const tabKey = cp.closest('.ptab').dataset.tab;

    if (addrEdit) addrLeave(session);
    return copyPaneUrl(strip.querySelector(`.ptab[data-tab="${CSS.escape(tabKey)}"] .purl`), cp);
  } // the page's address, not what is typed over it

  const nav = event.target.closest('.nav');

  if (nav) {
    focusGroup(half);
    if (addrEdit) addrLeave(session);
    post({ type: 'nav', what: nav.dataset.nav });
    return;
  }

  const url = event.target.closest('.purl');

  if (url) return isPageTab(url.dataset.key) ? addrEditAt(session, url.dataset.key, half) : copyPaneUrl(url);
  if (event.target.closest('.paddr, .pedit')) return; // a blank tab's address, a page's being edited: typed into, not a tab to open
  const tab = event.target.closest('.ptab');

  if (!tab) return;
  const key = tab.dataset.tab;

  if (event.target.closest('.x')) return closeTab(session, key);
  openTab(session, key);
});

onGroup(tm => $(tm.el.tabs).addEventListener('pointerleave', event => event.currentTarget.classList.remove('gopen'))); // ⋯'s ◫ ⨯ fold again

// The tabs past the strip's ends (2026-10-30): a sideways swipe scrolls their box by itself; a wheel turned over the
// strip, or a swipe down it, scrolls it too — down is further along — rather than nothing. Each strip's own listener,
// non-passive: nothing else scrolls under it. The box is drawn anew with the strip, so its scroll is heard in capture.
const tabsWheel = event => {
  const track = event.currentTarget.querySelector('.ptrack');

  if (!track || track.scrollWidth <= track.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  event.preventDefault();
  track.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? track.clientWidth : 1);
};

const stripRo = new ResizeObserver(es => {
  for (const entry of es) {
    const track = entry.target.querySelector('.ptrack');

    if (track) trackEdges(track);
  }
});

onGroup(tm => {
  const el = $(tm.el.tabs);

  el.addEventListener('wheel', tabsWheel, { passive: false });

  el.addEventListener(
    'scroll',
    event => {
      if (event.target.classList?.contains('ptrack')) trackEdges(event.target);
    },
    { capture: true, passive: true },
  );

  stripRo.observe(el);
});

// A click anywhere in a half is being in it — the keys follow the pointer, as they do between editor groups.
// Not the strips: their own click already says which half, and re-rendering them under a mousedown would take
// the button out from under the click that followed it.
$('#groups').addEventListener(
  'mousedown',
  event => {
    if (event.target.closest('.ptabs')) return;
    const grp = event.target.closest('.grp');

    if (grp) focusGroup(+grp.dataset.g);
  },
  true,
);

// …and a click on a page in the pane, which the shell reports (2026-09-28): a native view over the half, so the page
// never saw it, and ⌘W and ⌥⌘W went on acting on the half the keys had been in before.
window.peixPaneFocus = key => {
  const session = state.sessions.get(state.current);
  const half = session ? placeOf(session).indexOf(key) : -1;

  if (addrEdit) addrLeave(session);
  if (half >= 0) focusGroup(half);
}; // an address being edited is put back, as a click in a browser's page does

// …and ⌘W in VS Code Web with no editor open (2026-10-14), which the editor keeps from the Window menu: the shell
// hears it from the page and names the view's tab, which goes as ⌘W's would — by that key, not the half's.
window.peixPaneClose = key => {
  const session = state.sessions.get(state.current);

  if (session && tabKeys(session).includes(key)) dropTab(session, key);
};

// …and a new window a page asks for (2026-10-21): a link with target=_blank, VS Code Web's every link out — a tab of
// the chat's own, as a browser's new tab. The shell loaded it in the view it came from, and the editor's tab has no
// strip: GitHub filled its half with no address and no way back. False — a view not the open chat's, not a web
// page — and the shell loads it there still.
window.peixPaneOpen = (key, url) => {
  const session = state.sessions.get(state.current);

  if (!session || !IN_PANE.test(url) || !paneKeys(session).includes(key)) return false;
  openExternal(url, { s: session });
  return true;
};

// A tab dragged to the other half moves there (2026-09-25) — the strips list only their own tabs now, so this is
// how one goes across. Pointer events and not HTML drag and drop: the drop can land over the app's pane, a native
// view the page cannot see, and the board's web view keeps getting the drag's moves (AppKit sends them to the view
// the press started in) while elementFromPoint still names the half underneath. A press that never travels 5 px
// is a click, and the click that follows a real drag is swallowed. Only while split: with one half there is
// nowhere else to go.
{
  let drag = null;

  const halfAt = (clientX, clientY) => {
    const group = document.elementFromPoint(clientX, clientY)?.closest('.grp');

    return group ? +group.dataset.g : null;
  };

  const lit = half => {
    for (const tm of terms) $(tm.el.grp).classList.toggle('drop', half === tm.g && half !== drag?.from);
  };

  // a tile's edge (2026-11-25, Auto-tiling on): the outer quarter of its body that way is a tile of its own
  // there — shown as the half it would take (#tdrop) —, its middle or its strip the tile as ever. No room: no edge.
  const EDGE = 0.25;

  const edgeAt = (clientX, clientY) => {
    if (!prefs.autoTile) return null;

    const el = document.elementFromPoint(clientX, clientY);
    const grp = el?.closest('.grp');

    if (!grp || el.closest('.ptabs')) return null;

    const group = +grp.dataset.g;
    const session = state.sessions.get(state.current);

    if (!session) return null;
    if (group === drag.from && keysIn(session, isSplit(session) ? group : 0).length < 2) return null; // its only tab: it is a tile of its own

    const rect = $(GEL[group].body).getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;

    const [side, near] = [
      ['left', fx],
      ['right', 1 - fx],
      ['top', fy],
      ['bottom', 1 - fy],
    ].sort((first, second) => first[1] - second[1])[0];

    if (near > EDGE || near < 0 || !roomFor(session, group, side === 'left' || side === 'right' ? 'row' : 'col')) {
      return null;
    }

    const half =
      side === 'left'
        ? [rect.left, rect.top, rect.width / 2, rect.height]
        : side === 'right'
          ? [rect.left + rect.width / 2, rect.top, rect.width / 2, rect.height]
          : side === 'top'
            ? [rect.left, rect.top, rect.width, rect.height / 2]
            : [rect.left, rect.top + rect.height / 2, rect.width, rect.height / 2];

    return { g: group, side, half };
  };

  const zone =
    $('#tdrop') ||
    document.body.appendChild(Object.assign(document.createElement('div'), { id: 'tdrop', hidden: true }));

  const showZone = edge => {
    zone.hidden = !edge;
    if (drag) drag.zone = edge;

    if (edge) {
      (Object.assign(zone.style, {
        left: `${edge.half[0]}px`,
        top: `${edge.half[1]}px`,
        width: `${edge.half[2]}px`,
        height: `${edge.half[3]}px`,
      }),
        (zone.dataset.side = edge.side));
    }
  };

  const end = () => {
    if (!drag) return;
    drag.ghost?.remove();
    drag.b.classList.remove('dragging');
    document.body.classList.remove('tabdrag');
    lit(null);
    showZone(null);
    drag = null;
  };

  $('#groups').addEventListener('pointerdown', event => {
    const tab = event.target.closest('.ptab');

    if (!tab || event.button !== 0 || event.target.closest('.x, .nav, .purl, .paddr, .pedit')) return; // the address and its buttons are not the tab's handle
    if (!splitNow() && !prefs.autoTile) return; // one half: nowhere to go but a tile's edge

    drag = {
      k: tab.dataset.tab,
      from: +tab.closest('.grp').dataset.g,
      x: event.clientX,
      y: event.clientY,
      b: tab,
      ghost: null,
      zone: null,
    };
  });

  window.addEventListener('pointermove', event => {
    if (!drag) return;

    if (!drag.ghost) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
      drag.ghost = document.body.appendChild(drag.b.cloneNode(true));
      drag.ghost.classList.remove('on');
      drag.ghost.classList.add('ghost');
      drag.b.classList.add('dragging');
      document.body.classList.add('tabdrag');
    }

    drag.ghost.style.left = `${event.clientX}px`;
    drag.ghost.style.top = `${event.clientY}px`;
    const edge = edgeAt(event.clientX, event.clientY);

    showZone(edge);
    lit(edge ? null : splitNow() ? halfAt(event.clientX, event.clientY) : null);
  });

  window.addEventListener('pointerup', event => {
    if (!drag) return;

    const { k: key, from, ghost, zone: edge } = drag;
    const to = ghost ? halfAt(event.clientX, event.clientY) : null;

    end();
    if (!ghost) return;

    // the click this release makes, if it makes one — once: a page out of sight runs its timers a second apart, and a
    // swallow left for the timeout ate the next real click (the harness's, 2026-09-28)
    const swallow = ev => {
      ev.stopPropagation();
      ev.preventDefault();
    };

    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, true), 0);
    const session = state.sessions.get(state.current);

    if (!session || !tabKeys(session).includes(key)) return;
    if (edge) {
      haptic('generic');
      tabToSide(session, key, edge.g, edge.side);
      fitTerm();
    } else if (to === null || to === from || !splitNow()) return;
    else moveTab(session, key, to);

    if (isPageTab(key)) {
      shownPr.url = pageUrl(key);
      syncTerm(session);
    } else {
      syncTerm(session);
      renderHead(session);
      focusBoard();
      focusTerm();
    }
  });

  window.addEventListener('pointercancel', end);
  window.addEventListener('blur', end);
}

/** The strip's address, clicked, or its copy button (`button`, 2026-10-20): the whole URL (scheme and all) to the
      clipboard. On the address a selection made by hand inside it wins — that is someone copying part of it
      themselves; the button copies the whole whatever is selected. The clipboard API wants a gesture and a focused
      document, which a click on the board gives it; the textarea is the fallback when it still says no. */
async function copyPaneUrl(el, button) {
  const url = el?.dataset.url || '';
  const sel = getSelection();

  if (!url || (!button && sel && !sel.isCollapsed && el.contains(sel.anchorNode))) return;

  try {
    await navigator.clipboard.writeText(url);
    return addrSay(el, 'Address copied');
  } catch {}

  const ta = document.createElement('textarea');

  ta.value = url;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;

  try {
    ok = document.execCommand('copy');
  } catch {}

  ta.remove();
  addrSay(el, ok ? 'Address copied' : 'Could not copy — select it and ⌘C', !ok);
}

/** …and what it did, said in the address itself (2026-10-20): a note under the strip was under the page's own view
      in the app, where nobody saw it. The address rolls up and away, the words roll in (`.psaid`, a status), the
      button's sheets give way to a ✓ (`.copied`), and COPIED_MS later the address rolls back; a click meanwhile holds
      it. A redraw of the strip takes it all with it. */
const COPIED_MS = 1400;

function addrSay(el, text, err) {
  const tab = el.closest('.ptab.addr');

  if (!tab) return note(el, text, err);

  const left = el.offsetLeft;
  const wd = el.offsetWidth; // where the address is, read before anything is written

  let said = tab.querySelector(':scope > .psaid');

  if (!said) {
    said = document.createElement('span');
    said.className = 'psaid';
    said.setAttribute('role', 'status');
    el.after(said);
  }

  said.style.left = `${left}px`;
  said.style.width = `${wd}px`;
  said.textContent = text;
  tab.classList.toggle('cperr', !!err);
  tab.classList.add('copied');
  clearTimeout(tab._said);
  tab._said = setTimeout(() => tab.classList.remove('copied'), err ? 4000 : COPIED_MS);
}

/** A page's address, clicked (2026-10-27; a click copied it before, and the copy is its button's now): a browser's
      address bar — the whole URL in a box, selected; ⏎ goes where it says (an address, a bare host, else a search:
      typedPage) in that same view, its history kept, and the page has the keys again; esc puts the address back and
      gives the page the keys; the box left any other way puts it back too. What is typed is addrEdit's, not the
      markup's, so a redraw of the strip keeps it (renderTabs). In the app the board's view takes the keys from the page
      for it ({type: 'focus'}), and 'keys' gives them back. */
function addrEditAt(session, key, half) {
  focusGroup(half);
  post({ type: 'focus' });
  addrEdit = { sid: session.id, key, q: paneUrl(key) };
  renderTabs(session);
  const box = document.querySelector('.ptabs .ptab.editing .pedit');

  if (box) {
    box.value = addrEdit.q;
    box.focus();
    box.select();
  }
}

function addrLeave(session, keys) {
  const key = addrEdit?.key;

  addrEdit = null;
  if (session) renderTabs(session);
  if (key && keys) post({ type: 'nav', what: 'keys', key });
}

function addrGo(session, raw) {
  const key = addrEdit?.key;
  const url = raw.trim() && typedPage(raw.trim()).url;

  if (!url) return addrLeave(session, true);
  addrEdit = null;
  renderTabs(session);
  if (!IN_PANE.test(url)) return openExternal(url, { s: session });
  post({ type: 'nav', what: 'go', key, url });
}

{
  const at = () => state.sessions.get(state.current);

  $('#groups').addEventListener('input', event => {
    if (event.target.matches?.('.pedit') && addrEdit) addrEdit.q = event.target.value;
  });

  $('#groups').addEventListener('keydown', event => {
    if (
      !event.target.matches?.('.pedit') ||
      !addrEdit ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.isComposing
    ) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      addrGo(at(), event.target.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      addrLeave(at(), true);
    }
  });

  // a press elsewhere on the strips keeps the keys in the box, so what it presses is not drawn away under its click
  // (the box put back at the blur would redraw the strip): its click lets go of the box itself
  $('#groups').addEventListener('mousedown', event => {
    if (addrEdit && event.target.closest?.('.ptabs') && !event.target.closest('.pedit')) event.preventDefault();
  });

  // the box left: put back, unless a redraw of the strip has just given the keys to the box drawn in its place
  $('#groups').addEventListener('focusout', event => {
    if (!event.target.matches?.('.pedit')) return;

    setTimeout(() => {
      if (addrEdit && !document.activeElement?.matches?.('.pedit')) addrLeave(at());
    }, 0);
  });
}

/** A tab chosen — by a click or ⌥⌘←/→: it comes up in its own half, which becomes the one the keys are in.
      A page is shown as it stands, wherever it was followed to, and keeps the keys; the rest, the keyboard follows. */
function openTab(session, key) {
  setTab(session, key);

  if (isPageTab(key)) {
    shownPr.url = pageUrl(key);
    syncTerm(session);
  } else {
    syncTerm(session);
    focusBoard();
    focusTerm();
  }
}
