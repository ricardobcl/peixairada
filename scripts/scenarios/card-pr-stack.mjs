// The card's PRs as a stack (2026-10-04). GitHub is the fake gh. Three chats: one on five PRs — three chips and a
// +2 —, one on two PRs in the same state, one on a single PR. What this checks: at rest the chips lie one under the
// other at the row's end, the first on top, each one under it 5 px further left — a sliver of each shows, and only the
// top one's number; the stack takes the top chip's width and the slivers, no more. The pointer on it fans them out
// side by side — sliding, the box with them —, every one readable and on top where it stands, the top chip where it was and the ✓ moved left by what
// the row gave them; a click on a fanned chip opens that PR; the pointer gone, the stack is back as it was. Two chips of
// one colour still read as two (an edge between them). A lone chip is its own width and does not move. Under reduced
// motion the fan is at once.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';
import { makeFixture } from '../fixture.mjs';

const dir = tmpDir('peix-stack-'), file = join(dir, 'prs.json');
writeFileSync(file, JSON.stringify({
  'acme/app#101': { state: 'OPEN', title: 'One' }, 'acme/app#102': { state: 'MERGED', title: 'Two' }, 'acme/app#103': { state: 'CLOSED', title: 'Three' },
  'acme/app#104': { state: 'OPEN', isDraft: true, title: 'Four' }, 'acme/app#105': { state: 'OPEN', title: 'Five' },
  'acme/app#201': { state: 'OPEN', title: 'Pair one' }, 'acme/app#202': { state: 'OPEN', title: 'Pair two' },
  'acme/app#301': { state: 'MERGED', title: 'Alone' },
}));

export const meta = { server: true, fixture: 'auto', env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file } };

const pull = n => `https://github.com/acme/app/pull/${n}`;

export default async function (ctx) {
  const out = {}, cwd = join(dir, 'stack-repo'), now = Date.now();
  const { chats: [five, pair, lone] } = makeFixture(ctx.fixture.dir, [
    { cwd, title: 'On five', prompt: `look at ${[101, 102, 103, 104, 105].map(pull).join(' ')}`, reply: 'looked', at: new Date(now - 60_000) },
    { cwd, title: 'On a pair', prompt: `look at ${pull(201)} and ${pull(202)}`, reply: 'looked', at: new Date(now - 120_000) },
    { cwd, title: 'On one', prompt: `look at ${pull(301)}`, reply: 'looked', at: new Date(now - 180_000) },
  ]);
  const card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;
  await ctx.waitFor(`${card(five.id)}?.querySelector('.tprs > .cpr[data-state="open"]') && ${card(pair.id)}?.querySelector('.tprs > .cpr[data-state="open"]') && ${card(lone.id)}?.querySelector('.tprs > .cpr[data-state="merged"]')`, { timeout: 20_000, what: 'the PR states from the fake gh' });
  await ctx.evaluate(`window.open = url => { (window.__opened ||= []).push(url); return null; }`);
  await ctx.settle();

  /** Every chip of a card's stack: where it is, how wide, whether it is what the pointer finds at its middle and at its
   *  sliver, and whether its number shows; the stack's box, and the ✓'s left edge. */
  const look = id => ctx.evaluate(`JSON.stringify((c => {
    const box = e => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), y: Math.round(r.top + r.height / 2) }; };
    const t = c.querySelector('.tprs'), chips = [...t.children];
    return { tprs: box(t), act: Math.round(c.querySelector('.top .act').getBoundingClientRect().left), row: Math.round(c.querySelector('.top').getBoundingClientRect().right),
      chips: chips.map(e => { const b = box(e); return { ...b, text: e.textContent, url: e.dataset.url || null, inked: getComputedStyle(e).color !== 'rgba(0, 0, 0, 0)',
        atMiddle: document.elementFromPoint((b.l + b.r) / 2, b.y) === e, atSliver: document.elementFromPoint(b.l + 2, b.y) === e }; }) };
  })(${card(id)}))`).then(JSON.parse);
  const point = (x, y) => ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });

  // ---- at rest: a stack ----
  out.rest = await look(five.id);
  const { chips, tprs } = out.rest, w = chips[0].w;
  ctx.assert.equal(chips.length, 4, `three chips and a +2: ${chips.map(c => c.text)}`);
  ctx.assert.equal(chips[3].text, '+2', 'the rest counted last');
  ctx.assert.equal(chips[0].r, tprs.r, 'the first chip ends the stack, on the right');
  ctx.assert.ok(Math.abs(tprs.r - out.rest.row) <= 1, `the stack ends the top row: ${tprs.r} vs ${out.rest.row}`);
  ctx.assert.deepEqual(chips.map(c => c.w), chips.map(() => w), 'every chip the widest one\'s width');
  ctx.assert.deepEqual(chips.map(c => c.l), chips.map((_, i) => chips[0].l - 5 * i), 'each one under the last 5 px further left');
  ctx.assert.equal(tprs.w, w + 5 * 3, 'the stack is the top chip and three slivers wide');
  ctx.assert.deepEqual(chips.map(c => c.atMiddle), [true, false, false, false], 'the first on top');
  ctx.assert.deepEqual(chips.map(c => c.atSliver), [true, true, true, true], 'a sliver of every one under it shows');
  ctx.assert.deepEqual(chips.map(c => c.inked), [true, false, false, false], 'only the top one\'s number');
  await ctx.shot('rest', { x: tprs.l - 120, y: chips[0].y - 30, width: tprs.w + 140, height: 60 });

  // two of one colour: still two, an edge of the panel's colour between them
  out.pair = await look(pair.id);
  ctx.assert.deepEqual(out.pair.chips.map(c => c.atSliver), [true, true], 'the pair: both show');
  out.pairEdge = await ctx.evaluate(`getComputedStyle(${card(pair.id)}.querySelector('.tprs > .cpr')).boxShadow`);
  ctx.assert.match(out.pairEdge, /-1px 0px 0px/, `an edge on the top chip's left: ${out.pairEdge}`);

  // a lone chip: its own width, the stack no wider, nothing moved
  out.lone = await look(lone.id);
  ctx.assert.equal(out.lone.chips.length, 1);
  ctx.assert.equal(out.lone.tprs.w, out.lone.chips[0].w, 'a lone chip is the whole stack');
  ctx.assert.match(await ctx.evaluate(`getComputedStyle(${card(lone.id)}.querySelector('.tprs > .cpr')).transform`), /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/, 'and does not move');

  // ---- the pointer on it: fanned ----
  const sliding = () => ctx.evaluate(`JSON.stringify(${card(five.id)}.querySelector('.tprs').getAnimations({ subtree: true }).map(a => a.transitionProperty).filter(p => /transform|grid/.test(p)))`).then(JSON.parse);
  await point((chips[0].l + chips[0].r) / 2, chips[0].y);
  out.sliding = await sliding();
  ctx.assert.ok(out.sliding.includes('grid-template-columns') && out.sliding.filter(p => p === 'transform').length >= 3, `the chips slide out, the box with them: ${out.sliding}`);
  await ctx.sleep(50); await ctx.settle();
  out.fan = await look(five.id);
  const f = out.fan.chips;
  ctx.assert.equal(f[0].r, chips[0].r, 'the top chip stays where it was');
  ctx.assert.deepEqual(f.map(c => c.w), f.map(() => w), 'the same width fanned');
  ctx.assert.deepEqual(f.map(c => c.l), f.map((_, i) => chips[0].l - (w + 5) * i), 'side by side, 5 px apart, leftwards');
  ctx.assert.equal(out.fan.tprs.l, f[3].l, 'the stack\'s box is the fan');
  ctx.assert.equal(out.fan.act, out.rest.act - (out.fan.tprs.w - tprs.w), 'the ✓ moved left by what the fan took');
  ctx.assert.deepEqual(f.map(c => c.atMiddle), [true, true, true, true], 'every chip is what the pointer finds on it');
  ctx.assert.deepEqual(f.map(c => c.inked), [true, true, true, true], 'every number reads');
  await ctx.shot('fanned', { x: out.fan.tprs.l - 120, y: f[0].y - 30, width: out.fan.tprs.w + 140, height: 60 });

  // a click on the third chip: its PR, its chat
  await point((f[2].l + f[2].r) / 2, f[2].y);
  await ctx.sleep(50); await ctx.settle();
  out.under = await look(five.id);
  ctx.assert.deepEqual(out.under.chips.map(c => c.l), f.map(c => c.l), 'the pointer moving along the fan keeps it open');
  for (const type of ['mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: (f[2].l + f[2].r) / 2, y: f[2].y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await ctx.waitFor(`window.peix.state().current === '${five.id}' && window.peix.state().pr === '${f[2].url}'`, { what: 'the third PR opened on its chat' });
  out.opened = await ctx.evaluate('window.__opened');
  ctx.assert.deepEqual(out.opened, [f[2].url], 'that PR, once');

  // the pointer gone: the stack again, as it was
  await point(5, 5);
  await ctx.sleep(50); await ctx.settle();
  out.back = await look(five.id);
  // (the card is the open chat's now, and runs into the splitter: read from the row's end)
  const fromEnd = ({ row, chips }) => chips.map(c => [row - c.l, c.atMiddle, c.atSliver, c.inked]);
  ctx.assert.deepEqual(fromEnd(out.back), fromEnd(out.rest), 'stacked again');
  ctx.assert.equal(out.back.tprs.w, tprs.w);

  // ---- reduced motion: the fan at once ----
  await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await ctx.settle();
  const now0 = await look(five.id);
  await point((now0.chips[0].l + now0.chips[0].r) / 2, now0.chips[0].y);
  await ctx.sleep(30);
  out.reduced = { moving: await sliding(), left: await ctx.evaluate(`Math.round(${card(five.id)}.querySelector('.tprs > :last-child').getBoundingClientRect().left)`) };
  ctx.assert.deepEqual(out.reduced.moving, [], 'nothing slides');
  ctx.assert.equal(out.reduced.left, now0.chips[0].l - (w + 5) * 3, 'fanned already');
  await point(5, 5);
  await ctx.send('Emulation.setEmulatedMedia', { features: [] });
  return out;
}
