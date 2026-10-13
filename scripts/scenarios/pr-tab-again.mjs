// A PR opened again is the tab it already has — while that tab is still at it (2026-10-13). Further into the PR (its
// files, a comment) is still the PR; a tab followed somewhere else is that somewhere's now: opening the PR gives it a
// new tab in front, and the old one keeps where it went, named for it. A closed tab's view lingers in the shell where it
// was left, so a new tab never takes that name. ⌥⌘G from a page that left the PR opens the PR rather than fill the
// column. The app's bridge is faked, as in pane-tabs.mjs, and so is its word on where a page is (peixPaneUrl).
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const [chat] = ctx.fixture.chats;   // the one with two PRs
  const out = {};
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs = []; addEventListener('error', e => window.__errs.push(e.message)); window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.reload();
  await ctx.openChat(chat.id);
  const [a] = await ctx.peix(`session(${JSON.stringify(chat.id)}).prs.map(p => p.url)`);
  const pages = () => ctx.peix(`state().paneTabs[${JSON.stringify(chat.id)}] || []`);
  const tab = () => ctx.peix('state().tab');
  const open = () => ctx.evaluate(`document.querySelector('#slist > .card[data-id=${JSON.stringify(chat.id)}] .cpr[data-url=${JSON.stringify(a)}]').click()`);   // the card's chip
  const wentTo = (k, url) => ctx.evaluate(`window.peixPaneUrl(${JSON.stringify(k)}, ${JSON.stringify(url)})`);   // the shell, as the page navigates
  const lastPane = () => ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'pane').pop() || null)`).then(JSON.parse);
  const label = k => ctx.evaluate(`[...(document.querySelector(${JSON.stringify(`.ptab[data-tab="${k}"]`)})?.childNodes || [])].find(n => n.nodeType === 3)?.textContent || null`);

  // the PR on its tab
  await open();
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify('gh:' + a)}`, { what: 'the PR on a tab' });
  ctx.assert.deepEqual(await pages(), ['gh:' + a]);

  // followed into its files, then to a comment: still the PR — opening it again is that tab
  await wentTo('gh:' + a, a + '/files');
  await ctx.cmd('Digit1'); await open();
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify('gh:' + a)}`, { what: 'the same tab, the PR\'s files' });
  await wentTo('gh:' + a, a + '#issuecomment-1');
  await ctx.cmd('Digit1'); await open();
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify('gh:' + a)}`, { what: 'the same tab, a comment on it' });
  ctx.assert.deepEqual(await pages(), ['gh:' + a], 'no second tab while the first is at the PR');

  // followed elsewhere — another PR whose number starts with this one's: no longer the PR. Opening it is a new tab, in
  // front, the keys on it; the old one stays, named for where it went
  const away = a + '0';
  await wentTo('gh:' + a, away);
  await ctx.cmd('Digit1'); await open();
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify('gh2:' + a)}`, { what: 'a new tab for the PR' });
  out.two = { pages: await pages(), strip: (await ctx.peix('state().strips'))[1], pane: await lastPane(), old: await label('gh:' + a) };
  ctx.assert.deepEqual(out.two.pages, ['gh:' + a, 'gh2:' + a]);
  ctx.assert.deepEqual(out.two.strip, ['gh:' + a, 'gh2:' + a], 'beside the old one, in the half without the chat');
  ctx.assert.equal(out.two.pane.focus, 'gh2:' + a, 'the shell shows the new tab and gives it the keys');
  const n = /\/pull\/(\d+)$/.exec(a)[1];
  ctx.assert.match(out.two.old, new RegExp(`#${n}0$`), 'the old tab is named for where it is');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#ptabsB .purl')?.dataset.url`), a, 'the new one\'s address is the PR');
  await ctx.settle();
  await ctx.shot('two-tabs');

  // again: the new tab, not a third
  await ctx.cmd('Digit1'); await open();
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify('gh2:' + a)}`, { what: 'the new tab again' });
  ctx.assert.equal((await pages()).length, 2);

  // the old tab clicked: it comes up as it stands, nothing opened
  await ctx.evaluate(`document.querySelector(${JSON.stringify(`#ptabsB .ptab[data-tab="gh:${a}"]`)}).click()`);
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify('gh:' + a)}`, { what: 'the old tab in front' });
  ctx.assert.equal((await pages()).length, 2, 'a tab clicked is never a new one');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#ptabsB .purl')?.dataset.url`), away);
  // ⌥⌘G from it: not the PR's page, so not filling the column — the PRs, to choose from
  await ctx.key('KeyG');
  await ctx.waitFor(`!!document.querySelector('#pick').open`, { what: 'the PR picker' });
  ctx.assert.equal(await ctx.peix('state().zoomed'), null, 'nothing filled the column');
  await ctx.evaluate(`document.querySelector('#pick').close()`);
  // ⌥⌘G from the PR's own tab still fills the column, and back
  await ctx.evaluate(`document.querySelector(${JSON.stringify(`#ptabsB .ptab[data-tab="gh2:${a}"]`)}).click()`);
  await ctx.key('KeyG');
  await ctx.waitFor(`window.peix.state().zoomed === 1`, { what: 'the PR\'s half filling the column' });
  await ctx.key('KeyG');
  await ctx.waitFor(`window.peix.state().zoomed === null`, { what: 'both back' });

  // the new tab followed elsewhere too, then closed: its view lingers in the shell there, so the PR's next tab is
  // another name — from a blank tab, the PR's address typed
  await wentTo('gh2:' + a, 'https://example.com/elsewhere');
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), true);
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify('gh:' + a)}`, { what: 'the old tab in front again' });
  await ctx.cmd('KeyT');
  await ctx.waitFor(`/^new:/.test(window.peix.state().tab)`, { what: 'a blank tab' });
  ctx.assert.ok(await ctx.evaluate(`[...document.querySelectorAll('#gbodyB .gblank .lpr')].some(e => e.textContent === ${JSON.stringify('#' + n)})`), 'the PR offered under it: no tab is at it');
  await ctx.fill('#ptabsB .paddr', a);
  await ctx.evaluate(`document.querySelector('#ptabsB .paddr').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`window.peix.state().tab === ${JSON.stringify('gh3:' + a)}`, { what: 'the PR on a tab of a name no view holds' });
  ctx.assert.deepEqual(await pages(), ['gh:' + a, 'gh3:' + a]);
  ctx.assert.deepEqual(await ctx.evaluate('JSON.stringify(window.__errs)').then(JSON.parse), [], 'nothing threw');
  return out;
}
