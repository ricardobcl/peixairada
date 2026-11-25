  // ---- a card dragged onto another: Fold into… by hand (2026-11-02, round XIV's I5) ----------------------------------
  // A press on a card, off its controls, moved CD_PX: the chat comes up in the hand, a small ghost by the pointer saying
  // what letting go would do, and the list stands still under it (renderBoard.held: a chat landing would slide another
  // card under the pointer; what came meanwhile is drawn on the way out). Chats it cannot go into fade, the one under the
  // pointer lights, a shut lane's head held on opens, and the list scrolls at its ends. Let go on a chat that can take it,
  // nothing is folded yet: the ghost goes into the card and foldOpen's box asks, the handoff in it, Fold or Cancel. Esc,
  // letting go anywhere else or the window losing the keys puts it back. A chat that cannot be folded does not come up: a
  // note says why. The menu's Fold into… stays the way there without a pointer.
  const CD_PX = 6, CD_EDGE = 44, CD_SPEED = 18, CD_SPRING_MS = 600, CD_IN_MS = 170, CD_BACK_MS = 180;
  const CD_CONTROLS = 'button, a, input, .act, .ctk, .tmx, .tprs, .chip.agents, .agr, .prmove, .prpips, .peerin';
  const CD_HINT = 'Drop it on another chat to fold it in · esc puts it back';
  const CD_HINT_PRIO = 'Drop it on another chat to fold it in, or among the pinned to pin it there · esc puts it back';
  const cd = { press: null, on: false, from: null, over: null, x: 0, y: 0, ghost: null, was: null, raf: 0, lane: null, springT: 0, noFold: null, place: null };
  // Top priority's places (2026-11-24, round XXX's A3, R1): with the section on, a card held over the section goes between
  // two of its cards — a card's top or bottom third, a line saying where — or folds into one, its middle third, as it does
  // anywhere; over the section's head first, over its empty line in. The ghost says which. A chat that cannot be folded
  // comes up for this alone. `cd.place`: where in the section's cards as shown (`k`, the hand's own left out), or null.
  function cdPrioAt(el) {
    if (!prioOn() || !el || (listFilter() && !prioFocus()) || $('#q').value.trim()) return null;
    const list = $('#slist'), cards = [...list.querySelectorAll(':scope > .card.inprio')].filter(c => c.dataset.id !== cd.from);
    if (el.closest('#slist > .gsep.lane.prio')) return { k: 0, cards, head: true };
    if (el.closest('#slist > .gsep.pempty')) return { k: 0, cards, empty: el.closest('.gsep.pempty') };
    const card = el.closest('#slist > .card.inprio');
    if (card && card.dataset.id !== cd.from) {
      const r = card.getBoundingClientRect(), f = (cd.y - r.top) / r.height, i = cards.indexOf(card), other = state.sessions.get(card.dataset.id);
      const folds = !cd.noFold && !sendWhy(other);
      if (folds && f > 1 / 3 && f < 2 / 3) return null;   // its middle: Fold into…, as anywhere
      return { k: f < .5 ? i : i + 1, cards };
    }
    if (!cards.length || (el !== list && !el.closest('#slist > .card.cdfrom, #slist > .leaving'))) return null;
    const top = cards[0].getBoundingClientRect().top, bottom = cards.at(-1).getBoundingClientRect().bottom;
    if (cd.y < top - 6 || cd.y > bottom + 6) return null;
    return { k: cards.filter(c => { const r = c.getBoundingClientRect(); return r.top + r.height / 2 < cd.y; }).length, cards };
  }
  /** The line between the two cards a place falls between — or the empty line lit — and the ghost's words. */
  function cdPrioShow(pl) {
    let gap = $('#cdgap'); document.querySelector('#slist > .gsep.pempty.cdin')?.classList.remove('cdin');
    if (!pl || pl.empty) { gap?.remove(); if (pl?.empty) pl.empty.classList.add('cdin'); return; }
    if (!gap) { gap = document.createElement('div'); gap.id = 'cdgap'; gap.setAttribute('aria-hidden', 'true'); document.body.append(gap); }
    const lr = $('#slist').getBoundingClientRect(), a = pl.cards[pl.k - 1]?.getBoundingClientRect(), b = pl.cards[pl.k]?.getBoundingClientRect();
    const y = a && b ? (a.bottom + b.top) / 2 : a ? a.bottom + 3 : b ? b.top - 3 : lr.top + 4;
    gap.style.translate = `${Math.round(lr.left + 10)}px ${Math.round(y - 1)}px`; gap.style.width = `${Math.round(lr.width - 20)}px`;
  }
  function cdPrioSay(pl) {
    const ids = pl.cards.map(c => c.dataset.id), was = secList().map(s => s.id).indexOf(cd.from);
    return was < 0 ? `Pin it, ${ordinal(pl.k + 1)}` : was === pl.k ? 'Stays where it is' : `To ${ordinal(pl.k + 1)} of ${ids.length + 1} pinned`;
  }
  function cdPlace(measure) {
    const g = cd.ghost; if (measure) { g._w = g.offsetWidth; g._h = g.offsetHeight; }
    const x = Math.max(8, Math.min(innerWidth - g._w - 8, cd.x + 14)), y = cd.y + 16 + g._h > innerHeight - 8 ? cd.y - g._h - 10 : cd.y + 16;
    g.style.translate = `${x}px ${y}px`;
  }
  /** What is under the pointer, as the list stands: the card lit, the ghost's words. */
  function cdHit() {
    const el = document.elementFromPoint(cd.x, cd.y), pl = cd.place = cdPrioAt(el);
    cdPrioShow(pl);
    const id = pl ? null : el?.closest('#slist > .card')?.dataset.id, head = pl ? null : el?.closest('#slist > .gsep.lane.shut:not(.still)');
    cdSpring(head);
    const other = id && id !== cd.from ? state.sessions.get(id) : null, why = other ? cd.noFold || sendWhy(other) : null, over = other && !why ? id : null;
    if (over !== cd.over) {
      cardNodes.get(cd.over)?.el.classList.remove('cdover'); cardNodes.get(over)?.el.classList.add('cdover');
      cd.over = over; if (over) haptic();
    }
    const say = pl ? cdPrioSay(pl) : over ? `Fold into “${other.title}”` : why ? `Not here — ${why}` : head ? `Hold to open ${LANES[head.dataset.lane][0]}` : prioOn() ? CD_HINT_PRIO : CD_HINT, g = cd.ghost;
    if (g._say === say) return;
    g._say = say; g.classList.toggle('go', !!over || !!pl); document.body.classList.toggle('cdno', !!why && !pl);
    g.querySelector('.cdsay').textContent = say; cdPlace(true);
  }
  /** The marks on the cards — from renderBoard too while it holds: a chat may have come to take it, or stopped. */
  function cdMark() {
    for (const [id, c] of cardNodes) { const cl = c.el.classList; cl.toggle('cdfrom', id === cd.from); cl.toggle('cdoff', id !== cd.from && !cl.contains('inprio') && (!!cd.noFold || !!sendWhy(state.sessions.get(id)))); cl.toggle('cdover', id === cd.over); }
    cdHit();
  }
  /** A shut lane's head held on opens — its chats are chats to drop on. */
  function cdSpring(head) {
    const g = head?.dataset.lane || null; if (g === cd.lane) return;
    document.querySelector('#slist > .gsep.cdhold')?.classList.remove('cdhold'); clearTimeout(cd.springT); cd.lane = g;
    if (!head) return;
    head.classList.add('cdhold');
    cd.springT = setTimeout(() => {
      if (!cd.on) return;
      renderBoard.held = false; foldLane(g); renderBoard.held = true; renderBoard.owed = false;   // a draw of its own: what was held comes with it
      cd.lane = null; cdMark();
    }, CD_SPRING_MS);
  }
  /** The list's ends scroll it while the pointer is at one, faster the further in; a frame at a time, stopping at its end. */
  function cdScroll() {
    cd.raf = 0; if (!cd.on) return;
    const list = $('#slist'), r = list.getBoundingClientRect();
    const v = cd.x < r.left || cd.x > r.right ? 0 : cd.y < r.top + CD_EDGE ? cd.y - r.top - CD_EDGE : cd.y > r.bottom - CD_EDGE ? cd.y - r.bottom + CD_EDGE : 0;
    if (!v) return;
    const was = list.scrollTop; list.scrollTop = was + Math.sign(v) * Math.min(CD_SPEED, Math.ceil(Math.abs(v) * .3));
    if (list.scrollTop === was) return;
    cdHit(); cd.raf = requestAnimationFrame(cdScroll);
  }
  function cdLift(p, e) {
    const a = state.sessions.get(p.id), no = foldFromWhy(a);
    if (no && !prioOn()) return note(p.card, `Not folded: ${no}`);   // with the pinned on, it comes up to be placed (2026-11-24)
    Object.assign(cd, { on: true, from: p.id, over: null, x: e.clientX, y: e.clientY, lane: null, noFold: no, place: null });
    // none pinned (2026-11-25): the section comes up empty, a place to drop it, while the card is held
    if (prioOn() && !$('#q').value.trim() && !listFilter() && !document.querySelector('#slist > .gsep.lane.prio')) { renderSessionList.zone = true; renderBoard(); }
    renderBoard.held = true; renderBoard.owed = false;
    getSelection()?.removeAllRanges();
    try { $('#slist').setPointerCapture(p.pid); } catch {}   // its release is heard off the window too, and no card under it lights or fans
    document.body.classList.add('carddrag');
    const g = cd.ghost = document.body.appendChild(html2el(`<div id="cdghost" aria-hidden="true">${hoChat(a)}<div class="cdsay"></div></div>`));
    cdMark(); noteMotion(p.id, 'cardlift'); haptic('generic');
    if (!REDUCED.matches) g.animate([{ opacity: 0, scale: .92 }, { opacity: 1, scale: 1 }], { duration: 160, easing: SPRING, id: 'cardlift' });
  }
  /** Let go: `drop` on what is under the pointer — the box, if that can take it — else back where it came from. */
  function cdEnd(drop) {
    if (!cd.on) return;
    const pl = drop ? cd.place : null; cdPrioShow(null); cd.place = null;
    if (pl) return cdPlaceEnd(pl);
    const { from, over, ghost: g, was } = cd, a = state.sessions.get(from), b = drop && over ? state.sessions.get(over) : null;
    const no = b ? foldFromWhy(a) || sendWhy(b) : null, into = b && !no;   // it may have changed while the list stood still
    const el = cardNodes.get(into ? over : from)?.el, r = el?.getBoundingClientRect(), lr = $('#slist').getBoundingClientRect(), gr = g.getBoundingClientRect();
    cd.on = false; cancelAnimationFrame(cd.raf); cd.raf = 0; cdSpring(null);
    for (const c of cardNodes.values()) c.el.classList.remove('cdfrom', 'cdoff', 'cdover');
    document.body.classList.remove('carddrag', 'cdno');
    if (renderSessionList.zone) { renderSessionList.zone = false; renderBoard.owed = true; }   // the empty section goes with the hand
    renderBoard.held = false; if (renderBoard.owed) { renderBoard.owed = false; renderBoard(); }
    noteMotion(from, into ? 'cardfold' : 'cardback'); if (into) haptic('levelChange');
    if (was?.isConnected) was.focus({ preventScroll: true });   // the press took the keys from a drawer; the box gives them back to it on its way out
    let over2 = false;
    const then = () => { if (over2) return; over2 = true; g.remove(); if (into) foldOpen(a, b); else if (no) note(el || $('#shead'), `Not folded: ${no}`, true); };
    if (REDUCED.matches) return then();
    const seen = r && r.bottom > lr.top && r.top < lr.bottom, to = !seen ? g.style.translate : into ? `${r.left + r.width / 2 - gr.width * .15}px ${r.top + r.height / 2 - gr.height * .15}px` : `${r.left}px ${r.top}px`;
    const ms = into ? CD_IN_MS : CD_BACK_MS, fly = g.animate([{ translate: g.style.translate, scale: 1, opacity: 1 }, { translate: to, scale: into ? .3 : .96, opacity: 0 }], { duration: ms, easing: into ? 'ease-in' : EASE_OUT, fill: 'forwards', id: into ? 'cardfold' : 'cardback' });
    fly.onfinish = fly.oncancel = then; setTimeout(then, ms + 150);   // a window out of sight may never finish it
  }
  /** Let go on a place among the pinned: the chat goes there, between the two cards the line was between. */
  function cdPlaceEnd(pl) {
    const { from, ghost: g, was } = cd, s = state.sessions.get(from), vis = pl.cards.map(c => c.dataset.id);
    cd.on = false; cancelAnimationFrame(cd.raf); cd.raf = 0; cdSpring(null);
    for (const c of cardNodes.values()) c.el.classList.remove('cdfrom', 'cdoff', 'cdover');
    document.body.classList.remove('carddrag', 'cdno');
    renderBoard.held = false; renderBoard.owed = false; renderSessionList.zone = false;
    noteMotion(from, 'cardplace'); haptic('levelChange');
    if (was?.isConnected) was.focus({ preventScroll: true });
    const ids = state.priority.filter(id => id !== from), at = vis[pl.k] ? ids.indexOf(vis[pl.k]) : vis.length ? ids.indexOf(vis.at(-1)) + 1 : ids.length;
    ids.splice(at < 0 ? ids.length : at, 0, from);
    const shown = [...vis]; shown.splice(pl.k, 0, from);
    if (s) setPriority(ids, `${s.title}, pinned, ${pl.k + 1} of ${shown.length}`); else renderBoard();
    if (REDUCED.matches) return g.remove();
    const fade = g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CD_BACK_MS, easing: EASE_OUT, fill: 'forwards', id: 'cardplace' });
    fade.onfinish = fade.oncancel = () => g.remove(); setTimeout(() => g.remove(), CD_BACK_MS + 150);
  }
  $('#slist').addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.pointerType === 'touch') return;
    const card = e.target.closest('#slist > .card'); if (!card || e.target.closest(CD_CONTROLS)) return;
    cd.press = { id: card.dataset.id, card, x: e.clientX, y: e.clientY, pid: e.pointerId, moved: false }; cd.was = document.activeElement;
  });
  // a press that may become a drag selects nothing, and no picture in a card goes off on the system's own drag
  for (const ev of ['selectstart', 'dragstart']) $('#slist').addEventListener(ev, e => { if (cd.press) e.preventDefault(); });
  addEventListener('pointermove', e => {
    const p = cd.press; if (!p) return;
    if (!e.buttons) { cd.press = null; return cdEnd(false); }   // its release went unheard
    if (!p.moved) { if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < CD_PX) return; p.moved = true; cdLift(p, e); }
    if (!cd.on) return;
    cd.x = e.clientX; cd.y = e.clientY; cdHit(); cdPlace();
    cd.raf ||= requestAnimationFrame(cdScroll);
  }, { passive: true });
  addEventListener('pointerup', () => {
    const p = cd.press; if (!p) return; cd.press = null;
    if (!p.moved) return;
    // the click this release makes, if it makes one — once, as a tab's drag does: a swallow left for the timeout alone ate the next real click
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
    addEventListener('click', swallow, { capture: true, once: true }); setTimeout(() => removeEventListener('click', swallow, true), 0);
    cdEnd(true);
  });
  for (const ev of ['pointercancel', 'blur']) addEventListener(ev, () => { cd.press = null; cdEnd(false); });
