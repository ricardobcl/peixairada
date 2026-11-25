  // ---- the chat column across a reload (2026-10-16) ---------------------------------------------------------------
  // Every chat's tabs were the page's memory alone: the pages it opened, its folder's editor, its split, which half each
  // tab is in. A reload of the board — an update's, a restart's (pageFollows), ⌥⌘R, a new key, a web process WebKit
  // ended — forgot them, and the strip came back with claude and the zsh alone while the shell kept the pages' views,
  // unseen. Kept in sessionStorage, which lives as long as the board's web view does, as those views do: a reload finds
  // the tabs and the shell shows each view as it stood; a relaunch starts clean. Written a moment after syncTerm (every
  // change to a tab goes through it) and as the page goes; read before the stream's first snapshot, which prunes it.
  const TABS_STORE = 'peixairada-tabs';
  function keepTabs() {
    clearTimeout(keepTabs.t); keepTabs.t = null;
    const v = JSON.stringify({ gh: [...state.paneGh], ide: [...state.paneIde], wt: [...state.paneWt], labels: [...ideLabels], urls: [...paneUrls],
      tabs: [...tabs], homes: [...homes].map(([id, m]) => [id, [...m]]), splits: [...splits], auto: [...autoSplit], stacked: [...stacked], zoomed: [...zoomed],
      changes: [...changesOpen], timeline: [...timelineOpen], agents: [...agentTabs], narrow: [...tvNarrow], prs: [...changes.pr], blanks: [...blanks], reviews: [...reviews], focus: focusG });
    if (v === keepTabs.was) return;
    try { sessionStorage.setItem(TABS_STORE, v); keepTabs.was = v; } catch {}   // storage refused: the tabs last as long as the page, as before
  }
  function keepTabsSoon() { if (!keepTabs.t) keepTabs.t = setTimeout(keepTabs, 400); }   // a function, so syncTerm may call it before this line has run
  try {
    const v = sessionStorage.getItem(TABS_STORE), k = v && JSON.parse(v);
    if (k) {
      for (const [m, l] of [[state.paneGh, k.gh], [state.paneIde, k.ide], [state.paneWt, k.wt], [ideLabels, k.labels], [paneUrls, k.urls], [tabs, k.tabs], [zoomed, k.zoomed], [changes.pr, k.prs], [blanks, k.blanks], [tvNarrow, k.narrow], [reviews, k.reviews], [agentTabs, k.agents]]) for (const [a, b] of l || []) m.set(a, b);
      for (const [id, l] of k.homes || []) homes.set(id, new Map(l));
      for (const [m, l] of [[splits, k.splits], [autoSplit, k.auto], [stacked, k.stacked], [changesOpen, k.changes], [timelineOpen, k.timeline]]) for (const id of l || []) m.add(id);
      blankSeq = Math.max(blankSeq, ...[...blanks.values()].flat().map(b => b.n));
      reviewSeq = Math.max(reviewSeq, ...[...reviews.values()].flatMap(r => r.items.map(c => c.id)));
      focusG = k.focus === 1 ? 1 : 0;
      keepTabs.was = v;
    }
  } catch {}   // none, or not ours to read: nothing to give back
  addEventListener('pagehide', keepTabs);

