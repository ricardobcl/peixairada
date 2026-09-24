// The chat's PRs in the header (2026-09-24, Ricardo: "on the chat header, make PRs appear compact as they do on cards
// and on click, they toggle to the expanded version per row that we have now"). What this checks: a chat with PRs
// shows them as the cards' chips in the header row, one button, with the rows under the header folded; a click
// unfolds them and a second folds them back; the fold outlives a reload (a pref, not the chat's); a row still opens
// its PR; a chat without PRs has neither.
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const [two, plain] = ctx.fixture.chats;
  const out = {};
  const head = () => ctx.evaluate(`JSON.stringify((() => { const t = document.querySelector('#prToggle'), pl = document.querySelector('#prlist');
    return { chips: t ? [...t.querySelectorAll('.hpr')].map(c => c.textContent) : null, expanded: t?.getAttribute('aria-expanded') ?? null,
      rows: pl.querySelectorAll('.prrow').length, shown: !pl.hidden && pl.offsetParent !== null, pref: window.peix.prefs().prsOpen }; })())`).then(JSON.parse);
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelectorAll('#prlist .prrow').length === 2`, { what: 'two PR rows' });
  out.folded = await head();
  ctx.assert.equal(out.folded.chips.length, 2, 'two chips in the header');
  ctx.assert.ok(out.folded.chips.every(c => /^#\d+$/.test(c)), '…labelled #n, as on the cards');
  ctx.assert.equal(out.folded.shown, false, 'the rows folded by default');
  ctx.assert.equal(out.folded.expanded, 'false');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#prToggle').parentElement.id`), 'shead', 'in the header row itself');
  // taller than the cards' and edged in 2 px, to be seen (the same evening)
  out.chip = await ctx.evaluate(`JSON.stringify((c => ({ h: Math.round(c.getBoundingClientRect().height), border: getComputedStyle(c).borderTopWidth }))(document.querySelector('#shead .hpr')))`).then(JSON.parse);
  ctx.assert.ok(out.chip.h >= 22, `the PR chips are taller (${out.chip.h} px)`);
  ctx.assert.equal(out.chip.border, '2px', '…and their edge thicker');
  await ctx.shot('1-folded', { x: 400, y: 0, width: 1300, height: 120 });

  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  out.open = await head();
  ctx.assert.deepEqual([out.open.shown, out.open.expanded, out.open.pref], [true, 'true', true], 'a click lists them, one per row');
  await ctx.shot('2-open', { x: 400, y: 0, width: 1300, height: 160 });
  await ctx.send('Page.reload'); await ctx.sleep(800);
  await ctx.waitFor(`document.querySelectorAll('.card').length > 0`, { what: 'the board again' });
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelectorAll('#prlist .prrow').length === 2`, { what: 'the rows again' });
  ctx.assert.equal((await head()).shown, true, 'still unfolded after a reload');

  // a row still opens its PR — the board says which, and no strip comes under the header (2026-09-24)
  await ctx.evaluate(`document.querySelector('#prlist .prrow').click()`);
  await ctx.waitFor(`(window.peix.state().pr || '').includes('/pull/')`, { what: 'the PR opened' });
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#prbar')`), false, 'and no strip');

  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  out.again = await head();
  ctx.assert.deepEqual([out.again.shown, out.again.pref], [false, false], 'a second click folds them back');

  await ctx.openChat(plain.id);
  out.plain = await head();
  ctx.assert.deepEqual([out.plain.chips, out.plain.shown], [null, false], 'no PRs, no chips and no rows');
  return out;
}
