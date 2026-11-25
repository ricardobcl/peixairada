  // ---- header controls ---------------------------------------------------------------
  // The settings popover is the plan usage and the keys, nothing else (2026-09-21) — the notifications switch joined
  // them on 2026-09-23, and the usage left for the chat list's footer on 2026-09-24. Long code is always folded
  // (2026-09-28): no switch, and no { } for a chat. The magnifier opens its box; Esc or an emptied box on blur closes
  // it; the icon stays lit while a filter is on. Since 2026-09-25 it matches the way ⌥⌘K does and ⌥⌘F opens it from
  // anywhere (hotFind): the best match leads (renderSessionList), so there is a card to choose — ↑↓ walk them from the
  // box, ⏎ opens the one marked and hands the keyboard to its chat. The mark is shown only while the box has the
  // keyboard: a click elsewhere is a choice too.
  const qsel = { i: 0, id: null };
  // The mark stays on its chat, not on its place (2026-10-03): an update that reordered the matches moved it to another
  // card, and ⏎ opened that one.
  function markQsel(step = 0) {
    const inp = $('#q'), cards = [...document.querySelectorAll('#slist > .card')];
    const on = document.activeElement === inp && !!inp.value.trim();
    const at = qsel.id ? cards.findIndex(c => c.dataset.id === qsel.id) : -1;
    qsel.i = Math.max(0, Math.min((at >= 0 ? at : qsel.i) + step, cards.length - 1));
    if (step) qsel.id = cards[qsel.i]?.dataset.id || null;
    cards.forEach((c, i) => c.classList.toggle('qsel', on && i === qsel.i));
    return on ? cards[qsel.i] || null : null;
  }
  const qShow = on => { const inp = $('#q'); if (on) showList(true); inp.hidden = !on; $('#filters').classList.toggle('searching', on); if (on) { inp.focus(); inp.select(); } };
  // the box and the filter, on #filters itself (the status bar's)
  {
    const btn = $('#qBtn'), inp = $('#q');
    btn.onclick = () => qShow(inp.hidden);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); inp.value = ''; btn.classList.remove('on'); qShow(false); renderBoard(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); markQsel(e.key === 'ArrowDown' ? 1 : -1)?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { const c = markQsel(); if (!c) return; e.preventDefault(); inp.blur(); openSession(c.dataset.id).then(focusTerm); }
    });
    inp.addEventListener('focus', markQsel);
    inp.addEventListener('blur', () => { if (!inp.value.trim()) qShow(false); markQsel(); });
    inp.addEventListener('input', () => { btn.classList.toggle('on', !!inp.value.trim()); qsel.i = 0; qsel.id = null; renderBoard(); });
  }
