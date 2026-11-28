// ---- a right-click menu (2026-10-12) -----------------------------------------------------------------------------
// What ⌥-click, a double-click or a drag did alone: on a card — open, rename, tick or tick for good, take one of its
// PRs off, copy its link; on a PR chip — open it, take it off the chat; on the colour square — let go of the colour.
// The same rows are the launcher's (actionRows), for the keyboard.
const shownHere = pr => !!pr?.url;

const unlinkUrl = (session, url) => {
  const el = document.querySelector(
    `#shead .mxs[data-url="${CSS.escape(url)}"], #prlist .prrow[data-url="${CSS.escape(url)}"]`,
  );

  if (el) return unlinkPr(session, el);

  api('POST', `/api/sessions/${session.id}/unlink`, { url }).catch(err =>
    note($('#shead'), `Could not take it off: ${err.message}`, true),
  );
};

const moveFocused = session => {
  const key = tabOf(session);
  const gs = groupsOf(session);

  if (key && key !== 'chat') {
    moveTab(
      session,
      key,
      isTiled(session) ? gs[(gs.indexOf(homeOf(session, key)) + 1) % gs.length] : placeOf(session)[0] === key ? 1 : 0,
    );
  } else note($('#shead'), 'The chat stays in its half — pick a tab to move', true);
};

const clearColor = name => {
  colorAt = '#shead';
  colorWas.set(name, projCfg(name).color ?? null);
  written.delete(name);
  previewColor(name, null);
  setColor(name, null);
};

/** A card's pin rows: Pin, or Unpin and a place up, down, to the top or the bottom — the way without a drag (WCAG 2.5.7). */
function prioRows(session, card) {
  if (!prioOn()) return [];

  if (!inPrio(session)) {
    return [
      { hr: true },
      { t: 'Pin', sub: 'the section up top, in your order · ⌥⌘I', fn: () => prioPut(session, true, null, card) },
    ];
  }

  const list = secList();
  const index = list.indexOf(session);
  const count = list.length;

  return [
    { hr: true },
    { t: 'Unpin', n: '⌥⌘I', fn: () => prioPut(session, false, null, card) },
    { t: 'Move up', n: '⌥⌘⇧↑', off: index <= 0, fn: () => prioMove(session, -1, card) },
    { t: 'Move down', n: '⌥⌘⇧↓', off: index < 0 || index >= count - 1, fn: () => prioMove(session, 1, card) },
    { t: 'To the top', off: index <= 0, fn: () => prioMove(session, -Infinity, card) },
    { t: 'To the bottom', off: index < 0 || index >= count - 1, fn: () => prioMove(session, Infinity, card) },
  ];
}

function ctxRows(event) {
  // the status bar: what else it says, ticked, and its settings (2026-10-16 — as the menu bar's and the Dock's are set
  // from a right-click on them)
  if (event.target.closest('#sbar')) {
    const has = key => (prefs.barStats || []).includes(key);

    return [
      ...BAR_STATS.map(([key, label]) => ({
        t: label,
        on: has(key),
        check: true,
        fn: () =>
          setBarStats(has(key) ? prefs.barStats.filter(stat => stat !== key) : [...(prefs.barStats || []), key]),
      })),
      { hr: true },
      fishing.until
        ? { t: 'Come back from fishing', fn: backFromFishing }
        : { t: `Go fishing, ${FISH_MIN} min`, sub: 'Questions still ring, the rest waits', fn: () => goFishing() },
      { hr: true },
      { t: 'Status bar settings…', fn: () => settingsAt('look', '#sbarStats') },
    ];
  }

  const tvc = event.target.closest('#tv .tvc[data-url]');
  const tvw = event.target.closest('#tv .tvc[data-k="you"], #tv .tvc[data-k="claude"]'); // a chip in the timeline (2026-10-17): alone, in or out, a PR's page

  if (tvw) {
    const session = state.sessions.get(state.current);
    const who = tvw.dataset.k;
    const sc = session && tvScope(session, tvModel(session));

    if (!session) return null;
    return [
      {
        t: sc[who] && !sc[TV_WHO[who]] && !sc.on.size ? 'Everything in play again' : 'Only these',
        fn: () => tvSolo(session, who),
      },
      { t: sc[who] ? 'Leave them out' : 'Bring them in', fn: () => tvSide(session, who) },
    ];
  }

  if (tvc) {
    const session = state.sessions.get(state.current);
    const url = tvc.dataset.url;
    const sc = session && tvScope(session, tvModel(session));

    if (!session) return null;
    return [
      { t: sc.solo === url ? 'Everything in play again' : 'Only this one', fn: () => tvSolo(session, url) },
      { t: sc.on.has(url) ? 'Leave it out' : 'Bring it in', fn: () => tvToggle(session, url) },
      { hr: true },
      { t: 'Open it on GitHub', fn: () => openExternal(url, { s: session }) },
    ];
  }

  const agRow = event.target.closest('.agr[data-ag]');

  if (agRow) {
    const session = state.sessions.get(agRow.closest('.card, .ot')?.dataset.id || state.current);
    const row = session?.agentRows?.find(agent => agent.id === agRow.dataset.ag);

    return row ? agMenu(session, row, agRow) : null;
  }

  const card = event.target.closest('#slist > .card');
  const chip = event.target.closest('.tmx [data-url], .prrow[data-url]');
  const sq = event.target.closest('.sq.pick[data-name]');

  if (chip) {
    const session = state.sessions.get(card?.dataset.id || state.current);
    const url = chip.dataset.url;

    if (!session || !url) return null;
    return [
      { t: 'Open the PR', fn: () => openExternal(url, { s: session }) },
      {
        t: 'Copy its link',
        fn: () => copyText(url).then(ok => note(chip, ok ? 'Link copied' : 'Could not copy it', !ok)),
      },
      {
        t: 'Its timeline',
        sub: 'its events and the turns about it · ⌥⌘J',
        fn: () => {
          if (state.current !== session.id) openSession(session.id);
          tvOpenOn(session, url);
        },
      },
      { t: 'Take it off this chat', warn: true, fn: () => unlinkUrl(session, url) },
    ];
  }

  const hm = event.target.closest('#shead .hmove');

  if (hm) {
    const session = state.sessions.get(state.current);

    return (
      session && [{ t: 'Let this round go — the next move tells you', fn: () => letGo(session, $('#shead .hmove')) }]
    );
  }

  if (sq) {
    return projCfg(sq.dataset.name).color
      ? [
          { t: 'Pick a colour…', fn: () => sq.click() },
          { t: 'Let go of the colour', fn: () => clearColor(sq.dataset.name) },
        ]
      : [{ t: 'Pick a colour…', fn: () => sq.click() }];
  }

  // a node in Space (2026-11-24): the card's rows, what its state wants first — its question, its resume —, its tick
  // Space's own (the chat open beside it stays), its star; an agent's mark its agent's menu
  const spa = event.target.closest('#spgrid .spa[data-ag]');

  if (spa) {
    const session = state.sessions.get(spa.dataset.sid);
    const row = session && spRows(session).find(agent => agent.id === spa.dataset.ag);

    return row ? agMenu(session, row, spa) : null;
  }

  const spt = event.target.closest('#spgrid .spt[data-id]');

  if (spt) {
    const session = state.sessions.get(spt.dataset.id);

    return session ? spMenu(session, spt) : null;
  }

  if (!card) return null;
  const cardSession = state.sessions.get(card.dataset.id);

  if (!cardSession) return null;
  return chatRows(cardSession, card);
}

/** A chat's rows, the card's menu and a node's: `space` ticks it as Space does, the chat beside it left open. */
function chatRows(session, card, space = false) {
  const tick = (done, forGood = false) =>
    space && !forGood
      ? spTick(session.id, card.querySelector('.spdone') || card)
      : tickDone(session.id, done, card, null, forGood);

  return [
    { t: 'Open', fn: () => openSession(session.id) },
    ...((session.prs || []).length
      ? [
          {
            t: 'Open its timeline',
            sub: 'the chat and its PRs in one order · ⌥⌘J',
            fn: () => {
              if (state.current !== session.id) openSession(session.id);
              tvOpenOn(session, movedPrs(session)[0]?.url);
            },
          },
        ]
      : []),
    {
      t: 'Rename…',
      fn: async () => {
        await openSession(session.id);
        if (state.current === session.id) editTitle(state.sessions.get(session.id) || session);
      },
    }, // the box in its own header, never another's (2026-10-14)
    ...(session.cwd
      ? [
          scopedOn(session)
            ? { t: 'Every project', sub: 'show all · ⌥⌘P ⌥⌘P, or a double-click', fn: () => selectProject(ALL) }
            : {
                t: `Only ${session.project}`,
                sub: 'narrow the list to it · a double-click on the card',
                fn: () => selectProject(projDir(session.cwd)),
              },
        ]
      : []),
    ...talkRows(session), // chats that talk (2026-10-31): what goes from this chat to another, and the chats tied to it
    ...prioRows(session, card), // Top priority, in or out, and its place (2026-11-24, round XXX's A1, R4)
    asleep(session)
      ? {
          t: 'Wake it now',
          sub: `snoozed ${snoozeSay(session.snooze)}`,
          fn: () => snoozeIt(session, { undo: true }, card),
        } // …and a snooze (S1)
      : asking(session)
        ? { t: 'Snooze…', sub: 'it is asking you — a question wakes a snooze', off: true }
        : {
            t: 'Snooze…',
            sub: 'till a time, or till something happens · ⌥⌘S',
            fn: () => snoozeMenu(session, ...$('#ctxm')._at),
          },
    ...(session.done
      ? [{ t: 'Back on the board (↩)', fn: () => tick(false) }]
      : canTick(session)
        ? [
            {
              t: 'Done',
              ...(watchEnds(session) ? { sub: `ends its watch — ${watchEnds(session)}` } : {}),
              fn: () => tick(true),
            },
            ...(session.prs?.length && !session.forGood
              ? [{ t: 'Done for good — its PRs forgotten', fn: () => tick(true, true) }]
              : []),
          ]
        : []),
    {
      t: 'Delete from the board',
      sub: `${removeEnds(session) ? `ends ${removeEnds(session)}, asks once more` : 'its claude ends'}; the transcript stays · ⌥-click ✓`,
      warn: true,
      fn: () => removeChat(session.id, card),
    },
    ...(movedPrs(session).length
      ? [{ t: 'Let this round of your move go', fn: () => letGo(session, card.querySelector('.state.prmove')) }]
      : []),
    session.muted
      ? { t: 'Unmute', fn: () => setMuted(session.id, false) }
      : { t: 'Mute', sub: 'no banner, sound or count, questions too', fn: () => setMuted(session.id, true) },
    ...((session.prs || []).length
      ? [
          { hr: true },
          ...(session.prs || []).slice(0, 6).map(pr => ({
            t: `Take ${pr.label.replace(/^.*?#/, '#')} off this chat`,
            fn: () => unlinkUrl(session, pr.url),
          })),
        ]
      : []),
    { hr: true },
    {
      t: 'Copy its link',
      fn: () =>
        copyText(`${location.origin}/#${session.id}`).then(ok =>
          note(card, ok ? 'Link copied' : 'Could not copy it', !ok),
        ),
    },
  ];
}

function spMenu(session, node) {
  const pill = node.querySelector('.spask[data-tid]');

  const first = [
    ...(pill
      ? [
          {
            t: 'Answer its question…',
            sub: 'its answers, read off its drawer · ⏎',
            fn: () => spAskOpen(session.id, pill.dataset.tid),
          },
        ]
      : asking(session)
        ? [{ t: 'Answer its question…', sub: `it asks in ${entryLabel(session)}`, off: true }]
        : []),
    ...(resumable(session)
      ? [
          {
            t: 'Resume here',
            sub: 'its claude in a drawer · ⌥⌘C',
            fn: async () => {
              await openSession(session.id);
              const latest = state.sessions.get(session.id);

              if (latest) termAction(latest);
            },
          },
        ]
      : []),
  ];

  const rows = chatRows(session, node, true);

  return [
    ...first,
    ...(first.length ? [{ hr: true }] : []),
    ...rows.slice(0, 1),
    session.fav
      ? { t: 'Unstar', sub: 'F', fn: () => setFav(session.id, false) }
      : { t: 'Star', sub: 'first, a row of its own · F', fn: () => setFav(session.id, true) },
    ...rows.slice(1),
  ];
}

document.addEventListener('contextmenu', event => {
  if (event.target.closest('input, textarea, .tbody, #log .text, #log pre')) return; // a box, a terminal, the words: the system's menu
  const rows = ctxRows(event);

  if (!rows) return;
  event.preventDefault();
  ctxShow(rows, event.clientX, event.clientY, 'ctx', !!event.target.closest('#sbar')); // the bar's menu ends at the pointer, above it
});

// The menu's rows at a point — or ending at it, `above` (a control at the window's foot) — and from what (`m._from`):
// a row with `on` is a choice, ticked when on; `mark` and `n` a mark before it and a count after.
// `sub` a second line — where a PR's branch is, why a row is `off` (disabled) — 2026-10-13
const ctxRow = (row, index) =>
  row.hr
    ? '<hr>'
    : `<button type="button" data-i="${index}"${row.warn || row.sub ? ` class="${row.warn ? 'warn' : ''}${row.warn && row.sub ? ' ' : ''}${row.sub ? 'two' : ''}"` : ''}${row.off ? ' disabled' : ''}${'on' in row ? ` role="${row.check ? 'menuitemcheckbox' : 'menuitemradio'}" aria-checked="${!!row.on}"` : ''}${row.tip ? ` title="${esc(row.tip)}"` : ''}>${row.mark ? `<i class="cmk ${row.mark}"></i>` : ''}${row.sub ? `<span class="ct">${row.key ? `<kbd class="ck">${row.key}</kbd>` : ''}${esc(row.t)}</span>` : `${row.key ? `<kbd class="ck">${row.key}</kbd>` : ''}${esc(row.t)}`}${row.n != null ? `<span class="cn">${esc(String(row.n))}</span>` : ''}${row.sub ? `<span class="csub">${esc(row.sub)}</span>` : ''}</button>`;

function ctxShow(rows, left, top, from, above = false) {
  const menu = $('#ctxm');

  menu.innerHTML = rows.map(ctxRow).join('');

  menu.classList.toggle(
    'checks',
    rows.some(row => 'on' in row),
  );

  menu.classList.toggle(
    'wide',
    rows.some(row => row.sub),
  );

  menu._rows = rows;
  menu._from = from;
  menu._at = [left, top, above];
  if (!menu.open) menu.show();

  const width = menu.offsetWidth;
  const height = menu.offsetHeight;

  menu.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(above ? top - height : top, innerHeight - height - 8))}px`;
  (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button'))?.focus({ preventScroll: true });
  repostPane();
}

$('#ctxm').addEventListener('click', event => {
  const button = event.target.closest('button[data-i]');

  if (!button) return;
  const row = $('#ctxm')._rows[+button.dataset.i];

  $('#ctxm').close();
  row?.fn?.();
});

$('#ctxm').addEventListener('keydown', event => {
  // a row's digit picks it (2026-11-24, round XXX's S2: the snooze menu's times and things to wait for)
  const digit = /^Digit([1-9])$/.exec(event.code);
  const menu = $('#ctxm');

  const pick =
    digit && !event.metaKey && !event.altKey && !event.ctrlKey
      ? (menu._rows || []).findIndex(row => row.key === +digit[1] && !row.off)
      : -1;

  if (pick >= 0) {
    event.preventDefault();
    menu.close();
    menu._rows[pick].fn?.();
    return;
  }

  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();

  const bs = [...$('#ctxm').querySelectorAll('button')];
  const index = bs.indexOf(document.activeElement);

  bs[(index + (event.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus();
});

document.addEventListener(
  'pointerdown',
  event => {
    const menu = $('#ctxm');

    if (menu.open && !event.composedPath().includes(menu)) {
      menu.close();
      menu._shut = performance.now();
    }
  },
  true,
);

// The list's filter (2026-10-12): the funnel's menu — every chat, or only the ones with a new reply, or the pinned —
// counted in the project in view (fCounts, from drawFilter), as the list would show it: the query and the
// face narrowing it too (2026-10-14; the project's alone before, a count the list did not show). A press on the funnel
// that closed its own menu leaves it closed.
let fCounts = {};

function setFilter(key) {
  const was = prioFocus();

  prefs.listFilter = FILTERS[key] ? key : null;
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

function drawFilter(project, narrow = () => true) {
  const filter = listFilter();
  const button = $('#fBtn');
  const fl = button.querySelector('.fl');

  fCounts = Object.fromEntries(
    filterList().map(([key, rule]) => [
      key,
      project.sessions.filter(session => rule.test(session) && narrow(session)).length,
    ]),
  );

  const label = filter ? `${filter.name} · ${fCounts[prefs.listFilter]}` : '';

  if (fl.textContent !== label) fl.textContent = label;
  button.classList.toggle('on', !!filter);
  button.setAttribute('aria-pressed', String(!!filter));

  button.title = filter
    ? `Only the ${filter.tip} — click for every chat, or the other filter`
    : `Show only some chats — those with a new reply${prioOn() ? ', or the pinned' : ''}`;
}

$('#fBtn').addEventListener('click', () => {
  const menu = $('#ctxm');
  const button = $('#fBtn');

  if (menu._from === 'filter' && performance.now() - (menu._shut || 0) < 400) return;

  const rect = button.getBoundingClientRect();
  const up = rect.top > innerHeight / 2;

  ctxShow(
    [
      { t: 'Every chat', on: !prefs.listFilter, fn: () => setFilter(null) },
      { hr: true },
      ...filterList().map(([key, filter]) => ({
        t: filter.name,
        tip: `Only the ${filter.tip}`,
        mark: key,
        n: fCounts[key] || 0,
        on: prefs.listFilter === key,
        fn: () => setFilter(prefs.listFilter === key ? null : key),
      })),
    ],
    rect.left,
    up ? rect.top - 6 : rect.bottom + 6,
    'filter',
    up,
  );
});

$('#ctxm').addEventListener('close', () => repostPane()); // an arrow: repostPane is a const further down

function unlinkPr(session, el) {
  const url = el.dataset.url;

  if (!url || el.dataset.going) return;
  el.dataset.going = '1';
  noteMotion(session.id, 'unlink');

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
      api('POST', `/api/sessions/${session.id}/unlink`, { url }).catch(err => {
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
function letGo(session, el = null) {
  if (!session || el?.dataset.going) return;
  if (el) el.dataset.going = '1';
  noteMotion(session.id, 'letgo');

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
      api('POST', `/api/sessions/${session.id}/waive`).catch(err => {
        fade?.cancel();
        if (el) delete el.dataset.going;
        note(seen(el), `Could not let it go: ${err.message}`, true);
      }),
    fade ? UNLINK_MS : 0,
  );
}

$('#shead').addEventListener(
  'click',
  event => {
    // ⌥ on the header's "your move": this round let go — a click, its PR's timeline (2026-10-17)
    const mv = event.target.closest('.hmove');

    if (!mv) return;
    event.preventDefault();
    event.stopPropagation();
    const session = state.sessions.get(state.current);

    if (event.altKey) letGo(session, mv);
    else tvOpenOn(session, movedPrs(session)[0]?.url);
  },
  true,
);

// A row's link copied (2026-10-21): its mark next to its name — the link not followed — and said on the mark itself, a
// ✓ for COPIED_MS; a redraw of the rows takes it with it
$('#prlist').addEventListener(
  'click',
  async event => {
    const button = event.target.closest('.prrow .prcopy');

    if (!button) return;
    event.preventDefault();
    event.stopPropagation();

    const row = button.closest('.prrow');
    const url = row.dataset.url || row.getAttribute('href') || '';

    if (!/^https?:\/\//.test(url)) return;
    const ok = await copyText(url);

    if (!ok) return note(button, 'Could not copy it', true);
    button.classList.add('did');
    button.title = 'Link copied';
    clearTimeout(button._did);

    button._did = setTimeout(() => {
      button.classList.remove('did');
      button.title = 'Copy its link';
    }, COPIED_MS);
  },
  true,
);

$('#prlist').addEventListener(
  'click',
  event => {
    // before #chat's link handler, which would open the PR
    const row = event.altKey && event.target.closest('.prrow[data-url]');

    if (!row) return;
    event.preventDefault();
    event.stopPropagation();
    const session = state.sessions.get(state.current);

    if (session) unlinkPr(session, row);
  },
  true,
);

$('#shead').addEventListener('click', event => {
  // the branch moved under it (2026-10-13): you know — gone at the click, the server's word following
  if (!event.target.closest('#driftBtn')) return;
  const session = state.sessions.get(state.current);

  if (!session?.drift) return;
  session.drift = null;
  renderHead(session);
  renderBoard();

  api('POST', `/api/sessions/${session.id}/drift`).catch(err =>
    note($('#shead'), `Could not set the branch's move aside: ${err.message}`, true),
  );
});

// The PR list's ends (2026-10-21), as the chat list's (drawEdges): what is out of sight past each — a row is when its
// middle is — counted on a pill, the accent's dot when one of them is at your move; a click scrolls a window's worth.
// Read once a frame, after a draw, a scroll or a resize.
function prEdgesSoon() {
  if (!prEdgesSoon.raf) {
    prEdgesSoon.raf = requestAnimationFrame(() => {
      prEdgesSoon.raf = 0;
      prEdges();
    });
  }
}

function prEdges() {
  const sc = $('#prScroll');

  if (!sc || $('#prlist').hidden) return;

  const top = sc.scrollTop;
  const bottom = top + sc.clientHeight;

  const out = [
    { n: 0, you: 0 },
    { n: 0, you: 0 },
  ];

  for (const row of sc.querySelectorAll(':scope > :is(.prline, .prrow.tk)')) {
    const mid = row.offsetTop + row.offsetHeight / 2;
    const edge = mid < top ? out[0] : mid > bottom ? out[1] : null;

    if (!edge) continue;
    edge.n++;
    if (row.querySelector('.prrow[data-turn="you"]')) edge.you++;
  }

  out.forEach((edge, index) => {
    const el = sc.parentElement.querySelector(index ? '.pedge.down' : '.pedge.up');
    const button = el.firstElementChild;
    const key = `${edge.n}/${edge.you}`;

    el.classList.toggle('on', edge.n > 0);
    if (button.dataset.key === key) return;
    button.dataset.key = key;
    if (!edge.n) return;
    button.innerHTML = `${index ? '↓' : '↑'} <b>${edge.n}</b> more${edge.you ? '<i class="you"></i>' : ''}`;
    button.title = `${edge.n} more ${index ? 'below' : 'above'}${edge.you ? ` — ${edge.you} at your move` : ''} · click to scroll ${index ? 'down' : 'up'}`;
  });
}

$('#prlist').addEventListener(
  'scroll',
  event => {
    if (event.target.id === 'prScroll') prEdgesSoon();
  },
  { capture: true, passive: true },
); // a scroll does not bubble

// The list's height (2026-10-21): its foot dragged up or down sizes the rows' window — the board's, kept in
// prefs.prsHeight —, two rows' worth at least and most of the window at most; a double-click gives it its own again.
// The arrow in the foot is still a click.
$('#prlist').addEventListener('pointerdown', event => {
  const foot = event.target.closest('.pfoot');

  if (!foot || event.target.closest('button') || event.button !== 0) return;
  const sc = $('#prScroll');

  if (!sc) return;
  event.preventDefault();
  foot.setPointerCapture(event.pointerId);

  const y0 = event.clientY;
  const h0 = sc.getBoundingClientRect().height;
  const max = Math.max(80, innerHeight * 0.75);

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
    for (const [type, listener] of [
      ['pointermove', move],
      ['pointerup', up],
      ['lostpointercapture', up],
    ]) {
      foot.removeEventListener(type, listener);
    }

    foot.classList.remove('drag');
    document.body.classList.remove('prsizing');
    if (prefs.prsHeight !== was) savePrefs();
  };

  foot.addEventListener('pointermove', move);
  foot.addEventListener('pointerup', up);
  foot.addEventListener('lostpointercapture', up);
});

$('#prlist').addEventListener('dblclick', event => {
  if (!event.target.closest('.pfoot') || event.target.closest('button')) return;
  prefs.prsHeight = null;
  savePrefs();
  $('#prlist').style.setProperty('--prs-h', '');
  prEdgesSoon();
});

new ResizeObserver(() => prEdgesSoon()).observe($('#prlist'));

$('#prlist').addEventListener('click', event => {
  const button = event.target.closest('.pedge button');

  if (!button) return;
  const sc = $('#prScroll');

  sc.scrollBy({
    top: +button.dataset.dir * Math.max(40, sc.clientHeight - 40),
    behavior: REDUCED.matches ? 'auto' : 'smooth',
  });
});

$('#prlist').addEventListener('click', event => {
  // a PR row's own controls (2026-10-13)
  const button = event.target.closest('.pract');

  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const session = state.sessions.get(state.current);

  if (!session) return;
  if (button.dataset.pract === 'letgo' || button.dataset.pract === 'undo') {
    roundGo(session, button.dataset.url, button.dataset.pract === 'undo', button);
  } else if (button.dataset.pract === 'ask') askClaude(session, button.dataset.url, button);
  else if (button.dataset.pract === 'diff') openPrDiff(session, button.dataset.url);
  else if (button.dataset.pract === 'timeline') tvOpenOn(session, button.dataset.url);
  else if (button.dataset.pract === 'editor') editorMenu(session, button.dataset.url, button);
  else if (button.dataset.pract === 'chat') prChatMenu(session, button.dataset.url, button);
});

/** One PR's round let go, or taken back (2026-10-15): the server's word redraws the row. */
function roundGo(session, url, undo, at) {
  if (at.disabled) return;
  at.disabled = true;

  api('POST', `/api/sessions/${session.id}/waive`, undo ? { url, undo: true } : { url }).catch(err => {
    at.disabled = false;
    note(at, `Could not ${undo ? 'take it back' : 'let it go'}: ${err.message}`, true);
  });
}

/** What came round on a PR, typed into the chat's Claude unsent — the drawer's, else copied. */
async function askClaude(session, url, at) {
  const pr = session.prs?.find(candidate => candidate.url === url);

  if (!pr?.turn) return;

  const text = `${pr.turn.why} on ${pr.url} — read it and address it`;
  const tm = claudeTm(session);

  if (!tm) {
    const ok = await copyText(text);

    return note(
      at,
      `No claude of this chat in a drawer here${ok ? ' — the prompt is copied' : ''} · ⌥⌘C starts one`,
      true,
    );
  }

  showChat(session);
  const no = await drawerType(session, text, false);

  if (no) return note(at, `Not typed: ${no}`, true);
  focusTerm();
  note(at, 'Typed into Claude — ⏎ sends it');
}

/** A new chat on a PR's branch (2026-10-13): in the tree that has it out, else in a worktree made for it — the chat's
 *  folder is then its branch, and its changes, its editor and its zsh are the branch's by construction. */
const prChatting = new Set(); // the PRs a chat is being started on (2026-11-04): a second press meanwhile is the same press

async function chatOnPr(session, url, at, agent) {
  // `agent` (2026-11-06): its Chat ▾'s, prChatMenu
  if (prChatting.has(url)) return;
  prChatting.add(url);
  note(at, 'Finding its tree…');

  try {
    let tree;

    try {
      tree = await api('POST', '/api/worktrees', { cwd: session.cwd, pr: url });
    } catch (error) {
      return note(at, error.message, true);
    }

    document.querySelectorAll('.note').forEach(node => node.remove());
    wtData.delete(session.cwd);
    $('#pick').open && $('#pick').close();
    await newChat(tree.path, null, withAgent(agent));
  } finally {
    prChatting.delete(url);
  }
}

/** A PR row's Chat ▾ (2026-11-06, round XXVIII's E1): a chat on its branch, plain or as an agent — the one you last took
 *  for a PR first, then the folder's and yours, or any of them (the agent picker). */
async function prChatMenu(session, url, at) {
  const listing = session.cwd ? await agentsOf(session.cwd) : null;
  const pr = (session.prs || []).find(candidate => candidate.url === url);

  const go = name => {
    prefs.prAgent = name;
    savePrefs();
    chatOnPr(session, url, at, name);
  };

  const rows = [
    {
      t: 'A chat on its branch',
      sub: 'in the folder that has it out, else a worktree of its own',
      fn: () => chatOnPr(session, url, at),
    },
  ];

  if (listing && !listing.launchers) {
    const last = listing.agents.find(agent => agent.name === prefs.prAgent);

    const offer = [
      ...new Set(
        [last, ...listing.agents.filter(agent => agent.source === 'folder' || agent.source === 'user')].filter(Boolean),
      ),
    ].slice(0, 4);

    rows.push(
      { hr: true },
      ...offer.map(agent => ({
        t: `…as @${agentShort(agent.name)}`,
        sub: [
          agentFrom(agent, session.cwd),
          agentModel(agent),
          agent === last ? 'the agent you last took for a PR' : '',
        ]
          .filter(Boolean)
          .join(' · '),
        fn: () => go(agent.name),
      })),
      {
        t: '…as another agent…',
        sub: 'the folder’s, yours, the plugins’, Claude Code’s',
        fn: () =>
          pickOpen('agent', {
            cwd: session.cwd,
            ag: listing,
            title: `A chat on ${pr?.label || 'its branch'}`,
            then: go,
          }),
      },
    );
  }

  const rc = at.getBoundingClientRect();

  ctxShow(rows, rc.right - 360, rc.bottom + 4, 'prchat');
}
