// ---- ⌥⌘A: the overview, every live agent at once (2026-10-10) ------------------------------------------------------
// Hyprland's overview and a kanban's columns: Asking you · Clauding · Watching · Ready, unread — every project, each
// chat a tile with what it is doing now, its branch, the size of its uncommitted change, its PR and CI. A digit opens
// the tile it is on (1–9, in reading order), the arrows and ⏎ too, Esc closes. A question the transcript has words
// for shows its answers; with the chat in a drawer here a click on one opens it and types that answer's digit.
const ov = { sel: 0, list: [], minis: new Map(), timer: 0, raf: 0, downOn: null };

function ovColumns() {
  const live = [...state.sessions.values()]
    .filter(session => visible(session) && !session.done && !asleep(session))
    .sort(byWord);

  const used = new Set();

  const take = test =>
    live.filter(session => !used.has(session.id) && test(session)).map(session => (used.add(session.id), session));

  return [
    ['ask', 'Asking you', take(session => asking(session))],
    ['work', 'Clauding', take(session => rankOf(session) === 'working')], // by the list's rank (2026-10-31): a turn its own monitor woke stays Watching
    ['watch', 'Watching', take(session => rankOf(session) === 'watching' || (session.alive && watching(session)))],
    ['ready', 'New replies', take(session => replied(session) || (state.unread.get(session.id) || 0) > 0)],
  ];
}

function ovTile(session, number, sel) {
  const term = drawerOf(session);
  const st = diffStats.get(session.id);
  const pr = (session.prs || []).find(chatPr => chatPr.state === 'open' || chatPr.state === 'draft');

  const age = asking(session)
    ? `<span class="wait">waiting on you <span data-at="${esc(session.statusSince || '')}"></span></span>`
    : `<span data-at="${esc(wordAt(session))}"></span>${state.unread.get(session.id) || 0 ? `<b class="un">${state.unread.get(session.id)}</b>` : ''}`;

  const ask =
    asking(session) && session.ask
      ? `<div class="q">${esc(session.ask.text || `waiting for ${session.ask.waitingFor || 'you'}`)}</div>${session.ask.labels?.length ? `<div class="ans">${session.ask.labels.map((label, index) => `<button data-ans="${index + 1}"${term ? '' : ' disabled'} title="${term ? `Opens the chat and types ${index + 1} into its drawer` : 'Not in a drawer here — answer it where it runs'}"><b>${index + 1}</b>${esc(label)}</button>`).join('')}</div>` : ''}`
      : '';

  const tasks = (session.tasks || [])
    .map(
      task =>
        `<div class="tl watch"><i></i><b>${task.kind === 'monitor' ? 'Monitor' : 'Bash'}</b><span>${esc(task.what)}</span><em>${esc(task.last || `${task.events} events`)}</em></div>`,
    )
    .join('');

  const agents =
    agOn(session) && session.agentRows?.length
      ? `<div class="agl">${agItems(agPlan(session, false), session, true).map(agRowHtml).join('')}</div>`
      : ''; // a line each (2026-11-02)

  if (agents) phaseAnims();
  return `<article class="ot ${asking(session) ? 'ask' : bucket(session) === 'working' ? 'work' : ''}${sel ? ' sel' : ''}" data-id="${esc(session.id)}" style="${repoStyle(repoColor(session.cwd))}">
      <header>${number <= 9 ? `<kbd>${number}</kbd>` : ''}<b>${projIcon(session.project)}${esc(session.project)}</b><span class="age">${age}</span></header>
      <h3>${ticks(esc(session.title))}</h3>
      <div class="obody${term ? ' live' : ''}" data-term="${term ? esc(term.id) : ''}">${term ? '' : tailHtml(tails.get(session.id), 7, session.cwd)}</div>
      ${tasks}${agents}${ask}
      <footer>${pr ? `<span class="opr" data-state="${esc(pr.state)}">${esc(pr.label.replace(/^.*?#/, '#'))}${ckHtml(pr)}</span>` : ''}${session.gitBranch && session.gitBranch !== 'HEAD' ? `<span class="br">${esc(session.gitBranch)}</span>` : ''}${st && (st.add || st.del) ? `<span class="a">+${st.add}</span><span class="d">−${st.del}</span>` : ''}<span class="r">${term ? 'in a drawer here' : session.alive ? entryLabel(session) : 'ended'}</span></footer>
    </article>`;
}

function renderOverview() {
  ov.raf = 0;
  const dlg = $('#ov');

  if (!dlg.open) return;
  const cols = ovColumns();

  ov.list = cols.flatMap(column => column[2]);
  ov.sel = Math.max(0, Math.min(ov.sel, ov.list.length - 1));
  let number = 0;
  const count = kind => cols.find(column => column[0] === kind)[2].length;

  setHtml(
    $('#ovchips'),
    [
      ['ask', 'asking you'],
      ['work', 'clauding'],
      ['watch', 'watching'],
      ['ready', 'new replies'],
    ]
      .map(([kind, label]) => `<span class="${kind}${count(kind) ? '' : ' nil'}"><i></i>${count(kind)} ${label}</span>`)
      .join(''),
  );

  // an empty column is its head alone, narrow, and the full ones share the width (2026-10-12): four equal columns
  // put the board's two live chats in a quarter of the screen beside three saying "none"
  const host = $('#ovcols');
  const tpl = document.createElement('template');

  host.style.gridTemplateColumns = cols
    .map(([, , list]) => (list.length ? 'minmax(0, 1fr)' : 'minmax(0, max-content)'))
    .join(' ');

  // a column's head and each tile drawn only when its markup changed, a tile kept by its chat (2026-10-14): the whole
  // overview drawn again on every event and every tails' ask took the tile under a press away before its click
  if (host.children.length !== cols.length) host.replaceChildren(...cols.map(() => document.createElement('section')));

  cols.forEach(([kind, name, list], index) => {
    const sec = host.children[index];
    const cls = `oc ${kind}${list.length ? '' : ' nil'}`;

    if (sec.className !== cls) sec.className = cls;
    const head = sec.querySelector(':scope > h2') || sec.appendChild(document.createElement('h2'));

    setHtml(head, `<i></i><span>${name}</span><b>${list.length}</b>`);
    const had = new Map([...sec.querySelectorAll(':scope > .ot')].map(tile => [tile.dataset.id, tile]));
    let prev = head;

    for (const session of list) {
      const html = ovTile(session, ++number, number - 1 === ov.sel);
      let tile = had.get(session.id);

      had.delete(session.id);

      if (tile?._drawn !== html) {
        tpl.innerHTML = html;
        const nt = tpl.content.firstElementChild;

        nt._drawn = html;
        if (tile) tile.replaceWith(nt);
        tile = nt;
      }

      if (prev.nextElementSibling !== tile) prev.after(tile);
      prev = tile;
    }

    for (const tile of had.values()) tile.remove();
  });

  fillAges(host);

  for (const host of $('#ovcols').querySelectorAll('.obody.live')) {
    const session = state.sessions.get(host.closest('.ot').dataset.id);
    const term = session && drawerOf(session);

    if (term) mountMini(ov.minis, host, term, !asking(session));
  }

  sweepMinis(ov.minis);
  for (const session of ov.list) wantDiffStat(session);
}

const ovSoon = () => {
  if ($('#ov').open && !ov.raf) ov.raf = requestAnimationFrame(renderOverview);
};

// The overview zooms (2026-10-11, Mission Control's): opened, each tile grows out of its chat's card in the list — a
// FLIP from the card's rectangle, a few ms apart — and a tile whose card is out of sight rises in place; a tile opened
// grows into the chat column as the overview goes (ovGo: a ghost of it in the top layer, over the closing dialog).
function ovZoomIn() {
  if (REDUCED.matches) return;
  let index = 0;

  for (const tile of $('#ovcols').querySelectorAll('.ot')) {
    const card = document.querySelector(`#slist > .card[data-id="${CSS.escape(tile.dataset.id)}"]`);
    const tileRect = tile.getBoundingClientRect();

    const cardRect = card?.getClientRects().length ? card.getBoundingClientRect() : null;
    const seen = cardRect && cardRect.bottom > 0 && cardRect.top < innerHeight && tileRect.width && tileRect.height;

    tile.animate(
      [
        {
          transform: seen
            ? `translate(${cardRect.left - tileRect.left}px, ${cardRect.top - tileRect.top}px) scale(${cardRect.width / tileRect.width}, ${cardRect.height / tileRect.height})`
            : 'translateY(8px) scale(.96)',
          opacity: seen ? 0.45 : 0,
        },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 300, easing: EASE_OUT, delay: Math.min(index++, 8) * 18, fill: 'backwards', id: 'ovzoom' },
    );
  }

  noteMotion(null, 'ovzoom', index);
}

function ovGo(session, tile, how = () => openSession(session.id, { locate: true })) {
  const tileRect = tile?.getBoundingClientRect();
  const chatRect = $('#chat').getBoundingClientRect();

  $('#ov').close();
  how();
  if (!tileRect || REDUCED.matches || !chatRect.width) return;
  const ghost = document.createElement('div');

  ghost.className = 'ovghost';
  ghost.popover = 'manual';
  ghost.style.cssText = `left: ${tileRect.left}px; top: ${tileRect.top}px; width: ${tileRect.width}px; height: ${tileRect.height}px; --repo: ${repoColor(session.cwd) || 'var(--nocolor)'}`;
  document.body.append(ghost);

  try {
    ghost.showPopover();
  } catch {}

  noteMotion(session.id, 'ovgrow');

  ghost
    .animate(
      [
        { transform: 'none', opacity: 1 },
        { opacity: 0.85, offset: 0.7 },
        {
          transform: `translate(${chatRect.left - tileRect.left}px, ${chatRect.top - tileRect.top}px) scale(${chatRect.width / tileRect.width}, ${chatRect.height / tileRect.height})`,
          opacity: 0,
        },
      ],
      { duration: 320, easing: EASE_OUT, fill: 'forwards', id: 'ovgrow' },
    )
    .finished.catch(() => {})
    .then(() => ghost.remove());
}

function ovOpen() {
  const dlg = $('#ov');

  if (dlg.open) return dlg.close();
  if (inApp) post({ type: 'focus' });
  ov.sel = 0;
  dlg.showModal();
  repostPane();
  renderOverview();
  dlg.focus();
  ovZoomIn();

  const tick = () =>
    loadTails(
      ov.list.filter(session => !drawerOf(session)).map(session => session.id),
      ovSoon,
    );

  tick();
  ov.timer = setInterval(tick, 2000);
}

$('#ov').addEventListener('close', () => {
  clearInterval(ov.timer);
  sweepMinis(ov.minis, true);
});

// A click on nothing closes it, as Mission Control's does (2026-10-11, late night): the room round and under the tiles, a column's
// head, the bar's words — anything not a tile or a control. Pressed and let go there both: a press that began on a
// tile (a selection dragged off it) lands its click on the column, and is not one.
const ovNothing = target => !target.closest('.ot, button, a, input');

$('#ov').addEventListener('pointerdown', event => {
  ov.downOn = ovNothing(event.target);
});

$('#ov').addEventListener('click', event => {
  if (event.target.closest('.ovclose') || (ov.downOn !== false && ovNothing(event.target))) return $('#ov').close();

  const ans = event.target.closest('[data-ans]');
  const tile = event.target.closest('.ot');

  if (!tile) return;
  const session = state.sessions.get(tile.dataset.id);

  if (!session) return;
  if (ans) {
    $('#ov').close();
    answerInDrawer(session, ans.dataset.ans);
  } else ovGo(session, tile);
});

$('#ov').addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const index = /^[1-9]$/.test(event.key) ? +event.key - 1 : event.key === 'Enter' ? ov.sel : -1;

  if (index >= 0) {
    event.preventDefault();
    const session = ov.list[index];

    if (session) ovGo(session, $(`#ovcols .ot[data-id="${CSS.escape(session.id)}"]`));
    return;
  }

  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];

  if (step) {
    event.preventDefault();
    ov.sel = Math.max(0, Math.min(ov.list.length - 1, ov.sel + step));
    renderOverview();
    $('#ovcols .ot.sel')?.scrollIntoView({ block: 'nearest' });
  }
});

/** An answer from the overview: the chat opened, and once its drawer is attached, the answer's digit typed into it. */
async function answerInDrawer(session, digit) {
  await openSession(session.id);
  if (!/^\d$/.test(String(digit))) return; // an answer's number, one key

  // the number, then ⏎ once the select shows it ringed (2026-11-24, spEnter) — none for an answer that wants words
  const words = SP_WORDS.test(session.ask?.labels?.[digit - 1] || '');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  for (let attempt = 0; attempt < 60; attempt++) {
    const tm = claudeTm(session);

    if (!tm) {
      await sleep(100);
      continue;
    }

    let ask = null; // its select off the drawer's screen, given a moment to come up after the attach

    for (
      let look = 0;
      look < 15 && !(ask = await new Promise(resolve => tm.xt.write('', () => resolve(spAskOf(spScreen(tm.xt))))));
      look++
    ) {
      await sleep(100);
    }

    focusTerm();
    termSend(tm, String(digit));
    if (ask && !words) setTimeout(() => spEnter(tm.xt, () => termSend(tm, '\r'), ask, +digit), SP_ENTER_MS);
    return;
  }

  note($('#shead'), 'Its drawer did not come up — answer it in the chat', true);
}
