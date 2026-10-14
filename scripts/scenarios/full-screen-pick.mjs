// Which full screen ⌃⌘F is (2026-10-14): Settings › Look picks the fill, up to the notch, or macOS's own in a Space of
// its own, and the page tells the app (`fullscreen`) on every load and change — the app keeps it for a launch that comes
// back full screen before the page loads. What this checks: in a browser the row is not there and nothing is said; in
// the app (the bridge faked) the row is, the fill picked by default and said on load; a click on *its own Space* says
// so at once, is kept in the prefs and said again by the next load; *up to the notch* takes it back.
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  const openLook = async () => {
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
    await ctx.settle();
  };
  const row = () => ctx.evaluate(`JSON.stringify((() => {
    const r = document.querySelector('#fsRow'), box = r.getBoundingClientRect();
    return { hidden: r.hidden, shown: box.height > 0, checked: [...r.querySelectorAll('[data-fs]')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.fs) };
  })())`).then(JSON.parse);
  const said = () => ctx.evaluate(`JSON.stringify((window.__posts || []).filter(m => m.type === 'fullscreen'))`).then(JSON.parse);

  // a browser: no such row, nothing to tell
  await openLook();
  out.browser = await row();
  ctx.assert.equal(out.browser.hidden, true, 'hidden in a browser');
  ctx.assert.equal(out.browser.shown, false, 'and takes no room');

  // the app: the bridge there before the page's script runs
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.reload();
  ctx.assert.deepEqual(await said(), [{ type: 'fullscreen', space: false }], 'the fill, said on load');
  await openLook();
  out.app = await row();
  ctx.assert.equal(out.app.hidden, false, 'shown in the app');
  ctx.assert.equal(out.app.shown, true);
  ctx.assert.deepEqual(out.app.checked, ['fill'], 'up to the notch by default');
  await ctx.shot('look');

  await ctx.evaluate(`document.querySelector('#fsPick [data-fs="space"]').click()`);
  ctx.assert.deepEqual((await said()).at(-1), { type: 'fullscreen', space: true }, 'its own Space, said at once');
  ctx.assert.deepEqual((await row()).checked, ['space']);
  ctx.assert.equal(await ctx.evaluate('window.peix.prefs().fullSpace'), true, 'kept');

  await ctx.reload();
  ctx.assert.deepEqual(await said(), [{ type: 'fullscreen', space: true }], 'and said again by the next load');
  await openLook();
  ctx.assert.deepEqual((await row()).checked, ['space'], 'still picked');

  await ctx.evaluate(`document.querySelector('#fsPick [data-fs="fill"]').click()`);
  ctx.assert.deepEqual((await said()).at(-1), { type: 'fullscreen', space: false }, 'back to the fill');
  out.back = await row();
  ctx.assert.deepEqual(out.back.checked, ['fill']);
  return out;
}
