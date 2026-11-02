// A row's card and its menu (2026-11-02, round XX): the pointer on a row, one card — what it was asked, its worktree, its totals —,
// no popover over it; a right-click, its menu: open its transcript, open its worktree, copy what it was asked, and asking Claude
// to stop it, typed into the chat's drawer and left for you to send. Off, with why, where it cannot.
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { agentFiles, makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto', fake: true, prefs: { cards: 'compact', lanesShut: [] } };
const MIN = 60_000;

export default async function (ctx) {
  const now = Date.now(), root = realpathSync(tmpDir('peix-agm-')), out = {};
  mkdirSync(join(root, 'infra'));
  const { chats } = makeFixture(ctx.fixture.dir, [{ cwd: join(root, 'infra'), title: 'Review the staging VPC plan', prompt: 'review the plan', reply: 'Sending a reviewer out.', at: new Date(now - 300_000) }]);
  const lead = chats[0], card = `#slist > .card[data-id="${lead.id}"]`;
  await ctx.waitFor(`!!document.querySelector('${card}')`, { what: 'the card', timeout: 20000 });
  await ctx.openChat(lead.id);
  await ctx.evaluate(`document.querySelector('#termBtn').click()`);
  await ctx.waitFor(`window.peix.session('${lead.id}')?.alive && !!window.peix.session('${lead.id}')?.terminal`, { what: 'its claude in a drawer', timeout: 15000 });
  await ctx.sleep(1500);   // past the fake claude's start: an agent from before it died with the one before
  agentFiles({ dir: ctx.fixture.dir, lead, agents: [
    { id: 'sec', asked: 'Review the plan for security', prompt: 'Review the terraform plan for security. Flag anything wider than it needs to be.', ago: 9 * MIN, kind: 'code-reviewer', steps: ['Parse the plan', 'List groups'], branch: 'agent/sec', tree: join(root, 'infra') },
    { id: 'cost', asked: 'Price the gateways', ago: 8 * MIN, report: '## Three gateways' },
  ] });
  await ctx.waitFor(`!!document.querySelector('${card} [data-k="sec"]')`, { what: 'the row', timeout: 15000 });
  await ctx.settle();

  // the pointer on a row: its card, the totals asked of the server; nothing else over it
  const at = await ctx.evaluate(`(r => ({ x: r.left + 60, y: r.top + 6 }))(document.querySelector('${card} [data-k="sec"]').getBoundingClientRect())`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  await ctx.waitFor(`document.querySelector('#mxtip')?.classList.contains('on') && /2 tool calls/.test(document.querySelector('#mxtip').textContent)`, { what: 'its card with its totals', timeout: 6000 });
  out.card = await ctx.evaluate(`document.querySelector('#mxtip').textContent`);
  for (const w of ['Review the plan for security', 'at work 9m', 'code-reviewer', 'agent/sec', 'fixture-1', '2 tool calls', '1k tokens', 'Flag anything wider']) ctx.assert.ok(out.card.includes(w), `its card says ${w}: ${out.card}`);
  await ctx.sleep(800);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#rpop.on')`), false, 'one thing at a time: no popover');
  await ctx.shot('agent-card');
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1200, y: 30 });
  await ctx.waitFor(`!document.querySelector('#mxtip').classList.contains('on')`, { what: 'its card gone' });

  // its menu
  const menu = sel => ctx.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}), r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 5 })); return [...document.querySelectorAll('#ctxm button')].map(b => [b.textContent.trim(), b.disabled]); })()`);
  out.menu = await menu(`${card} [data-k="sec"]`);
  ctx.assert.deepEqual(out.menu.map(([t]) => t.split('it ')[0].slice(0, 12)), ['Open its tra', 'Open its wor', 'Copy what ', 'Ask Claude t'], 'its rows');
  ctx.assert.deepEqual(out.menu.map(([, off]) => off), [false, false, false, false]);
  await ctx.shot('agent-menu');
  await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.textContent.startsWith('Ask Claude')).click()`);
  await ctx.waitFor(`/Stop the agent “Review the plan for security”/.test(window.peix.screen())`, { what: 'typed into its drawer', timeout: 6000 });
  ctx.assert.equal(await ctx.evaluate(`/\\bsent:|> Stop the agent.*\\n.*\\n.*replied/i.test(window.peix.screen())`), false, 'and not sent');

  // one that has ended: nothing to stop; none in a worktree: nowhere to open
  await ctx.evaluate(`document.querySelector('${card} [data-k="_done"]')?.click()`);
  await ctx.waitFor(`!!document.querySelector('${card} [data-k="cost_d"]')`, { what: 'the done one listed' });
  out.ended = await menu(`${card} [data-k="cost_d"]`);
  ctx.assert.deepEqual(out.ended.map(([, off]) => off), [false, true, false, true], 'off, with why');
  ctx.assert.match(out.ended[1][0], /chat’s own folder/); ctx.assert.match(out.ended[3][0], /it has ended/);
  await ctx.evaluate(`document.querySelector('#ctxm').close()`);
  return out;
}
