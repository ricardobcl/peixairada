// Reduced motion (2026-09-27, night): with the system asking for less motion, the board still says everything the
// motion said — a steady edge for a clauding card, a steady red border for a question, the dots still, no slides in
// the list, a dialog that fades without moving. The media feature is emulated over CDP, which matchMedia sees too, so
// both the CSS block and drawCards' REDUCED are under test; then it is lifted, and the ring turns again.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeFixture, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

const reduce = (ctx, on) => ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : '' }] });
const read = ctx => ctx.evaluate(`JSON.stringify((() => {
  const w = document.querySelector('#slist > .card.working'), a = document.querySelector('#slist > .card.asking'), pix = document.querySelector('.gsep.lane.working .pix svg');
  const anim = (el, pseudo) => el ? getComputedStyle(el, pseudo).animationName : null;
  return {
    matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    ring: anim(w, '::before'), ringBg: w ? getComputedStyle(w, '::before').backgroundImage : null,
    blink: anim(a), border: a ? getComputedStyle(a).borderTopColor : null,
    pix: anim(pix), dialog: getComputedStyle(document.querySelector('#pick')).transform,
  };
})())`).then(JSON.parse);

export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-reduced', 'reduced-repo'), now = Date.now();
  const sleeps = [0, 1].map(() => spawn('sleep', ['120'], { stdio: 'ignore' }));
  const live = (i, extra = {}) => ({ pid: sleeps[i].pid, startedAt: now - 3600_000, ...extra });
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Clauding', prompt: 'build it', reply: 'on it', at: new Date(now - 60_000), live: live(0),
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm run build', description: 'build' }, at: new Date(now - 10_000) }) },
      { cwd, title: 'Asking', prompt: 'may I?', reply: 'one question', at: new Date(now - 120_000), live: live(1, { status: 'waiting', waitingFor: 'permission prompt' }) },
      { cwd, title: 'Ready one', prompt: 'done?', reply: 'done', at: new Date(now - 3600_000) },
      { cwd, title: 'Ready two', prompt: 'and this?', reply: 'also done', at: new Date(now - 7200_000) },
    ]);
    await ctx.waitFor(`document.querySelector('#slist > .card.working') && document.querySelector('#slist > .card.asking') && document.querySelectorAll('#slist > .card').length === 6`, { what: 'a clauding card, an asking one and the rest' });

    // as it is: the ring turns, the question blinks, the spinner runs
    out.full = await read(ctx);
    ctx.assert.equal(out.full.matches, false, 'no reduced motion to start with');
    ctx.assert.equal(out.full.ring, 'ring', 'the clauding card runs its ring');
    ctx.assert.equal(out.full.blink, 'blink', 'the asking card blinks');
    ctx.assert.equal(out.full.pix, 'pix', 'the spinner steps its frames');

    // reduced: the same readings, still
    await reduce(ctx, true);
    await ctx.waitFor(`matchMedia('(prefers-reduced-motion: reduce)').matches`, { what: 'the page seeing reduced motion' });
    out.reduced = await read(ctx);
    ctx.assert.equal(out.reduced.ring, 'none', 'the ring stands still');
    ctx.assert.equal(out.reduced.ringBg, 'none', "…as a steady edge in the light's colour, not a turning gradient");
    ctx.assert.equal(out.reduced.blink, 'none', 'the question stops blinking');
    ctx.assert.match(out.reduced.border, /^rgb\(214, 69, 69\)|^rgb\(248, 81, 73\)/, 'and holds the red border');
    ctx.assert.equal(out.reduced.pix, 'none', 'the spinner holds its frame');
    ctx.assert.equal(out.reduced.dialog, 'none', 'a closed dialog has no offset to rise from');
    await ctx.shot('reduced');

    // the list puts a card in place rather than sliding it: Ready one ticked done moves without a move recorded
    const n0 = (await ctx.peix('motion()')).length;
    const tick = await ctx.server.post(`api/sessions/${chats[2].id}/done`, {});
    ctx.assert.ok(tick.ok, `done: ${tick.status}`);
    await ctx.waitFor(`document.querySelector('#slist > .card[data-id=${JSON.stringify(chats[2].id)}]')?.classList.contains('done')`, { what: 'the card done', timeout: 4000 });
    await ctx.sleep(300);
    out.moves = (await ctx.peix('motion()')).slice(n0).filter(m => ['flip', 'enter', 'leave'].includes(m.kind));
    ctx.assert.deepEqual(out.moves, [], 'nothing slid, faded or folded');

    // lifted: the ring turns again
    await reduce(ctx, false);
    await ctx.waitFor(`!matchMedia('(prefers-reduced-motion: reduce)').matches`, { what: 'the page back to full motion' });
    out.back = await read(ctx);
    ctx.assert.equal(out.back.ring, 'ring', 'the ring turns again');
    ctx.assert.equal(out.back.blink, 'blink', 'and the question blinks');
  } finally { for (const s of sleeps) s.kill(); }
  return out;
}
