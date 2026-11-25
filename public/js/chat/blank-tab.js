// ---- a blank tab: ⌘T on a page (2026-10-13) ----------------------------------------------------------------------
/** A blank tab, in front where a new tab goes, the keys in its address. */
function openBlank(s) {
  const b = { n: ++blankSeq, q: '', sel: 0 };
  blanks.set(s.id, [...(blanks.get(s.id) || []), b]);
  openNewTab(s, 'new:' + b.n);
  syncTerm(s);
  focusBoard();
  focusTerm();
}
/** What the box would open: what was typed first, then the chat's own pages not on a tab, the best match first. */
function blankRows(s, b) {
  const q = b.q.trim(),
    pages = chatPages(s);
  if (!q) return pages;
  const hits = [];
  pages.forEach((x, i) => {
    const m = fuzzy(
      x.kind === 'pr'
        ? [x.pr.label, x.pr.title || '']
        : x.kind === 'ticket'
          ? [x.t.key, x.t.summary || '']
          : [x.name, x.url],
      q.toLowerCase(),
    );
    if (m) hits.push([m.score, i, x]);
  });
  return [typedPage(q), ...hits.sort((a, c) => c[0] - a[0] || a[1] - c[1]).map(h => h[2])];
}
/** The half under a blank tab: the rows its box would open, the one ⏎ takes marked. */
function blankHtml(s, b) {
  const rows = blankRows(s, b),
    q = b.q.trim().toLowerCase();
  b.sel = Math.max(0, Math.min(b.sel, rows.length - 1));
  return `<div class="blist">${
    rows.length
      ? (q ? '' : `<div class="bhd">This chat's pages</div>`) +
        rows
          .map((x, i) =>
            launchRow(
              x,
              i,
              j => (j === b.sel ? ' sel' : ''),
              t => markHits(t, q),
              false,
            ),
          )
          .join('')
      : '<div class="bnone">Type an address, or words to search the web</div>'
  }</div><div class="bkeys"><kbd>⏎</kbd> opens <kbd>↑↓</kbd> picks <kbd>esc</kbd> ${b.q ? 'clears' : 'closes the tab'}</div>`;
}
/** Each half showing a blank tab gets its list, the other halves none. */
function placeBlanks(s, p) {
  for (const tm of terms) {
    const host = $(tm.el.body),
      b = s && isBlankTab(p[tm.g]) ? blankOf(s, p[tm.g]) : null;
    let el = host.querySelector(':scope > .gblank');
    if (!b) {
      el?.remove();
      continue;
    }
    if (!el) el = host.appendChild(html2el('<div class="gblank"></div>'));
    el.dataset.tab = p[tm.g];
    setHtml(el, blankHtml(s, b));
  }
}
/** The tab becomes the page: in its half and its place, in front. A link the pane does not take goes where
      openExternal sends it, and the blank tab goes. */
function fillBlank(s, k, x) {
  if (!x) return;
  const url = x.kind === 'pr' ? x.pr.url : x.kind === 'ticket' ? x.t.url : x.url,
    g = isSplit(s) ? homeOf(s, k) : 0;
  blanks.set(
    s.id,
    (blanks.get(s.id) || []).filter(b => 'new:' + b.n !== k),
  );
  homes.get(s.id)?.delete(k);
  if (!inApp || !IN_PANE.test(url)) {
    openExternal(url, { s });
    syncTerm(s);
    focusBoard();
    focusTerm();
    return;
  }
  const t = pageTab(s, url) || pageKey(s, url),
    l = state.paneGh.get(s.id) || [];
  if (!l.includes(t)) state.paneGh.set(s.id, [...l, t]);
  if (isSplit(s)) {
    if (!homes.has(s.id)) homes.set(s.id, new Map());
    homes.get(s.id).set(t, g);
  }
  if (GH_PR.test(url)) shownPr.url = url;
  setTab(s, t);
  syncTerm(s);
}
/** esc in the box: what was typed goes, and with nothing typed the tab does — it never held anything. */
function blankEscape(s, k) {
  const b = blankOf(s, k);
  if (!b) return;
  if (b.q) {
    b.q = '';
    b.sel = 0;
    const box = document.querySelector(`.ptab[data-tab="${k}"] .paddr`);
    if (box) box.value = '';
    syncTerm(s);
    focusTerm();
  } else dropTab(s, k);
}
/** The box's own keys and its text; a row clicked; a press on the half's empty part keeps the keys in the box. */
{
  const at = e => {
    const k = e.target.closest?.('.ptab.blank, .gblank')?.dataset.tab,
      s = state.sessions.get(state.current);
    return { s, k, b: s && blankOf(s, k) };
  };
  $('#groups').addEventListener('input', e => {
    if (!e.target.matches?.('.paddr')) return;
    const { s, b } = at(e);
    if (!b) return;
    b.q = e.target.value;
    b.sel = 0;
    placeBlanks(s, placeOf(s));
  });
  $('#groups').addEventListener('keydown', e => {
    if (!e.target.matches?.('.paddr') || e.metaKey || e.ctrlKey || e.altKey) return;
    const { s, k, b } = at(e);
    if (!b) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      b.sel += e.key === 'ArrowDown' ? 1 : -1;
      placeBlanks(s, placeOf(s));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      fillBlank(s, k, blankRows(s, b)[b.sel]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      blankEscape(s, k);
    }
  });
  $('#groups').addEventListener('mousedown', e => {
    const list = e.target.closest?.('.gblank');
    if (!list) return;
    e.preventDefault(); // the box keeps the keys
    const { s, k, b } = at(e),
      row = e.target.closest('.pkrow');
    if (b && row) fillBlank(s, k, blankRows(s, b)[+row.dataset.i]);
    else focusTerm();
  });
}
