// ---- the colour picker ------------------------------------------------------------------
// One real <input type=color> for the page (#colorInput): the squares are re-rendered on every update, so the
// control is moved under the square that was clicked and opened from there — the panel stays wired to it
// through any render. `input` previews the colour on the board as the panel moves and writes it once the
// panel rests (350 ms); `change` writes at once. It is written into the setup under the project's name
// (2026-10-15; into the folder's .vscode/settings.json as Peacock's before); a failure pops up by the square (`note`).
const colorInput = $('#colorInput');

let colorTimer = null;
let previewRaf = 0;

const written = new Map(); // name → the last colour written, so a rest and the panel closing do not write twice
const colorWas = new Map(); // name → its colour before the picker moved it: what a refused write goes back to (2026-10-03: the refused colour stayed on the board)

function note(anchor, text, err) {
  document.querySelectorAll('.note').forEach(stale => stale.remove());
  const rect = anchor?.getBoundingClientRect?.();

  if (!rect) return;
  // Inside a modal dialog it goes into the dialog, the top layer: under it the backdrop would cover it.
  const popup = document.createElement('div');

  popup.className = `note${err ? ' err' : ''}`;
  popup.textContent = text;
  (anchor.closest?.('dialog[open]') || document.body).appendChild(popup);
  popup.style.left = `${Math.max(8, Math.min(innerWidth - popup.offsetWidth - 8, rect.left))}px`;
  popup.style.top = `${rect.bottom + 6 + popup.offsetHeight > innerHeight ? rect.top - popup.offsetHeight - 6 : rect.bottom + 6}px`;

  setTimeout(
    () => {
      popup.classList.add('out');
      setTimeout(() => popup.remove(), 140);
    },
    err ? 8000 : 4000,
  ); // fades before it goes
}

// The note belongs by the square that was clicked — the chat header's since 2026-09-22, the chat list's header
// before that — and every render makes a new element, so what is remembered is where it was, not which it was.
let colorAt = '#shead';

const sqFor = name =>
  document.querySelector(`${colorAt} .sq.pick[data-name="${CSS.escape(name)}"]`) ||
  document.querySelector(`.sq.pick[data-name="${CSS.escape(name)}"]`);

function openColorPicker(sq) {
  colorAt = '#shead';

  const rect = sq.getBoundingClientRect();
  const name = sq.dataset.name;

  colorInput.style.left = `${rect.left}px`;
  colorInput.style.top = `${rect.bottom}px`;
  colorInput.dataset.name = name;
  colorInput.value = projCfg(name).color || '#b9b9b3';
  written.set(name, colorInput.value);
  colorWas.set(name, projCfg(name).color ?? null);

  try {
    colorInput.showPicker();
  } catch {
    colorInput.click();
  }
}

const setColor = async (name, hex) => {
  clearTimeout(colorTimer);
  if (written.get(name) === hex) return;
  written.set(name, hex);

  if (!(await setProject(name, { color: hex || '' }, sqFor(name)))) {
    written.delete(name);
    if (colorWas.has(name)) previewColor(name, colorWas.get(name));
  }
};

function previewColor(name, hex) {
  const { color, ...rest } = projCfg(name);

  state.config.projects = { ...cfgProjects(), [name]: hex ? { ...rest, color: hex } : rest };
  if (previewRaf) return;

  previewRaf = requestAnimationFrame(() => {
    previewRaf = 0;
    renderBoard();
    const session = state.sessions.get(state.current);

    if (session) renderHead(session);
  });
}

colorInput.addEventListener('input', () => {
  const { name } = colorInput.dataset;
  const hex = colorInput.value;

  previewColor(name, hex);
  clearTimeout(colorTimer);
  colorTimer = setTimeout(() => setColor(name, hex), 350);
});

colorInput.addEventListener('change', () => setColor(colorInput.dataset.name, colorInput.value));

document.addEventListener(
  'click',
  event => {
    // capture: before the row's own click selects the project
    const sq = event.target.closest('.sq.pick');

    if (!sq) return;
    event.stopPropagation();
    event.preventDefault();
    if (event.altKey) clearColor(sq.dataset.name);
    else openColorPicker(sq); // always asked: what was written last may have been set again elsewhere
  },
  true,
);

// A fanned stack of PRs wider than its row scrolls (2026-10-04): a sideways swipe by itself, and a wheel turned over
// it too — down is deeper into the stack, leftwards — rather than the list under it, which would carry the card from
// under the pointer and close the fan. Its own listeners, added as the pointer comes (a card's node is new whenever
// its markup changes): a wheel listener on the list could not be passive, and every scroll of it would wait on the
// page. The pointer gone, the fan is back at its start as it closes.
const fanWheel = event => {
  const fan = event.currentTarget;

  if (fan.scrollWidth <= fan.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  event.preventDefault();
  fan.scrollLeft -= event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? fan.clientWidth : 1);
};

const fanLeave = event => event.currentTarget.scrollTo({ left: 0, behavior: REDUCED.matches ? 'auto' : 'smooth' });

$('#slist').addEventListener('pointerover', event => {
  const fan = event.target.closest('.card .tprs');

  if (!fan || fan._fan) return;
  fan._fan = true;
  fan.addEventListener('wheel', fanWheel, { passive: false });
  fan.addEventListener('pointerleave', fanLeave);
});

// …and a PR matrix past its row's room (2026-11-01) the same way, over its squares or its number: down is further
// along, rightwards. It stays where it was taken (fadeOver brings the ringed square into sight on a new draw only).
const mxWheel = event => {
  const scroller = event.currentTarget.querySelector('.mxg');

  if (!scroller || scroller.scrollWidth <= scroller.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
    return;
  }

  event.preventDefault();
  scroller.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientWidth : 1);
};

for (const box of [$('#slist'), $('#shead')]) {
  box.addEventListener('pointerover', event => {
    const matrix = event.target.closest('.tmx');

    if (!matrix || matrix._wheel) return;
    matrix._wheel = true;
    matrix.addEventListener('wheel', mxWheel, { passive: false });
  });

  box.addEventListener(
    'scroll',
    event => {
      if (event.target.classList?.contains('mxg')) {
        mxEdges(event.target);
        mxtHide();
      }
    },
    { capture: true, passive: true },
  );
}

// a lane's head, clicked or ⏎/space on it (2026-10-11, later): its lane folds or opens — in one motion since
// 2026-11-01, the head staying put and the list under it sliding over the lane's cards or off them (foldRun, openRun)
function foldLane(lane, byKey = false) {
  if (listFilter()) return; // a filter shows every match: its heads do not fold
  const shut = new Set(prefs.lanesShut || []);

  if (shut.has(lane)) shut.delete(lane);
  else shut.add(lane);
  prefs.lanesShut = [...shut];
  savePrefs();
  noteMotion(lane, shut.has(lane) ? 'fold' : 'unfold');
  drawCards.lane = { g: lane, shut: shut.has(lane) };
  renderBoard();
  if (byKey) document.querySelector(`#slist > .gsep.lane[data-lane="${lane}"]`)?.focus({ preventScroll: true }); // the same node, but a render may draw it anew
}

$('#slist').addEventListener('keydown', event => {
  const head = !event.target.closest?.('.clr') && event.target.closest?.('.gsep.lane[data-lane]');

  if (head && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    foldLane(head.dataset.lane, true);
  }
});

const moreLane = lane => {
  laneMore.add(lane);
  noteMotion(lane, 'more');
  renderBoard();
}; // a long lane's rest (LANE_CAP)

$('#slist').addEventListener('keydown', event => {
  const more = event.target.closest?.('.gsep.more[data-more]');

  if (more && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    moreLane(more.dataset.more);
  }
});

$('#slist').addEventListener('keydown', event => {
  if (event.target.closest?.('.gsep.others') && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    showAll();
  }
});

// Show all takes away the button the keys were on: they go to the list (2026-11-04). A press with the mouse leaves them where they are, in a terminal most likely.
function showAll() {
  const had = document.activeElement?.closest?.('#stitle, .gsep.others');

  selectProject(ALL);

  if (had) {
    const list = $('#slist');

    list.tabIndex = -1;
    list.focus({ preventScroll: true });
    list.addEventListener('blur', () => list.removeAttribute('tabindex'), { once: true });
  }
}

for (const box of [$('#stitle'), $('#slist')]) {
  box.addEventListener('mousedown', event => {
    if (event.target.closest('#stitle button, .gsep.others')) event.preventDefault();
  });
}

$('#sessions').addEventListener('click', event => {
  if (event.target.closest('#stitle .sx')) {
    if (prioFocus()) setFilter(null);
    else showAll();
    return;
  } // in focus, every chat again first (2026-11-24)

  if (event.target.closest('#stitle .ask')) {
    const session = askingElsewhere(projectStub(prefs.project)).sort(byWait)[0];

    if (session) openSession(session.id, { locate: true });
    return;
  }

  if (event.target.closest('#stitle .t')) {
    if (!prioFocus()) pickOpen('project');
    return;
  }

  if (event.target.closest('#slist > .gsep.others')) {
    showAll();
    return;
  }

  if (event.target.closest('#slist > .gsep.lane.prio .clr')) {
    clearDone();
    return;
  } // the ticked pinned chats unpinned (2026-11-24, round XXX's D2)

  const lane = event.target.closest('#slist > .gsep.lane[data-lane]');

  if (lane) return foldLane(lane.dataset.lane);
  const more = event.target.closest('#slist > .gsep.more[data-more]');

  if (more) return moreLane(more.dataset.more);
  const card = event.target.closest('.card');

  if (!card) return;
  const pin = event.target.closest('.peerin[data-sid]');

  if (pin && state.sessions.has(pin.dataset.sid)) {
    event.stopPropagation();
    openSession(pin.dataset.sid, { locate: true });
    return;
  } // the chat that sent it (2026-10-31)

  // a card's agents (2026-11-02): the chip folds them, +N and the done row open
  const agc = event.target.closest('.chip.agents');

  if (agc) {
    event.stopPropagation();
    agSwitch(card.dataset.id, 'fold');
    renderBoard();
    return;
  }

  const agx = event.target.closest('.agr[data-k="_more"], .agr[data-k="_done"], .agr[data-k="_sum"]');

  if (agx) {
    event.stopPropagation();
    agSwitch(card.dataset.id, agx.dataset.k === '_more' ? 'more' : 'done');
    fillAgents();
    return;
  }

  const agr = event.target.closest('.agr[data-ag]');

  if (agr) {
    const cs = state.sessions.get(card.dataset.id);
    const agentRow = cs?.agentRows?.find(row => row.id === agr.dataset.ag);

    if (agentRow) {
      event.stopPropagation();
      agOpen(cs, agentRow);
      return;
    }
  }

  const cpr = event.target.closest('.tmx [data-url]'); // the matrix's square or number (2026-11-01)

  if (cpr) {
    event.stopPropagation();
    openSession(card.dataset.id);
    showPr(cpr.dataset.url);
    return;
  } // that chat, with that PR open

  const ctk = event.target.closest('.ctk');

  if (ctk) {
    event.stopPropagation();
    openSession(card.dataset.id);
    openExternal(ctk.dataset.url, { s: state.sessions.get(card.dataset.id) });
    return;
  } // …or that ticket

  if (event.target.closest('.chip.cmute')) {
    event.stopPropagation();
    setMuted(card.dataset.id, false);
    return;
  }

  const ax = event.target.closest('.ax');
  const as = ax && state.sessions.get(card.dataset.id); // the marks under the pointer (2026-11-24, round XXX's A5, S5)

  if (ax && as) {
    event.stopPropagation();

    if (ax.classList.contains('pin')) prioPut(as, !inPrio(as), null, card);
    else if (asleep(as)) snoozeIt(as, { undo: true }, card);
    else {
      const rect = ax.getBoundingClientRect();

      snoozeMenu(as, rect.left, rect.bottom + 4);
    }

    return;
  }

  const act = event.target.closest('.act');

  if (act) {
    event.stopPropagation();
    if (event.altKey || act.dataset.act === 'del') removeChat(card.dataset.id, card, act);
    else tickDone(card.dataset.id, act.dataset.act === 'done', card, act);
    return;
  }

  const mv = event.altKey && event.target.closest('.prmove');

  if (mv) {
    event.stopPropagation();
    letGo(state.sessions.get(card.dataset.id), mv);
    return;
  } // ⌥ on "your move": this round let go

  // the move line, or a PR's mark beside it: the chat, its timeline on that PR, at the move (2026-10-17)
  const pm = event.target.closest('.prmove, .prpips .pp[data-url]');
  const cs = pm && state.sessions.get(card.dataset.id);

  if (pm && cs) {
    event.stopPropagation();
    openSession(cs.id);
    tvOpenOn(cs, pm.dataset.url || movedPrs(cs)[0]?.url);
    return;
  }

  openSession(card.dataset.id); // the title appears in the header where it is, nothing flies there (2026-11-01)
});

// A card double-clicked is the toolbar's tab clicked (2026-11-28): the list narrowed to its project, and again every project.
// Not on a control of its own (the drag's list); its first click has opened the chat, so the open card's tab flies. That
// click redrew the card, so one redrawn between the second press and its release is the card under the pointer.
$('#slist').addEventListener('dblclick', event => {
  const at = event.target.closest('#slist > .card')
    ? event.target
    : document.elementFromPoint(event.clientX, event.clientY) || event.target;

  const card = at.closest('#slist > .card');

  if (!card || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || at.closest(CD_CONTROLS)) return;

  const session = state.sessions.get(card.dataset.id);

  if (session?.cwd) selectProject(scopedOn(session) ? ALL : projDir(session.cwd));
});
