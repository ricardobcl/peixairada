// An agent's call in the transcript (2026-11-02): a line of its own, out of the fold, long after its row has left the card. An
// Agent call has it from the start, a forked Skill from its result; a click opens the agent's transcript, read-only, beside the
// chat, on a chat with no claude too; one whose file has gone says so; a call that failed opens nothing. Shots dark and light.
import { appendFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { agentFiles, makeFixture, toolLines } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'compact', cardsEven: true, lanesShut: [] } };
const MIN = 60_000;

export default async function (ctx) {
  const now = Date.now(), root = realpathSync(tmpDir('peix-agc-')), cwd = join(root, 'infra'), at = ms => new Date(now - ms);
  const launched = (agentId, description, extra = {}) => ({ status: 'async_launched', isAsync: true, agentId, description, prompt: 'go', ...extra });
  const NOTE = 'Async agent launched successfully. (This tool result is internal metadata.)';
  const { chats } = makeFixture(ctx.fixture.dir, [{ cwd, title: 'Review the staging VPC plan', prompt: 'review the plan', reply: 'Sending reviewers out.', at: at(30 * MIN), lines: id => [
    ...toolLines({ id, cwd, name: 'Bash', input: { description: 'List the plan files', command: 'ls' }, result: 'plan.tf', at: at(29 * MIN) }),
    ...toolLines({ id, cwd, name: 'Agent', input: { description: 'Review the plan for security', prompt: 'go' }, result: NOTE, toolUseResult: launched('sec', 'Review the plan for security'), at: at(28 * MIN) }),
    ...toolLines({ id, cwd, name: 'Agent', input: { description: 'Price the NAT gateways', name: 'pricing', prompt: 'go' }, result: NOTE, toolUseResult: launched('cost', 'Price the NAT gateways'), at: at(27 * MIN) }),
    ...toolLines({ id, cwd, name: 'Skill', input: { skill: 'code-review', args: 'https://github.com/acme/infra/pull/9' }, result: 'Skill "code-review" launched (forked execution, running in the background).', toolUseResult: { success: true, commandName: 'code-review', status: 'forked', agentId: 'rev', result: '' }, at: at(26 * MIN) }),
    ...toolLines({ id, cwd, name: 'Skill', input: { skill: 'plain' }, result: 'A skill with no agent', toolUseResult: { success: true, commandName: 'plain' }, at: at(25 * MIN) }),
    ...toolLines({ id, cwd, name: 'Agent', input: { description: 'Its file has gone', prompt: 'go' }, result: NOTE, toolUseResult: launched('nofile', 'Its file has gone'), at: at(24 * MIN) }),
    ...toolLines({ id, cwd, name: 'Agent', input: { description: 'Refused at once', prompt: 'go' }, result: 'Could not start it', at: at(23 * MIN) }).map(l => (l.type === 'user' ? { ...l, message: { role: 'user', content: [{ ...l.message.content[0], is_error: true }] } } : l)),
    { type: 'assistant', uuid: 'a-tail', parentUuid: null, isSidechain: false, userType: 'external', entrypoint: 'cli', cwd, sessionId: id, version: 'fixture', gitBranch: 'main', timestamp: at(20 * MIN).toISOString(), message: { model: 'fixture-1', id: 'msg_tail', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'All four are back.' }], stop_reason: 'end_turn' } },
  ] }]);
  const lead = chats[0], log = sel => `#log ${sel}`;
  agentFiles({ dir: ctx.fixture.dir, lead, agents: [
    { id: 'sec', asked: 'Review the plan for security', ago: 28 * MIN, quiet: 22 * MIN, tool: 'toolu_sec', steps: ['Parse the plan for ingress rules'], report: 'Two rules are wider than they need to be.', finished: true },
    { id: 'cost', asked: 'Price the NAT gateways', name: 'pricing', ago: 27 * MIN, quiet: 22 * MIN, steps: ['Count the gateways'], report: 'Three gateways where one would do.', finished: true },
    { id: 'rev', asked: '/code-review https://github.com/acme/infra/pull/9', name: 'code-review', ago: 26 * MIN, quiet: 21 * MIN, steps: ['Read the diff'], report: 'Twelve findings.', finished: true },
  ] });

  await ctx.waitFor(`!!document.querySelector('#slist > .card[data-id="${lead.id}"]')`, { what: 'its card', timeout: 20000 });
  ctx.assert.equal(await ctx.evaluate(`window.peix.session('${lead.id}').agentRows`), null, 'no claude runs on it: its card has no rows');
  await ctx.openChat(lead.id);
  await ctx.waitFor(`document.querySelectorAll('${log('.agcall')}').length === 5`, { what: 'the calls’ lines' });
  const lines = await ctx.evaluate(`[...document.querySelectorAll('${log('.agcall')}')].map(b => ({ who: b.querySelector('b').textContent, said: b.querySelector('span').textContent, ag: b.dataset.ag || null, off: b.disabled, folded: !!b.closest('details') }))`);
  ctx.assert.deepEqual(lines, [
    { who: 'Agent', said: 'Review the plan for security', ag: 'sec', off: false, folded: false },
    { who: 'pricing', said: 'Price the NAT gateways', ag: 'cost', off: false, folded: false },
    { who: 'code-review', said: 'https://github.com/acme/infra/pull/9', ag: 'rev', off: false, folded: false },
    { who: 'Agent', said: 'Its file has gone', ag: 'nofile', off: false, folded: false },
    { who: 'Agent', said: 'Refused at once', ag: null, off: true, folded: false },
  ], 'a line each, in order, out of the folds; the failed call opens nothing');
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('${log('.agcall')}')[4].querySelector('.tst').className`), 'tst err', 'and says so');
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('${log('.agcall')}')[4].title`), 'Could not start it', 'why');
  const folds = await ctx.evaluate(`[...document.querySelectorAll('${log('.toolgroup > summary')}')].map(s => s.textContent)`);
  ctx.assert.deepEqual(folds.filter(t => /Agent/.test(t)), [], 'no Agent left in a fold');
  ctx.assert.equal(folds.filter(t => /Skill/.test(t)).length, 2, 'a Skill’s call stays in its run');
  ctx.assert.equal(await ctx.evaluate(`[...document.querySelectorAll('${log('.tool')}')].some(t => /launched/.test(t.textContent))`), false, 'the launch’s words are nobody’s');
  await ctx.settle();
  await ctx.shot('agent-call-dark');

  // a click: that agent's transcript beside the chat; by name where it has one
  await ctx.evaluate(`document.querySelectorAll('${log('.agcall')}')[1].click()`);
  await ctx.waitFor(`!document.querySelector('#agv').hidden && /Three gateways/.test(document.querySelector('#agv .agvlog').textContent)`, { what: 'its transcript, from its call' });
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#agv .agvh').textContent`), /pricing.*done · read-only/, 'named, ended, read-only');
  ctx.assert.deepEqual(await ctx.evaluate(`[...document.querySelectorAll('#agv .toolgroup > summary')].map(s => s.textContent)`), ['1 tool call · Bash'], 'its report is words, and nothing is left of the call that handed it back');
  await ctx.settle();
  await ctx.shot('agent-call-tab');
  // the skill's, by its name, in the same place
  await ctx.evaluate(`document.querySelectorAll('${log('.agcall')}')[2].click()`);
  await ctx.waitFor(`/Twelve findings/.test(document.querySelector('#agv .agvlog').textContent)`, { what: 'the skill’s agent' });
  ctx.assert.equal(await ctx.evaluate(`[...document.querySelectorAll('.ptab[data-tab^="agent:"]')].map(t => t.textContent.trim()).join()`), 'pricing,code-review', 'a tab each');
  // again: the tab it has
  await ctx.evaluate(`document.querySelectorAll('${log('.agcall')}')[1].click()`);
  await ctx.waitFor(`/Three gateways/.test(document.querySelector('#agv .agvlog').textContent)`, { what: 'back on the first' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('.ptab[data-tab^="agent:"]').length`), 2, 'no third');
  // one whose file has gone
  await ctx.evaluate(`document.querySelectorAll('${log('.agcall')}')[3].click()`);
  await ctx.waitFor(`document.querySelector('#agv .agvlog').textContent === 'Its transcript is gone.'`, { what: 'says so' });

  // a reload draws the same
  await ctx.reload();
  await ctx.openChat(lead.id);
  await ctx.waitFor(`document.querySelectorAll('${log('.agcall[data-ag]')}').length === 4`, { what: 'the same lines' });

  // live: the line first, the result ties it, in place; a fold after it is a new one
  const before = await ctx.evaluate(`document.querySelectorAll('${log('.toolgroup')}').length`);
  const [use, res] = toolLines({ id: lead.id, cwd, name: 'Agent', input: { description: 'One more look', prompt: 'go' }, result: NOTE, toolUseResult: launched('sec', 'One more look') });
  appendFileSync(lead.file, JSON.stringify(use) + '\n');
  await ctx.waitFor(`[...document.querySelectorAll('${log('.agcall')}')].at(-1)?.querySelector('span').textContent === 'One more look'`, { what: 'the line, at once', timeout: 8000 });
  ctx.assert.equal(await ctx.evaluate(`[...document.querySelectorAll('${log('.agcall')}')].at(-1).disabled`), true, 'nothing to open yet');
  await ctx.evaluate(`[...document.querySelectorAll('${log('.agcall')}')].at(-1)._mark = 1`);
  appendFileSync(lead.file, JSON.stringify(res) + '\n');
  await ctx.waitFor(`[...document.querySelectorAll('${log('.agcall')}')].at(-1).dataset.ag === 'sec'`, { what: 'tied by its result', timeout: 8000 });
  ctx.assert.equal(await ctx.evaluate(`[...document.querySelectorAll('${log('.agcall')}')].at(-1)._mark`), 1, 'in place');
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('${log('.toolgroup')}').length`), before, 'no fold for it');
  await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }); await ctx.settle();
  await ctx.shot('agent-call-light');
  return { folds };
}
