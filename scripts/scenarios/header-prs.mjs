// The chat's PRs in the header (2026-09-24). What this checks: a chat with PRs
// shows them as the cards' chips in the header row, one button, with the rows under the header folded; a click
// unfolds them and a second folds them back; the fold outlives a reload (a pref, not the chat's); a row still opens
// its PR; a chat without PRs has neither. ⌥ over a chip, or a row, shows an ✕ in red without moving a thing, and
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
  await ctx.reload();
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

  // ⌥ over a chip: its ✕, white on red, the chip its size; let go, the chip — then a real ⌥-click on it
  const pr12 = 'https://github.com/acme/repo-a/pull/12', pr13 = 'https://github.com/acme/repo-a/pull/13';
  const on = url => `#shead .hpr[data-url="${url}"]`, row = url => `#prlist .prrow[data-url="${url}"]`;
  const mid = sel => ctx.evaluate(`JSON.stringify((r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width }))(document.querySelector('${sel}').getBoundingClientRect()))`).then(JSON.parse);
  const x = sel => ctx.evaluate(`(el => JSON.stringify({ alt: document.documentElement.hasAttribute('data-alt'), x: getComputedStyle(el, '::before').content !== 'none' && getComputedStyle(el).color === 'rgba(0, 0, 0, 0)', w: el.getBoundingClientRect().width }))(document.querySelector('${sel}'))`).then(JSON.parse);
  const mouse = (type, p, alt) => ctx.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, modifiers: alt ? 1 : 0, ...type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 } });
  const prsOf = async id => (await ctx.server.api('/api/sessions')).body.sessions.find(c => c.id === id).prs.map(p => p.url);
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
