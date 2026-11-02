// A chat's agents on a same-height card (2026-11-02): one line, in the move line's place, so no card grows. One agent: its name,
// what it does and its age, no chip, the line a way into its transcript and its menu and card too; several: the first at work,
// the chip counting them and listing them; ended: its row until the chat is seen, several a summary that lists them; a PR at your
// move keeps the line, the chip then names the agent and opens it; a card told not to has no line. Shots dark and light.
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
  const rows = id => ctx.evaluate(`[...document.querySelectorAll('${card(id)} .agl .agr')].map(r => ({ k: r.dataset.k, st: r.dataset.st, a: r.querySelector('.aga').textContent, t: r.querySelector('.agt').textContent, n: r.querySelector('.agn').textContent, h: getComputedStyle(r.closest('.agl')).display === 'none' ? 0 : r.getBoundingClientRect().height }))`);
  const chip = id => ctx.evaluate(`(c => !c || c.hidden ? '' : c.textContent.trim())(document.querySelector('${card(id)} .chip.agents'))`);
  const heights = () => ctx.evaluate(`[...new Set([...document.querySelectorAll('#slist > .card')].map(c => c.getBoundingClientRect().height))]`);
  const oneHeight = async what => { await ctx.settle(); const h = await heights(); ctx.assert.equal(h.length, 1, `${what}: one height, not ${h}`); return h[0]; };
  const report = (f, text) => appendFileSync(f, JSON.stringify({ isSidechain: true, type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn' } }) + '\n');
  const finish = (f, meta) => writeFileSync(f.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: 'general-purpose', finished: true, ...meta }));
  const closeTab = async () => { await ctx.evaluate(`document.querySelector('#agv .agvx').click()`); await ctx.waitFor(`document.querySelector('#agv').hidden`, { what: 'its tab closed' }); };
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd: join(root, 'infra'), title: 'One agent, named', prompt: 'review it', reply: 'Sending it out.', at: new Date(now - 100_000), live: live(0) },
      { cwd: join(root, 'storefront'), title: 'Three agents at once', prompt: 'look at these', reply: 'Three of them.', at: new Date(now - 200_000), live: live(1) },
      { cwd: join(root, 'moved'), title: 'An agent, and a PR at your move', prompt: 'look at https://github.com/acme/moved/pull/12', reply: 'On https://github.com/acme/moved/pull/12 now.', at: new Date(now - 300_000), live: live(2) },
      { cwd: join(root, 'nothing'), title: 'No agents at all', prompt: 'hi', reply: 'Hello.', at: new Date(now - 400_000), live: live(3) },
    ]);
    const [one, three, moved, none] = chats;
    const base = await ctx.waitFor(`document.querySelector('${card(none.id)}')?.getBoundingClientRect().height`, { what: 'the plain card' }).then(() => ctx.settle()).then(() => ctx.evaluate(`document.querySelector('${card(none.id)}').getBoundingClientRect().height`));
    const solo = agentFiles({ dir: ctx.fixture.dir, lead: one, agents: [{ id: 'rev', name: 'code-review', asked: '/code-review https://github.com/acme/infra/pull/9', ago: 2 * MIN, tool: 'toolu_rev', steps: ['Inspect the connection closing code'] }] });
    const many = agentFiles({ dir: ctx.fixture.dir, lead: three, agents: [
      { id: 'sec', asked: 'Review the plan for security', ago: 9 * MIN, tool: 'toolu_sec', steps: ['Parse the plan for ingress rules'] },
      { id: 'cost', asked: 'Price the NAT gateways', ago: 8 * MIN, tool: 'toolu_cost', steps: ['Count the gateways by zone'] },
      { id: 'blast', name: 'blast', asked: 'Map the blast radius', ago: 7 * MIN, tool: 'toolu_blast', steps: ['Diff the route tables'] },
    ] });
    agentFiles({ dir: ctx.fixture.dir, lead: moved, agents: [{ id: 'mv', name: 'code-review', asked: 'Review the follow-up', ago: 3 * MIN, tool: 'toolu_mv', steps: ['Read the diff'] }] });

    // one agent: its line, no chip, and every card still one height
    await ctx.waitFor(`document.querySelectorAll('${card(one.id)} .agl .agr[data-ag]').length === 1`, { what: 'the one line', timeout: 20000 });
    await ctx.waitFor(`document.querySelectorAll('${card(three.id)} .agl .agr[data-ag]').length === 1`, { what: 'the first of three', timeout: 20000 });
    await ctx.waitFor(`!!document.querySelector('${card(moved.id)} .state.prmove') && !!document.querySelector('${card(moved.id)} .chip.agents:not([hidden])')`, { what: 'the PR at your move, and its agent', timeout: 20000 });
    const [line] = await rows(one.id);
    ctx.assert.deepEqual([line.k, line.st, line.a, line.n], ['rev', 'run', 'code-review', 'Inspect the connection closing code'], 'its name, what it does');
    ctx.assert.match(line.t, /at work, 2m/);
    ctx.assert.equal(await chip(one.id), '', 'the line says it all: no chip');
    ctx.assert.equal(await ctx.evaluate(`Math.abs(document.querySelector('${card(one.id)} .agr').getBoundingClientRect().top - document.querySelector('${card(one.id)} .state.moveslot').getBoundingClientRect().top) < 1`), true, 'over the place the card holds');
    ctx.assert.equal(await oneHeight('with a line'), base, 'and as tall as a card with none');
    const onLine = await ctx.evaluate(`(r => { const c = r.closest('.card').getBoundingClientRect(), o = r.getBoundingClientRect(); const a = r.querySelector('.aga').getBoundingClientRect(), n = r.querySelector('.agn').getBoundingClientRect(), t = r.querySelector('.agt').getBoundingClientRect(); return { oneLine: a.top < n.bottom && n.top < a.bottom && n.top < t.bottom && t.top < n.bottom, inOrder: a.right <= n.left && n.right <= t.left, inside: o.right <= c.right && o.bottom <= c.bottom }; })(document.querySelector('${card(one.id)} .agr'))`);
    ctx.assert.deepEqual(onLine, { oneLine: true, inOrder: true, inside: true }, 'name, doing and age on one line, inside the card');
    ctx.assert.equal(await ctx.evaluate(`(r => !!document.elementFromPoint(r.left + 60, r.top + r.height / 2)?.closest('.agr[data-ag="rev"]'))(document.querySelector('${card(one.id)} .agr').getBoundingClientRect())`), true, 'and the pointer finds it, over the place held');
    await ctx.shot('agent-line-dark');

    // the line is the way in, by click and by key; its right-click and card are the row's
    await ctx.evaluate(`document.querySelector('${card(one.id)} .agr').click()`);
    await ctx.waitFor(`!document.querySelector('#agv').hidden && document.querySelector('#agv .agvh b')?.textContent === 'code-review'`, { what: 'its tab, from the line' });
    ctx.assert.equal(await ctx.evaluate(`window.peix.state().current`), one.id, 'on its chat');
    await ctx.settle();
    await ctx.shot('agent-line-tab');
    await closeTab();

    // several: the first at work and the count, whose click lists them; a pick opens that one
    const [first] = await rows(three.id);
    ctx.assert.deepEqual([first.k, first.a, first.n], ['sec', 'Review the plan for security', 'Parse the plan for ingress rules'], 'the oldest at work');
    ctx.assert.equal(await chip(three.id), '3 agents');
    await ctx.evaluate(`document.querySelector('${card(three.id)} .chip.agents').click()`);
    await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: 'the list' });
    const listed = await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].map(b => [b.querySelector('.ct').textContent, b.querySelector('.csub').textContent])`);
    ctx.assert.deepEqual(listed.map(l => l[0]), ['Review the plan for security', 'Price the NAT gateways', 'blast'], 'all three, a name where it has one');
    ctx.assert.match(listed[2][1], /^at work 7m · Diff the route tables$/, 'what each does');
    ctx.assert.equal(await ctx.evaluate(`window.peix.state().current`), one.id, 'the chip opened no chat by itself');
    await ctx.settle();
    await ctx.shot('agent-line-list');
    await ctx.evaluate(`document.querySelectorAll('#ctxm button')[1].click()`);
    await ctx.waitFor(`!document.querySelector('#agv').hidden && document.querySelector('#agv .agvh b')?.textContent === 'Price the NAT gateways'`, { what: 'that one’s tab' });
    ctx.assert.equal(await ctx.evaluate(`window.peix.state().current`), three.id, 'on its chat');
    await closeTab();
    await ctx.openChat(none.id);

    // a step changes the line's words, not the card's node
    await ctx.evaluate(`document.querySelector('${card(one.id)}')._mark = 1`);
    appendFileSync(solo.files.rev, JSON.stringify({ isSidechain: true, type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_next', name: 'Bash', input: { description: 'Read the retry loop' } }], stop_reason: 'tool_use' } }) + '\n');
    await ctx.waitFor(`document.querySelector('${card(one.id)} .agr .agn').textContent === 'Read the retry loop'`, { what: 'its next step', timeout: 8000 });
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(one.id)}')._mark`), 1, 'the card’s node kept');

    // a PR at your move keeps the line; the chip names the agent, and opens it
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(moved.id)} .agl').hidden`), true, 'no line');
    ctx.assert.equal(await chip(moved.id), 'code-review', 'the chip says who');
    await oneHeight('with a move');
    await ctx.evaluate(`document.querySelector('${card(moved.id)} .chip.agents').click()`);
    await ctx.waitFor(`!document.querySelector('#agv').hidden && document.querySelector('#agv .agvh b')?.textContent === 'code-review'`, { what: 'its tab, from the chip' });
    await closeTab();
    await ctx.openChat(none.id);

    // ended: its row until the chat is seen, and a click still reaches it
    report(solo.files.rev, 'Twelve findings, three of them serious.'); finish(solo.files.rev, { description: 'Review', name: 'code-review', toolUseId: 'toolu_rev' });
    await ctx.waitFor(`document.querySelector('${card(one.id)} .agr[data-ag="rev"]')?.dataset.st === 'done'`, { what: 'it ended', timeout: 8000 });
    await ctx.waitFor(`document.querySelector('${card(one.id)} .agr .agn')?.textContent === 'Twelve findings, three of them serious.'`, { what: 'what it came to', timeout: 8000 });
    await oneHeight('ended');
    for (const [id, t] of [['sec', 'One'], ['cost', 'Two'], ['blast', 'Three']]) { report(many.files[id], t); finish(many.files[id], { description: id, toolUseId: `toolu_${id}` }); }
    await ctx.waitFor(`!!document.querySelector('${card(three.id)} [data-k="_sum"]')`, { what: 'the summary', timeout: 8000 });
    ctx.assert.match((await rows(three.id))[0].a, /^3 agents · \d+m$/);
    await oneHeight('a summary');
    await ctx.evaluate(`document.querySelector('${card(three.id)} [data-k="_sum"]').click()`);
    await ctx.waitFor(`document.querySelector('#ctxm').open && document.querySelectorAll('#ctxm button').length === 3`, { what: 'the summary lists them' });
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(three.id)} .agl').children.length`), 1, 'still one line');
    await ctx.evaluate(`document.querySelector('#ctxm').close()`);
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }); await ctx.settle();
    await ctx.shot('agent-line-light');
    await ctx.openChat(three.id);
    await ctx.openChat(none.id);
    await ctx.waitFor(`document.querySelector('${card(three.id)} .agl').hidden`, { what: 'seen: gone once left', timeout: 4000 });

    // a card told not to: the place held, nothing said but the chip's count
    await ctx.evaluate(`(() => { const k = 'peixairada-prefs', p = JSON.parse(localStorage.getItem(k)); p.cardParts = ['prs', 'rounds', 'tickets', 'faces']; p.cardPartsSeen = 1; localStorage.setItem(k, JSON.stringify(p)); })()`);
    await ctx.reload();
    await ctx.waitFor(`!!document.querySelector('${card(moved.id)} .chip.agents:not([hidden])')`, { what: 'the card back' });
    ctx.assert.equal(await chip(moved.id), '1 agent', 'no name');
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('${card(one.id)} .agl')).display`), 'none', 'no line');
    await oneHeight('told not to');
    return { base };
  } finally { for (const p of sleeps) p.kill(); rmSync(dir, { recursive: true, force: true }); }
}
