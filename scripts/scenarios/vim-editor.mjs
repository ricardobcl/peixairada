// The in-app editor (2026-10-21): Settings › General › In-app editor picks what ⌥⌘E opens on a tab beside the chat —
// VS Code Web, or vim in a terminal in the chat's folder (the test server's fake vim, scripts/fakevim.mjs). What this
// checks: the pick, ··· naming it; ⌥⌘E a tab "vim" in the second half, the fake's screen saying its folder; ⌥⌘E again from
// it fills the column, and back; ⌥⌘E from the chat shows the same vim, never another; ⌥⌘T from the vim tab is a zsh, not
// the vim; ⌥⌘W asks vim to quit (the fake does) and its tab goes; back on VS Code Web, ··· says so.
import { waitFor } from '../../lib/testserver.mjs';

export const meta = { server: true, fake: true, fixture: 'auto' };

export default async function (ctx) {
  const [chat] = ctx.fixture.chats;
  const out = {};
  await ctx.openChat(chat.id);
  const vims = async () => (await ctx.server.terminals()).filter(t => t.editor === 'vim' && t.exited === null);
  const st = () => ctx.evaluate(`JSON.stringify({ tab: window.peix.state().tab, zoomed: window.peix.state().zoomed, focusG: window.peix.state().focusG,
    tabs: [...document.querySelectorAll('.ptab[data-tab]')].map(b => b.textContent.trim()), lbl: document.querySelector('#webBtn .lbl')?.textContent })`).then(JSON.parse);

  // the pick: Vim, and ··· says so
  out.before = await st();
  ctx.assert.equal(out.before.lbl, 'VS Code Web', 'VS Code Web by default');
  await ctx.evaluate(`document.querySelector('#inEdPick [data-ined="vim"]').click()`);
  out.pick = await ctx.evaluate(`JSON.stringify({ pref: window.peix.prefs().inEditor, checked: [...document.querySelectorAll('#inEdPick [data-ined]')].map(b => b.dataset.ined + ':' + b.getAttribute('aria-checked')), lbl: document.querySelector('#webBtn .lbl').textContent })`).then(JSON.parse);
  ctx.assert.deepEqual(out.pick, { pref: 'vim', checked: ['vscode:false', 'vim:true'], lbl: 'Vim' });

  // ⌥⌘E: vim on a tab of its own, beside the chat, in its folder
  await ctx.key('KeyE');
  await ctx.waitFor(`/^shell:/.test(window.peix.state().tab) && window.peix.term(1)?.ws === 1`, { what: 'vim on a tab, attached' });
  await ctx.waitFor(`document.querySelector('#termBodyB .xterm-rows')?.textContent.includes('fake vim')`, { what: 'vim\'s screen' });
  out.vim = { st: await st(), screen: (await ctx.screen(1)).join(''), server: await vims() };
  ctx.assert.equal(out.vim.server.length, 1, 'one vim');
  ctx.assert.equal(out.vim.st.tab, 'shell:' + out.vim.server[0].id, 'its tab in front');
  ctx.assert.match(out.vim.screen, /^fake vim — \/.*\/repo-a — \.~/, 'vim on its folder (the line wraps)');
  ctx.assert.equal(out.vim.server[0].cwd, chat.cwd, 'in the chat\'s folder');
  ctx.assert.equal(await ctx.evaluate(`window.peix.state().split`), true, 'beside the chat, in the second half');
  await ctx.settle();
  await ctx.shot('vim-tab');

  // ⌥⌘E again from it: its half fills the column; once more, both back
  await ctx.key('KeyE');
  await ctx.waitFor(`window.peix.state().zoomed === 1`, { what: 'vim\'s half filling the column' });
  await ctx.key('KeyE');
  await ctx.waitFor(`window.peix.state().zoomed === null`, { what: 'both halves back' });

  // from the chat, ⌥⌘E is the same vim, not another
  await ctx.key('KeyC');
  await ctx.waitFor(`window.peix.state().tab === 'chat'`, { what: 'the keys on the chat' });
  await ctx.key('KeyE');
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify(out.vim.st.tab)}`, { what: 'the vim tab again' });
  await ctx.sleep(300);
  ctx.assert.equal((await vims()).length, 1, 'still one vim');

  // ⌥⌘T from the vim tab: a zsh, never the vim
  await ctx.key('KeyT');
  await ctx.waitFor(`/^shell:/.test(window.peix.state().tab) && window.peix.state().tab !== ${JSON.stringify(out.vim.st.tab)}`, { what: 'a zsh tab' });
  out.zshTab = (await st()).tab;
  out.zsh = (await ctx.server.terminals()).find(t => 'shell:' + t.id === out.zshTab);
  ctx.assert.deepEqual([out.zsh?.shell, out.zsh?.editor], [true, null], 'a zsh');
  ctx.assert.ok((await st()).tabs.some(t => /^vim$/.test(t)), `the vim tab named vim: ${JSON.stringify((await st()).tabs)}`);

  // ⌥⌘W on the vim tab: asked to quit, it does, and the tab goes
  await ctx.key('KeyE');
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify(out.vim.st.tab)}`, { what: 'the vim tab' });
  await ctx.key('KeyW');
  await waitFor(async () => (await vims()).length === 0, { what: 'vim quitting' });
  await ctx.waitFor(`![...document.querySelectorAll('.ptab[data-tab]')].some(b => b.dataset.tab === ${JSON.stringify(out.vim.st.tab)}) && window.peix.state().tab !== ${JSON.stringify(out.vim.st.tab)}`, { what: 'its tab gone' });
  out.quit = (await ctx.server.terminals()).find(t => t.id === out.vim.server[0].id)?.exited ?? null;
  ctx.assert.equal(out.quit, 0, 'vim quit of its own, on :qa — not killed');

  // VS Code Web again: ··· says so
  await ctx.evaluate(`document.querySelector('#inEdPick [data-ined="vscode"]').click()`);
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#webBtn .lbl').textContent`), 'VS Code Web');
  return out;
}
