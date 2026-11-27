function tickDone(id, done, anchor, mark = null, forGood = false) {
  if (done && !tickGate(id, mark || anchor)) return;

  const go = () => {
    if (done && id === state.current && !prefs.space) moveOn(id); // Space has no list to move on to: any tick there leaves the chat open (2026-11-23; every one, 2026-11-24)

    api('POST', `/api/sessions/${id}/done`, forGood && done ? { done, forGood } : { done }) // the card the click was on is redrawn by the move
      .catch(err =>
        note(
          anchor.isConnected ? anchor : document.querySelector(`#slist > .card[data-id="${id}"]`),
          `Could not tick it: ${err.message}`,
          true,
        ),
      );
  };

  if (!done || !mark || REDUCED.matches) return go();
  if (mark.classList.contains('tk')) return; // a second click while it draws
  mark.classList.add('tk');
  noteMotion(id, 'tick');
  lastTickAt = performance.now();
  mark.animate([{ scale: 0.7 }, { scale: 1 }], { duration: 360, easing: SPRING, id: 'tick' });
  setTimeout(go, TICK_MS); // the open chat moves on with it: a move first would redraw the card, the mark with it
}

// Delete from the board (2026-11-04; ⌥-click on any card's button, a card's menu, ···, the launcher): whatever the chat is
// doing, its claude ended, its transcript left where it is. What it would interrupt asks once more, as a watching chat's ✓
// does; an idle or ended chat goes at once. ⌥⌘K, typed, finds it, and a word in it, a resume or Put it back brings it back.
const removeEnds = s =>
  !s.alive ? '' : s.status === 'working' ? 'its turn' : asking(s) ? 'its question' : watchEnds(s);

function removeGate(id, anchor) {
  const s = state.sessions.get(id);
  const ends = s && removeEnds(s);

  if (!ends) return true;

  if (delArmedOn(id)) {
    delArmed.delete(id);
    return true;
  }

  delArmed.set(id, performance.now() + ARM_MS);
  noteMotion(id, 'arm');

  if (!anchor?.closest?.('#slist .card')) {
    note(anchor?.isConnected ? anchor : $('#shead'), `Deleting it ends ${ends}. Ask again to delete it`);
  }

  setTimeout(() => {
    if (delArmed.has(id) && !delArmedOn(id)) {
      delArmed.delete(id);
      renderBoard();
    }
  }, ARM_MS + 30);

  renderBoard();
  return false;
}

function removeChat(id, anchor, mark = null) {
  if (!removeGate(id, mark || anchor)) return;

  const go = () => {
    if (id === state.current) {
      if (!prefs.space) moveOn(id);
      if (state.current === id) leaveChat();
    } // Space: nothing to move on to, the chat leaves

    api('POST', `/api/sessions/${id}/remove`, {}).catch(err =>
      note(anchor?.isConnected ? anchor : $('#shead'), `Could not delete it: ${err.message}`, true),
    );
  };

  if (!mark || REDUCED.matches) return go();
  if (mark.classList.contains('tk')) return; // a second click while it draws
  mark.classList.add('tk', 'fg');
  noteMotion(id, 'delete');
  mark.animate([{ scale: 0.7 }, { scale: 1 }], { duration: 360, easing: SPRING, id: 'tick' });
  setTimeout(go, TICK_MS);
}

const restoreChat = id =>
  api('POST', `/api/sessions/${id}/remove`, { undo: true }).catch(err =>
    note($('#shead'), `Could not put it back: ${err.message}`, true),
  );

// ⌥ held (2026-10-11): a card's button under the pointer shows delete's ✕ (2026-11-04). Off the keys, and off the pointer's own
// events too — in the app a key pressed with a page of the pane in front never reaches this one.
const altHeld = on => {
  if (on !== document.documentElement.hasAttribute('data-alt')) {
    document.documentElement.toggleAttribute('data-alt', on);
  }
};

addEventListener(
  'keydown',
  e => {
    if (e.key === 'Alt') altHeld(true);
  },
  true,
);

addEventListener(
  'keyup',
  e => {
    if (e.key === 'Alt') altHeld(false);
  },
  true,
);

addEventListener('pointermove', e => altHeld(e.altKey), { capture: true, passive: true });
addEventListener('blur', () => altHeld(false));

function moveOn(id) {
  const cards = [...document.querySelectorAll('#slist > .card')];
  const i = cards.findIndex(c => c.dataset.id === id);

  const open = c => !c.classList.contains('done');
  const next = i < 0 ? null : cards.slice(i + 1).find(open) || cards.slice(0, i).reverse().find(open);

  if (next) openSession(next.dataset.id);
}
