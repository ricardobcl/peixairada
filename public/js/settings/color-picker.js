  // ---- the colour picker ------------------------------------------------------------------
  // One real <input type=color> for the page (#colorInput): the squares are re-rendered on every update, so the
  // control is moved under the square that was clicked and opened from there — the panel stays wired to it
  // through any render. `input` previews the colour on the board as the panel moves and writes it once the
  // panel rests (350 ms); `change` writes at once. It is written into the setup under the project's name
  // (2026-10-15; into the folder's .vscode/settings.json as Peacock's before); a failure pops up by the square (`note`).
  const colorInput = $('#colorInput');
  let colorTimer = null, previewRaf = 0;
  const written = new Map();   // name → the last colour written, so a rest and the panel closing do not write twice
  const colorWas = new Map();  // name → its colour before the picker moved it: what a refused write goes back to (2026-10-03: the refused colour stayed on the board)
  function note(anchor, text, err) {
    document.querySelectorAll('.note').forEach(n => n.remove());
    const r = anchor?.getBoundingClientRect?.(); if (!r) return;
    // Inside a modal dialog it goes into the dialog, the top layer: under it the backdrop would cover it.
    const n = document.createElement('div'); n.className = 'note' + (err ? ' err' : ''); n.textContent = text; (anchor.closest?.('dialog[open]') || document.body).appendChild(n);
    n.style.left = Math.max(8, Math.min(innerWidth - n.offsetWidth - 8, r.left)) + 'px';
    n.style.top = (r.bottom + 6 + n.offsetHeight > innerHeight ? r.top - n.offsetHeight - 6 : r.bottom + 6) + 'px';
    setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 140); }, err ? 8000 : 4000);   // fades before it goes
  }
  // The note belongs by the square that was clicked — the chat header's since 2026-09-22, the chat list's header
  // before that — and every render makes a new element, so what is remembered is where it was, not which it was.
  let colorAt = '#shead';
  const sqFor = name => document.querySelector(`${colorAt} .sq.pick[data-name="${CSS.escape(name)}"]`) || document.querySelector(`.sq.pick[data-name="${CSS.escape(name)}"]`);
  function openColorPicker(sq) {
    colorAt = '#shead';
    const r = sq.getBoundingClientRect(), name = sq.dataset.name;
    colorInput.style.left = r.left + 'px'; colorInput.style.top = r.bottom + 'px';
    colorInput.dataset.name = name; colorInput.value = projCfg(name).color || '#b9b9b3';
    written.set(name, colorInput.value); colorWas.set(name, projCfg(name).color ?? null);
    try { colorInput.showPicker(); } catch { colorInput.click(); }
  }
  const setColor = async (name, hex) => {
    clearTimeout(colorTimer);
    if (written.get(name) === hex) return;
    written.set(name, hex);
    if (!await setProject(name, { color: hex || '' }, sqFor(name))) { written.delete(name); if (colorWas.has(name)) previewColor(name, colorWas.get(name)); }
  };
  function previewColor(name, hex) {
    const { color, ...rest } = projCfg(name);
    state.config.projects = { ...cfgProjects(), [name]: hex ? { ...rest, color: hex } : rest };
    if (previewRaf) return;
    previewRaf = requestAnimationFrame(() => { previewRaf = 0; renderBoard(); const s = state.sessions.get(state.current); if (s) renderHead(s); });
  }
  colorInput.addEventListener('input', () => {
    const { name } = colorInput.dataset, hex = colorInput.value;
    previewColor(name, hex); clearTimeout(colorTimer); colorTimer = setTimeout(() => setColor(name, hex), 350);
  });
  colorInput.addEventListener('change', () => setColor(colorInput.dataset.name, colorInput.value));
  document.addEventListener('click', e => {   // capture: before the row's own click selects the project
    const sq = e.target.closest('.sq.pick'); if (!sq) return;
    e.stopPropagation(); e.preventDefault();
    if (e.altKey) clearColor(sq.dataset.name); else openColorPicker(sq);   // always asked: what was written last may have been set again elsewhere
  }, true);
  // A fanned stack of PRs wider than its row scrolls (2026-10-04): a sideways swipe by itself, and a wheel turned over
  // it too — down is deeper into the stack, leftwards — rather than the list under it, which would carry the card from
  // under the pointer and close the fan. Its own listeners, added as the pointer comes (a card's node is new whenever
  // its markup changes): a wheel listener on the list could not be passive, and every scroll of it would wait on the
  // page. The pointer gone, the fan is back at its start as it closes.
  const fanWheel = e => {
    const t = e.currentTarget;
    if (t.scrollWidth <= t.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    e.preventDefault();
    t.scrollLeft -= e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? t.clientWidth : 1);
  };
  const fanLeave = e => e.currentTarget.scrollTo({ left: 0, behavior: REDUCED.matches ? 'auto' : 'smooth' });
  $('#slist').addEventListener('pointerover', e => {
    const t = e.target.closest('.card .tprs'); if (!t || t._fan) return;
    t._fan = true; t.addEventListener('wheel', fanWheel, { passive: false }); t.addEventListener('pointerleave', fanLeave);
  });
  // …and a PR matrix past its row's room (2026-11-01) the same way, over its squares or its number: down is further
  // along, rightwards. It stays where it was taken (fadeOver brings the ringed square into sight on a new draw only).
  const mxWheel = e => {
    const t = e.currentTarget.querySelector('.mxg');
    if (!t || t.scrollWidth <= t.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    e.preventDefault();
    t.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? t.clientWidth : 1);
  };
  for (const box of [$('#slist'), $('#shead')]) {
    box.addEventListener('pointerover', e => {
      const t = e.target.closest('.tmx'); if (!t || t._wheel) return;
      t._wheel = true; t.addEventListener('wheel', mxWheel, { passive: false });
    });
    box.addEventListener('scroll', e => { if (e.target.classList?.contains('mxg')) { mxEdges(e.target); mxtHide(); } }, { capture: true, passive: true });
  }
  // a lane's head, clicked or ⏎/space on it (2026-10-11, later): its lane folds or opens — in one motion since
  // 2026-11-01, the head staying put and the list under it sliding over the lane's cards or off them (foldRun, openRun)
  function foldLane(g, byKey = false) {
    if (listFilter()) return;   // a filter shows every match: its heads do not fold
    const shut = new Set(prefs.lanesShut || []); if (shut.has(g)) shut.delete(g); else shut.add(g);
    prefs.lanesShut = [...shut]; savePrefs(); noteMotion(g, shut.has(g) ? 'fold' : 'unfold');
    drawCards.lane = { g, shut: shut.has(g) };
    renderBoard(); if (byKey) document.querySelector(`#slist > .gsep.lane[data-lane="${g}"]`)?.focus({ preventScroll: true });   // the same node, but a render may draw it anew
  }
  $('#slist').addEventListener('keydown', e => { const l = !e.target.closest?.('.clr') && e.target.closest?.('.gsep.lane[data-lane]'); if (l && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); foldLane(l.dataset.lane, true); } });
  const moreLane = g => { laneMore.add(g); noteMotion(g, 'more'); renderBoard(); };   // a long lane's rest (LANE_CAP)
  $('#slist').addEventListener('keydown', e => { const m = e.target.closest?.('.gsep.more[data-more]'); if (m && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); moreLane(m.dataset.more); } });
  $('#slist').addEventListener('keydown', e => { if (e.target.closest?.('.gsep.others') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showAll(); } });
  // Show all takes away the button the keys were on: they go to the list (2026-11-04). A press with the mouse leaves them where they are, in a terminal most likely.
  function showAll() {
    const had = document.activeElement?.closest?.('#stitle, .gsep.others'); selectProject(ALL);
    if (had) { const l = $('#slist'); l.tabIndex = -1; l.focus({ preventScroll: true }); l.addEventListener('blur', () => l.removeAttribute('tabindex'), { once: true }); }
  }
  for (const box of [$('#stitle'), $('#slist')]) box.addEventListener('mousedown', e => { if (e.target.closest('#stitle button, .gsep.others')) e.preventDefault(); });
  $('#sessions').addEventListener('click', e => {
    if (e.target.closest('#stitle .sx')) { if (prioFocus()) setFilter(null); else showAll(); return; }   // in focus, every chat again first (2026-11-24)
    if (e.target.closest('#stitle .ask')) { const s = askingElsewhere(projectStub(prefs.project)).sort(byWait)[0]; if (s) openSession(s.id, { locate: true }); return; }
    if (e.target.closest('#stitle .t')) { if (!prioFocus()) pickOpen('project'); return; }
    if (e.target.closest('#slist > .gsep.others')) { showAll(); return; }
    if (e.target.closest('#slist > .gsep.lane.prio .clr')) { clearDone(); return; }   // the ticked pinned chats unpinned (2026-11-24, round XXX's D2)
    const lane = e.target.closest('#slist > .gsep.lane[data-lane]'); if (lane) return foldLane(lane.dataset.lane);
    const more = e.target.closest('#slist > .gsep.more[data-more]'); if (more) return moreLane(more.dataset.more);
    const card = e.target.closest('.card'); if (!card) return;
    const pin = e.target.closest('.peerin[data-sid]');
    if (pin && state.sessions.has(pin.dataset.sid)) { e.stopPropagation(); openSession(pin.dataset.sid, { locate: true }); return; }   // the chat that sent it (2026-10-31)
    // a card's agents (2026-11-02): the chip folds them, +N and the done row open
    const agc = e.target.closest('.chip.agents');
    if (agc) { e.stopPropagation(); agSwitch(card.dataset.id, 'fold'); renderBoard(); return; }
    const agx = e.target.closest('.agr[data-k="_more"], .agr[data-k="_done"], .agr[data-k="_sum"]');
    if (agx) { e.stopPropagation(); agSwitch(card.dataset.id, agx.dataset.k === '_more' ? 'more' : 'done'); fillAgents(); return; }
    const agr = e.target.closest('.agr[data-ag]');
    if (agr) { const cs = state.sessions.get(card.dataset.id), r = cs?.agentRows?.find(x => x.id === agr.dataset.ag); if (r) { e.stopPropagation(); agOpen(cs, r); return; } }
    const cpr = e.target.closest('.tmx [data-url]');   // the matrix's square or number (2026-11-01)
    if (cpr) { e.stopPropagation(); openSession(card.dataset.id); showPr(cpr.dataset.url); return; }   // that chat, with that PR open
    const ctk = e.target.closest('.ctk');
    if (ctk) { e.stopPropagation(); openSession(card.dataset.id); openExternal(ctk.dataset.url, { s: state.sessions.get(card.dataset.id) }); return; }   // …or that ticket
    if (e.target.closest('.chip.cmute')) { e.stopPropagation(); setMuted(card.dataset.id, false); return; }
    const ax = e.target.closest('.ax'), as = ax && state.sessions.get(card.dataset.id);   // the marks under the pointer (2026-11-24, round XXX's A5, S5)
    if (ax && as) { e.stopPropagation(); if (ax.classList.contains('pin')) prioPut(as, !inPrio(as), null, card); else if (asleep(as)) snoozeIt(as, { undo: true }, card); else { const r = ax.getBoundingClientRect(); snoozeMenu(as, r.left, r.bottom + 4); } return; }
    const act = e.target.closest('.act');
    if (act) { e.stopPropagation(); if (e.altKey || act.dataset.act === 'del') removeChat(card.dataset.id, card, act); else tickDone(card.dataset.id, act.dataset.act === 'done', card, act); return; }
    const mv = e.altKey && e.target.closest('.prmove');
    if (mv) { e.stopPropagation(); letGo(state.sessions.get(card.dataset.id), mv); return; }   // ⌥ on "your move": this round let go
    // the move line, or a PR's mark beside it: the chat, its timeline on that PR, at the move (2026-10-17)
    const pm = e.target.closest('.prmove, .prpips .pp[data-url]'), cs = pm && state.sessions.get(card.dataset.id);
    if (pm && cs) { e.stopPropagation(); openSession(cs.id); tvOpenOn(cs, pm.dataset.url || movedPrs(cs)[0]?.url); return; }
    openSession(card.dataset.id);   // the title appears in the header where it is, nothing flies there (2026-11-01)
  });

