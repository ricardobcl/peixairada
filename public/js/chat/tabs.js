const termLive = s => !!(s?.terminal && s.terminal.exited === null);
/** The chat's zsh tabs (2026-10-13: ⌘T opens another beside the first): every live one, oldest first — the server's
      `shells`, each its tab `shell:<terminal id>`. */
const shellsOf = s => (s?.shells || (s?.shell ? [s.shell] : [])).filter(t => t.exited === null);
// …and a vim of the in-app editor's is one of those tabs (2026-10-21, `editor`), never the chat's zsh
const zshsOf = s => shellsOf(s).filter(t => !t.editor);
const shellLive = s => zshsOf(s).length > 0;
const isShellTab = k => /^shell:/.test(k || '');
const shellOfTab = (s, k) => shellsOf(s).find(t => 'shell:' + t.id === k) || null;
const isVimTab = (s, k) => !!shellOfTab(s, k)?.editor;
// Which tab a chat is on — page state, per chat: 'chat' (the claude session while it runs here, else the rendered
// chat), 'shell:<id>' while a zsh of it lives, or one of its pages in the app's pane — 'gh:<url>' a GitHub page (a PR each),
// 'ide:<url>' its folder's editor (2026-09-20). The pages a chat opened are remembered here (state.paneGh per chat,
// state.paneIde per folder), so they come back with the chat; a tab whose page is gone falls back to the chat.
const tabs = new Map();
// Split, each tab belongs to one half's strip (2026-09-25): the chat's strip on the left and
// everything else on the right, until a tab is dragged across (moveTab). Written down only for the tabs that
// moved, and forgotten with the split — the next one starts from claude on the left again.
const homes = new Map(); // chat id → Map(tab → half), while that chat is split
const homeOf = (s, k) => {
  const h = homes.get(s.id)?.get(k) ?? (k === 'chat' ? 0 : 1);
  if (!isTiled(s)) return h;
  const gs = groupsOf(s); // a tile that went: its tabs went to the one beside it (closeTile), anything else to the first but the chat's
  if (gs.includes(h)) return h;
  const chatAt = k === 'chat' ? null : homeOf(s, 'chat');
  return gs.find(g => g !== chatAt) ?? gs[0];
};
/** The tabs a half's strip lists: every one of the chat's with one half, its own with two. */
const keysIn = (s, g) => (!isSplit(s) ? (g ? [] : tabKeys(s)) : tabKeys(s).filter(k => homeOf(s, k) === g));
const isPaneTab = t => /^(gh\d*|ide):/.test(t || '');
const isPageTab = t => /^gh\d*:/.test(t || ''); // a web page's: gh:<url>, or gh2:<url>… for the same page again
/** What each half is showing, read against the tabs it actually has now: a key that is gone falls away, and a
      half whose tab went shows the first of its own that is left — or nothing, which is what an emptied half says. */
function placeOf(s) {
  if (!s) return [null, null];
  const p = tabs.get(s.id) || [],
    gs = groupsOf(s);
  return Array.from({ length: Math.max(2, ...gs.map(g => g + 1)) }, (_, g) => {
    if (!gs.includes(g)) return null;
    const ks = keysIn(s, g);
    return ks.includes(p[g]) ? p[g] : ks[0] || null;
  });
}
// Where each page actually is (2026-09-21): the key says where it was opened, the shell reports every navigation
// (peixPaneUrl, a KVO watch on the view's url), so a PR followed into a file or a review shows — and copies — the
// address on screen. Kept per key, so switching tabs and coming back keeps it; the shell re-sends on every pane
// message, which is what gives it back after a board reload.
const paneUrls = new Map();
let addrEdit = null; // a page's address being edited, { sid, key, q } (addrEditAt)
const bareUrl = u => u.replace(/^https?:\/\//, '');
/** An address as the strip shows it: no scheme, the host quieter than the rest (2026-10-11). */
const urlHtml = u => {
  const b = bareUrl(u),
    i = b.indexOf('/');
  return i < 0
    ? `<span class="h">${esc(b)}</span>`
    : `<span class="h">${esc(b.slice(0, i + 1))}</span>${esc(b.slice(i + 1))}`;
};
// The editor's address is its folder (2026-10-12): VS Code Web's is 127.0.0.1:7332/?folder=%2FUsers%2F… — it says
// VS Code · storefront, the URL in its tooltip, and a click still copies the URL.
const ideName = u => {
  try {
    const f = new URL(u).searchParams.get('folder');
    return f ? f.replace(/\/+$/, '').split('/').pop() : '';
  } catch {
    return '';
  }
};
const ideLabels = new Map(); // a worktree's editor (2026-10-13): its URL → `<repo> @ <branch>`, the name of its tab
const ideLabel = k => ideLabels.get(pageUrl(k)) || null;
const addrHtml = (k, u) =>
  k.startsWith('ide:') && (ideLabel(k) || ideName(u))
    ? `<span class="h">VS Code · </span>${esc(ideLabel(k) || ideName(u))}`
    : urlHtml(u);
const pageUrl = k => k.slice(k.indexOf(':') + 1); // where a tab was opened — all the shell reads of its key
const purlTip = (k, u) => `${u} — ${/^gh\d*:/.test(k) ? 'click to change it' : 'click to copy'}`; // a page's address is edited, the editor's copied (2026-10-27)
const paneUrl = k => paneUrls.get(k) || pageUrl(k);
/** An address at a page: the page, or further into it — a PR's files, a comment on it, its checks. */
const atPage = (addr, url) => {
  const u = url.replace(/\/+$/, '');
  return addr === url || (addr.startsWith(u) && /^([/?#]|$)/.test(addr.slice(u.length)));
};
/** The chat's tab for a page (2026-10-13): the one opened at it while it is still there, else any that is there now.
 *  A tab followed somewhere else is that somewhere's — opening the page again gives it a tab of its own. */
const pageTab = (s, url) => {
  const at = (state.paneGh.get(s.id) || []).filter(k => atPage(paneUrl(k), url));
  return at.find(k => pageUrl(k) === url) || at[0] || null;
};
/** A new tab's key for a page: gh:<url>, else gh2:<url>, gh3:<url>… — none a tab of the chat has, nor one whose view
 *  the shell keeps somewhere else (a closed tab's lingers where it was left, and a key is shown as its view stands). */
function pageKey(s, url) {
  const had = new Set(state.paneGh.get(s.id) || []);
  for (let n = 1; ; n++) {
    const k = `gh${n > 1 ? n : ''}:${url}`;
    if (!had.has(k) && (!paneUrls.has(k) || atPage(paneUrls.get(k), url))) return k;
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
const ideKey = s => (inApp && s?.cwd && state.paneIde.get(s.cwd) ? 'ide:' + state.paneIde.get(s.cwd) : null);
const paneKeys = s =>
  !inApp || !s
    ? []
    : [
        ...(state.paneGh.get(s.id) || []),
        ...(ideKey(s) ? [ideKey(s)] : []),
        ...(state.paneWt.get(s.id) || []).map(u => 'ide:' + u),
      ];
// A blank tab (2026-10-13, ⌘T on a page): a browser's new tab — nothing on it yet, its address a box with the keys in
// it, and under it, in the half, what the box would open (blankHtml). `new:<n>`, after the pages; the page chosen
// takes its place (fillBlank). Page state only, as the changes tab is.
const blanks = new Map(); // chat id → [{ n, q, sel }]: the box's text and the row ⏎ opens
let blankSeq = 0;
const isBlankTab = k => /^new:/.test(k || '');
const blankOf = (s, k) => ((s && blanks.get(s.id)) || []).find(b => 'new:' + b.n === k) || null;
const tabKeys = s => [
  'chat',
  ...shellsOf(s).map(t => 'shell:' + t.id),
  ...(s && changesOpen.has(s.id) ? ['changes'] : []),
  ...(s && timelineOpen.has(s.id) ? ['timeline'] : []),
  ...(s ? (agentTabs.get(s.id) || []).map(a => 'agent:' + a.id) : []),
  ...paneKeys(s),
  ...((s && blanks.get(s.id)) || []).map(b => 'new:' + b.n),
];
const tabOf = s => placeOf(s)[focusG];
/** A tab put on show, in the half whose strip lists it — the one there is, unsplit — and the keys go with it.
      There is one transcript, one xterm per half and one web view per page, so a tab lives in exactly one half;
      choosing it never pulls it across (that is a drag, moveTab). */
function setTab(s, k) {
  const g = isSplit(s) ? homeOf(s, k) : 0,
    p = placeOf(s);
  p[g] = k;
  tabs.set(s.id, p);
  focusG = g;
}
/** A tab dragged onto the other half: its strip is that half's now, and it is on show there. The half it left
      shows the next of its own, or nothing — and a split the board made itself folds away then (syncTerm). */
function moveTab(s, k, g) {
  if (!isSplit(s)) return;
  haptic('generic'); // the tab let go in the other half: felt as it lands
  if (!homes.has(s.id)) homes.set(s.id, new Map());
  homes.get(s.id).set(k, g);
  setTab(s, k);
}
/** A tab that has just come into being — a zsh, a GitHub page, the editor — opens in the *second* half, and
 *  splits the column the first time (2026-09-22): what you open a second tab for is to have it beside the chat, not
 *  instead of it. Only the first one splits; after that a new tab lands wherever the keys are, like everything else.
 *  Choosing a tab that already exists is openTab's and never splits. The split the board makes itself goes again on
 *  its own, in syncTerm, once the chat is down to one tab — an empty half is what ⌘2 is for, not what a zsh's exit
 *  leaves. Claude keeps the first half (2026-09-25): a split puts the chat on the left whatever the column was
 *  showing, and a new tab goes into the half the chat is not in — so it never takes the chat's place. */
function openNewTab(s, k, cut) {
  if (cut === 'here') {
    // ⌥⌘⇧T: in the keys' strip, as if dragged there; one half stays one
    if (isSplit(s)) {
      if (!homes.has(s.id)) homes.set(s.id, new Map());
      homes.get(s.id).set(k, focusG);
    }
    return setTab(s, k);
  }
  if (prefs.autoTile && isShellTab(k) && tileTerm(s, k, cut)) return;
  if (!isSplit(s) && prefs.autoTile && isShellTab(k)) {
    if (cut ? cut === 'col' : tallOf('#groups')) stacked.add(s.id);
    else stacked.delete(s.id);
  } // the first split too, by the column's shape or ⌘D's
  if (!isSplit(s)) splitChat(s, true);
  homes.get(s.id).set(k, besideChat(s));
  setTab(s, k);
}
/** Where a tab opened beside the chat goes: the other half; tiled, the tile the keys are in when the chat is not
 *  there, else the first that is not the chat's. */
function besideChat(s) {
  const c = homeOf(s, 'chat');
  if (!isTiled(s)) return 1 - c;
  const gs = groupsOf(s);
  return focusG !== c && gs.includes(focusG) ? focusG : (gs.find(g => g !== c) ?? gs[0]);
}
// A terminal a tile of its own (2026-11-25, prefs.autoTile; zsh and vim — pages, the changes, the timeline and the
// agents stay tabs): an empty half or tile takes it, the one the keys are in first; else the tile the keys are in is
// cut in two along its longer side (2026-11-25, later: as i3's autotiling — taller than wide, one over the other,
// else side by side, so the cuts take turns as the tiles shrink), the new terminal in its second part. Not split yet,
// it is the first split, by the column's shape (false: openNewTab makes it). ⌘2 / ⌥⌘2 still turn a split after.
// A part under TILE_MIN is no tile: false, a tab beside the chat. ⌘D / ⇧⌘D (`cut`, 2026-11-25) name the direction, and
// always cut: no empty tile takes the terminal, and no room is said.
const tallOf = sel => {
  const r = $(sel).getBoundingClientRect();
  return r.height > r.width;
};
const TILE_MIN = { cols: 24, rows: 6 }; // the least a tile is for: a half side by side is under 80 already
function tileTerm(s, k, cut) {
  if (!isSplit(s)) return false;
  if (!homes.has(s.id)) homes.set(s.id, new Map());
  const gs = groupsOf(s),
    empty = cut ? undefined : [focusG, ...gs].find(g => gs.includes(g) && !keysIn(s, g).length);
  if (empty !== undefined) {
    homes.get(s.id).set(k, empty);
    setTab(s, k);
    return true;
  }
  const at = gs.includes(focusG) ? focusG : gs[0],
    d = cut || (tallOf(GEL[at].grp) ? 'col' : 'row');
  if (!roomFor(at, d)) {
    if (cut)
      note(
        $('#shead'),
        `No room to cut this tile ${cut === 'col' ? 'one over the other' : 'side by side'} — a tab beside it`,
      );
    return false;
  }
  cutTile(s, k, at, d, false);
  return true;
}
/** Tile `at` cut in two along d, tab k alone in the new part — its second, or its first (`before`: the left or top). */
function cutTile(s, k, at, d, before) {
  if (!trees.has(s.id)) trees.set(s.id, halvesTree(s)); // the halves as they stand
  const have = leavesOf(trees.get(s.id));
  let g = 1;
  while (have.includes(g)) g++;
  ensureGroups(g + 1);
  const p = tabs.get(s.id);
  if (p) p[g] = null; // whatever a tile there before showed
  trees.set(
    s.id,
    treeMap(trees.get(s.id), at, leaf =>
      before ? { d, r: 0.5, a: { g }, b: leaf } : { d, r: 0.5, a: leaf, b: { g } },
    ),
  );
  zoomed.delete(s.id);
  homes.get(s.id).set(k, g);
  setTab(s, k);
}
/** A tab put in a tile of its own at a side of tile `at` (2026-11-25; a drag to a tile's edge): the tile cut there. One
 *  half: the split, that side the tab's, the rest the other's. */
function tabToSide(s, k, at, side) {
  const d = side === 'left' || side === 'right' ? 'row' : 'col',
    before = side === 'left' || side === 'top';
  if (isSplit(s)) return cutTile(s, k, at, d, before);
  if (d === 'col') stacked.add(s.id);
  else stacked.delete(s.id);
  const here = keysIn(s, 0),
    rest = here.filter(x => x !== k),
    mine = before ? 0 : 1;
  splitChat(s, false);
  for (const x of here) homes.get(s.id).set(x, x === k ? mine : 1 - mine);
  const p = [null, null];
  p[mine] = k;
  p[1 - mine] = rest.includes(placeOf(s)[0]) ? placeOf(s)[0] : rest[0];
  tabs.set(s.id, p);
  focusG = mine;
}
/** Whether half of group g's body, cut along d, holds a terminal of TILE_MIN — by the cell of a terminal drawn now. */
function roomFor(g, d) {
  const b = $(GEL[g].body).getBoundingClientRect(),
    tm = terms.find(t => t.xt?.cols && $(t.el.tbody).clientWidth);
  const cw = tm ? $(tm.el.tbody).clientWidth / tm.xt.cols : 8,
    ch = tm ? $(tm.el.tbody).clientHeight / tm.xt.rows : 17;
  const w = d === 'row' ? (b.width - 5) / 2 : b.width,
    h = d === 'col' ? (b.height - 5) / 2 : b.height;
  return w / cw >= TILE_MIN.cols && h / ch >= TILE_MIN.rows;
}
/** Tile g closed (⌘W on it, its ⨯): its tabs go to the tile it was split from, and the room with them. */
function closeTile(s, g) {
  const to = backOf(trees.get(s.id), g);
  if (to === null) return;
  for (const k of keysIn(s, g)) homes.get(s.id).set(k, to);
  if (focusG === g) focusG = to;
  dropLeaf(s, g);
}
/** Leaf g out of the chat's tree, its sibling taking its place; down to one, the column is one again. */
function dropLeaf(s, g) {
  const back = backOf(trees.get(s.id), g),
    t = treeMap(trees.get(s.id), g, () => null);
  if (zoomed.get(s.id) === g) zoomed.delete(s.id);
  if (t && !('g' in t)) {
    trees.set(s.id, t);
    if (!leavesOf(t).includes(focusG)) focusG = back ?? leavesOf(t)[0];
    return;
  }
  const left = t ? placeOf(s)[t.g] : null;
  unsplit(s, left || 'chat');
  focusG = 0;
}
/** A tile emptied — its zsh exited, its last tab dragged away — goes, as a split the board made goes with its half. */
function foldTiles(s) {
  for (let again = true; again && isTiled(s);) {
    again = false;
    for (const g of groupsOf(s))
      if (!keysIn(s, g).length) {
        dropLeaf(s, g);
        again = true;
        break;
      }
  }
}
/** The chat tab brought forward — Esc from a page, ⌥⌘C, the focus view's row: into its own half, the left one
 *  unless it was dragged, and the keys go there rather than the chat coming into the half they were in. */
const showChat = s => setTab(s, 'chat');
/** The column in two for this chat: the chat on the left and every other tab on the right, showing what the
 *  column was when that was not the chat — so ⌘2 over a zsh puts claude beside it rather than the other way round. */
function splitChat(s, auto) {
  const was = placeOf(s)[0];
  splits.add(s.id);
  trees.delete(s.id);
  if (auto) autoSplit.add(s.id);
  else autoSplit.delete(s.id);
  homes.set(s.id, new Map());
  tabs.set(s.id, ['chat', was !== 'chat' ? was : null]);
}
/** One half again: every tab back in the one strip, the one showing being what `keep` says. */
function unsplit(s, keep) {
  splits.delete(s.id);
  autoSplit.delete(s.id);
  homes.delete(s.id);
  trees.delete(s.id);
  tabs.set(s.id, [keep, null]);
}
/** A page's tab is named for where it is (2026-10-13; where it was opened before): a PR as repo#n, else its host. */
const paneLabel = u => {
  const m = /github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/.exec(u);
  if (m) return `${m[1]}#${m[2]}`;
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return 'page';
  }
};
// Keep the pane right for the viewed chat: the body under the strip — its zsh on that tab, its claude drawer while
// it runs here (attached under a page's tab too: the native pane covers it, nothing re-attaches on the way back), the
// transcript otherwise — then the strip, then the shell's word (postPane). Runs on every open and SSE update, so it
// never re-attaches what it shows.
function syncTerm(s) {
  // the zsh exited, the page was forgotten, the last tab was dragged out: a split of the board's own goes with its half
  if (isTiled(s)) foldTiles(s);
  else if (s && autoSplit.has(s.id) && (!keysIn(s, 0).length || !keysIn(s, 1).length)) {
    const p = placeOf(s);
    unsplit(s, p[0] || p[1]);
  }
  applySplit(); // the split belongs to the chat, so the column follows whichever is open
  const p = placeOf(s);
  for (const tm of terms) {
    const k = p[tm.g];
    const want = !s || !k ? null : isShellTab(k) ? shellOfTab(s, k) : k === 'chat' && termLive(s) ? s.terminal : null;
    if (want) {
      if (tm.id !== want.id || tm.lost) attachTerm(tm, want);
    } else if (tm.id) {
      detachTerm(tm);
      showDrawer(tm, false);
    }
  }
  placeLog(s, p);
  placeChanges(s, p);
  placeTimeline(s, p);
  placeAgent(s, p);
  renderTabs(s, p);
  placeBlanks(s, p);
  postPane(s, p);
  keepTabsSoon(); // the tabs as they stand outlive a reload (2026-10-16)
}
// There is one transcript and it goes to whichever half holds the chat tab — moved, not copied, so the renderer
// and its scroll position stay put. A live drawer is that half's body, so the transcript hides under it rather
// than move; a half with no tab at all says what would fill it.
function placeLog(s, p) {
  const el = $('#log'),
    at = s ? p.indexOf('chat') : 0,
    g = at < 0 ? 0 : at; // shown nowhere: parked in the left half
  const host = $(GEL[g].body);
  if (el.parentElement !== host) {
    const top = el.scrollTop;
    host.insertBefore(el, host.firstChild);
    el.scrollTop = top;
  }
  const was = el.hidden;
  el.hidden = at < 0 || !!terms[g].id;
  for (const tm of terms) $(tm.el.body).classList.toggle('haslog', !el.hidden && el.parentElement === $(tm.el.body)); // as .nostrip
  if (was && !el.hidden) el.scrollTop = el.scrollHeight; // out from under the drawer: what came while it was hidden was never scrolled to
  for (const tm of terms) {
    const host = $(tm.el.body),
      had = host.querySelector('.gempty'),
      want = isSplit(s) && !p[tm.g] && groupsOf(s).includes(tm.g);
    if (want && !had)
      host.insertAdjacentHTML(
        'beforeend',
        '<div class="gempty">Nothing in this half.<br>⌥⌘T a zsh · ⌥⌘G its PR · ⌥⌘E the editor<br>— or drag a tab here from the other half</div>',
      );
    else if (!want && had) had.remove();
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
function renderTabs(s, p = placeOf(s)) {
  const two = isSplit(s);
  if (s && two) {
    const l = tileSeen.get(s.id) || [];
    if (l[0] !== focusG) tileSeen.set(s.id, [focusG, ...l.filter(x => x !== focusG)]);
  } // where the keys are, drawn: the arrows' memory
  for (const tm of terms) {
    const g = tm.g,
      el = $(tm.el.tabs),
      cur = p[g],
      keys = s ? keysIn(s, g) : g ? [] : ['chat'];
    const lone = two && keys.length === 1 && !isPageTab(keys[0]) && !isBlankTab(keys[0]); // a page's or a blank tab's strip is its address
    $(tm.el.grp).classList.toggle('on', g === focusG);
    el.hidden = g === 0 ? !two && keys.length < 2 : false;
    $(tm.el.grp).classList.toggle('nostrip', el.hidden); // the floating header's rules read it — a class, not :has() (2026-10-13)
    el.classList.toggle('lone', lone);
    if (el.hidden || lone || (s ? !groupsOf(s).includes(g) : g > 0)) {
      setHtml(el, '');
      el._on = null;
      continue;
    } // nothing drawn, nothing left over to be found
    const tip = two ? ' · drag it to the other half to move it there' : '';
    // each tab with its mark before its name (2026-10-08, as the agent apps' strips have them): Claude's burst, the
    // shell's prompt, a PR's or a page's, VS Code's; its × drawn over the mark, under the pointer (2026-10-11, Q1); the
    // page in front its own address, with ‹ › ↻ ↗ in it (Q5) and a copy of the address (2026-10-20) — a div, since it
    // holds buttons
    const tab = (k, label, title, x, icon = '') => {
      const close = x ? `<span class="x" title="${esc(x)}">${ICON.close}</span>` : '';
      if (cur === k && isBlankTab(k))
        return `<div class="ptab on addr blank" role="tab" aria-selected="true" data-tab="${esc(k)}" title="${esc('A new tab — type an address, or words to search' + tip)}">${icon}<input class="paddr" type="text" placeholder="Search or enter an address" aria-label="Address" spellcheck="false" autocomplete="off" autocapitalize="off">${close}</div>`;
      const editing = cur === k && addrEdit?.sid === s?.id && addrEdit.key === k; // a page's address, clicked: a box (2026-10-27)
      if (cur === k && isPaneTab(k))
        return (
          `<div class="ptab on pane addr${editing ? ' editing' : ''}" role="tab" aria-selected="true" tabindex="0" data-tab="${esc(k)}" title="${esc(title + tip)}">${icon}${
            editing
              ? `<input class="pedit" type="text" data-key="${esc(k)}" aria-label="Address" spellcheck="false" autocomplete="off" autocapitalize="off">`
              : `<span class="purl" data-key="${esc(k)}" data-url="${esc(paneUrl(k))}" title="${esc(purlTip(k, paneUrl(k)))}">${addrHtml(k, paneUrl(k))}</span>`
          }<span class="navs">` +
          `<button class="nav" data-nav="back" title="Back">${ICON.back}</button><button class="nav" data-nav="forward" title="Forward">${ICON.forward}</button><button class="nav" data-nav="reload" title="Reload">${ICON.reload}</button><button class="nav pcopy" title="Copy this page's address">${ICON.copyAddr}${ICON.copied}</button><button class="nav" data-nav="external" title="Open this page in your browser">${ICON.external}</button></span>${close}</div>`
        );
      return `<button class="ptab${cur === k ? ' on' : ''}${isPaneTab(k) ? ' pane' : ''}" role="tab" aria-selected="${cur === k}" data-tab="${esc(k)}" title="${esc(title + tip)}">${icon}${esc(label)}${close}</button>`;
    };
    // the half's own, ◫ (or ⊟) and ⨯, behind a ⋯ at the strip's end (Q5)
    const over = isTiled(s) ? parentOf(trees.get(s.id), g)?.d === 'col' : stackNow(); // tiled: the split this tile is half of
    const half = two
      ? `<button class="gmore" title="This half: turn the split, close it">${ICON.more}</button><span class="gacts">` +
        `<button class="nav gturn" data-to="${over ? 'side' : 'over'}" title="${over ? 'The halves side by side · ⌘1 ⌘2' : 'The halves one over the other · ⌥⌘1 ⌥⌘2'}">${over ? ICON.side : ICON.over}</button>` +
        (prefs.autoTile
          ? `<button class="nav gtidy" title="Tidy the tiles: Claude's on the left, each next one half of the room left, the bigger ones left and up">${ICON.tidy}</button>`
          : '') +
        `<button class="nav gclose" title="Close this half — the other one becomes the whole column · ⌘0 from that one">${ICON.close}</button></span>`
      : '';
    const html =
      '<div class="ptrack">' +
      keys
        .map(k =>
          k === 'chat'
            ? tab(
                k,
                termLive(s) ? 'claude' : 'chat',
                `${termLive(s) ? 'The claude session' : 'The rendered chat'} · ⌥⌘C`,
                '',
                ICON.claude,
              )
            : isVimTab(s, k)
              ? tab(
                  k,
                  shLabel(s, k),
                  `Vim in ${shellOfTab(s, k).cwd || s.cwd || 'its folder'} · ⌥⌘E`,
                  'Quit vim — it stays, saying so, over unsaved work',
                  ICON.vim,
                )
              : isShellTab(k)
                ? tab(
                    k,
                    shLabel(s, k),
                    `A ${shName()} in ${s.cwd || 'its folder'} · ⌥⌘T · ⌘T another`,
                    'End this shell',
                    ICON.term,
                  )
                : k === 'changes'
                  ? tab(
                      k,
                      'changes',
                      `What this chat changed in ${s.cwd || 'its folder'} · ⌥⌘D`,
                      'Close the changes',
                      ICON.diff,
                    )
                  : k === 'timeline'
                    ? tab(
                        k,
                        'timeline',
                        'This chat and its PRs in the order things happened · ⌥⌘J',
                        'Close the timeline',
                        ICON.timeline,
                      )
                    : isAgentTab(k)
                      ? tab(
                          k,
                          agTabName(s, k),
                          `${agTabName(s, k, true)} · an agent of this chat's, read-only`,
                          'Close this tab — the agent carries on',
                          ICON.lock,
                        )
                      : isPageTab(k)
                        ? tab(
                            k,
                            paneLabel(paneUrl(k)),
                            GH_PR.test(paneUrl(k)) ? `${paneUrl(k)} · ⌥⌘G` : paneUrl(k),
                            'Close this page',
                            GH_PR.test(paneUrl(k)) ? ICON.pr : ICON.globe,
                          )
                        : isBlankTab(k)
                          ? tab(k, 'New tab', 'A new tab, nothing on it yet · ⌘T', 'Close this tab', ICON.globe)
                          : ideLabel(k)
                            ? tab(
                                k,
                                ideLabel(k),
                                `${ideName(pageUrl(k))} — a worktree — in VS Code Web`,
                                'Close the editor',
                                ICON.vscode,
                              )
                            : tab(k, 'VS Code', `${s.cwd} in VS Code Web · ⌥⌘E`, 'Close the editor', ICON.vscode),
        )
        .join('') +
      (two && !keys.length ? '<span class="pdrop">drop a tab here</span>' : '') +
      '</div>' +
      half;
    // the strip moves (2026-10-11): what it held is read before it is drawn anew, for tabMotion — only when it will be
    const prev =
      el._drawn !== html && el._sid === s?.id && !REDUCED.matches
        ? [...el.querySelectorAll('.ptab[data-tab]')].map(b => ({
            k: b.dataset.tab,
            l: b.offsetLeft,
            w: b.offsetWidth,
            on: b.classList.contains('on'),
            html: b.innerHTML,
          }))
        : null;
    const box = el.querySelector('.ptab.blank .paddr, .ptab.editing .pedit'),
      typing = box && document.activeElement === box && [box.selectionStart, box.selectionEnd];
    const sl = el._drawn !== html ? el.querySelector('.ptrack')?.scrollLeft || 0 : 0; // the tabs' box is drawn anew: where it was scrolled to goes with it
    const drew = setHtml(el, html),
      track = el.querySelector('.ptrack');
    if (drew && track) track.scrollLeft = sl;
    const grow = drew && prev?.length ? tabMotion(el, prev) : null; // a strip coming out of hiding just appears
    // the tab in front scrolled to when it is another (2026-10-30) — not on every draw, which would undo a swipe —,
    // once it has grown in if it is new: a box still growing is scrolled short of it (and may be drawn anew meanwhile)
    const on = track?.querySelector('.ptab.on[data-tab]'),
      at = `${s?.id} ${cur}`,
      smooth = !!prev;
    if (on && el._on !== at) {
      el._on = at;
      const go = () => {
        const t = el.querySelector('.ptrack'),
          b = t?.querySelector('.ptab.on[data-tab]');
        if (b && el._on === at) revealTab(t, b, smooth);
      };
      if (grow) grow.finished.then(go, go);
      else go();
    } else if (drew && track) trackEdges(track);
    // a blank tab's box keeps what was typed out of the markup, so typing redraws nothing — and is given it back when
    // something else redraws the strip, the keys and the caret too
    const nb = drew && el.querySelector('.ptab.blank .paddr, .ptab.editing .pedit'); // not a closed one's stand-in, folding
    if (nb) {
      nb.value = nb.matches('.pedit') ? addrEdit.q : blankOf(s, nb.closest('.ptab').dataset.tab)?.q || '';
      if (typing) {
        nb.focus();
        nb.setSelectionRange(...typing);
      }
    }
    if (el._drawn === html) fadeSoon();
    el._sid = s?.id;
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
  const now = [...el.querySelectorAll('.ptab[data-tab]')],
    had = new Set(prev.map(p => p.k)),
    has = new Set(now.map(b => b.dataset.tab));
  let grow = null;
  for (const b of now)
    if (!had.has(b.dataset.tab)) {
      const cs = getComputedStyle(b),
        w = b.offsetWidth;
      const a = b.animate(
        [
          { width: '0px', paddingLeft: '0px', paddingRight: '0px', opacity: 0 },
          { width: w + 'px', paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, opacity: 1 },
        ],
        { duration: 200, easing: EASE_OUT, id: 'tabgrow' },
      );
      if (b.classList.contains('on')) grow = a;
      noteMotion(b.dataset.tab, 'tabgrow');
    }
  prev.forEach((p, i) => {
    if (has.has(p.k)) return;
    const after = prev
      .slice(i + 1)
      .map(q => now.find(b => b.dataset.tab === q.k))
      .find(Boolean);
    const g = html2el(`<span class="ptabgone" aria-hidden="true">${p.html}</span>`);
    g.querySelector('.x')?.remove();
    track.insertBefore(g, after || track.querySelector('.pdrop'));
    g.animate(
      [
        { width: p.w + 'px', opacity: 1 },
        { width: '0px', paddingLeft: '0px', paddingRight: '0px', marginLeft: '-4px', opacity: 0 },
      ],
      { duration: 180, easing: EASE_OUT, fill: 'forwards', id: 'tabfold' },
    ).onfinish = () => g.remove();
    noteMotion(p.k, 'tabfold');
  });
  const was = prev.find(p => p.on),
    on = el.querySelector('.ptab.on[data-tab]');
  if (!was || !on || was.k === on.dataset.tab) return grow;
  const from = now.find(b => b.dataset.tab === was.k),
    fl = from ? from.offsetLeft : was.l,
    fw = from ? from.offsetWidth : was.w;
  const pill = html2el('<i class="ptabpill" aria-hidden="true"></i>');
  track.append(pill);
  on.classList.add('slid');
  noteMotion(on.dataset.tab, 'tabslide');
  pill
    .animate(
      [
        { transform: `translateX(${fl}px)`, width: fw + 'px' },
        { transform: `translateX(${on.offsetLeft}px)`, width: on.offsetWidth + 'px' },
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
function revealTab(track, b, smooth) {
  const l = b.offsetLeft - TRACK_FADE,
    r = b.offsetLeft + b.offsetWidth + TRACK_FADE,
    x = track.scrollLeft,
    w = track.clientWidth;
  const to = l < x ? l : r > x + w ? Math.min(l, r - w) : null;
  if (to !== null) track.scrollTo({ left: Math.max(0, to), behavior: smooth && !REDUCED.matches ? 'smooth' : 'auto' });
  trackEdges(track);
}
/** Which ends of the tabs' box have tabs past them, faded out: on a draw, a scroll and a resize of the strip. */
function trackEdges(t) {
  const x = t.scrollLeft,
    l = x > 1,
    r = x + t.clientWidth < t.scrollWidth - 1;
  t.classList.toggle('ofl', l);
  t.classList.toggle('ofr', r);
}
// The shell's word: the chat's pages, the ones to show and where each one goes — a half's body, in CSS px
// (points in the app). The overlay covers the whole window and each web view is placed inside it, so the two
// halves can each have a page up. `show`/`left`/`top` repeat the first of them for a shell built before the
// split existed. Sent by syncTerm, and again whenever that geometry moves.
const groupRect = g => {
  const r = $(GEL[g].body).getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
};
// A dialog open puts the pane down for as long as it is up (2026-09-22): a
// native view over the chat column covers a dialog centred on the board, and the picker used to sidle into the
// strip of board still showing rather than fight it. Lowering the pane instead leaves the dialog where every
// dialog belongs — the middle of the window, over a dimmed board — and hands the keyboard back on the way down.
// Nothing reloads: the shell only hides the web view, and the tab comes back with the dialog's close — the settings
// are a dialog too since 2026-09-28.
function postPane(s, p = placeOf(s)) {
  if (!inApp) return;
  const shut = !!document.querySelector('dialog[open]');
  const panes = shut
    ? []
    : p.map((k, g) => (isPaneTab(k) && !$(GEL[g].grp).hidden ? { key: k, ...groupRect(g) } : null)).filter(Boolean); // not behind a half filling the column
  // the page with the keys, or null when they are the board's — claude, a zsh, the changes — with a page beside them
  // (2026-10-14): the first page stood in for them, so the shell gave that page the keys on its next change, and as
  // the message did not change between the two, a move from claude back to the page was never posted
  const focus = !shut && isPaneTab(p[focusG]) && panes.some(x => x.key === p[focusG]) ? p[focusG] : null;
  const msg = {
    type: 'pane',
    id: s?.id || null,
    keys: paneKeys(s),
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
    const s = state.sessions.get(state.current);
    if (s && placeOf(s).some(isPaneTab)) postPane(s);
  };
  const ro = new ResizeObserver(repost);
  for (const id of ['#chat', '#groups']) ro.observe($(id));
  onGroup(tm => ro.observe($(tm.el.body)));
  window.addEventListener('resize', repost);
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('close', repostPane); // the pane comes back up
}
// Both strips, one handler: which half a click landed in is the strip it came from.
$('#groups').addEventListener('click', e => {
  const strip = e.target.closest('.ptabs');
  if (!strip) return;
  const g = +strip.closest('.grp').dataset.g;
  if (e.target.closest('.gmore')) return void strip.classList.toggle('gopen');
  if (e.target.closest('.gclose')) return closeHalf(g);
  const s = state.sessions.get(state.current);
  if (!s) return;
  if (e.target.closest('.gtidy')) return hotTidy();
  if (e.target.closest('.gturn')) {
    if (!isTiled(s)) return stackSplit(s, !stacked.has(s.id));
    focusGroup(g);
    return stackSplit(s, parentOf(trees.get(s.id), g)?.d !== 'col');
  }
  const cp = e.target.closest('.pcopy');
  if (cp) {
    const k = cp.closest('.ptab').dataset.tab;
    if (addrEdit) addrLeave(s);
    return copyPaneUrl(strip.querySelector(`.ptab[data-tab="${CSS.escape(k)}"] .purl`), cp);
  } // the page's address, not what is typed over it
  const nav = e.target.closest('.nav');
  if (nav) {
    focusGroup(g);
    if (addrEdit) addrLeave(s);
    post({ type: 'nav', what: nav.dataset.nav });
    return;
  }
  const url = e.target.closest('.purl');
  if (url) return isPageTab(url.dataset.key) ? addrEditAt(s, url.dataset.key, g) : copyPaneUrl(url);
  if (e.target.closest('.paddr, .pedit')) return; // a blank tab's address, a page's being edited: typed into, not a tab to open
  const b = e.target.closest('.ptab');
  if (!b) return;
  const k = b.dataset.tab;
  if (e.target.closest('.x')) return closeTab(s, k);
  openTab(s, k);
});
onGroup(tm => $(tm.el.tabs).addEventListener('pointerleave', e => e.currentTarget.classList.remove('gopen'))); // ⋯'s ◫ ⨯ fold again
// The tabs past the strip's ends (2026-10-30): a sideways swipe scrolls their box by itself; a wheel turned over the
// strip, or a swipe down it, scrolls it too — down is further along — rather than nothing. Each strip's own listener,
// non-passive: nothing else scrolls under it. The box is drawn anew with the strip, so its scroll is heard in capture.
const tabsWheel = e => {
  const t = e.currentTarget.querySelector('.ptrack');
  if (!t || t.scrollWidth <= t.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
  e.preventDefault();
  t.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? t.clientWidth : 1);
};
const stripRo = new ResizeObserver(es => {
  for (const e of es) {
    const t = e.target.querySelector('.ptrack');
    if (t) trackEdges(t);
  }
});
onGroup(tm => {
  const el = $(tm.el.tabs);
  el.addEventListener('wheel', tabsWheel, { passive: false });
  el.addEventListener(
    'scroll',
    e => {
      if (e.target.classList?.contains('ptrack')) trackEdges(e.target);
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
  e => {
    if (e.target.closest('.ptabs')) return;
    const grp = e.target.closest('.grp');
    if (grp) focusGroup(+grp.dataset.g);
  },
  true,
);
// …and a click on a page in the pane, which the shell reports (2026-09-28): a native view over the half, so the page
// never saw it, and ⌘W and ⌥⌘W went on acting on the half the keys had been in before.
window.peixPaneFocus = key => {
  const s = state.sessions.get(state.current),
    g = s ? placeOf(s).indexOf(key) : -1;
  if (addrEdit) addrLeave(s);
  if (g >= 0) focusGroup(g);
}; // an address being edited is put back, as a click in a browser's page does
// …and ⌘W in VS Code Web with no editor open (2026-10-14), which the editor keeps from the Window menu: the shell
// hears it from the page and names the view's tab, which goes as ⌘W's would — by that key, not the half's.
window.peixPaneClose = key => {
  const s = state.sessions.get(state.current);
  if (s && tabKeys(s).includes(key)) dropTab(s, key);
};
// …and a new window a page asks for (2026-10-21): a link with target=_blank, VS Code Web's every link out — a tab of
// the chat's own, as a browser's new tab. The shell loaded it in the view it came from, and the editor's tab has no
// strip: GitHub filled its half with no address and no way back. False — a view not the open chat's, not a web
// page — and the shell loads it there still.
window.peixPaneOpen = (key, url) => {
  const s = state.sessions.get(state.current);
  if (!s || !IN_PANE.test(url) || !paneKeys(s).includes(key)) return false;
  openExternal(url, { s });
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
  const halfAt = (x, y) => {
    const g = document.elementFromPoint(x, y)?.closest('.grp');
    return g ? +g.dataset.g : null;
  };
  const lit = g => {
    for (const tm of terms) $(tm.el.grp).classList.toggle('drop', g === tm.g && g !== drag?.from);
  };
  // a tile's edge (2026-11-25, Auto-tiling on): the outer quarter of its body that way is a tile of its own
  // there — shown as the half it would take (#tdrop) —, its middle or its strip the tile as ever. No room: no edge.
  const EDGE = 0.25;
  const edgeAt = (x, y) => {
    if (!prefs.autoTile) return null;
    const el = document.elementFromPoint(x, y),
      grp = el?.closest('.grp');
    if (!grp || el.closest('.ptabs')) return null;
    const g = +grp.dataset.g,
      s = state.sessions.get(state.current);
    if (!s) return null;
    if (g === drag.from && keysIn(s, isSplit(s) ? g : 0).length < 2) return null; // its only tab: it is a tile of its own
    const r = $(GEL[g].body).getBoundingClientRect(),
      fx = (x - r.left) / r.width,
      fy = (y - r.top) / r.height;
    const [side, near] = [
      ['left', fx],
      ['right', 1 - fx],
      ['top', fy],
      ['bottom', 1 - fy],
    ].sort((a, b) => a[1] - b[1])[0];
    if (near > EDGE || near < 0 || !roomFor(g, side === 'left' || side === 'right' ? 'row' : 'col')) return null;
    const half =
      side === 'left'
        ? [r.left, r.top, r.width / 2, r.height]
        : side === 'right'
          ? [r.left + r.width / 2, r.top, r.width / 2, r.height]
          : side === 'top'
            ? [r.left, r.top, r.width, r.height / 2]
            : [r.left, r.top + r.height / 2, r.width, r.height / 2];
    return { g, side, half };
  };
  const zone =
    $('#tdrop') ||
    document.body.appendChild(Object.assign(document.createElement('div'), { id: 'tdrop', hidden: true }));
  const showZone = z => {
    zone.hidden = !z;
    if (drag) drag.zone = z;
    if (z)
      (Object.assign(zone.style, {
        left: z.half[0] + 'px',
        top: z.half[1] + 'px',
        width: z.half[2] + 'px',
        height: z.half[3] + 'px',
      }),
        (zone.dataset.side = z.side));
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
  $('#groups').addEventListener('pointerdown', e => {
    const b = e.target.closest('.ptab');
    if (!b || e.button !== 0 || e.target.closest('.x, .nav, .purl, .paddr, .pedit')) return; // the address and its buttons are not the tab's handle
    if (!splitNow() && !prefs.autoTile) return; // one half: nowhere to go but a tile's edge
    drag = {
      k: b.dataset.tab,
      from: +b.closest('.grp').dataset.g,
      x: e.clientX,
      y: e.clientY,
      b,
      ghost: null,
      zone: null,
    };
  });
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
      drag.ghost = document.body.appendChild(drag.b.cloneNode(true));
      drag.ghost.classList.remove('on');
      drag.ghost.classList.add('ghost');
      drag.b.classList.add('dragging');
      document.body.classList.add('tabdrag');
    }
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
    const z = edgeAt(e.clientX, e.clientY);
    showZone(z);
    lit(z ? null : splitNow() ? halfAt(e.clientX, e.clientY) : null);
  });
  window.addEventListener('pointerup', e => {
    if (!drag) return;
    const { k, from, ghost, zone: z } = drag,
      to = ghost ? halfAt(e.clientX, e.clientY) : null;
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
    const s = state.sessions.get(state.current);
    if (!s || !tabKeys(s).includes(k)) return;
    if (z) {
      haptic('generic');
      tabToSide(s, k, z.g, z.side);
      fitTerm();
    } else if (to === null || to === from || !splitNow()) return;
    else moveTab(s, k, to);
    if (isPageTab(k)) {
      shownPr.url = pageUrl(k);
      syncTerm(s);
    } else {
      syncTerm(s);
      renderHead(s);
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
  const x = el.offsetLeft,
    wd = el.offsetWidth; // where the address is, read before anything is written
  let w = tab.querySelector(':scope > .psaid');
  if (!w) {
    w = document.createElement('span');
    w.className = 'psaid';
    w.setAttribute('role', 'status');
    el.after(w);
  }
  w.style.left = x + 'px';
  w.style.width = wd + 'px';
  w.textContent = text;
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
function addrEditAt(s, k, g) {
  focusGroup(g);
  post({ type: 'focus' });
  addrEdit = { sid: s.id, key: k, q: paneUrl(k) };
  renderTabs(s);
  const box = document.querySelector('.ptabs .ptab.editing .pedit');
  if (box) {
    box.value = addrEdit.q;
    box.focus();
    box.select();
  }
}
function addrLeave(s, keys) {
  const k = addrEdit?.key;
  addrEdit = null;
  if (s) renderTabs(s);
  if (k && keys) post({ type: 'nav', what: 'keys', key: k });
}
function addrGo(s, raw) {
  const k = addrEdit?.key,
    url = raw.trim() && typedPage(raw.trim()).url;
  if (!url) return addrLeave(s, true);
  addrEdit = null;
  renderTabs(s);
  if (!IN_PANE.test(url)) return openExternal(url, { s });
  post({ type: 'nav', what: 'go', key: k, url });
}
{
  const at = () => state.sessions.get(state.current);
  $('#groups').addEventListener('input', e => {
    if (e.target.matches?.('.pedit') && addrEdit) addrEdit.q = e.target.value;
  });
  $('#groups').addEventListener('keydown', e => {
    if (!e.target.matches?.('.pedit') || !addrEdit || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      addrGo(at(), e.target.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      addrLeave(at(), true);
    }
  });
  // a press elsewhere on the strips keeps the keys in the box, so what it presses is not drawn away under its click
  // (the box put back at the blur would redraw the strip): its click lets go of the box itself
  $('#groups').addEventListener('mousedown', e => {
    if (addrEdit && e.target.closest?.('.ptabs') && !e.target.closest('.pedit')) e.preventDefault();
  });
  // the box left: put back, unless a redraw of the strip has just given the keys to the box drawn in its place
  $('#groups').addEventListener('focusout', e => {
    if (!e.target.matches?.('.pedit')) return;
    setTimeout(() => {
      if (addrEdit && !document.activeElement?.matches?.('.pedit')) addrLeave(at());
    }, 0);
  });
}
/** A tab chosen — by a click or ⌥⌘←/→: it comes up in its own half, which becomes the one the keys are in.
      A page is shown as it stands, wherever it was followed to, and keeps the keys; the rest, the keyboard follows. */
function openTab(s, k) {
  setTab(s, k);
  if (isPageTab(k)) {
    shownPr.url = pageUrl(k);
    syncTerm(s);
  } else {
    syncTerm(s);
    focusBoard();
    focusTerm();
  }
}
