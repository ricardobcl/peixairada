// The card's PRs as a stack (2026-10-04). GitHub is the fake gh. Three chats: one on eight PRs, one on two PRs in the
// same state, one on a single PR. What this checks: at rest the chips lie one under the other at the row's end, the
// first on top, three under it 5 px further left each — a sliver of each shows, and only the top one's number — and
// the other four under the third; the stack takes the top chip's width and the slivers, no more. The pointer on it fans
// them all out side by side — sliding, the box with them —, the top chip where it was, every one in sight readable and
// on top where it stands, the ✓ moved left by what the fan took and the folder's name untouched; eight are more than
// the row holds, so the fan scrolls: a wheel turned over it goes deeper (leftwards) and the list under it stays put, a
// sideways swipe too; the deepest PR scrolled into sight opens on a click. The pointer gone, the fan is back at its
// start and the stack as it was. Two chips of one colour still read as two (an edge between them). A lone chip is its
// own width and does not move. Under reduced motion the fan is at once.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';
import { makeFixture } from '../fixture.mjs';

const dir = tmpDir('peix-stack-'), file = join(dir, 'prs.json');
const MANY = [101, 102, 103, 104, 105, 106, 107, 108], STATES = [{ state: 'OPEN' }, { state: 'MERGED' }, { state: 'CLOSED' }, { state: 'OPEN', isDraft: true }];
writeFileSync(file, JSON.stringify({
  ...Object.fromEntries(MANY.map((n, i) => [`acme/app#${n}`, { ...STATES[i % 4], title: `Many ${n}` }])),
  'acme/app#201': { state: 'OPEN', title: 'Pair one' }, 'acme/app#202': { state: 'OPEN', title: 'Pair two' },
  'acme/app#301': { state: 'MERGED', title: 'Alone' },
}));

export const meta = { server: true, fixture: 'auto', env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file } };

const pull = n => `https://github.com/acme/app/pull/${n}`;

export default async function (ctx) {
  const out = {}, cwd = join(dir, 'stack-repo'), now = Date.now();
  const { chats: [many, pair, lone] } = makeFixture(ctx.fixture.dir, [
    { cwd, title: 'On eight', prompt: `look at ${MANY.map(pull).join(' ')}`, reply: 'looked', at: new Date(now - 60_000) },
    { cwd, title: 'On a pair', prompt: `look at ${pull(201)} and ${pull(202)}`, reply: 'looked', at: new Date(now - 120_000) },
    { cwd, title: 'On one', prompt: `look at ${pull(301)}`, reply: 'looked', at: new Date(now - 180_000) },
  ]);
  const card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`, stack = `${card(many.id)}.querySelector('.tprs')`;
  await ctx.waitFor(`${card(many.id)}?.querySelectorAll('.tprs > .cpr[data-state]:not([data-state=""])').length === ${MANY.length} && ${card(pair.id)}?.querySelector('.tprs > .cpr[data-state="open"]') && ${card(lone.id)}?.querySelector('.tprs > .cpr[data-state="merged"]')`, { timeout: 20_000, what: 'the PR states from the fake gh' });
  await ctx.evaluate(`window.open = url => { (window.__opened ||= []).push(url); return null; }`);
  await ctx.settle();

  /** Every chip of a card's stack: where it is, how wide, whether it is what the pointer finds at its middle and at its
   *  sliver, and whether its number shows; the stack's box and its scroll, the ✓'s left edge, the folder name's width. */
  const look = id => ctx.evaluate(`JSON.stringify((c => {
    const box = e => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), y: Math.round(r.top + r.height / 2) }; };
    const t = c.querySelector('.tprs'), chips = [...t.children];
    return { tprs: box(t), scroll: { left: Math.round(t.scrollLeft), over: t.scrollWidth > t.clientWidth }, act: Math.round(c.querySelector('.top .act').getBoundingClientRect().left),
      row: Math.round(c.querySelector('.top').getBoundingClientRect().right), repo: Math.round(c.querySelector('.top .repo')?.getBoundingClientRect().width ?? -1), list: Math.round(document.querySelector('#slist').scrollTop),
      chips: chips.map(e => { const b = box(e); return { ...b, text: e.textContent, url: e.dataset.url, inked: getComputedStyle(e).color !== 'rgba(0, 0, 0, 0)',
        atMiddle: document.elementFromPoint((b.l + b.r) / 2, b.y) === e, atSliver: document.elementFromPoint(b.l + 2, b.y) === e }; }) };
  })(${card(id)}))`).then(JSON.parse);
  const point = (x, y) => ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  const wheel = (x, y, deltaX, deltaY) => ctx.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY });
  const sliding = () => ctx.evaluate(`JSON.stringify(${stack}.getAnimations({ subtree: true }).map(a => a.transitionProperty).filter(p => /transform|grid|gap/.test(p)))`).then(JSON.parse);

  // ---- at rest: a stack ----
  out.rest = await look(many.id);
  const { chips, tprs } = out.rest, w = chips[0].w, depth = i => Math.min(i, 3);
  ctx.assert.equal(chips.length, MANY.length, `every PR in the stack: ${chips.map(c => c.text)}`);
  ctx.assert.equal(chips[0].r, tprs.r, 'the first chip ends the stack, on the right');
  ctx.assert.ok(Math.abs(tprs.r - out.rest.row) <= 1, `the stack ends the top row: ${tprs.r} vs ${out.rest.row}`);
  ctx.assert.deepEqual(chips.map(c => c.w), chips.map(() => w), 'every chip the widest one\'s width');
  ctx.assert.deepEqual(chips.map(c => c.l), chips.map((_, i) => chips[0].l - 5 * depth(i)), 'three under the top one, 5 px further left each, the rest under the third');
  ctx.assert.equal(tprs.w, w + 5 * 3 + 5, 'the stack is the top chip and three slivers wide (and the fan\'s margin, under the row\'s gap)');
  ctx.assert.equal(out.rest.scroll.over, false, 'nothing to scroll at rest');
  ctx.assert.deepEqual(chips.map(c => c.atMiddle), chips.map((_, i) => i === 0), 'the first on top');
  ctx.assert.deepEqual(chips.map(c => c.atSliver), chips.map((_, i) => i <= 3), 'a sliver of each of the three under it shows, none of the rest');
  ctx.assert.deepEqual(chips.map(c => c.inked), chips.map((_, i) => i === 0), 'only the top one\'s number');
  await ctx.shot('rest', { x: tprs.l - 120, y: chips[0].y - 30, width: tprs.w + 140, height: 60 });

  // two of one colour: still two, an edge of the panel's colour between them
  out.pair = await look(pair.id);
  ctx.assert.deepEqual(out.pair.chips.map(c => c.atSliver), [true, true], 'the pair: both show');
  out.pairEdge = await ctx.evaluate(`getComputedStyle(${card(pair.id)}.querySelector('.tprs > .cpr')).boxShadow`);
  ctx.assert.match(out.pairEdge, /-1px 0px 0px/, `an edge on the top chip's left: ${out.pairEdge}`);

  // a lone chip: its own width, the stack no wider, nothing moved
  out.lone = await look(lone.id);
  ctx.assert.equal(out.lone.chips.length, 1);
  ctx.assert.deepEqual([out.lone.tprs.w, out.lone.tprs.r], [out.lone.chips[0].w + 5, out.lone.chips[0].r], 'a lone chip is the whole stack (and the margin)');
  ctx.assert.match(await ctx.evaluate(`getComputedStyle(${card(lone.id)}.querySelector('.tprs > .cpr')).transform`), /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/, 'and does not move');

  // ---- the pointer on it: fanned, and more than the row holds ----
  const at = { x: (chips[0].l + chips[0].r) / 2, y: chips[0].y };
  await point(at.x, at.y);
  out.sliding = await sliding();
  ctx.assert.ok(out.sliding.includes('grid-template-columns') && out.sliding.filter(p => p === 'transform').length >= 3, `the chips slide out, the box with them: ${out.sliding}`);
  await ctx.sleep(50); await ctx.settle();
  out.fan = await look(many.id);
  const f = out.fan.chips, box = out.fan.tprs;
  ctx.assert.equal(f[0].r, chips[0].r, 'the top chip stays where it was');
  ctx.assert.deepEqual(f.map(c => c.l), f.map((_, i) => chips[0].l - (w + 5) * i), 'side by side, 5 px apart, leftwards');
  ctx.assert.ok(out.fan.scroll.over, `eight are more than the row holds: the fan scrolls (${box.w} px of ${(w + 5) * MANY.length})`);
  ctx.assert.equal(out.fan.repo, out.rest.repo, 'the folder\'s name keeps its width: the fan takes the free room only');
  ctx.assert.equal(out.fan.act, out.rest.act - (box.w - tprs.w), 'the ✓ moved left by what the fan took');
  const seen = f.filter(c => c.l >= box.l);
  ctx.assert.ok(seen.length >= 3 && seen.length < MANY.length, `some in sight, not all: ${seen.length}`);
  ctx.assert.ok(seen.every(c => c.atMiddle && c.inked), 'every chip in sight is what the pointer finds on it, its number read');
  await ctx.shot('fanned', { x: box.l - 120, y: f[0].y - 30, width: box.w + 140, height: 60 });

  // a wheel turned over it goes deeper into the stack, and the list does not move
  for (let i = 0; i < 6; i++) await wheel(at.x, at.y, 0, 120);
  await ctx.waitFor(`${stack}.scrollLeft <= -(${stack}.scrollWidth - ${stack}.clientWidth) + 1`, { what: 'the fan scrolled to its end' });
  out.deep = await look(many.id);
  ctx.assert.equal(out.deep.list, out.fan.list, 'the list stayed put');
  ctx.assert.ok(out.deep.scroll.left < 0, `scrolled leftwards: ${out.deep.scroll.left}`);
  const last = out.deep.chips.at(-1);
  ctx.assert.ok(last.l >= out.deep.tprs.l - 1 && last.atMiddle && last.inked, `the deepest PR in sight: ${JSON.stringify(last)} in ${JSON.stringify(out.deep.tprs)}`);
  ctx.assert.ok(out.deep.chips[0].l >= out.deep.tprs.r, 'the top one scrolled out on the right');
  await ctx.shot('scrolled', { x: out.deep.tprs.l - 120, y: last.y - 30, width: out.deep.tprs.w + 140, height: 60 });
  // …and back up the other way, a sideways swipe as well
  for (let i = 0; i < 6; i++) await wheel(at.x, at.y, 0, -120);
  await ctx.waitFor(`${stack}.scrollLeft > -1`, { what: 'the wheel back to the top chip' });
  await wheel(at.x, at.y, -200, 0);
  await ctx.waitFor(`${stack}.scrollLeft < 0`, { what: 'a sideways swipe scrolling it' });
  for (let i = 0; i < 6; i++) await wheel(at.x, at.y, 0, 120);
  await ctx.waitFor(`${stack}.scrollLeft <= -(${stack}.scrollWidth - ${stack}.clientWidth) + 1`, { what: 'the fan at its end again' });

  // a click on the deepest: its PR, its chat
  const d = (await look(many.id)).chips.at(-1);
  for (const type of ['mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: (d.l + d.r) / 2, y: d.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await ctx.waitFor(`window.peix.state().current === '${many.id}' && window.peix.state().pr === '${d.url}'`, { what: 'the deepest PR opened on its chat' });
  out.opened = await ctx.evaluate('window.__opened');
  ctx.assert.deepEqual(out.opened, [pull(MANY[0])], 'that PR, once — the first mentioned, the deepest');

  // the pointer gone: the fan back at its start, the stack as it was
  await point(5, 5);
  await ctx.waitFor(`${stack}.scrollLeft > -1`, { what: 'the fan back at its start' });
  await ctx.sleep(50); await ctx.settle();
  out.back = await look(many.id);
  // (the card is the open chat's now, and runs into the splitter: read from the row's end)
  const fromEnd = ({ row, chips }) => chips.map(c => [row - c.l, c.atMiddle, c.atSliver, c.inked]);
  ctx.assert.deepEqual(fromEnd(out.back), fromEnd(out.rest), 'stacked again');
  ctx.assert.equal(out.back.tprs.w, tprs.w);

  // ---- reduced motion: the fan at once ----
  await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await ctx.settle();
  const now0 = await look(many.id);
  await point((now0.chips[0].l + now0.chips[0].r) / 2, now0.chips[0].y);
  await ctx.sleep(30);
  out.reduced = { moving: await sliding(), left: await ctx.evaluate(`Math.round(${stack}.children[1].getBoundingClientRect().left)`) };
  ctx.assert.deepEqual(out.reduced.moving, [], 'nothing slides');
  ctx.assert.equal(out.reduced.left, now0.chips[0].l - (w + 5), 'fanned already');
  await point(5, 5);
  await ctx.send('Emulation.setEmulatedMedia', { features: [] });
  return out;
}
