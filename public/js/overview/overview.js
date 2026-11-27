// ---- ⌥⌘A: the overview, every live agent at once (2026-10-10) ------------------------------------------------------
// Hyprland's overview and a kanban's columns: Asking you · Clauding · Watching · Ready, unread — every project, each
// chat a tile with what it is doing now, its branch, the size of its uncommitted change, its PR and CI. A digit opens
// the tile it is on (1–9, in reading order), the arrows and ⏎ too, Esc closes. A question the transcript has words
// for shows its answers; with the chat in a drawer here a click on one opens it and types that answer's digit.
const ov = { sel: 0, list: [], minis: new Map(), timer: 0, raf: 0, downOn: null };

function ovColumns() {
  const live = [...state.sessions.values()].filter(s => visible(s) && !s.done && !asleep(s)).sort(byWord);
  const used = new Set();

  const take = f => live.filter(s => !used.has(s.id) && f(s)).map(s => (used.add(s.id), s));

  return [
    ['ask', 'Asking you', take(s => asking(s))],
    ['work', 'Clauding', take(s => rankOf(s) === 'working')], // by the list's rank (2026-10-31): a turn its own monitor woke stays Watching
    ['watch', 'Watching', take(s => rankOf(s) === 'watching' || (s.alive && watching(s)))],
    ['ready', 'New replies', take(s => replied(s) || (state.unread.get(s.id) || 0) > 0)],
  ];
}

function ovTile(s, n, sel) {
  const d = drawerOf(s);
  const st = diffStats.get(s.id);
  const pr = (s.prs || []).find(p => p.state === 'open' || p.state === 'draft');

  const age = asking(s)
    ? `<span class="wait">waiting on you <span data-at="${esc(s.statusSince || '')}"></span></span>`
    : `<span data-at="${esc(wordAt(s))}"></span>${state.unread.get(s.id) || 0 ? `<b class="un">${state.unread.get(s.id)}</b>` : ''}`;

  const ask =
    asking(s) && s.ask
      ? `<div class="q">${esc(s.ask.text || `waiting for ${s.ask.waitingFor || 'you'}`)}</div>${s.ask.labels?.length ? `<div class="ans">${s.ask.labels.map((l, i) => `<button data-ans="${i + 1}"${d ? '' : ' disabled'} title="${d ? `Opens the chat and types ${i + 1} into its drawer` : 'Not in a drawer here — answer it where it runs'}"><b>${i + 1}</b>${esc(l)}</button>`).join('')}</div>` : ''}`
      : '';

  const tasks = (s.tasks || [])
    .map(
      t =>
        `<div class="tl watch"><i></i><b>${t.kind === 'monitor' ? 'Monitor' : 'Bash'}</b><span>${esc(t.what)}</span><em>${esc(t.last || `${t.events} events`)}</em></div>`,
    )
    .join('');

  const agents =
    agOn(s) && s.agentRows?.length
      ? `<div class="agl">${agItems(agPlan(s, false), s, true).map(agRowHtml).join('')}</div>`
      : ''; // a line each (2026-11-02)

  if (agents) phaseAnims();
  return `<article class="ot ${asking(s) ? 'ask' : bucket(s) === 'working' ? 'work' : ''}${sel ? ' sel' : ''}" data-id="${esc(s.id)}" style="${repoStyle(repoColor(s.cwd))}">
      <header>${n <= 9 ? `<kbd>${n}</kbd>` : ''}<b>${projIcon(s.project)}${esc(s.project)}</b><span class="age">${age}</span></header>
      <h3>${ticks(esc(s.title))}</h3>
      <div class="obody${d ? ' live' : ''}" data-term="${d ? esc(d.id) : ''}">${d ? '' : tailHtml(tails.get(s.id), 7, s.cwd)}</div>
      ${tasks}${agents}${ask}
      <footer>${pr ? `<span class="opr" data-state="${esc(pr.state)}">${esc(pr.label.replace(/^.*?#/, '#'))}${ckHtml(pr)}</span>` : ''}${s.gitBranch && s.gitBranch !== 'HEAD' ? `<span class="br">${esc(s.gitBranch)}</span>` : ''}${st && (st.add || st.del) ? `<span class="a">+${st.add}</span><span class="d">−${st.del}</span>` : ''}<span class="r">${d ? 'in a drawer here' : s.alive ? entryLabel(s) : 'ended'}</span></footer>
    </article>`;
}

function renderOverview() {
  ov.raf = 0;
  const dlg = $('#ov');

  if (!dlg.open) return;
  const cols = ovColumns();

  ov.list = cols.flatMap(c => c[2]);
  ov.sel = Math.max(0, Math.min(ov.sel, ov.list.length - 1));
  let n = 0;
  const count = k => cols.find(c => c[0] === k)[2].length;

  setHtml(
    $('#ovchips'),
    [
      ['ask', 'asking you'],
      ['work', 'clauding'],
      ['watch', 'watching'],
      ['ready', 'new replies'],
    ]
      .map(([k, w]) => `<span class="${k}${count(k) ? '' : ' nil'}"><i></i>${count(k)} ${w}</span>`)
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

  cols.forEach(([k, name, list], i) => {
    const sec = host.children[i];
    const cls = `oc ${k}${list.length ? '' : ' nil'}`;

    if (sec.className !== cls) sec.className = cls;
    const head = sec.querySelector(':scope > h2') || sec.appendChild(document.createElement('h2'));

    setHtml(head, `<i></i><span>${name}</span><b>${list.length}</b>`);
    const had = new Map([...sec.querySelectorAll(':scope > .ot')].map(t => [t.dataset.id, t]));
    let prev = head;

    for (const s of list) {
      const html = ovTile(s, ++n, n - 1 === ov.sel);
      let t = had.get(s.id);

      had.delete(s.id);

      if (t?._drawn !== html) {
        tpl.innerHTML = html;
        const nt = tpl.content.firstElementChild;

        nt._drawn = html;
        if (t) t.replaceWith(nt);
        t = nt;
      }

      if (prev.nextElementSibling !== t) prev.after(t);
      prev = t;
    }

    for (const t of had.values()) t.remove();
  });

  fillAges(host);

  for (const host of $('#ovcols').querySelectorAll('.obody.live')) {
    const s = state.sessions.get(host.closest('.ot').dataset.id);
    const d = s && drawerOf(s);

    if (d) mountMini(ov.minis, host, d, !asking(s));
  }

  sweepMinis(ov.minis);
  for (const s of ov.list) wantDiffStat(s);
}

const ovSoon = () => {
  if ($('#ov').open && !ov.raf) ov.raf = requestAnimationFrame(renderOverview);
};

// The overview zooms (2026-10-11, Mission Control's): opened, each tile grows out of its chat's card in the list — a
// FLIP from the card's rectangle, a few ms apart — and a tile whose card is out of sight rises in place; a tile opened
// grows into the chat column as the overview goes (ovGo: a ghost of it in the top layer, over the closing dialog).
function ovZoomIn() {
  if (REDUCED.matches) return;
  let i = 0;

  for (const t of $('#ovcols').querySelectorAll('.ot')) {
    const c = document.querySelector(`#slist > .card[data-id="${CSS.escape(t.dataset.id)}"]`);
    const b = t.getBoundingClientRect();

    const a = c?.getClientRects().length ? c.getBoundingClientRect() : null;
    const seen = a && a.bottom > 0 && a.top < innerHeight && b.width && b.height;

    t.animate(
      [
        {
          transform: seen
            ? `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`
            : 'translateY(8px) scale(.96)',
          opacity: seen ? 0.45 : 0,
        },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 300, easing: EASE_OUT, delay: Math.min(i++, 8) * 18, fill: 'backwards', id: 'ovzoom' },
    );
  }

  noteMotion(null, 'ovzoom', i);
}

function ovGo(s, tile, how = () => openSession(s.id, { locate: true })) {
  const a = tile?.getBoundingClientRect();
  const b = $('#chat').getBoundingClientRect();

  $('#ov').close();
  how();
  if (!a || REDUCED.matches || !b.width) return;
  const g = document.createElement('div');

  g.className = 'ovghost';
  g.popover = 'manual';
  g.style.cssText = `left: ${a.left}px; top: ${a.top}px; width: ${a.width}px; height: ${a.height}px; --repo: ${repoColor(s.cwd) || 'var(--nocolor)'}`;
  document.body.append(g);

  try {
    g.showPopover();
  } catch {}

  noteMotion(s.id, 'ovgrow');

  g.animate(
    [
      { transform: 'none', opacity: 1 },
      { opacity: 0.85, offset: 0.7 },
      {
        transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width}, ${b.height / a.height})`,
        opacity: 0,
      },
    ],
    { duration: 320, easing: EASE_OUT, fill: 'forwards', id: 'ovgrow' },
  )
    .finished.catch(() => {})
    .then(() => g.remove());
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
      ov.list.filter(s => !drawerOf(s)).map(s => s.id),
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
const ovNothing = t => !t.closest('.ot, button, a, input');

$('#ov').addEventListener('pointerdown', e => {
  ov.downOn = ovNothing(e.target);
});

$('#ov').addEventListener('click', e => {
  if (e.target.closest('.ovclose') || (ov.downOn !== false && ovNothing(e.target))) return $('#ov').close();

  const ans = e.target.closest('[data-ans]');
  const tile = e.target.closest('.ot');

  if (!tile) return;
  const s = state.sessions.get(tile.dataset.id);

  if (!s) return;
  if (ans) {
    $('#ov').close();
    answerInDrawer(s, ans.dataset.ans);
  } else ovGo(s, tile);
});

$('#ov').addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const i = /^[1-9]$/.test(e.key) ? +e.key - 1 : e.key === 'Enter' ? ov.sel : -1;

  if (i >= 0) {
    e.preventDefault();
    const s = ov.list[i];

    if (s) ovGo(s, $(`#ovcols .ot[data-id="${CSS.escape(s.id)}"]`));
    return;
  }

  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];

  if (step) {
    e.preventDefault();
    ov.sel = Math.max(0, Math.min(ov.list.length - 1, ov.sel + step));
    renderOverview();
    $('#ovcols .ot.sel')?.scrollIntoView({ block: 'nearest' });
  }
});

/** An answer from the overview: the chat opened, and once its drawer is attached, the answer's digit typed into it. */
async function answerInDrawer(s, digit) {
  await openSession(s.id);
  if (!/^\d$/.test(String(digit))) return; // an answer's number, one key

  // the number, then ⏎ once the select shows it ringed (2026-11-24, spEnter) — none for an answer that wants words
  const words = SP_WORDS.test(s.ask?.labels?.[digit - 1] || '');
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < 60; i++) {
    const tm = claudeTm(s);

    if (!tm) {
      await sleep(100);
      continue;
    }

    let ask = null; // its select off the drawer's screen, given a moment to come up after the attach

    for (
      let j = 0;
      j < 15 && !(ask = await new Promise(r => tm.xt.write('', () => r(spAskOf(spScreen(tm.xt))))));
      j++
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
