// A card's PRs as one (2026-10-31, round XII's P11), the board's default: Settings › Chat list › A card's PRs. GitHub is
// the fake gh. Three chats: one on a stack of three PRs in one repo (#11 › #12 › #13, each based on the one before) and
// a PR elsewhere, #12 at your move; one on a lone open PR whose CI failed; one on a merged and a closed PR. What this
// checks: each card has one chip, the PR that wants you (at your move, else the first open one, else the first), in
// GitHub's glyph for its state and tinted, never solid, with a CI dot and its words; the stacked one a pill — its layer
// of the depth, a bar a layer, its own lit — and the PR outside the stack a count; no faces. The chip opens its PR and
// the pointer on it brings the rounds up, as the stack does. All, from the settings, is the stack again with every
// chip, the faces' box live; One back; with PRs hidden from cards the row is off and says why.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';
import { makeFixture } from '../fixture.mjs';

const dir = tmpDir('peix-lead-'), file = join(dir, 'prs.json');
const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const face = login => ({ login, __typename: 'User', avatarUrl: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#2e9e6a"/><text x="8" y="12" font-size="10" text-anchor="middle" fill="#fff">${login[0]}</text></svg>`) });
const ci = state => ({ commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] } });
const pr = o => ({ isDraft: false, isCrossRepository: false, author: face('me'), reviewRequests: { nodes: [] }, reviews: { nodes: [] }, comments: { nodes: [] }, ...o });
writeFileSync(file, JSON.stringify({
  'acme/app#11': pr({ state: 'OPEN', title: 'The client', baseRefName: 'main', headRefName: 'retry-client', createdAt: ago(300), ...ci('SUCCESS') }),
  'acme/app#12': pr({ state: 'OPEN', title: 'The backoff', baseRefName: 'retry-client', headRefName: 'retry-backoff', createdAt: ago(200), ...ci('PENDING'),
    comments: { nodes: [{ author: face('joel'), createdAt: ago(5) }] } }),
  'acme/app#13': pr({ state: 'OPEN', isDraft: true, title: 'The error page', baseRefName: 'retry-backoff', headRefName: 'retry-page', createdAt: ago(100), ...ci('FAILURE') }),
  'acme/docs#5': pr({ state: 'MERGED', title: 'Document the retries', baseRefName: 'main', headRefName: 'retry-docs', createdAt: ago(400) }),
  'acme/app#21': pr({ state: 'OPEN', title: 'Alone', baseRefName: 'main', headRefName: 'alone', createdAt: ago(50), ...ci('FAILURE') }),
  'acme/app#31': pr({ state: 'MERGED', title: 'Shipped', baseRefName: 'main', headRefName: 'shipped', createdAt: ago(900) }),
  'acme/app#32': pr({ state: 'CLOSED', title: 'Dropped', baseRefName: 'main', headRefName: 'dropped', createdAt: ago(800) }),
}));

export const meta = { server: true, fixture: 'auto', prefs: { prChips: 'one' },
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, FAKEGH_VIEWER: 'me' } };

const pull = (repo, n) => `https://github.com/acme/${repo}/pull/${n}`;

export default async function (ctx) {
  const out = {}, cwd = join(dir, 'lead-repo'), now = Date.now();
  const { chats: [stack, lone, done] } = makeFixture(ctx.fixture.dir, [
    { cwd, title: 'On a stack', prompt: `the stack: ${pull('app', 11)} ${pull('app', 12)} ${pull('app', 13)}, and ${pull('docs', 5)}`, reply: 'looked', at: new Date(now - 60_000) },
    { cwd, title: 'On one', prompt: `look at ${pull('app', 21)}`, reply: 'looked', at: new Date(now - 120_000) },
    { cwd, title: 'On two done', prompt: `look at ${pull('app', 31)} and ${pull('app', 32)}`, reply: 'looked', at: new Date(now - 180_000) },
  ]);
  const card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;
  await ctx.waitFor(`${card(stack.id)}?.querySelector('.tlead .cpr.lead[data-turn="you"]') && ${card(stack.id)}.querySelector('.pstk') && ${card(lone.id)}?.querySelector('.tlead .ckd[data-checks="fail"]') && ${card(done.id)}?.querySelector('.tlead .cpr.lead[data-state="merged"], .tlead .cpr.lead[data-state="closed"]')`,
    { timeout: 20_000, what: 'the PR states and branches from the fake gh' });
  await ctx.evaluate(`window.open = url => { (window.__opened ||= []).push(url); return null; }`);
  await ctx.settle();

  /** A card's PR slot: its chips, the lead's state, turn, glyph and CI, the pill and the count, and whether faces or a stack are there. */
  const look = id => ctx.evaluate(`JSON.stringify((c => { const l = c.querySelector('.tlead .cpr.lead'), cs = l && getComputedStyle(l), p = c.querySelector('.tlead .pstk');
    return { chips: c.querySelectorAll('.cpr').length, url: l?.dataset.url, state: l?.dataset.state, turn: l?.dataset.turn, glyph: l?.querySelector('svg path')?.getAttribute('d').slice(0, 12),
      ck: l?.querySelector('.ckd')?.dataset.checks || null, said: l?.querySelector('.vh')?.textContent || null, bg: cs?.backgroundColor,
      pill: p ? p.querySelector('b').textContent : null, bar: p ? [...p.querySelectorAll('.bar i')].map(i => i.dataset.state + (i.classList.contains('at') ? '*' : '') + (i.classList.contains('you') ? '!' : '')).join(' ') : null,
      more: c.querySelector('.tlead .pmore')?.textContent || null, faces: !!c.querySelector('.top .faces'), stack: !!c.querySelector('.top .tprs:not(.ttks)'), shown: l ? l.getBoundingClientRect().width > 0 : false };
  })(${card(id)}))`).then(JSON.parse);

  out.stack = await look(stack.id);
  ctx.assert.deepEqual([out.stack.chips, out.stack.url, out.stack.state, out.stack.turn], [1, pull('app', 12), 'open', 'you'], 'one chip: the PR at your move');
  ctx.assert.equal(out.stack.glyph, 'M1.5 3.25a2.', 'GitHub’s open glyph');
  ctx.assert.deepEqual([out.stack.ck, out.stack.said], ['pending', ', checks running'], 'its CI, a dot and its words');
  ctx.assert.ok(/rgba?\(.*, 0\.\d+\)|color\(srgb .* \/ 0\.\d+\)/.test(out.stack.bg), `tinted, not solid: ${out.stack.bg}`);
  ctx.assert.deepEqual([out.stack.pill, out.stack.bar], ['2/3', 'open open*! draft'], 'a stack of three, base first, the lead the second layer and at your move');
  ctx.assert.equal(out.stack.more, '+1', 'the PR outside the stack a count');
  ctx.assert.deepEqual([out.stack.faces, out.stack.stack], [false, false], 'no faces, no stack of chips');
  out.lone = await look(lone.id);
  ctx.assert.deepEqual([out.lone.chips, out.lone.url, out.lone.ck, out.lone.pill, out.lone.more], [1, pull('app', 21), 'fail', null, null], 'a lone PR: its chip and its failed CI, nothing else');
  out.done = await look(done.id);
  ctx.assert.deepEqual([out.done.chips, out.done.ck, out.done.more], [1, null, '+1'], 'no open PR: the first, no CI, the other counted');
  ctx.assert.equal(out.done.glyph, out.done.state === 'merged' ? 'M5.45 5.154A' : 'M3.25 1A2.25', `GitHub’s ${out.done.state} glyph`);
  await ctx.shot('lead');

  // the chip opens its PR; the pointer on it brings the rounds up
  await ctx.evaluate(`${card(stack.id)}.querySelector('.tlead .cpr.lead').click()`);
  await ctx.waitFor(`(window.__opened || []).includes(${JSON.stringify(pull('app', 12))})`, { what: 'the lead PR opened' });
  const at = await ctx.evaluate(`(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))(${card(stack.id)}.querySelector('.tlead .cpr.lead').getBoundingClientRect())`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  await ctx.waitFor(`document.querySelector('#rpop.on')`, { what: 'the rounds under the pointer' });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });

  // Settings › Chat list: One, the faces' box off beside it; All the stack again; with no PRs on cards, off and why
  await ctx.evaluate(`document.querySelector('#settingsBtn').click()`);
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
  await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="list"]').click()`);
  const row = `JSON.stringify({ picked: document.querySelector('#prChipsPick [aria-checked="true"]')?.dataset.pc, say: document.querySelector('#prChipsSay').textContent,
    off: document.querySelector('#prChipsRow').classList.contains('off'), faces: document.querySelector('#cardPartsRow input[data-part="faces"]').disabled })`;
  out.row = await ctx.evaluate(row).then(JSON.parse);
  ctx.assert.deepEqual(out.row, { picked: 'one', say: 'The one that wants you, its CI and its place in a stack; the rest a count', off: false, faces: true }, 'One picked, the faces’ box off');
  await ctx.evaluate(`document.querySelector('#prChipsPick [data-pc="all"]').click()`);
  await ctx.waitFor(`${card(stack.id)}?.querySelectorAll('.tprs:not(.ttks) > .cpr').length === 4 && !${card(stack.id)}.querySelector('.tlead')`, { what: 'every PR stacked' });
  ctx.assert.equal(await ctx.evaluate(`JSON.parse(localStorage.getItem('peixairada-prefs')).prChips`), 'all', 'kept in the prefs');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#cardPartsRow input[data-part="faces"]').disabled`), false, 'the faces’ box live with every PR');
  await ctx.evaluate(`document.querySelector('#prChipsPick [data-pc="one"]').click()`);
  await ctx.waitFor(`${card(stack.id)}?.querySelector('.tlead .cpr.lead') && !${card(stack.id)}.querySelector('.tprs:not(.ttks)')`, { what: 'one again' });
  await ctx.evaluate(`document.querySelector('#cardPartsRow input[data-part="prs"]').click()`);
  out.hidden = await ctx.evaluate(row).then(JSON.parse);
  ctx.assert.deepEqual([out.hidden.off, out.hidden.say], [true, 'Only with PRs shown on a card'], 'no PRs on cards: the row off, and why');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#prChipsPick [data-pc="all"]').disabled`), true, 'its buttons too');
  await ctx.evaluate(`document.querySelector('#settings').close()`);
  await ctx.settle();
  ctx.assert.equal((await look(stack.id)).shown, false, 'the chip hidden with the PRs');
  return out;
}
