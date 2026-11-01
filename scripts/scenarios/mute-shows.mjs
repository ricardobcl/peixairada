// A mute shows (2026-11-01, round XIX's S7). Notifications off is a mark on the status bar that a click turns on, and the
// page tells the app (`muted` in its `state` post), whose fish wears a slash and whose menu has a row; past the first hour
// the mark says how long and nods once as the hour turns. What this checks: the page's half; the app's is its own to draw.
export const meta = { server: true, fixture: 'auto' };

const HUB = `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };`;

export default async function (ctx) {
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: HUB });
  await ctx.reload();
  const seg = () => ctx.evaluate(`document.querySelector('#sbLeft .mute')?.textContent.trim() ?? null`);
  const muted = () => ctx.evaluate(`window.__posts.filter(m => m.type === 'state').pop()?.muted`);
  ctx.assert.equal(await seg(), null, 'notifications on: no mark');
  ctx.assert.equal(await muted(), false, 'the app hears they are on');
  await ctx.evaluate(`window.peix.state; document.querySelector('#notifyOn').click()`);
  await ctx.waitFor(`document.querySelector('#sbLeft .mute')`, { what: 'the mark on the bar' });
  ctx.assert.equal(await seg(), 'muted');
  ctx.assert.equal(await muted(), true, 'the app hears they are off');
  // the hour turned: it says how long, and nods
  await ctx.evaluate(`(k => { const p = JSON.parse(localStorage.getItem(k)); p.mutedAt = Date.now() - 2 * 3600e3 - 60e3; localStorage.setItem(k, JSON.stringify(p)); })('peixairada-prefs')`);
  await ctx.reload();
  await ctx.waitFor(`/muted · 2h/.test(document.querySelector('#sbLeft .mute')?.textContent)`, { what: 'how long, past the first hour' });
  // a click turns them on, the server hearing it, and the mark goes
  await ctx.evaluate(`document.querySelector('#sbLeft .mute').click()`);
  await ctx.waitFor(`!document.querySelector('#sbLeft .mute')`, { what: 'the mark gone' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#notifyOn').checked`), true, "Settings' switch follows");
  ctx.assert.equal(await muted(), false, 'and the app');
  await ctx.reload();
  ctx.assert.equal(await seg(), null, 'the server kept it');
  await ctx.evaluate(`window.peixNotifyOn()`);   // the fish's menu's row: on when on is harmless
  return 'ok';
}
