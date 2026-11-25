// The board's own file panel (2026-11-25): an <input type=file> on the board opens the system's panel as a sheet over
// the window, and a Cancel hands the page nothing — WebKit opens none without the view's UI delegate, so the chat's
// picture button did nothing in the app. A shell from before (--src) has no sheet to show.
export const meta = {};
export default async function (ctx) {
  await ctx.board();
  ctx.assert.equal((await ctx.win()).sheet, null, 'no sheet to begin with');
  // the page's own picker, as the chat's button clicks it — from the probe's script, which WebKit takes as a gesture
  await ctx.js(`const i = document.createElement('input'); i.type = 'file'; i.id = 'peixProbeFile'; i.hidden = true; window.peixPicked = null;
    i.addEventListener('cancel', () => { window.peixPicked = 'cancel'; }); i.addEventListener('change', () => { window.peixPicked = i.files.length; });
    document.body.append(i); i.click(); return true`);
  const t = Date.now();
  let w; while (!(w = await ctx.win()).sheet && Date.now() - t < 5000) await new Promise(r => setTimeout(r, 100));
  ctx.assert.match(String(w.sheet), /OpenPanel/, 'the system\'s open panel, as a sheet over the window');
  ctx.assert.equal(await ctx.ask('unsheet'), true);
  const after = Date.now(); let picked;
  while ((picked = await ctx.js('return window.peixPicked')) === null && Date.now() - after < 3000) await new Promise(r => setTimeout(r, 100));
  ctx.assert.equal((await ctx.win()).sheet, null, 'gone once cancelled');
  ctx.assert.notEqual(picked, 1, 'nothing picked');
  return { sheet: w.sheet, picked };
}
