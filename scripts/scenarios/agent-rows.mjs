// A chat's agents on its card (2026-11-02, round XX): a row each, while they work — what it was asked, what it does, its age —;
// a step keeps the card's node and the row's; one ended ticks and goes into the done row, its click the list with the results;
// nothing leaves under the pointer; a failure comes first, the chip red, and stays until the chat is opened, with the summary;
// the chip folds, remembered, and a folded card's live line says who stepped last; past three, +N; quiet after three minutes;
// a card told not to shows none (same height: agent-even.mjs). Shots dark and light.
import { spawn } from 'node:child_process';
import { appendFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentFiles, agentNoteLine, makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'compact', lanesShut: [] } };
const MIN = 60_000;

export default async function (ctx) {
  const out = {}, now = Date.now(), root = realpathSync(tmpDir('peix-ag-')), sleeps = [spawn('sleep', ['300'], { stdio: 'ignore' }), spawn('sleep', ['300'], { stdio: 'ignore' })];
  const live = i => ({ pid: sleeps[i].pid, startedAt: now - 60 * MIN });
  const card = id => `#slist > .card[data-id="${id}"]`;
  const rowsOf = id => ctx.evaluate(`[...document.querySelectorAll('${card(id)} .agl .agr')].map(r => ({ k: r.dataset.k, st: r.dataset.st, a: r.querySelector('.aga').textContent, t: r.querySelector('.agt').textContent, n: r.querySelector('.agn').textContent }))`);
  const ids = async id => (await rowsOf(id)).map(r => r.k);
  const chip = id => ctx.evaluate(`document.querySelector('${card(id)} .chip.agents')?.hidden ? '' : document.querySelector('${card(id)} .chip.agents')?.textContent.trim()`);
  const step = (f, text) => appendFileSync(f, JSON.stringify({ isSidechain: true, type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_' + Math.random().toString(36).slice(2), name: 'Bash', input: { description: text } }], stop_reason: 'tool_use' } }) + '\n');
  const report = (f, text) => { appendFileSync(f, JSON.stringify({ isSidechain: true, type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_hb', name: 'SubagentHandback', input: { message: text } }], stop_reason: 'tool_use' } }) + '\n'); appendFileSync(f, JSON.stringify({ isSidechain: true, type: 'user', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_hb', content: 'Handed back.' }] } }) + '\n'); };
  const finish = (f, meta) => writeFileSync(f.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: 'general-purpose', finished: true, ...meta }));
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd: join(root, 'infra'), title: 'Review the staging VPC plan', prompt: 'review the plan', reply: 'Sending three reviewers out.', at: new Date(now - 300_000), live: live(0) },
      { cwd: join(root, 'storefront'), title: 'Retry declined payments', prompt: 'retry them', reply: 'On it.', at: new Date(now - 400_000), live: live(1) },
    ]);
    const [lead, other] = chats;
    const { files } = agentFiles({ dir: ctx.fixture.dir, lead, agents: [
      { id: 'sec', asked: 'Review the plan for security', ago: 9 * MIN, tool: 'toolu_sec', steps: ['Parse the plan for ingress rules'] },
      { id: 'cost', asked: 'Price the NAT gateways', ago: 8 * MIN, tool: 'toolu_cost', steps: ['Count the gateways by zone'] },
      { id: 'blast', asked: 'Map the blast radius', ago: 7 * MIN, tool: 'toolu_blast', steps: ['Diff the route tables'] },
    ] });

    await ctx.waitFor(`document.querySelectorAll('${card(lead.id)} .agl .agr[data-ag]').length === 3`, { what: 'the three rows', timeout: 20000 });
    await ctx.settle();
    const rows = await rowsOf(lead.id);
    ctx.assert.deepEqual(rows.map(r => [r.a, r.st, r.n]), [['Review the plan for security', 'run', 'Parse the plan for ingress rules'], ['Price the NAT gateways', 'run', 'Count the gateways by zone'], ['Map the blast radius', 'run', 'Diff the route tables']], 'by start: asked, at work, what it does');
    ctx.assert.match(rows[0].t, /at work, 9m/, 'its age, and its state in words');
    ctx.assert.equal(await chip(lead.id), '3 agents');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(lead.id)}').style.getPropertyValue('--lights')`), '3', 'a light each');
    ctx.assert.equal(await chip(other.id), undefined, 'a chat with no agents has no chip');
    await ctx.shot('agent-rows-dark');

    // under the transcript of the chat you are reading, whatever its card has folded; and on the overview's tile, a line each
    await ctx.openChat(lead.id);
    await ctx.waitFor(`document.querySelectorAll('#log > .presence .agl .agr[data-ag]').length === 3`, { what: 'the rows under the transcript' });
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#log > .presence [data-k="cost"] .agn').textContent`), 'Count the gateways by zone');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#log').lastElementChild.matches('.presence') || document.querySelector('#log').lastElementChild.matches('.lognew')`), true, 'still the log\u2019s tail');
    await ctx.settle();
    await ctx.shot('agent-rows-presence');
    await ctx.evaluate(`document.querySelector('#log > .presence [data-k="cost"]').click()`);
    await ctx.waitFor(`!document.querySelector('#agv').hidden`, { what: 'its tab, from there too' });
    await ctx.evaluate(`document.querySelector('#agv .agvx').click()`);
    await ctx.waitFor(`document.querySelector('#agv').hidden`, { what: 'the tab closed' });
    await ctx.key('KeyA');
    await ctx.waitFor(`document.querySelector('#ov').open && document.querySelectorAll('#ov .ot[data-id="${lead.id}"] .agr[data-ag]').length === 3`, { what: 'the tile\u2019s rows' });
    ctx.assert.deepEqual(await ctx.evaluate(`[...document.querySelectorAll('#ov .ot[data-id="${lead.id}"] .agr[data-ag]')].map(r => [r.querySelector('.aga').textContent, r.querySelector('.agn').textContent])`), [['Review the plan for security', ''], ['Price the NAT gateways', ''], ['Map the blast radius', '']], 'one line each');
    await ctx.evaluate(`document.querySelector('#ov').close()`);
    await ctx.openChat(other.id);

    // a step: the row's words change, the card's node and the row's stay
    await ctx.evaluate(`(() => { const c = document.querySelector('${card(lead.id)}'); c._mark = 1; c.querySelector('[data-k="sec"]')._mark = 1; })()`);
    step(files.sec, 'List groups wider than a /16');
    await ctx.waitFor(`document.querySelector('${card(lead.id)} [data-k="sec"] .agn').textContent === 'List groups wider than a /16'`, { what: 'its next step' });
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(lead.id)}')._mark === 1 && document.querySelector('${card(lead.id)} [data-k="sec"]')._mark === 1`), true, 'nodes kept');

    // one ends: it ticks, then goes into the done row; the chip counts it; the card keeps its node
    report(files.cost, '## Three gateways where one per zone would do\n\nDetails.'); finish(files.cost, { description: 'Price the NAT gateways', toolUseId: 'toolu_cost' });
    await ctx.waitFor(`document.querySelector('${card(lead.id)} [data-k="cost"]')?.dataset.st === 'done' || !!document.querySelector('${card(lead.id)} [data-k="_done"]')`, { what: 'it ended', timeout: 8000 });
    await ctx.waitFor(`!!document.querySelector('${card(lead.id)} [data-k="_done"]')`, { what: 'the done row', timeout: 8000 });
    ctx.assert.deepEqual(await ids(lead.id), ['sec', 'blast', '_done']);
    ctx.assert.equal(await chip(lead.id), '1/3 agents');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(lead.id)}')._mark`), 1, 'the card’s node kept');
    await ctx.evaluate(`document.querySelector('${card(lead.id)} [data-k="_done"]').click()`);
    const openedDone = await rowsOf(lead.id);
    ctx.assert.equal(openedDone.at(-1).n, 'Three gateways where one per zone would do', 'the list: its one-line result, its # gone');
    await ctx.evaluate(`document.querySelector('${card(lead.id)} [data-k="_done"]').click()`);
    ctx.assert.deepEqual(await ids(lead.id), ['sec', 'blast', '_done'], 'and back');

    // nothing leaves under the pointer
    const box = await ctx.evaluate(`(r => ({ x: r.left + 40, y: r.top + 12 }))(document.querySelector('${card(other.id)}').getBoundingClientRect())`);
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await ctx.waitFor(`document.querySelector('#slist').matches(':hover')`, { what: 'the pointer in the list' });
    report(files.sec, 'Two rules are wider than they need to be.'); finish(files.sec, { description: 'Review the plan for security', toolUseId: 'toolu_sec' });
    await ctx.waitFor(`document.querySelector('${card(lead.id)} [data-k="sec"]')?.dataset.st === 'done'`, { what: 'security ended', timeout: 8000 });
    await ctx.sleep(2000);
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(lead.id)} [data-k="sec"]')?.dataset.st`), 'done', 'past its tick, the row waits for the pointer');
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1200, y: 30 });
    await ctx.waitFor(`!document.querySelector('${card(lead.id)} [data-k="sec"]')`, { what: 'gone once the pointer left', timeout: 4000 });
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(lead.id)} [data-k="_done"] .aga').textContent`), '2 done');

    // a failure: first in its list, the chip red; and the last one ended, the summary. Both stay until the chat is opened.
    appendFileSync(lead.file, JSON.stringify(agentNoteLine({ id: lead.id, cwd: lead.cwd, tool: 'toolu_blast', asked: 'Map the blast radius', status: 'failed', said: 'failed: Agent terminated early due to an API error' })) + '\n');
    finish(files.blast, { description: 'Map the blast radius', toolUseId: 'toolu_blast' });
    await ctx.waitFor(`document.querySelector('${card(lead.id)} [data-k="blast"]')?.dataset.st === 'fail'`, { what: 'the failure', timeout: 8000 });
    await ctx.waitFor(`!!document.querySelector('${card(lead.id)} [data-k="_sum"]')`, { what: 'the summary', timeout: 8000 });
    const ended = await rowsOf(lead.id);
    ctx.assert.deepEqual(ended.map(r => r.k), ['blast', '_sum']);
    ctx.assert.equal(ended[0].n, 'Agent terminated early due to an API error', 'why');
    ctx.assert.match(ended[1].a, /^3 agents · \d+m · 1 failed$/);
    ctx.assert.match(await ctx.evaluate(`document.querySelector('#agSay').textContent`), /An agent failed on Review the staging VPC plan: Map the blast radius/, 'said once, for a screen reader');
    ctx.assert.equal(await chip(lead.id), '', 'the summary says it: no chip');
    await ctx.shot('agent-rows-failed');
    await ctx.openChat(lead.id);
    ctx.assert.deepEqual(await ids(lead.id), ['blast', '_sum'], 'open: still there');
    await ctx.openChat(other.id);
    await ctx.waitFor(`document.querySelector('${card(lead.id)} .agl').hidden`, { what: 'seen: gone once left', timeout: 4000 });

    // a new round: its rows alone
    const round = agentFiles({ dir: ctx.fixture.dir, lead: other, agents: [
      { id: 'a', asked: 'First', ago: 5 * MIN, steps: ['One'] }, { id: 'b', asked: 'Second', ago: 4 * MIN, steps: ['Two'] }, { id: 'c', asked: 'Third', ago: 3 * MIN, steps: ['Three'] },
      { id: 'd', asked: 'Fourth', ago: 2 * MIN, steps: ['Four'], quiet: 4 * MIN }, { id: 'e', asked: 'Fifth', ago: 90_000, name: 'fifth-one', steps: ['Five'] },
    ] });
    await ctx.waitFor(`!!document.querySelector('${card(other.id)} [data-k="_more"]')`, { what: 'past three', timeout: 20000 });
    ctx.assert.deepEqual(await ids(other.id), ['a', 'b', 'c', '_more'], 'three, then the rest');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(other.id)} [data-k="_more"] .aga').textContent`), '+2 more');
    await ctx.evaluate(`document.querySelector('${card(other.id)} [data-k="_more"]').click()`);
    const five = await rowsOf(other.id);
    ctx.assert.deepEqual(five.map(r => r.k), ['a', 'b', 'c', 'd', 'e'], 'all of them');
    ctx.assert.deepEqual([five[3].st, five[3].t.startsWith('quiet 4m')], ['quiet', true], 'three minutes silent: quiet, not stuck');
    ctx.assert.equal(five[4].a, 'fifth-one Fifth', 'a name goes first');
    await ctx.evaluate(`document.querySelector('${card(other.id)} .chip.agents').click()`);
    await ctx.settle();
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(other.id)} .agl').hidden`), true, 'the chip folds them');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(other.id)} .chip.agents').getAttribute('aria-expanded')`), 'false');
    const who = await ctx.evaluate(`(l => l && getComputedStyle(l).display !== 'none' ? l.textContent : '')(document.querySelector('${card(other.id)} .state.live.agwho'))`);
    ctx.assert.match(who, /^(First|Second|Third|fifth-one)/, 'folded: its live line says who stepped last, on a compact card too');
    await ctx.reload();
    await ctx.waitFor(`!!document.querySelector('${card(other.id)} .chip.agents:not([hidden])')`, { what: 'the card back' });
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('${card(other.id)} .agl').hidden`), true, 'remembered over a reload');
    await ctx.evaluate(`document.querySelector('${card(other.id)} .chip.agents').click()`);
    await ctx.waitFor(`!document.querySelector('${card(other.id)} .agl').hidden`, { what: 'open again' });
    out.motion = await ctx.evaluate(`window.peix.motion().filter(m => m.kind === 'flip').length`);

    // light, then what hides them
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }); await ctx.settle();
    await ctx.shot('agent-rows-light');
    await ctx.evaluate(`(() => { const k = 'peixairada-prefs', p = JSON.parse(localStorage.getItem(k)); p.cardParts = ['prs', 'rounds', 'tickets', 'faces']; localStorage.setItem(k, JSON.stringify(p)); })()`);
    await ctx.reload();
    await ctx.waitFor(`!!document.querySelector('${card(other.id)} .chip.agents:not([hidden])')`, { what: 'the card back' });
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('${card(other.id)} .agl')).display`), 'none', 'a card told not to: none');
    return out;
  } finally { for (const p of sleeps) p.kill(); }
}
