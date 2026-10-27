// The header's PR list as a window (2026-10-21): the timeline up top, centred — the list's own way to it, ⌥⌘J's —, every
// row in a box that scrolls (no "… n more" any more), and its two ends saying what is out of sight past them as the chat
// list's do: "↓ n more" on a fog, a click scrolling a window's worth, a dot in the accent when one out there is at your
// move. The fixture's two-PR chat is given fourteen more in your words — Claude's listing of them would be no PR of
// the chat's (2026-10-27) —, which the fake gh titles. What this checks: the button's
// place and its tab; every row there, the window shorter than they are; the ends' counts as it scrolls, by a pill and by
// a scroll; the dot; a redraw of the rows keeping the window's place; the foot dragged to size the window (2026-10-21,
// later), kept, and given back by a double-click.
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';
import { randomUUID } from 'node:crypto';
import { replyLines } from '../fixture.mjs';

const file = join(tmpDir('peix-prwin-'), 'prs.json'), MORE = Array.from({ length: 14 }, (_, i) => 20 + i);
writeFileSync(file, JSON.stringify(Object.fromEntries([12, 13, ...MORE].map(n => [`acme/repo-a#${n}`, { state: n % 5 ? 'OPEN' : 'MERGED', title: `Change number ${n}` }]))));

export const meta = { server: true, fixture: 'auto', prefs: { prsOpen: true }, env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, PR_TTL_MS: '300' } };

export default async function (ctx) {
  const [two] = ctx.fixture.chats, out = {}, a = ctx.assert;
  const yours = { type: 'user', isSidechain: false, cwd: two.cwd, sessionId: two.id, uuid: randomUUID(), timestamp: new Date().toISOString(),
    message: { role: 'user', content: [{ type: 'text', text: `And the rest: ${MORE.map(n => `https://github.com/acme/repo-a/pull/${n}`).join(' ')}` }] } };
  appendFileSync(two.file, [yours, ...replyLines({ id: two.id, cwd: two.cwd, text: 'Noted.' })].map(l => JSON.stringify(l)).join('\n') + '\n');
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelectorAll('#prScroll .prrow').length === 16 && ![...document.querySelectorAll('#prScroll .prrow .t')].some(t => t.classList.contains('pending'))`, { timeout: 15_000, what: 'sixteen rows, titled' });
  await ctx.settle();
  const look = () => ctx.evaluate(`JSON.stringify((() => {
    const sc = document.querySelector('#prScroll'), pl = document.querySelector('#prlist'), b = document.querySelector('#prTl'), r = b.getBoundingClientRect(), l = pl.getBoundingClientRect(), w = sc.getBoundingClientRect();
    const edge = q => { const e = pl.querySelector('.pedge.' + q); return e.classList.contains('on') ? e.textContent.trim() + (e.querySelector('i.you') ? ' •' : '') : null; };
    return { top: sc.scrollTop, ch: sc.clientHeight, sh: sc.scrollHeight, up: edge('up'), down: edge('down'), more: !!pl.querySelector('#prMore, .more'),
      btn: { centre: Math.round(r.left + r.width / 2 - (l.left + l.width / 2)), above: r.bottom <= w.top, text: b.textContent }, rows: sc.querySelectorAll('.prrow').length };
  })())`).then(JSON.parse);

  // the button up top, centred; the window shorter than its rows; the lower end counting what is past it
  out.first = await look();
  a.deepEqual([out.first.btn.text, out.first.btn.above, out.first.more], ['Timeline⌥⌘J', true, false], `the timeline up top, no "more": ${JSON.stringify(out.first)}`);
  a.ok(Math.abs(out.first.btn.centre) <= 1, `…centred (${out.first.btn.centre} px off)`);
  a.ok(out.first.sh > out.first.ch + 40 && out.first.rows === 16, `every row there, the window shorter: ${out.first.ch} of ${out.first.sh}`);
  a.equal(out.first.up, null, 'nothing above at the top');
  a.match(out.first.down, /^↓ \d+ more$/, 'the rest counted below');
  const below = +out.first.down.match(/\d+/)[0];
  a.ok(below >= 3 && below < 16, `${below} below`);
  await ctx.shot('1-window', await ctx.evaluate(`(r => ({ x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8 }))(document.querySelector('#prlist').getBoundingClientRect())`));

  // the foot is the list's handle (2026-10-21, later): dragged up, the window shorter, and kept; dragged down past the
  // rows, as tall as they are; a double-click its own height again — the arrow in the foot still a click
  const sh = () => ctx.evaluate(`Math.round(document.querySelector('#prScroll').getBoundingClientRect().height)`);
  const drag = async dy => {
    const grip = await ctx.evaluate(`(r => ({ x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) }))(document.querySelector('#prlist .pfoot').getBoundingClientRect())`);   // where the foot is now
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: grip.x, y: grip.y });
    await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: grip.x, y: grip.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 5; i++) await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: grip.x, y: grip.y + dy * i / 5, button: 'left', buttons: 1 });
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: grip.x, y: grip.y + dy, button: 'left', clickCount: 1 });
    await ctx.settle();
  };
  out.h0 = await sh();
  a.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#prlist .pfoot')).cursor`), 'ns-resize', 'the foot says it resizes');
  await drag(-80);
  out.h1 = await sh();
  a.ok(Math.abs(out.h1 - (out.h0 - 80)) <= 2, `dragged up 80 px: ${out.h0} → ${out.h1}`);
  a.equal(await ctx.evaluate(`window.peix.prefs().prsHeight`), out.h1, 'kept as a pref');
  a.match((await look()).down, /^↓ \d+ more$/, 'more below, counted again');
  await drag(400);
  out.h2 = await sh();
  a.ok(out.h2 > out.h0 && out.h2 <= out.first.sh + 1, `dragged down past the rows: ${out.h2}, as tall as they are (${out.first.sh})`);
  a.equal((await look()).down, null, 'nothing below');
  await ctx.evaluate(`document.querySelector('#prlist .pfoot').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await ctx.settle();
  a.deepEqual([await sh(), await ctx.evaluate(`window.peix.prefs().prsHeight`)], [out.h0, null], 'a double-click: its own height again');
  await drag(-80);
  await ctx.reload();
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelectorAll('#prScroll .prrow').length === 16`, { what: 'the rows again' });
  await ctx.settle();
  a.equal(await sh(), out.h1, 'the height outlives a reload');
  await ctx.evaluate(`document.querySelector('#prlist .pfoot').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await ctx.settle();

  // the lower pill: a window's worth down, the upper one on
  const pill = q => ctx.evaluate(`(r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }))(document.querySelector('#prlist .pedge.${q} button').getBoundingClientRect())`);
  const click = async p => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, ...type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 } }); };
  await click(await pill('down'));
  await ctx.waitFor(`document.querySelector('#prlist .pedge.up').classList.contains('on')`, { what: 'the upper end on' });
  await ctx.sleep(500);
  out.down = await look();
  a.ok(out.down.top > 0, 'scrolled down');
  a.match(out.down.up, /^↑ \d+ more$/, 'what scrolled away counted above');

  // to the bottom: nothing below; one up there at your move wears the dot
  await ctx.evaluate(`(sc => sc.scrollTop = sc.scrollHeight)(document.querySelector('#prScroll'))`);
  await ctx.waitFor(`!document.querySelector('#prlist .pedge.down').classList.contains('on')`, { what: 'nothing below at the bottom' });
  await ctx.evaluate(`document.querySelector('#prScroll .prrow').dataset.turn = 'you'; document.querySelector('#prScroll').dispatchEvent(new Event('scroll'))`);
  await ctx.waitFor(`!!document.querySelector('#prlist .pedge.up i.you')`, { what: 'the dot for a PR at your move above' });
  await ctx.settle();
  out.bottom = await look();
  a.match(out.bottom.up, /^↑ \d+ more •$/);
  // the copy mark next to an open PR's name is the mark's grey, not the state's green (its sheets are an .ic.st, as the
  // state's word is a .st)
  out.mark = await ctx.evaluate(`(c => [getComputedStyle(c.querySelector('.cp')).stroke, getComputedStyle(c).color, getComputedStyle(c.closest('.prrow').querySelector(':scope > .st')).color])(document.querySelector('#prScroll .prrow[data-state="open"] .prcopy'))`);
  a.equal(out.mark[0], out.mark[1], `the sheets in the mark's colour: ${out.mark}`);
  a.notEqual(out.mark[0], out.mark[2], 'not the state\'s');
  await ctx.shot('2-bottom', await ctx.evaluate(`(r => ({ x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8 }))(document.querySelector('#prlist').getBoundingClientRect())`));

  // a redraw of the rows — the last PR taken off the chat — keeps the window where it was, not back at the top
  await ctx.evaluate(`document.querySelector('#prScroll').scrollTop = 60`);
  await ctx.sleep(200);
  await ctx.server.post(`api/sessions/${two.id}/unlink`, { url: 'https://github.com/acme/repo-a/pull/33' });
  await ctx.waitFor(`document.querySelectorAll('#prScroll .prrow').length === 15`, { what: 'the rows redrawn, one fewer' });
  out.redrawn = await look();
  a.equal(out.redrawn.top, 60, 'the window kept its place');

  // the button: the timeline on its tab
  await ctx.evaluate(`document.querySelector('#prTl').click()`);
  await ctx.waitFor(`window.peix.state().tab === 'timeline' && !document.querySelector('#tv').hidden`, { what: 'the timeline tab' });
  return out;
}
