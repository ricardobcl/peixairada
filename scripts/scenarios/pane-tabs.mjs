// The chat's pages as tabs (2026-09-20), with the app's bridge faked: ⌥⌘G puts a PR on a tab of its own, again the
// second beside it, ⌥⌘E the editor, ⌥⌘T a zsh — five tabs; the shell hears one `pane` message per change (the chat's
// pages, the one to show, the pane's place: the chat column below the strip); Esc through the shell goes back to
// the chat; × forgets a page; the tab a chat was on comes back with it; a zsh that ends takes its tab.
export const meta = { server: true, fixture: 'auto' };
export default async function (ctx) {
  const [two, plain] = ctx.fixture.chats;
  const out = {};
  // the bridge, before the page's script runs — inApp is read once, at load
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.evaluate(`location.reload()`);
  await ctx.waitFor(`window.__posts && document.querySelectorAll('.card').length > 0`, { what: 'the board again, with the bridge' });
  const tabsNow = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#ptabs .ptab')].map(b => ({ k: b.dataset.tab, on: b.classList.contains('on'), label: b.firstChild.textContent })))`).then(JSON.parse);
  const lastPane = () => ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'pane').pop() || null)`).then(JSON.parse);
  const onTab = () => ctx.evaluate(`document.querySelector('#ptabs').hidden ? 'hidden' : (document.querySelector('#ptabs .ptab.on')?.dataset.tab || null)`);
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelectorAll('#prlist .prrow').length === 2`, { what: 'two PR rows' });
  ctx.assert.equal(await onTab(), 'hidden', 'no strip before a page or a zsh');
  // ⌥⌘G → the picker → ⏎: the first PR on a tab, on; the shell told to show it under the strip, at the chat column
  await ctx.key('KeyG');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`(document.querySelector('#ptabs .ptab.on')?.dataset.tab || '').startsWith('gh:')`, { what: 'the PR tab on' });
  out.one = { tabs: await tabsNow(), pane: await lastPane() };
  ctx.assert.equal(out.one.tabs.length, 2); ctx.assert.match(out.one.tabs[1].label, /^[\w.-]+#\d+$/, 'labelled repo#n');
  ctx.assert.equal(out.one.pane.show, out.one.tabs[1].k); ctx.assert.deepEqual(out.one.pane.keys, [out.one.tabs[1].k]);
  const strip = await ctx.evaluate(`(r => ({ left: Math.round(document.querySelector('#chat').getBoundingClientRect().left), bottom: Math.round(r.bottom) }))(document.querySelector('#ptabs').getBoundingClientRect())`);
  ctx.assert.equal(out.one.pane.top, strip.bottom, 'the pane starts under the strip'); ctx.assert.equal(out.one.pane.left, strip.left, 'and at the chat column');
  ctx.assert.ok(await ctx.evaluate(`!!document.querySelector('#ptabs .navs .nav[data-nav="back"]')`), '‹ › ↻ ↗ with a page on');
  await ctx.evaluate(`document.querySelector('#ptabs .nav[data-nav="reload"]').click()`);
  ctx.assert.deepEqual(await ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'nav').pop())`).then(JSON.parse), { type: 'nav', what: 'reload' });
  // ⌥⌘G again: the other PR, a second tab, on
  await ctx.key('KeyG'); await ctx.waitFor(`document.querySelectorAll('#ptabs .ptab[data-tab^="gh:"]').length === 2`, { what: 'two PR tabs' });
  out.two = { tabs: await tabsNow(), pane: await lastPane() };
  ctx.assert.equal(out.two.tabs[2].on, true); ctx.assert.equal(out.two.pane.show, out.two.tabs[2].k); ctx.assert.equal(out.two.pane.keys.length, 2);
  // Esc, as the shell forwards it: the chat tab, the pane told to go, the pages kept
  await ctx.evaluate(`window.peixKey('Escape')`);
  out.esc = { on: await onTab(), pane: await lastPane() };
  ctx.assert.equal(out.esc.on, 'chat'); ctx.assert.equal(out.esc.pane.show, null); ctx.assert.equal(out.esc.pane.keys.length, 2);
  ctx.assert.ok(await ctx.evaluate(`!document.querySelector('#ptabs .navs')`), 'no ‹ › ↻ ↗ on the chat tab');
  // ⌥⌘E: the editor's tab (its route stubbed to a URL the board would serve)
  await ctx.evaluate(`window.__realFetch = window.fetch; window.fetch = (u, o) => String(u).endsWith('/api/vscode-web') ? Promise.resolve({ ok: true, status: 200, json: async () => ({ url: 'http://127.0.0.1:1/' }) }) : window.__realFetch(u, o)`);
  await ctx.key('KeyE'); await ctx.waitFor(`(document.querySelector('#ptabs .ptab.on')?.dataset.tab || '').startsWith('ide:')`, { what: 'the editor tab on' });
  out.ide = { tabs: await tabsNow(), pane: await lastPane() };
  ctx.assert.equal(out.ide.tabs.length, 4); ctx.assert.equal(out.ide.tabs[3].label, 'VS Code'); ctx.assert.match(out.ide.pane.show, /^ide:http:\/\/127\.0\.0\.1:1\/\?folder=/);
  // ⌥⌘T: a zsh — five tabs, the zsh second; the pane goes under it
  await ctx.key('KeyT'); await ctx.waitFor(`document.querySelector('#ptabs .ptab.on')?.dataset.tab === 'shell'`, { what: 'the zsh tab on', timeout: 20_000 });
  out.five = await tabsNow(); ctx.assert.deepEqual(out.five.map(t => t.k.split(':')[0]), ['chat', 'shell', 'gh', 'gh', 'ide']);
  ctx.assert.equal((await lastPane()).show, null, 'the pane goes under the zsh tab');
  await ctx.shot('tabs', await ctx.evaluate(`(r => ({ x: r.left, y: Math.max(0, r.top - 70), width: r.width, height: 110 }))(document.querySelector('#ptabs').getBoundingClientRect())`));
  // a click on a PR's tab brings it back (and its strip under the header); × on it forgets the page
  const firstGh = out.two.tabs[1].k;
  await ctx.evaluate(`document.querySelector('#ptabs .ptab[data-tab=${JSON.stringify(firstGh)}]').click()`);
  await ctx.waitFor(`document.querySelector('#ptabs .ptab.on')?.dataset.tab === ${JSON.stringify(firstGh)}`, { what: 'the first PR tab on again' });
  ctx.assert.equal((await lastPane()).show, firstGh); ctx.assert.equal(await ctx.evaluate(`document.querySelector('#prbar').hidden`), false, 'its strip shows');
  await ctx.evaluate(`document.querySelector('#ptabs .ptab[data-tab=${JSON.stringify(firstGh)}] .x').click()`);
  out.closed = { tabs: await tabsNow(), pane: await lastPane() };
  ctx.assert.equal(out.closed.tabs.length, 4); ctx.assert.equal(out.closed.pane.show, null); ctx.assert.equal(out.closed.pane.keys.length, 2);
  // the tab a chat is on comes back with it: the other PR's, left on, survives a trip to the plain chat
  const other = out.two.tabs[2].k;
  await ctx.evaluate(`document.querySelector('#ptabs .ptab[data-tab=${JSON.stringify(other)}]').click()`);
  await ctx.waitFor(`document.querySelector('#ptabs .ptab.on')?.dataset.tab === ${JSON.stringify(other)}`, { what: 'the other PR tab on' });
  await ctx.openChat(plain.id);
  out.plain = { on: await onTab(), pane: await lastPane() }; ctx.assert.equal(out.plain.on, 'hidden'); ctx.assert.equal(out.plain.pane.show, null);
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelector('#ptabs .ptab.on')?.dataset.tab === ${JSON.stringify(other)}`, { what: 'its tab back' });
  out.back = await lastPane(); ctx.assert.equal(out.back.show, other);
  // the zsh, ended: its tab goes
  const shellId = (await ctx.peix('session()')).shell.id;
  await ctx.server.api(`/api/terminals/${shellId}`, { method: 'DELETE' });
  await ctx.waitFor(`!document.querySelector('#ptabs .ptab[data-tab="shell"]')`, { what: 'the zsh tab gone', timeout: 10_000 });
  out.end = await tabsNow();
  return out;
}
