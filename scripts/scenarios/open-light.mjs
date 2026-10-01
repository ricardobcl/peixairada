// The clauding light (2026-09-29). Two clauding chats in a folder with a Peacock colour and a few ready ones under
// them. On a card that is not open the ring runs in the border's place: no border, the cover 2 px in. The open one's
// light runs round the one shape its card, the splitter down to it and the project's box atop the chat make: #trail, a
// band along that outline with a comet of blobs moved by transforms, in the ink that reads on the colour, and the
// card's own ring stood down. Scrolled away, the card
// leaves the shape; a turn that ends puts the light out; under reduced motion the band is steady and nothing moves.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeFixture, replyLines, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

const trail = ctx => ctx.peix('trail()');
const rect = (ctx, sel) => ctx.evaluate(`JSON.stringify((r => ({ l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }))(${sel}.getBoundingClientRect()))`).then(JSON.parse);
const bounds = loop => ({ l: Math.min(...loop.map(p => p[0])), t: Math.min(...loop.map(p => p[1])), r: Math.max(...loop.map(p => p[0])), b: Math.max(...loop.map(p => p[1])) });
const near = (a, b, d = 3) => Math.abs(a - b) <= d;

export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-light', 'light-repo'), now = Date.now();
  mkdirSync(join(cwd, '.vscode'), { recursive: true });
  writeFileSync(join(cwd, '.vscode', 'settings.json'), JSON.stringify({ 'peacock.color': '#2f7fd8' }));
  const sleeps = [0, 1].map(() => spawn('sleep', ['120'], { stdio: 'ignore' }));
  const live = i => ({ pid: sleeps[i].pid, startedAt: now - 3600_000 });
  const busy = (i, title, ago) => ({ cwd, title, prompt: `do ${title}`, reply: 'on it', at: new Date(now - ago), live: live(i),
    lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test', description: 'test' }, at: new Date(now - 5_000) }) });
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      busy(0, 'Open and clauding', 60_000), busy(1, 'Clauding beside it', 90_000),
      ...Array.from({ length: 8 }, (_, i) => ({ cwd, title: `Ready ${i + 1}`, prompt: `question ${i + 1}, long enough to give the card a line or two of prompt`, reply: 'A reply long enough to take the card to three lines of its own, so the list runs past the window.', at: new Date(now - (i + 3) * 600_000) })),
    ]);
    const [open, beside] = chats;
    await ctx.waitFor(`document.querySelectorAll('#slist > .card.working').length === 2`, { what: 'the two clauding cards' });
    await ctx.waitFor(`document.querySelector('#slist > .card.working').style.getPropertyValue('--repo') === '#2f7fd8'`, { what: "the folder's Peacock colour (polled every 3 s)", timeout: 8000 });

    // 1 · on a card that is not open, the light runs where the border was
    const ring = await ctx.evaluate(`JSON.stringify((c => ({ border: getComputedStyle(c).borderTopWidth, pad: getComputedStyle(c).paddingTop, cover: getComputedStyle(c, '::after').top, anim: getComputedStyle(c, '::before').animationName }))(document.querySelector('#slist > .card.working')))`).then(JSON.parse);
    ctx.assert.deepEqual(ring, { border: '0px', pad: '10px', cover: '2px', anim: 'ring' }, 'no border, its 2 px in the padding, the cover 2 px in: the band is the edge itself');
    const ready = await ctx.evaluate(`JSON.stringify((c => ({ border: getComputedStyle(c).borderTopWidth, pad: getComputedStyle(c).paddingTop }))(document.querySelector('#slist > .card:not(.working)')))`).then(JSON.parse);
    ctx.assert.deepEqual(ready, { border: '2px', pad: '8px' }, 'a ready card keeps its border — the same outer box, the same content box');

    // 2 · open it: the light runs round the card, up the splitter, round the project's box and back
    await ctx.openChat(open.id);
    await ctx.waitFor(`window.peix.trail().on`, { what: 'the open chat\'s light, past its card' });
    await ctx.settle();
    out.open = await trail(ctx);
    const card = await rect(ctx, `document.querySelector('#slist > .card.active')`), sp = await rect(ctx, `document.querySelector('#splitter')`), head = await rect(ctx, `document.querySelector('#shead')`);
    const hsplit = await ctx.evaluate(`parseFloat(document.querySelector('#shead').style.getPropertyValue('--hsplit'))`);
    const b = bounds(out.open.loop);
    ctx.assert.ok(near(b.l, card.l) && near(b.t, sp.t) && near(b.r, head.l + hsplit), `the shape runs from the card's left to the box's right, from the top: ${JSON.stringify({ b, card, sp, head, hsplit })}`);
    // the first card is flush with the top since 2026-09-29, so the card, the splitter and the box share the top edge
    ctx.assert.ok(near(card.t, sp.t) && out.open.loop.some(p => near(p[0], sp.r) && near(p[1], card.b)), 'one top edge for the three, and down the splitter to the card\'s bottom');
    ctx.assert.ok(out.open.blobs >= 2, `a comet of lights: ${out.open.blobs}`);
    out.page = await ctx.evaluate(`JSON.stringify({ main: document.querySelector('#main').classList.contains('trail'), cardRing: getComputedStyle(document.querySelector('#slist > .card.active'), '::before').content,
      clip: getComputedStyle(document.querySelector('#trail')).clipPath.slice(0, 13), props: [...new Set(document.querySelector('#trail').getAnimations({ subtree: true }).flatMap(a => a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(x => !['offset', 'computedOffset', 'easing', 'composite'].includes(x)))))] })`).then(JSON.parse);
    ctx.assert.deepEqual(out.page, { main: true, cardRing: 'none', clip: 'path(evenodd,', props: ['transform'] }, 'the card\'s ring stands down; the band is a clip, the lights move by transform alone');
    const at = () => ctx.evaluate(`document.querySelector('#trail i').getAnimations()[0].effect.getComputedTiming().progress`);
    const p0 = await at(); await ctx.sleep(300); const p1 = await at();
    ctx.assert.ok(p0 !== p1, `and it moves: ${p0} → ${p1}`);
    await ctx.shot('open', { x: 0, y: 0, width: 640, height: 140 });
    ctx.assert.ok(await ctx.evaluate(`getComputedStyle(document.querySelector('#slist > .card.working:not(.active)'), '::before').content !== 'none'`), 'the other clauding card keeps its own ring');

    // scrolled so the card is out of sight: the splitter is black, the shape is the project's box alone
    await ctx.evaluate(`(l => { l.scrollTop = 1e6; })(document.querySelector('#slist'))`); await ctx.settle(); await ctx.sleep(200);
    out.away = await trail(ctx);
    const ab = bounds(out.away.loop);
    ctx.assert.ok(out.away.on && near(ab.l, sp.r) && near(ab.r, head.l + hsplit) && out.away.loop.length === 4, `its card scrolled away: round the box alone (${JSON.stringify(out.away.loop)})`);
    await ctx.evaluate(`(l => { l.scrollTop = 0; })(document.querySelector('#slist'))`); await ctx.settle(); await ctx.sleep(200);
    ctx.assert.ok(near(bounds((await trail(ctx)).loop).l, card.l), 'back in sight: round the card again');

    // reduced motion: the band steady in the light's colour, no comet
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await ctx.evaluate(`document.querySelector('#slist').dispatchEvent(new Event('scroll'))`); await ctx.sleep(300);
    out.reduced = { ...(await trail(ctx)), bg: await ctx.evaluate(`getComputedStyle(document.querySelector('#trail')).backgroundColor`) };
    ctx.assert.ok(out.reduced.on && out.reduced.blobs === 0 && out.reduced.bg === 'rgb(255, 255, 255)', `reduced motion: no lights moving, the band in the light's colour — the ink on the blue, white (${JSON.stringify(out.reduced)})`);
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

    // the turn ends: the light goes out, and the card's own edge is its border again
    appendFileSync(open.file, replyLines({ id: open.id, cwd, text: 'Done.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
    await ctx.waitFor(`!window.peix.trail().on && document.querySelector('#trail').hidden && !document.querySelector('#main').classList.contains('trail')`, { what: 'the light out when the turn ends', timeout: 8000 });
    return out;
  } finally {
    for (const p of sleeps) p.kill();
  }
}
