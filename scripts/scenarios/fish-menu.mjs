// What the page tells the app for the fish's menu (2026-11-01, round XIX's S5, S8, M1): the plan in a line, a move's reason
// and the lists the menu draws natively. What this checks: the `state` post's fields; the menu itself is AppKit's to draw.
export const meta = { server: true, fixture: 'auto' };

const STUB = `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };
  (() => { const real = window.fetch, soon = new Date(Date.now() + 2.5 * 3600e3);
    window.__reset = soon.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    window.fetch = (u, o) => !String(u).includes('/api/usage') ? real(u, o) : Promise.resolve(new Response(JSON.stringify({ windows: [
      { key: 'five_hour', label: 'session · 5 h', percent: 42, resetsAt: soon.toISOString() }, { key: 'seven_day', label: 'week · all models', percent: 93, resetsAt: new Date(Date.now() + 84 * 3600e3).toISOString() },
      { key: 'extra', label: 'credit grant', percent: 12 } ], other: [], fetchedAt: new Date().toISOString() }), { status: 200, headers: { 'content-type': 'application/json' } })); })();`;

export default async function (ctx) {
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await ctx.reload();
  await ctx.waitFor(`window.__posts.filter(m => m.type === 'state').pop()?.plan`, { what: 'the plan in the post' });
  const last = await ctx.evaluate(`JSON.stringify({ ...window.__posts.filter(m => m.type === 'state').pop(), reset: window.__reset })`).then(JSON.parse);
  ctx.assert.equal(last.plan, `Plan 42% of 5H · 93% of 1W · resets ${last.reset}`, 'each window and the next reset, a grant left out');
  ctx.assert.ok(Array.isArray(last.watching) && Array.isArray(last.working), 'the lists the menu folds into submenus');
  return last.plan;
}
