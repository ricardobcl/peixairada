// Where a web page opens in the app (2026-10-21): Settings › General › Links — in the board, a tab of the chat, as ever;
// or in the browser, but for the sites the board keeps (github.com at first, each an address's start). The app's bridge
// is faked, as in pane-tabs.mjs, so what goes to the browser is a posted `external`. What this checks: the row is the
// app's alone; by default every page is a tab and the shell is told to keep every link out; picked, a link in the
// transcript to another site goes to the browser while a PR stays a tab, the box under it is the list (whole names: not
// github.company.com), a new window from a page follows the same rule, and back in the board nothing goes out.
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const [chat] = ctx.fixture.chats;   // the one with two PRs
  const out = {};
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.reload();
  await ctx.openChat(chat.id);
  const outs = () => ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'external').map(m => m.url))`).then(JSON.parse);
  const asks = urls => ctx.evaluate(`JSON.stringify(${JSON.stringify(urls)}.map(u => window.peixLinkOut(u)))`).then(JSON.parse);
  const urls = ['https://example.com/a', 'https://github.com/acme/repo-a/pull/12', 'https://www.github.com/x', 'https://github.company.com/x', 'https://gist.github.com/x', 'http://localhost:3000/', 'https://example.com/docs/x', 'https://example.com/docsy'];

  // the row: the app's alone; in the board by default, the box under it off and saying why
  out.row = await ctx.evaluate(`JSON.stringify({ shown: !document.querySelector('#linksRow').hidden, checked: [...document.querySelectorAll('#pagesPick [data-out]')].map(b => b.getAttribute('aria-checked')),
    off: document.querySelector('#sitesRow').classList.contains('off'), say: document.querySelector('#sitesRow small').textContent, box: document.querySelector('#boardSites').value, disabled: document.querySelector('#boardSites').disabled })`).then(JSON.parse);
  ctx.assert.deepEqual(out.row, { shown: true, checked: ['true', 'false'], off: true, say: 'Every page opens in the board', box: 'github.com', disabled: true });
  ctx.assert.deepEqual(await asks(urls), urls.map(() => false), 'in the board: every link out stays');

  // in the browser: a link in the transcript to another site goes out; a PR stays a tab
  await ctx.evaluate(`document.querySelector('#pagesPick [data-out="1"]').click()`);
  ctx.assert.deepEqual(await ctx.evaluate(`JSON.stringify([window.peix.prefs().pagesOut, document.querySelector('#sitesRow').classList.contains('off'), document.querySelector('#boardSites').disabled])`).then(JSON.parse), [true, false, false]);
  ctx.assert.deepEqual(await asks(urls), [true, false, false, true, true, true, true, true], 'github.com kept, whole: not github.company.com, nor gist');
  await ctx.evaluate(`(() => { const a = document.createElement('a'); a.href = 'https://example.com/a'; a.textContent = 'x'; document.querySelector('#log .msg').appendChild(a); a.click(); a.remove(); })()`);
  ctx.assert.deepEqual(await outs(), ['https://example.com/a'], 'the browser');
  await ctx.evaluate(`document.querySelector('#shead .hpr[data-url$="/pull/12"]').click()`);
  await ctx.waitFor(`window.peix.state().tab?.startsWith('gh:')`, { what: 'the PR on a tab' });
  ctx.assert.deepEqual(await outs(), ['https://example.com/a'], 'the PR stayed in the board');

  // the list: more sites, an address's start — a path too
  await ctx.evaluate(`(b => { b.value = 'github.com,  example.com/docs localhost:3000'; b.dispatchEvent(new Event('change')); })(document.querySelector('#boardSites'))`);
  ctx.assert.deepEqual(await ctx.evaluate(`JSON.stringify(window.peix.prefs().boardSites)`).then(JSON.parse), ['github.com', 'example.com/docs', 'localhost:3000']);
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#boardSites').value`), 'github.com, example.com/docs, localhost:3000', 'said back tidied');
  ctx.assert.deepEqual(await asks(urls), [true, false, false, true, true, false, false, true], 'example.com/docs kept, not /docsy; localhost:3000 kept');

  // a page's new window follows the same rule (peixPaneOpen → openExternal)
  const key = await ctx.evaluate(`window.peix.state().tab`);
  await ctx.evaluate(`window.peixPaneOpen(${JSON.stringify(key)}, 'https://news.example.org/story')`);
  ctx.assert.deepEqual((await outs()).slice(-1), ['https://news.example.org/story'], 'a new window to another site, the browser');
  await ctx.evaluate(`document.querySelector('#settings').showModal(); window.peix.prefs().settingsPane = 'general'`);
  await ctx.settle();
  const g = await ctx.evaluate(`JSON.stringify((r => ({ x: r.left, y: r.top, w: r.width, h: r.height }))(document.querySelector('#linksRow').getBoundingClientRect()))`).then(JSON.parse);
  if (g.w) await ctx.shot('links-row', { x: g.x - 10, y: g.y - 10, width: g.w + 20, height: g.h + 20, scale: 2 });
  await ctx.evaluate(`document.querySelector('#settings').close()`);

  // back in the board: nothing goes out
  await ctx.evaluate(`document.querySelector('#pagesPick [data-out="0"]').click()`);
  ctx.assert.deepEqual(await asks(urls), urls.map(() => false));
  return out;
}
