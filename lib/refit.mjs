// Resizing a terminal the way an emulator with history should (2026-09-22).
//
// xterm.js only pulls lines back out of the scrollback when the screen grows if the cursor is sitting on the
// *last* line of the buffer. Claude Code's cursor is not: its live region is a box with the prompt in it and
// three status lines under it, and the cursor stays in the box. So a screen that grows — the board's drawer is
// fitted to its pane, and a window that opens small and then restores its size grows it by dozens of rows —
// appends that many blank lines at the bottom instead, and the whole session stays pinned to the top of the
// screen with black underneath it, for good (2026-09-22). Real terminals anchor what is on screen to the bottom.
//
// The trick is to park the cursor on the last line of the buffer for the length of the resize: xterm then takes
// the scrollback path, moves the cursor down with the content it pulled in, and the same number of rows up puts
// it back on the line it was on. Only a grow needs it — shrinking already scrolls rather than trims.
//
// The page keeps its own copy of this (public/index.html has no build step); keep the two in step by hand.

/**
 * @param term    an xterm Terminal (headless or not)
 * @param rows    the height it is about to become — the parking is only worth it when that is taller
 * @param resize  does the actual resize (term.resize, or the fit addon's fit(), which clears the renderer too)
 */
export function refit(term, rows, resize) {
  const b = term.buffer.active;
  // rows between the cursor and the end of the buffer, never past the bottom of the screen (CUD stops there,
  // and a CUU that did not match it would leave the cursor on the wrong line)
  const tail = rows > term.rows && b.baseY > 0
    ? Math.max(0, Math.min(b.length - 1 - (b.baseY + b.cursorY), term.rows - 1 - b.cursorY))
    : 0;
  if (!tail) return void resize();
  // Through write(cb), like every other read of a screen here: xterm parses what it is given on its own
  // schedule, and a resize straight after a write lands before the write is applied.
  term.write(`\x1b[${tail}B`, () => { resize(); term.write(`\x1b[${tail}A`); });
}
