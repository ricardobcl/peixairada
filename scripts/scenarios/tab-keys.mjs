// ⌘T and ⌘W are the tabs' (2026-10-13), a browser's and iTerm's. ⌘T in a terminal — claude's drawer, a zsh — starts
// another zsh in the chat's folder, as many as asked for, each its own tab (zsh, zsh 2) where a new tab goes; on a
// page it opens a blank tab, as a browser's does: in front, the keys in its address, and under it what ⏎ would open —
// what was typed first (an address, a bare host, words to search), then the chat's own pages not on a tab. ⌘W closes the tab the keys are in — a zsh ends, a page goes — and on the chat's own tab with
// one half it is the window's key. VS Code Web with no editor open asks for its own tab to go (2026-10-14,
// peixPaneClose). The app's bridge is faked, as in pane-tabs.mjs, so pages are tabs.
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const [chat] = ctx.fixture.chats;   // the one with two PRs
  const out = {};
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs = []; addEventListener('error', e => window.__errs.push(e.message)); window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.reload();
  await ctx.openChat(chat.id);
  const shells = () => ctx.peix('state().tabs').then(t => t.filter(k => k.startsWith('shell:')));
  const live = async () => (await ctx.server.terminals()).filter(t => t.shell && t.sessionId === chat.id && t.exited === null).map(t => t.id);
  const until = async (fn, what) => { for (let i = 0; i < 100; i++) { if (await fn()) return; await ctx.sleep(100); } throw new Error(`timed out: ${what}`); };
  const labels = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#ptabsB .ptab')].map(b => [...b.childNodes].find(n => n.nodeType === 3)?.textContent))`).then(JSON.parse);

  // claude in its drawer, the keys in it
  await ctx.key('KeyC');
  await ctx.waitPrompt();
  ctx.assert.equal(await ctx.peix('state().tab'), 'chat');

  // ⌘T there: a zsh, beside the chat — a new tab splits the column the first time
  await ctx.cmd('KeyT');
  await ctx.waitFor(`/^shell:/.test(window.peix.state().halves[1]) && window.peix.term(1).ws === 1`, { what: 'a zsh in the right half, attached' });
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, 'the keys went with it');
  const [first] = await shells();

  // ⌘T in the zsh: another one, beside the first in its strip, and the keys on the new one
  await ctx.cmd('KeyT');
  await ctx.waitFor(`window.peix.state().tabs.filter(k => k.startsWith('shell:')).length === 2`, { what: 'a second zsh' });
  const both = await shells(), second = both.find(k => k !== first);
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify(second)} && window.peix.term(1).ws === 1`, { what: 'the keys on the second zsh, attached' });
  out.two = { strips: await ctx.peix('state().strips'), labels: await labels(), live: await live() };
  ctx.assert.deepEqual(out.two.strips, [['chat'], [first, second]], 'both zsh tabs in the right half, oldest first');
  ctx.assert.equal(out.two.labels.length, 2); ctx.assert.equal(out.two.labels[1], `${out.two.labels[0]} 2`, 'the second is named after its place');
  ctx.assert.deepEqual(out.two.live.map(id => 'shell:' + id).sort(), [first, second].sort(), 'two zsh holders on the server, one per tab');
  await ctx.settle();
  await ctx.shot('two-shells');

  // ⌘W: the zsh the keys are in ends, and the keys land on the tab beside it — at once, as in a browser
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), true, '⌘W was the board\'s');
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify(first)}`, { what: 'the keys on the first zsh' });
  await until(async () => (await live()).length === 1, 'the second zsh ended on the server');
  await ctx.waitFor(`window.peix.state().tabs.filter(k => k.startsWith('shell:')).length === 1`, { what: 'its tab gone' });
  ctx.assert.deepEqual(await shells(), [first], 'the first is the one left');
  // ⌘W again: the first ends too, the split the board made folds, and the keys are on the chat
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), true);
  await ctx.waitFor(`!window.peix.state().split && window.peix.state().tab === 'chat'`, { what: 'one half again, on the chat' });
  await until(async () => (await live()).length === 0, 'no zsh left on the server');
  // the chat's own tab is never ⌘W's: with one half the key is the window's
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), false, 'on the chat with one half, ⌘W is the window\'s');
  ctx.assert.equal(await ctx.peix('state().tab'), 'chat');

  // a page — the chat's PR, ⌥⌘G's first — and ⌘T on it opens a blank tab at once, a browser's: in front where a new
  // tab goes, the keys in its address, no dialog
  await ctx.key('KeyG');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`(window.peix.state().tab || '').startsWith('gh:')`, { what: 'the PR on a tab' });
  const pr = await ctx.peix('state().tab');
  await ctx.cmd('KeyT');
  await ctx.waitFor(`/^new:/.test(window.peix.state().tab)`, { what: 'a blank tab in front' });
  const blank = await ctx.peix('state().tab');
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('dialog[open]')`), false, 'no dialog');
  ctx.assert.deepEqual((await ctx.peix('state().strips'))[1], [pr, blank], 'beside the PR');
  ctx.assert.equal(await ctx.evaluate(`document.activeElement?.matches('#ptabsB .ptab.on.blank .paddr')`), true, 'the keys in its address');
  ctx.assert.equal((await ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'pane').pop())`).then(JSON.parse)).panes.length, 0, 'no page shown over it');
  const rows = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#gbodyB .gblank .pkrow')].map(r => [r.querySelector('.n').textContent, r.title, r.classList.contains('sel')]))`).then(JSON.parse);
  out.empty = await rows();
  ctx.assert.ok(out.empty.length >= 1 && out.empty.every(([, url]) => url !== pr.slice(3)), 'under it, the chat\'s pages that are not on a tab — the other PR, not this one');
  await ctx.settle();
  await ctx.shot('blank');
  const first1 = async text => { await ctx.fill('#ptabsB .paddr', text); return (await rows())[0]; };
  ctx.assert.deepEqual(await first1('localhost:3000/x'), ['Open localhost:3000/x', 'http://localhost:3000/x', true], 'the loopback over http, marked for ⏎');
  ctx.assert.deepEqual(await first1('two words'), ['Search the web for “two words”', 'https://www.google.com/search?q=two%20words', true], 'words are a search');
  ctx.assert.deepEqual(await first1('example.com/a?b=1'), ['Open example.com/a?b=1', 'https://example.com/a?b=1', true], 'a bare host over https');
  // what was typed outlives a redraw of the strip, and the keys come back to it with the half
  await ctx.evaluate(`document.querySelector('#ptabsB')._drawn = null`);
  await ctx.cmd('Digit1');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#ptabsB .paddr').value`), 'example.com/a?b=1', 'the text kept through a redraw');
  await ctx.cmd('Digit2');
  ctx.assert.equal(await ctx.evaluate(`document.activeElement?.matches('#ptabsB .paddr')`), true, '⌘2 puts the keys back in the box');
  // ⏎: the blank tab becomes the page, in its place
  const press = key => ctx.evaluate(`document.querySelector('#ptabsB .paddr').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }))`);
  await press('Enter');
  await ctx.waitFor(`window.peix.state().tab === 'gh:https://example.com/a?b=1'`, { what: 'the page on the tab, the keys on it' });
  ctx.assert.deepEqual((await ctx.peix('state().strips'))[1], [pr, 'gh:https://example.com/a?b=1'], 'where the blank tab was, which is gone');
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('.gblank')`), false, 'and its list with it');
  ctx.assert.equal((await ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'pane').pop())`).then(JSON.parse)).focus, 'gh:https://example.com/a?b=1', 'the shell shows the page and gives it the keys');

  // esc in the box: what was typed goes first, then the tab; ⌘T on a blank tab is another; ⌘W closes one
  await ctx.cmd('KeyT');
  await ctx.waitFor(`/^new:/.test(window.peix.state().tab)`, { what: 'a blank tab again' });
  await ctx.fill('#ptabsB .paddr', 'abc');
  await press('Escape');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#ptabsB .paddr').value`), '', 'esc empties the box');
  ctx.assert.match(await ctx.peix('state().tab'), /^new:/, '…and the tab stays');
  await press('Escape');
  await ctx.waitFor(`!window.peix.state().tabs.some(k => k.startsWith('new:'))`, { what: 'esc on an empty box closes the tab' });
  await ctx.cmd('KeyT'); await ctx.waitFor(`/^new:/.test(window.peix.state().tab)`, { what: 'a blank tab' });
  await ctx.cmd('KeyT'); await ctx.waitFor(`window.peix.state().tabs.filter(k => k.startsWith('new:')).length === 2`, { what: '⌘T on a blank tab: another' });
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), true);
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), true);
  await ctx.waitFor(`!window.peix.state().tabs.some(k => k.startsWith('new:'))`, { what: '⌘W twice closes both' });
  await ctx.evaluate(`window.peixPaneFocus('gh:https://example.com/a?b=1')`);

  // ⌘W on the page: it goes, and the keys stay in its half, on the PR
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), true);
  await ctx.waitFor(`!window.peix.state().tabs.includes('gh:https://example.com/a?b=1')`, { what: 'the page closed' });
  ctx.assert.equal(await ctx.peix('state().tab'), pr, 'the keys on the PR it was beside');
  ctx.assert.ok(!(await ctx.peix(`state().paneGh[${JSON.stringify(chat.id)}]`)).includes('https://example.com/a?b=1'), 'the page is forgotten');
  // ⌘T from the claude drawer once more while a page is in the other half: still a zsh — the kind is the keys' tab's
  await ctx.cmd('Digit1');
  await ctx.cmd('KeyT');
  await ctx.waitFor(`/^shell:/.test(window.peix.state().tab)`, { what: 'a zsh, not a blank tab' });

  // VS Code Web keeps ⌘W for its editors, and with none open the shell names its tab (2026-10-14, peixPaneClose): that
  // tab goes, by its key — wherever the keys are — and a key that is not one of the chat's tabs closes nothing
  await ctx.evaluate(`window.__realFetch = window.fetch; window.fetch = (u, o) => String(u).endsWith('/api/vscode-web') ? Promise.resolve({ ok: true, status: 200, json: async () => ({ url: 'http://127.0.0.1:1/' }) }) : window.__realFetch(u, o)`);
  await ctx.key('KeyE');
  await ctx.waitFor(`(window.peix.state().tab || '').startsWith('ide:')`, { what: 'the editor on a tab, the keys in it' });
  const ide = await ctx.peix('state().tab'), before = await ctx.peix('state().strips');
  await ctx.evaluate(`window.peixPaneClose('ide:http://127.0.0.1:1/?folder=%2Fnot-this-chat')`);
  ctx.assert.deepEqual(await ctx.peix('state().strips'), before, 'another key closes nothing');
  await ctx.cmd('Digit1');
  await ctx.evaluate(`window.peixPaneClose(${JSON.stringify(ide)})`);
  await ctx.waitFor(`!window.peix.state().tabs.includes(${JSON.stringify(ide)})`, { what: 'the editor\'s tab closed' });
  ctx.assert.equal(await ctx.peix('state().focusG'), 0, 'the keys stay in the half they were in');
  ctx.assert.deepEqual((await ctx.peix('state().strips'))[1], before[1].filter(k => k !== ide), 'the rest of its strip as it was');
  ctx.assert.ok(!(await ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'pane').pop())`).then(JSON.parse)).keys.includes(ide), 'the shell is told the page is no longer the chat\'s');
  ctx.assert.deepEqual(await ctx.evaluate('JSON.stringify(window.__errs)').then(JSON.parse), [], 'nothing threw');
  return out;
}
