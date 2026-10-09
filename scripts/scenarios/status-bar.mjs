// The status bar (2026-10-09, the design studies' F — Orca's): the machine at the window's foot. What this checks: it is
// there by default, under the board, saying the connection and the chats; the search and the state chips move into it,
// far left, and work from there, while the list's foot row (the fish, the search, the chips, the usage) goes; the plan
// usage is its meters and a click shows its rows; the connection opens the About box; CPU and memory are in it from the
// start and the settings add Claude's memory, asked of the server; the switch off hides it and gives the list's foot its row back. The faces in its
// middle are people-row.mjs's, keeping the Mac awake keep-awake.mjs's.
export const meta = { server: true, fixture: 'auto' };

const USAGE = `(() => { const real = window.fetch, soon = h => new Date(Date.now() + h * 3600e3).toISOString();
  window.fetch = (u, o) => !String(u).includes('/api/usage') ? real(u, o) : Promise.resolve(new Response(JSON.stringify({ windows: [
    { key: 'five_hour', label: 'session · 5 h', percent: 42, resetsAt: soon(2.5) }, { key: 'seven_day', label: 'week · all models', percent: 93, resetsAt: soon(84) } ],
    other: [], fetchedAt: new Date().toISOString() }), { status: 200, headers: { 'content-type': 'application/json' } })); })()`;

export default async function (ctx) {
  const out = {};
  const look = () => ctx.evaluate(`JSON.stringify((b => ({ hidden: b.hidden, attr: document.documentElement.hasAttribute('data-sbar'), h: Math.round(b.getBoundingClientRect().height),
    bottom: Math.round(innerHeight - b.getBoundingClientRect().bottom), mainBottom: Math.round(document.querySelector('#main').getBoundingClientRect().bottom - b.getBoundingClientRect().top),
    segs: [...b.querySelectorAll('#sbLeft .seg, #sbRight .seg:not(#sbAwake):not(#sbLid)')].map(s => s.textContent.trim().replace(/\\s+/g, ' ')), footUsage: getComputedStyle(document.querySelector('#usage')).display,
    footRow: getComputedStyle(document.querySelector('#shd')).display, find: document.querySelector('#filters').parentElement.id }))(document.querySelector('#sbar')))`).then(JSON.parse);
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: USAGE });
  await ctx.reload();
  await ctx.waitFor(`document.querySelectorAll('#sbar .us .m').length === 2`, { what: 'the bar with the usage in it' });
  out.rest = await look();
  ctx.assert.deepEqual([out.rest.hidden, out.rest.attr, out.rest.bottom, out.rest.mainBottom], [false, true, 0, 0], `on by default, at the window's foot, under the board: ${JSON.stringify(out.rest)}`);
  ctx.assert.equal(out.rest.segs[0], 'connected');
  ctx.assert.match(out.rest.segs[1], /^\d+ live$/);
  ctx.assert.deepEqual([out.rest.find, out.rest.footRow], ['sbFind', 'none'], 'the search and the chips in the bar, the list\'s foot row gone');
  ctx.assert.ok(await ctx.evaluate(`document.querySelector('#sbFind').getBoundingClientRect().left - document.querySelector('#sbar').getBoundingClientRect().left < 12`), 'far left');
  // the search works from there: the magnifier opens the box, a query narrows the list, Esc puts it away
  const cards = () => ctx.evaluate(`document.querySelectorAll('#slist > .card').length`);
  const all = await cards();
  await ctx.evaluate(`document.querySelector('#qBtn').click()`);
  await ctx.fill('#q', 'plain chat');
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length < ${all}`, { what: 'the list narrowed from the bar' });
  await ctx.evaluate(`document.querySelector('#q').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === ${all}`, { what: 'every card again' });
  // a state chip there filters as it did in the list's foot
  await ctx.evaluate(`document.querySelector('#sbar .fchip.ready').click()`);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 0`, { what: 'the ready cards switched off' });
  await ctx.evaluate(`document.querySelector('#sbar .fchip.ready').click()`);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === ${all}`, { what: 'and on' });
  // the connection opens the About box (the fish's, whose row went)
  await ctx.evaluate(`document.querySelector('#sbar .conn').click()`);
  await ctx.waitFor(`document.querySelector('#about').open`, { what: 'the About box from the bar' });
  await ctx.evaluate(`document.querySelector('#about').close()`);
  ctx.assert.deepEqual(out.rest.segs.at(-1), '5H42%1W93%', 'the plan usage as meters');
  ctx.assert.equal(out.rest.footUsage, 'none', 'the list\'s foot without its own');
  ctx.assert.deepEqual(await ctx.evaluate(`[...document.querySelectorAll('#sbar .us .m i')].map(i => i.style.getPropertyValue('--u'))`), ['var(--spend)', 'var(--needs)'], 'red from 90');
  await ctx.evaluate(`document.querySelector('#sbar .us').click()`);
  await ctx.waitFor(`document.querySelectorAll('#sbar .sbpanel .urow').length === 2`, { what: 'the usage rows over the board' });
  await ctx.shot('1-usage', { x: 700, y: 640, width: 1000, height: 360 });
  await ctx.evaluate(`document.querySelector('#slist').click()`);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#sbar .sbpanel')`), false, 'a click elsewhere puts them away');

  // CPU and memory from the start (2026-10-09), Claude's memory a box in the settings away: the server's numbers
  ctx.assert.deepEqual(await ctx.peix('prefs().barStats'), ['cpu', 'mem'], 'CPU and memory on by default');
  await ctx.waitFor(`/CPU\\s*\\d+%/.test(document.querySelector('#sbar').textContent) && /memory\\s*[\\d.]+ (GB|MB) \\/ [\\d.]+ GB/.test(document.querySelector('#sbar').textContent)`, { timeout: 8000, what: 'CPU and memory in the bar' });
  await ctx.evaluate(`document.querySelector('#sbarStats [data-stat="claude"]').click()`);
  await ctx.waitFor(`/CPU\\s*\\d+%/.test(document.querySelector('#sbar').textContent) && /memory\\s*[\\d.]+ (GB|MB) \\/ [\\d.]+ GB/.test(document.querySelector('#sbar').textContent) && /claude\\s*\\d+ MB/.test(document.querySelector('#sbar').textContent)`, { timeout: 8000, what: 'the machine numbers' });
  ctx.assert.deepEqual(await ctx.peix('prefs().barStats'), ['cpu', 'mem', 'claude']);

  // the Mac kept awake says so here too (its own buttons: keep-awake.mjs), and a click there lets it sleep
  await ctx.server.api('api/awake', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ awake: true }) });
  await ctx.waitFor(`document.querySelector('#sbAwake')?.textContent === 'awake'`, { what: 'awake in the bar' });
  await ctx.shot('2-full', { x: 0, y: 860, width: 1700, height: 140 });
  await ctx.evaluate(`document.querySelector('#sbAwake').click()`);
  await ctx.waitFor(`document.querySelector('#sbAwake')?.classList.contains('off')`, { what: 'awake off from the bar' });
  ctx.assert.equal((await ctx.server.api('api/awake')).body.awake, false);

  // off: gone, the board to the window's foot, the usage back in the list's foot
  await ctx.evaluate(`document.querySelector('#sbarOn').click()`);
  out.off = await look();
  ctx.assert.deepEqual([out.off.hidden, out.off.attr, out.off.footUsage !== 'none', out.off.footRow !== 'none', out.off.find], [true, false, true, true, 'shd'], `off: hidden, and the list's foot has its row and usage back: ${JSON.stringify(out.off)}`);
  ctx.assert.equal(await ctx.evaluate(`Math.round(innerHeight - document.querySelector('#main').getBoundingClientRect().bottom)`), 0, 'the board to the window\'s foot');
  await ctx.evaluate(`document.querySelector('#sbarOn').click()`);
  return out;
}
