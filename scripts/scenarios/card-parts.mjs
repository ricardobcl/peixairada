// What a card shows besides its words (2026-10-21): Settings › Chat list › Show on a card — its PRs, their rounds, its
// tickets, the faces on its PRs — each a checkbox, all on by default. Left out is hidden by CSS (`#sessions[data-hide]`),
// the cards' markup the same, so a change redraws none. The fixture's two-PR chat, its PRs written and reviewed by
// people the fake gh names. What this checks: the four boxes on; the PR chips and the faces shown; each box off hides its
// part on every card, and no card is redrawn; the choice outlives a reload; back on, all of it shows.
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
  await ctx.waitFor(`document.querySelector('${card} .top .faces img') && document.querySelector('${card} .top .tprs .cpr')`, { timeout: 15_000, what: 'the card\'s PR chips and faces' });
  await ctx.settle();
  const look = () => ctx.evaluate(`JSON.stringify((c => ({
    boxes: [...document.querySelectorAll('#cardPartsRow input')].map(x => x.dataset.part + ':' + x.checked),
    hide: document.querySelector('#sessions').dataset.hide,
    prs: getComputedStyle(c.querySelector('.top .tprs:not(.ttks)')).display !== 'none',
    faces: getComputedStyle(c.querySelector('.top .faces')).display !== 'none',
    node: c === window.__card }))(document.querySelector('${card}')))`).then(JSON.parse);
  await ctx.evaluate(`window.__card = document.querySelector('${card}')`);
  out.on = await look();
  a.deepEqual(out.on, { boxes: ['prs:true', 'rounds:true', 'tickets:true', 'faces:true'], hide: '', prs: true, faces: true, node: true }, 'everything shown by default');
  await ctx.shot('1-all', await ctx.evaluate(`(r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))(document.querySelector('${card}').getBoundingClientRect())`));

  // each box off hides its part, the card's node kept
  const box = async (part, on) => { await ctx.evaluate(`(x => { x.checked = ${on}; x.dispatchEvent(new Event('change', { bubbles: true })); })(document.querySelector('#cardPartsRow input[data-part="${part}"]'))`); await ctx.settle(); };
  await box('faces', false);
  out.noFaces = await look();
  a.deepEqual([out.noFaces.hide, out.noFaces.prs, out.noFaces.faces, out.noFaces.node], ['faces', true, false, true], 'the faces gone, the chips kept, no card redrawn');
  await box('prs', false);
  out.bare = await look();
  a.deepEqual([out.bare.hide, out.bare.prs, out.bare.faces, out.bare.node], ['prs faces', false, false, true], 'the PRs gone too');
  await ctx.shot('2-bare', await ctx.evaluate(`(r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))(document.querySelector('${card}').getBoundingClientRect())`));
  // tickets and rounds by the same rule: a stand-in of each on the card is hidden while its box is off
  await box('tickets', false); await box('rounds', false);
  out.rest = await ctx.evaluate(`JSON.stringify((c => { const t = document.createElement('span'); t.className = 'tprs ttks'; c.querySelector('.top').append(t); const r = document.createElement('div'); r.className = 'prpips'; c.append(r);
    const v = [getComputedStyle(t).display, getComputedStyle(r).display]; t.remove(); r.remove(); return v; })(document.querySelector('${card}')))`).then(JSON.parse);
  a.deepEqual(out.rest, ['none', 'none'], 'tickets and rounds hidden');
  a.equal(await ctx.evaluate(`document.querySelector('#sessions').dataset.hide`), 'prs rounds tickets faces');

  // a pref: the same after a reload; all back on
  await ctx.reload();
  await ctx.waitFor(`!!document.querySelector('${card}')`, { what: 'the card again' });
  a.equal(await ctx.evaluate(`document.querySelector('#sessions').dataset.hide`), 'prs rounds tickets faces', 'kept across a reload');
  for (const p of ['prs', 'rounds', 'tickets', 'faces']) await box(p, true);
  await ctx.evaluate(`window.__card = document.querySelector('${card}')`);
  out.back = await look();
  a.deepEqual([out.back.hide, out.back.prs, out.back.faces], ['', true, true], 'all of it back');
  return out;
}
