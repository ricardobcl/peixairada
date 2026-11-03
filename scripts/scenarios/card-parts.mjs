// What a card shows (2026-10-21; every part of it, a card you click, 2026-11-03, round XXII's T2): Settings › Chat list holds one real card with
// every part on it, and a click on a part leaves it out of every card: left out is hidden by CSS (`#sessions[data-hide]`), the cards' markup the
// same, so a change redraws none. A part left out stays on that card, faint, to be clicked back. The age and the ✓ are off by default, and on keep
// themselves at rest. What this checks: the defaults; the card in the pane is the one real card, its rules a copy that goes with the pane; the PR
// matrix shown; each click hides its part on every card, no card redrawn; a stand-in of each new part hidden; same height keeps a
// hidden move's row, and one line gives it to the word; the age and the ✓ at rest; the keyboard reaches a part; the choice outlives a reload;
// an older prefs' parts stay as they were, the new ones shown.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';

const file = join(tmpDir('peix-parts-'), 'prs.json');
const face = login => ({ login, avatarUrl: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>` });
writeFileSync(file, JSON.stringify({
  'acme/repo-a#12': { state: 'OPEN', title: 'The base', author: face('ana'), reviews: { nodes: [{ author: face('rui'), state: 'APPROVED', submittedAt: new Date().toISOString() }] } },
  'acme/repo-a#13': { state: 'OPEN', title: 'The follow-up', author: face('eva') },
}));

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'compact' }, env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, PR_TTL_MS: '300' } };

export default async function (ctx) {
  const [two] = ctx.fixture.chats, out = {}, a = ctx.assert, card = `#slist > .card[data-id="${two.id}"]`;
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelector('${card} .top .tmx .mxs')`, { timeout: 15_000, what: 'the card\'s PRs' });
  await ctx.settle();
  await ctx.cmd('Comma');
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
  await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="list"]').click()`);
  await ctx.waitFor(`document.querySelectorAll('#cardLab .card').length === 1`, { what: 'the card in the pane' });
  await ctx.settle();
  const look = () => ctx.evaluate(`JSON.stringify((c => ({
    hide: document.querySelector('#sessions').dataset.hide,
    prs: getComputedStyle(c.querySelector('.top .tmx')).display !== 'none',
    node: c === window.__card }))(document.querySelector('${card}')))`).then(JSON.parse);
  const flip = async k => { await ctx.evaluate(`document.querySelector('#cardLab [data-part="${k}"]').click()`); await ctx.settle(); };
  await ctx.evaluate(`window.__card = document.querySelector('${card}')`);

  // by default all but the age and the ✓ at rest; the card in the pane has every part, and its rules are a copy that goes with the pane
  out.on = await look();
  a.deepEqual(out.on, { hide: 'age tick', prs: true, node: true }, 'everything shown by default');
  const parts = await ctx.evaluate(`[...new Set([...document.querySelectorAll('#cardLab [data-part]')].map(e => e.dataset.part))].sort().join(' ')`);
  a.equal(parts, 'age agents branch fable live move prs rounds tab tick tickets unread watch where', 'every part on it');
  a.deepEqual(await ctx.evaluate(`JSON.stringify((c => [getComputedStyle(c.querySelector('.top .repo')).fontWeight, c.querySelector('[data-part="age"]').classList.contains('cpoff'), c.querySelector('[data-part="age"]').getAttribute('aria-checked'), document.querySelectorAll('#slist > .card[data-id="cardlab"]').length])(document.querySelector('#cardLab .card')))`).then(JSON.parse), ['700', true, 'false', 0], 'the board\'s rules reach it; the age faint; nothing of it in the list');
  await ctx.shot('1-pane', await ctx.evaluate(`(r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))(document.querySelector('#settings').getBoundingClientRect())`));

  // each click hides its part, the card's node kept
  await flip('prs');
  out.bare = await look();
  a.deepEqual([out.bare.hide, out.bare.prs, out.bare.node], ['prs age tick', false, true], 'the PRs gone, no card redrawn');
  a.deepEqual(await ctx.evaluate(`JSON.stringify((e => [e.classList.contains('cpoff'), e.getAttribute('aria-checked'), +getComputedStyle(e).opacity < .5])(document.querySelector('#cardLab [data-part="prs"]')))`).then(JSON.parse), [true, 'false', true], 'faint on the card in the pane, to be clicked back');
  a.match(await ctx.evaluate(`document.querySelector('#cardLabSay').textContent`), /Hidden: PRs\./, 'and named under it');

  // the rest by the same rule: a stand-in of each on a real card, hidden while it is left out
  const standIns = { tickets: ['.top', 'span', 'tprs ttks'], rounds: ['', 'div', 'prpips'], tab: ['.top', 'span', 'repo'], branch: ['.top', 'span', 'chip wtb'], where: ['.top', 'span', 'chip elsewhere'], watch: ['.trow', 'span', 'chip watch'], fable: ['.trow', 'span', 'fable'], unread: ['.trow', 'span', 'badge'], move: ['', 'div', 'state prmove'], live: ['', 'div', 'state live wake'] };
  for (const [k, [where, tag, cls]] of Object.entries(standIns)) {
    const shown = cards => ctx.evaluate(`(c => { const t = document.createElement('${tag}'); t.className = '${cls}'; t.textContent = 'x'; ${where ? `c.querySelector('${where}')` : 'c'}.append(t); const v = getComputedStyle(t).display; t.remove(); return v; })(document.querySelector('${card}'))`);
    a.notEqual(await shown(), 'none', `${k}: shown`);
    await flip(k);
    a.equal(await shown(), 'none', `${k}: left out`);
    await flip(k);
  }

  // same height holds a hidden move's row; one line gives the row to the word
  const moved = sel => ctx.evaluate(`JSON.stringify((c => { const was = +c.getBoundingClientRect().height.toFixed(2), slot = c.querySelector('.state.moveslot'), m = document.createElement('div'); m.className = 'state prmove'; m.innerHTML = '<b class="ymove">your move</b>'; c.classList.add('rowmove'); slot?.replaceWith(m);
    const v = { same: +c.getBoundingClientRect().height.toFixed(2) === was, display: getComputedStyle(m).display, seen: getComputedStyle(m).visibility, words: [...c.querySelectorAll('.snip')].filter(x => getComputedStyle(x).display !== 'none').length };
    m.replaceWith(slot); c.classList.remove('rowmove'); return v; })(document.querySelector('${card}')))`).then(JSON.parse);
  await ctx.evaluate(`document.querySelector('#cardsSize [data-v="2"]').click(); if (!document.querySelector('#cardsEven').checked) document.querySelector('#cardsEven').click()`); await ctx.settle();
  await flip('move');
  a.deepEqual(await moved(), { same: true, display: 'flex', seen: 'hidden', words: 0 }, 'same height: its row kept, empty');
  await ctx.evaluate(`document.querySelector('#cardsSize [data-v="3"]').click()`); await ctx.settle();
  a.deepEqual(await moved(), { same: true, display: 'none', seen: 'visible', words: 1 }, 'one line: the word has the row');
  await flip('move');
  a.deepEqual(await moved(), { same: true, display: 'flex', seen: 'visible', words: 0 }, 'one line: the move has it back');

  // the age and the ✓ at rest, in one line's rows and in compact's; pointer away from the list
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
  const rest = () => ctx.evaluate(`JSON.stringify((c => [getComputedStyle(c.querySelector('.trow .time')).display, c.querySelector('.trow .time').getBoundingClientRect().width > 0, c.querySelector('.top .act').getBoundingClientRect().width])(document.querySelector('${card}')))`).then(JSON.parse);
  const off = await rest();
  a.deepEqual([off[0], off[1], off[2]], ['none', false, 0], 'both only under the pointer by default');
  await flip('age'); await flip('tick');
  const kept = await rest();
  a.deepEqual([kept[0], kept[1], kept[2] > 0], ['block', true, true], 'both at rest');

  // the keyboard: a part takes the keys and a press flips it
  await ctx.evaluate(`(e => { e.focus(); e.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })); })(document.querySelector('#cardLab [data-part="fable"]'))`); await ctx.settle();
  a.match(await ctx.evaluate(`document.querySelector('#sessions').dataset.hide`), /\bfable\b/, 'space on a part leaves it out');
  a.equal(await ctx.evaluate(`document.activeElement?.dataset.part`), 'fable', 'the keys stay on it');
  await flip('fable');

  // the copy of the rules goes with the pane
  await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="general"]').click()`); await ctx.settle();
  a.equal(await ctx.evaluate(`!document.querySelector('#clabCss') && !document.querySelector('#cardLab .card')`), true, 'gone on another pane');
  await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="list"]').click()`); await ctx.settle();
  a.equal(await ctx.evaluate(`!!document.querySelector('#clabCss') && !!document.querySelector('#cardLab .card')`), true, 'back on this one');
  await ctx.evaluate(`document.querySelector('#settings').close()`); await ctx.settle();
  a.equal(await ctx.evaluate(`!document.querySelector('#clabCss')`), true, 'gone with the dialog');

  // a pref: the same after a reload
  const hidden = await ctx.evaluate(`document.querySelector('#sessions').dataset.hide`);
  a.equal(hidden, 'prs', 'the age and the ✓ kept, the PRs left out');
  await ctx.reload();
  await ctx.waitFor(`!!document.querySelector('${card}')`, { what: 'the card again' });
  a.equal(await ctx.evaluate(`document.querySelector('#sessions').dataset.hide`), hidden, 'kept across a reload');

  // prefs from before: what was chosen stays, the new parts shown, the age and the ✓ not at rest
  await ctx.evaluate(`(p => { p.cardParts = ['prs', 'agents']; p.cardPartsSeen = 1; localStorage.setItem('peixairada-prefs', JSON.stringify(p)); })(JSON.parse(localStorage.getItem('peixairada-prefs')))`);
  await ctx.reload();
  await ctx.waitFor(`!!document.querySelector('${card}')`, { what: 'the card again' });
  a.equal(await ctx.evaluate(`document.querySelector('#sessions').dataset.hide`), 'rounds tickets age tick', 'older prefs: their choice, the rest of the parts shown');
  return out;
}
