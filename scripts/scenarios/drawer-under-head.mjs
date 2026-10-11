// A new chat's drawer starts under the floating header (2026-10-11, late night): the header floats over the chat and the
// drawer ran up behind it, so the start of every new chat — Claude Code's banner, at a terminal's top — was under it.
// What this checks, against the fake claude drawing as `tui: fullscreen` does (the transcript from the top, the prompt
// pinned to the bottom): ⌥⌘N ⏎ ⏎ starts claude in a drawer that sits under the header (`#term.under`, unmasked, its
// top at the header's rows' foot, the banner on its first rows and in sight); filled with turns, it runs up behind the
// header once its screen is full — once, no see-saw — taller by the rows the header covers, faded there; a /clear
// starts it over, and it goes back under.
export const meta = { server: true, fake: true, fixture: 'auto', prefs: { headFloat: true }, env: { FAKE_TUI: 'fullscreen' } };

export default async function (ctx) {
  const out = {};
  const [, b] = ctx.fixture.chats;   // b's folder is the temp dir: no Taskfile, so ⌥⌘N ⏎ ⏎ starts claude without a question
  await ctx.evaluate(`(() => { const p = JSON.parse(localStorage.getItem('peixairada-prefs') || '{}'); p.project = ${JSON.stringify(b.cwd)}; localStorage.setItem('peixairada-prefs', JSON.stringify(p)); })()`);
  await ctx.reload();
  await ctx.key('KeyN');
  const enter = () => ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`document.querySelector('#pick').open && document.querySelector('#picklist .pkrow.sel .cur')?.textContent === 'current'`, { what: 'the project step' });
  await enter();
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.sel')?.textContent.includes('new chat')`, { what: 'the chats step' });
  await enter();
  await ctx.waitFor(`(s => s.current && s.termSession === s.current)(window.peix.state())`, { what: 'the new chat in its drawer', timeout: 20_000 });
  await ctx.waitPrompt();
  await ctx.evaluate(`window.__flips = []; new MutationObserver(() => window.__flips.push(document.querySelector('#term').classList.contains('under'))).observe(document.querySelector('#term'), { attributeFilter: ['class'] })`);
  const where = () => ctx.evaluate(`JSON.stringify((() => { const t = document.querySelector('#term'), r = t.getBoundingClientRect(), g = document.querySelector('#groups').getBoundingClientRect();
    const fh = parseFloat(document.querySelector('#chat').style.getPropertyValue('--float-h')), head = document.querySelector('#shead').getBoundingClientRect();
    const rows = [...document.querySelectorAll('#termBody .xterm-rows > div')], banner = rows.find(r => r.textContent.includes('fake claude'));
    return { under: t.classList.contains('under'), top: Math.round(r.top - g.top), fh: Math.round(fh), mask: getComputedStyle(t).maskImage.slice(0, 15), rows: window.peix.term().rows,
      banner: banner ? { row: rows.indexOf(banner), below: Math.round(banner.getBoundingClientRect().top - head.bottom) } : null }; })())`).then(JSON.parse);
  await ctx.sleep(700);   // two looks at the room, ROOM_MS apart: nothing should move
  await ctx.settle();
  out.fresh = await where();
  ctx.assert.deepEqual([out.fresh.under, out.fresh.top, out.fresh.mask], [true, out.fresh.fh, 'none'], `a new chat's drawer starts under the header: ${JSON.stringify(out.fresh)}`);
  ctx.assert.ok(out.fresh.banner?.row <= 2 && out.fresh.banner.below >= 0, `its banner on its first rows, below the header: ${JSON.stringify(out.fresh)}`);
  await ctx.shot('fresh');

  // turns until the screen is full: then it runs up behind the header, once
  for (let i = 0; i < 12 && (await where()).under; i++) {
    const done = await ctx.evaluate(`window.peix.buffer().filter(l => l.includes('Done in')).length`);
    await ctx.type(`turn ${i}`);
    await ctx.waitFor(`window.peix.buffer().filter(l => l.includes('Done in')).length > ${done}`, { what: `turn ${i} done` });
    await ctx.sleep(800);
  }
  await ctx.settle();
  out.full = await where();
  ctx.assert.deepEqual([out.full.under, out.full.top], [false, 0], `full, it runs up behind the header: ${JSON.stringify(out.full)}`);
  ctx.assert.match(out.full.mask, /^linear-gradient/, 'faded there');
  ctx.assert.ok(out.full.rows > out.fresh.rows, `taller by the rows the header covers: ${out.fresh.rows} → ${out.full.rows}`);
  await ctx.waitPrompt();
  await ctx.type('one more');
  await ctx.sleep(1200);
  out.flips = await ctx.evaluate(`window.__flips`);
  ctx.assert.deepEqual(out.flips, [false], `it moved once: ${JSON.stringify(out.flips)}`);
  ctx.assert.ok((await ctx.screen()).some(r => r.includes('❯')), 'the prompt repainted at the new size');
  await ctx.shot('full');

  // /clear: the same drawer, a new chat — its screen has room again, and the drawer goes back under the header
  const was = (await ctx.peix('state()')).current;
  await ctx.type('/clear');
  await ctx.waitFor(`(s => s.current !== ${JSON.stringify(was)} && s.termSession === s.current)(window.peix.state())`, { what: 'the board on the cleared chat', timeout: 20_000 });
  await ctx.waitFor(`document.querySelector('#term').classList.contains('under')`, { what: 'back under the header after a /clear', timeout: 6000 });
  await ctx.settle();
  out.cleared = await where();
  ctx.assert.ok(out.cleared.top === out.cleared.fh && out.cleared.banner?.row <= 2 && out.cleared.banner.below >= 0, `under the header again, the banner in sight: ${JSON.stringify(out.cleared)}`);
  await ctx.shot('cleared');
  return out;
}
