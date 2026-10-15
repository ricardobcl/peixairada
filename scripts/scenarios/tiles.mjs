// Tiles (2026-10-10; the only layout since 2026-10-14). Two live chats — one asking, one clauding with a command
// running. What this checks: the board is Hyprland's — gaps, square panels, each border its project's colour, whole
// on the chat (a black one grey), the list's on ALL the open chat's, the wallpaper in that hue, and at the notch the
// chat cut round the housing, its border round it, the tiles in the screen's top corners round (not on a display
// without a housing); the border follows a press into the list. The wallpaper's glow eases after the pointer
// (2026-10-11, late night), a transform (a switch until 2026-10-14). (The stack beside the open chat, ⌥⌘S, went on
// 2026-10-14.)
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { makeFixture, toolLines } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  // a folder of its own, under a name no other project has
  const now = Date.now(), out = {}, cwd = realpathSync(tmpDir('peix-tiles-'));
  const sleeps = [0, 1].map(() => spawn('sleep', ['300'], { stdio: 'ignore' }));
  const live = i => ({ pid: sleeps[i].pid, startedAt: now - 3600_000 });
  const ago = s => new Date(now - s * 1000);
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Queue the webhooks', prompt: 'move webhooks off the request path', reply: 'One question first.', at: ago(300), live: live(0),
        lines: id => toolLines({ id, cwd, name: 'AskUserQuestion', at: ago(60), input: { questions: [{ question: 'Which queue?', header: 'Queue', options: [{ label: 'SQS' }, { label: 'Redis' }] }] } }) },
      { cwd, title: 'Retry declined payments', prompt: 'retry declined cards', reply: 'Reading the client.', at: ago(200), live: live(1),
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test -- payments', description: 'Run the payment tests' }, at: ago(20) }) },
    ]);
    const [ask, work] = chats;
    await ctx.waitFor(`window.peix.session('${ask.id}')?.status === 'needs-input' && window.peix.session('${work.id}')?.status === 'working'`, { what: 'the two live chats', timeout: 20000 });

    // the asking chat open
    await ctx.openChat(ask.id);
    await ctx.settle(); await ctx.shot('tiles-alone');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('.kf')?.id`), 'chat', 'the chat wears the border');
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('main')).paddingTop`), '8px', 'the gaps');
    await ctx.evaluate(`document.querySelector('#slist').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('.kf')?.id`), 'sessions', 'the border follows the press');

    // each border its project's colour, whole on the panel the keys are in — the list's on ALL, no project's, the open
    // chat's — and the wallpaper in that hue; a black one the grey that reads
    const border = sel => ctx.evaluate(`getComputedStyle(document.querySelector('${sel}')).borderTopColor`);
    const grey = await ctx.evaluate(`(() => { const i = document.createElement('i'); i.style.color = 'var(--tile-grey)'; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; })()`);
    const project = await ctx.evaluate(`window.peix.session('${ask.id}').project`);
    const paint = color => ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projects: { [project]: { color } } }) });
    await paint('#e05d44');
    await ctx.waitFor(`getComputedStyle(document.querySelector('#chat')).getPropertyValue('--tile-edge').trim() === '#e05d44'`, { what: 'the chat’s border in its colour' });
    ctx.assert.equal(await border('#sessions'), 'rgb(224, 93, 68)', 'the list on ALL, with the keys: the open chat’s colour');
    const wall = `getComputedStyle(document.querySelector('#wall')).getPropertyValue('--wallc').trim()`;
    await ctx.waitFor(`${wall} === 'rgb(224, 93, 68)'`, { what: 'the wallpaper in the chat’s hue' });
    const faint = await border('#chat');
    ctx.assert.notEqual(faint, 'rgb(224, 93, 68)', 'the chat without the keys: its colour, faint');
    await ctx.evaluate(`document.querySelector('#chat').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
    ctx.assert.equal(await border('#chat'), 'rgb(224, 93, 68)', 'with the keys: its colour, whole');
    await ctx.settle(); await ctx.shot('tiles');

    // the wallpaper's glow after the pointer, by a transform (its own layer: nothing repaints)
    const glow = `(() => { const m = new DOMMatrix(getComputedStyle(document.querySelector('#wall i')).transform); return [Math.round(m.e), Math.round(m.f)]; })()`;
    const rest = await ctx.evaluate(glow), vw = await ctx.evaluate(`[innerWidth, innerHeight]`);
    ctx.assert.deepEqual(rest, [Math.round(vw[0] * .88), Math.round(vw[1] * .06)], 'the glow in its corner, 88 % 6 %, as the body drew it');
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 500 });
    await ctx.waitFor(`document.querySelector('#wall i').style.transform === 'translate(300px, 500px)'`, { what: 'the glow sent after the pointer' });
    await ctx.sleep(250); out.glowMid = await ctx.evaluate(glow);
    ctx.assert.ok(out.glowMid[0] < rest[0] && out.glowMid[0] > 300, `it eases there, not jumps: ${out.glowMid}`);
    await ctx.waitFor(`${glow}.join() === '300,500'`, { what: 'the glow under the pointer', timeout: 4000 });
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#wall i')).transitionProperty`), 'transform', 'a transform, eased');

    // at the notch the chat is cut round the housing, hugging it (2026-10-11, later; the gap away before), its border round
    // the cut and its title clear of it;
    // the fill off, it is whole again
    const N = await ctx.evaluate(`(w => ({ top: 32, left: w / 2 - 92.5, right: w / 2 + 92.5 }))(innerWidth)`);
    await ctx.evaluate(`window.peixFill(true, ${JSON.stringify(N)})`);
    await ctx.waitFor(`!!document.querySelector('#chat.ncutp > .ncut')`, { what: 'the chat cut round the housing' });
    await ctx.settle();   // the header's title laid round the housing first: read mid-way, it was a pixel past the line now and then
    out.cut = await ctx.evaluate(`(() => { const c = document.querySelector('#chat > .ncut'), r = c.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, color: getComputedStyle(c).borderLeftColor, round: getComputedStyle(c).borderBottomLeftRadius + ' ' + getComputedStyle(c).borderBottomRightRadius, caps: [getComputedStyle(document.querySelector('#chat > .ncap.l')).borderTopRightRadius, getComputedStyle(document.querySelector('#chat > .ncap.r')).borderTopLeftRadius], h2: document.querySelector('#shead h2').getBoundingClientRect().right, under: document.querySelector('#shead').classList.contains('tunder') }; })()`);
    ctx.assert.deepEqual([out.cut.left, out.cut.right, out.cut.bottom], [N.left - 2, N.right + 2, N.top + 2], 'the border round the housing, no gap');
    ctx.assert.equal(out.cut.color, 'rgb(224, 93, 68)', 'in the chat’s colour');
    ctx.assert.ok(out.cut.h2 <= N.left - 11.5 || out.cut.under, `the title clear of the border, or on under it (head-float.mjs): ${JSON.stringify(out.cut)} ${JSON.stringify(N)}`);
    ctx.assert.equal(out.cut.round, '11px 11px', 'its lower corners round, concentric with the housing’s');
    ctx.assert.deepEqual(out.cut.caps, ['9px', '9px'], 'and the panel’s corners beside its top, as the screen flares into the housing');
    ctx.assert.ok(await ctx.evaluate(`!document.querySelector('#chat').contains(document.elementFromPoint(${N.left - 1}, document.querySelector('#chat').getBoundingClientRect().top + 1))`), 'outside that corner is not the chat’s');
    ctx.assert.ok(await ctx.evaluate(`!document.querySelector('#chat').contains(document.elementFromPoint(${N.left + 20}, ${N.top - 2}))`), 'the housing is not the chat’s');
    ctx.assert.ok(await ctx.evaluate(`document.querySelector('#chat').contains(document.elementFromPoint(${N.left + 20}, ${N.top + 4}))`), 'just under it is');
    await ctx.evaluate(`document.body.insertAdjacentHTML('beforeend', '<i id="housing" style="position:fixed;z-index:99;top:0;left:${N.left}px;width:${N.right - N.left}px;height:${N.top}px;background:#000;border-radius:0 0 9px 9px"></i><i id="ear1" style="position:fixed;z-index:99;top:0;left:${N.left - 9}px;width:9px;height:9px;background:radial-gradient(circle at 0 100%, transparent 8.5px, #000 9px)"></i><i id="ear2" style="position:fixed;z-index:99;top:0;left:${N.right}px;width:9px;height:9px;background:radial-gradient(circle at 100% 100%, transparent 8.5px, #000 9px)"></i>')`);
    await ctx.settle(); await ctx.shot('tiles-notch');
    // the screen's top corners: the list's left and the chat's right round
    const corners = `[getComputedStyle(document.querySelector('#sessions')).borderTopLeftRadius, getComputedStyle(document.querySelector('#chat')).borderTopRightRadius]`;
    ctx.assert.deepEqual(await ctx.evaluate(corners), ['10px', '10px'], 'the tiles in the screen’s top corners round');
    await ctx.evaluate(`for (const id of ['housing', 'ear1', 'ear2']) document.getElementById(id).remove(); window.peixFill(true, null)`);   // filled on an external display: no housing
    await ctx.waitFor(`!document.querySelector('.ncut, .ncutp')`, { what: 'no cut without a housing' });
    ctx.assert.deepEqual(await ctx.evaluate(corners), ['0px', '0px'], 'nor round corners');
    await ctx.evaluate(`window.peixFill(false, null)`);
    await paint('#000000');
    await ctx.waitFor(`getComputedStyle(document.querySelector('#chat')).borderTopColor === '${grey}'`, { what: 'a black chat’s border grey' });
    await ctx.waitFor(`${wall} === '${grey}' && document.querySelector('#sessions').style.getPropertyValue('--tile-edge') === 'var(--tile-grey)'`, { what: 'its wallpaper and the list’s border grey' });
    await ctx.settle(); await ctx.shot('tiles-black');

    return out;
  } finally { for (const s of sleeps) try { s.kill(); } catch {} }
}
