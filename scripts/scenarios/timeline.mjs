// The timeline tab (2026-10-17): one chat and its PRs in one order. A morning of the made-up storefront chat — four
// prompts, the PRs they opened and answered (gh calls of the chat's own), and GitHub's side from the fake gh, moved
// step by step so the board sees each round come and go as it would: #482 yours (joel reviewed → the chat commented →
// mara asked: your move), #479 kenji's (pushed after your changes → the chat approved), #486 yours (priya approved →
// let go), #470 merged long ago and named once. What this checks: ⌥⌘J opens the tab beside the chat, and again fills
// the column; the rows — your prompts, each turn as one line with what it did to a PR, the PRs' events between them —
// in order with a lane per PR in play (the merged one only mentioned stays out); the Now bar; a turn clicked shows it
// in the transcript in the other half.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';
import { slugOf } from '../fixture.mjs';

const root = tmpDir('peix-tv-'), claudeDir = join(root, 'claude'), cwd = join(root, 'storefront'), file = join(root, 'prs.json');
mkdirSync(join(claudeDir, 'sessions'), { recursive: true }); mkdirSync(cwd, { recursive: true });
const now = Date.now(), at = min => new Date(now - min * 60_000), iso = min => at(min).toISOString().replace(/\.\d+Z$/, 'Z');
const PR = n => `https://github.com/acme/storefront/pull/${n}`;

// the chat, written as Claude Code writes it
const id = randomUUID(), base = { isSidechain: false, userType: 'external', entrypoint: 'cli', cwd, sessionId: id, version: 'fixture', gitBranch: 'main' };
const lines = [];
const you = (min, text) => lines.push({ ...base, parentUuid: null, type: 'user', uuid: randomUUID(), timestamp: at(min).toISOString(), message: { role: 'user', content: [{ type: 'text', text }] } });
const said = (min, text, end = true) => lines.push({ ...base, parentUuid: null, type: 'assistant', uuid: randomUUID(), timestamp: at(min).toISOString(),
  message: { model: 'fixture-1', id: 'msg_' + randomUUID().slice(0, 8), type: 'message', role: 'assistant', content: [{ type: 'text', text }], stop_reason: end ? 'end_turn' : 'tool_use' } });
const tool = (min, name, input, result) => {
  const use = 'toolu_' + randomUUID().replace(/-/g, '').slice(0, 20);
  lines.push({ ...base, parentUuid: null, type: 'assistant', uuid: randomUUID(), timestamp: at(min).toISOString(), message: { model: 'fixture-1', id: 'msg_' + use.slice(6, 14), type: 'message', role: 'assistant', content: [{ type: 'tool_use', id: use, name, input }], stop_reason: 'tool_use' } });
  lines.push({ ...base, parentUuid: null, type: 'user', uuid: randomUUID(), timestamp: new Date(at(min).getTime() + 1000).toISOString(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: use, content: result }] } });
};
you(184, 'Declined cards should retry with backoff before we show the error.');
tool(181, 'Edit', { file_path: `${cwd}/src/checkout/payments.ts` }, 'The file has been updated.');
tool(180, 'Bash', { command: 'gh pr create --fill', description: 'Open the PR' }, PR(482));
said(179, `Opened ${PR(482)}: three tries, 200 ms doubling, then the error as before.`);
you(128, `joel reviewed ${PR(482)}, address his two comments`);
tool(120, 'Edit', { file_path: `${cwd}/src/checkout/payments.ts` }, 'The file has been updated.');
tool(118, 'Edit', { file_path: `${cwd}/src/checkout/retry.ts` }, 'The file has been updated.');
tool(112, 'Bash', { command: `gh pr comment ${PR(482)} --body "Capped the jitter; the retry count is a setting now."`, description: 'Answer the review' }, PR(482) + '#issuecomment-1');
said(111, 'Done: the jitter is capped and the retry count is a setting now. I answered both of joel’s threads.');
you(82, `Now email a receipt after checkout, a separate PR, the way ${PR(470)} split the SDK bump`);
tool(76, 'Edit', { file_path: `${cwd}/src/checkout/receipt.ts` }, 'The file has been updated.');
tool(74, 'Bash', { command: 'gh pr create --fill', description: 'Open the PR' }, PR(486));
said(73, `Opened ${PR(486)}: the receipt goes out from the order-completed handler, with the order’s lines and totals.`);
you(55, `kenji pushed to ${PR(479)}, review it again`);
tool(23, 'Bash', { command: `gh pr review ${PR(479)} --approve`, description: 'Approve it' }, '✓ Approved pull request #479');
said(21, 'Approved #479: the two things you asked for are fixed, and the snapshots match.');
const dir = join(claudeDir, 'projects', slugOf(cwd)); mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${id}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n') + '\n');

// GitHub's side, in three looks
const face = (login, fill) => ({ login, __typename: 'User', avatarUrl: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${fill}"/></svg>`) });
const me = face('me', '#c96442'), joel = face('joel', '#2e9e6a'), mara = face('mara', '#d14d72'), priya = face('priya', '#8a5cf6'), kenji = face('kenji', '#e5892a');
const pr = o => ({ state: 'OPEN', headRefOid: 'A', viewerLatestReview: null, reviewRequests: { nodes: [] }, reviews: { nodes: [] }, comments: { nodes: [] }, pushes: { nodes: [] }, asks: { nodes: [] }, ...o });
const push = (who, min) => ({ __typename: 'PullRequestCommit', commit: { committedDate: iso(min), author: { user: { login: who.login } } } });
const ci = state => ({ commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] } });
function look(step) {
  writeFileSync(file, JSON.stringify({
    'acme/storefront#482': pr({ title: 'Retry declined card payments with backoff', createdAt: iso(180), author: me, pushes: { nodes: [push(me, 181)] }, ...ci(['PENDING', 'SUCCESS', 'FAILURE'][step - 1]),
      reviews: { nodes: [{ author: joel, state: 'COMMENTED', submittedAt: iso(130) }] },
      comments: { nodes: [...step >= 2 ? [{ author: me, createdAt: iso(112) }] : [], ...step >= 3 ? [{ author: mara, createdAt: iso(25) }] : []] } }),
    'acme/storefront#479': pr({ title: 'Product grid follows the dark theme', createdAt: iso(300), author: kenji, headRefOid: 'B',
      viewerLatestReview: { submittedAt: iso(step >= 2 ? 22 : 150), commit: { oid: step >= 2 ? 'B' : 'A' } },
      reviews: { nodes: [{ author: me, state: 'CHANGES_REQUESTED', submittedAt: iso(150) }, ...step >= 2 ? [{ author: me, state: 'APPROVED', submittedAt: iso(22) }] : []] },
      pushes: { nodes: [push(kenji, 69), push(kenji, 66), push(kenji, 63), push(kenji, 60)] } }),
    'acme/storefront#486': pr({ title: 'Email a receipt after checkout', createdAt: iso(74), author: me, pushes: { nodes: [push(me, 76)] },
      reviews: { nodes: [{ author: priya, state: 'APPROVED', submittedAt: iso(40) }] } }),
    'acme/storefront#470': pr({ state: 'MERGED', title: 'Bump the payments SDK to v5', createdAt: iso(3 * 1440), author: me,
      marks: { nodes: [{ __typename: 'MergedEvent', createdAt: iso(2 * 1440), url: PR(470), actor: { login: 'me', __typename: 'User' } }] } }),
  }));
}
look(1);

export const meta = {
  server: true, fixture: claudeDir,
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, FAKEGH_VIEWER: 'me', PR_WATCH_MS: '500' },
  prefs: { cards: 'compact' },
};

export default async function (ctx) {
  const out = {}, a = ctx.assert;
  const turn = n => `document.querySelector('#slist > .card[data-id="${id}"] .cpr[data-url$="/${n}"]')?.dataset.turn`;
  const T = (expr, what) => ctx.waitFor(expr, { timeout: 25_000, what });
  const round = (n, k) => `(window.peix.session('${id}')?.prs || []).find(p => p.url.endsWith('/${n}'))?.rounds?.at(-1)?.${k}`;
  const rows = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#tv .tvl .tvr')].map(r => ({ k: r.className.replace('tvr ', ''), t: [...r.querySelector('.ct').childNodes].map(n => n.textContent).join(' ').replace(/\\s+/g, ' ').trim(), ms: +r.dataset.ms || 0, lanes: r.querySelectorAll('.ln').length, em: [...r.querySelectorAll('.ln em')].map(e => e.className) })))`).then(JSON.parse);

  await ctx.openChat(id);
  await T(`${turn(482)} === 'you' && ${turn(479)} === 'you' && ${turn(486)} === 'you'`, 'three PRs at your move');
  // the board sees each round end as GitHub moves on: your comment on #482, your approval of #479
  look(2);
  await T(`${round(482, 'how')} === 'answered' && ${round(479, 'how')} === 'answered'`, '#482 and #479 answered');
  await ctx.server.post(`/api/sessions/${id}/waive`, { url: PR(486) });
  await T(`${turn(486)} === 'them'`, '#486 let go');
  look(3);
  await T(`${turn(482)} === 'you' && !${round(482, 'end')}`, 'mara\'s comment: #482 at your move again');

  // ⌥⌘J: the timeline, beside the chat
  await ctx.key('KeyJ');
  await T(`!document.querySelector('#tv').hidden && document.querySelector('#tv').closest('#gbodyB') && document.querySelectorAll('#tv .tvr').length > 8`, 'the timeline in the second half');
  await ctx.settle();
  out.half = await ctx.evaluate(`JSON.stringify({ lone: document.querySelector('#ptabsB').classList.contains('lone'), keys: document.querySelector('#grpB').classList.contains('on') })`).then(JSON.parse);
  a.deepEqual(out.half, { lone: true, keys: true }, 'its own half, the keys in it, no strip for one tab');
  out.rows = await rows();
  const yous = out.rows.filter(r => r.k === 'you'), cls = out.rows.filter(r => r.k.startsWith('cl')), evs = out.rows.filter(r => r.k.startsWith('ev'));
  a.equal(yous.length, 4, 'every prompt a bubble');
  a.equal(cls.length, 4, 'every turn a line');
  a.match(cls[0].t, /^Claude worked \d+m · 1 edit · opened #482/, `a turn in one line: ${cls[0].t}`);
  a.match(cls[1].t, /2 edits · commented #482 ✓ answers/, `the push that answered the round: ${cls[1].t}`);
  a.match(cls[3].t, /reviewed #479 ✓ answers/, cls[3].t);
  a.ok(evs.some(r => /#482 joel reviewed/.test(r.t) && r.em.includes('move')), 'joel\'s review: a move, ringed on its lane');
  a.ok(evs.some(r => /#482 mara commented.*your move/i.test(r.t) && r.k.includes('live')), 'mara\'s comment: the move at your move now');
  a.ok(evs.some(r => /#486 you let this round go/.test(r.t)), 'the round let go');
  a.ok(evs.some(r => /#482 CI failed/.test(r.t) && r.em.includes('bad')), 'CI turning red: the ledger\'s, its mark red');
  a.ok(!out.rows.some(r => /#470/.test(r.t) && r.k.startsWith('ev')), 'the merged PR, only mentioned, has no events in the narrow');
  a.equal(out.rows[0].lanes, 4, 'a lane for the chat and each PR in play');
  a.ok(out.rows.every((r, i) => !i || !r.ms || r.ms >= out.rows[i - 1].ms), 'in the order things happened, newest at the bottom');
  out.now = await ctx.evaluate(`[...document.querySelectorAll('#tv .tvnow .tvnr')].map(r => r.dataset.k + ' ' + r.querySelector('.pchip').textContent)`);
  a.deepEqual(out.now.sort(), ['let #486', 'ok #479', 'you #482'], `the Now bar: ${out.now}`);
  await ctx.shot('1-timeline');

  // ⌥⌘J again: the half fills the column, and back
  await ctx.key('KeyJ');
  await T(`document.querySelector('#groups').classList.contains('zoomed')`, 'the timeline filling the column');
  await ctx.key('KeyJ');
  await T(`!document.querySelector('#groups').classList.contains('zoomed')`, 'the halves back');

  // a turn clicked: the transcript beside it, at that turn
  await ctx.evaluate(`document.querySelectorAll('#tv .tvr.cl')[1].click()`);
  await T(`document.querySelector('#log .msg.tvhit') && !document.querySelector('#log').hidden`, 'the turn lit in the transcript');
  out.hit = await ctx.evaluate(`document.querySelector('#log .msg.tvhit').textContent.includes('address his two comments')`);
  a.ok(out.hit, 'the transcript at that turn\'s prompt');

  // "to the move" in the Now bar
  await ctx.evaluate(`document.querySelector('#tv .tvnr[data-k="you"] .tvgo').click()`);
  await T(`document.querySelector('#tv .tvr.flash')?.textContent.includes('mara')`, 'the move lit');
  return out;
}
