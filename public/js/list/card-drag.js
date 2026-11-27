// ---- a card dragged onto another: Fold into… by hand (2026-11-02, round XIV's I5) ----------------------------------
// A press on a card, off its controls, moved CD_PX: the chat comes up in the hand, a small ghost by the pointer saying
// what letting go would do, and the list stands still under it (renderBoard.held: a chat landing would slide another
// card under the pointer; what came meanwhile is drawn on the way out). Chats it cannot go into fade, the one under the
// pointer lights, a shut lane's head held on opens, and the list scrolls at its ends. Let go on a chat that can take it,
// nothing is folded yet: the ghost goes into the card and foldOpen's box asks, the handoff in it, Fold or Cancel. Esc,
// letting go anywhere else or the window losing the keys puts it back. A chat that cannot be folded does not come up: a
// note says why. The menu's Fold into… stays the way there without a pointer.
const CD_PX = 6;
const CD_EDGE = 44;
const CD_SPEED = 18;
const CD_SPRING_MS = 600;
const CD_IN_MS = 170;
const CD_BACK_MS = 180;

const CD_CONTROLS = 'button, a, input, .act, .ctk, .tmx, .tprs, .chip.agents, .agr, .prmove, .prpips, .peerin';
const CD_HINT = 'Drop it on another chat to fold it in · esc puts it back';
const CD_HINT_PRIO = 'Drop it on another chat to fold it in, or among the pinned to pin it there · esc puts it back';

const cd = {
  press: null,
  on: false,
  from: null,
  over: null,
  x: 0,
  y: 0,
  ghost: null,
  was: null,
  raf: 0,
  lane: null,
  springT: 0,
  noFold: null,
  place: null,
};

// Top priority's places (2026-11-24, round XXX's A3, R1): with the section on, a card held over the section goes between
// two of its cards — a card's top or bottom third, a line saying where — or folds into one, its middle third, as it does
// anywhere; over the section's head first, over its empty line in. The ghost says which. A chat that cannot be folded
// comes up for this alone. `cd.place`: where in the section's cards as shown (`k`, the hand's own left out), or null.
function cdPrioAt(el) {
  if (!prioOn() || !el || (listFilter() && !prioFocus()) || $('#q').value.trim()) return null;

  const list = $('#slist');

  const cards = [...list.querySelectorAll(':scope > .card.inprio')].filter(
    pinnedCard => pinnedCard.dataset.id !== cd.from,
  );

  if (el.closest('#slist > .gsep.lane.prio')) return { k: 0, cards, head: true };
  if (el.closest('#slist > .gsep.pempty')) return { k: 0, cards, empty: el.closest('.gsep.pempty') };
  const card = el.closest('#slist > .card.inprio');

  if (card && card.dataset.id !== cd.from) {
    const rect = card.getBoundingClientRect();
    const fraction = (cd.y - rect.top) / rect.height;
    const index = cards.indexOf(card);
    const other = state.sessions.get(card.dataset.id);

    const folds = !cd.noFold && !sendWhy(other);

    if (folds && fraction > 1 / 3 && fraction < 2 / 3) return null; // its middle: Fold into…, as anywhere
    return { k: fraction < 0.5 ? index : index + 1, cards };
  }

  if (!cards.length || (el !== list && !el.closest('#slist > .card.cdfrom, #slist > .leaving'))) return null;

  const top = cards[0].getBoundingClientRect().top;
  const bottom = cards.at(-1).getBoundingClientRect().bottom;

  if (cd.y < top - 6 || cd.y > bottom + 6) return null;
  return {
    k: cards.filter(pinnedCard => {
      const rect = pinnedCard.getBoundingClientRect();

      return rect.top + rect.height / 2 < cd.y;
    }).length,
    cards,
  };
}

/** The line between the two cards a place falls between — or the empty line lit — and the ghost's words. */
function cdPrioShow(pl) {
  let gap = $('#cdgap');

  document.querySelector('#slist > .gsep.pempty.cdin')?.classList.remove('cdin');

  if (!pl || pl.empty) {
    gap?.remove();
    if (pl?.empty) pl.empty.classList.add('cdin');
    return;
  }

  if (!gap) {
    gap = document.createElement('div');
    gap.id = 'cdgap';
    gap.setAttribute('aria-hidden', 'true');
    document.body.append(gap);
  }

  const lr = $('#slist').getBoundingClientRect();
  const above = pl.cards[pl.k - 1]?.getBoundingClientRect();
  const below = pl.cards[pl.k]?.getBoundingClientRect();

  const top =
    above && below ? (above.bottom + below.top) / 2 : above ? above.bottom + 3 : below ? below.top - 3 : lr.top + 4;

  gap.style.translate = `${Math.round(lr.left + 10)}px ${Math.round(top - 1)}px`;
  gap.style.width = `${Math.round(lr.width - 20)}px`;
}

function cdPrioSay(pl) {
  const ids = pl.cards.map(card => card.dataset.id);

  const was = secList()
    .map(session => session.id)
    .indexOf(cd.from);

  return was < 0
    ? `Pin it, ${ordinal(pl.k + 1)}`
    : was === pl.k
      ? 'Stays where it is'
      : `To ${ordinal(pl.k + 1)} of ${ids.length + 1} pinned`;
}

function cdPlace(measure) {
  const ghost = cd.ghost;

  if (measure) {
    ghost._w = ghost.offsetWidth;
    ghost._h = ghost.offsetHeight;
  }

  const left = Math.max(8, Math.min(innerWidth - ghost._w - 8, cd.x + 14));
  const top = cd.y + 16 + ghost._h > innerHeight - 8 ? cd.y - ghost._h - 10 : cd.y + 16;

  ghost.style.translate = `${left}px ${top}px`;
}

/** What is under the pointer, as the list stands: the card lit, the ghost's words. */
function cdHit() {
  const el = document.elementFromPoint(cd.x, cd.y);
  const pl = (cd.place = cdPrioAt(el));

  cdPrioShow(pl);

  const id = pl ? null : el?.closest('#slist > .card')?.dataset.id;
  const head = pl ? null : el?.closest('#slist > .gsep.lane.shut:not(.still)');

  cdSpring(head);

  const other = id && id !== cd.from ? state.sessions.get(id) : null;
  const why = other ? cd.noFold || sendWhy(other) : null;
  const over = other && !why ? id : null;

  if (over !== cd.over) {
    cardNodes.get(cd.over)?.el.classList.remove('cdover');
    cardNodes.get(over)?.el.classList.add('cdover');
    cd.over = over;
    if (over) haptic();
  }

  const say = pl
    ? cdPrioSay(pl)
    : over
      ? `Fold into “${other.title}”`
      : why
        ? `Not here — ${why}`
        : head
          ? `Hold to open ${LANES[head.dataset.lane][0]}`
          : prioOn()
            ? CD_HINT_PRIO
            : CD_HINT;

  const ghost = cd.ghost;

  if (ghost._say === say) return;
  ghost._say = say;
  ghost.classList.toggle('go', !!over || !!pl);
  document.body.classList.toggle('cdno', !!why && !pl);
  ghost.querySelector('.cdsay').textContent = say;
  cdPlace(true);
}

/** The marks on the cards — from renderBoard too while it holds: a chat may have come to take it, or stopped. */
function cdMark() {
  for (const [id, node] of cardNodes) {
    const cl = node.el.classList;

    cl.toggle('cdfrom', id === cd.from);
    cl.toggle('cdoff', id !== cd.from && !cl.contains('inprio') && (!!cd.noFold || !!sendWhy(state.sessions.get(id))));
    cl.toggle('cdover', id === cd.over);
  }

  cdHit();
}

/** A shut lane's head held on opens — its chats are chats to drop on. */
function cdSpring(head) {
  const lane = head?.dataset.lane || null;

  if (lane === cd.lane) return;
  document.querySelector('#slist > .gsep.cdhold')?.classList.remove('cdhold');
  clearTimeout(cd.springT);
  cd.lane = lane;
  if (!head) return;
  head.classList.add('cdhold');

  cd.springT = setTimeout(() => {
    if (!cd.on) return;
    renderBoard.held = false;
    foldLane(lane);
    renderBoard.held = true;
    renderBoard.owed = false; // a draw of its own: what was held comes with it
    cd.lane = null;
    cdMark();
  }, CD_SPRING_MS);
}

/** The list's ends scroll it while the pointer is at one, faster the further in; a frame at a time, stopping at its end. */
function cdScroll() {
  cd.raf = 0;
  if (!cd.on) return;

  const list = $('#slist');
  const rect = list.getBoundingClientRect();

  const depth =
    cd.x < rect.left || cd.x > rect.right
      ? 0
      : cd.y < rect.top + CD_EDGE
        ? cd.y - rect.top - CD_EDGE
        : cd.y > rect.bottom - CD_EDGE
          ? cd.y - rect.bottom + CD_EDGE
          : 0;

  if (!depth) return;
  const was = list.scrollTop;

  list.scrollTop = was + Math.sign(depth) * Math.min(CD_SPEED, Math.ceil(Math.abs(depth) * 0.3));
  if (list.scrollTop === was) return;
  cdHit();
  cd.raf = requestAnimationFrame(cdScroll);
}

function cdLift(press, event) {
  const session = state.sessions.get(press.id);
  const no = foldFromWhy(session);

  if (no && !prioOn()) return note(press.card, `Not folded: ${no}`); // with the pinned on, it comes up to be placed (2026-11-24)

  Object.assign(cd, {
    on: true,
    from: press.id,
    over: null,
    x: event.clientX,
    y: event.clientY,
    lane: null,
    noFold: no,
    place: null,
  });

  // none pinned (2026-11-25): the section comes up empty, a place to drop it, while the card is held
  if (prioOn() && !$('#q').value.trim() && !listFilter() && !document.querySelector('#slist > .gsep.lane.prio')) {
    renderSessionList.zone = true;
    renderBoard();
  }

  renderBoard.held = true;
  renderBoard.owed = false;
  getSelection()?.removeAllRanges();

  try {
    $('#slist').setPointerCapture(press.pid);
  } catch {} // its release is heard off the window too, and no card under it lights or fans

  document.body.classList.add('carddrag');

  const ghost = (cd.ghost = document.body.appendChild(
    html2el(`<div id="cdghost" aria-hidden="true">${hoChat(session)}<div class="cdsay"></div></div>`),
  ));

  cdMark();
  noteMotion(press.id, 'cardlift');
  haptic('generic');

  if (!REDUCED.matches) {
    ghost.animate(
      [
        { opacity: 0, scale: 0.92 },
        { opacity: 1, scale: 1 },
      ],
      { duration: 160, easing: SPRING, id: 'cardlift' },
    );
  }
}

/** Let go: `drop` on what is under the pointer — the box, if that can take it — else back where it came from. */
function cdEnd(drop) {
  if (!cd.on) return;
  const pl = drop ? cd.place : null;

  cdPrioShow(null);
  cd.place = null;
  if (pl) return cdPlaceEnd(pl);

  const { from, over, ghost: ghost, was } = cd;
  const source = state.sessions.get(from);
  const target = drop && over ? state.sessions.get(over) : null;

  const no = target ? foldFromWhy(source) || sendWhy(target) : null;
  const into = target && !no; // it may have changed while the list stood still

  const el = cardNodes.get(into ? over : from)?.el;
  const rect = el?.getBoundingClientRect();
  const lr = $('#slist').getBoundingClientRect();
  const gr = ghost.getBoundingClientRect();

  cd.on = false;
  cancelAnimationFrame(cd.raf);
  cd.raf = 0;
  cdSpring(null);
  for (const node of cardNodes.values()) node.el.classList.remove('cdfrom', 'cdoff', 'cdover');
  document.body.classList.remove('carddrag', 'cdno');

  if (renderSessionList.zone) {
    renderSessionList.zone = false;
    renderBoard.owed = true;
  } // the empty section goes with the hand

  renderBoard.held = false;

  if (renderBoard.owed) {
    renderBoard.owed = false;
    renderBoard();
  }

  noteMotion(from, into ? 'cardfold' : 'cardback');
  if (into) haptic('levelChange');
  if (was?.isConnected) was.focus({ preventScroll: true }); // the press took the keys from a drawer; the box gives them back to it on its way out
  let over2 = false;

  const then = () => {
    if (over2) return;
    over2 = true;
    ghost.remove();
    if (into) foldOpen(source, target);
    else if (no) note(el || $('#shead'), `Not folded: ${no}`, true);
  };

  if (REDUCED.matches) return then();

  const seen = rect && rect.bottom > lr.top && rect.top < lr.bottom;

  const to = !seen
    ? ghost.style.translate
    : into
      ? `${rect.left + rect.width / 2 - gr.width * 0.15}px ${rect.top + rect.height / 2 - gr.height * 0.15}px`
      : `${rect.left}px ${rect.top}px`;

  const ms = into ? CD_IN_MS : CD_BACK_MS;

  const fly = ghost.animate(
    [
      { translate: ghost.style.translate, scale: 1, opacity: 1 },
      { translate: to, scale: into ? 0.3 : 0.96, opacity: 0 },
    ],
    { duration: ms, easing: into ? 'ease-in' : EASE_OUT, fill: 'forwards', id: into ? 'cardfold' : 'cardback' },
  );

  fly.onfinish = fly.oncancel = then;
  setTimeout(then, ms + 150); // a window out of sight may never finish it
}

/** Let go on a place among the pinned: the chat goes there, between the two cards the line was between. */
function cdPlaceEnd(pl) {
  const { from, ghost: ghost, was } = cd;
  const session = state.sessions.get(from);
  const vis = pl.cards.map(card => card.dataset.id);

  cd.on = false;
  cancelAnimationFrame(cd.raf);
  cd.raf = 0;
  cdSpring(null);
  for (const node of cardNodes.values()) node.el.classList.remove('cdfrom', 'cdoff', 'cdover');
  document.body.classList.remove('carddrag', 'cdno');
  renderBoard.held = false;
  renderBoard.owed = false;
  renderSessionList.zone = false;
  noteMotion(from, 'cardplace');
  haptic('levelChange');
  if (was?.isConnected) was.focus({ preventScroll: true });

  const ids = state.priority.filter(id => id !== from);
  const at = vis[pl.k] ? ids.indexOf(vis[pl.k]) : vis.length ? ids.indexOf(vis.at(-1)) + 1 : ids.length;

  ids.splice(at < 0 ? ids.length : at, 0, from);
  const shown = [...vis];

  shown.splice(pl.k, 0, from);
  if (session) setPriority(ids, `${session.title}, pinned, ${pl.k + 1} of ${shown.length}`);
  else renderBoard();
  if (REDUCED.matches) return ghost.remove();

  const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: CD_BACK_MS,
    easing: EASE_OUT,
    fill: 'forwards',
    id: 'cardplace',
  });

  fade.onfinish = fade.oncancel = () => ghost.remove();
  setTimeout(() => ghost.remove(), CD_BACK_MS + 150);
}

$('#slist').addEventListener('pointerdown', event => {
  if (
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    event.pointerType === 'touch'
  ) {
    return;
  }

  const card = event.target.closest('#slist > .card');

  if (!card || event.target.closest(CD_CONTROLS)) return;
  cd.press = { id: card.dataset.id, card, x: event.clientX, y: event.clientY, pid: event.pointerId, moved: false };
  cd.was = document.activeElement;
});

// a press that may become a drag selects nothing, and no picture in a card goes off on the system's own drag
for (const ev of ['selectstart', 'dragstart']) {
  $('#slist').addEventListener(ev, event => {
    if (cd.press) event.preventDefault();
  });
}

addEventListener(
  'pointermove',
  event => {
    const press = cd.press;

    if (!press) return;

    if (!event.buttons) {
      cd.press = null;
      return cdEnd(false);
    } // its release went unheard

    if (!press.moved) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < CD_PX) return;
      press.moved = true;
      cdLift(press, event);
    }

    if (!cd.on) return;
    cd.x = event.clientX;
    cd.y = event.clientY;
    cdHit();
    cdPlace();
    cd.raf ||= requestAnimationFrame(cdScroll);
  },
  { passive: true },
);

addEventListener('pointerup', () => {
  const press = cd.press;

  if (!press) return;
  cd.press = null;
  if (!press.moved) return;

  // the click this release makes, if it makes one — once, as a tab's drag does: a swallow left for the timeout alone ate the next real click
  const swallow = ev => {
    ev.stopPropagation();
    ev.preventDefault();
  };

  addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => removeEventListener('click', swallow, true), 0);
  cdEnd(true);
});

for (const ev of ['pointercancel', 'blur']) {
  addEventListener(ev, () => {
    cd.press = null;
    cdEnd(false);
  });
}
