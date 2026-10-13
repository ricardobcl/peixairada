// The page follows a restart (2026-10-13): a server started since the page was served, with the same page on disk,
// reloads nothing; with another page on disk — a restart by hand after a pull, played here by the head's stamp made
// stale — the status bar says a page is waiting, and it reloads once left be, as an update's does (pageFollows).
export const meta = { server: true };

export default async function (ctx) {
  const out = {};
  const stamp = () => ctx.evaluate(`document.querySelector('meta[name="peix-page"]').content`);
  const snaps = () => ctx.evaluate(`window.peix.state().snapshots`);
  const seg = () => ctx.evaluate(`(b => b && { cls: b.className, text: b.textContent })(document.querySelector('#sbLeft .upg'))`);
  const restart = async () => { const n = await snaps(); await ctx.server.restart(); await ctx.waitFor(`!window.__mark || window.peix.state().snapshots > ${n}`, { timeout: 20_000, what: 'the stream back from the new server' }); };

  out.stamp = await stamp();
  ctx.assert.match(out.stamp, /^[0-9a-f]{12}$/, 'served with its stamp');

  // the same page on disk: a restart reloads nothing
  await ctx.evaluate(`window.__mark = 1`);
  await restart();
  await ctx.sleep(2000);
  ctx.assert.equal(await ctx.evaluate(`window.__mark`), 1, 'the same page: not reloaded');
  ctx.assert.equal(await seg(), null, 'the same page: nothing said');

  // another page on disk: said, then reloaded once left be
  await ctx.evaluate(`document.querySelector('meta[name="peix-page"]').content = 'stale0000000'; dispatchEvent(new KeyboardEvent('keydown'))`);   // a key just pressed: the reload waits
  await restart();
  await ctx.waitFor(`/\\bpage\\b/.test(document.querySelector('#sbLeft .upg')?.className || '')`, { what: 'the status bar saying a page waits' });
  out.waiting = await seg();
  ctx.assert.equal(out.waiting.text, 'updated · reload the page');
  ctx.assert.equal(await ctx.evaluate(`window.__mark`), 1, 'not at once while a key was just pressed');
  await ctx.waitFor(`!window.__mark && window.peix?.state().snapshots > 0`, { timeout: 25_000, what: 'the page reloaded once left be' });
  out.after = await stamp();
  ctx.assert.equal(out.after, out.stamp, 'the page on disk, stamped');
  ctx.assert.equal(await seg(), null, 'reloaded: nothing said');
  return out;
}
