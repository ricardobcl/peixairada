// The plan usage under the chat list (2026-09-24): it left the cog's popover for a footer of its own that is always
// in view — open, a row per window with its bar, the tick of the window's clock, the percent and the time to reset;
// folded, one line of rings, as tall as the cog's row beside it; on the rail (⌘B) the rings stacked. What this checks
// is the page's half against a faked /api/usage (the test server runs with USAGE=off, which is the first thing
// checked: the bar is not there at all): the rows and their colours, the ticks only where a window's length is
// known, the fold and that it survives a reload, the rail, and a failure — the last numbers kept, dimmed, the error
// on hover; with no numbers yet, the error itself.
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
    return answer({ windows: [
      { key: 'five_hour', label: 'session · 5 h', percent: 42, resetsAt: soon(2.5) },
      { key: 'seven_day', label: 'week · all models', percent: 75, resetsAt: soon(84) },
      { key: 'limits:weekly_scoped:Fable', label: 'week · Fable', percent: 95, resetsAt: soon(84) },
      { key: 'cinder_cove', label: 'Claude Code & Cowork credit', percent: 12, resetsAt: null },
    ], other: [], fetchedAt: new Date().toISOString() });
  };
})()`;

const bar = ctx => ctx.evaluate(`JSON.stringify((() => {
  const u = document.querySelector('#usage'), shown = el => !!el && el.offsetParent !== null, r = u.getBoundingClientRect();
  return { hidden: u.hidden, folded: u.classList.contains('folded'), stale: u.classList.contains('stale'), height: Math.round(r.height),
    open: shown(u.querySelector('.uopen')), line: shown(u.querySelector('.uline')), note: [...u.querySelectorAll('.unote')].find(shown)?.textContent || null,
    title: u.querySelector(shown(u.querySelector('.uline')) ? '.uline' : '.uhd')?.title || '',
    rows: [...u.querySelectorAll('.urow')].map(row => { const bar = row.querySelector('.ubar'), tick = bar.querySelector('b');
      return { label: row.querySelector('.ul').textContent, pct: row.querySelector('.up').textContent, reset: row.querySelector('.ur').textContent,
        colour: row.querySelector('.ubar i').style.getPropertyValue('--u'), width: row.querySelector('.ubar i').style.width,
        tick: tick ? Math.round(parseFloat(tick.style.left)) : null }; }),
    chips: [...u.querySelectorAll('.uchip')].map(c => ({ k: c.querySelector('.uk').textContent, pct: c.querySelector('b').textContent,
      ring: Math.round(c.querySelector('.uring').getBoundingClientRect().width), shown: shown(c) })) };
})())`).then(JSON.parse);

export default async function (ctx) {
  const out = {};
  const board = () => ctx.waitFor(`document.querySelectorAll('#slist > .card').length > 0`, { what: 'the board' });
  await board();

  // USAGE=off: the server says so, and the page keeps no bar for it
  await ctx.waitFor(`document.querySelector('#usage').hidden`, { what: 'the bar hidden under USAGE=off' });
  ctx.assert.equal((await ctx.server.api('api/usage')).body.off, true, 'the server flags the route off');
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#settings #usage, #settings .urow')`), false, 'nothing of the usage is left in the cog');

  // Numbers, from the stub
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await ctx.send('Page.reload'); await ctx.sleep(800); await board();
  await ctx.waitFor(`document.querySelectorAll('#usage .urow').length === 4`, { what: 'four rows' });
  out.open = await bar(ctx);
  ctx.assert.equal(out.open.hidden, false);
  ctx.assert.equal(out.open.open, true, 'open by default');
  ctx.assert.equal(out.open.line, false, 'and the folded line is not shown with it');
  ctx.assert.deepEqual(out.open.rows.map(r => r.pct), ['42%', '75%', '95%', '12%']);
  ctx.assert.deepEqual(out.open.rows.map(r => r.colour), ['var(--spend)', 'var(--spend)', 'var(--needs)', 'var(--spend)'], 'orange, red from 90');
  // 2 h 30 m left of five hours, 3 d 12 h of seven days: both clocks stand half way; a credit grant has no clock
  ctx.assert.deepEqual(out.open.rows.map(r => r.tick), [50, 50, 50, null], 'a tick where the clock stands, where the window has one');
  ctx.assert.deepEqual(out.open.rows.map(r => r.reset), ['2h 30m', '3d 12h', '3d 12h', '']);
  ctx.assert.deepEqual(out.open.chips.map(c => c.k), ['5h', 'week', 'Fable', 'credit'], 'the rings go by short names');
  await ctx.shot('1-open', { x: 0, y: 700, width: 520, height: 300 });

  // Folded, from the heading; the line is as tall as the cog's row, so the two top rules are one line
  await ctx.evaluate(`document.querySelector('#usage .uhd').click()`);
  out.folded = await bar(ctx);
  ctx.assert.equal(out.folded.folded && out.folded.line && !out.folded.open, true, 'folded shows the line alone');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#usage').getBoundingClientRect().top === document.querySelector('#pfoot').getBoundingClientRect().top`), true, 'level with the cog row');
  ctx.assert.equal(out.folded.chips.every(c => c.shown && c.ring === 12), true, 'every ring shows, small');
  ctx.assert.equal((await ctx.peix('prefs()')).usageFolded, true, 'the fold is a pref');
  await ctx.shot('2-folded', { x: 0, y: 700, width: 520, height: 300 });
  await ctx.send('Page.reload'); await ctx.sleep(800); await board();
  await ctx.waitFor(`document.querySelectorAll('#usage .uchip').length === 4`, { what: 'the rings after a reload' });
  ctx.assert.equal((await bar(ctx)).folded, true, 'still folded after a reload');

  // The rail: the rings stack, bigger, whatever the fold says; a click there changes nothing
  await ctx.cmd('KeyB');
  await ctx.evaluate(`document.querySelector('#usage .uline').click()`);
  out.rail = await bar(ctx);
  ctx.assert.equal(out.rail.folded, true, 'a click on the rail does not unfold');
  ctx.assert.equal(out.rail.chips.every(c => c.shown && c.ring === 32), true, 'big rings on the rail');
  ctx.assert.equal(await ctx.evaluate(`(() => { const t = [...document.querySelectorAll('#usage .uchip')].map(c => c.getBoundingClientRect().top); return t.every((y, i) => !i || y > t[i - 1]); })()`), true, 'stacked');
  await ctx.shot('3-rail', { x: 0, y: 600, width: 300, height: 400 });
  await ctx.evaluate(`document.querySelector('#usage').classList.remove('folded')`);   // unfolded, the rail is still rings
  ctx.assert.equal((await bar(ctx)).open, false, 'the rail never shows the rows');
  await ctx.cmd('KeyB');

  // Open again from the line
  await ctx.evaluate(`document.querySelector('#usage .uline').click()`);
  ctx.assert.equal((await bar(ctx)).open, true, 'the line opens it');

  // A failure once there are numbers: kept, dimmed, the error on hover. Two minutes on and back into view is due.
  await ctx.evaluate(`sessionStorage.setItem('usageMode', 'fail'); { const real = Date.now; Date.now = () => real() + 3 * 60e3; } document.dispatchEvent(new Event('visibilitychange'))`);
  await ctx.waitFor(`document.querySelector('#usage').classList.contains('stale')`, { what: 'the bar marked stale' });
  out.stale = await bar(ctx);
  ctx.assert.equal(out.stale.rows.length, 4, 'the last numbers stay');
  ctx.assert.match(out.stale.title, /since then: keychain access refused/, 'the error on hover');
  await ctx.shot('4-stale', { x: 0, y: 700, width: 520, height: 300 });

  // A failure with no numbers yet is a sentence
  await ctx.send('Page.reload'); await ctx.sleep(800); await board();
  await ctx.waitFor(`document.querySelector('#usage .unote')?.textContent.includes('keychain')`, { what: 'the error in the bar' });
  out.none = await bar(ctx);
  ctx.assert.equal(out.none.hidden, false, 'an error is shown, not hidden');
  ctx.assert.match(out.none.note, /^keychain access refused/);
  await ctx.shot('5-error', { x: 0, y: 700, width: 520, height: 300 });
  return out;
}
