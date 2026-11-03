// A chat's agents on a same-height card (2026-11-03): its rows open as on any compact card, the card growing while it has them and
// the rest of the list keeping one height; the rows take the place the card holds; the chip folds them, and folded the card is
// one height again, its live line saying who stepped last, or none where a PR at your move has that line; ended, a summary fits
// the place exactly and its click still lists them; a card told not to has no rows. Shots dark and light.
import { spawn } from 'node:child_process';
import { appendFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentFiles, makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

const dir = tmpDir('peix-gh-'), file = join(dir, 'prs.json');
const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const user = login => ({ login, __typename: 'User', avatarUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#8250df"/></svg>') });
writeFileSync(file, JSON.stringify({ 'acme/moved#12': {
  state: 'OPEN', title: 'Base of the follow-up', createdAt: ago(300), headRefOid: 'B', author: user('ana'), viewerLatestReview: { submittedAt: ago(60), commit: { oid: 'A' } }, reviewRequests: { nodes: [] },
  reviews: { nodes: [{ author: user('me'), state: 'CHANGES_REQUESTED', submittedAt: ago(60) }] }, comments: { nodes: [] }, pushes: { nodes: [{ __typename: 'PullRequestCommit', commit: { committedDate: ago(30), author: { user: { login: 'ana' } } } }] }, asks: { nodes: [] },
} }));

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'compact', cardsEven: true, lanesShut: [] },
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, FAKEGH_VIEWER: 'me', PR_WATCH_MS: '500' } };
const MIN = 60_000;

export default async function (ctx) {
  const now = Date.now(), root = realpathSync(tmpDir('peix-agl-')), sleeps = [0, 1, 2, 3].map(() => spawn('sleep', ['300'], { stdio: 'ignore' }));
  const live = i => ({ pid: sleeps[i].pid, startedAt: now - 60 * MIN });
  const card = id => `#slist > .card[data-id="${id}"]`;
  const rows = id => ctx.evaluate(`[...document.querySelectorAll('${card(id)} .agl .agr')].map(r => ({ k: r.dataset.k, st: r.dataset.st, a: r.querySelector('.aga').textContent, t: r.querySelector('.agt').textContent, n: r.querySelector('.agn').textContent }))`);
  const chip = id => ctx.evaluate(`(c => !c || c.hidden ? '' : c.textContent.trim())(document.querySelector('${card(id)} .chip.agents'))`);
  const height = id => ctx.evaluate(`document.querySelector('${card(id)}').getBoundingClientRect().height`);
  const shown = (id, sel) => ctx.evaluate(`(e => !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0)(document.querySelector('${card(id)} ${sel}'))`);
  const report = (f, text) => appendFileSync(f, JSON.stringify({ isSidechain: true, type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn' } }) + '\n');
  const finish = (f, meta) => writeFileSync(f.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: 'general-purpose', finished: true, ...meta }));
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd: join(root, 'infra'), title: 'One agent, named', prompt: 'review it', reply: 'Sending it out.', at: new Date(now - 100_000), live: live(0) },
      { cwd: join(root, 'storefront'), title: 'Three agents at once', prompt: 'look at these', reply: 'Three of them.', at: new Date(now - 200_000), live: live(1) },
      { cwd: join(root, 'moved'), title: 'An agent, and a PR at your move', prompt: 'look at https://github.com/acme/moved/pull/12', reply: 'On https://github.com/acme/moved/pull/12 now.', at: new Date(now - 300_000), live: live(2) },
      { cwd: join(root, 'nothing'), title: 'No agents at all', prompt: 'hi', reply: 'Hello.', at: new Date(now - 400_000), live: live(3) },
    ]);
    const [one, three, moved, none] = chats;
    await ctx.waitFor(`!!document.querySelector('${card(none.id)}')`, { what: 'the plain card' });
    await ctx.settle();
    const base = await height(none.id);
    const solo = agentFiles({ dir: ctx.fixture.dir, lead: one, agents: [{ id: 'rev', name: 'code-review', asked: '/code-review https://github.com/acme/infra/pull/9', ago: 2 * MIN, tool: 'toolu_rev', steps: ['Inspect the connection closing code'] }] });
    const many = agentFiles({ dir: ctx.fixture.dir, lead: three, agents: [
      { id: 'sec', asked: 'Review the plan for security', ago: 9 * MIN, tool: 'toolu_sec', steps: ['Parse the plan for ingress rules'] },
      { id: 'cost', asked: 'Price the NAT gateways', ago: 8 * MIN, tool: 'toolu_cost', steps: ['Count the gateways by zone'] },
      { id: 'blast', asked: 'Map the blast radius', ago: 7 * MIN, tool: 'toolu_blast', steps: ['Diff the route tables'] },
    ] });
    agentFiles({ dir: ctx.fixture.dir, lead: moved, agents: [{ id: 'mv', name: 'code-review', asked: 'Review the follow-up', ago: 3 * MIN, tool: 'toolu_mv', steps: ['Read the diff'] }] });
    await ctx.waitFor(`document.querySelectorAll('${card(one.id)} .agl .agr[data-ag]').length === 1 && document.querySelectorAll('${card(three.id)} .agl .agr[data-ag]').length === 3`, { what: 'their rows', timeout: 20000 });
    await ctx.waitFor(`!!document.querySelector('${card(moved.id)} .state.prmove') && document.querySelectorAll('${card(moved.id)} .agl .agr[data-ag]').length === 1`, { what: 'the PR at your move, and its agent', timeout: 20000 });
    await ctx.settle();

    // open, as on any compact card: asked and doing on a line each, the age; the chip with its caret
    const [line] = await rows(one.id);
    ctx.assert.deepEqual([line.k, line.st, line.a, line.n], ['rev', 'run', 'code-review /code-review https://github.com/acme/infra/pull/9', 'Inspect the connection closing code'], 'its name, what it was asked, what it does');
    ctx.assert.match(line.t, /at work, 2m/);
    ctx.assert.equal(await chip(one.id), '1 agent');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(one.id)} .chip.agents').getAttribute('aria-expanded')`), 'true');
    ctx.assert.deepEqual((await rows(three.id)).map(r => r.k), ['sec', 'cost', 'blast'], 'a row each');
    ctx.assert.equal(await chip(three.id), '3 agents');
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('${card(one.id)} .state.moveslot')).display`), 'none', 'in the place the card holds, no gap under them');
    const grown = { one: await height(one.id), three: await height(three.id) };
    ctx.assert.ok(grown.one > base && grown.three > grown.one, `it grows with them: ${base}, ${grown.one}, ${grown.three}`);
    ctx.assert.equal(await height(none.id), base, 'the plain card as it was');
    await ctx.shot('agent-even-dark');

    // a PR at your move stays, under the rows
    ctx.assert.equal(await shown(moved.id, '.state.prmove'), true, 'the move keeps its line');
    ctx.assert.equal(await shown(moved.id, '.agl'), true, 'and the rows are there');

    // the way in, as anywhere
    await ctx.evaluate(`document.querySelector('${card(one.id)} .agr').click()`);
    await ctx.waitFor(`!document.querySelector('#agv').hidden && document.querySelector('#agv .agvh b')?.textContent === 'code-review'`, { what: 'its tab, from its row' });
    ctx.assert.equal(await ctx.evaluate(`window.peix.state().current`), one.id, 'on its chat');
    await ctx.evaluate(`document.querySelector('#agv .agvx').click()`);
    await ctx.waitFor(`document.querySelector('#agv').hidden`, { what: 'its tab closed' });
    await ctx.openChat(none.id);

    // the chip folds: one height again, its live line saying who stepped last, in the same place
    await ctx.evaluate(`document.querySelector('${card(three.id)} .chip.agents').click()`);
    await ctx.settle();
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(three.id)} .agl').hidden`), true, 'the chip folds them');
    ctx.assert.equal(await height(three.id), base, 'folded: one height');
    ctx.assert.match(await ctx.evaluate(`document.querySelector('${card(three.id)} .state.live.agwho').textContent`), /^(Review the plan for security|Price the NAT gateways|Map the blast radius)/, 'who stepped last');
    ctx.assert.equal(await shown(three.id, '.state.live.agwho'), true);
    await ctx.shot('agent-even-folded');
    // with a move: its line stays, the who-line gives way
    await ctx.evaluate(`document.querySelector('${card(moved.id)} .chip.agents').click()`);
    await ctx.settle();
    ctx.assert.equal(await height(moved.id), base, 'folded with a move: one height');
    ctx.assert.equal(await shown(moved.id, '.state.prmove'), true);
    ctx.assert.equal(await chip(moved.id), '1 agent', 'the chip says there is one');
    await ctx.evaluate(`document.querySelector('${card(moved.id)} .chip.agents').click()`);
    await ctx.evaluate(`document.querySelector('${card(three.id)} .chip.agents').click()`);
    await ctx.settle();
    ctx.assert.equal(await height(three.id), grown.three, 'and open again');

    // ended: one height at once, a summary in the place held; its click still lists them, and back
    for (const [id, t] of [['sec', 'One'], ['cost', 'Two'], ['blast', 'Three']]) { report(many.files[id], t); finish(many.files[id], { description: id, toolUseId: `toolu_${id}` }); }
    await ctx.waitFor(`!!document.querySelector('${card(three.id)} [data-k="_sum"]') && document.querySelectorAll('${card(three.id)} .agl .agr').length === 1`, { what: 'the summary', timeout: 8000 });
    ctx.assert.match((await rows(three.id))[0].a, /^3 agents · \d+m$/);
    await ctx.settle();
    ctx.assert.equal(await height(three.id), base, 'a summary fits the place held, to the fraction');
    await ctx.evaluate(`document.querySelector('${card(three.id)} [data-k="_sum"]').click()`);
    await ctx.settle();
    ctx.assert.deepEqual((await rows(three.id)).map(r => r.k), ['_sum', 'sec_d', 'cost_d', 'blast_d'], 'its list, in place');
    await ctx.evaluate(`document.querySelector('${card(three.id)} [data-k="_sum"]').click()`);
    await ctx.settle();
    ctx.assert.equal(await height(three.id), base, 'and back');
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }); await ctx.settle();
    await ctx.shot('agent-even-light');
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });

    // seen: nothing left of it
    await ctx.openChat(three.id);
    await ctx.openChat(none.id);
    await ctx.waitFor(`document.querySelector('${card(three.id)} .agl').hidden`, { what: 'seen: gone once left', timeout: 4000 });
    await ctx.settle();
    ctx.assert.equal(await height(three.id), base);

    // a card told not to: no rows, the place held
    await ctx.evaluate(`(() => { const k = 'peixairada-prefs', p = JSON.parse(localStorage.getItem(k)); p.cardParts = ['prs', 'rounds', 'tickets', 'faces']; p.cardPartsSeen = 1; localStorage.setItem(k, JSON.stringify(p)); })()`);
    await ctx.reload();
    await ctx.waitFor(`!!document.querySelector('${card(one.id)} .chip.agents:not([hidden])')`, { what: 'the card back' });
    await ctx.settle();
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('${card(one.id)} .agl')).display`), 'none', 'no rows');
    ctx.assert.equal(await height(one.id), base, 'one height');
    return { base, grown };
  } finally { for (const p of sleeps) p.kill(); rmSync(dir, { recursive: true, force: true }); }
}
