// A theme's title bar (2026-11-16, Flashbang; its posts checked 2026-11-24): the page tells the shell `{type:
// 'titlebar', color}` — the theme's crust while Flashbang's light half is worn in a light frame, null otherwise —, once
// per change. The bridge faked as window-title.mjs fakes it. What this checks: the board's own posts null at load;
// Flashbang its white; the dark frame, the dark half and ⌥⌘Y's preview of another theme null, each undone the white
// again; nothing more than once per change.
export const meta = { server: true, fixture: 'auto', prefs: { skinFollow: false, look: 'light' } };

export default async function (ctx) {
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };`,
  });

  await ctx.reload();

  const bars = () =>
    ctx
      .evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'titlebar').map(m => m.color))`)
      .then(JSON.parse);

  const click = sel => ctx.evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);

  const said = async (n, what) => {
    await ctx.waitFor(`window.__posts.filter(m => m.type === 'titlebar').length === ${n}`, { what });
    return (await bars()).at(-1);
  };

  const WHITE = '#ffffff';

  ctx.assert.deepEqual(await bars(), [null], 'the board’s own: macOS’s bar, said once at load');

  await click('#themePick [data-fam="flashbang"]');
  ctx.assert.equal(await said(2, 'Flashbang'), WHITE, 'Flashbang: its white');

  await click('#darkFrame');
  ctx.assert.equal(await said(3, 'the dark frame'), null, 'the dark frame round it: macOS’s bar');
  await click('#darkFrame');
  ctx.assert.equal(await said(4, 'the light frame again'), WHITE, 'the light frame again: the white');

  await click('#lookPick [data-look="dark"]');
  ctx.assert.equal(await said(5, 'the dark half'), null, 'Flashbang’s dark half, the board’s own: macOS’s bar');
  await click('#lookPick [data-look="light"]');
  ctx.assert.equal(await said(6, 'the light half again'), WHITE, 'the light half again: the white');

  await ctx.key('KeyY');
  await ctx.waitFor(`document.querySelector('#themes').open`, { what: 'the grid' });
  await ctx.fill('#themeq', 'tokyo day');
  ctx.assert.equal(await said(7, 'the preview'), null, 'another theme previewed: macOS’s bar');

  await ctx.evaluate(
    `document.querySelector('#themeq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))`,
  );

  ctx.assert.equal(await said(8, 'the preview let go'), WHITE, 'the preview let go: the white');

  await ctx.sleep(300); // nothing late
  const all = await bars();

  ctx.assert.equal(all.length, 8, 'once per change');
  return { posts: all };
}
