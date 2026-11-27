// ---- several at once (2026-11-24): ⇧-click or ⇧-arrows choose nodes; a bar for them — done, star, mute —, esc lets go
function spBarDraw(list) {
  const ids = new Set(list.map(session => session.id));

  for (const id of [...sp.chosen]) if (!ids.has(id)) sp.chosen.delete(id);

  const bar = $('#spbar');
  const chosen = [...sp.chosen].map(id => state.sessions.get(id)).filter(Boolean);

  bar.hidden = !chosen.length;
  if (!chosen.length) return setHtml(bar, '');

  const allFav = chosen.every(session => session.fav);
  const allMuted = chosen.every(session => session.muted);
  const allDone = chosen.every(session => session.done);

  setHtml(
    bar,
    `<span>${chosen.length} chosen</span><button type="button" class="go" data-do="done">${allDone ? '↩ Back' : '✓ Done'}</button><button type="button" data-do="star">${allFav ? 'Unstar' : '★ Star'}</button><button type="button" data-do="mute">${allMuted ? 'Unmute' : 'Mute'}</button><button type="button" data-do="none" aria-label="Let them go">×</button><kbd>esc</kbd>`,
  );
}

$('#spbar').addEventListener('click', event => {
  const button = event.target.closest('button[data-do]');

  if (!button) return;

  const chosen = [...sp.chosen].map(id => state.sessions.get(id)).filter(Boolean);
  const what = button.dataset.do;

  if (what === 'done') {
    const back = chosen.every(session => session.done);

    for (const session of chosen) if (back || canTick(session)) tickDone(session.id, !back, button);
  }

  if (what === 'star') {
    const on = !chosen.every(session => session.fav);

    for (const session of chosen) if (!!session.fav !== on) setFav(session.id, on);
  }

  if (what === 'mute') {
    const on = !chosen.every(session => session.muted);

    for (const session of chosen) if (!!session.muted !== on) setMuted(session.id, on);
  }

  sp.chosen.clear();
  renderSpace();
});

{
  // the divider: Space's share of the column, dragged; the left button only, as the list's splitter
  const div = $('#spdiv');

  div.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    div.setPointerCapture(event.pointerId);
    div.classList.add('drag');
    const box = $('#main').getBoundingClientRect();

    const move = ev => {
      const share = Math.min(0.9, Math.max(0.05, (ev.clientX - box.left) / box.width));

      prefs.spaceAt = Math.round(share * 1000) / 1000;
      $('#main').style.setProperty('--sp', String(prefs.spaceAt));
    };

    const up = () => {
      div.classList.remove('drag');
      div.removeEventListener('pointermove', move);
      savePrefs();
      const session = state.sessions.get(state.current);

      if (session) syncTerm(session);
    };

    div.addEventListener('pointermove', move);
    div.addEventListener('pointerup', up, { once: true });
    div.addEventListener('pointercancel', up, { once: true });
  });
}

applySpace();
