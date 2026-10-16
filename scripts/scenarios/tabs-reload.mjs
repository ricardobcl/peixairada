// A chat's tabs outlive a reload of the board (2026-10-16): the pages it opened, its folder's editor, its split and how
// it stands, which tab each half shows and where a page was followed — all the page's memory alone before, so a reload
// (an update's, a restart's, ⌥⌘R) brought the strip back with claude alone while the shell kept the pages' views. Kept
// in sessionStorage, the web view's own: a reload finds them and the shell is told the same pages again; a tab closed
// before stays closed. The app's bridge is faked, as in pane-tabs.mjs.
export const meta = { server: true, fixture: 'auto' };
export default async function (ctx) {
  const [two] = ctx.fixture.chats;   // the one with two PRs
  const out = {};
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs = []; addEventListener('error', e => window.__errs.push(e.message)); window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.reload();
  await ctx.openChat(two.id);
  const [a, b] = await ctx.peix(`session(${JSON.stringify(two.id)}).prs.map(p => p.url)`);
  const chip = url => ctx.evaluate(`document.querySelector('#slist > .card[data-id=${JSON.stringify(two.id)}] .cpr[data-url=${JSON.stringify(url)}]').click()`);
  const lastPane = () => ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'pane').pop() || null)`).then(JSON.parse);
  const column = () => ctx.evaluate(`JSON.stringify((st => ({ strips: st.strips, halves: st.halves, split: st.split, stacked: st.stacked, focusG: st.focusG,
    drawn: ['#ptabs', '#ptabsB'].map(id => [...document.querySelectorAll(id + ' .ptab')].map(e => e.dataset.tab)),
    addr: document.querySelector('#ptabsB .purl')?.dataset.url || null }))(window.peix.state()))`).then(JSON.parse);

  // two PRs on tabs of their own (the column splits for the first), the editor, the halves stood one over the other,
  // the first PR followed into its files and brought back in front
  await chip(a);
  await ctx.waitFor(`window.peix.state().halves[1] === ${JSON.stringify('gh:' + a)}`, { what: 'the first PR on a tab' });
  await ctx.cmd('Digit1'); await chip(b);
  await ctx.waitFor(`window.peix.state().halves[1] === ${JSON.stringify('gh:' + b)}`, { what: 'the second PR beside it' });
  await ctx.key('KeyE');
  await ctx.waitFor(`/^ide:/.test(window.peix.state().halves[1] || '')`, { what: 'the editor on a tab' });
  await ctx.key('Digit2');
  await ctx.waitFor(`window.peix.state().stacked`, { what: 'the halves one over the other' });
  await ctx.evaluate(`window.peixPaneUrl(${JSON.stringify('gh:' + a)}, ${JSON.stringify(a + '/files')})`);
  await ctx.evaluate(`document.querySelector(${JSON.stringify(`#ptabsB .ptab[data-tab="gh:${a}"]`)}).click()`);
  await ctx.waitFor(`window.peix.state().halves[1] === ${JSON.stringify('gh:' + a)}`, { what: 'the first PR in front again' });
  out.before = await column();
  ctx.assert.equal(out.before.strips[1].length, 3, 'two PRs and the editor in the second half');
  ctx.assert.equal(out.before.addr, a + '/files');
  await ctx.settle();
  await ctx.shot('before');

  // the board reloaded: the same column, and the shell told the same pages
  await ctx.reload();
  await ctx.waitFor(`document.querySelector('#log')?.dataset.sid === ${JSON.stringify(two.id)} && window.peix.state().halves[1] === ${JSON.stringify('gh:' + a)}`, { what: 'the chat again, its page in front' });
  out.after = await column();
  ctx.assert.deepEqual(out.after, out.before, 'the tabs, the split and the address as they stood');
  out.pane = await lastPane();
  ctx.assert.deepEqual(out.pane.keys, out.before.strips[1], 'the shell hears the chat\'s pages again');
  ctx.assert.equal(out.pane.show, 'gh:' + a, '…and shows the one in front, whose view it kept');
  await ctx.settle();
  await ctx.shot('after');

  // a tab closed stays closed, the split the board made going with the last of them
  await ctx.evaluate(`document.querySelector(${JSON.stringify(`#ptabsB .ptab[data-tab="gh:${b}"] .x`)}).click()`);
  await ctx.waitFor(`!window.peix.state().strips[1].includes(${JSON.stringify('gh:' + b)})`, { what: 'the second PR closed' });
  await ctx.reload();
  await ctx.waitFor(`document.querySelector('#log')?.dataset.sid === ${JSON.stringify(two.id)} && window.peix.state().halves[1] === ${JSON.stringify('gh:' + a)}`, { what: 'the chat again' });
  out.closed = await column();
  ctx.assert.ok(!out.closed.strips[1].includes('gh:' + b), 'the closed PR does not come back');
  ctx.assert.equal(out.closed.strips[1].length, 2);
  ctx.assert.deepEqual(await ctx.evaluate('JSON.stringify(window.__errs)').then(JSON.parse), [], 'nothing threw');
  return out;
}
