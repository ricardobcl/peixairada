// ---- a blank tab: ⌘T on a page (2026-10-13) ----------------------------------------------------------------------
/** A blank tab, in front where a new tab goes, the keys in its address. */
function openBlank(session) {
  const blank = { n: ++blankSeq, q: '', sel: 0 };

  blanks.set(session.id, [...(blanks.get(session.id) || []), blank]);
  openNewTab(session, `new:${blank.n}`);
  syncTerm(session);
  focusBoard();
  focusTerm();
}

/** What the box would open: what was typed first, then the chat's own pages not on a tab, the best match first. */
function blankRows(session, blank) {
  const query = blank.q.trim();
  const pages = chatPages(session);

  if (!query) return pages;
  const hits = [];

  pages.forEach((page, index) => {
    const match = fuzzy(
      page.kind === 'pr'
        ? [page.pr.label, page.pr.title || '']
        : page.kind === 'ticket'
          ? [page.t.key, page.t.summary || '']
          : [page.name, page.url],
      query.toLowerCase(),
    );

    if (match) hits.push([match.score, index, page]);
  });

  return [typedPage(query), ...hits.sort((left, right) => right[0] - left[0] || left[1] - right[1]).map(hit => hit[2])];
}

/** The half under a blank tab: the rows its box would open, the one ⏎ takes marked. */
function blankHtml(session, blank) {
  const rows = blankRows(session, blank);
  const query = blank.q.trim().toLowerCase();

  blank.sel = Math.max(0, Math.min(blank.sel, rows.length - 1));
  return `<div class="blist">${
    rows.length
      ? (query ? '' : `<div class="bhd">This chat's pages</div>`) +
        rows
          .map((page, index) =>
            launchRow(
              page,
              index,
              rowIndex => (rowIndex === blank.sel ? ' sel' : ''),
              text => markHits(text, query),
              false,
            ),
          )
          .join('')
      : '<div class="bnone">Type an address, or words to search the web</div>'
  }</div><div class="bkeys"><kbd>⏎</kbd> opens <kbd>↑↓</kbd> picks <kbd>esc</kbd> ${blank.q ? 'clears' : 'closes the tab'}</div>`;
}

/** Each half showing a blank tab gets its list, the other halves none. */
function placeBlanks(session, place) {
  for (const tm of terms) {
    const host = $(tm.el.body);
    const blank = session && isBlankTab(place[tm.g]) ? blankOf(session, place[tm.g]) : null;

    let el = host.querySelector(':scope > .gblank');

    if (!blank) {
      el?.remove();
      continue;
    }

    if (!el) el = host.appendChild(html2el('<div class="gblank"></div>'));
    el.dataset.tab = place[tm.g];
    setHtml(el, blankHtml(session, blank));
  }
}

/** The tab becomes the page: in its half and its place, in front. A link the pane does not take goes where
      openExternal sends it, and the blank tab goes. */
function fillBlank(session, key, page) {
  if (!page) return;

  const url = page.kind === 'pr' ? page.pr.url : page.kind === 'ticket' ? page.t.url : page.url;
  const half = isSplit(session) ? homeOf(session, key) : 0;

  blanks.set(
    session.id,
    (blanks.get(session.id) || []).filter(blank => `new:${blank.n}` !== key),
  );

  homes.get(session.id)?.delete(key);

  if (!inApp || !IN_PANE.test(url)) {
    openExternal(url, { s: session });
    syncTerm(session);
    focusBoard();
    focusTerm();
    return;
  }

  const tab = pageTab(session, url) || pageKey(session, url);
  const pageTabs = state.paneGh.get(session.id) || [];

  if (!pageTabs.includes(tab)) state.paneGh.set(session.id, [...pageTabs, tab]);

  if (isSplit(session)) {
    if (!homes.has(session.id)) homes.set(session.id, new Map());
    homes.get(session.id).set(tab, half);
  }

  if (GH_PR.test(url)) shownPr.url = url;
  setTab(session, tab);
  syncTerm(session);
}

/** esc in the box: what was typed goes, and with nothing typed the tab does — it never held anything. */
function blankEscape(session, key) {
  const blank = blankOf(session, key);

  if (!blank) return;
  if (blank.q) {
    blank.q = '';
    blank.sel = 0;
    const box = document.querySelector(`.ptab[data-tab="${key}"] .paddr`);

    if (box) box.value = '';
    syncTerm(session);
    focusTerm();
  } else dropTab(session, key);
}

/** The box's own keys and its text; a row clicked; a press on the half's empty part keeps the keys in the box. */
{
  const at = event => {
    const key = event.target.closest?.('.ptab.blank, .gblank')?.dataset.tab;
    const session = state.sessions.get(state.current);

    return { s: session, k: key, b: session && blankOf(session, key) };
  };

  $('#groups').addEventListener('input', event => {
    if (!event.target.matches?.('.paddr')) return;
    const { s: session, b: blank } = at(event);

    if (!blank) return;
    blank.q = event.target.value;
    blank.sel = 0;
    placeBlanks(session, placeOf(session));
  });

  $('#groups').addEventListener('keydown', event => {
    if (!event.target.matches?.('.paddr') || event.metaKey || event.ctrlKey || event.altKey) return;
    const { s: session, k: key, b: blank } = at(event);

    if (!blank) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      blank.sel += event.key === 'ArrowDown' ? 1 : -1;
      placeBlanks(session, placeOf(session));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      fillBlank(session, key, blankRows(session, blank)[blank.sel]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      blankEscape(session, key);
    }
  });

  $('#groups').addEventListener('mousedown', event => {
    const list = event.target.closest?.('.gblank');

    if (!list) return;
    event.preventDefault(); // the box keeps the keys

    const { s: session, k: key, b: blank } = at(event);
    const row = event.target.closest('.pkrow');

    if (blank && row) fillBlank(session, key, blankRows(session, blank)[+row.dataset.i]);
    else focusTerm();
  });
}
