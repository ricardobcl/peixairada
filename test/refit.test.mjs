// lib/refit.mjs — a terminal that grows keeps what is on it anchored to the bottom.
//
// The bug this locks down (2026-09-22): xterm.js pulls lines back out of the scrollback on a grow only when the
// cursor is on the last line of the buffer. Claude Code's never is — it sits in the prompt box, above three
// status lines — so every grow appended blank rows instead, and the session stayed pinned to the top of a black
// pane for good. The page keeps its own copy of the rule (public/index.html, refitTerm); these cases are the
// reference for both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { refit } from '../lib/refit.mjs';

const { Terminal } = await import('@xterm/headless').then(m => m.default ?? m);
const write = (t, s) => new Promise(r => t.write(s, r));
/** refit, awaited to its `done`: the cursor's return and all. */
const refitted = (t, cols, rows) => new Promise(r => refit(t, rows, () => t.resize(cols, rows), r));

/** A screen with scrollback behind it and a live region at the bottom whose cursor is two rows above the end. */
async function screen({ rows = 24, lines = 100 } = {}) {
  const t = new Terminal({ cols: 80, rows, scrollback: 5000, allowProposedApi: true });
  for (let i = 0; i < lines; i++) await write(t, `L${i}\r\n`);
  await write(t, 'PROMPT\r\nstatus1\r\nstatus2\x1b[2A\x1b[3C');
  return t;
}
const view = t => {
  const b = t.buffer.active, out = [];
  for (let i = 0; i < t.rows; i++) out.push((b.getLine(b.viewportY + i)?.translateToString(true) || '').trim());
  return out;
};
const lastFilled = t => { let last = -1; view(t).forEach((r, i) => { if (r) last = i; }); return last; };

test('a grow pulls the scrollback down: the bottom row still has the live region on it', async () => {
  const t = await screen();
  assert.equal(lastFilled(t), 23, 'the screen starts full');
  await refitted(t, 80, 60);
  assert.equal(lastFilled(t), 59, 'still full after growing by 36 rows');
  assert.equal(view(t)[59], 'status2', 'and it is the live region that is on the bottom row');
  assert.equal(t.buffer.active.cursorY, 57, 'the cursor kept its line — two rows above the end');
});

test('without it xterm appends blank rows instead — the bug, so the test means something', async () => {
  const t = await screen();
  t.resize(80, 60);
  await write(t, '');
  assert.equal(lastFilled(t), 23, 'the session is stuck at the top');
  assert.equal(view(t)[59], '', 'and the bottom 36 rows are blank');
});

test('a shrink is left alone: xterm drops the rows below the cursor, the screen stays full', async () => {
  const t = await screen({ rows: 60, lines: 200 });
  await refitted(t, 80, 20);
  assert.equal(lastFilled(t), 19, 'nothing blank at the bottom');
  // the two status rows below the cursor are what a shrink trims; the SIGWINCH repaint draws them again
  assert.equal(view(t)[19], 'PROMPT', 'the cursor line is the last one kept');
});

test('nothing to pull — no scrollback yet — is a plain resize', async () => {
  const t = new Terminal({ cols: 80, rows: 24, scrollback: 5000, allowProposedApi: true });
  await write(t, 'hello\r\nthere\x1b[1A');
  await refitted(t, 80, 40);
  assert.equal(t.rows, 40);
  assert.equal(lastFilled(t), 1, 'the two lines stay where they are — there is nothing above to pull down');
});

test('grown twice over, the way a window that opens small and then restores does it', async () => {
  const t = await screen({ rows: 20 });
  for (const rows of [30, 45, 71]) await refitted(t, 80, rows);
  assert.equal(t.rows, 71);
  assert.equal(lastFilled(t), 70, 'no blank tail has built up');
  assert.equal(view(t)[70], 'status2');
});

test('done comes once the parked resize has landed, so a shrink that follows a grow is the size that stays', async () => {
  // the holder's order (lib/termhold.mjs, resizeScreen): the next resize waits for the last one's done (2026-10-03)
  const t = await screen();
  const sizes = [];
  await new Promise(done => refit(t, 30, () => t.resize(80, 30), () => { sizes.push([t.cols, t.rows]); refit(t, 8, () => t.resize(70, 8), done); }));
  await write(t, '');
  assert.deepEqual(sizes, [[80, 30]], 'the grow was applied before done');
  assert.deepEqual([t.cols, t.rows], [70, 8], 'the shrink after it is what the screen ends at');
});
