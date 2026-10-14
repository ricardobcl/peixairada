// The plan usage (2026-09-24; the status bar's since 2026-10-09, and only there since 2026-10-14 — the list's foot had
// its tags and rings): a pie and a percent per limit in the bar, "5H 42%  1W 75%  F 95%", and over it, on a click, a row
// per window with its bar, the tick of the window's clock, the percent and the time to reset — and for a cap in money
// (2026-10-08) what is spent of it. What this checks is the page's half against a faked /api/usage (the test server
// runs with USAGE=off, which is the first thing checked: no usage in the bar at all): the meters, the rows and their
// colours, the ticks only where a window's length is known, the panel on a click, and a failure — the last numbers
// kept, dimmed, the error on hover; with no numbers yet, the error itself.
export const meta = { server: true, fixture: 'auto' };

// /api/usage answered by the page itself. The mode lives in sessionStorage so a reload can start in it.
const STUB = `(() => {
  const real = window.fetch, soon = h => new Date(Date.now() + h * 3600e3).toISOString();
  window.__usage = { calls: 0 };
  const answer = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  window.fetch = (u, o) => {
    if (!String(u).includes('/api/usage')) return real(u, o);
    __usage.calls++;
    if (sessionStorage.getItem('usageMode') === 'fail') return answer({ error: 'keychain access refused (allow \`security\` when asked)' }, 503);
    // an enterprise seat capped in money (2026-10-08): the server's spend window, its dollars in whole units
    if (sessionStorage.getItem('usageMode') === 'cap') return answer({ windows: [
      { key: 'spend:monthly', label: 'spend · this month', percent: 54, resetsAt: soon(24 * 15), period: 'monthly', used: 271.4, limit: 500, currency: 'USD' },
    ], other: [], fetchedAt: new Date().toISOString() });
    return answer({ windows: [
      { key: 'five_hour', label: 'session · 5 h', percent: 42, resetsAt: soon(2.5) },
      { key: 'seven_day', label: 'week · all models', percent: 75, resetsAt: soon(84) },
      { key: 'limits:weekly_scoped:Fable', label: 'week · Fable', percent: 95, resetsAt: soon(84) },
      { key: 'cinder_cove', label: 'Claude Code & Cowork credit', percent: 12, resetsAt: null },
    ], other: [], fetchedAt: new Date().toISOString() });
  };
})()`;

const bar = ctx => ctx.evaluate(`JSON.stringify((() => {
  const u = document.querySelector('#sbar .us'), panel = document.querySelector('#sbar .sbpanel');
  return { shown: !!u, stale: !!u?.classList.contains('stale'), open: !!panel, title: u?.title || '', note: u?.querySelector('.unote')?.textContent || null,
    meters: u ? [...u.querySelectorAll('.m')].map(m => m.textContent.trim()) : [],
    rows: [...(panel?.querySelectorAll('.urow') || [])].map(row => { const bar = row.querySelector('.ubar'), tick = bar.querySelector('b');
      return { label: row.querySelector('.ul').textContent, pct: row.querySelector('.up').textContent, reset: row.querySelector('.ur').textContent,
        colour: row.querySelector('.ubar i').style.getPropertyValue('--u'), tick: tick ? Math.round(parseFloat(tick.style.left)) : null,
        money: row.querySelector('.umoney')?.textContent || null }; }) };
})())`).then(JSON.parse);

export default async function (ctx) {
  const out = {};
  const board = () => ctx.waitFor(`document.querySelectorAll('#slist > .card').length > 0 && !!document.querySelector('#sbar .clock')`, { what: 'the board and its bar' });
  const click = () => ctx.evaluate(`document.querySelector('#sbar .us').click()`);
  await board();

  // USAGE=off: the server says so, and the bar has no usage for it
  ctx.assert.equal((await ctx.server.api('api/usage')).body.off, true, 'the server flags the route off');
  await ctx.sleep(300);
  ctx.assert.equal((await bar(ctx)).shown, false, 'no usage in the bar');

  // Numbers, from the stub: a pie and a percent per limit, the credit grant only in the rows
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await ctx.reload(); await board();
  await ctx.waitFor(`document.querySelectorAll('#sbar .us .m').length === 3`, { what: 'the meters' });
  out.rest = await bar(ctx);
  ctx.assert.deepEqual(out.rest.meters, ['5H42%', '1W75%', 'F95%'], 'a tag and a percent for each limit — the credit grant only in the rows');
  ctx.assert.equal(out.rest.open, false, 'the rows out of sight');

  // A click: the rows over the bar; again, or a click elsewhere, and they go
  await click();
  await ctx.waitFor(`document.querySelectorAll('#sbar .sbpanel .urow').length === 4`, { what: 'four rows' });
  out.rows = await bar(ctx);
  ctx.assert.deepEqual(out.rows.rows.map(r => r.pct), ['42%', '75%', '95%', '12%']);
  ctx.assert.deepEqual(out.rows.rows.map(r => r.colour), ['var(--spend)', 'var(--spend)', 'var(--needs)', 'var(--spend)'], 'orange, red from 90');
  // 2 h 30 m left of five hours, 3 d 12 h of seven days: both clocks stand half way; a credit grant has no clock
  ctx.assert.deepEqual(out.rows.rows.map(r => r.tick), [50, 50, 50, null], 'a tick where the clock stands, where the window has one');
  ctx.assert.deepEqual(out.rows.rows.map(r => r.reset), ['2h 30m', '3d 12h', '3d 12h', '']);
  ctx.assert.ok(await ctx.evaluate(`document.querySelector('#sbar .sbpanel').getBoundingClientRect().bottom <= document.querySelector('#sbar').getBoundingClientRect().top`), 'over the bar');
  await ctx.shot('1-rows', await ctx.evaluate(`(r => ({ x: Math.max(0, r.right - 520), y: Math.max(0, r.top - 240), width: 520, height: 280 }))(document.querySelector('#sbar').getBoundingClientRect())`));
  await click();
  ctx.assert.equal((await bar(ctx)).open, false, 'a second click puts them away');
  await click();
  await ctx.evaluate(`document.querySelector('#slist').click()`);
  ctx.assert.equal((await bar(ctx)).open, false, 'a click elsewhere too');

  // A cap in money (2026-10-08): "$ 54%" in the bar, and in its row the amounts under the bar, the month's clock ticked
  await ctx.evaluate(`sessionStorage.setItem('usageMode', 'cap')`);
  await ctx.reload(); await board();
  await ctx.waitFor(`(document.querySelector('#sbar .us .m')?.textContent || '').startsWith('$')`, { what: 'the cap in the bar' });
  await click();
  await ctx.waitFor(`document.querySelectorAll('#sbar .sbpanel .urow').length === 1`, { what: 'its row' });
  out.cap = await bar(ctx);
  ctx.assert.deepEqual(out.cap.meters, ['$54%'], 'the cap, its tag a $');
  ctx.assert.deepEqual(out.cap.rows.map(r => [r.label, r.pct]), [['spend · this month', '54%']]);
  ctx.assert.ok(out.cap.rows[0].tick > 40 && out.cap.rows[0].tick < 60, `the month's clock about half way: ${out.cap.rows[0].tick}`);
  ctx.assert.equal(out.cap.rows[0].money, '$271 of $500', 'what is spent of it, in its currency — whole units from 100 up');
  await ctx.evaluate(`document.querySelector('#slist').click(); sessionStorage.removeItem('usageMode')`);
  await ctx.reload(); await board();
  await ctx.waitFor(`document.querySelectorAll('#sbar .us .m').length === 3`, { what: 'the windows back' });

  // A failure once there are numbers: kept, dimmed, the error on hover. Two minutes on and back into view is due.
  await ctx.evaluate(`sessionStorage.setItem('usageMode', 'fail'); { const real = Date.now; Date.now = () => real() + 3 * 60e3; } document.dispatchEvent(new Event('visibilitychange'))`);
  await ctx.waitFor(`document.querySelector('#sbar .us')?.classList.contains('stale')`, { what: 'the usage marked stale' });
  out.stale = await bar(ctx);
  ctx.assert.equal(out.stale.meters.length, 3, 'the last numbers stay');
  ctx.assert.match(out.stale.title, /keychain access refused/, 'the error on hover');

  // A failure with no numbers yet is a sentence
  await ctx.reload(); await board();
  await ctx.waitFor(`(document.querySelector('#sbar .us .unote')?.textContent || '').includes('keychain')`, { what: 'the error in the bar' });
  out.none = await bar(ctx);
  ctx.assert.match(out.none.note, /keychain access refused/);
  await ctx.shot('2-error', await ctx.evaluate(`(r => ({ x: Math.max(0, r.right - 700), y: Math.max(0, r.top - 20), width: 700, height: 60 }))(document.querySelector('#sbar').getBoundingClientRect())`));
  return out;
}
