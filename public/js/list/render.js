// ---- render: both lists ------------------------------------------------------------
// A lane folds (2026-10-11, later; three state chips filtered the list before): its head is a toggle, its cards hidden
// and its count kept — prefs.lanesShut, Done and Idle shut to begin with.
const laneShut = g => (prefs.lanesShut || []).includes(g);
/** What the stream says, drawn once a frame (2026-10-03): a gh batch is a burst of `session` events in one task, and
 *  each drew the whole list. A frame, or 100 ms where there are no frames (a hidden window: the badge still follows). */
function renderBoardSoon() {
  if (renderBoardSoon.t) return;
  const run = () => {
    renderBoard();
    if (phaseAnims.queued) phaseAnims(true);
  }; // in the frame already: the new nodes' rings phased before it paints
  renderBoardSoon.raf = requestAnimationFrame(run);
  renderBoardSoon.t = setTimeout(run, 100);
}
function renderBoard() {
  cancelAnimationFrame(renderBoardSoon.raf);
  clearTimeout(renderBoardSoon.t);
  renderBoardSoon.t = 0;
  if (renderBoard.held) {
    renderBoard.owed = true;
    cdMark();
    return;
  } // a card in the hand (2026-11-02): the list stands still under it, drawn once it is let go
  const every = projectList();
  if (!every.some(p => p.key === prefs.project)) prefs.project = ALL;
  const cur = every.find(p => p.key === prefs.project);
  renderSessionList(cur);
  renderHidden();
  spSoon(); // Space (⌥⌘X) draws what the list draws, the project in view's
  const w = wanting(),
    total = w.needs.length + w.replied.length; // what wants you, as the Dock counts it (2026-10-12; the alerts this page saw before)
  document.title = (total ? `(${total}) ` : '') + 'peixAIrada';
  if (inApp) postState();
  renderBar();
  rollSoon();
  if (!newsDone.asked)
    newsDone.asked = setTimeout(() => {
      newsDone.asked = 0;
      newsSoon();
    }); // what's new, once the board is quiet (2026-11-24)
}
// The app's badge and status menu, from the board's own state (2026-09-27): the shell's bridge used to open a second
// SSE stream and keep its own copy of every session for four counts, three of which it only logged. What it needs is
// the chats waiting on you; posted when that changes.
// The open chat, for the window (2026-09-27, night): its project, title and folder go to the shell whenever the
// header is drawn anew, and nothing when the column is empty — the window's title (⌘Tab, Mission Control, the
// Window menu) and its represented folder (the title bar's proxy icon and ⌘-click path) follow.
// only what changed (2026-10-10): a header drawn anew for another reason — the +n −n coming in — names the same window
const postChat = s => {
  if (!inApp) return;
  const m = { type: 'chat', project: s?.project || '', title: s?.title || '', cwd: s?.cwd || '' },
    sig = JSON.stringify(m);
  if (sig === postChat.last) return;
  postChat.last = sig;
  post(m);
};
// …and what wants you, one meaning for the Dock's badge (2026-10-12; it counted the alerts that came while the app was in
// the back): the chats asking you and the ones with a new reply — the fish in the menu bar counts and lists the questions
// alone (2026-11-25).
// what asks is what the list and the bar call asking (2026-10-14; any live claude waiting before, a chat ticked done too)
// How long a chat has been asking: the registry's moment, else the status's. Questions are served longest wait first
// (2026-11-01, round XIX's S4; newest first before, which favours whoever pinged last), and the bar says the longest.
const askedAt = s =>
  (s.live?.status === 'waiting' && s.live.statusAt) || Date.parse(s.statusSince || wordAt(s) || '') || Date.now();
const byWait = (a, b) => askedAt(a) - askedAt(b);
const waitWord = ms => {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? '' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
};
// Neither a snoozed chat (2026-11-24, round XXX's W4) nor, in focus, a chat out of Top priority but for its question (F3).
const quietNow = s => asleep(s) || (prioFocus() && !inPrio(s));
const wanting = () => {
  const all = [...state.sessions.values()];
  return {
    needs: all.filter(s => visible(s) && askingLoud(s)),
    replied: all
      .filter(s => visible(s) && !s.done && !s.muted && !asking(s) && !quietNow(s) && replied(s))
      .sort(byWord),
  };
};
function postState() {
  const w = wanting(),
    brief = s => ({ id: s.id, project: s.project, title: s.title });
  const needs = [...w.needs].sort(byWait).map(s => ({ ...brief(s), since: String(askedAt(s)) })),
    replies = w.replied.map(brief);
  const mutes = [...state.sessions.values()].filter(s => s.muted).map(s => s.id); // the app takes back what it still holds for one (a snooze)
  const sig = JSON.stringify([needs, replies, mutes]);
  if (sig === postState.last) return;
  postState.last = sig;
  post({ type: 'state', needs, replied: replies, mutes });
}
// Next (2026-11-01, round XIX's M1; StarCraft's idle-worker key, Civ's turn button): one key that always arrives, in a
// fixed, stated order. The question waiting longest, then a PR at your move, the one that came round first, then what to
// read, the oldest first. It never moves you by itself, only on a press, and from a chat in the queue it goes on to the
// one after it, so pressing it again walks them and comes round. Moves and replies stay filters of the list: never lanes.
function nextQueue() {
  const all = [...state.sessions.values()].filter(visible),
    seen = new Set(),
    once = k => s => (seen.has(s.id) ? null : (seen.add(s.id), { s, k }));
  const by = at => (a, b) => String(at(a)).localeCompare(String(at(b)));
  return [
    ...all.filter(askingLoud).sort(byWait).map(once('ask')),
    ...all
      .filter(s => !s.done && !s.muted && !quietNow(s) && yourMove(s))
      .sort(by(movedAt))
      .map(once('move')),
    ...wanting()
      .replied.slice()
      .sort(by(s => s.lastReplyAt))
      .map(once('read')),
  ].filter(Boolean);
}
