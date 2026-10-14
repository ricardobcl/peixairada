// The launcher and the sheet of every key (2026-10-10). Two chats, one on a PR GitHub answers for. What this checks:
// ⌥⌘L opens the picker on the menu (Chats › … About); typing finds a chat in its section and ⏎ opens it; `>` narrows
// to the actions, and ⏎ runs one (the list folds); → goes into Toggle, ⏎ flips a switch of the settings and the menu
// stays, ← comes back out; `#` finds the PR by its number; and `?` outside a box opens the sheet of every key, which
// its box narrows.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

const dir = tmpDir('peix-launch-'), prs = join(dir, 'prs.json');
writeFileSync(prs, JSON.stringify({ 'acme/widgets#57': { state: 'OPEN', title: 'Teach the widget to launch' } }));

export const meta = { server: true, fixture: 'auto', env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: prs } };

export default async function (ctx) {
  const now = Date.now(), out = {};
  const { chats } = makeFixture(ctx.fixture.dir, [
    { cwd: join(dir, 'widgets'), title: 'Launch the widgets', prompt: 'see https://github.com/acme/widgets/pull/57', reply: 'On it.', at: new Date(now - 60_000) },
    { cwd: join(dir, 'gadgets'), title: 'Polish the gadgets', prompt: 'polish them', reply: 'Polished.', at: new Date(now - 120_000) },
  ]);
  const [widgets, gadgets] = chats;
  const key = k => ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }))`);
  const rows = () => ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow')].map(r => ({ kind: [...r.classList].find(c => ['menu', 'chat', 'project', 'pr', 'ticket', 'action', 'toggle'].includes(c)), text: r.querySelector('.n').textContent, sel: r.classList.contains('sel') }))`);
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${widgets.id}"] .cpr[data-state="open"]')`, { what: 'the PR answered', timeout: 20000 });

  // ⌥⌘L: the menu
  await ctx.key('KeyL');
  await ctx.waitFor(`document.querySelector('#pick').open && document.querySelectorAll('#picklist .pkrow.menu').length === 12`, { what: 'the launcher’s menu' });
  const menu = await rows();
  ctx.assert.deepEqual(menu.map(r => r.text), ['Chats', 'Projects', 'New chat', 'Pull requests', 'Toggle', 'Theme', 'Settings', 'Keys', 'Tour', 'Home', 'Overview', 'About peixAIrada']);
  await ctx.settle(); await ctx.shot('menu');

  // a query finds a chat in its section; ⏎ opens it
  await ctx.fill('#pickq', 'polish');
  await ctx.waitFor(`document.querySelector('#picklist .pkhd')?.textContent === 'Chats'`, { what: 'the chats section' });
  ctx.assert.equal((await rows())[0].text, 'Polish the gadgets');
  await key('Enter');
  await ctx.waitFor(`!document.querySelector('#pick').open && window.peix.state().current === '${gadgets.id}'`, { what: 'the chat opened' });

  // > an action: the list folds
  await ctx.key('KeyL');
  await ctx.waitFor(`document.querySelector('#pick').open`, { what: 'the launcher again' });
  await ctx.fill('#pickq', '>fold');
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.sel')?.textContent.includes('Fold the chat list')`, { what: 'the fold action first' });
  ctx.assert.ok((await rows()).every(r => r.kind === 'action' || r.kind === 'toggle'), '> leaves only actions and switches');
  await key('Enter');
  await ctx.waitFor(`document.querySelector('#main').classList.contains('scompact')`, { what: 'the list folded' });
  await ctx.key('KeyB');
  await ctx.waitFor(`!document.querySelector('#main').classList.contains('scompact')`, { what: 'unfolded' });

  // Toggle ›: a switch flipped, the menu stays; ← back out
  await ctx.key('KeyL');
  await ctx.waitFor(`document.querySelector('#pick').open`, { what: 'the launcher once more' });
  for (let i = 0; i < 4; i++) await key('ArrowDown');
  await key('ArrowRight');
  await ctx.waitFor(`[...document.querySelectorAll('#picklist .pkrow.toggle')].some(r => r.textContent.includes('Sounds'))`, { what: 'the switches' });
  const sounds = (await rows()).findIndex(r => r.text === 'Sounds');
  for (let i = 0; i < sounds; i++) await key('ArrowDown');
  ctx.assert.equal((await ctx.peix('prefs()')).sounds, false);
  await key('Enter');
  await ctx.waitFor(`window.peix.prefs().sounds === true && document.querySelector('#pick').open && document.querySelector('#picklist .pkrow.sel .lsw.on')`, { what: 'the sounds on, the menu up' });
  await ctx.settle(); await ctx.shot('toggle');
  await key('Enter');
  await ctx.waitFor(`window.peix.prefs().sounds === false`, { what: 'and off again' });
  await key('ArrowLeft');
  await ctx.waitFor(`document.querySelectorAll('#picklist .pkrow.menu').length === 12`, { what: 'back on the menu' });

  // # the PR by its number
  await ctx.fill('#pickq', '#57');
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.pr')`, { what: 'the PR row' });
  out.pr = (await rows())[0];
  ctx.assert.match(out.pr.text, /Teach the widget to launch/);
  await ctx.evaluate(`document.querySelector('#pick').close()`);

  // ?: the sheet of every key, narrowed by its box
  await ctx.waitFor(`!document.querySelector('dialog[open]')`, { what: 'nothing up' });
  await ctx.evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`document.querySelector('#keysheet').open && document.querySelectorAll('#ksbody .kr').length > 20`, { what: 'the keys sheet' });
  await ctx.settle(); await ctx.shot('keys');
  await ctx.fill('#ksq', 'theme');
  out.keys = await ctx.evaluate(`[...document.querySelectorAll('#ksbody .kr:not([hidden]) kbd')].map(k => k.textContent)`);
  ctx.assert.ok(out.keys.includes('⌥⌘Y') && out.keys.length < 6, `the box narrows the sheet: ${out.keys}`);
  return out;
}
