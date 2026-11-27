// ---- the chat list: shown or hidden, and its width -------------------------------------------------------------------
// Hidden (2026-10-25; folded to a rail of squares from 2026-09-22): the list out of the layout and the chat the whole
// width (main.lhide) — the status bar's first button (#sbList, the sidebar's mark, its pane filled while the list
// shows) or ⌥⌘B (⌘B until 2026-10-02, VS Code's key for its sidebar — the chat list is the column beside the chat). As
// every ⌥⌘ letter, it is forwarded from the pane's pages: VS Code Web gives up its ⌥⌘B (the secondary side bar) and
// keeps its ⌘B, and GitHub its bold. What only narrows the list — the magnifier, a filter, a face, a project — shows
// it again (showList). Shown, its scroll is where it was, and the rings made anew turn in step (phaseAnims).
function applyList() {
  const hide = !!prefs.listHidden;
  const list = $('#sessions');
  const b = $('#sbList');

  if (hide && !$('#main').classList.contains('lhide')) applyList.top = $('#slist').scrollTop; // display: none forgets it
  $('#main').classList.toggle('lhide', hide);
  list.style.width = `${prefs.sessionsWidth}px`;

  if (hide && list.classList.contains('kf')) {
    list.classList.remove('kf');
    $('#chat').classList.add('kf');
  } // the keys' border on what is left

  if (!hide && applyList.top != null) {
    $('#slist').scrollTop = applyList.top;
    applyList.top = null;
    followCard();
    phaseAnims();
  }

  const shown = !hide && !prefs.space; // Space takes the list's place (2026-11-18): its button says so

  b.setAttribute('aria-pressed', String(shown));
  b.title = `${shown ? 'Hide' : 'Show'} the chat list (⌥⌘B)`;
}

function setList(show) {
  if (show === !prefs.listHidden) return;
  prefs.listHidden = !show;
  savePrefs();
  applyList();
}

function toggleList() {
  if (prefs.space) return showList(true);
  setList(!!prefs.listHidden);
}

/** The list back. In Space (2026-11-18) only when asked for it — its button, ⌥⌘B, the magnifier, the funnel —, which leaves
 *  Space; a project or a face picked narrows Space as it does the list. */
function showList(leave = false) {
  if (prefs.space) {
    if (!leave) return;
    prefs.space = false;
    savePrefs();
    applySpace();
  }

  setList(true);
  applyList();
}

$('#sbList').onclick = toggleList;
applyList();

{
  // The left button only (2026-10-03: a right or ⌃-click started a drag whose mouseup the context menu swallowed, and
  // the column followed the bare pointer); the list's left edge is read once, at the press — read per move, it was a
  // layout after every width written.
  const splitter = $('#splitter');

  let dragging = false;
  let left = 0;

  splitter.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.ctrlKey) return;
    dragging = true;
    left = $('#sessions').getBoundingClientRect().left;
    splitter.classList.add('drag');
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  // …and it snaps to the list's own width and to half the window (2026-10-11), with a bump on the trackpad as it does
  let snapped = null;

  window.addEventListener('mousemove', e => {
    if (!dragging) return;

    const w = Math.round(Math.max(300, Math.min(innerWidth * 0.6, e.clientX - left)));
    const stop = [LIST_W, Math.round(innerWidth / 2)].find(d => Math.abs(w - d) <= SNAP_PX);

    prefs.sessionsWidth = stop ?? w;
    if (stop && snapped !== stop) haptic('alignment');
    snapped = stop ?? null;
    $('#sessions').style.width = `${prefs.sessionsWidth}px`;
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('drag');
    document.body.style.userSelect = '';
    savePrefs();
  });
}

// A bump on the trackpad (2026-10-11, Apple's alignment and level haptics): the app's shell performs it — only under a
// hand on a Force Touch trackpad, so the page says when, never whether — for a divider snapping to a stop, a tab
// dropped into the other half, the timeline's thumb crossing a run of days. A browser has none; `haptic:<kind>` in
// motion() either way.
const SNAP_PX = 8;
const LIST_W = 380; // a divider's pull towards a stop; the list's own width (prefs' default)

function haptic(kind = 'alignment') {
  noteMotion(null, `haptic:${kind}`);
  if (inApp) post({ type: 'haptic', kind });
}
