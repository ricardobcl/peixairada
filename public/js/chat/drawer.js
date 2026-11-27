// ---- terminal drawer: the real claude in a PTY on the server, attached over a WebSocket -----
// The drawer is the chat pane's body while the chat runs here — the claude session, or the zsh tab beside it (⌥⌘T)
// — and the rendered transcript is the body otherwise.
// Nothing is shown or hidden by hand (2026-09-20): the drawer comes with
// the process and goes when it exits; a chat ticked done has its processes ended by the server. The process lives
// on the server, so switching chats does not end it, and every attach gets the exact screen, which is what makes a
// switch-and-back seamless.
// One per half of the chat column (2026-09-22): each owns its xterm, its socket and the terminal it is attached
// to. The left half keeps the plain ids — it is the whole column while nothing is split, and the harness reads
// #term / #termBody by those names. The take-over state (armed, failed) is the board's, not a terminal's.
const GEL = [
  { grp: '#grp', tabs: '#ptabs', body: '#gbody', term: '#term', tbody: '#termBody' },
  { grp: '#grpB', tabs: '#ptabsB', body: '#gbodyB', term: '#termB', tbody: '#termBodyB' },
];
const newTerm = (el, g) => ({
  g,
  el,
  id: null,
  sessionId: null,
  cwd: null,
  kind: null,
  ws: null,
  xt: null,
  fit: null,
  exited: null,
});
const terms = GEL.map(newTerm);
// What each group's elements need once (2026-11-25): run for the two halves in the markup, and for each tile made
// later (ensureGroups) — its strip's listeners, its body's paste, the pane's observer.
const groupHooks = [];
const onGroup = f => {
  groupHooks.push(f);
  for (const tm of terms) f(tm);
};
/** Groups up to `n`, a tile's markup made beside the halves' for each one more. */
function ensureGroups(n) {
  while (GEL.length < n) {
    const g = GEL.length,
      i = g + 1;
    $('#groups').insertAdjacentHTML(
      'beforeend',
      `<div class="grp" id="grp${i}" data-g="${g}" hidden><div class="ptabs" id="ptabs${i}" role="tablist" aria-label="Tile ${i}'s tabs"></div><div class="gbody" id="gbody${i}"><div class="gterm" id="term${i}" hidden><div class="tbody" id="termBody${i}"></div></div></div></div>`,
    );
    GEL.push({ grp: '#grp' + i, tabs: '#ptabs' + i, body: '#gbody' + i, term: '#term' + i, tbody: '#termBody' + i });
    const tm = newTerm(GEL[g], g);
    terms.push(tm);
    for (const f of groupHooks) f(tm);
  }
}
const drawer = { arm: null, armTimer: null, err: null };
// Split in two or not is the *chat's* (2026-09-22): a PR beside its terminal is a thing you want for the review you
// are doing, not for the board. Held here rather than in prefs for the same reason the tab a chat is on is — it lasts
// as long as the chats do. Only the divider's place is the board's (prefs.splitAt), like the column widths.
const splits = new Set();
const autoSplit = new Set(); // …and which of those splits the board made itself, opening a second tab (openNewTab)
// …and which chats stand their halves one over the other (2026-09-27, ⌥⌘1 / ⌥⌘2 against ⌘1 / ⌘2). The chat's too, and
// kept past its split — unsplit leaves it alone — so the next split, a tab opening beside the chat, comes back the
// way it was left. The divider's place is the board's for each layout (prefs.splitAt, prefs.stackAt): a tall column
// and a wide one want it in different places.
const stacked = new Set();
// …and which half of a split chat fills the column, the other kept as it was behind it (2026-10-13, a chat's key pressed
// again — zoomAgain): held while the keys stay in that half, so going to a tab of the other one brings both back.
const zoomed = new Map(); // chat id → 0 | 1
const isSplit = s => !!s && splits.has(s.id);
const splitNow = () => splits.has(state.current);
const stackNow = () => splitNow() && stacked.has(state.current) && !trees.has(state.current);
// …and a chat past two halves is a tree of tiles (2026-11-25, prefs.autoTile): each new terminal splits the tile the
// keys are in along its longer side (tileTerm; ⌘2 / ⌥⌘2 and the turn button turn a split after), and a tile closed
// gives its room to the one it was split from. A node is a leaf { g } — a group: GEL[g], terms[g] —
// or a split { d: 'row' | 'col', r, a, b }, `r` the first part's share. Made only by the setting, so a chat with none
// is the two halves as they were; it goes with the split (unsplit).
const trees = new Map(); // chat id → node
const leavesOf = n => (!n ? [] : 'g' in n ? [n.g] : [...leavesOf(n.a), ...leavesOf(n.b)]);
const isTiled = s => !!s && splits.has(s.id) && trees.has(s.id);
const tiledNow = () => splits.has(state.current) && trees.has(state.current);
/** The groups a chat's column shows, in the tree's order: the one, the two halves, or its tiles. */
const groupsOf = s => (!isSplit(s) ? [0] : isTiled(s) ? leavesOf(trees.get(s.id)) : [0, 1]);
/** A tree with leaf `g` replaced by what `f` makes of it; `null` from f drops it, its sibling taking its place. */
const treeMap = (n, g, f) =>
  'g' in n
    ? n.g === g
      ? f(n)
      : n
    : (a => (b => (!a ? b : !b ? a : { ...n, a, b }))(treeMap(n.b, g, f)))(treeMap(n.a, g, f));
/** The split right over leaf `g`, or null for the root's leaf. */
const parentOf = (n, g) =>
  !n || 'g' in n
    ? null
    : ('g' in n.a && n.a.g === g) || ('g' in n.b && n.b.g === g)
      ? n
      : parentOf(n.a, g) || parentOf(n.b, g);
/** Each leaf's box in the unit square, [x0, y0, x1, y1] by group — the layout's and the arrows' one reading. */
function tileRects(node) {
  const rects = {},
    cut = (n, x, y, w, h) => {
      if ('g' in n) {
        rects[n.g] = [x, y, x + w, y + h];
        return;
      }
      const r = Math.max(0.15, Math.min(0.85, n.r || 0.5));
      if (n.d === 'row') {
        cut(n.a, x, y, w * r, h);
        cut(n.b, x + w * r, y, w * (1 - r), h);
      } else {
        cut(n.a, x, y, w, h * r);
        cut(n.b, x, y + h * r, w, h * (1 - r));
      }
    };
  cut(node, 0, 0, 1, 1);
  return rects;
}
/** A chat's two halves as a tree, as they stand — what a tree past them starts from. */
const halvesTree = s => {
  const h = stacked.has(s.id) ? 'col' : 'row';
  return { d: h, r: (h === 'col' ? prefs.stackAt : prefs.splitAt) || 0.5, a: { g: 0 }, b: { g: 1 } };
};
/** Where the keys go back to when tile `g` goes (2026-11-25): the part it was cut from, at the tile nearest it — a
 *  second part's sibling's last leaf, a first part's sibling's first — as i3's focus falls back to the window it split. */
const backOf = (n, g) => {
  const par = parentOf(n, g);
  return !par ? null : 'g' in par.a && par.a.g === g ? leavesOf(par.b)[0] : leavesOf(par.a).at(-1);
};
const tileSeen = new Map(); // chat id → its groups, the one the keys were in last first (the arrows', as i3's focus stack)
let focusG = 0; // the half the keys, the pickers and a new tab act on
const curTerm = () => terms[focusG];
const termFor = id => (id ? terms.find(t => t.id === id) || null : null);
const focusTerm = () => {
  const tm = curTerm();
  if (tm.xt && tm.id) tm.xt.focus();
  else $(GEL[focusG].tabs).querySelector('.ptab.blank .paddr')?.focus();
}; // or a blank tab's address
function xtTheme() {
  const cs = getComputedStyle(document.documentElement),
    v = n => cs.getPropertyValue(n).trim();
  const ansi = SKINS[skinOn()]?.ansi; // a theme's sixteen colours (2026-10-10); none, xterm's own
  return {
    background: v('--term-bg'),
    foreground: v('--ink'),
    cursor: v('--accent'),
    cursorAccent: v('--term-bg'),
    selectionBackground: v('--term-sel'),
    ...(ansi ? Object.fromEntries(ANSI.map((n, i) => [n, ansi[i]])) : {}),
  };
}
const termSend = (tm, d) => {
  if (tm.ws?.readyState === 1 && tm.exited === null) tm.ws.send(JSON.stringify({ t: 'in', d }));
};
// What the board types into a claude for you goes as `type` (2026-11-27): the server types it, and ⏎ after it when
// `send`, only while that claude asks nothing — a permission dialog takes keys as its answer, and a stale banner's
// reply approved the tool call it was asking about. Null once typed, else why not.
const ASKS_FIRST = 'it is asking you something — answer it first';
let typeN = 0;
function typeIn(ws, d, send) {
  if (ws?.readyState !== 1) return Promise.resolve('its drawer is not attached yet — try again in a moment');
  return new Promise(res => {
    const n = ++typeN;
    const hear = e => {
      if (typeof e.data !== 'string') return;
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.t === 'typed' && m.n === n) done(m.why || null);
    };
    const done = why => {
      clearTimeout(timer);
      ws.removeEventListener('message', hear);
      ws.removeEventListener('close', gone);
      res(why);
    };
    const gone = () => done('its drawer went away — check what reached it');
    const timer = setTimeout(() => done('its drawer did not answer — check what reached it'), 3000);
    ws.addEventListener('message', hear);
    ws.addEventListener('close', gone);
    ws.send(JSON.stringify({ t: 'type', d, send: !!send, n }));
  });
}
// What the board types for you (2026-11-06) — a review's quoted lines and paths, a PR's words, a handoff, a banner's
// reply, a command left unrun — goes through one of these, never straight to termSend: a PTY reads every byte as a key,
// and a carriage return in a stranger's diff line submitted the prompt there and then, an ESC [Z cycled the permission
// mode, a ⌃U wiped what came before. Text as a person could type it: line breaks kept (a lone CR is one), a tab two
// spaces (Tab is a key to Claude Code and to zsh), every other C0 control, DEL and C1 gone. Your own keys never pass here.
// Nor what reorders text (2026-11-27, an outside audit's note): a bidi mark made a line typed for you to read and send
// read otherwise than what it sent; a line or paragraph separator is a line break.
const CTL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,
  BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const typable = t =>
  String(t ?? '')
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(/\t/g, '  ')
    .replace(CTL, '')
    .replace(BIDI, '');
/** For Claude's prompt: its newlines as Claude Code's own (ESC CR), so nothing is sent before the ⏎ the caller adds. */
const forClaude = t => typable(t).replace(/\n/g, '\x1b\r');
/** For a shell's line, left unrun: one line. */
const forShell = t => typable(t).replace(/\n+/g, ' ');
const hasCtl = t => /[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]/.test(t);
// ⌘K clears the terminal, as Terminal.app and iTerm do — a key xterm.js does not ship and zsh cannot bind
// (⌃L is the shell's own, and keeps the scrollback). The holder clears its screen too and echoes the clear
// back, which is what wipes the page: every attached page drops the same rows, and a re-attach or a server
// restart serializes the cleared screen rather than the one we hid. The nudge makes whatever runs repaint
// into the empty screen — zsh redraws its prompt on the resize, Claude Code its whole live region.
const clearTerm = tm => {
  if (tm.ws?.readyState === 1 && tm.exited === null) {
    tm.ws.send(JSON.stringify({ t: 'clear' }));
    nudgeTerm(tm);
  }
};
/** What the drawer last said about its focus view: the newest such line on its screen, null if it never said. */
function focusSaid(tm) {
  const b = tm.xt?.buffer.active;
  if (!b) return null;
  for (let i = b.length - 1; i >= Math.max(0, b.length - 200); i--) {
    const m = /Focus view (enabled|disabled)/.exec(b.getLine(i)?.translateToString(true) || '');
    if (m) return m[1] === 'enabled';
  }
  return null;
}
// A /focus typed in the drawer itself never reaches the board, so every attach reads the newest such line the
// screen still holds and takes the button from that (2026-09-20). It polls while the snapshot is still being written
// into the buffer, and leaves the button alone when the session never said anything — set through "viewMode": "focus"
// in settings, or scrolled past, it cannot know.
function readFocusFromScreen(tm) {
  const ws = tm.ws,
    id = tm.sessionId;
  if (tm.kind !== 'claude' || !id) return;
  // **Read a screen that has stopped arriving, not the first thing that looks like an answer** (2026-09-22): the
  // snapshot is written into xterm over several parse ticks, and a scan that lands mid-write finds whichever
  // line the parser has reached. On this chat that is the *older* `/focus` line as often as not — and taking it
  // both lit the button wrong and stopped the read, because a verdict equal to what the board already thinks is
  // a verdict. So: wait for the buffer to stop growing, then read once. `still` counts the quiet ticks; `n` caps
  // the whole thing, for a drawer that never settles or never said anything.
  let len = -1,
    still = 0,
    n = 0;
  const tick = () => {
    if (tm.ws !== ws || tm.sessionId !== id) return; // switched away: this read belonged to that drawer
    const now = tm.xt?.buffer.active.length ?? -1;
    if (now !== len) {
      len = now;
      still = 0;
    } else still++;
    const said = still >= 3 ? focusSaid(tm) : null;
    if (said === null) {
      if (++n < 25) setTimeout(tick, 200);
      return;
    }
    if (focusView.get(id) === said) return;
    focusView.set(id, said);
    const s = state.sessions.get(state.current);
    if (s && s.id === id) renderHead(s);
  };
  setTimeout(tick, 250);
}
// The header's target button (#viewBtn): type /focus into this chat's own holder and wait for the session to say
// which way it went — the only channel there is, the one the drawer's keyboard uses. The zsh tab holds the other
// holder, so it shows the claude one first rather than type a slash command into a shell.
async function toggleFocusView(s) {
  const at = () => seen($('#viewBtn'));
  if (!termLive(s)) return note(at(), 'No claude running here — ⌥⌘C starts one', true);
  const tm = termFor(s.terminal.id);
  if (!tm || tm.exited !== null) {
    showChat(s);
    syncTerm(s);
    return note(at(), 'Showing the claude session first — press again', true);
  }
  if (asking(s)) return note(at(), `Not now: ${ASKS_FIRST}`, true); // /focus⏎ in a dialog is its Yes
  const before = focusSaid(tm),
    no = await typeIn(tm.ws, '/focus', true);
  if (no) return note(at(), `/focus not sent: ${no}`, true);
  for (let i = 0; i < 20; i++) {
    // ~2.4 s: the command runs at once, but it has a menu to close and a frame to paint
    await new Promise(r => setTimeout(r, 120));
    const now = focusSaid(tm);
    if (now !== null && now !== before) {
      focusView.set(s.id, now);
      renderHead(s);
      return note(at(), `Focus view ${now ? 'on' : 'off'} in this session`);
    }
  }
  note(at(), 'Sent /focus — the session said nothing back; the drawer shows what happened', true);
}
const ALT_COMPOSES =
  /^(Digit\d|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|Intl(Backslash|Ro|Yen))$/;
// …and over any key, what composed into printable ASCII that is no letter (2026-10-14): German's @ is ⌥L, Swiss's ⌥G,
// French's | ⌥⇧L; a U.S. ⌥b composes ∫, and stays Meta
const ALT_ASCII = /^[\x21-\x40\x5b-\x60\x7b-\x7e]$/;
// The Mac's own line-editing keys (2026-10-09), sent as iTerm's Natural Text Editing preset sends them: xterm sends
// nothing at all for ⌘ with an arrow (it leaves those to the browser) and a plain DEL for ⌘⌫, and ⌥⌦ goes out as a
// modified Delete, which Claude Code reads as delete to the line's end. Control codes, so the zsh tab reads them as
// Claude Code does: ⌃A / ⌃E the line's start and end, ⌃U / ⌃K delete to them, ESC d the word ahead. ⌥← ⌥→ (ESC b /
// ESC f) and ⌥⌫ (ESC DEL) xterm already sends. ⇧ held, or ⌃, or ⌘ and ⌥ together (⌥⌘← is a tab), is not one of them.
const MAC_EDIT = {
  'cmd:ArrowLeft': '\x01',
  'cmd:ArrowRight': '\x05',
  'cmd:Backspace': '\x15',
  'cmd:Delete': '\x0b',
  'alt:Delete': '\x1bd',
};
const macEdit = e =>
  e.ctrlKey || e.shiftKey || e.metaKey === e.altKey ? undefined : MAC_EDIT[`${e.metaKey ? 'cmd' : 'alt'}:${e.key}`];
// xterm's DOM renderer reads a glyph's width as offsetWidth / 32, a whole px over 32 glyphs, and brings each glyph to
// its cell by the letter-spacing that leaves (2026-10-20): 12 px SF Mono's 7.418 read as 7.406 is 0.012 px too much a
// column, and the last glyph of 160 sat 2 px past its row, which clips it — the right edge of every full line cut. The
// same measure with the fraction kept: the computed width, which a tile's scale does not reach. Still offsetWidth in 6.0.
function exactGlyphs(xt) {
  const r = xt._core?._renderService?._renderer?.value,
    wc = r?._widthCache;
  if (typeof wc?._measure !== 'function' || typeof r._setDefaultSpacing !== 'function') return;
  wc._measure = function (c, v) {
    const el = this._measureElements[v];
    el.textContent = c.repeat(32);
    return parseFloat(getComputedStyle(el).width) / 32 || 0;
  };
  wc.clear();
  r._setDefaultSpacing();
  xt.refresh(0, xt.rows - 1);
}
// …and its height likewise (2026-10-29): it rounds the screen to whole CSS px and divides back, so at 2× a 16.5 px row
// reads 16.51 at 51 rows and 16.5 at 50, and the fit addon divided the body by that — 842 px held 50 rows at 51 and 51
// at 50, each fit the other one: every attach a row's resize and a whole repaint of the PTY. The addon's own measure,
// with the cell its device pixels make — set for the call and put back; a column, too, only where it fits whole.
function exactFit(tm) {
  const propose = tm.fit.proposeDimensions.bind(tm.fit);
  tm.fit.proposeDimensions = () => {
    const r = tm.xt._core?._renderService?.dimensions,
      cell = r?.css?.cell,
      dev = r?.device?.cell,
      dpr = window.devicePixelRatio || 1;
    if (!(dev?.width > 0 && dev.height > 0 && cell)) return propose();
    const was = { width: cell.width, height: cell.height };
    cell.width = dev.width / dpr;
    cell.height = dev.height / dpr;
    try {
      return propose();
    } finally {
      Object.assign(cell, was);
    }
  };
}
