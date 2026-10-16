// The chat's PRs in the header (2026-09-24). What this checks: a chat with PRs
// shows them as the cards' chips in the header row, one button, with the rows under the header folded; a click
// unfolds them and a second folds them back, as does the arrow up at the open list's foot (2026-10-13), clicked or
// pressed with Enter — the keys then on the chips; the fold outlives a reload (a pref, not the chat's); a row still opens
// its PR; a chip opens its own, the rows left folded, and a caret after the chips unfolds them (2026-10-16); a chat
// without PRs has neither. ⌥ over a chip, or a row, shows an ✕ in red without moving a thing, and
// ⌥-click takes that PR off the chat (2026-10-11): gone from the header, the rows and the server's summary, kept off
// when Claude names it again and across a restart (its lines read afresh), back when you name it.
import { appendFileSync } from 'node:fs';
import { chatLines, replyLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const [two, plain] = ctx.fixture.chats;
  const out = {};
  const head = () => ctx.evaluate(`JSON.stringify((() => { const t = document.querySelector('#prToggle'), pl = document.querySelector('#prlist');
    return { chips: t ? [...t.querySelectorAll('.hpr:not(.more)')].map(c => c.textContent) : null, expanded: t?.getAttribute('aria-expanded') ?? null,
      rows: pl.querySelectorAll('.prrow').length, shown: !pl.hidden && pl.offsetParent !== null, pref: window.peix.prefs().prsOpen }; })())`).then(JSON.parse);
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelectorAll('#prlist .prrow').length === 2`, { what: 'two PR rows' });
  out.folded = await head();
  ctx.assert.equal(out.folded.chips.length, 2, 'two chips in the header');
  ctx.assert.ok(out.folded.chips.every(c => /^#\d+$/.test(c)), '…labelled #n, as on the cards');
  ctx.assert.equal(out.folded.shown, false, 'the rows folded by default');
  ctx.assert.equal(out.folded.expanded, 'false');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#prToggle').parentElement.id`), 'shead', 'in the header row itself');
  // taller than the cards' to be seen (the same evening); the edge went back to 1 px once the chips had a wash
  out.chip = await ctx.evaluate(`JSON.stringify((c => ({ h: Math.round(c.getBoundingClientRect().height), border: getComputedStyle(c).borderTopWidth }))(document.querySelector('#shead .hpr')))`).then(JSON.parse);
  ctx.assert.ok(out.chip.h >= 22, `the PR chips are taller (${out.chip.h} px)`);
  ctx.assert.equal(out.chip.border, '1px', '…with a 1 px edge');
  await ctx.shot('1-folded', { x: 400, y: 0, width: 1300, height: 120 });

  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  out.open = await head();
  ctx.assert.deepEqual([out.open.shown, out.open.expanded, out.open.pref], [true, 'true', true], 'a click lists them, one per row');
  await ctx.shot('2-open', { x: 400, y: 0, width: 1300, height: 160 });

  // the list's foot is an arrow up that folds it (2026-10-13): under the last row, in the middle, a button that says what
  // it does; a real click on it folds the list as the chips do, and the chips unfold it again
  await ctx.settle();
  out.arrow = await ctx.evaluate(`JSON.stringify((() => { const pl = document.querySelector('#prlist'), b = pl.querySelector('#prFold'), r = b.getBoundingClientRect(), l = pl.getBoundingClientRect();
    return { tag: b.tagName, label: b.getAttribute('aria-label'), controls: b.getAttribute('aria-controls'), last: pl.lastElementChild.contains(b), svg: !!b.querySelector('svg.ic.st'),
      under: Math.round(r.top - Math.max(...[...pl.querySelectorAll('.prrow')].map(row => row.getBoundingClientRect().bottom))), inside: Math.round(l.bottom - r.bottom),
      centre: Math.round((r.left + r.width / 2) - (l.left + l.width / 2)), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) }; })())`).then(JSON.parse);
  ctx.assert.deepEqual([out.arrow.tag, out.arrow.label, out.arrow.controls, out.arrow.last, out.arrow.svg], ['BUTTON', 'Fold the list', 'prlist', true, true], `the foot: a button, named, drawn as a stroke — ${JSON.stringify(out.arrow)}`);
  ctx.assert.ok(out.arrow.under > 0 && out.arrow.inside >= 0, `…under every row, inside the list (${out.arrow.under} px under, ${out.arrow.inside} px from its foot)`);
  ctx.assert.ok(Math.abs(out.arrow.centre) <= 1, `…in its middle (${out.arrow.centre} px off)`);
  ctx.assert.ok(out.arrow.w >= 40 && out.arrow.h >= 16, `…big enough to hit (${out.arrow.w}×${out.arrow.h})`);
  ctx.assert.equal(await ctx.evaluate(`document.elementFromPoint(${out.arrow.x}, ${out.arrow.y})?.closest('#prFold') ? 'arrow' : 'covered'`), 'arrow', 'nothing over it');
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: out.arrow.x, y: out.arrow.y, ...type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 } });
  out.arrowed = await head();
  ctx.assert.deepEqual([out.arrowed.shown, out.arrowed.expanded, out.arrowed.pref, out.arrowed.rows], [false, 'false', false, 2], 'a click on it folds the list — the pref, the chips\' aria-expanded, the rows still there for ⌥⌘G');
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 500 });
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  ctx.assert.deepEqual(await head().then(h => [h.shown, h.expanded, h.pref]), [true, 'true', true], 'and the chips unfold it again');
  // from the keyboard: Enter on the arrow folds it, and the keys land on the chips — the arrow went with the list
  await ctx.evaluate(`document.querySelector('#prFold').focus()`);
  for (const type of ['keyDown', 'keyUp']) await ctx.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...type === 'keyDown' ? { text: '\r' } : {} });
  out.keyed = await ctx.evaluate(`JSON.stringify({ pref: window.peix.prefs().prsOpen, focus: document.activeElement?.id || document.activeElement?.tagName })`).then(JSON.parse);
  ctx.assert.deepEqual([out.keyed.pref, out.keyed.focus], [false, 'prToggle'], `Enter on the arrow folds it, the keys on the chips — ${JSON.stringify(out.keyed)}`);
  for (const type of ['keyDown', 'keyUp']) await ctx.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...type === 'keyDown' ? { text: '\r' } : {} });
  ctx.assert.deepEqual(await ctx.evaluate(`JSON.stringify([window.peix.prefs().prsOpen, document.activeElement?.id])`).then(JSON.parse), [true, 'prToggle'], 'and Enter there unfolds it, the keys staying');
  await ctx.reload();
  await ctx.waitFor(`document.querySelectorAll('.card').length > 0`, { what: 'the board again' });
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelectorAll('#prlist .prrow').length === 2`, { what: 'the rows again' });
  ctx.assert.equal((await head()).shown, true, 'still unfolded after a reload');
  // the clock redraws no row (2026-10-14): the age and the tooltip are written after the draw, so two days on and
  // the header drawn again, each row is the node it was, its age and its tooltip moved on
  out.age = await ctx.evaluate(`JSON.stringify((window.__rows = [...document.querySelectorAll('#prlist .prrow')]).map(r => [r.querySelector('.meta').textContent, /last mentioned (\\S+) ago/.exec(r.title)?.[1]]))`).then(JSON.parse);
  await ctx.evaluate(`(real => { Date.now = () => real() + 2 * 86_400_000; })(Date.now)`);
  for (let i = 0; i < 2; i++) await ctx.evaluate(`document.querySelector('#prToggle').click()`);   // two draws of the header
  out.aged = await ctx.evaluate(`JSON.stringify({ kept: window.__rows.every(r => r.isConnected), ages: window.__rows.map(r => [r.querySelector('.meta').textContent, /last mentioned (\\S+) ago/.exec(r.title)?.[1]]) })`).then(JSON.parse);
  ctx.assert.ok(out.aged.kept, 'every row kept its node');
  ctx.assert.ok(out.age.every(([m, t]) => m && m === t), `the age in the row and its tooltip: ${JSON.stringify(out.age)}`);
  ctx.assert.ok(out.aged.ages.every(([m, t], i) => m === t && m !== out.age[i][0]), `…both two days on: ${JSON.stringify(out.aged.ages)}`);

  // a row still opens its PR — the board says which, and no strip comes under the header (2026-09-24)
  await ctx.evaluate(`document.querySelector('#prlist .prrow').click()`);
  await ctx.waitFor(`(window.peix.state().pr || '').includes('/pull/')`, { what: 'the PR opened' });
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#prbar')`), false, 'and no strip');

  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  out.again = await head();
  ctx.assert.deepEqual([out.again.shown, out.again.pref], [false, false], 'a second click folds them back');

  // ⌥ over a chip: its ✕, white on red, the chip its size; let go, the chip — then a real ⌥-click on it
  const pr12 = 'https://github.com/acme/repo-a/pull/12', pr13 = 'https://github.com/acme/repo-a/pull/13';
  const on = url => `#shead .hpr[data-url="${url}"]`, row = url => `#prlist .prrow[data-url="${url}"]`;
  const mid = sel => ctx.evaluate(`JSON.stringify((r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width }))(document.querySelector('${sel}').getBoundingClientRect()))`).then(JSON.parse);
  const x = sel => ctx.evaluate(`(el => JSON.stringify({ alt: document.documentElement.hasAttribute('data-alt'), x: getComputedStyle(el, '::before').content !== 'none' && getComputedStyle(el).color === 'rgba(0, 0, 0, 0)', w: el.getBoundingClientRect().width }))(document.querySelector('${sel}'))`).then(JSON.parse);
  const mouse = (type, p, alt) => ctx.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, modifiers: alt ? 1 : 0, ...type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 } });
  const prsOf = async id => (await ctx.server.api('/api/sessions')).body.sessions.find(c => c.id === id).prs.map(p => p.url);
  // a chip opens its PR (2026-10-16) — a real click, the rows left folded — and the caret after the chips, every one
  // shown, is what unfolds them (the count, when some fold); the button as a whole still does for the keys or a script
  await ctx.settle();
  const caret = '#prToggle .hcaret', click = async p => { for (const t of ['mouseMoved', 'mousePressed', 'mouseReleased']) await mouse(t, p, false); };
  ctx.assert.equal(await ctx.evaluate(`!document.querySelector('${caret}').hidden && document.querySelector('${caret}').textContent`), '▾', 'a caret, with both chips shown and no count');
  await click(await mid(on(pr13)));
  await ctx.waitFor(`window.peix.state().pr === '${pr13}'`, { what: 'the chip\'s PR opened' });
  ctx.assert.equal(await ctx.evaluate(`window.peix.prefs().prsOpen`), false, 'one click, the rows still folded');
  await click(await mid(caret));
  ctx.assert.deepEqual(await head().then(h => [h.shown, h.pref, h.expanded]), [true, true, 'true'], 'the caret unfolds them');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('${caret}').textContent`), '▴', '…and turns');
  await ctx.shot('2b-caret-open', { x: 400, y: 0, width: 1300, height: 160 });
  await click(await mid(caret));
  ctx.assert.deepEqual(await head().then(h => [h.shown, h.pref]), [false, false], 'and folds them');
  await mouse('mouseMoved', { x: 5, y: 500 }, false);
  await ctx.settle();
  const c13 = await mid(on(pr13));
  await mouse('mouseMoved', c13, false);
  ctx.assert.equal((await x(on(pr13))).x, false, 'no ✕ without ⌥');
  ctx.assert.match(await ctx.evaluate(`document.querySelector('${on(pr13)}').title`), /⌥-click: take it off this chat/, 'the chip says so');
  await mouse('mouseMoved', { ...c13, x: c13.x + 1 }, true);
  out.altChip = await x(on(pr13));
  ctx.assert.deepEqual([out.altChip.alt, out.altChip.x, out.altChip.w], [true, true, c13.w], `⌥ over the chip: its ✕, the chip its size — ${JSON.stringify(out.altChip)}`);
  ctx.assert.equal((await x(on(pr12))).x, false, '…that chip only');
  await ctx.shot('3-alt-chip', { x: 400, y: 0, width: 1300, height: 60 });
  await mouse('mouseMoved', c13, false);
  ctx.assert.equal((await x(on(pr13))).x, false, 'let go, the number again');
  await mouse('mousePressed', c13, true); await mouse('mouseReleased', c13, true);
  await ctx.waitFor(`!document.querySelector('${on(pr13)}') && !document.querySelector('${row(pr13)}')`, { what: 'the chip and its row gone' });
  ctx.assert.deepEqual(await prsOf(two.id), [pr12], 'off the chat on the server');
  ctx.assert.equal(await ctx.evaluate(`window.peix.prefs().prsOpen`), false, 'and the ⌥-click did not unfold the rows');
  ctx.assert.ok(await ctx.evaluate(`window.peix.motion().some(m => m.kind === 'unlink')`), 'it folded out');
  // Claude naming it again does not bring it back
  appendFileSync(two.file, replyLines({ id: two.id, cwd: two.cwd, text: `About ${pr13}: it still depends on #12.` }).map(l => JSON.stringify(l)).join('\n') + '\n');
  await ctx.waitFor(`(window.peix.session('${two.id}').lastReply || '').startsWith('About ')`, { what: 'the reply read' });
  ctx.assert.deepEqual(await prsOf(two.id), [pr12], 'Claude naming it again leaves it off');

  // the rows: ⌥ over one, the ✕ on its number; ⌥-click takes it off rather than open it
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  await ctx.settle();
  const r12 = await mid(`${row(pr12)} .num`), opened = await ctx.evaluate(`window.peix.state().pr || null`);
  await mouse('mouseMoved', r12, true);
  out.altRow = await x(`${row(pr12)} .num`);
  ctx.assert.deepEqual([out.altRow.x, out.altRow.w], [true, r12.w], `⌥ over a row: the ✕ on its number, the row as it was — ${JSON.stringify(out.altRow)}`);
  await ctx.shot('4-alt-row', { x: 400, y: 0, width: 1300, height: 120 });
  await mouse('mousePressed', r12, true); await mouse('mouseReleased', r12, true);
  await ctx.waitFor(`!document.querySelector('#prToggle')`, { what: 'the last PR gone, and its button' });
  ctx.assert.deepEqual(await prsOf(two.id), [], 'none left on the chat');
  ctx.assert.equal(await ctx.evaluate(`window.peix.state().pr || null`), opened, 'the ⌥-click opened nothing');
  await mouse('mouseMoved', r12, false);

  // a restart reads the chat afresh: still off — until you name one yourself
  await ctx.server.restart();
  await ctx.reload();
  await ctx.openChat(two.id);
  ctx.assert.deepEqual(await prsOf(two.id), [], 'still off after a restart');
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#prToggle')`), false, 'no chips');
  appendFileSync(two.file, chatLines({ id: two.id, cwd: two.cwd, prompt: `Back to ${pr13}, please.`, reply: 'On it.', at: new Date(Date.now() + 61_000) }).map(l => JSON.stringify(l)).join('\n') + '\n');
  await ctx.waitFor(`!!document.querySelector('${on(pr13)}')`, { what: 'the PR you named back' });
  ctx.assert.deepEqual(await prsOf(two.id), [pr13], 'a word of yours brings that one back, and only that one');

  await ctx.openChat(plain.id);
  out.plain = await head();
  ctx.assert.deepEqual([out.plain.chips, out.plain.shown], [null, false], 'no PRs, no chips and no rows');
  return out;
}
