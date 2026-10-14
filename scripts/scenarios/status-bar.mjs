// The status bar (2026-10-09, the design studies' F — Orca's; always there since 2026-10-14): the machine at the
// window's foot. What this checks: it is under the board, saying the connection and the chats; the search and the
// filter are in it, far left, and work from there; the plan usage is its meters and a click shows its rows; the
// connection opens the About box; CPU and memory are in it from the start and the settings add Claude's memory, asked of
// the server. The faces in its middle are people-row.mjs's, keeping the Mac awake keep-awake.mjs's.
export const meta = { server: true, fixture: 'auto' };

const USAGE = `(() => { const real = window.fetch, soon = h => new Date(Date.now() + h * 3600e3).toISOString();
  window.fetch = (u, o) => !String(u).includes('/api/usage') ? real(u, o) : Promise.resolve(new Response(JSON.stringify({ windows: [
    { key: 'five_hour', label: 'session · 5 h', percent: 42, resetsAt: soon(2.5) }, { key: 'seven_day', label: 'week · all models', percent: 93, resetsAt: soon(84) } ],
    other: [], fetchedAt: new Date().toISOString() }), { status: 200, headers: { 'content-type': 'application/json' } })); })()`;

export default async function (ctx) {
  const out = {};
  const look = () => ctx.evaluate(`JSON.stringify((b => ({ hidden: b.hidden, h: Math.round(b.getBoundingClientRect().height),
    bottom: Math.round(innerHeight - b.getBoundingClientRect().bottom), mainBottom: Math.round(document.querySelector('#main').getBoundingClientRect().bottom - b.getBoundingClientRect().top),
    segs: [...b.querySelectorAll('#sbLeft .seg, #sbRight .seg:not(#sbAwake):not(#sbLid)')].map(s => s.textContent.trim().replace(/\\s+/g, ' ')), 
    find: document.querySelector('#filters').parentElement.id, faces: document.querySelector('#people').parentElement.id }))(document.querySelector('#sbar')))`).then(JSON.parse);
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: USAGE });
  await ctx.reload();
  await ctx.waitFor(`document.querySelectorAll('#sbar .us .m').length === 2`, { what: 'the bar with the usage in it' });
  out.rest = await look();
  ctx.assert.deepEqual([out.rest.hidden, out.rest.bottom, out.rest.mainBottom], [false, 8, -8], `at the window's foot, under the board, the tiles' gap round it: ${JSON.stringify(out.rest)}`);
  ctx.assert.equal(out.rest.segs[0], 'connected');
  ctx.assert.ok(!out.rest.segs.some(t => /\blive$|drawer|shell/.test(t)), `no live count, no drawers or shells (2026-10-11): ${JSON.stringify(out.rest.segs)}`);
  // the clock, far right (2026-10-11, later): the time on a 24-hour clock (2026-10-11, late night), the day in its tooltip
  out.clock = await ctx.evaluate(`(c => ({ text: c?.textContent, now: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), last: c === [...document.querySelectorAll('#sbRight > .seg')].pop(), gap: Math.round(document.querySelector('#sbar').getBoundingClientRect().right - c.getBoundingClientRect().right), tip: c?.title }))(document.querySelector('#sbar .clock'))`);
  ctx.assert.ok(out.clock.text === out.clock.now && /^([01]\d|2[0-3]):\d\d$/.test(out.clock.text) && out.clock.last && out.clock.gap < 8 && out.clock.tip, `the clock at the far right: ${JSON.stringify(out.clock)}`);
  ctx.assert.deepEqual([out.rest.find, out.rest.faces], ['sbFind', 'sbPeople'], 'the search and the faces in the bar');
  ctx.assert.ok(await ctx.evaluate(`document.querySelector('#sbFind').getBoundingClientRect().left - document.querySelector('#sbar').getBoundingClientRect().left < 12`), 'far left');
  // the search works from there: the magnifier opens the box, a query narrows the list, Esc puts it away
  const cards = () => ctx.evaluate(`document.querySelectorAll('#slist > .card').length`);
  const all = await cards();
  await ctx.evaluate(`document.querySelector('#qBtn').click()`);
  await ctx.fill('#q', 'plain chat');
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length < ${all}`, { what: 'the list narrowed from the bar' });
  await ctx.evaluate(`document.querySelector('#q').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === ${all}`, { what: 'every card again' });
  // no state chips there since 2026-10-11, later: the lanes' heads fold the list (scripts/scenarios/lanes.mjs)
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#sbar .fchip').length`), 0, 'no state chips in the bar');
  // the connection opens the About box
  await ctx.evaluate(`document.querySelector('#sbar .conn').click()`);
  await ctx.waitFor(`document.querySelector('#about').open`, { what: 'the About box from the bar' });
  await ctx.evaluate(`document.querySelector('#about').close()`);
  ctx.assert.deepEqual(out.rest.segs.at(-2), '5H42%1W93%', 'the plan usage as meters, before the clock');
  ctx.assert.deepEqual(await ctx.evaluate(`[...document.querySelectorAll('#sbar .us .m i')].map(i => i.style.getPropertyValue('--u'))`), ['var(--spend)', 'var(--needs)'], 'red from 90');
  await ctx.evaluate(`document.querySelector('#sbar .us').click()`);
  await ctx.waitFor(`document.querySelectorAll('#sbar .sbpanel .urow').length === 2`, { what: 'the usage rows over the board' });
  await ctx.shot('1-usage', { x: 700, y: 640, width: 1000, height: 360 });
  await ctx.evaluate(`document.querySelector('#slist').click()`);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#sbar .sbpanel')`), false, 'a click elsewhere puts them away');

  // CPU and memory from the start (2026-10-09), Claude's memory a box in the settings away: the server's numbers
  ctx.assert.deepEqual(await ctx.peix('prefs().barStats'), ['cpu', 'mem'], 'CPU and memory on by default');
  // as pies since 2026-10-11, later: the label, a round pie of what is spent, the percent
  await ctx.waitFor(`document.querySelectorAll('#sbar .m i').length >= 4`, { what: 'the pies', timeout: 8000 });
  out.pie = await ctx.evaluate(`(i => ({ w: i.offsetWidth, h: i.offsetHeight, round: getComputedStyle(i).borderRadius, bg: getComputedStyle(i).backgroundImage.slice(0, 14) }))(document.querySelector('#sbar .m i'))`);
  ctx.assert.deepEqual(out.pie, { w: 12, h: 12, round: '50%', bg: 'conic-gradient' }, 'a pie, not a bar');
  await ctx.waitFor(`/CPU\\s*\\d+%/.test(document.querySelector('#sbar').textContent) && /RAM\\s*\\d+%/.test(document.querySelector('#sbar').textContent)`, { timeout: 8000, what: 'CPU and memory in the bar' });
  await ctx.evaluate(`document.querySelector('#sbarStats [data-stat="claude"]').click()`);
  await ctx.waitFor(`/CPU\\s*\\d+%/.test(document.querySelector('#sbar').textContent) && /RAM\\s*\\d+%/.test(document.querySelector('#sbar').textContent) && /Claude\\s*\\d+ MB/.test(document.querySelector('#sbar').textContent)`, { timeout: 8000, what: 'the machine numbers' });
  ctx.assert.deepEqual(await ctx.peix('prefs().barStats'), ['cpu', 'mem', 'claude']);

  // the Mac kept awake says so here too (its own buttons: keep-awake.mjs), and a click there lets it sleep
  await ctx.server.api('api/awake', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ awake: true }) });
  await ctx.waitFor(`document.querySelector('#sbAwake')?.textContent === 'awake'`, { what: 'awake in the bar' });
  await ctx.shot('2-full', { x: 0, y: 860, width: 1700, height: 140 });
  await ctx.evaluate(`document.querySelector('#sbAwake').click()`);
  await ctx.waitFor(`document.querySelector('#sbAwake')?.classList.contains('off')`, { what: 'awake off from the bar' });
  ctx.assert.equal((await ctx.server.api('api/awake')).body.awake, false);
  return out;
}
