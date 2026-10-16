// The board's key in a browser (2026-10-16): a page without it is the lock — nothing of the board behind it —, whose
// button has the server open a tab with a ticket (here the fake `open` writes it down); that tab trades the ticket for
// the key, keeps it in this origin's storage, drops the ticket from its address, and is the board, reload after
// reload. A key that is no longer the board's is the lock again, saying so. Settings › Board › Access says the key is
// required.
export const meta = { server: true, fixture: 'auto', key: false };

export default async ctx => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const opened = join(ctx.server.dir, 'opened'), out = {};
  await ctx.waitFor(`document.querySelector('#lock').open`, 8000);
  out.locked = await ctx.evaluate(`({ title: document.querySelector('#lockTitle').textContent, cards: document.querySelectorAll('#slist > .card').length, snapshots: peix.state().snapshots, go: !document.querySelector('#lockGo').hidden })`);
  ctx.assert.deepEqual(out.locked, { title: 'This board wants its key', cards: 0, snapshots: 0, go: true }, 'no key: the lock, and nothing of the board');
  await ctx.shot('locked');
  await ctx.evaluate(`document.querySelector('#lockGo').click()`);
  await ctx.waitFor(`/opening in this Mac's browser/.test(document.querySelector('#lockSay').textContent)`, 5000);
  for (let i = 0; i < 50 && !existsSync(opened); i++) await ctx.sleep(100);
  const url = readFileSync(opened, 'utf8').trim();
  ctx.assert.match(url, /#ticket=[\w-]+$/, 'the server opened a tab at the board with a ticket');
  // that tab: the ticket traded for the key, the address plain, the board
  await ctx.send('Page.navigate', { url: 'about:blank' }); await ctx.send('Page.navigate', { url });   // a new tab's load, not a fragment's
  await ctx.waitFor(`window.peix?.state().snapshots > 0 && document.querySelectorAll('#slist > .card').length === 2`, 10000);
  out.keyed = await ctx.evaluate(`({ hash: location.hash, kept: /^[0-9a-f]{64}$/.test(localStorage.getItem('peixairada-key') || ''), lock: document.querySelector('#lock').open })`);
  ctx.assert.deepEqual(out.keyed, { hash: '', kept: true, lock: false }, 'the key kept in this origin, the ticket gone from the address');
  ctx.assert.equal(await ctx.evaluate(`localStorage.getItem('peixairada-key')`), ctx.server.key, 'the board\'s own key');
  await ctx.reload();
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#slist > .card').length`), 2, 'reloaded, still the board');
  out.settings = await ctx.evaluate(`[document.querySelector('#keyWord').textContent, document.querySelector('#keySay').textContent]`);
  ctx.assert.deepEqual(out.settings, ['Required', 'Every page and request carries the board’s key'], 'Settings say it is required');
  // a key that is not the board's any more (a new one made elsewhere): the lock again, saying why, and the stale one gone
  await ctx.evaluate(`localStorage.setItem('peixairada-key', '0'.repeat(64))`);
  await ctx.send('Page.reload');
  await ctx.waitFor(`document.querySelector('#lock')?.open`, 8000);
  out.wrong = await ctx.evaluate(`({ why: document.querySelector('#lockWhy').textContent, kept: localStorage.getItem('peixairada-key') })`);
  ctx.assert.match(out.wrong.why, /not the board's any more/);
  ctx.assert.equal(out.wrong.kept, null, 'the stale key dropped');
  return out;
};
