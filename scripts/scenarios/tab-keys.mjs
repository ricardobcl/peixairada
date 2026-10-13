// ⌘T and ⌘W are the tabs' (2026-10-13), a browser's and iTerm's. ⌘T in a terminal — claude's drawer, a zsh — starts
// another zsh in the chat's folder, as many as asked for, each its own tab (zsh, zsh 2) where a new tab goes; on a
// page it is a box for the address: what was typed first (an address, a bare host, words to search), then the chat's
// own pages not on a tab. ⌘W closes the tab the keys are in — a zsh ends, a page goes — and on the chat's own tab with
// one half it is the window's key. The app's bridge is faked, as in pane-tabs.mjs, so pages are tabs.
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const [chat] = ctx.fixture.chats;   // the one with two PRs
  const out = {};
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
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

  // ⌘W: the zsh the keys are in ends, and the keys land on the other one
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), true, '⌘W was the board\'s');
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify(first)}`, { what: 'the keys on the first zsh' });
  await until(async () => (await live()).length === 1, 'the second zsh ended on the server');
  ctx.assert.deepEqual(await shells(), [first], 'its tab went');
  // ⌘W again: the first ends too, the split the board made folds, and the keys are on the chat
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), true);
  await ctx.waitFor(`!window.peix.state().split && window.peix.state().tab === 'chat'`, { what: 'one half again, on the chat' });
  await until(async () => (await live()).length === 0, 'no zsh left on the server');
  // the chat's own tab is never ⌘W's: with one half the key is the window's
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), false, 'on the chat with one half, ⌘W is the window\'s');
  ctx.assert.equal(await ctx.peix('state().tab'), 'chat');

  // a page — the chat's PR, ⌥⌘G's first — and ⌘T on it is the box for an address
  await ctx.key('KeyG');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`(window.peix.state().tab || '').startsWith('gh:')`, { what: 'the PR on a tab' });
  const pr = await ctx.peix('state().tab');
  await ctx.cmd('KeyT');
  await ctx.waitFor(`document.querySelector('#pick').open`, { what: 'the address box' });
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#pickq').placeholder`), /address/);
  const rows = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#picklist .pkrow')].map(r => [r.querySelector('.n').textContent, r.title]))`).then(JSON.parse);
  out.empty = await rows();
  ctx.assert.ok(out.empty.length >= 1 && out.empty.every(([, url]) => url !== pr.slice(3)), 'empty, it offers the chat\'s pages that are not on a tab — the other PR, not this one');
  const first1 = async text => { await ctx.fill('#pickq', text); return (await rows())[0]; };
  ctx.assert.deepEqual(await first1('localhost:3000/x'), ['Open localhost:3000/x', 'http://localhost:3000/x'], 'the loopback over http');
  ctx.assert.deepEqual(await first1('two words'), ['Search the web for “two words”', 'https://www.google.com/search?q=two%20words'], 'words are a search');
  ctx.assert.deepEqual(await first1('example.com/a?b=1'), ['Open example.com/a?b=1', 'https://example.com/a?b=1'], 'a bare host over https');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`window.peix.state().tab === 'gh:https://example.com/a?b=1'`, { what: 'the page on a new tab, the keys on it' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#pick').open`), false, 'the box went');
  ctx.assert.deepEqual((await ctx.peix('state().strips'))[1], [pr, 'gh:https://example.com/a?b=1'], 'beside the PR, where a new tab goes');

  // ⌘W on the page: it goes, and the keys stay in its half, on the PR
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), true);
  await ctx.waitFor(`!window.peix.state().tabs.includes('gh:https://example.com/a?b=1')`, { what: 'the page closed' });
  ctx.assert.equal(await ctx.peix('state().tab'), pr, 'the keys on the PR it was beside');
  ctx.assert.ok(!(await ctx.peix(`state().paneGh[${JSON.stringify(chat.id)}]`)).includes('https://example.com/a?b=1'), 'the page is forgotten');
  // ⌘T from the claude drawer once more while a page is in the other half: still a zsh — the kind is the keys' tab's
  await ctx.cmd('Digit1');
  await ctx.cmd('KeyT');
  await ctx.waitFor(`/^shell:/.test(window.peix.state().tab)`, { what: 'a zsh, not the address box' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#pick').open`), false);
  return out;
}
