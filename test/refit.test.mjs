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
  refit(t, 60, () => t.resize(80, 60));
  await write(t, '');
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
  refit(t, 20, () => t.resize(80, 20));
  await write(t, '');
  assert.equal(lastFilled(t), 19, 'nothing blank at the bottom');
  // the two status rows below the cursor are what a shrink trims; the SIGWINCH repaint draws them again
  assert.equal(view(t)[19], 'PROMPT', 'the cursor line is the last one kept');
});

test('nothing to pull — no scrollback yet — is a plain resize', async () => {
  const t = new Terminal({ cols: 80, rows: 24, scrollback: 5000, allowProposedApi: true });
  await write(t, 'hello\r\nthere\x1b[1A');
  refit(t, 40, () => t.resize(80, 40));
  await write(t, '');
  assert.equal(t.rows, 40);
  assert.equal(lastFilled(t), 1, 'the two lines stay where they are — there is nothing above to pull down');
});

test('grown twice over, the way a window that opens small and then restores does it', async () => {
  const t = await screen({ rows: 20 });
  for (const rows of [30, 45, 71]) { refit(t, rows, () => t.resize(80, rows)); await write(t, ''); }
  assert.equal(t.rows, 71);
  assert.equal(lastFilled(t), 70, 'no blank tail has built up');
  assert.equal(view(t)[70], 'status2');
});
