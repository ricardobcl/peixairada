// The fill's word on the way in (2026-10-13): the app tells the page of the fill (peixFill), and when the fill goes on
// from off during the page's own life — ⌃⌘F, the green button — a pill under the head row says how to leave it, then
// fades. What this checks, with a 16" MacBook Pro's housing: a load that finds the fill on says nothing (the first word
// a page hears is a launch or a reload restoring it); off then on says it, centred on the housing, under the header,
// a status, its text at AA on its ground in both themes; it goes after a few seconds; on again while on (a zoom, a
// change of screen) says nothing; it goes with the fill; past FILL_HINTS in all it is never said; and under reduced
// motion it fades in place.
export const meta = { server: true, fixture: 'auto', prefs: { headFloat: true } };
const NOTCH = { top: 32, left: 771.5, right: 956.5 };

export default async function (ctx) {
  const out = {};
  await ctx.send('Emulation.setDeviceMetricsOverride', { width: 1728, height: 1117, deviceScaleFactor: 1, mobile: false });
  const fill = (on, notch = NOTCH) => ctx.evaluate(`window.peixFill(${on}, ${on ? JSON.stringify(notch) : 'null'})`);
  const hint = () => ctx.evaluate(`JSON.stringify((() => {
    const el = document.querySelector('#fillHint'); if (!el) return null;
    const r = el.getBoundingClientRect(), head = document.querySelector('#shead').getBoundingClientRect(), cs = getComputedStyle(el);
    // the text's contrast on the pill's ground (WCAG's relative luminance)
    const lum = c => { const [r, g, b] = c.match(/[\\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
    const [a, b] = [lum(cs.color), lum(cs.backgroundColor)].sort((x, y) => y - x);
    return { text: el.textContent, role: el.getAttribute('role'), mid: Math.round(r.left + r.width / 2), top: Math.round(r.top), headBottom: Math.round(head.bottom),
      ratio: Math.round((a + .05) / (b + .05) * 10) / 10, out: el.classList.contains('out'), opacity: +cs.opacity };
  })())`).then(JSON.parse);
  const count = () => ctx.evaluate('window.peix.prefs().fillHints');
  const theme = dark => ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });

  // a load that finds the fill on — the first word a page hears — says nothing
  await theme(true);
  await ctx.openChat(ctx.fixture.chats[0].id);
  await fill(true); await ctx.sleep(300);
  out.restored = await hint();
  ctx.assert.equal(out.restored, null, 'a load already filled says nothing');
  ctx.assert.equal(await count(), 0);

  // off, then on: ⌃⌘F during the page's life
  await fill(false); await ctx.sleep(200);
  ctx.assert.equal(await hint(), null, 'leaving the fill says nothing');
  await fill(true);
  await ctx.waitFor(`!!document.querySelector('#fillHint')`, { what: 'the hint' });
  await ctx.settle();
  out.dark = await hint();
  ctx.assert.match(out.dark.text, /Full screen, up to the notch · ⌃⌘F leaves it, or the green light at the top edge/);
  ctx.assert.equal(out.dark.role, 'status', 'a reader says it');
  ctx.assert.ok(Math.abs(out.dark.mid - (NOTCH.left + NOTCH.right) / 2) <= 1, `centred on the housing (${out.dark.mid})`);
  ctx.assert.ok(out.dark.top >= out.dark.headBottom + 8 && out.dark.top <= out.dark.headBottom + 12, `under the head row (${out.dark.top} against ${out.dark.headBottom})`);
  ctx.assert.ok(out.dark.ratio >= 4.5, `its text reads (${out.dark.ratio}:1, dark)`);
  ctx.assert.equal(await count(), 1, 'counted');
  await ctx.shot('dark');

  // on again while on — a zoom, a change of screen — says nothing more; and it goes after a few seconds
  await fill(true); await ctx.sleep(100);
  ctx.assert.equal(await count(), 1, 'no second word for a fill already on');
  await ctx.waitFor(`!document.querySelector('#fillHint')`, { what: 'the hint gone', timeout: 6000 });
  out.goneAfter = true;

  // the light theme: the same words, readable
  await theme(false); await ctx.sleep(300);
  await fill(false); await fill(true);
  await ctx.waitFor(`!!document.querySelector('#fillHint')`, { what: 'the hint, light' });
  await ctx.settle();
  out.light = await hint();
  ctx.assert.ok(out.light.ratio >= 4.5, `its text reads (${out.light.ratio}:1, light)`);
  await ctx.shot('light');
  // the fill going off takes it with it
  await fill(false); await ctx.sleep(100);
  ctx.assert.equal(await hint(), null, 'gone with the fill');
  ctx.assert.equal(await count(), 2);

  // a screen without a housing: no notch in the words, centred on the window
  await theme(true);
  await fill(true, null);
  await ctx.waitFor(`!!document.querySelector('#fillHint')`, { what: 'the hint, no housing' });
  out.plain = await hint();
  ctx.assert.match(out.plain.text, /^Full screen · ⌃⌘F leaves it, or the green light after a hold at the top edge$/);
  ctx.assert.ok(Math.abs(out.plain.mid - 1728 / 2) <= 1, `centred on the window (${out.plain.mid})`);
  ctx.assert.equal(await count(), 3);
  await fill(false);

  // past the cap: never again — nor after a reload, which starts filled
  await fill(true); await ctx.sleep(300);
  ctx.assert.equal(await hint(), null, 'past FILL_HINTS, nothing');
  ctx.assert.equal(await count(), 3);
  await ctx.reload();
  await fill(true); await fill(false); await fill(true); await ctx.sleep(300);
  ctx.assert.equal(await hint(), null, 'past FILL_HINTS after a reload, nothing');

  // reduced motion: it fades where it stands
  await ctx.evaluate(`(k => { const p = JSON.parse(localStorage.getItem(k) || '{}'); p.fillHints = 0; localStorage.setItem(k, JSON.stringify(p)); })('peixairada-prefs')`);
  await ctx.reload();
  await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'dark' }] });
  await fill(false); await fill(true);
  await ctx.waitFor(`!!document.querySelector('#fillHint')`, { what: 'the hint, reduced motion' });
  out.reduced = await ctx.evaluate(`(el => { el.classList.add('out'); return getComputedStyle(el).translate; })(document.querySelector('#fillHint'))`);
  ctx.assert.equal(out.reduced, '-50%', `it does not move under reduced motion (${out.reduced})`);
  return out;
}
