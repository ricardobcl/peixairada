// A script animation is let go of once it is done (2026-10-15): WebKit kept every one `animate()` made, finished, on its
// document timeline and walked them all on every frame, so a board open for hours grew dearer by the hour. What this
// checks is the page's side, which Chrome runs as WebKit does: an animation that fills nothing is cancelled and taken
// off its timeline a few seconds after its end (WebKit keeps any animation with a timeline alive, its element with it),
// one that fills forwards once its element has left the page, one its own code cancelled likewise, and one that fills
// forwards on an element still there keeps its last frame. Every `animate()` on the page goes through it.
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  await ctx.evaluate(`(() => {
    const el = id => { const e = document.createElement('i'); e.id = id; e.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px'; document.body.append(e); return e; };
    const frames = [{ opacity: 1 }, { opacity: .5 }];
    window.__a = {
      none: el('lgNone').animate(frames, { duration: 50 }),
      gone: el('lgGone').animate(frames, { duration: 50, fill: 'forwards' }),
      kept: el('lgKept').animate(frames, { duration: 50, fill: 'forwards' }),
      stopped: el('lgStopped').animate(frames, { duration: 60000 }),
    };
    window.__a.stopped.cancel();
    window.__a.gone.onfinish = () => document.getElementById('lgGone').remove();
  })()`);
  await ctx.waitFor(`Object.values(window.__a).every(a => a.playState === 'finished' || a.playState === 'idle')`, { what: 'the four ended' });
  out.ended = await ctx.evaluate(`JSON.stringify(Object.fromEntries(Object.entries(window.__a).map(([k, a]) => [k, a.playState])))`).then(JSON.parse);
  await ctx.waitFor(`['none', 'gone', 'stopped'].every(k => window.__a[k].timeline === null)`, { what: 'the three let go', timeout: 8000 });
  out.after = await ctx.evaluate(`JSON.stringify(Object.fromEntries(Object.entries(window.__a).map(([k, a]) => [k, [a.playState, a.timeline ? 'timeline' : null]])))`).then(JSON.parse);
  ctx.assert.deepEqual(out.after, { none: ['idle', null], gone: ['idle', null], stopped: ['idle', null], kept: ['finished', 'timeline'] },
    'the one filling nothing, the one whose element left and the one cancelled are off the timeline; the one in the page holds');
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.getElementById('lgKept')).opacity`), '0.5', 'its last frame still shown');
  return out;
}
