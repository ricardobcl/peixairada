// A chat's own key pressed again from the tab it brings up fills the column with that half, and once more brings the two
// back (2026-10-13): a ⌘0 that undoes itself. ⌥⌘C on claude, ⌥⌘T on a zsh, ⌥⌘G on a page, ⌥⌘E on the editor, ⌥⌘D on
// the changes. The other half is kept behind, untouched — its terminal is not resized, its page not shown — and going
// to one of its tabs brings both back. With one half the key does what it always did. ⌥⌘R reloads the board, which
// was ⌘R's (⌘R is the pane's page's now, in the app). The app's bridge is faked, as in pane-tabs.mjs, so pages are tabs.
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const [chat] = ctx.fixture.chats;   // the one with two PRs
  const out = {};
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs = []; addEventListener('error', e => window.__errs.push(e.message)); window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.reload();
  await ctx.openChat(chat.id);
  const st = () => ctx.evaluate(`JSON.stringify({ zoomed: window.peix.state().zoomed, focusG: window.peix.state().focusG, tab: window.peix.state().tab, split: window.peix.state().split, a: !document.querySelector('#grp').hidden, b: !document.querySelector('#grpB').hidden, bar: !document.querySelector('#gsplit').hidden })`).then(JSON.parse);
  const width = id => ctx.evaluate(`Math.round(document.querySelector(${JSON.stringify(id)}).getBoundingClientRect().width)`);
  const cols = async () => Object.fromEntries((await ctx.server.terminals()).filter(t => t.exited === null).map(t => [t.shell ? 'zsh' : 'claude', t.cols]));
  const lastPane = () => ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'pane').pop() || null)`).then(JSON.parse);

  // claude in its drawer, a zsh beside it, the keys in the zsh
  await ctx.key('KeyC');
  await ctx.waitPrompt();
  await ctx.cmd('KeyT');
  await ctx.waitFor(`/^shell:/.test(window.peix.state().tab) && window.peix.term(1).ws === 1 && window.peix.term(0).ws === 1`, { what: 'a zsh beside claude, both attached' });
  await ctx.settle(); await ctx.sleep(400);
  const groups = await width('#groups');
  out.two = { st: await st(), cols: await cols(), zsh: await width('#grpB') };
  ctx.assert.deepEqual(out.two.st, { zoomed: null, focusG: 1, tab: out.two.st.tab, split: true, a: true, b: true, bar: true });

  // ⌥⌘T again, the keys on the zsh: its half fills the column; claude's is behind it, its PTY the size it was
  await ctx.key('KeyT');
  await ctx.waitFor(`window.peix.state().zoomed === 1`, { what: 'the zsh\'s half filling the column' });
  await ctx.settle(); await ctx.sleep(600);
  out.zsh = { st: await st(), cols: await cols(), w: await width('#grpB') };
  ctx.assert.deepEqual({ ...out.zsh.st, tab: null }, { zoomed: 1, focusG: 1, tab: null, split: true, a: false, b: true, bar: false }, 'the left half behind, no divider');
  ctx.assert.ok(out.zsh.w >= groups - 20, `the zsh's half is the column (${out.zsh.w} of ${groups})`);
  ctx.assert.ok(out.zsh.cols.zsh > out.two.cols.zsh, `the zsh grew (${out.two.cols.zsh} → ${out.zsh.cols.zsh} columns)`);
  ctx.assert.equal(out.zsh.cols.claude, out.two.cols.claude, 'claude\'s PTY kept its size behind it');
  ctx.assert.equal(await ctx.evaluate(`document.activeElement?.closest('#termBodyB') ? 'zsh' : document.activeElement?.tagName`), 'zsh', 'the keys still in the zsh');
  await ctx.shot('zsh-zoomed');
  // …and again: the two halves back, as they were
  await ctx.key('KeyT');
  await ctx.waitFor(`window.peix.state().zoomed === null && !document.querySelector('#grp').hidden`, { what: 'both halves back' });
  await ctx.settle(); await ctx.sleep(600);
  ctx.assert.equal((await cols()).zsh, out.two.cols.zsh, 'the zsh its half\'s size again');

  // ⌥⌘C goes to claude without filling anything; again, its half fills the column; ⌥⌘T from there — a tab of the half
  // behind — brings both back, the keys on the zsh
  await ctx.key('KeyC');
  await ctx.waitFor(`window.peix.state().focusG === 0 && window.peix.state().tab === 'chat'`, { what: 'the keys on claude' });
  ctx.assert.equal((await st()).zoomed, null, 'the first press only goes there');
  await ctx.key('KeyC');
  await ctx.waitFor(`window.peix.state().zoomed === 0`, { what: 'claude\'s half filling the column' });
  ctx.assert.deepEqual(await st().then(x => [x.a, x.b, x.bar]), [true, false, false]);
  await ctx.key('KeyT');
  await ctx.waitFor(`window.peix.state().zoomed === null && window.peix.state().focusG === 1 && /^shell:/.test(window.peix.state().tab)`, { what: 'the zsh, both halves back' });
  ctx.assert.deepEqual(await st().then(x => [x.a, x.b, x.bar]), [true, true, true]);
  // ⌘1 from a half filling the column is the same: the other half's keys bring both back
  await ctx.key('KeyT');
  await ctx.waitFor(`window.peix.state().zoomed === 1`, { what: 'zoomed again' });
  await ctx.cmd('Digit1');
  await ctx.waitFor(`window.peix.state().zoomed === null && window.peix.state().focusG === 0`, { what: '⌘1: both back, the keys left' });

  // a page: ⌥⌘G opens the PR beside the zsh; again, its half fills the column — and the shell is told to lay it over
  // the whole column; claude's half filling it instead, no page shows at all
  await ctx.key('KeyG');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`(window.peix.state().tab || '').startsWith('gh:')`, { what: 'the PR on a tab' });
  const pr = await ctx.peix('state().tab');
  out.pageTwo = await lastPane();
  await ctx.key('KeyG');
  await ctx.waitFor(`window.peix.state().zoomed === 1`, { what: 'the page\'s half filling the column' });
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#pick').open`), false, 'not the PR picker');
  out.pageZoom = await lastPane();
  ctx.assert.equal(out.pageZoom.panes.length, 1); ctx.assert.equal(out.pageZoom.focus, pr, 'the page keeps the keys');
  ctx.assert.ok(out.pageZoom.panes[0].width > out.pageTwo.panes[0].width + 100, `laid over the whole column (${out.pageTwo.panes[0].width} → ${out.pageZoom.panes[0].width})`);
  await ctx.key('KeyG');
  await ctx.waitFor(`window.peix.state().zoomed === null`, { what: 'back' });
  await ctx.key('KeyC'); await ctx.key('KeyC');
  await ctx.waitFor(`window.peix.state().zoomed === 0`, { what: 'claude filling the column' });
  ctx.assert.deepEqual((await lastPane()).panes, [], 'no page over it');
  await ctx.key('KeyC');
  await ctx.waitFor(`window.peix.state().zoomed === null`, { what: 'back again' });
  ctx.assert.equal((await lastPane()).panes.length, 1, 'the page beside it again');

  // with one half there is nothing to fill: the key does what it did
  await ctx.cmd('Digit0');
  await ctx.waitFor(`!window.peix.state().split`, { what: 'one half' });
  await ctx.key('KeyC');
  ctx.assert.deepEqual(await st().then(x => [x.zoomed, x.split, x.tab]), [null, false, 'chat']);

  ctx.assert.deepEqual(await ctx.evaluate('JSON.stringify(window.__errs)').then(JSON.parse), [], 'nothing threw');
  // ⌥⌘R: the board reloads itself
  await ctx.evaluate(`window.__mark = 1`);
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyR')`), true);
  await ctx.waitFor(`!window.__mark && document.querySelectorAll('.card').length > 0`, { what: 'the board reloaded', timeout: 15000 });
  return out;
}
