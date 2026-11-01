// The sidebar layout (2026-10-30, round X; the one layout since 2026-11-01, Tiles gone) and its style, Settings ›
// Appearance › Sidebar style — Edge, Ring, Tinted, Glass (the default; round X's D1–D4). Two live chats — one asking, one
// clauding, open — and a ready one. What this checks: the board is the Mac's window from the start — no gaps, no edges,
// the list glass over the wallpaper in the chat's colour, the header a toolbar of glass, no black beside the project; no
// Layout row in the settings — and keeps the signals on the rows: the clauding row's ring is .rg's square turned by a
// transform under a still mask, in step with the rest (phaseAnims), the card's own pseudo-elements left alone; the
// asking row's sonar round its rounded outline; the lanes plain. A pref left from Tiles changes nothing; at the notch
// nothing borders the cut; reduced motion holds the ring still. Each other style says its signals its own way: Edge an
// edge on every row with a light run down it by a transform and a red ping; Ring the lanes' marks; Tinted a spinner and
// a pinging dot, the toolbar solid; both the open row solid in its project's colour (green here), never the system's
// blue. The project a tag on each row but Edge's, its name in its colour on a tint of it; in the toolbar a capsule, or
// under Settings' Line a line along its foot.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { makeFixture, toolLines } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto' };

const GREEN = '#2e9e6a';
// a colour's hue: oklch() as Chrome computes a relative colour, else rgb() or a color-mix()'s color(srgb …)
const hueOf = c => { const n = c.match(/[\d.]+/g).map(Number);
  if (c.startsWith('oklch')) return n[2];
  const [r, g, b] = n.map(v => v / 255), M = Math.max(r, g, b), d = M - Math.min(r, g, b);
  return d ? (60 * (M === r ? (g - b) / d % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4) + 360) % 360 : 0; };

const read = ctx => ctx.evaluate(`(() => {
  const cs = (sel, pseudo) => { const el = document.querySelector(sel); return el ? getComputedStyle(el, pseudo) : null; };
  const w = '#slist > .card.working', a = '#slist > .card.asking', rg = document.querySelector(w + ' > .rg');
  const ring = document.getAnimations().find(x => x.animationName === 'ring' && x.effect.target === rg && x.effect.pseudoElement === '::before');
  return {
    layout: document.documentElement.dataset.layout, pad: cs('main').paddingTop, border: cs('#sessions').borderTopWidth,
    glass: cs('#sessions').backdropFilter, wallKids: document.querySelector('#wall').children.length,
    cardBefore: cs(w, '::before').animationName, rgShown: rg ? getComputedStyle(rg).display : null,
    rgRing: cs(w + ' > .rg', '::before')?.animationName, rgTurn: ring ? ring.effect.getKeyframes().map(k => k.transform).join() : null,
    rgStart: ring ? ring.startTime : null, mask: rg ? getComputedStyle(rg).maskImage.split('linear-gradient').length - 1 : null,
    radius: cs(w).borderTopLeftRadius,
    sonar: cs(a, '::before').animationName, sonarEdge: cs(a, '::before').borderTopWidth, sonarRound: cs(a, '::before').borderTopLeftRadius,
    pix: cs('.gsep.lane.working > i')?.backgroundImage.includes('conic-gradient'), laneCase: cs('.gsep.lane').textTransform,
    head: [cs('#shead').marginTop, cs('#shead').borderTopLeftRadius, cs('#shead', '::after').display].join(' '), headGlass: cs('#shead').backdropFilter,
  };
})()`);

export default async function (ctx) {
  const out = {}, now = Date.now(), cwd = realpathSync(tmpDir('peix-sidebar-'));
  const sleeps = [0, 1].map(() => spawn('sleep', ['300'], { stdio: 'ignore' }));
  const live = (i, extra = {}) => ({ pid: sleeps[i].pid, startedAt: now - 3600_000, ...extra });
  const ago = s => new Date(now - s * 1000);
  try {
    await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projects: { [basename(cwd)]: { color: GREEN } } }) });
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

    // Settings › Appearance: the sidebar's style, no layout to pick, nothing off
    await ctx.evaluate(`document.querySelector('#settingsBtn').click()`);
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
    await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="look"]').click()`);
    ctx.assert.deepEqual(await ctx.evaluate(`[!!document.querySelector('#layoutPick, #layoutRow'), document.querySelector('#sideStyleRow').classList.contains('off'), document.querySelector('#sideStylePick [data-sbs="glass"]').getAttribute('aria-checked')]`),
      [false, false, 'true'], 'no Layout row; the style on, Glass picked');
    await ctx.evaluate(`document.querySelector('#settings').close()`);
    await ctx.settle();

    out.sidebar = await read(ctx);
    const sb = out.sidebar;
    ctx.assert.deepEqual([sb.layout, sb.pad, sb.border, sb.wallKids], ['sidebar', '0px', '0px', 0], 'the sidebar: no gaps, no edges, no glow on the wallpaper');
    ctx.assert.match(sb.glass, /blur\(44px\)/, 'the list is glass');
    ctx.assert.equal(sb.cardBefore, 'none', 'the card’s own ring is off');
    ctx.assert.deepEqual([sb.rgShown, sb.rgRing, sb.mask], ['block', 'ring', 2], 'the ring is .rg’s, masked');
    ctx.assert.match(sb.rgTurn, /rotate\(360deg\)/, 'turned by a transform');
    ctx.assert.equal(sb.rgStart, 0, 'in step with the board’s other lights (phaseAnims)');
    ctx.assert.equal(sb.radius, '7px', 'a row, rounded');
    ctx.assert.deepEqual([sb.sonar, sb.sonarRound], ['sonar', '7px'], 'the question’s sonar round the row');
    ctx.assert.match(sb.sonarEdge, /^1(\.5)?px$/, 'its edge the row’s hairline (1.5 px; a whole device pixel at 1×)');
    ctx.assert.deepEqual([sb.pix, sb.laneCase], [true, 'none'], 'the lanes as the tiles\' (2026-10-31): the glyph, in sentence case');
    ctx.assert.equal(sb.head, '0px 0px none', 'the header a toolbar: the top, square, no black');
    ctx.assert.match(sb.headGlass, /blur\(18px\)/, 'of glass');
    await ctx.shot('sidebar');

    // a board that had picked Tiles: the pref changes nothing, and goes on load (the prefs literal has no key for it)
    await ctx.evaluate(`localStorage.setItem('peixairada-prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('peixairada-prefs') || '{}'), layout: 'tiles' }))`);
    await ctx.reload();
    ctx.assert.deepEqual(await ctx.evaluate(`[document.documentElement.dataset.layout, 'layout' in window.peix.prefs()]`), ['sidebar', false], 'Tiles kept in the prefs: still the sidebar, the pref gone');
    await ctx.openChat(work.id);

    // at the notch: the panels cut round the housing, nothing bordering the cut; the chat the board's own lay in a frame
    // (2026-11-01, square at the screen's corner before), its corner there concentric with the screen's
    const N = await ctx.evaluate(`(w => ({ top: 32, left: w / 2 - 92.5, right: w / 2 + 92.5 }))(innerWidth)`);
    await ctx.evaluate(`window.peixFill(true, ${JSON.stringify(N)})`);
    await ctx.waitFor(`!!document.querySelector('#chat.ncutp > .ncut')`, { what: 'the chat cut round the housing' });
    await ctx.settle();
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#chat > .ncut')).display`), 'none', 'no border round the cut');
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#chat')).borderTopRightRadius`), '10px', 'the sheet’s corner concentric with the screen’s');
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

    // the other styles, from Settings
    const W = '#slist > .card.working', A = '#slist > .card.asking', R = '#slist > .card:not(.working, .asking)';
    const look = `(() => { const cs = (sel, pseudo) => getComputedStyle(document.querySelector(sel), pseudo);
      const anim = (sel, name) => document.getAnimations().find(x => x.animationName === name && x.effect.target === document.querySelector(sel) && x.effect.pseudoElement === '::before');
      const run = anim('${W} > .rg', 'edgerun');
      return { sidebar: document.documentElement.dataset.sidebar, readyEdge: [cs('${R} > .rg').display, cs('${R} > .rg').width].join(' '),
        workRg: cs('${W} > .rg').display, workRun: cs('${W} > .rg', '::before').animationName, runTurn: run ? run.effect.getKeyframes().map(k => k.transform).join() : null, runStart: run ? run.startTime : null,
        askBefore: cs('${A}', '::before').content, askAfter: cs('${A}', '::after').animationName,
        dot: cs('${R} .top .repo', '::before').content, tag: [cs('${R} .top .repo').backgroundColor, cs('${R} .top .repo').paddingLeft], openTag: cs('${W} .top .repo').backgroundColor, spinner: cs('${W} .trow', '::after').animationName, askDot: cs('${A} .trow', '::after').animationName,
        sel: cs('${W}').backgroundColor, selInk: cs('${W} .title').color, pix: cs('.gsep.lane.working > i').backgroundImage.includes('conic-gradient'),
        list: [cs('#sessions').backdropFilter, cs('#wall').display].join(' '), head: cs('#shead').backdropFilter }; })()`;
    await ctx.evaluate(`document.querySelector('#settingsBtn').click()`);
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings for the styles' });
    await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="look"]').click()`);
    const reduced = async on => { await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : '' }] }); await ctx.waitFor(`matchMedia('(prefers-reduced-motion: reduce)').matches === ${on}`, { what: 'reduced motion ' + on }); return ctx.evaluate(look); };
    const style = async st => {
      await ctx.evaluate(`document.querySelector('#sideStylePick [data-sbs="${st}"]').click()`);
      await ctx.waitFor(`document.documentElement.dataset.sidebar === '${st}'`, { what: `the ${st} style` });
      await ctx.settle();
      return ctx.evaluate(look);
    };
    out.edge = await style('edge');
    ctx.assert.equal(await ctx.evaluate(`JSON.parse(localStorage.getItem('peixairada-prefs')).sidebarStyle`), 'edge', 'the style kept in the prefs');
    ctx.assert.equal(out.edge.readyEdge, 'block 3px', 'Edge: every row its project’s edge');
    ctx.assert.deepEqual([out.edge.workRun, out.edge.runStart], ['edgerun', 0], 'a light run down the clauding row’s, in step');
    ctx.assert.match(out.edge.runTurn, /translateY\(50%\)/, 'by a transform');
    ctx.assert.deepEqual([out.edge.askBefore, out.edge.askAfter, out.edge.dot, ...out.edge.tag], ['none', 'edgeping', 'none', 'rgba(0, 0, 0, 0)', '0px'], 'a question pings off its red edge; no mark for the project');
    ctx.assert.deepEqual([out.edge.list, out.edge.head], ['none none', 'blur(18px) saturate(1.6)'], 'the list flat, the wallpaper not drawn, the toolbar plain glass');
    out.edgeStill = await reduced(true); await reduced(false);
    ctx.assert.deepEqual([out.edgeStill.workRun, out.edgeStill.askAfter], ['none', 'none'], 'reduced: the light still, no ping');
    await ctx.evaluate(`document.querySelector('#settings').close()`); await ctx.settle(); await ctx.shot('sidebar-edge');
    await ctx.evaluate(`document.querySelector('#settingsBtn').click(); document.querySelector('#settings .stabs [data-tab="look"]').click()`);
    out.ring = await style('ring');
    ctx.assert.equal(out.ring.workRun, 'ring', 'Ring: the ring');
    ctx.assert.ok(hueOf(out.ring.sel) > 120 && hueOf(out.ring.sel) < 200, `the open row in its project’s green, not the system’s blue: ${out.ring.sel}`);
    ctx.assert.equal(out.ring.selInk, 'rgb(255, 255, 255)', 'white on it');
    ctx.assert.deepEqual([out.ring.pix, out.ring.dot, out.ring.tag[1]], [true, 'none', '6px'], 'the lanes’ glyphs; the project a tag, no dot');
    ctx.assert.ok(hueOf(out.ring.tag[0]) > 120 && hueOf(out.ring.tag[0]) < 200, `the tag a tint of its project’s green: ${out.ring.tag[0]}`);
    ctx.assert.equal(out.ring.openTag, 'rgba(0, 0, 0, 0.2)', 'on the open row a shade');
    out.tinted = await style('tinted');
    ctx.assert.deepEqual([out.tinted.workRg, out.tinted.spinner, out.tinted.askDot, out.tinted.askBefore], ['none', 'ring', 'dotping', 'none'], 'Tinted: a spinner, a pinging dot, no ring, no sonar');
    ctx.assert.equal(out.tinted.sel, out.ring.sel, 'the open row solid in its project’s colour, as Ring’s');
    ctx.assert.equal(out.tinted.selInk, 'rgb(255, 255, 255)', 'white on it');
    ctx.assert.equal(out.tinted.head, 'none', 'the toolbar solid');
    out.tintedStill = await reduced(true); await reduced(false);
    ctx.assert.deepEqual([out.tintedStill.spinner, out.tintedStill.askDot], ['none', 'none'], 'reduced: the spinner still, no ping');
    await ctx.evaluate(`document.querySelector('#settings').close()`); await ctx.settle(); await ctx.shot('sidebar-tinted');
    await ctx.evaluate(`document.querySelector('#settingsBtn').click(); document.querySelector('#settings .stabs [data-tab="look"]').click()`);
    out.glass = await style('glass');
    ctx.assert.deepEqual([out.glass.workRun, out.glass.readyEdge.split(' ')[0]], ['ring', 'none'], 'Glass: the ring again, no edge');
    await ctx.evaluate(`document.querySelector('#settings').close()`);

    // the project in the toolbar: a capsule of its colour, or a line along the foot — Settings, kept over a reload
    const head = `(() => { const r = getComputedStyle(document.querySelector('#shead h2 .repo')), h = getComputedStyle(document.querySelector('#shead'));
      return { mark: document.documentElement.dataset.hmark, capsule: r.backgroundColor, round: r.borderTopLeftRadius, before: getComputedStyle(document.querySelector('#shead h2 .repo'), '::before').content,
        foot: h.borderBottomWidth, footc: h.borderBottomColor }; })()`;
    out.capsule = await ctx.evaluate(head);
    ctx.assert.deepEqual([out.capsule.mark, out.capsule.round, out.capsule.before, out.capsule.foot], ['capsule', '999px', 'none', '1px'], 'the toolbar’s project a capsule, no dot, the foot a hairline');
    ctx.assert.ok(hueOf(out.capsule.capsule) > 120 && hueOf(out.capsule.capsule) < 200, `the capsule its project’s green: ${out.capsule.capsule}`);
    await ctx.evaluate(`document.querySelector('#settingsBtn').click(); document.querySelector('#settings .stabs [data-tab="look"]').click()`);
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#headMarkSay').textContent`), 'Its name in its colour, on a capsule of it', 'the row says the capsule');
    await ctx.evaluate(`document.querySelector('#headMarkPick [data-hm="line"]').click()`);
    await ctx.waitFor(`document.documentElement.dataset.hmark === 'line'`, { what: 'the line' });
    ctx.assert.equal(await ctx.evaluate(`JSON.parse(localStorage.getItem('peixairada-prefs')).headMark`), 'line', 'kept in the prefs');
    await ctx.evaluate(`document.querySelector('#settings').close()`);
    await ctx.reload();
    ctx.assert.equal(await ctx.evaluate(`document.documentElement.dataset.hmark`), 'line', 'the line from the prefs at once');
    await ctx.openChat(work.id);
    await ctx.settle();
    out.line = await ctx.evaluate(head);
    ctx.assert.deepEqual([out.line.capsule, out.line.before, out.line.foot], ['rgba(0, 0, 0, 0)', 'none', '2px'], 'Line: the name plain, a line along the foot');
    ctx.assert.ok(hueOf(out.line.footc) > 120 && hueOf(out.line.footc) < 200, `the line its project’s green: ${out.line.footc}`);
    await ctx.shot('sidebar-line');

    return out;
  } finally { for (const s of sleeps) try { s.kill(); } catch {} }
}
