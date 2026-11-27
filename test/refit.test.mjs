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

const { Terminal } = await import('@xterm/headless').then(imported => imported.default ?? imported);
const write = (term, text) => new Promise(resolve => term.write(text, resolve));

/** refit, awaited to its `done`: the cursor's return and all. */
const refitted = (term, cols, rows) =>
  new Promise(resolve => refit(term, rows, () => term.resize(cols, rows), resolve));

/** A screen with scrollback behind it and a live region at the bottom whose cursor is two rows above the end. */
async function screen({ rows = 24, lines = 100 } = {}) {
  const term = new Terminal({ cols: 80, rows, scrollback: 5000, allowProposedApi: true });

  for (let index = 0; index < lines; index++) await write(term, `L${index}\r\n`);
  await write(term, 'PROMPT\r\nstatus1\r\nstatus2\x1b[2A\x1b[3C');
  return term;
}

const view = term => {
  const buffer = term.buffer.active;
  const out = [];

  for (let row = 0; row < term.rows; row++) {
    out.push((buffer.getLine(buffer.viewportY + row)?.translateToString(true) || '').trim());
  }

  return out;
};

const lastFilled = term => {
  let last = -1;

  view(term).forEach((text, row) => {
    if (text) last = row;
  });

  return last;
};

test('a grow pulls the scrollback down: the bottom row still has the live region on it', async () => {
  const term = await screen();

  assert.equal(lastFilled(term), 23, 'the screen starts full');
  await refitted(term, 80, 60);
  assert.equal(lastFilled(term), 59, 'still full after growing by 36 rows');
  assert.equal(view(term)[59], 'status2', 'and it is the live region that is on the bottom row');
  assert.equal(term.buffer.active.cursorY, 57, 'the cursor kept its line — two rows above the end');
});

test('without it xterm appends blank rows instead — the bug, so the test means something', async () => {
  const term = await screen();

  term.resize(80, 60);
  await write(term, '');
  assert.equal(lastFilled(term), 23, 'the session is stuck at the top');
  assert.equal(view(term)[59], '', 'and the bottom 36 rows are blank');
});

test('a shrink is left alone: xterm drops the rows below the cursor, the screen stays full', async () => {
  const term = await screen({ rows: 60, lines: 200 });

  await refitted(term, 80, 20);
  assert.equal(lastFilled(term), 19, 'nothing blank at the bottom');
  // the two status rows below the cursor are what a shrink trims; the SIGWINCH repaint draws them again
  assert.equal(view(term)[19], 'PROMPT', 'the cursor line is the last one kept');
});

test('nothing to pull — no scrollback yet — is a plain resize', async () => {
  const term = new Terminal({ cols: 80, rows: 24, scrollback: 5000, allowProposedApi: true });

  await write(term, 'hello\r\nthere\x1b[1A');
  await refitted(term, 80, 40);
  assert.equal(term.rows, 40);
  assert.equal(lastFilled(term), 1, 'the two lines stay where they are — there is nothing above to pull down');
});

test('grown twice over, the way a window that opens small and then restores does it', async () => {
  const term = await screen({ rows: 20 });

  for (const rows of [30, 45, 71]) await refitted(term, 80, rows);
  assert.equal(term.rows, 71);
  assert.equal(lastFilled(term), 70, 'no blank tail has built up');
  assert.equal(view(term)[70], 'status2');
});

test('done comes once the parked resize has landed, so a shrink that follows a grow is the size that stays', async () => {
  // the holder's order (lib/termhold.mjs, resizeScreen): the next resize waits for the last one's done (2026-10-03)
  const term = await screen();
  const sizes = [];

  await new Promise(done =>
    refit(
      term,
      30,
      () => term.resize(80, 30),
      () => {
        sizes.push([term.cols, term.rows]);
        refit(term, 8, () => term.resize(70, 8), done);
      },
    ),
  );

  await write(term, '');
  assert.deepEqual(sizes, [[80, 30]], 'the grow was applied before done');
  assert.deepEqual([term.cols, term.rows], [70, 8], 'the shrink after it is what the screen ends at');
});

// The page's copy, as it stands in its part of the page (public/js/chat/xterm.js) — run against the same screens (2026-10-14)
const page = await import('node:fs').then(({ readFileSync }) =>
  readFileSync(new URL('../public/js/chat/xterm.js', import.meta.url), 'utf8'),
);

const refitTerm = new Function(
  `return ${page.match(/function refitTerm\(xt, rows, resize, done = \(\) => \{\}\) \{\n[\s\S]*?\n\}\n/)[0]}`,
)();

const pageRefitted = (term, cols, rows) =>
  new Promise(resolve => refitTerm(term, rows, () => term.resize(cols, rows), resolve));

const cursorLine = term => {
  const buffer = term.buffer.active;

  return buffer
    .getLine(buffer.baseY + buffer.cursorY)
    .translateToString(true)
    .trim();
};

test('a scroll region stops the park at its bottom margin: the cursor comes back to its own line, in both copies (2026-10-14)', async () => {
  for (const [name, grow] of [
    ['lib/refit.mjs', refitted],
    ["the page's refitTerm", pageRefitted],
  ]) {
    const term = await screen({ rows: 20, lines: 60 });

    await write(term, '\x1b[1;15r\x1b[8;1H'); // a DECSTBM renderer's region over the top 15 rows, the cursor on row 8 in it
    const before = cursorLine(term);

    await grow(term, 80, 30);

    assert.equal(
      cursorLine(term),
      before,
      `${name}: the cursor is on the line it was on — a CUU of the whole park put it 5 rows up`,
    );
  }
});

test("the page's copy parks from where the cursor is once what was written before has landed (2026-10-14)", async () => {
  const term = await screen({ rows: 20, lines: 60 });

  term.write('\x1b[5A'); // queued, not parsed yet: the cursor read at the call is 5 rows too low
  await pageRefitted(term, 80, 30);
  const ref = await screen({ rows: 20, lines: 60 });

  await write(ref, '\x1b[5A');
  await refitted(ref, 80, 30);

  assert.equal(
    cursorLine(term),
    cursorLine(ref),
    "on the same line as the holder's screen, which reads it behind the queue",
  );

  assert.deepEqual(view(term), view(ref), 'and the same screen');
});
