// The chat's pages as tabs (2026-09-20), with the app's bridge faked: ⌥⌘G puts a PR on a tab of its own, again (the
// picker, the other row) the second beside it, ⌥⌘E the editor, ⌥⌘T a zsh — five tabs. Since 2026-09-22 a tab that is
// new splits the column and opens in its right half, so the strip the keys are in is `#ptabsB` from the first page on
// — `strip()` below is whichever that is, and the left half keeps the chat; the shell hears one `pane` message per change (the chat's
// pages, the one to show, the pane's place: the chat column below the strip); Esc through the shell goes back to
// the chat; × forgets a page; the tab a chat was on comes back with it; a zsh that ends takes its tab. The strip
// also carries the address of the page on top (2026-09-21): the key's URL until the shell reports a navigation
// (peixPaneUrl), shown without its scheme, copied whole by a click, and remembered per page across tab switches.
// Since 2026-09-25 each half's strip lists its own tabs — claude on the left, the pages and the zsh on the right —
// and a page dragged onto the left half is up there, beside the one on the right. Since 2026-09-28 a half whose one
// tab is not a web page has no strip, only a 2 px rule (claude alone on the left, the editor alone on the right), a
// page alone keeps its strip for the address; a click on a page tells the board its half has the keys
// (peixPaneFocus); ⌥⌘W closes the tab the keys are in, and ··· closes the editor.
export const meta = { server: true, fixture: 'auto' };
export default async function (ctx) {
  const [two, plain] = ctx.fixture.chats;
  const out = {};
  // the bridge, before the page's script runs — inApp is read once, at load
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.evaluate(`location.reload()`);
  await ctx.waitFor(`window.__posts && document.querySelectorAll('.card').length > 0`, { what: 'the board again, with the bridge' });
  // The strip of the half the keys are in — each lists only its own half's tabs, so everything here reads the one
  // the board is acting on; `strips()` is both, left then right.
  const STRIP = `(window.peix.state().focusG ? '#ptabsB' : '#ptabs')`;
  const strips = () => ctx.evaluate(`JSON.stringify(['#ptabs', '#ptabsB'].map(id => [...document.querySelectorAll(id + ' .ptab')].map(b => b.dataset.tab.split(':')[0])))`).then(JSON.parse);
  const tabsNow = () => ctx.evaluate(`JSON.stringify([...document.querySelector(${STRIP}).querySelectorAll('.ptab')].map(b => ({ k: b.dataset.tab, on: b.classList.contains('on'), label: b.firstChild.textContent })))`).then(JSON.parse);
  const lastPane = () => ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'pane').pop() || null)`).then(JSON.parse);
  const onTab = () => ctx.evaluate(`document.querySelector(${STRIP}).hidden ? 'hidden' : window.peix.state().tab`);
  const lone = () => ctx.evaluate(`JSON.stringify(['#ptabs', '#ptabsB'].map(id => document.querySelector(id).classList.contains('lone')))`).then(JSON.parse);
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelectorAll('#prlist .prrow').length === 2`, { what: 'two PR rows' });
  ctx.assert.equal(await onTab(), 'hidden', 'no strip before a page or a zsh');
  // ⌥⌘G → the picker → ⏎: the first PR on a tab of its own — the chat's second, so the column splits and the page
  // opens in the right half, under its own strip, with the chat left where it was
  await ctx.key('KeyG');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`(document.querySelector('#ptabsB .ptab.on')?.dataset.tab || '').startsWith('gh:')`, { what: 'the PR tab on in the right half' });
  out.one = { tabs: await tabsNow(), pane: await lastPane(), halves: await ctx.peix('state().halves'), focusG: await ctx.peix('state().focusG') };
  ctx.assert.equal(out.one.focusG, 1, 'a new tab takes the keys into the right half');
  ctx.assert.equal(out.one.halves[0], 'chat', '…and the chat keeps the left one');
  ctx.assert.deepEqual(await ctx.peix('state().strips').then(s => s.map(l => l.map(k => k.split(':')[0]))), [['chat'], ['gh']], 'each half holds its own tabs');
  ctx.assert.deepEqual(await strips(), [[], ['gh']], 'claude alone has no strip; a page alone keeps its own');
  ctx.assert.deepEqual(await lone(), [true, false], 'the left one is a rule');
  ctx.assert.equal(out.one.tabs.length, 1); ctx.assert.match(out.one.tabs[0].label, /^[\w.-]+#\d+$/, 'labelled repo#n');
  ctx.assert.equal(out.one.pane.show, out.one.tabs[0].k); ctx.assert.deepEqual(out.one.pane.keys, [out.one.tabs[0].k]);
  const strip = await ctx.evaluate(`(r => ({ left: Math.round(document.querySelector('#gbodyB').getBoundingClientRect().left), bottom: Math.round(r.bottom) }))(document.querySelector('#ptabsB').getBoundingClientRect())`);
  ctx.assert.equal(out.one.pane.top, strip.bottom, 'the pane starts under that half\'s strip'); ctx.assert.equal(out.one.pane.left, strip.left, 'and at that half');
  ctx.assert.ok(await ctx.evaluate(`!!document.querySelector('#ptabsB .navs .nav[data-nav="back"]')`), '‹ › ↻ ↗ with a page on');
  // the address: the key's URL to begin with, then wherever the shell says the view went
  const purl = () => ctx.evaluate(`JSON.stringify((el => el && { text: el.textContent, url: el.dataset.url, key: el.dataset.key })(document.querySelector(${STRIP}).querySelector('.purl')) || null)`).then(JSON.parse);
  const ghKey = out.one.tabs[0].k, ghUrl = ghKey.slice(3);
  out.url = { first: await purl() };
  ctx.assert.equal(out.url.first.url, ghUrl, 'the address is the URL the tab was opened with');
  ctx.assert.equal(out.url.first.text, ghUrl.replace(/^https:\/\//, ''), 'shown without its scheme');
  const deep = ghUrl + '/files';
  await ctx.evaluate(`window.peixPaneUrl(${JSON.stringify(ghKey)}, ${JSON.stringify(deep)})`);
  out.url.moved = await purl();
  ctx.assert.equal(out.url.moved.url, deep, 'a navigation reported by the shell moves it');
  ctx.assert.equal(out.url.moved.text, deep.replace(/^https:\/\//, ''));
  await ctx.shot('address', await ctx.evaluate(`(r => ({ x: r.left, y: Math.max(0, r.top - 70), width: r.width, height: 110 }))(document.querySelector(${STRIP}).getBoundingClientRect())`));
  // a click on it copies the whole address, scheme and all (headless Chrome resolves writeText into no clipboard at
  // all — readText always comes back empty — so what is handed to it is what is checked)
  await ctx.evaluate(`window.__clip = []; navigator.clipboard.writeText = t => { window.__clip.push(t); return Promise.resolve(); }`);
  await ctx.evaluate(`document.querySelector(${STRIP}).querySelector('.purl').click()`);
  out.url.copied = await ctx.evaluate(`window.__clip.slice(-1)[0] ?? null`);
  out.url.note = await ctx.evaluate(`document.querySelector('.note')?.textContent || null`);
  ctx.assert.equal(out.url.copied, deep, 'the whole address, scheme and all');
  ctx.assert.match(out.url.note || '', /copied/i, 'and a note says so');
  // …unless part of it is selected by hand: that click is someone copying their own selection
  await ctx.evaluate(`(el => { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })(document.querySelector(${STRIP}).querySelector('.purl'))`);
  await ctx.evaluate(`document.querySelector(${STRIP}).querySelector('.purl').click()`);
  out.url.selected = await ctx.evaluate(`window.__clip.length`);
  ctx.assert.equal(out.url.selected, 1, 'a selection inside it wins');
  await ctx.evaluate(`getSelection().removeAllRanges(); document.querySelectorAll('.note').forEach(n => n.remove())`);
  await ctx.evaluate(`document.querySelector(${STRIP}).querySelector('.nav[data-nav="reload"]').click()`);
  ctx.assert.deepEqual(await ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'nav').pop())`).then(JSON.parse), { type: 'nav', what: 'reload' });
  // ⌥⌘G again: the picker (always, with several); the other row → a second tab, on
  await ctx.key('KeyG'); await ctx.waitFor(`document.querySelector('#pick').open`, { what: 'the picker again' });
  await ctx.evaluate(`document.querySelector('#picklist .pkrow.pr:not(:has(.cur))').click()`);
  await ctx.waitFor(`document.querySelectorAll('#ptabsB .ptab[data-tab^="gh:"]').length === 2`, { what: 'two PR tabs, both in the right half' });
  out.two = { tabs: await tabsNow(), pane: await lastPane() };
  ctx.assert.equal(out.two.tabs[1].on, true); ctx.assert.equal(out.two.pane.show, out.two.tabs[1].k); ctx.assert.equal(out.two.pane.keys.length, 2);
  // Esc, as the shell forwards it: back to the chat — which is in the left half, so the keys go there (2026-09-25:
  // claude keeps the first half) and the page in the right half stays up, which is what two halves are for
  await ctx.evaluate(`window.peixKey('Escape')`);
  out.esc = { on: await onTab(), pane: await lastPane(), halves: await ctx.peix('state().halves'), focusG: await ctx.peix('state().focusG') };
  ctx.assert.equal(out.esc.on, 'chat'); ctx.assert.equal(out.esc.focusG, 0, 'the keys went to the chat\'s half');
  ctx.assert.equal(out.esc.halves[0], 'chat', 'the chat did not move');
  ctx.assert.equal(out.esc.pane.keys.length, 2, 'both pages kept');
  ctx.assert.equal(out.esc.pane.panes.length, 1, 'and one of them is still up — the other half\'s');
  ctx.assert.ok(await ctx.evaluate(`!document.querySelector('#ptabs .navs .nav[data-nav]')`), 'no ‹ › ↻ ↗ on the chat tab');
  // ⌥⌘E with the keys on the chat: the editor's tab (its route stubbed to a URL the board would serve) opens in the
  // right half all the same — a new tab never takes the chat's place
  await ctx.evaluate(`window.__realFetch = window.fetch; window.fetch = (u, o) => String(u).endsWith('/api/vscode-web') ? Promise.resolve({ ok: true, status: 200, json: async () => ({ url: 'http://127.0.0.1:1/' }) }) : window.__realFetch(u, o)`);
  await ctx.key('KeyE'); await ctx.waitFor(`(document.querySelector('#ptabsB .ptab.on')?.dataset.tab || '').startsWith('ide:')`, { what: 'the editor tab on' });
  ctx.assert.equal((await ctx.peix('state().halves'))[0], 'chat', 'claude kept the left half');
  out.ide = { tabs: await tabsNow(), pane: await lastPane() };
  ctx.assert.equal(out.ide.tabs.length, 3); ctx.assert.equal(out.ide.tabs[2].label, 'VS Code'); ctx.assert.match(out.ide.pane.show, /^ide:http:\/\/127\.0\.0\.1:1\/\?folder=/);
  // ⌥⌘T: a zsh — five tabs, the zsh second; the pane goes under it
  await ctx.key('KeyT'); await ctx.waitFor(`document.querySelector('#ptabsB .ptab.on')?.dataset.tab === 'shell'`, { what: 'the zsh tab on', timeout: 20_000 });
  out.five = await strips(); ctx.assert.deepEqual(out.five, [[], ['shell', 'gh', 'gh', 'ide']], 'five tabs: claude on the left, alone and so with no strip, the rest on the right');
  out.zsh = await lastPane();
  ctx.assert.deepEqual(out.zsh.panes, [], 'the zsh took the right half from the editor; the left half is claude\'s');
  ctx.assert.equal(out.zsh.focus, null, 'so no page is up for the shell to focus');
  await ctx.shot('tabs', await ctx.evaluate(`(r => ({ x: r.left, y: Math.max(0, r.top - 70), width: r.width, height: 110 }))(document.querySelector('#ptabsB').getBoundingClientRect())`));
  // a click on a PR's tab brings it back — and no strip under the header since 2026-09-24; × on it forgets the page
  const firstGh = out.two.tabs[0].k;
  await ctx.evaluate(`document.querySelector('#ptabsB .ptab[data-tab=${JSON.stringify(firstGh)}]').click()`);
  await ctx.waitFor(`document.querySelector('#ptabsB .ptab.on')?.dataset.tab === ${JSON.stringify(firstGh)}`, { what: 'the first PR tab on again' });
  ctx.assert.equal((await lastPane()).show, firstGh); ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#prbar')`), false, 'no strip under the header');
  ctx.assert.equal('gh:' + await ctx.peix('state().pr'), firstGh, 'the board knows which PR is in front');
  out.url.back = await purl();
  ctx.assert.equal(out.url.back.url, deep, 'the address it was left on comes back with the tab');
  await ctx.evaluate(`document.querySelector('#ptabsB .ptab[data-tab=${JSON.stringify(firstGh)}] .x').click()`);
  out.closed = { tabs: await tabsNow(), pane: await lastPane() };
  ctx.assert.equal(out.closed.tabs.length, 3); ctx.assert.equal(out.closed.tabs[0].on, true, 'its half shows the first of its own tabs left, the zsh');
  ctx.assert.equal(out.closed.pane.show, null); ctx.assert.equal(out.closed.pane.keys.length, 2);
  // the tab a chat is on comes back with it: the other PR's, left on, survives a trip to the plain chat
  const other = out.two.tabs[1].k;
  await ctx.evaluate(`document.querySelector('#ptabsB .ptab[data-tab=${JSON.stringify(other)}]').click()`);
  await ctx.waitFor(`document.querySelector('#ptabsB .ptab.on')?.dataset.tab === ${JSON.stringify(other)}`, { what: 'the other PR tab on' });
  await ctx.openChat(plain.id);
  out.plain = { on: await onTab(), pane: await lastPane() }; ctx.assert.equal(out.plain.on, 'hidden'); ctx.assert.equal(out.plain.pane.show, null);
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelector('#ptabsB .ptab.on')?.dataset.tab === ${JSON.stringify(other)}`, { what: 'its tab back' });
  out.back = await lastPane(); ctx.assert.equal(out.back.show, other);
  // the zsh, ended: its tab goes
  const shellId = (await ctx.peix('session()')).shell.id;
  await ctx.server.api(`/api/terminals/${shellId}`, { method: 'DELETE' });
  await ctx.waitFor(`!document.querySelector('.ptab[data-tab="shell"]')`, { what: 'the zsh tab gone', timeout: 10_000 });
  out.end = await tabsNow();
  // A page in each half (2026-09-22), and the shell is told where each one goes — two rects side by side under
  // their own strips, and which of them has the keys. The board sends `show` too, for a shell built before the
  // split existed. Every page opens on the right, so the PR gets to the left by being dragged there (2026-09-25).
  await ctx.cmd('Digit2');
  await ctx.waitFor(`window.peix.state().split === true && window.peix.state().focusG === 1`, { what: 'the keys in the right half' });
  await ctx.evaluate(`document.querySelector('#ptabsB .ptab[data-tab^="ide:"]').click()`);
  await ctx.waitFor(`window.peix.state().halves[1].startsWith('ide:')`, { what: 'the editor in the right half' });
  const litA = await ctx.drag(`#ptabsB .ptab[data-tab=${JSON.stringify(other)}]`, '#gbody', () => ctx.evaluate(`[...document.querySelectorAll('.grp.drop')].map(g => g.id).join()`));
  ctx.assert.equal(litA, 'grp', 'the half under the pointer lit up while the tab was on its way');
  await ctx.waitFor(`window.peix.state().halves[0] === ${JSON.stringify(other)}`, { what: 'the PR dragged into the left half' });
  ctx.assert.deepEqual(await strips(), [['chat', 'gh'], []], 'the PR is the left strip\'s now, and the editor alone on the right has no strip');
  ctx.assert.deepEqual(await lone(), [false, true], 'the right one is a rule');
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('.ptab.ghost, .grp.drop, body.tabdrag')`), false, 'nothing of the drag is left behind');
  const both = await lastPane();
  ctx.assert.equal(both.panes.length, 2, 'a page placed in each half');
  ctx.assert.ok(both.panes[0].key.startsWith('gh:') && both.panes[1].key.startsWith('ide:'), 'the PR on the left, the editor on the right');
  ctx.assert.equal(both.focus, both.panes[0].key, 'the keys went with the page that was dropped');
  ctx.assert.equal(both.show, both.focus, 'and an older shell is told that one');
  ctx.assert.ok(both.panes[0].left + both.panes[0].width <= both.panes[1].left, 'side by side, not overlapping');
  ctx.assert.ok(both.panes.every(p => p.width > 50 && p.height > 50), 'both have room');
  const rule = await ctx.evaluate(`Math.round(document.querySelector('#ptabsB').getBoundingClientRect().bottom)`);
  ctx.assert.equal(both.panes[1].top, rule, 'the editor starts under its half\'s rule — the strip\'s room is the page\'s');
  ctx.assert.ok(both.panes[1].top < both.panes[0].top, 'higher than the PR beside it, under a whole strip');
  out.split = both;
  await ctx.shot('split');

  // a click on a page, as the shell reports it: the keys go to that page's half, and the shell is told to focus it
  const ideK = both.panes[1].key, ghK = both.panes[0].key;
  await ctx.evaluate(`window.peixPaneFocus(${JSON.stringify(ideK)})`);
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, 'a click on the editor put the keys in the right half');
  ctx.assert.equal((await lastPane()).focus, ideK, 'and the shell is told to focus the editor');
  await ctx.evaluate(`window.peixPaneFocus('gh:https://nowhere.example/')`);
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, 'a page not on show moves nothing');
  await ctx.evaluate(`window.peixPaneFocus(${JSON.stringify(ghK)})`);
  ctx.assert.equal(await ctx.peix('state().focusG'), 0, 'and one on the PR, back to the left');

  // the chat dragged onto the right half: the transcript goes with its tab, and the PR alone on the left keeps its
  // strip — its address is worth the room
  await ctx.drag('#ptabs .ptab[data-tab="chat"]', '#gbodyB');
  await ctx.waitFor(`JSON.stringify(window.peix.state().halves) === ${JSON.stringify(JSON.stringify([other, 'chat']))}`, { what: 'the chat dragged into the right half' });
  ctx.assert.deepEqual(await strips(), [['gh'], ['chat', 'ide']], 'each strip lists what was dragged into it, in the chat\'s order');
  ctx.assert.deepEqual(await lone(), [false, false], 'a page alone keeps its strip');
  ctx.assert.ok(await ctx.evaluate(`!!document.querySelector('#ptabs .purl')`), '…with the address in it');
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, 'the keys followed the drop into the right half');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#log').parentElement.id`), 'gbodyB', 'the transcript moved with the chat tab');

  // ⌥⌘W on the chat's own tab closes nothing; on the PR it lets the page go — its half empties, the split the board
  // made folds, and the keys come back to the chat
  await ctx.key('KeyW');
  ctx.assert.match(await ctx.evaluate(`document.querySelector('.note')?.textContent || ''`), /chat tab stays/, '⌥⌘W on the chat: a note');
  await ctx.evaluate(`document.querySelectorAll('.note').forEach(n => n.remove())`);
  await ctx.evaluate(`window.peixPaneFocus(${JSON.stringify(ghK)})`);
  await ctx.key('KeyW');
  await ctx.waitFor(`window.peix.state().split === false`, { what: 'the PR closed by ⌥⌘W, and the board\'s split with it' });
  ctx.assert.equal(await ctx.peix('state().tab'), 'chat', 'the keys are on the chat');
  ctx.assert.ok(!(await ctx.peix(`state().paneGh[${JSON.stringify(two.id)}]`) || []).includes(ghK.slice(3)), 'the page is forgotten');
  ctx.assert.deepEqual(await strips(), [['chat', 'ide'], []], 'one strip: the chat and the editor');

  // ··· closes the editor — the × a lone editor's half does not show
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  ctx.assert.ok(await ctx.evaluate(`!!document.querySelector('#hmenu #ideCloseBtn')`), '··· has a row to close VS Code Web');
  await ctx.evaluate(`document.querySelector('#ideCloseBtn').click()`);
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#hmenu').open`), false, 'the menu went');
  ctx.assert.deepEqual(await ctx.peix('state().tabs'), ['chat'], 'the chat alone');
  ctx.assert.equal(await onTab(), 'hidden', 'and no strip at all');
  ctx.assert.deepEqual((await lastPane()).keys, [], 'the shell holds no page for the chat');
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#hmenu #ideCloseBtn')`), false, 'and ··· has nothing of it left');
  await ctx.evaluate(`document.querySelector('#hmenu').close()`);
  return out;
}
