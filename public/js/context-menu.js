// ---- a right-click menu (2026-10-12) -----------------------------------------------------------------------------
// What ⌥-click, a double-click or a drag did alone: on a card — open, rename, tick or tick for good, take one of its
// PRs off, copy its link; on a PR chip — open it, take it off the chat; on the colour square — let go of the colour.
// The same rows are the launcher's (actionRows), for the keyboard.
const shownHere = pr => !!pr?.url;
const unlinkUrl = (s, url) => {
  const el = document.querySelector(
    `#shead .mxs[data-url="${CSS.escape(url)}"], #prlist .prrow[data-url="${CSS.escape(url)}"]`,
  );
  if (el) return unlinkPr(s, el);
  api('POST', `/api/sessions/${s.id}/unlink`, { url }).catch(err =>
    note($('#shead'), `Could not take it off: ${err.message}`, true),
  );
};
const moveFocused = s => {
  const k = tabOf(s);
  if (k && k !== 'chat') moveTab(s, k, placeOf(s)[0] === k ? 1 : 0);
  else note($('#shead'), 'The chat stays in its half — pick a tab to move', true);
};
const clearColor = name => {
  colorAt = '#shead';
  colorWas.set(name, projCfg(name).color ?? null);
  written.delete(name);
  previewColor(name, null);
  setColor(name, null);
};
/** A card's pin rows: Pin, or Unpin and a place up, down, to the top or the bottom — the way without a drag (WCAG 2.5.7). */
function prioRows(s, card) {
  if (!prioOn()) return [];
  if (!inPrio(s))
    return [
      { hr: true },
      { t: 'Pin', sub: 'the section up top, in your order · ⌥⌘I', fn: () => prioPut(s, true, null, card) },
    ];
  const list = secList(),
    i = list.indexOf(s),
    n = list.length;
  return [
    { hr: true },
    { t: 'Unpin', n: '⌥⌘I', fn: () => prioPut(s, false, null, card) },
    { t: 'Move up', n: '⌥⌘⇧↑', off: i <= 0, fn: () => prioMove(s, -1, card) },
    { t: 'Move down', n: '⌥⌘⇧↓', off: i < 0 || i >= n - 1, fn: () => prioMove(s, 1, card) },
    { t: 'To the top', off: i <= 0, fn: () => prioMove(s, -Infinity, card) },
    { t: 'To the bottom', off: i < 0 || i >= n - 1, fn: () => prioMove(s, Infinity, card) },
  ];
}
function ctxRows(e) {
  // the status bar: what else it says, ticked, and its settings (2026-10-16 — as the menu bar's and the Dock's are set
  // from a right-click on them)
  if (e.target.closest('#sbar')) {
    const has = k => (prefs.barStats || []).includes(k);
    return [
      ...BAR_STATS.map(([k, t]) => ({
        t,
        on: has(k),
        check: true,
        fn: () => setBarStats(has(k) ? prefs.barStats.filter(x => x !== k) : [...(prefs.barStats || []), k]),
      })),
      { hr: true },
      fishing.until
        ? { t: 'Come back from fishing', fn: backFromFishing }
        : { t: `Go fishing, ${FISH_MIN} min`, sub: 'Questions still ring, the rest waits', fn: () => goFishing() },
      { hr: true },
      { t: 'Status bar settings…', fn: () => settingsAt('look', '#sbarStats') },
    ];
  }
  const tvc = e.target.closest('#tv .tvc[data-url]'),
    tvw = e.target.closest('#tv .tvc[data-k="you"], #tv .tvc[data-k="claude"]'); // a chip in the timeline (2026-10-17): alone, in or out, a PR's page
  if (tvw) {
    const s = state.sessions.get(state.current),
      w = tvw.dataset.k,
      sc = s && tvScope(s, tvModel(s));
    if (!s) return null;
    return [
      { t: sc[w] && !sc[TV_WHO[w]] && !sc.on.size ? 'Everything in play again' : 'Only these', fn: () => tvSolo(s, w) },
      { t: sc[w] ? 'Leave them out' : 'Bring them in', fn: () => tvSide(s, w) },
    ];
  }
  if (tvc) {
    const s = state.sessions.get(state.current),
      url = tvc.dataset.url,
      sc = s && tvScope(s, tvModel(s));
    if (!s) return null;
    return [
      { t: sc.solo === url ? 'Everything in play again' : 'Only this one', fn: () => tvSolo(s, url) },
      { t: sc.on.has(url) ? 'Leave it out' : 'Bring it in', fn: () => tvToggle(s, url) },
      { hr: true },
      { t: 'Open it on GitHub', fn: () => openExternal(url, { s }) },
    ];
  }
  const agRow = e.target.closest('.agr[data-ag]');
  if (agRow) {
    const s = state.sessions.get(agRow.closest('.card, .ot')?.dataset.id || state.current),
      r = s?.agentRows?.find(x => x.id === agRow.dataset.ag);
    return r ? agMenu(s, r, agRow) : null;
  }
  const card = e.target.closest('#slist > .card'),
    chip = e.target.closest('.tmx [data-url], .prrow[data-url]'),
    sq = e.target.closest('.sq.pick[data-name]');
  if (chip) {
    const s = state.sessions.get(card?.dataset.id || state.current),
      url = chip.dataset.url;
    if (!s || !url) return null;
    return [
      { t: 'Open the PR', fn: () => openExternal(url, { s }) },
      {
        t: 'Copy its link',
        fn: () => copyText(url).then(ok => note(chip, ok ? 'Link copied' : 'Could not copy it', !ok)),
      },
      {
        t: 'Its timeline',
        sub: 'its events and the turns about it · ⌥⌘J',
        fn: () => {
          if (state.current !== s.id) openSession(s.id);
          tvOpenOn(s, url);
        },
      },
      { t: 'Take it off this chat', warn: true, fn: () => unlinkUrl(s, url) },
    ];
  }
  const hm = e.target.closest('#shead .hmove');
  if (hm) {
    const s = state.sessions.get(state.current);
    return s && [{ t: 'Let this round go — the next move tells you', fn: () => letGo(s, $('#shead .hmove')) }];
  }
  if (sq)
    return projCfg(sq.dataset.name).color
      ? [
          { t: 'Pick a colour…', fn: () => sq.click() },
          { t: 'Let go of the colour', fn: () => clearColor(sq.dataset.name) },
        ]
      : [{ t: 'Pick a colour…', fn: () => sq.click() }];
  // a node in Space (2026-11-24): the card's rows, what its state wants first — its question, its resume —, its tick
  // Space's own (the chat open beside it stays), its star; an agent's mark its agent's menu
  const spa = e.target.closest('#spgrid .spa[data-ag]');
  if (spa) {
    const s = state.sessions.get(spa.dataset.sid),
      r = s && spRows(s).find(x => x.id === spa.dataset.ag);
    return r ? agMenu(s, r, spa) : null;
  }
  const spt = e.target.closest('#spgrid .spt[data-id]');
  if (spt) {
    const s = state.sessions.get(spt.dataset.id);
    return s ? spMenu(s, spt) : null;
  }
  if (!card) return null;
  const s = state.sessions.get(card.dataset.id);
  if (!s) return null;
  return chatRows(s, card);
}
/** A chat's rows, the card's menu and a node's: `space` ticks it as Space does, the chat beside it left open. */
function chatRows(s, card, space = false) {
  const tick = (done, forGood = false) =>
    space && !forGood ? spTick(s.id, card.querySelector('.spdone') || card) : tickDone(s.id, done, card, null, forGood);
  return [
    { t: 'Open', fn: () => openSession(s.id) },
    ...((s.prs || []).length
      ? [
          {
            t: 'Open its timeline',
            sub: 'the chat and its PRs in one order · ⌥⌘J',
            fn: () => {
              if (state.current !== s.id) openSession(s.id);
              tvOpenOn(s, movedPrs(s)[0]?.url);
            },
          },
        ]
      : []),
    {
      t: 'Rename…',
      fn: async () => {
        await openSession(s.id);
        if (state.current === s.id) editTitle(state.sessions.get(s.id) || s);
      },
    }, // the box in its own header, never another's (2026-10-14)
    ...(s.cwd
      ? [
          scopedOn(s)
            ? { t: 'Every project', sub: 'show all · ⌥⌘P ⌥⌘P', fn: () => selectProject(ALL) }
            : { t: `Only ${s.project}`, sub: 'narrow the list to it', fn: () => selectProject(projDir(s.cwd)) },
        ]
      : []),
    ...talkRows(s), // chats that talk (2026-10-31): what goes from this chat to another, and the chats tied to it
    ...prioRows(s, card), // Top priority, in or out, and its place (2026-11-24, round XXX's A1, R4)
    asleep(s)
      ? { t: 'Wake it now', sub: `snoozed ${snoozeSay(s.snooze)}`, fn: () => snoozeIt(s, { undo: true }, card) } // …and a snooze (S1)
      : asking(s)
        ? { t: 'Snooze…', sub: 'it is asking you — a question wakes a snooze', off: true }
        : {
            t: 'Snooze…',
            sub: 'till a time, or till something happens · ⌥⌘S',
            fn: () => snoozeMenu(s, ...$('#ctxm')._at),
          },
    ...(s.done
      ? [{ t: 'Back on the board (↩)', fn: () => tick(false) }]
      : canTick(s)
        ? [
            { t: 'Done', ...(watchEnds(s) ? { sub: `ends its watch — ${watchEnds(s)}` } : {}), fn: () => tick(true) },
            ...(s.prs?.length && !s.forGood
              ? [{ t: 'Done for good — its PRs forgotten', fn: () => tick(true, true) }]
              : []),
          ]
        : []),
    {
      t: 'Delete from the board',
      sub: `${removeEnds(s) ? `ends ${removeEnds(s)}, asks once more` : 'its claude ends'}; the transcript stays · ⌥-click ✓`,
      warn: true,
      fn: () => removeChat(s.id, card),
    },
    ...(movedPrs(s).length
      ? [{ t: 'Let this round of your move go', fn: () => letGo(s, card.querySelector('.state.prmove')) }]
      : []),
    s.muted
      ? { t: 'Unmute', fn: () => setMuted(s.id, false) }
      : { t: 'Mute', sub: 'no banner, sound or count, questions too', fn: () => setMuted(s.id, true) },
    ...((s.prs || []).length
      ? [
          { hr: true },
          ...(s.prs || [])
            .slice(0, 6)
            .map(pr => ({ t: `Take ${pr.label.replace(/^.*?#/, '#')} off this chat`, fn: () => unlinkUrl(s, pr.url) })),
        ]
      : []),
    { hr: true },
    {
      t: 'Copy its link',
      fn: () =>
        copyText(`${location.origin}/#${s.id}`).then(ok => note(card, ok ? 'Link copied' : 'Could not copy it', !ok)),
    },
  ];
}
function spMenu(s, node) {
  const pill = node.querySelector('.spask[data-tid]');
  const first = [
    ...(pill
      ? [
          {
            t: 'Answer its question…',
            sub: 'its answers, read off its drawer · ⏎',
            fn: () => spAskOpen(s.id, pill.dataset.tid),
          },
        ]
      : asking(s)
        ? [{ t: 'Answer its question…', sub: `it asks in ${entryLabel(s)}`, off: true }]
        : []),
    ...(resumable(s)
      ? [
          {
            t: 'Resume here',
            sub: 'its claude in a drawer · ⌥⌘C',
            fn: async () => {
              await openSession(s.id);
              const c = state.sessions.get(s.id);
              if (c) termAction(c);
            },
          },
        ]
      : []),
  ];
  const rows = chatRows(s, node, true);
  return [
    ...first,
    ...(first.length ? [{ hr: true }] : []),
    ...rows.slice(0, 1),
    s.fav
      ? { t: 'Unstar', sub: 'F', fn: () => setFav(s.id, false) }
      : { t: 'Star', sub: 'first, a row of its own · F', fn: () => setFav(s.id, true) },
    ...rows.slice(1),
  ];
}
document.addEventListener('contextmenu', e => {
  if (e.target.closest('input, textarea, .tbody, #log .text, #log pre')) return; // a box, a terminal, the words: the system's menu
  const rows = ctxRows(e);
  if (!rows) return;
  e.preventDefault();
  ctxShow(rows, e.clientX, e.clientY, 'ctx', !!e.target.closest('#sbar')); // the bar's menu ends at the pointer, above it
});
// The menu's rows at a point — or ending at it, `above` (a control at the window's foot) — and from what (`m._from`):
// a row with `on` is a choice, ticked when on; `mark` and `n` a mark before it and a count after.
// `sub` a second line — where a PR's branch is, why a row is `off` (disabled) — 2026-10-13
const ctxRow = (r, i) =>
  r.hr
    ? '<hr>'
    : `<button type="button" data-i="${i}"${r.warn || r.sub ? ` class="${r.warn ? 'warn' : ''}${r.warn && r.sub ? ' ' : ''}${r.sub ? 'two' : ''}"` : ''}${r.off ? ' disabled' : ''}${'on' in r ? ` role="${r.check ? 'menuitemcheckbox' : 'menuitemradio'}" aria-checked="${!!r.on}"` : ''}${r.tip ? ` title="${esc(r.tip)}"` : ''}>${r.mark ? `<i class="cmk ${r.mark}"></i>` : ''}${r.sub ? `<span class="ct">${r.key ? `<kbd class="ck">${r.key}</kbd>` : ''}${esc(r.t)}</span>` : `${r.key ? `<kbd class="ck">${r.key}</kbd>` : ''}${esc(r.t)}`}${r.n != null ? `<span class="cn">${esc(String(r.n))}</span>` : ''}${r.sub ? `<span class="csub">${esc(r.sub)}</span>` : ''}</button>`;
function ctxShow(rows, x, y, from, above = false) {
  const m = $('#ctxm');
  m.innerHTML = rows.map(ctxRow).join('');
  m.classList.toggle(
    'checks',
    rows.some(r => 'on' in r),
  );
  m.classList.toggle(
    'wide',
    rows.some(r => r.sub),
  );
  m._rows = rows;
  m._from = from;
  m._at = [x, y, above];
  if (!m.open) m.show();
  const w = m.offsetWidth,
    h = m.offsetHeight;
  m.style.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
  m.style.top = `${Math.max(8, Math.min(above ? y - h : y, innerHeight - h - 8))}px`;
  (m.querySelector('[aria-checked="true"]') || m.querySelector('button'))?.focus({ preventScroll: true });
  repostPane();
}
$('#ctxm').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  const r = $('#ctxm')._rows[+b.dataset.i];
  $('#ctxm').close();
  r?.fn?.();
});
$('#ctxm').addEventListener('keydown', e => {
  // a row's digit picks it (2026-11-24, round XXX's S2: the snooze menu's times and things to wait for)
  const k = /^Digit([1-9])$/.exec(e.code),
    m = $('#ctxm'),
    pick = k && !e.metaKey && !e.altKey && !e.ctrlKey ? (m._rows || []).findIndex(r => r.key === +k[1] && !r.off) : -1;
  if (pick >= 0) {
    e.preventDefault();
    m.close();
    m._rows[pick].fn?.();
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const bs = [...$('#ctxm').querySelectorAll('button')],
    i = bs.indexOf(document.activeElement);
  bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus();
});
document.addEventListener(
  'pointerdown',
  e => {
    const m = $('#ctxm');
    if (m.open && !e.composedPath().includes(m)) {
      m.close();
      m._shut = performance.now();
    }
  },
  true,
);
// The list's filter (2026-10-12): the funnel's menu — every chat, or only the ones with a PR at your move, or with a
// new reply — counted in the project in view (fCounts, from drawFilter), as the list would show it: the query and the
// face narrowing it too (2026-10-14; the project's alone before, a count the list did not show). A press on the funnel
// that closed its own menu leaves it closed.
let fCounts = {};
function setFilter(k) {
  const was = prioFocus();
  prefs.listFilter = FILTERS[k] ? k : null;
  if (prioFocus() && !was) prefs.focusSince = Date.now(); // focus (2026-11-24, round XXX): from when its catch counts
  savePrefs();
  if (prefs.listFilter) showList(true);
  renderBoard();
  $('#slist').scrollTop = 0;
  if (was && !prioFocus()) focusCatch();
}
/** Out of focus: what came meanwhile in one line, as fishing's catch (F3) — unless fishing, whose catch will say it. */
function focusCatch() {
  const since = prefs.focusSince;
  prefs.focusSince = 0;
  savePrefs();
  if (!since || fishing.until) return;
  const line = outLine(since);
  if (line) laneNews(`<b>While in focus:</b>${line}`);
}
function drawFilter(p, narrow = () => true) {
  const f = listFilter(),
    b = $('#fBtn'),
    fl = b.querySelector('.fl');
  fCounts = Object.fromEntries(
    filterList().map(([k, x]) => [k, p.sessions.filter(s => x.test(s) && narrow(s)).length]),
  );
  const label = f ? `${f.name} · ${fCounts[prefs.listFilter]}` : '';
  if (fl.textContent !== label) fl.textContent = label;
  b.classList.toggle('on', !!f);
  b.setAttribute('aria-pressed', String(!!f));
  b.title = f
    ? `Only the ${f.tip} — click for every chat, or the other filter`
    : 'Show only some chats — a PR at your move, or a new reply';
}
$('#fBtn').addEventListener('click', () => {
  const m = $('#ctxm'),
    b = $('#fBtn');
  if (m._from === 'filter' && performance.now() - (m._shut || 0) < 400) return;
  const r = b.getBoundingClientRect(),
    up = r.top > innerHeight / 2;
  ctxShow(
    [
      { t: 'Every chat', on: !prefs.listFilter, fn: () => setFilter(null) },
      { hr: true },
      ...filterList().map(([k, f]) => ({
        t: f.name,
        tip: `Only the ${f.tip}`,
        mark: k,
        n: fCounts[k] || 0,
        on: prefs.listFilter === k,
        fn: () => setFilter(prefs.listFilter === k ? null : k),
      })),
    ],
    r.left,
    up ? r.top - 6 : r.bottom + 6,
    'filter',
    up,
  );
});
$('#ctxm').addEventListener('close', () => repostPane()); // an arrow: repostPane is a const further down
function unlinkPr(s, el) {
  const url = el.dataset.url;
  if (!url || el.dataset.going) return;
  el.dataset.going = '1';
  noteMotion(s.id, 'unlink');
  const fold = REDUCED.matches
    ? null
    : el.animate(
        [
          { opacity: 1, scale: 1 },
          { opacity: 0, scale: 0.6 },
        ],
        { duration: UNLINK_MS, easing: EASE_OUT, fill: 'forwards', id: 'unlink' },
      );
  setTimeout(
    () =>
      api('POST', `/api/sessions/${s.id}/unlink`, { url }).catch(err => {
        fold?.cancel();
        delete el.dataset.going;
        note(seen(el.isConnected ? el : $('#prToggle')), `Could not take it off: ${err.message}`, true);
      }),
    fold ? UNLINK_MS : 0,
  );
}
/** ⌥-click on a chat's "your move" (2026-10-12): its PRs at your move let go this round — not your move, nor counted,
 *  until the next move on one, which alerts as any other (the server's waiveTurn). The line fades, then the server is
 *  told; the chat's update takes the line away. */
function letGo(s, el = null) {
  if (!s || el?.dataset.going) return;
  if (el) el.dataset.going = '1';
  noteMotion(s.id, 'letgo');
  const fade =
    !el || REDUCED.matches
      ? null
      : el.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: UNLINK_MS,
          easing: EASE_OUT,
          fill: 'forwards',
          id: 'letgo',
        });
  setTimeout(
    () =>
      api('POST', `/api/sessions/${s.id}/waive`).catch(err => {
        fade?.cancel();
        if (el) delete el.dataset.going;
        note(seen(el), `Could not let it go: ${err.message}`, true);
      }),
    fade ? UNLINK_MS : 0,
  );
}
$('#shead').addEventListener(
  'click',
  e => {
    // ⌥ on the header's "your move": this round let go — a click, its PR's timeline (2026-10-17)
    const mv = e.target.closest('.hmove');
    if (!mv) return;
    e.preventDefault();
    e.stopPropagation();
    const s = state.sessions.get(state.current);
    if (e.altKey) letGo(s, mv);
    else tvOpenOn(s, movedPrs(s)[0]?.url);
  },
  true,
);
// A row's link copied (2026-10-21): its mark next to its name — the link not followed — and said on the mark itself, a
// ✓ for COPIED_MS; a redraw of the rows takes it with it
$('#prlist').addEventListener(
  'click',
  async e => {
    const c = e.target.closest('.prrow .prcopy');
    if (!c) return;
    e.preventDefault();
    e.stopPropagation();
    const row = c.closest('.prrow'),
      url = row.dataset.url || row.getAttribute('href') || '';
    if (!/^https?:\/\//.test(url)) return;
    const ok = await copyText(url);
    if (!ok) return note(c, 'Could not copy it', true);
    c.classList.add('did');
    c.title = 'Link copied';
    clearTimeout(c._did);
    c._did = setTimeout(() => {
      c.classList.remove('did');
      c.title = 'Copy its link';
    }, COPIED_MS);
  },
  true,
);
$('#prlist').addEventListener(
  'click',
  e => {
    // before #chat's link handler, which would open the PR
    const r = e.altKey && e.target.closest('.prrow[data-url]');
    if (!r) return;
    e.preventDefault();
    e.stopPropagation();
    const s = state.sessions.get(state.current);
    if (s) unlinkPr(s, r);
  },
  true,
);
$('#shead').addEventListener('click', e => {
  // the branch moved under it (2026-10-13): you know — gone at the click, the server's word following
  if (!e.target.closest('#driftBtn')) return;
  const s = state.sessions.get(state.current);
  if (!s?.drift) return;
  s.drift = null;
  renderHead(s);
  renderBoard();
  api('POST', `/api/sessions/${s.id}/drift`).catch(err =>
    note($('#shead'), `Could not set the branch's move aside: ${err.message}`, true),
  );
});
// The PR list's ends (2026-10-21), as the chat list's (drawEdges): what is out of sight past each — a row is when its
// middle is — counted on a pill, the accent's dot when one of them is at your move; a click scrolls a window's worth.
// Read once a frame, after a draw, a scroll or a resize.
function prEdgesSoon() {
  if (!prEdgesSoon.raf)
    prEdgesSoon.raf = requestAnimationFrame(() => {
      prEdgesSoon.raf = 0;
      prEdges();
    });
}
function prEdges() {
  const sc = $('#prScroll');
  if (!sc || $('#prlist').hidden) return;
  const top = sc.scrollTop,
    bottom = top + sc.clientHeight,
    out = [
      { n: 0, you: 0 },
      { n: 0, you: 0 },
    ];
  for (const r of sc.querySelectorAll(':scope > :is(.prline, .prrow.tk)')) {
    const mid = r.offsetTop + r.offsetHeight / 2,
      o = mid < top ? out[0] : mid > bottom ? out[1] : null;
    if (!o) continue;
    o.n++;
    if (r.querySelector('.prrow[data-turn="you"]')) o.you++;
  }
  out.forEach((o, i) => {
    const el = sc.parentElement.querySelector(i ? '.pedge.down' : '.pedge.up'),
      b = el.firstElementChild,
      key = `${o.n}/${o.you}`;
    el.classList.toggle('on', o.n > 0);
    if (b.dataset.key === key) return;
    b.dataset.key = key;
    if (!o.n) return;
    b.innerHTML = `${i ? '↓' : '↑'} <b>${o.n}</b> more${o.you ? '<i class="you"></i>' : ''}`;
    b.title = `${o.n} more ${i ? 'below' : 'above'}${o.you ? ` — ${o.you} at your move` : ''} · click to scroll ${i ? 'down' : 'up'}`;
  });
}
$('#prlist').addEventListener(
  'scroll',
  e => {
    if (e.target.id === 'prScroll') prEdgesSoon();
  },
  { capture: true, passive: true },
); // a scroll does not bubble
// The list's height (2026-10-21): its foot dragged up or down sizes the rows' window — the board's, kept in
// prefs.prsHeight —, two rows' worth at least and most of the window at most; a double-click gives it its own again.
// The arrow in the foot is still a click.
$('#prlist').addEventListener('pointerdown', e => {
  const foot = e.target.closest('.pfoot');
  if (!foot || e.target.closest('button') || e.button !== 0) return;
  const sc = $('#prScroll');
  if (!sc) return;
  e.preventDefault();
  foot.setPointerCapture(e.pointerId);
  const y0 = e.clientY,
    h0 = sc.getBoundingClientRect().height,
    max = Math.max(80, innerHeight * 0.75);
  const was = prefs.prsHeight;
  foot.classList.add('drag');
  document.body.classList.add('prsizing');
  // the height is the pref while it moves (a redraw of the list mid-drag reads it), saved once let go
  const move = ev => {
    prefs.prsHeight = Math.round(Math.min(max, Math.max(44, h0 + ev.clientY - y0)));
    $('#prlist').style.setProperty('--prs-h', `${prefs.prsHeight}px`);
    prEdgesSoon();
  };
  const up = () => {
    for (const [t, f] of [
      ['pointermove', move],
      ['pointerup', up],
      ['lostpointercapture', up],
    ])
      foot.removeEventListener(t, f);
    foot.classList.remove('drag');
    document.body.classList.remove('prsizing');
    if (prefs.prsHeight !== was) savePrefs();
  };
  foot.addEventListener('pointermove', move);
  foot.addEventListener('pointerup', up);
  foot.addEventListener('lostpointercapture', up);
});
$('#prlist').addEventListener('dblclick', e => {
  if (!e.target.closest('.pfoot') || e.target.closest('button')) return;
  prefs.prsHeight = null;
  savePrefs();
  $('#prlist').style.setProperty('--prs-h', '');
  prEdgesSoon();
});
new ResizeObserver(() => prEdgesSoon()).observe($('#prlist'));
$('#prlist').addEventListener('click', e => {
  const b = e.target.closest('.pedge button');
  if (!b) return;
  const sc = $('#prScroll');
  sc.scrollBy({
    top: +b.dataset.dir * Math.max(40, sc.clientHeight - 40),
    behavior: REDUCED.matches ? 'auto' : 'smooth',
  });
});
$('#prlist').addEventListener('click', e => {
  // a PR row's own controls (2026-10-13)
  const b = e.target.closest('.pract');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  const s = state.sessions.get(state.current);
  if (!s) return;
  if (b.dataset.pract === 'letgo' || b.dataset.pract === 'undo')
    roundGo(s, b.dataset.url, b.dataset.pract === 'undo', b);
  else if (b.dataset.pract === 'ask') askClaude(s, b.dataset.url, b);
  else if (b.dataset.pract === 'diff') openPrDiff(s, b.dataset.url);
  else if (b.dataset.pract === 'timeline') tvOpenOn(s, b.dataset.url);
  else if (b.dataset.pract === 'editor') editorMenu(s, b.dataset.url, b);
  else if (b.dataset.pract === 'chat') prChatMenu(s, b.dataset.url, b);
});
/** One PR's round let go, or taken back (2026-10-15): the server's word redraws the row. */
function roundGo(s, url, undo, at) {
  if (at.disabled) return;
  at.disabled = true;
  api('POST', `/api/sessions/${s.id}/waive`, undo ? { url, undo: true } : { url }).catch(err => {
    at.disabled = false;
    note(at, `Could not ${undo ? 'take it back' : 'let it go'}: ${err.message}`, true);
  });
}
/** What came round on a PR, typed into the chat's Claude unsent — the drawer's, else copied. */
async function askClaude(s, url, at) {
  const pr = s.prs?.find(p => p.url === url);
  if (!pr?.turn) return;
  const text = `${pr.turn.why} on ${pr.url} — read it and address it`,
    tm = claudeTm(s);
  if (!tm) {
    const ok = await copyText(text);
    return note(
      at,
      `No claude of this chat in a drawer here${ok ? ' — the prompt is copied' : ''} · ⌥⌘C starts one`,
      true,
    );
  }
  showChat(s);
  termSend(tm, forClaude(text));
  focusTerm();
  note(at, 'Typed into Claude — ⏎ sends it');
}
/** A new chat on a PR's branch (2026-10-13): in the tree that has it out, else in a worktree made for it — the chat's
 *  folder is then its branch, and its changes, its editor and its zsh are the branch's by construction. */
const prChatting = new Set(); // the PRs a chat is being started on (2026-11-04): a second press meanwhile is the same press
async function chatOnPr(s, url, at, agent) {
  // `agent` (2026-11-06): its Chat ▾'s, prChatMenu
  if (prChatting.has(url)) return;
  prChatting.add(url);
  note(at, 'Finding its tree…');
  try {
    let t;
    try {
      t = await api('POST', '/api/worktrees', { cwd: s.cwd, pr: url });
    } catch (e) {
      return note(at, e.message, true);
    }
    document.querySelectorAll('.note').forEach(n => n.remove());
    wtData.delete(s.cwd);
    $('#pick').open && $('#pick').close();
    await newChat(t.path, null, withAgent(agent));
  } finally {
    prChatting.delete(url);
  }
}
/** A PR row's Chat ▾ (2026-11-06, round XXVIII's E1): a chat on its branch, plain or as an agent — the one you last took
 *  for a PR first, then the folder's and yours, or any of them (the agent picker). */
async function prChatMenu(s, url, at) {
  const v = s.cwd ? await agentsOf(s.cwd) : null,
    pr = (s.prs || []).find(p => p.url === url);
  const go = a => {
    prefs.prAgent = a;
    savePrefs();
    chatOnPr(s, url, at, a);
  };
  const rows = [
    {
      t: 'A chat on its branch',
      sub: 'in the folder that has it out, else a worktree of its own',
      fn: () => chatOnPr(s, url, at),
    },
  ];
  if (v && !v.launchers) {
    const last = v.agents.find(a => a.name === prefs.prAgent);
    const offer = [
      ...new Set([last, ...v.agents.filter(a => a.source === 'folder' || a.source === 'user')].filter(Boolean)),
    ].slice(0, 4);
    rows.push(
      { hr: true },
      ...offer.map(a => ({
        t: `…as @${agentShort(a.name)}`,
        sub: [agentFrom(a, s.cwd), agentModel(a), a === last ? 'the agent you last took for a PR' : '']
          .filter(Boolean)
          .join(' · '),
        fn: () => go(a.name),
      })),
      {
        t: '…as another agent…',
        sub: 'the folder’s, yours, the plugins’, Claude Code’s',
        fn: () => pickOpen('agent', { cwd: s.cwd, ag: v, title: `A chat on ${pr?.label || 'its branch'}`, then: go }),
      },
    );
  }
  const rc = at.getBoundingClientRect();
  ctxShow(rows, rc.right - 360, rc.bottom + 4, 'prchat');
}
