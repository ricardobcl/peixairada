// An agent's tab (2026-11-02, round XX): a row clicked opens its transcript beside the chat, read-only, a lock on its tab: the
// chat's words to it, its tool calls, what it reported; what it does next comes in; ⌘W or × closes the tab, the agent carries on;
// the tab outlives a reload. Shots dark and light.
import { spawn } from 'node:child_process';
import { appendFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { agentFiles, makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'compact', lanesShut: [] } };
const MIN = 60_000;

export default async function (ctx) {
  const now = Date.now(), root = realpathSync(tmpDir('peix-agt-')), sleeper = spawn('sleep', ['300'], { stdio: 'ignore' }), out = {};
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [{ cwd: join(root, 'infra'), title: 'Review the staging VPC plan', prompt: 'review the plan', reply: 'Sending a reviewer out.', at: new Date(now - 300_000), live: { pid: sleeper.pid, startedAt: now - 60 * MIN } }]);
    const lead = chats[0], card = `#slist > .card[data-id="${lead.id}"]`;
    const { files } = agentFiles({ dir: ctx.fixture.dir, lead, agents: [
      { id: 'sec', asked: 'Review the plan for security', prompt: 'Review the terraform plan for security. Flag anything wider than it needs to be.', ago: 9 * MIN, steps: ['Parse the plan for ingress rules', 'List groups wider than a /16'] },
      { id: 'cost', asked: 'Price the NAT gateways', ago: 8 * MIN, steps: ['Count the gateways'] },
    ] });
    await ctx.waitFor(`!!document.querySelector('${card} [data-k="sec"]')`, { what: 'the row', timeout: 20000 });
    await ctx.evaluate(`document.querySelector('${card} [data-k="sec"]').focus()`);   // by the keyboard: a row is a button
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await ctx.waitFor(`!document.querySelector('#agv').hidden && document.querySelectorAll('#agv .tool').length >= 2`, { what: 'its transcript' });
    ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#agv .agvh .ic.st rect')`), true, 'alone in its half: no strip, the lock on its head');
    ctx.assert.equal(await ctx.evaluate(`window.peix.state().current`), lead.id, 'its chat open');
    ctx.assert.match(await ctx.evaluate(`document.querySelector('#agv .msg.user .bubble').textContent`), /Flag anything wider/, 'what the chat asked it');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#agv .msg.user .who span').textContent`), 'The chat asked', 'not your words');
    ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#agv .msg.user').length`), 1, 'drawn once');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#agv .toolgroup').open`), true, 'its calls are the story: open');
    ctx.assert.match(await ctx.evaluate(`document.querySelector('#agv .agvh').textContent`), /Review the plan for security.*at work · read-only/, 'says it is read-only');
    ctx.assert.equal(await ctx.evaluate(`!document.querySelector('#log').hidden && document.querySelector('#log').parentElement !== document.querySelector('#agv').parentElement`), true, 'the chat beside it, in the other half');
    await ctx.settle();
    await ctx.shot('agent-tab-dark');

    // a second one: a strip, a lock on each; the first still there
    await ctx.evaluate(`document.querySelector('${card} [data-k="cost"]').click()`);
    await ctx.waitFor(`/Count the gateways/.test(document.querySelector('#agv .agvlog').textContent)`, { what: 'the second one\u2019s' });
    out.tab = await ctx.evaluate(`[...document.querySelectorAll('.ptab[data-tab^="agent:"]')].map(t => ({ k: t.dataset.tab, on: t.classList.contains('on'), text: t.textContent.trim(), lock: !!t.querySelector('.ic.st rect') }))`);
    ctx.assert.deepEqual(out.tab, [{ k: 'agent:sec', on: false, text: 'Review the plan for security', lock: true }, { k: 'agent:cost', on: true, text: 'Price the NAT gateways', lock: true }], 'tabs of the chat, a lock on each');
    await ctx.evaluate(`document.querySelector('.ptab[data-tab="agent:cost"] .x').click()`);
    await ctx.waitFor(`!document.querySelector('.ptab[data-tab="agent:cost"]') && /Parse the plan/.test(document.querySelector('#agv .agvlog').textContent)`, { what: 'back on the first' });

    // what it does next comes in; its report ends it
    appendFileSync(files.sec, JSON.stringify({ isSidechain: true, type: 'user', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_x', content: 'ok' }] } }) + '\n');
    appendFileSync(files.sec, JSON.stringify({ isSidechain: true, type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_hb', name: 'SubagentHandback', input: { message: '## Two open rules\n\nBoth on the bastion.' } }], stop_reason: 'tool_use' } }) + '\n');
    appendFileSync(files.sec, JSON.stringify({ isSidechain: true, type: 'user', timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_hb', content: 'Handed back.' }] } }) + '\n');
    await ctx.waitFor(`/Both on the bastion/.test(document.querySelector('#agv .agvlog').textContent)`, { what: 'its report', timeout: 8000 });
    await ctx.waitFor(`/done · read-only/.test(document.querySelector('#agv .agvh').textContent)`, { what: 'done, in its head', timeout: 8000 });
    ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#agv .msg.user').length`), 1, 'still once, after every poll');

    // outlives a reload
    await ctx.reload();
    await ctx.openChat(lead.id);
    await ctx.waitFor(`!document.querySelector('#agv').hidden && /Both on the bastion/.test(document.querySelector('#agv .agvlog').textContent)`, { what: 'the tab back, read again', timeout: 8000 });
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }); await ctx.settle();
    await ctx.shot('agent-tab-light');

    // closed: the tab goes, the column is one half again
    await ctx.evaluate(`document.querySelector('#agv .agvx').click()`);
    await ctx.waitFor(`document.querySelector('#agv').hidden && !document.querySelector('.ptab[data-tab^="agent:"]')`, { what: 'the tab closed' });
    return out;
  } finally { sleeper.kill(); }
}
