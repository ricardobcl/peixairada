// ---- the chat column across a reload (2026-10-16) ---------------------------------------------------------------
// Every chat's tabs were the page's memory alone: the pages it opened, its folder's editor, its split, which half each
// tab is in. A reload of the board — an update's, a restart's (pageFollows), ⌥⌘R, a new key, a web process WebKit
// ended — forgot them, and the strip came back with claude and the zsh alone while the shell kept the pages' views,
// unseen. Kept in sessionStorage, which lives as long as the board's web view does, as those views do: a reload finds
// the tabs and the shell shows each view as it stood; a relaunch starts clean. Written a moment after syncTerm (every
// change to a tab goes through it) and as the page goes; read before the stream's first snapshot, which prunes it.
const TABS_STORE = 'peixairada-tabs';

function keepTabs() {
  clearTimeout(keepTabs.t);
  keepTabs.t = null;

  const json = JSON.stringify({
    gh: [...state.paneGh],
    ide: [...state.paneIde],
    wt: [...state.paneWt],
    labels: [...ideLabels],
    urls: [...paneUrls],
    tabs: [...tabs],
    homes: [...homes].map(([id, halves]) => [id, [...halves]]),
    splits: [...splits],
    auto: [...autoSplit],
    stacked: [...stacked],
    zoomed: [...zoomed],
    trees: [...trees],
    seen: [...tileSeen],
    changes: [...changesOpen],
    timeline: [...timelineOpen],
    agents: [...agentTabs],
    narrow: [...tvNarrow],
    prs: [...changes.pr],
    blanks: [...blanks],
    reviews: [...reviews],
    focus: focusG,
  });

  if (json === keepTabs.was) return;

  try {
    sessionStorage.setItem(TABS_STORE, json);
    keepTabs.was = json;
  } catch {} // storage refused: the tabs last as long as the page, as before
}

function keepTabsSoon() {
  if (!keepTabs.t) keepTabs.t = setTimeout(keepTabs, 400);
} // a function, so syncTerm may call it before this line has run

try {
  const json = sessionStorage.getItem(TABS_STORE);
  const kept = json && JSON.parse(json);

  if (kept) {
    for (const [map, entries] of [
      [state.paneGh, kept.gh],
      [state.paneIde, kept.ide],
      [state.paneWt, kept.wt],
      [ideLabels, kept.labels],
      [paneUrls, kept.urls],
      [tabs, kept.tabs],
      [zoomed, kept.zoomed],
      [tileSeen, kept.seen],
      [changes.pr, kept.prs],
      [blanks, kept.blanks],
      [tvNarrow, kept.narrow],
      [reviews, kept.reviews],
      [agentTabs, kept.agents],
    ]) {
      for (const [key, value] of entries || []) map.set(key, value);
    }

    for (const [id, entries] of kept.homes || []) homes.set(id, new Map(entries));

    for (const [set, ids] of [
      [splits, kept.splits],
      [autoSplit, kept.auto],
      [stacked, kept.stacked],
      [changesOpen, kept.changes],
      [timelineOpen, kept.timeline],
    ]) {
      for (const id of ids || []) set.add(id);
    }

    blankSeq = Math.max(blankSeq, ...[...blanks.values()].flat().map(blank => blank.n));

    reviewSeq = Math.max(
      reviewSeq,
      ...[...reviews.values()].flatMap(review => review.items.map(comment => comment.id)),
    );

    for (const [id, tree] of kept.trees || []) if (tree && typeof tree === 'object') trees.set(id, tree);
    ensureGroups(Math.max(2, ...[...trees.values()].flatMap(leavesOf).map(group => group + 1))); // the tiles' markup before anything reads a group
    focusG = Number.isInteger(kept.focus) && kept.focus >= 0 && kept.focus < GEL.length ? kept.focus : 0;
    keepTabs.was = json;
  }
} catch {} // none, or not ours to read: nothing to give back

addEventListener('pagehide', keepTabs);
