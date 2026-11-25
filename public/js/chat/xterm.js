function ensureXterm(tm) {
  if (tm.xt) return;
  tm.xt = new Terminal({
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: termFontSize(),
    lineHeight: 1.1,
    cursorBlink: true,
    scrollback: 5000,
    theme: xtTheme(),
    macOptionIsMeta: prefs.optMeta !== false,
    screenReaderMode: readerOn(),
  });
  // ⌘+ / ⌘- / ⌘0 are the chat's size, not keys for claude; handled here, and the document handler skips them.
  // Shift+Enter: xterm.js sends the same \r as Enter, which submits the prompt. Claude reads ESC CR
  // (Option+Enter) as a newline — it is what its own /terminal-setup binds Shift+Enter to in VS Code's
  // terminal, which is xterm.js too. Sent on keydown; the keypress that follows is swallowed as well,
  // or it would put the \r through anyway (a custom handler that returns false leaves _keyDownHandled unset).
  // ⌥ is also how a non-US keyboard composes: @ is ⌥2 on a Portuguese layout, | is ⌥1. macOptionIsMeta turns
  // that off wholesale — xterm takes the third-level-shift path only when `isMac && !macOptionIsMeta` — so ⌥2
  // went out as ESC 2 and there was no way to type an @, of all characters. ⌥ over a letter stays Meta (readline's
  // ⌥b / ⌥f / ⌥⌫, and the ⌥Enter newline) unless it composed ASCII and no letter (ALT_ASCII); over a digit or a
  // punctuation key we send what macOS already composed, which is `e.key` itself. A dead key ('Dead') is longer than one character and falls through to xterm as before.
  tm.xt.attachCustomKeyEventHandler(e => {
    if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (e.type === 'keydown') termSend(tm, '\x1b\r');
      return false;
    }
    if (
      prefs.optMeta !== false &&
      e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      e.key.length === 1 &&
      (ALT_COMPOSES.test(e.code) || ALT_ASCII.test(e.key))
    ) {
      e.preventDefault();
      if (e.type === 'keydown') termSend(tm, e.key);
      return false;
    }
    if (e.code === 'KeyK' && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      if (e.type === 'keydown') clearTerm(tm);
      return false;
    }
    const edit = macEdit(e);
    if (edit) {
      e.preventDefault();
      if (e.type === 'keydown') termSend(tm, edit);
      return false;
    }
    return !(e.type === 'keydown' && chatZoomKey(e));
  });
  tm.fit = new FitAddon.FitAddon();
  tm.xt.loadAddon(tm.fit);
  exactFit(tm);
  tm.xt.loadAddon(
    new WebLinksAddon.WebLinksAddon((_e, uri) => (GH_PR.test(uri) ? showPr(uri.match(GH_PR)[0]) : openExternal(uri))),
  );
  tm.xt.registerLinkProvider({ provideLinks: (y, cb) => cb(termLinks(tm, y)) }); // the paths on a line (2026-09-26)
  tm.xt.open($(tm.el.tbody));
  exactGlyphs(tm.xt);
  // A drawer attached anew comes up at its end (2026-10-29): the attach's reset shrinks xterm's scroll area, and WebKit
  // clamps the old drawer's scroll position to 0 and says so a frame later — once the snapshot is parsed, before xterm
  // has moved its scrollbar to the end — so xterm took that 0 for a hand scrolling to the top, and stayed there. While
  // it settles (`settleUntil`, until the nudge lets go), a scroll that leaves the end is put back; xterm's own listener
  // ran first, this one undoes it in the same event, before a frame is drawn.
  $(tm.el.tbody)
    .querySelector('.xterm-viewport')
    .addEventListener('scroll', () => {
      const b = tm.xt.buffer.active;
      if (b.viewportY < b.baseY)
        fitNote(tm, 'scrolled up', { by: b.baseY - b.viewportY, kept: performance.now() < tm.settleUntil });
      if (performance.now() < tm.settleUntil && b.viewportY < b.baseY) tm.xt.scrollToBottom();
    });
  tm.xt.onData(d => termSend(tm, d));
  tm.xt.onWriteParsed(() => roomSoon(tm)); // under the floating header or behind it (checkRoom)
  $(tm.el.tbody).addEventListener('mousedown', () => focusGroup(tm.g)); // typing in a half is being in it
  new ResizeObserver(() => fitTerm(tm)).observe($(tm.el.tbody));
  // The observer sees the body change size — not xterm's cell change size under it. On a display-scale change
  // (the window moved to another screen, a monitor plugged or unplugged, the lid reopened) xterm re-measures the
  // cell and repaints every row at the new height — device.char.height is ceil(h × dpr), the cell floor(× 1.1),
  // so it rounds differently per scale — and refits nothing: the grid no longer matches the body until something
  // calls fit(), which is what ⌘+ did by hand. Refit on that, and on focus and on coming back into view, the
  // moments a page that sat behind something comes back; fit() sends a resize only when the numbers moved.
  watchDpr(tm);
  // And back in front it says its size again (2026-10-14): another page on the same drawer — a second window, a browser
  // beside the app — sized the PTY meanwhile, and `sent` alone kept this one quiet for good. At the size it has, the
  // kernel sends no SIGWINCH: nothing repaints.
  const again = () => {
    tm.sent = null;
    fitTerm(tm);
  };
  window.addEventListener('focus', again);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') again();
  });
}
// The same rule as lib/refit.mjs, kept by hand (this page has no build step): a screen that grows has to park
// its cursor on the last line of the buffer for the length of the resize, or xterm appends blank rows at the
// bottom instead of pulling the scrollback back down, and the session stays stuck at the top of a black pane.
// The fit addon does the resize itself, so it is what gets wrapped — it clears the renderer first, which a
// bare resize would not.
// Like it, the caller writes nothing to the screen until `done` (toXt holds the socket's frames meanwhile). Unlike it,
// whether to park is read at the call, not behind the queue: a fit that waited a tick left the grid at its old size
// for the nudge and termSize to read, and an attach nudged the PTY to the wrong height (2026-10-03). A park waits anyway.
function refitTerm(xt, rows, resize, done = () => {}) {
  const b = xt.buffer.active;
  const tail =
    rows > xt.rows && b.baseY > 0
      ? Math.max(0, Math.min(b.length - 1 - (b.baseY + b.cursorY), xt.rows - 1 - b.cursorY))
      : 0;
  if (!tail) {
    resize();
    return void done();
  }
  // Parked from where the cursor is once the parser's queue has landed, and back only as far as it went (2026-10-14,
  // lib/refit.mjs): a scroll region stops CUD at its bottom margin, and output still queued at the call moves it.
  xt.write('', () => {
    const b = xt.buffer.active,
      y0 = b.cursorY,
      n = Math.max(0, Math.min(b.length - 1 - (b.baseY + y0), xt.rows - 1 - y0));
    if (!n) {
      resize();
      return void done();
    }
    xt.write(`\x1b[${n}B`, () => {
      const went = b.cursorY - y0;
      resize();
      xt.write(went > 0 ? `\x1b[${went}A` : '', done);
    });
  });
}
/** What reaches a drawer's screen, in order — held while a refit, a nudge or a repaint is awaited (`refits`): the socket's
 *  bytes as they came, anything else as a function. */
const toXt = (tm, f) => {
  if (tm.refits) tm.held.push(f);
  else f();
};
/** What was held, written in order: the bytes in a row as one write, which xterm parses whole before it draws (2026-11-05:
 *  a frame landing between two of them showed a repaint's top and not its bottom). */
function flushHeld(tm) {
  let bytes = [];
  const write = () => {
    if (!bytes.length) return;
    const all = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
    let at = 0;
    for (const b of bytes) {
      all.set(b, at);
      at += b.length;
    }
    bytes = [];
    tm.xt.write(all);
  };
  for (const x of tm.held.splice(0))
    if (typeof x === 'function') {
      write();
      x();
    } else bytes.push(x);
  write();
}
/** One wait on the screen over: the last lets what was held through — at the grid a repaint was awaited for, first, in the
 *  same pass of xterm's parser as the bytes, so no frame shows the one without the other. */
function unhold(tm) {
  if (--tm.refits > 0) return;
  const g = tm.gridDue,
    ws = tm.ws;
  tm.gridDue = null;
  if (g) fitNote(tm, 'grid', { to: `${g.cols}x${g.rows}` });
  if (!g || (g.cols === tm.xt.cols && g.rows === tm.xt.rows)) return flushHeld(tm);
  tm.refits = 1;
  tm.xt.write('', () => {
    if (tm.ws !== ws) return unhold(tm); // another drawer since: its own fit sizes it
    keepEnd(tm);
    refitTerm(
      tm.xt,
      g.rows,
      () => {
        try {
          tm.xt._core._renderService.clear();
          tm.xt.resize(g.cols, g.rows);
        } catch {}
      },
      () => {
        unhold(tm);
        keepEnd(tm);
        setTimeout(() => fitTerm(tm));
      },
    );
  });
}
// A TUI's screen follows its repaint (2026-11-05). What a claude or vim shows is its drawing for one size: put on another
// grid it is cut off or short, and the repaint for the new size comes once the PTY hears of it — two looks of the whole
// screen, 130 ms apart at the least, every time the column changed shape, and a torn frame now and then besides (the real
// CLI's ESC[2J and 20 KB of screen, in chunks, wrapped in nothing that holds a frame). So the page's grid stays as it is
// and the PTY is told; what comes is held until it has stopped coming, and the grid and the repaint go in together.
// The wait: REPAINT_WAIT_MS for the repaint to start — REPAINT_BYTES since the PTY was told, more than a spinner's tick or
// the modes the real one says first —, then REPAINT_QUIET_MS past its last byte (the real one answers in 6-23 ms, its 20 KB
// within a millisecond; a turn's output comes slower than that), REPAINT_MAX_MS at most: a claude that does not answer, or
// whose output never pauses, is as before, only later.
// A zsh at its prompt is not one: its lines are xterm's to reflow, at once, as a terminal does.
const REPAINT_WAIT_MS = 150,
  REPAINT_QUIET_MS = 16,
  REPAINT_MAX_MS = 250,
  REPAINT_BYTES = 200,
  FIT_STILL_MS = 120;
/** The last of what each drawer's fit decided, for the console and the harness (`peix.fits(g)`): a report of a wrong drawer
 *  reads it before anyone guesses (2026-11-05). */
const fitNote = (tm, ev, x = {}) => {
  const l = (tm.fitLog ||= []);
  l.push({ t: Math.round(performance.now()), ev, grid: `${tm.xt?.cols}x${tm.xt?.rows}`, ...x });
  if (l.length > 40) l.shift();
};
const paintsItself = tm =>
  !!(
    tm.snapped &&
    tm.ws?.readyState === 1 &&
    tm.exited === null &&
    (tm.kind === 'claude' || tm.xt.buffer.active.type === 'alternate')
  );
function awaitRepaint(tm, d, told) {
  let h = tm.hold;
  const fresh = !h;
  if (!h) {
    if (d.cols === tm.xt.cols && d.rows === tm.xt.rows) return; // the grid is already the size: nothing to wait for
    keepEnd(tm); // the body moves now, the grid later
    h = tm.hold = { ws: tm.ws, timer: 0, cap: setTimeout(() => endHold(tm, h), REPAINT_MAX_MS) };
    h.arm = ms => {
      clearTimeout(h.timer);
      h.timer = setTimeout(() => endHold(tm, h), ms);
    };
    h.resume = () => h.arm(h.got >= REPAINT_BYTES ? REPAINT_QUIET_MS : REPAINT_WAIT_MS); // a size that was to go and did not: the wait as it was
    tm.refits = (tm.refits || 0) + 1;
    tm.held ||= [];
  }
  h.cols = d.cols;
  h.rows = d.rows;
  if (told) h.got = 0;
  if (told) h.arm(REPAINT_WAIT_MS);
  else if (fresh) h.arm(0);
  else h.resume(); // the PTY already that size: nothing more is coming fitNote(tm, 'wait', { to: `${d.cols}x${d.rows}`, told });
}
/** The wait over — answered, or given up on: the grid the PTY was told of, then everything that came. */
function endHold(tm, h = tm.hold) {
  if (!h || tm.hold !== h) return;
  clearTimeout(h.timer);
  clearTimeout(h.cap);
  tm.hold = null;
  tm.gridDue = tm.ws === h.ws ? { cols: h.cols, rows: h.rows } : null;
  fitNote(tm, 'let go', { to: `${h.cols}x${h.rows}`, same: tm.ws === h.ws, refits: tm.refits });
  unhold(tm);
  setTimeout(() => fitTerm(tm)); // the layout moved meanwhile, or the screen stopped being a TUI's: the fit's own word
}
/** A wait dropped with its drawer — detached, ended: nothing it held is that screen's any more. */
function dropHold(tm) {
  tm.gridDue = null; // a grid let go before the socket went, still behind a nudge
  const h = tm.hold;
  if (!h) return;
  clearTimeout(h.timer);
  clearTimeout(h.cap);
  tm.hold = null;
  tm.held = [];
  tm.refits = Math.max(0, (tm.refits || 0) - 1);
}
// A layout change from a hand still at work — a bar held, the window being resized — goes to the PTY once it has stopped
// moving (2026-10-03: a splitter drag sent one resize per column it crossed, each a SIGWINCH and a whole repaint); any
// other at once (2026-11-05), but one following another within FIT_STILL_MS, which is the layout still moving too.
let handDown = false,
  windowMovedAt = 0;
addEventListener(
  'mousedown',
  () => {
    handDown = true;
  },
  true,
);
addEventListener(
  'mouseup',
  () => {
    handDown = false;
    for (const tm of terms) if (tm.sizeTimer) fitTerm(tm, true);
  },
  true,
); // let go: now
addEventListener('blur', () => {
  handDown = false;
});
addEventListener(
  'mousemove',
  e => {
    if (!e.buttons) handDown = false;
  },
  true,
); // let go outside the window
addEventListener(
  'resize',
  () => {
    windowMovedAt = performance.now();
    for (const tm of terms) keepEnd(tm);
  },
  true,
); // the clamp's scroll event comes before the body's observer
const moving = () => handDown || performance.now() - windowMovedAt < FIT_STILL_MS;
// A drawer at its end stays there through a resize (2026-11-05): the body changes size before the grid, or the grid
// before its scroll area, and the browser clamps the viewport's scroll a frame later, which xterm takes for a hand
// scrolling up — the soak found a drawer with its scrollback in view and its prompt below the fold, before this change
// too. Kept as an attach is (`settleUntil`, its scroll listener), for KEEP_END_MS past the resize; one scrolled up stays so.
const KEEP_END_MS = 400;
const keepEnd = tm => {
  const b = tm.xt?.buffer.active;
  if (b && b.viewportY >= b.baseY) tm.settleUntil = Math.max(tm.settleUntil || 0, performance.now() + KEEP_END_MS);
};
/** The page's grid to the body at once, the old way: xterm reflows what it holds (a zsh's lines, a screen no app answers for). */
function fitLocal(tm, d) {
  if (d.cols === tm.xt.cols && d.rows === tm.xt.rows) return;
  keepEnd(tm);
  tm.refits = (tm.refits || 0) + 1;
  tm.held ||= [];
  refitTerm(
    tm.xt,
    d.rows,
    () => {
      try {
        tm.fit.fit();
      } catch {}
    },
    () => {
      unhold(tm);
      keepEnd(tm);
    },
  );
}
function fitTerm(tm, now = false) {
  if (!tm) {
    for (const t of terms) fitTerm(t, now);
    return;
  }
  if (!tm.xt || $(tm.el.term).hidden) return;
  let d;
  try {
    d = tm.fit.proposeDimensions();
  } catch {
    return;
  }
  if (!d || !(d.cols > 1) || !(d.rows > 1)) return;
  const same = g => g && g.cols === d.cols && g.rows === d.rows;
  // nothing new: the PTY has the size, the grid has it or will once its repaint is in (a body's observer says it twice)
  fitNote(tm, 'fit', {
    d: `${d.cols}x${d.rows}`,
    sent: tm.sent && `${tm.sent.cols}x${tm.sent.rows}`,
    hold: !!tm.hold,
    paints: paintsItself(tm),
    now,
    moving: moving(),
    refits: tm.refits || 0,
  });
  if (same(tm.sent) && same(tm.hold || tm.xt)) {
    if (tm.sizeTimer) {
      clearTimeout(tm.sizeTimer);
      tm.sizeTimer = 0;
      tm.hold?.resume();
    }
    return;
  }
  keepEnd(tm); // the body moved: whatever comes next, a drawer at its end stays there
  if (!paintsItself(tm)) fitLocal(tm, d);
  clearTimeout(tm.sizeTimer);
  tm.sizeTimer = 0;
  const send = () => {
    tm.sizeTimer = 0;
    if (prefs.termSize?.cols !== d.cols || prefs.termSize?.rows !== d.rows) {
      prefs.termSize = { cols: d.cols, rows: d.rows };
      savePrefs();
    } // what a drawer started before any xterm exists asks for
    // Only a size that moved goes to the PTY (2026-09-27): the holder resizes it unchecked. `sent` is this
    // attachment's: a new socket starts over (attachTerm), so the holder always hears the first size.
    const told = tm.ws?.readyState === 1 && !same(tm.sent);
    if (told) {
      tm.sent = { cols: d.cols, rows: d.rows };
      tm.sentAt = performance.now();
      tm.ws.send(JSON.stringify({ t: 'resize', cols: d.cols, rows: d.rows }));
    }
    fitNote(tm, 'send', { d: `${d.cols}x${d.rows}`, told, paints: paintsItself(tm) });
    if (paintsItself(tm)) awaitRepaint(tm, d, told);
    else fitLocal(tm, d);
  };
  if (now || (!moving() && !tm.hold && performance.now() - (tm.sentAt || 0) > FIT_STILL_MS)) send();
  else {
    if (tm.hold) clearTimeout(tm.hold.timer);
    tm.sizeTimer = setTimeout(send, FIT_STILL_MS);
  } // a newer size on its way: the wait holds for it
}
// The media query is for the scale of the moment, so it is re-armed after each change; xterm listens to the
// same change and re-measures in its handler, and the refit must run after that — hence the timeout.
function watchDpr(tm) {
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener(
    'change',
    () => {
      setTimeout(() => fitTerm(tm), 50);
      watchDpr(tm);
    },
    { once: true },
  );
}
// A drawer the floating header covers starts under it while its screen has room (2026-10-11, late night): a terminal
// draws from its top — Claude Code's banner, a zsh's first prompt — and the header hid the start of every new chat.
// Once the screen is full it runs up behind the header as the transcript's words do, older lines faint under it.
// Room is the longest run of blank rows on the screen: full is two at most (a fullscreen claude keeps a blank first
// row and one over its prompt); back under the header takes room for the rows it covers and ROOM_MORE besides — a
// /clear, a /compact. The band between, and a want seen twice ROOM_MS apart, keep it from see-sawing: every change is
// a resize and a whole repaint, and a repaint read between its clear and its draw is a blank screen. Kept per
// drawer (`underOf`), so a chat switched back to comes up as it was left; one never seen starts under unless resumed.
const UNDER_HEAD =
  ':root[data-head="float"] :is(#groups:not(.stack) > .grp, #groups.stack > .grp:first-child).nostrip > .gbody > .gterm';
const ROOM_FULL = 2,
  ROOM_MORE = 4,
  ROOM_MS = 200;
const underOf = new Map(); // drawer id → it sits under the header
function setUnder(tm, on) {
  if (tm.id) underOf.set(tm.id, on);
  tm.roomWant = null;
  $(tm.el.term).classList.toggle('under', on);
}
function blankRun(xt) {
  const b = xt.buffer.active;
  let run = 0,
    most = 0;
  for (let y = 0; y < xt.rows; y++) {
    if (
      b
        .getLine(b.baseY + y)
        ?.translateToString(true)
        .trim()
    )
      run = 0;
    else most = Math.max(most, ++run);
  }
  return most;
}
function roomSoon(tm) {
  if (!tm.roomTimer)
    tm.roomTimer = setTimeout(() => {
      tm.roomTimer = 0;
      checkRoom(tm);
    }, ROOM_MS);
}
function checkRoom(tm) {
  const el = $(tm.el.term);
  if (!tm.id || !tm.xt || el.hidden || !el.matches(UNDER_HEAD)) return;
  if (tm.refits || tm.sizeTimer) return roomSoon(tm); // a refit, a nudge or a repaint under way: the screen is between two sizes
  const fh = parseFloat($('#chat').style.getPropertyValue('--float-h')) || 0,
    cell = $(tm.el.tbody).querySelector('.xterm-screen')?.offsetHeight / tm.xt.rows;
  if (!fh || !(cell > 0)) return;
  const under = el.classList.contains('under'),
    room = blankRun(tm.xt);
  const want = under ? room > ROOM_FULL : room >= Math.ceil(fh / cell) + ROOM_MORE;
  if (want === under) {
    tm.roomWant = null;
    return;
  }
  if (tm.roomWant !== want) {
    tm.roomWant = want;
    return roomSoon(tm);
  }
  setUnder(tm, want);
  fitTerm(tm, true); // the PTY told at once: the repaint at the new size is what fixes the screen
}
// For the next "the drawer looks wrong" report: the numbers that decide the terminal's grid, readable from the
// console (the page's script is one closure, so nothing else in it is). Grid vs body vs what fit would propose.
// A read-only window on this closure for the console and the harness (scripts/scenario.mjs reads it as ctx.peix):
// copies, never the live objects. The page's script is one IIFE, so nothing else in it is reachable.
window.peix = {
  alert: a => onAlert(a), // the harness's: an alert as the stream would bring it (2026-11-01)
  priority: () => [...state.priority], // the pinned chats' order as this page holds it (2026-11-24)
  details: () => detailsText(), // About's Copy details (2026-11-04), its text with no clipboard touched
  skins: () => Object.entries(SKINS).map(([k, t]) => [k, t.dark]), // the picker's themes, each with its appearance (2026-11-01: the inks' check)
  spFall: () => (spFall(true), document.querySelectorAll('#spsky .spfall').length), // Space's falling star, now (2026-11-18): the harness's, which cannot wait the minute
  spVisit: () => (spVisit(true), document.querySelector('#spsky .spvis')?.className || ''), // a planet or comet, now (2026-11-19)
  ze: () => ze, // ⌥⌘Z's game (2026-10-30), live: a scenario drops into its round what it needs to meet
  sea: () => ({
    leaping: !!sea.leap,
    frames: sea.frames || 0,
    running: !!sea.raf,
    resting: sea.rested,
    cell: sea.cell,
  }), // home's sea (2026-10-12)
  // `rendering`: a draw still to come — the list's (renderBoardSoon) and the frames queued after one (2026-10-14: the
  // counts' roll, the fades, the list's ends and timeline, the rings' phase), which ctx.settle() missed
  state: () => ({
    current: state.current,
    snapshots: state.snapshots,
    rendering: !!(
      renderBoardSoon.t ||
      rollSoon.f ||
      fadeSoon.f ||
      listChanged.queued ||
      phaseAnims.queued ||
      terms.some(t => t.hold || t.sizeTimer)
    ),
    project: prefs.project,
    person: prefs.person,
    sessions: state.sessions.size,
    pins: [...state.pins],
    paneVisible: state.paneVisible,
    paneLeft: state.paneLeft,
    fill: state.fill,
    notch: state.notch,
    hidden: [...state.hidden],
    paneGh: Object.fromEntries([...state.paneGh].map(([k, v]) => [k, v.map(pageUrl)])),
    paneTabs: Object.fromEntries([...state.paneGh].map(([k, v]) => [k, [...v]])),
    tab: state.sessions.has(state.current) ? tabOf(state.sessions.get(state.current)) : null,
    tabs: state.sessions.has(state.current) ? tabKeys(state.sessions.get(state.current)) : [],
    pr: shownPr.url,
    split: splitNow(),
    stacked: stackNow(),
    zoomed: zoomed.get(state.current) ?? null,
    focusG,
    halves: state.sessions.has(state.current) ? placeOf(state.sessions.get(state.current)) : [null, null],
    strips: state.sessions.has(state.current)
      ? [0, 1].map(g => keysIn(state.sessions.get(state.current), g))
      : [[], []],
    timeline: {
      k: tl.k,
      want: tl.want,
      press: !!tl.press,
      shown: $('#sessions').classList.contains('tlshow'),
      runs: tl.runs.map(r => ({ g: r.g, day: r.day, n: r.n, i: r.i })),
    },
    termId: curTerm().id,
    termSession: curTerm().sessionId,
    termExited: curTerm().exited,
    reload: reload.want ? { to: reload.want, why: reload.why } : null,
    editor: prefs.editor,
    editors: state.editors,
    audio: audio?.state ?? null,
    swim: {
      n: swim.n,
      pace: swimRate(Math.max(0, swim.n)),
      rate: swim.anim ? +(swimMs(swim.w) / swimLen()).toFixed(3) : 0,
      dart: swim.dart,
      food: swim.food.map(b => b.x),
      eaten: swim.eaten,
    },
  }), // the bar's fish: its pace without a dart, what it has to eat (lane x)
  spMini: tid => sp.minis.get(tid) || null, // Space's hidden xterm of a drawer asking (2026-11-24), live
  session: id => {
    const s = state.sessions.get(id || state.current);
    return s ? structuredClone(s) : null;
  },
  motion: () => MOTION.map(m => ({ ...m })), // the list's last moves: {id, kind: flip | enter | leave, at}
  sessions: () =>
    [...state.sessions.values()].map(s => ({
      id: s.id,
      project: s.project,
      cwd: s.cwd,
      env: s.env || null,
      title: s.title,
      status: s.status,
      alive: s.alive,
      prs: (s.prs || []).length,
      terminal: s.terminal?.id || null,
      agents: s.agents || 0,
      tasks: s.tasks || [],
      ask: s.ask || null,
    })),
  prefs: () => ({ ...prefs }),
  tour: () => ({
    open: $('#tour').open,
    at: tour.i,
    step: tour.steps[tour.i]?.id || null,
    steps: tour.steps.map(t => t.id),
    drawn: tour.drawn,
    parts: tour.els.map(el => {
      const c = el.closest('#slist > .card'),
        cls = [...el.classList].map(k => '.' + k).join('');
      return el.id
        ? '#' + el.id
        : c
          ? `#slist > .card[data-id="${c.dataset.id}"]${c === el ? '' : ' ' + cls}`
          : el.localName + cls;
    }),
  }), // the tour (2026-10-14)
  term: g => window.peixDebug(g),
  fits: g => (terms[g ?? focusG].fitLog || []).slice(),
  grid: g => {
    const tm = terms[g ?? focusG];
    return {
      cols: tm.xt?.cols ?? null,
      rows: tm.xt?.rows ?? null,
      id: tm.id,
      refits: tm.refits || 0,
      hold: tm.hold ? { cols: tm.hold.cols, rows: tm.hold.rows } : null,
    };
  }, // a drawer's grid, reading no layout: lib/framewatch.mjs reads it every frame (2026-11-05)
  screen: g =>
    [...document.querySelectorAll(`${GEL[g ?? focusG].tbody} .xterm-rows > div`)].map(r =>
      r.textContent.replace(/\s+$/, ''),
    ),
  /** The whole buffer, scrollback included — what a row that scrolled off the screen went into. */
  links: (y, g) => (termLinks(terms[g ?? focusG], y) || []).map(l => ({ text: l.text, href: l.href, range: l.range })),
  buffer: g => {
    const b = terms[g ?? focusG].xt?.buffer.active;
    const out = [];
    for (let i = 0; b && i < b.length; i++) out.push(b.getLine(i)?.translateToString(true) || '');
    return out;
  },
};
window.peixDebug = (g = focusG) => {
  const tm = terms[g],
    b = $(tm.el.tbody),
    sc = b.querySelector('.xterm-screen'),
    cs = getComputedStyle(b),
    r = x => Math.round(x * 100) / 100;
  return {
    dpr: devicePixelRatio,
    zoom: prefs.chatZoom,
    cols: tm.xt?.cols,
    rows: tm.xt?.rows,
    propose: tm.fit?.proposeDimensions(),
    body: { w: r(b.clientWidth - parseFloat(cs.paddingLeft)), h: r(b.clientHeight - parseFloat(cs.paddingTop)) },
    screen: sc && { w: r(sc.getBoundingClientRect().width), h: r(sc.getBoundingClientRect().height) },
    ws: tm.ws?.readyState ?? null,
    id: tm.id,
    exited: tm.exited,
    split: splitNow(),
  };
};
// The size a new drawer is started at. No xterm yet (the first ⌥⌘C after a reload) means no measurement, so
// the last one this browser fitted is the guess — a far better one than a fixed 120×30, which every drawer then
// had to grow out of.
const termSize = () => {
  const xt = curTerm().xt || terms[0].xt;
  return xt ? { cols: xt.cols, rows: xt.rows } : { cols: 120, rows: 30, ...(prefs.termSize || {}) };
};
// What the socket replays on attach is the server's byte buffer — capped, cut at a chunk, so it starts wherever the
// drop landed, even inside an escape sequence. Claude Code paints its prompt box and status bar once and then
// rewrites only the cells that change, so a replay that starts after that paint gives blank rules and a status line
// of lone digits (2026-09-20: the 'visual bug after some time', every chat switch re-attaches; reproduced with a
// 1.2 KB cap). A resize makes it repaint the whole screen — ⌘+ did that by hand — so every attach ends with one: a
// row less, then the real size. Only the PTY is resized, xterm here is not; the repaint lands over the replay. The
// socket replays before it reads anything from us, so the order on the wire is replay, then the repaint.
// Two steps with a pause: a resize handler that debounces and compares sizes would see the same size twice
// if both arrived together, and repaint nothing. The second send re-reads the size, in case the layout moved.
// The row-short repaint is never shown (2026-10-11, late afternoon): a chat switched to drew its drawer a row high
// for 150 ms, then dropped it — Claude Code pins its prompt to the bottom of the size it is told. The nudge starts
// once the snapshot is on screen (its first frame, attachTerm), and what the socket brings from then until the true
// size's repaint has come — NUDGE_QUIET_MS with nothing, NUDGE_MAX_MS at most — is held (toXt) and written at once,
// so the xterm parses both repaints together and paints the second.
const NUDGE_QUIET_MS = 60,
  NUDGE_MAX_MS = 600,
  SETTLE_MAX_MS = 2000;
function nudgeTerm(tm) {
  if (!tm.xt || tm.ws?.readyState !== 1) return;
  const ws = tm.ws,
    { cols, rows } = tm.sent || tm.xt; // the size the PTY was told: the grid may be waiting for its repaint (2026-11-05)
  tm.refits = (tm.refits || 0) + 1;
  tm.held ||= [];
  let poll = 0,
    back = 0,
    done = false;
  const release = () => {
    if (done) return;
    done = true;
    clearInterval(poll);
    if (tm.ws === ws) tm.settleUntil = 0;
    unhold(tm);
  };
  ws.send(JSON.stringify({ t: 'resize', cols, rows: Math.max(5, rows - 1) }));
  setTimeout(() => {
    if (tm.ws !== ws || ws.readyState !== 1) return release();
    const g = tm.sent || tm.xt;
    ws.send(JSON.stringify({ t: 'resize', cols: g.cols, rows: g.rows }));
    back = performance.now();
    poll = setInterval(() => {
      const now = performance.now();
      if (now - back > NUDGE_MAX_MS || (now - back > 80 && now - (tm.outAt || 0) > NUDGE_QUIET_MS)) release();
    }, 20);
  }, 150);
}
// The drawer is its half's whole body whenever it shows — the transcript hides under it (placeLog).
function showDrawer(tm, on) {
  $(tm.el.term).hidden = !on;
  requestAnimationFrame(() => fitTerm(tm));
}
function attachTerm(tm, t) {
  detachTerm(tm);
  ensureXterm(tm);
  tm.xt.reset();
  tm.held = []; // what the last socket had waiting behind a refit is that drawer's
  Object.assign(tm, {
    id: t.id,
    sessionId: t.sessionId,
    cwd: t.cwd,
    kind: t.shell ? 'shell' : 'claude',
    exited: t.exited,
    sent: null,
    lost: false,
    settleUntil: performance.now() + SETTLE_MAX_MS,
  });
  setUnder(tm, underOf.get(t.id) ?? !t.resume); // before the first fit: as it was left, a new one under the header
  drawer.err = null;
  showDrawer(tm, true);
  const ws = new WebSocket(keyed(`${location.origin.replace(/^http/, 'ws')}/api/terminals/${t.id}/ws`));
  ws.binaryType = 'arraybuffer';
  tm.ws = ws;
  ws.onopen = () => {
    tm.retry = 0;
    tm.snapped = false;
    fitTerm(tm, true);
    if (tm.g === focusG) tm.xt.focus();
    readFocusFromScreen(tm);
  };
  ws.onmessage = e => {
    if (tm.ws !== ws) return;
    if (typeof e.data !== 'string') {
      const data = new Uint8Array(e.data);
      tm.outAt = performance.now();
      if (tm.hold && (tm.hold.got += data.length) >= REPAINT_BYTES && !tm.sizeTimer) tm.hold.arm(REPAINT_QUIET_MS); // it is coming: until it stops
      if (tm.refits) tm.held.push(data);
      else tm.xt.write(data);
      if (!tm.snapped) {
        tm.snapped = true;
        nudgeTerm(tm);
      } // the screen as the holder has it is up: the repaint, unseen, behind it
      return;
    }
    const m = JSON.parse(e.data);
    if (m.t === 'exit') termEnded(tm, m.code);
    else if (m.t === 'clear') toXt(tm, () => tm.xt.write('', () => tm.xt.clear())); // after what is already queued, or it repaints over the clear (see termhold)
  };
  // The socket dropped with the drawer still running — a server restart, a holder adopted again — or never opened:
  // the drawer is `lost`, and the open chat is synced again a moment later, which attaches anew (2026-10-03: the
  // last screen stayed up, every key went nowhere, and only a reload brought it back). Backing off to 5 s while the
  // server is down; an exit or another chat ends it (attachTerm and detachTerm clear `lost`).
  ws.onclose = () => {
    if (tm.ws !== ws) return;
    tm.ws = null;
    dropHold(tm);
    if (tm.exited !== null || !tm.id) return;
    tm.lost = true;
    tm.retry = (tm.retry || 0) + 1;
    clearTimeout(tm.retryTimer);
    tm.retryTimer = setTimeout(
      () => {
        const s = state.sessions.get(state.current);
        if (tm.lost && s) syncTerm(s);
      },
      Math.min(5000, 250 * 2 ** tm.retry),
    );
  };
}
function detachTerm(tm) {
  dropHold(tm);
  clearTimeout(tm.sizeTimer);
  tm.sizeTimer = 0;
  const ws = tm.ws;
  tm.ws = null;
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  clearTimeout(tm.retryTimer);
  Object.assign(tm, {
    id: null,
    sessionId: null,
    cwd: null,
    kind: null,
    exited: null,
    sent: null,
    lost: false,
    settleUntil: 0,
  });
}
// The process ended: the drawer goes and the transcript is the pane again (a stale chat now — the resume bar shows,
// and waits for its button: the claude was ended, here or by itself, not left).
// A new chat that died before it registered says so where its transcript would be.
function termEnded(tm, code) {
  const wasNew = !tm.sessionId && !state.current;
  focusView.delete(tm.sessionId); // the view was that process's, not the chat's
  underOf.delete(tm.id);
  detachTerm(tm);
  showDrawer(tm, false);
  if (wasNew)
    $('#log').innerHTML =
      `<div class="empty">The terminal ended (exit ${code}) before a chat began — the server log says why.</div>`;
  const s = state.sessions.get(state.current);
  if (s) {
    renderTabs(s);
    renderHead(s);
  }
}
