// What the page tells the app for the fish's menu (2026-11-01, round XIX's S5, S8, M1): the plan in a line, a move's reason
// and the lists the menu draws natively. What this checks: the `state` post's fields; the menu itself is AppKit's to draw.
import { appendFileSync } from 'node:fs';
import { replyLines } from '../fixture.mjs';
export const meta = { server: true, fixture: 'auto' };

const STUB = `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };
  (() => { const real = window.fetch, soon = new Date(Date.now() + 2.5 * 3600e3);
    window.__reset = soon.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    window.fetch = (u, o) => !String(u).includes('/api/usage') ? real(u, o) : Promise.resolve(new Response(JSON.stringify({ windows: [
      { key: 'seven_day', label: 'week · all models', percent: 93, resetsAt: new Date(Date.now() + 84 * 3600e3).toISOString() }, { key: 'limits:weekly_scoped:Fable', label: 'week · Fable', percent: 42, resetsAt: soon.toISOString() },
      { key: 'extra', label: 'credit grant', percent: 12 } ], other: [], fetchedAt: new Date().toISOString() }), { status: 200, headers: { 'content-type': 'application/json' } })); })();`;

export default async function (ctx) {
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await ctx.reload();
  await ctx.waitFor(`window.__posts.filter(m => m.type === 'state').pop()?.plan`, { what: 'the plan in the post' });
  const last = await ctx.evaluate(`JSON.stringify({ ...window.__posts.filter(m => m.type === 'state').pop(), reset: window.__reset })`).then(JSON.parse);
  ctx.assert.equal(last.plan, `Plan 93% of 1W · 42% of F · resets ${last.reset}`, 'each window and the next reset, a grant left out');
  ctx.assert.ok(Array.isArray(last.watching) && Array.isArray(last.working), 'the lists the menu folds into submenus');
  // ⌥ on a reply's row marks it read (S8): gone from what wants you, the server hearing it
  const [one] = ctx.fixture.chats;
  appendFileSync(one.file, replyLines({ id: one.id, cwd: one.cwd, text: 'Done, have a look.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
  const replied = () => `window.__posts.filter(m => m.type === 'state').pop().replied.map(r => r.id)`;
  await ctx.waitFor(`${replied()}.includes('${one.id}')`, { what: 'a new reply wanting you', timeout: 15000 });
  await ctx.evaluate(`window.peixMarkRead('${one.id}')`);
  await ctx.waitFor(`!${replied()}.includes('${one.id}')`, { what: 'the reply marked read' });
  ctx.assert.ok(await ctx.evaluate(`(s => s.seenAt >= s.lastReplyAt)(window.peix.session('${one.id}'))`), 'seen as of now');
  return last.plan;
}
