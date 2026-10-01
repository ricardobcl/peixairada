// The chat list's timeline (2026-09-25; pared down 2026-09-26; out of sight until called 2026-09-28): a slim rail over
// the far left of the list, beside its coloured edge, that is the list in miniature — the window as an orange thumb, a
// label per run of one day's cards (in one state group) placed where the run begins. Hidden, the cards have the whole
// width; the pointer held on the coloured edge for a second calls it out, like the Dock, swollen: the days near the
// pointer come out over the cards as labels, the nearest largest, pushed apart so none overlap. Dragged it scrolls the
// list, a day clicked is scrolled to, a wheel over it scrolls; off it, it goes. What this checks is the runs, where the
// labels and the thumb sit against the list, the rail's place and its thumb's look, the call and the going, the swell,
// the three ways of moving the list from the rail, a query (no days) and the rail of squares (no timeline).
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeFixture } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

const pad2 = n => String(n).padStart(2, '0');
const noonBack = n => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d; };
const railDay = n => { const d = noonBack(n), dm = `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}`; return n < 7 ? `${d.toLocaleDateString('en', { weekday: 'short' })} ${dm}` : d.getFullYear() === new Date().getFullYear() ? dm : `${dm}-${d.getFullYear()}`; };
const settled = (ctx, k) => ctx.waitFor(`window.peix.state().timeline.k === ${k}`, { what: `the swell at ${k}` });
const move = (ctx, x, y) => ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) });
// Where everything on the rail is, and where the list says it should be: a label's middle against its run's first
// card, both as a fraction of the whole (the rail's inner height, the list's scroll height). At rest a label is placed
// where its run is, unwarped, only kept inside the rail by half its height — so the first run's sits a few px low.
const rail = ctx => ctx.evaluate(`(() => {
  const r = document.querySelector('#tline'), l = document.querySelector('#slist'), rr = r.getBoundingClientRect(), PAD = 6, H = r.clientHeight - 2 * PAD;
  const cards = [...l.querySelectorAll(':scope > .card')], runs = window.peix.state().timeline.runs;
  const frac = el => (parseFloat(el.style.top) - PAD) / H;
  const th = r.querySelector('.tl-thumb'), ts = getComputedStyle(th);
  const labY = el => (parseFloat(/translateY\\(([-\\d.]+)px\\)/.exec(el.style.transform)?.[1] ?? NaN) + 8.5 - PAD) / H;
  const labs = [...r.querySelectorAll('.tl-labs .tl-lab')].map((el, i) => { const b = el.getBoundingClientRect(); return { on: el.classList.contains('on'), near: el.classList.contains('near'), text: el.textContent, top: b.top, bottom: b.bottom, h: b.height, run: +el.dataset.run, at: labY(el), want: cards[runs[i].i].offsetTop / l.scrollHeight }; });
  return JSON.stringify({ rect: rr.toJSON(), H, runs, drawn: r.querySelectorAll('.tl-tick, .tl-seg, .tl-base').length,
    thumb: th.hidden ? null : { at: frac(th), len: parseFloat(th.style.height) / H, want: l.scrollTop / l.scrollHeight, wantLen: l.clientHeight / l.scrollHeight, width: th.getBoundingClientRect().width, color: ts.backgroundColor, spend: getComputedStyle(document.documentElement).getPropertyValue('--spend').trim() },
    labs, scroll: l.scrollTop, full: l.scrollHeight, view: l.clientHeight });
})()`).then(JSON.parse);

export default async function (ctx) {
  const out = {};
  const cwd = join(tmpdir(), 'peix-tline', 'tline-repo');
  const long = 'A reply long enough to give the card its three lines, so that fifteen of them run the list well past the bottom of the window.';
  const now = Date.now();
  const chat = (title, at) => ({ cwd, title, prompt: `${title}: tell me more, at a length that fills a line or two of the card`, reply: long, at });
  const { chats } = makeFixture(ctx.fixture.dir, [
    chat('Today one', new Date(now - 60_000)), chat('Today two', new Date(now - 120_000)), chat('Today three', new Date(now - 180_000)),
    chat('Three days back, a', noonBack(3)), chat('Three days back, b', new Date(noonBack(3).getTime() + 60_000)),
    chat('Three days back, c', new Date(noonBack(3).getTime() + 120_000)), chat('Three days back, d', new Date(noonBack(3).getTime() + 180_000)),
    chat('Ten days back, a', noonBack(10)), chat('Ten days back, b', new Date(noonBack(10).getTime() + 60_000)), chat('Ten days back, c', new Date(noonBack(10).getTime() + 120_000)),
    chat('Twenty days back, a', noonBack(20)), chat('Twenty days back, b', new Date(noonBack(20).getTime() + 60_000)),
    chat('Done long ago', noonBack(12)), chat('Done too', new Date(noonBack(12).getTime() + 60_000)),
  ]);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 16`, { what: 'the fourteen chats and the fixture\'s two' });
  for (const c of chats.slice(-2)) await ctx.server.api(`api/sessions/${c.id}/done`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ done: true }) });
  await ctx.key('KeyP');
  await ctx.evaluate(`(() => { const q = document.querySelector('#pickq'); q.value = 'tline-repo'; q.dispatchEvent(new Event('input', { bubbles: true })); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 14 && document.querySelectorAll('#slist > .card.done').length === 2`, { what: 'the list narrowed to the fourteen, two of them done' });
  await ctx.sleep(300); await ctx.settle();

  // the runs: a day and a state group in a row each — ready by your last touch, then the done ones
  out.at = await rail(ctx);
  ctx.assert.deepEqual(out.at.runs.map(r => [r.g, r.n]), [['ready', 3], ['ready', 4], ['ready', 3], ['ready', 2], ['done', 2]], 'five runs: four days of ready chats, then the done ones');
  ctx.assert.equal(out.at.labs.length, 5, 'a label for each run');
  for (const l of out.at.labs) ctx.assert.ok(Math.abs(l.at - l.want) < .006, `a label sits where its run begins in the list (${l.at.toFixed(3)} against ${l.want.toFixed(3)})`);
  ctx.assert.ok(out.at.thumb && Math.abs(out.at.thumb.at - out.at.thumb.want) < .004 && Math.abs(out.at.thumb.len - out.at.thumb.wantLen) < .004, 'the thumb is the window');
  ctx.assert.ok(out.at.labs.every(l => !l.on), 'no labels at rest');
  ctx.assert.equal(out.at.drawn, 0, 'no track and no ticks: the thumb is all there is at rest (2026-09-26)');
  // the rail at the far left, 12 px beside the list's coloured edge, over the cards — 8 px on from that edge, as on the
  // right (2026-09-28, later) — and out of sight; the thumb in the board's orange, 5 px wide until pointed at, then 8
  const place = await ctx.evaluate(`(() => { const s = document.querySelector('#sessions').getBoundingClientRect(), t = document.querySelector('#tline'), r = t.getBoundingClientRect(), c = document.querySelector('#slist > .card').getBoundingClientRect(); return JSON.stringify({ edge: r.left - s.left, width: r.width, card: c.left - s.left, seen: getComputedStyle(t).visibility, shown: window.peix.state().timeline.shown }); })()`).then(JSON.parse);
  ctx.assert.deepEqual(place, { edge: 4, width: 12, card: 12, seen: 'hidden', shown: false }, `the rail over the cards' edge, out of sight (${JSON.stringify(place)})`);
  const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  ctx.assert.equal(out.at.thumb.color, rgb(out.at.thumb.spend), `the thumb is the board's orange (${out.at.thumb.color} for ${out.at.thumb.spend})`);
  ctx.assert.equal(out.at.thumb.width, 5, 'a 5 px pill at rest');
  await ctx.shot('rest', { x: 0, y: 0, width: 420, height: 920 });

  // called out: the pointer on the coloured edge — not straight away, after a second held there
  const x = out.at.rect.left + 6, yOf = (r, i) => r.rect.top + 6 + r.labs[i].at * r.H;
  await move(ctx, 1, yOf(out.at, 2));
  await ctx.sleep(500);
  ctx.assert.equal(await ctx.evaluate(`window.peix.state().timeline.shown`), false, 'not at once');
  await ctx.waitFor(`window.peix.state().timeline.shown`, { what: 'the rail called out by a second on the edge' });
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#tline')).visibility`), 'visible');
  // pointed at, over the third run's tick: labels come out, that one nearest and largest, none overlapping
  await move(ctx, x, yOf(out.at, 2));
  await settled(ctx, 1);
  out.hover = await rail(ctx);
  ctx.assert.equal(out.hover.thumb.width, 8, 'the thumb widens under the pointer');
  const shown = out.hover.labs.filter(l => l.on).sort((a, b) => a.top - b.top);
  ctx.assert.ok(shown.length >= 3, `several days out (${shown.length})`);
  const near = out.hover.labs.find(l => l.near);
  ctx.assert.equal(near?.run, 2, 'the one under the pointer is the nearest');
  ctx.assert.equal(near.text, `${railDay(10)} · 3 ready`, 'a label says its day, how many and in which state');
  ctx.assert.ok(shown.every(l => l.h <= near.h + .5) && shown.some(l => l.h < near.h - 2), 'the nearest is the largest, the others smaller');
  for (let i = 1; i < shown.length; i++) ctx.assert.ok(shown[i].top >= shown[i - 1].bottom - .5, 'no two labels overlap');
  ctx.assert.deepEqual(out.hover.labs.filter(l => l.on).map(l => l.run).sort(), [0, 1, 2, 3, 4].filter(i => out.hover.labs[i].on), 'labels keep their runs');
  ctx.assert.ok(out.hover.labs.some(l => l.text === `today · 3 ready`), 'today is today');
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('.tl-glass')).opacity`), '1', 'the glass is over the cards while the days are out');
  await ctx.shot('swell', { x: 0, y: 0, width: 420, height: 920 });

  // out among the labels, in the gap between two of them: still the rail — the days stay out (2026-09-25) — and a click
  // there goes to the day ringed as nearest
  const below = shown.find(l => l.top > near.bottom + 4);
  const gap = { x: out.at.rect.left + 70, y: (near.bottom + below.top) / 2 };
  await move(ctx, gap.x, gap.y);
  await ctx.sleep(400);
  out.gap = await ctx.evaluate(`JSON.stringify({ want: window.peix.state().timeline.want, k: window.peix.state().timeline.k, on: document.querySelectorAll('#tline .tl-labs .tl-lab.on').length, under: document.elementFromPoint(${gap.x}, ${gap.y})?.className, near: +document.querySelector('#tline .tl-lab.near')?.dataset.run })`).then(JSON.parse);
  ctx.assert.deepEqual({ want: out.gap.want, k: out.gap.k }, { want: 1, k: 1 }, 'the days stay out with the pointer between two labels');
  ctx.assert.equal(out.gap.under, 'tl-catch', 'the gap is the rail\'s');
  ctx.assert.ok(out.gap.on >= 3, 'every label still out');
  await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(gap.x), y: Math.round(gap.y), button: 'left', buttons: 1, clickCount: 1 });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(gap.x), y: Math.round(gap.y), button: 'left', buttons: 0, clickCount: 1 });
  const gapWant = await ctx.evaluate(`(l => Math.min(l.scrollHeight - l.clientHeight, [...l.querySelectorAll(':scope > .card')][window.peix.state().timeline.runs[${out.gap.near}].i].offsetTop - 30))(document.querySelector('#slist'))`);
  await ctx.waitFor(`Math.abs(document.querySelector('#slist').scrollTop - ${gapWant}) < 2`, { what: 'the list at the ringed day, from a click in the gap' });
  await ctx.evaluate(`document.querySelector('#slist').scrollTop = 0`);
  // …and past the furthest label's right edge, it is the cards again: the days go in, and the rail goes a moment later
  await move(ctx, out.at.rect.left + 330, gap.y);
  await settled(ctx, 0);
  await ctx.waitFor(`!window.peix.state().timeline.shown && getComputedStyle(document.querySelector('#tline')).visibility === 'hidden'`, { what: 'the rail gone again' });
  // the window's own left edge, over the list's coloured edge: held there, it calls the rail, which then covers it
  await move(ctx, 0, out.at.rect.top + out.at.rect.height / 2);
  await settled(ctx, 1);
  ctx.assert.equal(await ctx.evaluate(`document.elementFromPoint(0, ${Math.round(out.at.rect.top + out.at.rect.height / 2)})?.className`), 'tl-catch', 'x = 0 is the rail\'s');
  await move(ctx, x, yOf(out.at, 2));
  await ctx.sleep(300);

  // a click on that label: its first card to the top of the list, under the top pill
  await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: out.at.rect.right + 30, y: (near.top + near.bottom) / 2, button: 'left', buttons: 1, clickCount: 1 });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: out.at.rect.right + 30, y: (near.top + near.bottom) / 2, button: 'left', buttons: 0, clickCount: 1 });
  const want = await ctx.evaluate(`Math.min(document.querySelector('#slist').scrollHeight - document.querySelector('#slist').clientHeight, [...document.querySelectorAll('#slist > .card')][window.peix.state().timeline.runs[2].i].offsetTop - 30)`);
  await ctx.waitFor(`Math.abs(document.querySelector('#slist').scrollTop - ${want}) < 2`, { what: 'the list at the ten-days-back run' });
  out.clicked = await ctx.evaluate(`document.querySelector('#slist > .card:nth-child(1)') && [...document.querySelectorAll('#slist > .card')].find(c => c.getBoundingClientRect().top >= document.querySelector('#slist').getBoundingClientRect().top + 8)?.querySelector('.title').textContent`);
  ctx.assert.match(out.clicked, /^Ten days back/, 'the first card fully in view is that day\'s');

  // a drag on the thumb: the list follows the pointer, to scale
  await ctx.evaluate(`document.querySelector('#slist').scrollTop = 0`); await ctx.sleep(100);
  // (from the list's own numbers: what the rail draws is swollen round the pointer, and only the pointer's own spot is true)
  const railAt = (r, v) => r.rect.top + 6 + v / r.full * r.H;
  const a = await rail(ctx), ty = railAt(a, a.scroll + a.view / 2);
  await ctx.drag({ x: Math.round(x), y: Math.round(ty) }, { x: Math.round(x), y: Math.round(ty + 120) });
  const b = await rail(ctx);
  ctx.assert.ok(Math.abs(b.scroll - 120 / a.H * a.full) < 6, `dragging the thumb 120 px scrolls the list 120/H of itself (${Math.round(b.scroll)} against ${Math.round(120 / a.H * a.full)})`);
  // a press on the track far from the thumb: the thumb comes to it, centred
  const far = a.rect.top + 6 + .8 * a.H;
  await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x), y: Math.round(far), button: 'left', buttons: 1, clickCount: 1 });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x), y: Math.round(far), button: 'left', buttons: 0, clickCount: 1 });
  const c = await rail(ctx), mid = railAt(c, c.scroll + c.view / 2);
  ctx.assert.ok(Math.abs(mid - far) < 3 || c.scroll >= c.full - c.view - 1, 'a press on the track brings the thumb to it');
  // a wheel over the rail scrolls the list
  await ctx.evaluate(`document.querySelector('#slist').scrollTop = 0`); await ctx.sleep(100);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(x), y: Math.round(far), deltaX: 0, deltaY: 300 });
  await ctx.waitFor(`document.querySelector('#slist').scrollTop > 100`, { what: 'the wheel over the rail scrolling the list' });

  // away from the rail: the labels go back in, and the rail goes
  await move(ctx, 900, 400);
  await settled(ctx, 0);
  ctx.assert.ok((await rail(ctx)).labs.every(l => !l.on), 'no labels once the pointer has left');
  await ctx.waitFor(`getComputedStyle(document.querySelector('.tl-glass')).opacity === '0'`, { what: 'the glass gone' });
  await ctx.waitFor(`!window.peix.state().timeline.shown`, { what: 'the rail gone' });
  // the pointer passing over the edge without stopping calls nothing
  await move(ctx, 1, 400); await ctx.sleep(300); await move(ctx, 200, 400); await ctx.sleep(900);
  ctx.assert.equal(await ctx.evaluate(`window.peix.state().timeline.shown`), false, 'a pass over the edge is not a call');
  await ctx.shot('hidden', { x: 0, y: 0, width: 420, height: 920 });

  // a query orders the list by the match: no days to show, the thumb alone
  await ctx.key('KeyF');
  await ctx.evaluate(`(q => { q.value = 'back'; q.dispatchEvent(new Event('input', { bubbles: true })); })(document.querySelector('#q'))`);
  await ctx.waitFor(`window.peix.state().timeline.runs.length === 0`, { what: 'no runs under a query' });
  await ctx.sleep(100);
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#tline .tl-labs .tl-lab').length`), 0, 'and no labels');
  await ctx.evaluate(`document.querySelector('#q').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await ctx.waitFor(`window.peix.state().timeline.runs.length === 5`, { what: 'the runs back' });

  // folded to the rail of squares: no timeline, and the squares have the column
  await ctx.cmd('KeyB');
  await ctx.waitFor(`document.querySelector('#main').classList.contains('scompact')`, { what: 'the rail of squares' });
  out.folded = await ctx.evaluate(`JSON.stringify({ shown: getComputedStyle(document.querySelector('#tline')).display, list: Math.round(document.querySelector('#slist').getBoundingClientRect().left - document.querySelector('#sessions').getBoundingClientRect().left) })`).then(JSON.parse);
  ctx.assert.deepEqual(out.folded, { shown: 'none', list: 4 }, 'no timeline on the folded list, and the squares start at its edge');
  await ctx.cmd('KeyB');
  return out;
}
