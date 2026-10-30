// The sidebar layout (2026-10-30, round X's D4): Settings › Appearance › Layout, Tiles by default. Two live chats —
// one asking, one clauding, open — and a ready one. What this checks: the board starts as tiles; Sidebar from the
// settings turns it into the Mac's window — no gaps, no edges, the list glass over the wallpaper in the chat's colour,
// the header a toolbar of glass, no black beside the project — and keeps the signals on the rows: the clauding row's
// ring is .rg's square turned by a transform under a still mask, in step with the rest (phaseAnims), the card's own
// pseudo-elements left alone; the asking row's sonar round its rounded outline; the lanes plain. The layout is there
// at once after a reload (the head's script); at the notch nothing borders the cut; reduced motion holds the ring
// still; Tiles brings every edge back.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { makeFixture, toolLines } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto' };

const read = ctx => ctx.evaluate(`(() => {
  const cs = (sel, pseudo) => { const el = document.querySelector(sel); return el ? getComputedStyle(el, pseudo) : null; };
  const w = '#slist > .card.working', a = '#slist > .card.asking', rg = document.querySelector(w + ' > .rg');
  const ring = document.getAnimations().find(x => x.animationName === 'ring' && x.effect.target === rg && x.effect.pseudoElement === '::before');
  return {
    layout: document.documentElement.dataset.layout, pad: cs('main').paddingTop, border: cs('#sessions').borderTopWidth,
    glass: cs('#sessions').backdropFilter, wallGlow: cs('#wall i').display,
    cardBefore: cs(w, '::before').animationName, rgShown: rg ? getComputedStyle(rg).display : null,
    rgRing: cs(w + ' > .rg', '::before')?.animationName, rgTurn: ring ? ring.effect.getKeyframes().map(k => k.transform).join() : null,
    rgStart: ring ? ring.startTime : null, mask: rg ? getComputedStyle(rg).maskImage.split('linear-gradient').length - 1 : null,
    radius: cs(w).borderTopLeftRadius,
    sonar: cs(a, '::before').animationName, sonarEdge: cs(a, '::before').borderTopWidth, sonarRound: cs(a, '::before').borderTopLeftRadius,
    pix: cs('.gsep.lane.working .pix')?.display, laneCase: cs('.gsep.lane').textTransform,
    head: [cs('#shead').marginTop, cs('#shead').borderTopLeftRadius, cs('#shead', '::after').display].join(' '), headGlass: cs('#shead').backdropFilter,
  };
})()`);

export default async function (ctx) {
  const out = {}, now = Date.now(), cwd = realpathSync(tmpDir('peix-sidebar-'));
  const sleeps = [0, 1].map(() => spawn('sleep', ['300'], { stdio: 'ignore' }));
  const live = (i, extra = {}) => ({ pid: sleeps[i].pid, startedAt: now - 3600_000, ...extra });
  const ago = s => new Date(now - s * 1000);
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Retry declined payments', prompt: 'retry declined cards', reply: 'Reading the client.', at: ago(200), live: live(0),
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test -- payments', description: 'Run the payment tests' }, at: ago(20) }) },
      { cwd, title: 'Queue the webhooks', prompt: 'move webhooks off the request path', reply: 'One question first.', at: ago(300), live: live(1, { status: 'waiting', waitingFor: 'permission prompt' }) },
      { cwd, title: 'Product grid in the dark', prompt: 'dark theme for the grid', reply: 'Done, the tests pass.', at: ago(900) },
    ]);
    const [work] = chats;
    await ctx.waitFor(`document.querySelector('#slist > .card.working') && document.querySelector('#slist > .card.asking')`, { what: 'a clauding card and an asking one', timeout: 20000 });
    await ctx.openChat(work.id);
    await ctx.settle();

    // tiles to begin with: the ring is the card's own, .rg there and not shown
    out.tiles = await read(ctx);
    ctx.assert.deepEqual([out.tiles.layout, out.tiles.pad, out.tiles.cardBefore, out.tiles.rgShown], ['tiles', '8px', 'ring', 'none'], 'tiles: the gaps, the card’s own ring');

    // Settings › Appearance › Layout: Sidebar
    await ctx.evaluate(`document.querySelector('#settingsBtn').click()`);
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
    await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="look"]').click()`);
    ctx.assert.deepEqual(await ctx.evaluate(`[...document.querySelectorAll('#layoutPick [data-lay]')].map(b => b.dataset.lay + ':' + b.getAttribute('aria-checked'))`), ['tiles:true', 'sidebar:false'], 'Tiles picked');
    await ctx.evaluate(`document.querySelector('#layoutPick [data-lay="sidebar"]').click()`);
    await ctx.waitFor(`document.documentElement.dataset.layout === 'sidebar'`, { what: 'the sidebar layout' });
    ctx.assert.equal(await ctx.evaluate(`JSON.parse(localStorage.getItem('peixairada-prefs')).layout`), 'sidebar', 'kept in the prefs');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#layoutPick [data-lay="sidebar"]').getAttribute('aria-checked')`), 'true', 'Sidebar picked');
    await ctx.evaluate(`document.querySelector('#settings').close()`);
    await ctx.settle();

    out.sidebar = await read(ctx);
    const sb = out.sidebar;
    ctx.assert.deepEqual([sb.pad, sb.border, sb.wallGlow], ['0px', '0px', 'none'], 'no gaps, no edges, no glow after the pointer');
    ctx.assert.match(sb.glass, /blur\(44px\)/, 'the list is glass');
    ctx.assert.equal(sb.cardBefore, 'none', 'the card’s own ring is off');
    ctx.assert.deepEqual([sb.rgShown, sb.rgRing, sb.mask], ['block', 'ring', 2], 'the ring is .rg’s, masked');
    ctx.assert.match(sb.rgTurn, /rotate\(360deg\)/, 'turned by a transform');
    ctx.assert.equal(sb.rgStart, 0, 'in step with the board’s other lights (phaseAnims)');
    ctx.assert.equal(sb.radius, '7px', 'a row, rounded');
    ctx.assert.deepEqual([sb.sonar, sb.sonarRound], ['sonar', '7px'], 'the question’s sonar round the row');
    ctx.assert.match(sb.sonarEdge, /^1(\.5)?px$/, 'its edge the row’s hairline (1.5 px; a whole device pixel at 1×)');
    ctx.assert.deepEqual([sb.pix, sb.laneCase], ['none', 'none'], 'the lanes plain');
    ctx.assert.equal(sb.head, '0px 0px none', 'the header a toolbar: the top, square, no black');
    ctx.assert.match(sb.headGlass, /blur\(18px\)/, 'of glass');
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 200, y: 300 });
    await ctx.sleep(300);
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#wall i').style.transform`), '', 'the glow not sent after the pointer');
    await ctx.shot('sidebar');

    // a reload: the head's script has it before the first paint
    await ctx.reload();
    ctx.assert.equal(await ctx.evaluate(`document.documentElement.dataset.layout`), 'sidebar', 'the layout from the prefs at once');
    await ctx.openChat(work.id);

    // at the notch: the panels cut round the housing, nothing bordering the cut, the screen's corners square
    const N = await ctx.evaluate(`(w => ({ top: 32, left: w / 2 - 92.5, right: w / 2 + 92.5 }))(innerWidth)`);
    await ctx.evaluate(`window.peixFill(true, ${JSON.stringify(N)})`);
    await ctx.waitFor(`!!document.querySelector('#chat.ncutp > .ncut')`, { what: 'the chat cut round the housing' });
    await ctx.settle();
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#chat > .ncut')).display`), 'none', 'no border round the cut');
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#chat')).borderTopRightRadius`), '0px', 'square at the screen’s corner');
    await ctx.evaluate(`document.body.insertAdjacentHTML('beforeend', '<i id="housing" style="position:fixed;z-index:99;top:0;left:${N.left}px;width:${N.right - N.left}px;height:${N.top}px;background:#000;border-radius:0 0 9px 9px"></i>')`);
    await ctx.shot('sidebar-notch');
    await ctx.evaluate(`document.getElementById('housing').remove(); window.peixFill(false, null)`);
    await ctx.waitFor(`!document.querySelector('.ncutp')`, { what: 'the cut gone' });

    // reduced motion: the ring still, its light all round
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await ctx.waitFor(`matchMedia('(prefers-reduced-motion: reduce)').matches`, { what: 'reduced motion' });
    out.still = await ctx.evaluate(`(s => [s.animationName, s.backgroundImage])(getComputedStyle(document.querySelector('#slist > .card.working > .rg'), '::before'))`);
    ctx.assert.deepEqual(out.still, ['none', 'none'], 'reduced: the ring stands still, a steady band');
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: '' }] });

    // Tiles again: every edge back, the card's own ring, the glow
    await ctx.evaluate(`document.querySelector('#settingsBtn').click()`);
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings again' });
    await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="look"]').click(); document.querySelector('#layoutPick [data-lay="tiles"]').click()`);
    await ctx.waitFor(`document.documentElement.dataset.layout === 'tiles'`, { what: 'tiles again' });
    await ctx.evaluate(`document.querySelector('#settings').close()`);
    await ctx.settle();
    out.back = await read(ctx);
    ctx.assert.deepEqual([out.back.pad, out.back.border, out.back.cardBefore, out.back.rgShown, out.back.wallGlow], ['8px', '2px', 'ring', 'none', 'block'], 'tiles: the gaps, the edges, the card’s ring, the glow');
    return out;
  } finally { for (const s of sleeps) try { s.kill(); } catch {} }
}
