// A mute shows (2026-11-01, round XIX's S7). Notifications off is a mark on the status bar that a click turns on; past the
// first hour the mark says how long and nods once as the hour turns.
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const seg = () => ctx.evaluate(`document.querySelector('#sbLeft .mute')?.textContent.trim() ?? null`);

  ctx.assert.equal(await seg(), null, 'notifications on: no mark');
  await ctx.evaluate(`window.peix.state; document.querySelector('#notifyOn').click()`);
  await ctx.waitFor(`document.querySelector('#sbLeft .mute')`, { what: 'the mark on the bar' });
  ctx.assert.equal(await seg(), 'muted');

  // the hour turned: it says how long, and nods
  await ctx.evaluate(
    `(k => { const p = JSON.parse(localStorage.getItem(k)); p.mutedAt = Date.now() - 2 * 3600e3 - 60e3; localStorage.setItem(k, JSON.stringify(p)); })('peixairada-prefs')`,
  );

  await ctx.reload();

  await ctx.waitFor(`/muted · 2h/.test(document.querySelector('#sbLeft .mute')?.textContent)`, {
    what: 'how long, past the first hour',
  });

  // a click turns them on, the server hearing it, and the mark goes
  await ctx.evaluate(`document.querySelector('#sbLeft .mute').click()`);
  await ctx.waitFor(`!document.querySelector('#sbLeft .mute')`, { what: 'the mark gone' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#notifyOn').checked`), true, "Settings' switch follows");
  await ctx.reload();
  ctx.assert.equal(await seg(), null, 'the server kept it');
  return 'ok';
}
