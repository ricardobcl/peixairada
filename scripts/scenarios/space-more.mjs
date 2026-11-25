// Space, more of it (2026-11-24): a node's right-click is the card's menu, what its state wants first (Resume on an
// ended chat) and its star; a node's title, pointed at a moment, its chat's card; its Jira tickets a pill beside the PRs';
// a quiet node faded by its days, its age beside its folder; chats tied together a dashed line, named, lit with the
// node under the pointer; the nodes laid out by project, a head over each project's run; and a chat with no claude keeps the
// agents it ran in its pods, greyed (`past`).
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startFakeJira } from '../fakes/fakejira.mjs';
import { agentFiles, makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

const jira = await startFakeJira({ projects: ['ACME'], issues: { 'ACME-12': { summary: 'Fees for the new market', status: 'In Progress', cat: 'indeterminate', type: 'Story', assignee: 'me' } } });

export const meta = { server: true, fixture: 'auto', env: { JIRA_API_TOKEN: jira.token }, prefs: { space: true, spOff: [], cards: 'compact', spVisits: false } };

export default async function (ctx) {
  const out = {}, now = Date.now(), root = tmpDir('peix-spm-'), dir = n => { const d = join(root, n); mkdirSync(d, { recursive: true }); return d; };
  const ago = m => new Date(now - m * 60_000);
  await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jira: { site: jira.url, email: 'me@acme.test' } }) });
  const { chats: [pay, grid, ledger, old, on] } = makeFixture(ctx.fixture.dir, [
    { cwd: dir('storefront'), title: 'Retry declined card payments', prompt: 'Pick up ACME-12: retry the declined cards', reply: 'Reading the retry client first.', at: ago(10) },
    { cwd: join(root, 'storefront'), title: 'Product grid follows the dark theme', prompt: 'fix the grid', reply: 'Done, 14 tests pass.', at: ago(3 * 1440) },
    { cwd: dir('ledger'), title: 'Retry budget for the ledger sync', prompt: 'budget the retries', reply: 'Budgeted.', at: ago(9 * 1440) },
    { cwd: dir('infra'), title: 'Review the VPC plan', prompt: 'review it', reply: 'Reviewed; carrying on in the background.', at: ago(60) },
    { cwd: join(root, 'infra'), title: 'VPC plan, carried on', prompt: 'carry on', reply: 'Carrying on.', at: ago(30) },
  ]);
  agentFiles({ dir: ctx.fixture.dir, lead: ledger, agents: [{ id: 'led', kind: 'security', asked: 'Check the retry budget', ago: 9 * 1440 * 60_000 + 600_000, report: 'Fine.', finished: true }] });
  appendFileSync(old.file, JSON.stringify({ type: 'continued-in', timestamp: ago(59).toISOString(), sessionId: old.id, continuedInSessionId: on.id }) + '\n');   // /bg: a `continued` tie
  const node = id => `document.querySelector('#spgrid .spt[data-id="${id}"]')`;
  const at = sel => ctx.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const mouse = async (sel, button = 'none') => {
    const r = await at(sel);
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    if (button !== 'none') { await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button, clickCount: 1 }); await ctx.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button, clickCount: 1 }); }
  };
  const menu = () => ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].map(b => (b.querySelector('.ct') || b).firstChild.textContent + (b.disabled ? ' (off)' : ''))`);
  await ctx.waitFor(`${JSON.stringify([pay, grid, ledger, on].map(c => c.id))}.every(id => document.querySelector('#spgrid .spt[data-id="' + id + '"]'))`, { what: 'the nodes' });
  await ctx.waitFor(`peix.session('${old.id}')?.done && (peix.session('${old.id}')?.links || []).length === 1`, { what: 'the went-on tie, and the chat it left done' });

  // 1 · the node's right-click: Resume first on an ended chat, the star, the card's rows; Star from it
  await ctx.settle();
  await mouse(`#spgrid .spt[data-id="${pay.id}"] .spbt`, 'right');
  await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: 'its menu' });
  out.menu = await menu();
  ctx.assert.equal(out.menu[0], 'Resume here', 'an ended chat: Resume first');
  for (const row of ['Open', 'Star', 'Done', 'Mute', 'Delete from the board', 'Copy its link']) ctx.assert.ok(out.menu.includes(row), `${row} in ${JSON.stringify(out.menu)}`);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#mxtip.on')`), false, 'no card over the menu');
  await ctx.shot('space-menu');
  await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.textContent.startsWith('Star')).click()`);
  await ctx.waitFor(`peix.session('${pay.id}')?.fav === true`, { what: 'starred from its menu' });
  await mouse(`#spgrid .spt[data-id="${old.id}"] .spbt`, 'right');
  await ctx.waitFor(`document.querySelector('#ctxm').open && [...document.querySelectorAll('#ctxm button')].some(b => b.textContent.startsWith('Back on the board'))`, { what: 'a done node: back on the board' });
  await ctx.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

  // 2 · at a glance: the tickets' pill, the chat's card on its title, the quiet ones faded with their age
  await ctx.waitFor(`${node(pay.id)}?.querySelector('.sptk')?.dataset.url?.endsWith('/browse/ACME-12')`, { what: 'its ticket’s pill', timeout: 15000 });
  ctx.assert.equal(await ctx.evaluate(`${node(pay.id)}.querySelector('.sptk').dataset.cat`), 'doing');
  await mouse(`#spgrid .spt[data-id="${grid.id}"] .spbox`);
  await mouse(`#spgrid .spt[data-id="${pay.id}"] .spbt`);
  await ctx.waitFor(`document.querySelector('#mxtip.on')?.textContent.includes('ACME-12')`, { what: 'its chat’s card' });
  out.card = await ctx.evaluate(`({ head: document.querySelector('#mxtip .spcs').textContent, title: document.querySelector('#mxtip .mtt').textContent, rows: [...document.querySelectorAll('#mxtip .spcc dt')].map(d => d.textContent) })`);
  ctx.assert.match(out.card.head, /^Ready · \d+m\s*storefront/, 'its state and age, its folder');
  ctx.assert.equal(out.card.title, 'Retry declined card payments');
  ctx.assert.deepEqual(out.card.rows, ['You', 'Claude', 'Ticket'], 'your last word, Claude’s, its ticket');
  await ctx.settle(); await ctx.shot('space-chat-card');
  await mouse('#space .sphd h1');
  out.fade = await ctx.evaluate(`[${[pay, grid, ledger].map(c => `'${c.id}'`).join(',')}].map(id => { const n = document.querySelector('#spgrid .spt[data-id="' + id + '"]'); return [n.style.getPropertyValue('--fade') || '1', n.querySelector('.spag')?.textContent || '', getComputedStyle(n).opacity]; })`);
  ctx.assert.deepEqual(out.fade.map(f => f.slice(0, 2)), [['1', ''], ['0.8', ' · 3d'], ['0.5', ' · 9d']], 'today’s whole; three days 80 %, its age; nine days the floor');

  // 3 · constellations: one line for the tie, named, lit with the node under the pointer
  await ctx.waitFor(`document.querySelectorAll('#splinks g').length === 1`, { what: 'the line' });
  out.link = await ctx.evaluate(`(g => [[g.dataset.a, g.dataset.b].sort().join('|'), g.querySelector('text').textContent, +g.querySelector('line').getAttribute('x1') !== +g.querySelector('line').getAttribute('x2') || +g.querySelector('line').getAttribute('y1') !== +g.querySelector('line').getAttribute('y2')])(document.querySelector('#splinks g'))`);
  ctx.assert.deepEqual(out.link, [[old.id, on.id].sort().join('|'), 'went on', true], 'from node to node, named');
  await mouse(`#spgrid .spt[data-id="${on.id}"] .spbox`);
  await ctx.waitFor(`document.querySelector('#splinks g.lit')`, { what: 'lit under the pointer' });
  await ctx.shot('space-links');

  //   · an ended chat's agents: in its pods still, greyed
  await ctx.waitFor(`${node(ledger.id)}?.querySelector('.spa.past[data-ag="led"]')`, { what: 'its past agent in its pod', timeout: 15000 });
  out.past = await ctx.evaluate(`getComputedStyle(${node(ledger.id)}.querySelector('.spa.past')).filter`);
  ctx.assert.match(out.past, /saturate/);

  //   · by project: a head over each run, its nodes after it
  await ctx.evaluate(`document.querySelector('#spar [data-arr="project"]').click()`);
  await ctx.waitFor(`document.querySelectorAll('#spgrid .sphead').length >= 3`, { what: 'the heads' });
  out.runs = await ctx.evaluate(`(() => { const runs = []; for (const el of document.querySelector('#spgrid').children) { if (el.classList.contains('sphead')) runs.push([el.firstChild.nextSibling.textContent, +el.querySelector('b').textContent, []]); else runs.at(-1)[2].push(peix.session(el.dataset.id).project); } return runs; })()`);
  for (const [name, n, projs] of out.runs) { ctx.assert.equal(projs.length, n, `${name}: its count`); ctx.assert.ok(projs.every(p => p === name), `${name}: only its own`); }
  ctx.assert.deepEqual(out.runs.slice(0, 2).map(r => r[0]), ['storefront', 'infra'], 'the project with the newest word first');
  ctx.assert.equal(await ctx.evaluate(`peix.prefs().spArrange`), 'project');
  await ctx.settle(); await ctx.shot('space-by-project');
  await ctx.evaluate(`document.querySelector('#spar [data-arr="state"]').click()`);
  await ctx.waitFor(`!document.querySelector('#spgrid .sphead')`, { what: 'by state again' });
  jira.close?.();
  return out;
}
