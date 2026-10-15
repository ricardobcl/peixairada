// The clauding light (2026-09-29). Two clauding chats in a project with a colour and a few ready ones under
// them. On a card the ring runs in the border's place: no border, the cover 2 px in, the colour lifted towards white;
// a ready card keeps its border. The open card runs its own ring (its light ran on past it, #trail, until tiles were
// the only layout — 2026-10-14), and a turn that ends puts it out.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeFixture, replyLines, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };


export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-light', 'light-repo'), now = Date.now();
  mkdirSync(cwd, { recursive: true });
  const projects = { 'light-repo': { color: '#2f7fd8' } };
  await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projects }) });
  const sleeps = [0, 1].map(() => spawn('sleep', ['120'], { stdio: 'ignore' }));
  const live = i => ({ pid: sleeps[i].pid, startedAt: now - 3600_000 });
  const busy = (i, title, ago) => ({ cwd, title, prompt: `do ${title}`, reply: 'on it', at: new Date(now - ago), live: live(i),
    lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test', description: 'test' }, at: new Date(now - 5_000) }) });
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      busy(0, 'Open and clauding', 60_000), busy(1, 'Clauding beside it', 90_000),
      ...Array.from({ length: 8 }, (_, i) => ({ cwd, title: `Ready ${i + 1}`, prompt: `question ${i + 1}, long enough to give the card a line or two of prompt`, reply: 'A reply long enough to take the card to three lines of its own, so the list runs past the window.', at: new Date(now - (i + 3) * 600_000) })),
    ]);
    const [open] = chats;
    await ctx.waitFor(`document.querySelectorAll('#slist > .card.working').length === 2`, { what: 'the two clauding cards' });
    await ctx.waitFor(`document.querySelector('#slist > .card.working').style.getPropertyValue('--repo') === '#2f7fd8'`, { what: "the project's colour, from the setup" });

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

    // 2 · open it: the open card keeps its own ring (the light ran on past it, round the splitter and the header's
    // project box, until tiles were the only layout — 2026-10-14)
    await ctx.openChat(open.id);
    await ctx.settle();
    ctx.assert.ok(await ctx.evaluate(`getComputedStyle(document.querySelector('#slist > .card.active'), '::before').animationName === 'ring'`), 'the open card runs its ring');
    await ctx.shot('open', { x: 0, y: 0, width: 640, height: 140 });

    // the turn ends: the ring goes out, and the card's own edge is its border again
    appendFileSync(open.file, replyLines({ id: open.id, cwd, text: 'Done.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
    await ctx.waitFor(`!document.querySelector('#slist > .card.active').classList.contains('working') && getComputedStyle(document.querySelector('#slist > .card.active')).borderTopWidth === '2px'`, { what: 'the ring out when the turn ends', timeout: 8000 });
    return out;
  } finally {
    for (const p of sleeps) p.kill();
  }
}
