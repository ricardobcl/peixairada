// The status bar (2026-10-09, the design studies' F — Orca's): the machine at the window's foot. What this checks: it is
// there by default, under the board, saying the connection and the chats; the plan usage moves into it as meters (the
// list's foot without its own) and a click shows its rows; the settings add CPU, memory and Claude's memory, asked of
// the server; the Mac kept awake shows in it; the switch off hides it and gives the list's foot its usage back.
export const meta = { server: true, fixture: 'auto' };

const USAGE = `(() => { const real = window.fetch, soon = h => new Date(Date.now() + h * 3600e3).toISOString();
  window.fetch = (u, o) => !String(u).includes('/api/usage') ? real(u, o) : Promise.resolve(new Response(JSON.stringify({ windows: [
    { key: 'five_hour', label: 'session · 5 h', percent: 42, resetsAt: soon(2.5) }, { key: 'seven_day', label: 'week · all models', percent: 93, resetsAt: soon(84) } ],
    other: [], fetchedAt: new Date().toISOString() }), { status: 200, headers: { 'content-type': 'application/json' } })); })()`;

export default async function (ctx) {
  const out = {};
  const look = () => ctx.evaluate(`JSON.stringify((b => ({ hidden: b.hidden, attr: document.documentElement.hasAttribute('data-sbar'), h: Math.round(b.getBoundingClientRect().height),
    bottom: Math.round(innerHeight - b.getBoundingClientRect().bottom), mainBottom: Math.round(document.querySelector('#main').getBoundingClientRect().bottom - b.getBoundingClientRect().top),
    segs: [...b.querySelectorAll('.seg')].map(s => s.textContent.trim().replace(/\\s+/g, ' ')), footUsage: getComputedStyle(document.querySelector('#usage')).display }))(document.querySelector('#sbar')))`).then(JSON.parse);
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: USAGE });
  await ctx.reload();
  await ctx.waitFor(`document.querySelectorAll('#sbar .us .m').length === 2`, { what: 'the bar with the usage in it' });
  out.rest = await look();
  ctx.assert.deepEqual([out.rest.hidden, out.rest.attr, out.rest.bottom, out.rest.mainBottom], [false, true, 0, 0], `on by default, at the window's foot, under the board: ${JSON.stringify(out.rest)}`);
  ctx.assert.equal(out.rest.segs[0], 'connected');
  ctx.assert.match(out.rest.segs[1], /^\d+ live chats? · 0 clauding$/);
  ctx.assert.deepEqual(out.rest.segs.at(-1), '5H42%1W93%', 'the plan usage as meters');
  ctx.assert.equal(out.rest.footUsage, 'none', 'the list\'s foot without its own');
  ctx.assert.deepEqual(await ctx.evaluate(`[...document.querySelectorAll('#sbar .us .m i')].map(i => i.style.getPropertyValue('--u'))`), ['var(--spend)', 'var(--needs)'], 'red from 90');
  await ctx.evaluate(`document.querySelector('#sbar .us').click()`);
  await ctx.waitFor(`document.querySelectorAll('#sbar .sbpanel .urow').length === 2`, { what: 'the usage rows over the board' });
  await ctx.shot('1-usage', { x: 700, y: 640, width: 1000, height: 360 });
  await ctx.evaluate(`document.querySelector('#slist').click()`);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#sbar .sbpanel')`), false, 'a click elsewhere puts them away');

  // CPU, memory, Claude's memory: the settings' boxes, the server's numbers
  await ctx.evaluate(`for (const k of ['cpu', 'mem', 'claude']) document.querySelector('#sbarStats [data-stat="' + k + '"]').click()`);
  await ctx.waitFor(`/CPU\\s*\\d+%/.test(document.querySelector('#sbar').textContent) && /memory\\s*[\\d.]+ (GB|MB) \\/ [\\d.]+ GB/.test(document.querySelector('#sbar').textContent) && /claude\\s*\\d+ MB/.test(document.querySelector('#sbar').textContent)`, { timeout: 8000, what: 'the machine numbers' });
  ctx.assert.deepEqual(await ctx.peix('prefs().sbStats'), ['cpu', 'mem', 'claude']);

  // the Mac kept awake says so here too, and a click there lets it sleep
  await ctx.server.api('api/awake', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ awake: true }) });
  await ctx.waitFor(`!!document.querySelector('#sbar .aw')`, { what: 'awake in the bar' });
  await ctx.shot('2-full', { x: 0, y: 860, width: 1700, height: 140 });
  await ctx.evaluate(`document.querySelector('#sbar .aw').click()`);
  await ctx.waitFor(`!document.querySelector('#sbar .aw')`, { what: 'awake off from the bar' });
  ctx.assert.equal((await ctx.server.api('api/awake')).body.awake, false);

  // off: gone, the board to the window's foot, the usage back in the list's foot
  await ctx.evaluate(`document.querySelector('#sbarOn').click()`);
  out.off = await look();
  ctx.assert.deepEqual([out.off.hidden, out.off.attr, out.off.footUsage !== 'none'], [true, false, true], `off: hidden, and the list's foot has its usage: ${JSON.stringify(out.off)}`);
  ctx.assert.equal(await ctx.evaluate(`Math.round(innerHeight - document.querySelector('#main').getBoundingClientRect().bottom)`), 0, 'the board to the window\'s foot');
  await ctx.evaluate(`document.querySelector('#sbarOn').click()`);
  return out;
}
