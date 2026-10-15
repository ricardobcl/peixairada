// A chat's PRs and their rounds (2026-10-15). GitHub is the fake gh, answering from a file the scenario rewrites: two
// PRs of yours in one chat — #12, ana commented: your move; #13, priya approved: your move. What this checks: each PR's
// row under the header says its round (since when, unanswered) with Let go and Ask Claude; Let go on #13 lets that one
// go alone — #12 stays at your move — and Undo takes it back; your word on #12 closes its round: the row says answered,
// and with nothing left at your move the card says "answered" in the move line's place and marks each PR in play; the
// pointer on that line shows the rounds and the latest events; rui's next comment opens a new round, whose row names the
// one before.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';

const dir = tmpDir('peix-gh-'), file = join(dir, 'prs.json');
const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const user = login => ({ login, __typename: 'User', avatarUrl: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#8250df"/></svg>`) });
const T = { opened: ago(300), pushed: ago(299), ana: ago(50), priya: ago(40), answer: ago(20), rui: ago(2) };   // once: a time moved on a rewrite is a new event
const mine = (title, o) => ({ state: 'OPEN', title, createdAt: T.opened, headRefOid: 'A', author: user('me'), viewerLatestReview: null, reviewRequests: { nodes: [] },
  reviews: { nodes: [] }, comments: { nodes: [] }, pushes: { nodes: [{ __typename: 'PullRequestCommit', commit: { committedDate: T.pushed, author: { user: { login: 'me' } } } }] }, asks: { nodes: [] }, ...o });
function write(comments12) {
  writeFileSync(file, JSON.stringify({
    'acme/repo-a#12': mine('Retry declined card payments', { comments: { nodes: comments12 } }),
    'acme/repo-a#13': mine('Email a receipt', { reviews: { nodes: [{ author: user('priya'), state: 'APPROVED', submittedAt: T.priya }] } }),
  }));
}
const ana = { author: user('ana'), createdAt: T.ana }, answer = { author: user('me'), createdAt: T.answer }, rui = { author: user('rui'), createdAt: T.rui };
write([ana]);

export const meta = {
  server: true, fixture: 'auto',
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, FAKEGH_VIEWER: 'me', PR_WATCH_MS: '500' },
  prefs: { prsOpen: true },
};

export default async function (ctx) {
  const [two] = ctx.fixture.chats;
  const card = `document.querySelector('#slist > .card[data-id="${two.id}"]')`;
  const row = n => `document.querySelector('#prlist .prround[data-url$="/pull/${n}"]')`;
  const rowSays = n => ctx.evaluate(`(r => r && JSON.stringify({ k: r.dataset.k, say: r.querySelector('.say').textContent, acts: [...r.querySelectorAll('.pract')].map(b => b.textContent), why: getComputedStyle(r.previousElementSibling.querySelector('.why') || document.body).display }))(${row(n)})`).then(JSON.parse);
  const press = async sel => { await ctx.evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`); };
  const centre = sel => ctx.evaluate(`(r => r && ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))(document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect())`);
  const out = {};

  await ctx.openChat(two.id);
  await ctx.waitFor(`${row(12)}?.dataset.k === 'you' && ${row(13)}?.dataset.k === 'you'`, { timeout: 20_000, what: 'both PRs at your move, each row saying so' });
  out.first = await rowSays(12);
  ctx.assert.match(out.first.say, /^since .+ · unanswered \d+m$/, `since when, and how long unanswered: ${out.first.say}`);
  ctx.assert.deepEqual(out.first.acts, ['Let go', 'Ask Claude']);
  ctx.assert.equal(out.first.why, 'none', 'the row\'s own "your move · …" gives way to its round');
  await ctx.shot('1-rows');

  // #13 let go alone: #12 keeps its round; Undo takes it back; let go again
  await press('#prlist .prround[data-url$="/pull/13"] [data-pract="letgo"]');
  await ctx.waitFor(`${row(13)}?.dataset.k === 'let'`, { what: '#13 let go' });
  ctx.assert.equal((await rowSays(12)).k, 'you', '#12 still at your move');
  ctx.assert.match((await rowSays(13)).say, /^approved by priya · let go .+, nothing since$/);
  await press('#prlist .prround[data-url$="/pull/13"] [data-pract="undo"]');
  await ctx.waitFor(`${row(13)}?.dataset.k === 'you'`, { what: '#13 your move again' });
  await press('#prlist .prround[data-url$="/pull/13"] [data-pract="letgo"]');
  await ctx.waitFor(`${row(13)}?.dataset.k === 'let'`, { what: '#13 let go again' });

  // your word on #12: answered — the row, and the card in the move line's place, with a mark per PR in play
  write([ana, answer]);
  await ctx.waitFor(`${row(12)}?.dataset.k === 'ok'`, { timeout: 20_000, what: '#12 answered' });
  out.answered = await rowSays(12);
  ctx.assert.match(out.answered.say, /^you answered .+ · waiting on reviews$/, out.answered.say);
  await ctx.waitFor(`${card}?.querySelector('.state.prans')`, { what: 'the card saying answered' });
  out.card = await ctx.evaluate(`JSON.stringify({ line: ${card}.querySelector('.state.prans .q').textContent, move: !!${card}.querySelector('.state.prmove'), pips: [...${card}.querySelectorAll('.prpips .pp')].map(p => p.dataset.k + ' ' + p.textContent) })`).then(JSON.parse);
  ctx.assert.match(out.card.line, /^#12 · you answered, \d+m ago$/, out.card.line);
  ctx.assert.deepEqual({ ...out.card, line: null }, { line: null, move: false, pips: ['let #13let go', 'ok #12answered'] });
  // the pointer on that line: the rounds, and the latest on them
  await ctx.settle();   // the card moves down its lane: no move of yours on it now
  const at = await centre(`#slist > .card[data-id="${two.id}"] .state.prans`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  await ctx.waitFor(`document.querySelector('#rpop.on') && document.querySelector('#rpop .rev')`, { what: 'the rounds under the pointer, with the latest events' });
  await ctx.settle();
  out.pop = await ctx.evaluate(`JSON.stringify({ rows: [...document.querySelectorAll('#rpop .rpr')].map(r => r.dataset.k + ' ' + r.querySelector('.pchip').textContent + ' ' + r.querySelector('.h').textContent), latest: [...document.querySelectorAll('#rpop .rev .x')].map(x => x.textContent), foot: document.querySelector('#rpop .rpf').textContent,
    beside: document.querySelector('#rpop').getBoundingClientRect().left >= ${card}.getBoundingClientRect().right })`).then(JSON.parse);
  ctx.assert.deepEqual(out.pop.rows, ['let #13 approved by priya', 'ok #12 you answered'], 'as the marks go, each its round in words');
  ctx.assert.ok(out.pop.latest.includes('#12 you commented✓ answers 1 comment from ana') && out.pop.latest.some(l => l.includes('let this round go')), `your word, and the round it answered: ${JSON.stringify(out.pop.latest)}`);
  ctx.assert.match(out.pop.foot, /⌥-click “your move”: let every round go/);
  ctx.assert.ok(out.pop.beside, 'beside the card, over the chat');
  await ctx.shot('2-answered-card', await ctx.evaluate(`(r => ({ x: 0, y: Math.max(0, r.top - 20), width: Math.min(innerWidth, r.right + 420), height: 420 }))(${card}.getBoundingClientRect())`));
  // the card's PR chips show the same
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 600 });
  await ctx.waitFor(`!document.querySelector('#rpop.on')`, { what: 'gone with the pointer' });
  const chips = await centre(`#slist > .card[data-id="${two.id}"] .top .tprs`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: chips.x, y: chips.y });
  await ctx.waitFor(`document.querySelector('#rpop.on .rpr')`, { what: 'the rounds on the PR chips' });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 600 });
  await ctx.waitFor(`!document.querySelector('#rpop.on')`, { what: 'gone with the pointer' });

  // rui comments on #12: a new round, which names the one before; the card's move line is back
  write([ana, answer, rui]);
  await ctx.waitFor(`${row(12)}?.dataset.k === 'you'`, { timeout: 20_000, what: '#12 at your move again' });
  out.again = await rowSays(12);
  ctx.assert.match(out.again.say, /before: 1 comment from ana .+ → you answered /, out.again.say);
  await ctx.waitFor(`${card}?.querySelector('.state.prmove') && !${card}.querySelector('.state.prans')`, { what: 'the move line back' });
  out.pips = await ctx.evaluate(`JSON.stringify([...${card}.querySelectorAll('.prpips .pp')].map(p => p.dataset.k))`).then(JSON.parse);
  ctx.assert.deepEqual(out.pips, ['you', 'let'], 'one at your move, one let go: both marked');
  await ctx.shot('3-new-round');
  return out;
}
