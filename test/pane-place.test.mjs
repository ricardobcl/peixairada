// The verdict of the real shell's check (2026-11-04): what `npm run shell` believes of a window's pixels, here with no window.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inkOf, pagePlaced, STRIP_INK } from '../lib/paneplace.mjs';

const INK = inkOf('ff00ff'), DARK = [28, 28, 26];
const strip = { left: 700, top: 54, width: 500, height: 38 }, body = { left: 700, top: 92, width: 500, height: 691 };
/** A column and a row as a window would give them: the page's y = 0 `inset` pt down, the view `off` pt off where it belongs. */
const look = ({ inset = 32, off = 0, zoom = 1, ink = INK, height = 900 } = {}) => {
  const barAt = inset + strip.top * zoom, barLen = strip.height * zoom, h = body.height * zoom, at = barAt + barLen + off;
  return {
    strip, body, zoom, ink: INK,
    down: [{ c: DARK, at: 0, len: barAt }, { c: STRIP_INK, at: barAt, len: Math.max(0, at - barAt) }, { c: ink, at, len: h }, { c: DARK, at: at + h, len: height - at - h }].filter(r => r.len > 0),
    across: [{ c: DARK, at: 0, len: body.left * zoom }, { c: ink, at: body.left * zoom, len: body.width * zoom }],
  };
};

test('a page right under its strip, down to its half\'s foot, is placed, and says where the page starts', () => {
  const v = pagePlaced(look());
  assert.deepEqual(v.problems, []);
  assert.equal(v.ok, true);
  assert.equal(v.seen.pageStarts, 32);
  assert.equal(pagePlaced(look({ inset: 0 })).seen.pageStarts, 0, 'the fill');
  assert.equal(pagePlaced(look({ zoom: 1.25 })).ok, true, 'zoomed: the page\'s CSS px in points');
});

test('the page over its strip: the bug this is for, 32 pt too high in a window', () => {
  const v = pagePlaced(look({ off: -32 }));
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /the strip shows 6 of its 38 pt: the page is over it/);
});

test('the page wholly over its strip, none of it left', () => {
  const v = pagePlaced(look({ off: -38 }));
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /no strip above the page/);
});

test('a gap under the strip, a page short of its foot, a page in the wrong place across', () => {
  const gap = look(), at = gap.down.findIndex(r => r.c === INK);
  gap.down.splice(at, 0, { c: DARK, at: gap.down[at].at, len: 10 }); gap.down[at + 1].at += 10;
  assert.match(pagePlaced(gap).problems[0], /10 pt between the strip's foot and the page/);
  const short = look(); short.down.find(r => r.c === INK).len -= 32;
  assert.match(pagePlaced(short).problems[0], /659 pt tall, its half's body 691/);
  const aside = look(); aside.across = [{ c: DARK, at: 0, len: 640 }, { c: INK, at: 640, len: 500 }];
  assert.match(pagePlaced(aside).problems[0], /starts 640 pt in, its half's body 700/);
});

test('no page at all says so, whatever else is in the column', () => {
  const v = pagePlaced({ ...look(), ink: inkOf('00ff00') });
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /nowhere in the half/);
});
