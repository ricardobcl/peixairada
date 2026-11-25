// ---- several at once (2026-11-24): ⇧-click or ⇧-arrows choose nodes; a bar for them — done, star, mute —, esc lets go
function spBarDraw(list) {
  const ids = new Set(list.map(s => s.id));
  for (const id of [...sp.chosen]) if (!ids.has(id)) sp.chosen.delete(id);
  const bar = $('#spbar'),
    chosen = [...sp.chosen].map(id => state.sessions.get(id)).filter(Boolean);
  bar.hidden = !chosen.length;
  if (!chosen.length) return setHtml(bar, '');
  const allFav = chosen.every(s => s.fav),
    allMuted = chosen.every(s => s.muted),
    allDone = chosen.every(s => s.done);
  setHtml(
    bar,
    `<span>${chosen.length} chosen</span><button type="button" class="go" data-do="done">${allDone ? '↩ Back' : '✓ Done'}</button><button type="button" data-do="star">${allFav ? 'Unstar' : '★ Star'}</button><button type="button" data-do="mute">${allMuted ? 'Unmute' : 'Mute'}</button><button type="button" data-do="none" aria-label="Let them go">×</button><kbd>esc</kbd>`,
  );
}
$('#spbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-do]');
  if (!b) return;
  const chosen = [...sp.chosen].map(id => state.sessions.get(id)).filter(Boolean),
    what = b.dataset.do;
  if (what === 'done') {
    const back = chosen.every(s => s.done);
    for (const s of chosen) if (back || canTick(s)) tickDone(s.id, !back, b);
  }
  if (what === 'star') {
    const on = !chosen.every(s => s.fav);
    for (const s of chosen) if (!!s.fav !== on) setFav(s.id, on);
  }
  if (what === 'mute') {
    const on = !chosen.every(s => s.muted);
    for (const s of chosen) if (!!s.muted !== on) setMuted(s.id, on);
  }
  sp.chosen.clear();
  renderSpace();
});
{
  // the divider: Space's share of the column, dragged; the left button only, as the list's splitter
  const div = $('#spdiv');
  div.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    div.setPointerCapture(e.pointerId);
    div.classList.add('drag');
    const box = $('#main').getBoundingClientRect();
    const move = ev => {
      const f = Math.min(0.9, Math.max(0.05, (ev.clientX - box.left) / box.width));
      prefs.spaceAt = Math.round(f * 1000) / 1000;
      $('#main').style.setProperty('--sp', String(prefs.spaceAt));
    };
    const up = () => {
      div.classList.remove('drag');
      div.removeEventListener('pointermove', move);
      savePrefs();
      const s = state.sessions.get(state.current);
      if (s) syncTerm(s);
    };
    div.addEventListener('pointermove', move);
    div.addEventListener('pointerup', up, { once: true });
    div.addEventListener('pointercancel', up, { once: true });
  });
}
applySpace();
