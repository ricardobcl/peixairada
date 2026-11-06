// What the shell hands to another app is the web, mail, the editors and GitHub Desktop (2026-11-06, `handOn`): the
// board's `external`, a link on the board and a pane's key named anything else is refused and logged, nothing opened.
// The first ask is a file that is not there, so a shell that still opens them (a check run with --src on the old code)
// fails on it having asked the system for nothing that would show.
export const meta = {};
export default async function (ctx) {
  await ctx.board();
  const gone = `file:///private/var/empty/peix-${Date.now()}-nothing`;
  const count = re => (ctx.appLog().match(new RegExp(re.source, 'g')) || []).length;
  const heard = async (re, n = 1) => { const t = Date.now(); while (count(re) < n && Date.now() - t < 5000) await new Promise(r => setTimeout(r, 100)); return count(re) >= n; };
  // the board's own word: a page script posting `external` with a file URL
  await ctx.js(`window.webkit.messageHandlers.hub.postMessage({ type: 'external', url: ${JSON.stringify(gone + '.app')} }); return true`);
  ctx.assert.ok(await heard(/open: file: refused/), 'external: a file URL is refused');
  // a scheme of the system's settings, by the board's word, then a link to it clicked on the board (a link to a file
  // WebKit stops itself: a web page may not load one)
  const prefs = 'x-apple.systempreferences:com.apple.peix-nothing';
  await ctx.js(`window.webkit.messageHandlers.hub.postMessage({ type: 'external', url: ${JSON.stringify(prefs)} }); return true`);
  ctx.assert.ok(await heard(/open: x-apple\.systempreferences: refused/), 'a scheme not on the list is refused');
  await ctx.link(prefs);
  ctx.assert.ok(await heard(/open: x-apple\.systempreferences: refused/, 2), 'a link on the board to it is refused');
  // a pane named with a key that is no web page is not loaded
  await ctx.js(`window.webkit.messageHandlers.hub.postMessage({ type: 'pane', id: null, keys: ['gh:${gone}'], panes: [{ key: 'gh:${gone}', left: 10, top: 10, width: 100, height: 100 }], focus: null }); return true`);
  ctx.assert.ok(await heard(/pane: file: not loaded/), 'a pane key that is a file is not loaded');
  ctx.assert.equal(Object.keys((await ctx.win()).panes).some(k => k.includes('peix-')), false, 'no view made for it');
  return { refused: count(/open: .* refused/) };
}
