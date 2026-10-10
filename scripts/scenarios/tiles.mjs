// Tiles (2026-10-10). Two live chats — one asking, one clauding with a command running — and a third that clauds in a
// drawer here (the fake's `slow` prompt). What this checks: with the switch on, the board is Hyprland's — gaps, square
// panels, each border its project's colour, whole on the chat (a black one grey), the list's on ALL the open chat's, the
// wallpaper in that hue, and at the notch the chat cut round the housing, its border round it, the tiles in the
// screen's top corners round (not on a display without a housing); beside the open chat the stack holds the list's
// asking and clauding chats, asking first, never the open one: the one in a drawer as its screen drawn small (the prompt
// typed there in it), the other as its tail (the command running); the border follows a press into the list; a click on
// a tile makes it the chat and the one left joins the stack. The stack is a switch of its own and ⌥⌘S, off to begin with
// (tiles are the look alone), and the × on its first tile hides it; off, the stack and the gaps go.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { makeFixture, toolLines } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fake: true, fixture: 'auto' };

export default async function (ctx) {
  // a folder of its own: the checkout may have a Peacock colour, which a project's colour in the setup does not beat
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
      { cwd, title: 'Slow and steady', prompt: 'take your time', reply: 'Ready.', at: ago(500) },
    ]);
    const [ask, work, slow] = chats;
    await ctx.waitFor(`window.peix.session('${ask.id}')?.status === 'needs-input' && window.peix.session('${work.id}')?.status === 'working'`, { what: 'the two live chats', timeout: 20000 });

    // the third clauds in a drawer here
    await ctx.openChat(slow.id);
    await ctx.evaluate(`document.querySelector('#termBtn').click()`);
    await ctx.waitPrompt(30_000, 0);
    await ctx.type('slow 60');
    await ctx.waitFor(`window.peix.session('${slow.id}')?.status === 'working'`, { what: 'the drawer clauding', timeout: 15000 });

    // tiles on, the asking chat open: the look alone at first — no stack; ⌥⌘S brings it, the drawer's chat and the
    // clauding one
    await ctx.evaluate(`document.querySelector('#tilesOn').click()`);
    await ctx.openChat(ask.id);
    await ctx.waitFor(`document.querySelector('#main').classList.contains('tiles')`, { what: 'tiles on' });
    await ctx.sleep(300);
    ctx.assert.ok(await ctx.evaluate(`document.querySelector('#stack').hidden && !document.querySelector('#stack .stile') && !document.querySelector('#tileStackRow').hidden`), 'tiles alone: no stack, its switch under tiles’');
    await ctx.settle(); await ctx.shot('tiles-alone');
    await ctx.key('KeyS');
    await ctx.waitFor(`document.querySelectorAll('#stack .stile').length === 2 && document.querySelector('#tileStackOn').checked`, { what: 'the stack, by ⌥⌘S', timeout: 10000 });
    out.stack = await ctx.evaluate(`[...document.querySelectorAll('#stack .stile')].map(t => t.dataset.id)`);
    ctx.assert.ok(!out.stack.includes(ask.id), 'never the open chat');
    ctx.assert.deepEqual([...out.stack].sort(), [slow.id, work.id].sort());
    await ctx.waitFor(`[...document.querySelectorAll('#stack .stile[data-id="${slow.id}"] .sbody.live .xterm-rows > div')].some(r => r.textContent.includes('slow 60'))`, { what: 'the drawer drawn small, its prompt in it', timeout: 10000 });
    await ctx.waitFor(`document.querySelector('#stack .stile[data-id="${work.id}"] .tl.run')?.textContent.includes('Run the payment tests')`, { what: 'the clauding chat’s tail', timeout: 10000 });
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
    const wall = `getComputedStyle(document.body).getPropertyValue('--wallc').trim()`;
    await ctx.waitFor(`${wall} === 'rgb(224, 93, 68)'`, { what: 'the wallpaper in the chat’s hue' });
    const faint = await border('#chat');
    ctx.assert.notEqual(faint, 'rgb(224, 93, 68)', 'the chat without the keys: its colour, faint');
    await ctx.evaluate(`document.querySelector('#chat').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
    ctx.assert.equal(await border('#chat'), 'rgb(224, 93, 68)', 'with the keys: its colour, whole');
    await ctx.settle(); await ctx.shot('tiles');

    // at the notch the chat is cut round the housing, the gap away, its border round the cut and its title clear of it;
    // the fill off, it is whole again
    const N = await ctx.evaluate(`(w => ({ top: 32, left: w / 2 - 92.5, right: w / 2 + 92.5 }))(innerWidth)`);
    await ctx.evaluate(`window.peixFill(true, ${JSON.stringify(N)})`);
    await ctx.waitFor(`!!document.querySelector('#chat.ncutp > .ncut')`, { what: 'the chat cut round the housing' });
    out.cut = await ctx.evaluate(`(() => { const c = document.querySelector('#chat > .ncut'), r = c.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, color: getComputedStyle(c).borderLeftColor, round: getComputedStyle(c).borderBottomLeftRadius + ' ' + getComputedStyle(c).borderBottomRightRadius, caps: [getComputedStyle(document.querySelector('#chat > .ncap.l')).borderTopRightRadius, getComputedStyle(document.querySelector('#chat > .ncap.r')).borderTopLeftRadius], h2: document.querySelector('#shead h2').getBoundingClientRect().right }; })()`);
    ctx.assert.deepEqual([out.cut.left, out.cut.right, out.cut.bottom], [N.left - 10, N.right + 10, N.top + 10], 'the border round the housing, the gap away');
    ctx.assert.equal(out.cut.color, 'rgb(224, 93, 68)', 'in the chat’s colour');
    ctx.assert.ok(out.cut.h2 <= N.left - 19.5, 'the title clear of the border');
    ctx.assert.equal(out.cut.round, '19px 19px', 'its lower corners round, concentric with the housing’s');
    ctx.assert.deepEqual(out.cut.caps, ['9px', '9px'], 'and the panel’s corners beside its top, as the screen flares into the housing');
    ctx.assert.ok(await ctx.evaluate(`!document.querySelector('#chat').contains(document.elementFromPoint(${N.left - 9}, document.querySelector('#chat').getBoundingClientRect().top + 1))`), 'outside that corner is not the chat’s');
    ctx.assert.ok(await ctx.evaluate(`!document.querySelector('#chat').contains(document.elementFromPoint(${N.left + 4}, ${N.top + 4}))`), 'the gap is not the chat’s');
    await ctx.evaluate(`document.body.insertAdjacentHTML('beforeend', '<i id="housing" style="position:fixed;z-index:99;top:0;left:${N.left}px;width:${N.right - N.left}px;height:${N.top}px;background:#000;border-radius:0 0 9px 9px"></i><i id="ear1" style="position:fixed;z-index:99;top:0;left:${N.left - 9}px;width:9px;height:9px;background:radial-gradient(circle at 0 100%, transparent 8.5px, #000 9px)"></i><i id="ear2" style="position:fixed;z-index:99;top:0;left:${N.right}px;width:9px;height:9px;background:radial-gradient(circle at 100% 100%, transparent 8.5px, #000 9px)"></i>')`);
    await ctx.settle(); await ctx.shot('tiles-notch');
    // the screen's top corners: the list's left and the stack's first tile's right round, the chat between them square
    const corners = `[getComputedStyle(document.querySelector('#sessions')).borderTopLeftRadius, getComputedStyle(document.querySelector('#chat')).borderTopRightRadius, getComputedStyle(document.querySelector('#stack .stile')).borderTopRightRadius]`;
    ctx.assert.deepEqual(await ctx.evaluate(corners), ['10px', '0px', '10px'], 'the tiles in the screen’s top corners round');
    await ctx.evaluate(`for (const id of ['housing', 'ear1', 'ear2']) document.getElementById(id).remove(); window.peixFill(true, null)`);   // filled on an external display: no housing
    await ctx.waitFor(`!document.querySelector('.ncut, .ncutp')`, { what: 'no cut without a housing' });
    ctx.assert.deepEqual(await ctx.evaluate(corners), ['0px', '0px', '0px'], 'nor round corners');
    await ctx.evaluate(`window.peixFill(false, null)`);
    await paint('#000000');
    await ctx.waitFor(`getComputedStyle(document.querySelector('#chat')).borderTopColor === '${grey}'`, { what: 'a black chat’s border grey' });
    await ctx.waitFor(`${wall} === '${grey}' && document.querySelector('#sessions').style.getPropertyValue('--tile-edge') === 'var(--tile-grey)'`, { what: 'its wallpaper and the list’s border grey' });
    await ctx.settle(); await ctx.shot('tiles-black');

    // a click on a tile makes it the chat; the one left (asking) joins the stack, asking first
    await ctx.evaluate(`document.querySelector('#stack .stile[data-id="${work.id}"]').click()`);
    await ctx.waitFor(`window.peix.state().current === '${work.id}' && document.querySelector('#stack .stile')?.dataset.id === '${ask.id}'`, { what: 'the tile as the chat, the asking one first in the stack', timeout: 10000 });
    ctx.assert.ok(await ctx.evaluate(`document.querySelector('#stack .stile[data-id="${ask.id}"]').classList.contains('ask')`), 'the asking tile rings red');

    // the × on the first tile, and only there, saying the key: the stack goes, the tiles stay, the border back on the
    // chat; then tiles off: no gaps either — and ⌥⌘S with tiles off brings both
    ctx.assert.deepEqual(await ctx.evaluate(`[...document.querySelectorAll('#stack .stile')].map(t => !!t.querySelector('header .sclose'))`), [true, false], 'the × on the first tile only');
    ctx.assert.match(await ctx.evaluate(`document.querySelector('#stack .sclose').title`), /⌥⌘S/, 'its title says the key');
    await ctx.evaluate(`(b => { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); })(document.querySelector('#stack .sclose'))`);
    await ctx.waitFor(`document.querySelector('#stack').hidden && !document.querySelector('#stack .stile') && document.querySelector('#main').classList.contains('tiles')`, { what: 'the stack gone, the tiles kept' });
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#main .kf')?.id`), 'chat', 'the border back on the chat');
    await ctx.evaluate(`document.querySelector('#tilesOn').click()`);
    await ctx.waitFor(`!document.querySelector('#main').classList.contains('tiles') && document.querySelector('#stack').hidden && document.querySelector('#tileStackRow').hidden`, { what: 'tiles off' });
    await ctx.key('KeyS');
    await ctx.waitFor(`document.querySelector('#main').classList.contains('tiles') && document.querySelectorAll('#stack .stile').length > 0`, { what: 'tiles and the stack, by ⌥⌘S', timeout: 10000 });
    return out;
  } finally { for (const s of sleeps) try { s.kill(); } catch {} }
}
