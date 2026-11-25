// The 30 s tick: the ages (fillAges, in the list's render and, while they are up, the picker's rows and the menu),
// and the day lines and the list's order, which the clock moves too. The cards' markup no longer carries an age, so
// the render is a diff that rebuilds nothing on its own.
setInterval(() => {
  renderBoard();
  if ($('#pick').open) fillAges($('#picklist'));
  if ($('#hmenu').open) fillAges($('#hmenu'));
  if ($('#ov').open) fillAges($('#ovcols'));
  fillAges($('#prlist'));
  fillAges($('#shead'));
}, 30_000);
// The open chat looked at again: back in view — or the window given the keys back (2026-10-14), since an alert counts a
// reply unread on a board that is on screen without them, and nothing else cleared it
const lookedAt = () => {
  if (document.visibilityState === 'visible' && state.current) {
    state.unread.delete(state.current);
    if (replied(state.sessions.get(state.current) || {})) markSeen(state.current);
    renderBoard();
  }
};
document.addEventListener('visibilitychange', lookedAt);
window.addEventListener('focus', lookedAt);
// deep link: /#<session-id> opens that chat — also how the native app's notifications jump here
const hashId = () => location.hash.slice(1).split('/')[0];
// …and /tl:… after the id, the timeline's narrow (2026-10-17): a link's or a PR alert's — the tab opened on it, at its move
window.addEventListener('hashchange', () => {
  const id = hashId(),
    s = state.sessions.get(id);
  if (!s) return;
  const tl = tvFromHash(s);
  if (id !== state.current) openSession(id, { locate: true });
  if (!tl) return;
  const n = tvNarrow.get(id);
  if (n?.on?.length === 1) tv.goto = { id, url: n.on[0] };
  if (!timelineOpen.has(id)) {
    timelineOpen.add(id);
    openNewTab(s, 'timeline');
  } else setTab(s, 'timeline');
  syncTerm(s);
});
