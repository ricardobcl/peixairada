// The clauding light (2026-09-29). Two clauding chats in a folder with a Peacock colour and a few ready ones under
// them. On a card that is not open the ring runs in the border's place: no border, the cover 2 px in. The open one's
// light runs round the one shape its card, the splitter down to it and the project's box atop the chat make: #trail, a
// band along that outline with a comet of blobs moved by transforms, in white, and the card's own ring stood down. When
// the open card slides to another place in the list, the light and the splitter's colour go with it (2026-10-02: they
// stayed where it had been until the next update). Scrolled away, the card leaves the shape; a turn that ends puts the
// light out; under reduced motion the band is steady and nothing moves.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
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
    // and what runs is the colour lifted towards white (2026-10-02: a navy went round unseen in its own colour) — read
    // off a probe painted in it, as an OKLCH lightness: the blue's is .6
    out.lit = await ctx.evaluate(`(c => { const p = document.createElement('i'); p.style.color = 'var(--lit)'; c.append(p); const v = getComputedStyle(p).color; p.remove(); return v; })(document.querySelector('#slist > .card.working'))`);
    const L = +(/^oklch\(([\d.]+)/.exec(out.lit) || [])[1];
    ctx.assert.ok(L > .9 && L < 1, `the ring's light is the blue lifted, not the blue: ${out.lit}`);

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

    // the other clauding chat says something newer: it takes the top, the open card slides down under it — and the
    // light and the splitter's colour end where the card now ends, with nothing else written after
    appendFileSync(beside.file, JSON.stringify({ isSidechain: false, userType: 'external', entrypoint: 'cli', cwd, sessionId: beside.id, version: 'fixture', gitBranch: 'main',
      parentUuid: null, type: 'user', uuid: randomUUID(), timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'and a newer word' }] } }) + '\n');
    await ctx.waitFor(`document.querySelector('#slist > .card').dataset.id === ${JSON.stringify(beside.id)}`, { what: 'the other chat on top', timeout: 8000 });
    await ctx.settle(); await ctx.sleep(100);
    const moved = await rect(ctx, `document.querySelector('#slist > .card.active')`), mb = bounds((await trail(ctx)).loop);
    const split = await ctx.evaluate(`parseFloat(document.querySelector('#splitter').style.getPropertyValue('--split'))`);
    out.slid = { card: moved, loop: mb, split };
    ctx.assert.ok(moved.t > card.t + 20, `the open card slid down: ${card.t} → ${moved.t}`);
    ctx.assert.ok(near(mb.b, moved.b) && near(split, moved.b + 1 - sp.t), `the light and the splitter end at the card's new bottom, not its old one (${card.b}): ${JSON.stringify(out.slid)}`);
    // back on top: the open chat's own newer word
    appendFileSync(open.file, JSON.stringify({ isSidechain: false, userType: 'external', entrypoint: 'cli', cwd, sessionId: open.id, version: 'fixture', gitBranch: 'main',
      parentUuid: null, type: 'user', uuid: randomUUID(), timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: 'and newer still' }] } }) + '\n');
    await ctx.waitFor(`document.querySelector('#slist > .card').classList.contains('active')`, { what: 'the open chat on top again', timeout: 8000 });
    await ctx.settle(); await ctx.sleep(100);
    ctx.assert.ok(near(bounds((await trail(ctx)).loop).b, (await rect(ctx, `document.querySelector('#slist > .card.active')`)).b), 'and back up with it');

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
    ctx.assert.ok(out.reduced.on && out.reduced.blobs === 0 && out.reduced.bg === 'rgb(255, 255, 255)', `reduced motion: no lights moving, the band in the light's colour, white (${JSON.stringify(out.reduced)})`);
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

    // the turn ends: the light goes out, and the card's own edge is its border again
    appendFileSync(open.file, replyLines({ id: open.id, cwd, text: 'Done.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
    await ctx.waitFor(`!window.peix.trail().on && document.querySelector('#trail').hidden && !document.querySelector('#main').classList.contains('trail')`, { what: 'the light out when the turn ends', timeout: 8000 });
    return out;
  } finally {
    for (const p of sleeps) p.kill();
  }
}
