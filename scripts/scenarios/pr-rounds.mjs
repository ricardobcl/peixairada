// A chat's PRs and their rounds (2026-10-15). GitHub is the fake gh, answering from a file the scenario rewrites: two
// PRs of yours in one chat — #12, ana commented: your move; #13, priya approved: your move. What this checks: each PR's
// row under the header says its round (since when, unanswered) with Let go and Ask Claude; Let go on #13 lets that one
// go alone — #12 stays at your move — and Undo takes it back; your word on #12 closes its round: the row says answered;
// rui's next comment opens a new round, whose row names the one before.
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
  // rui comments on #12: a new round, which names the one before; the card's move line is back
  write([ana, answer, rui]);
  await ctx.waitFor(`${row(12)}?.dataset.k === 'you'`, { timeout: 20_000, what: '#12 at your move again' });
  out.again = await rowSays(12);
  ctx.assert.match(out.again.say, /before: 1 comment from ana .+ → you answered /, out.again.say);
  await ctx.shot('3-new-round');
  return out;
}
