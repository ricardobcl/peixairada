// Which full screen ⌃⌘F is (2026-10-14): Settings › General picks the fill (a pop-up since 2026-10-16), up to the notch, or macOS's own in a Space of
// its own, and the page tells the app (`fullscreen`) on every load and change — the app keeps it for a launch that comes
// back full screen before the page loads. What this checks: in a browser the row is not there and nothing is said; in
// the app (the bridge faked) the row is, the fill picked by default and said on load; *its own Space* picked says
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
    return { hidden: r.hidden, shown: box.height > 0, checked: [document.querySelector('#fsPick').value] };
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

  const choose = v => ctx.evaluate(`(s => { s.value = '${v}'; s.dispatchEvent(new Event('change', { bubbles: true })); })(document.querySelector('#fsPick'))`);
  await choose('space');
  ctx.assert.deepEqual((await said()).at(-1), { type: 'fullscreen', space: true }, 'its own Space, said at once');
  ctx.assert.deepEqual((await row()).checked, ['space']);
  ctx.assert.equal(await ctx.evaluate('window.peix.prefs().fullSpace'), true, 'kept');

  await ctx.reload();
  ctx.assert.deepEqual(await said(), [{ type: 'fullscreen', space: true }], 'and said again by the next load');
  await openLook();
  ctx.assert.deepEqual((await row()).checked, ['space'], 'still picked');

  await choose('fill');
  ctx.assert.deepEqual((await said()).at(-1), { type: 'fullscreen', space: false }, 'back to the fill');
  out.back = await row();
  ctx.assert.deepEqual(out.back.checked, ['fill']);
  return out;
}
