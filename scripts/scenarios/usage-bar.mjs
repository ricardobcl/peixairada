// The plan usage (2026-09-24 a footer of its own; since 2026-09-28 the right end of the list's one row, now under the
// list): "5H 42%  1W 75%  F 95%" in the row, a tag per window, and over it, on hover or pinned by a click, a row per
// window with its bar, the tick of the
// window's clock, the percent and the time to reset — and for a cap in money (2026-10-08) what is spent of it; on the rail
// (⌥⌘B) the rings stacked, bigger, at its foot. What this
// checks is the page's half against a faked /api/usage (the test server runs with USAGE=off, which is the first thing
// checked: the bar is not there at all): the rings in the row, the rows and their colours, the ticks only where a
// window's length is known, the panel on hover and pinned, the rail, and a failure — the last numbers kept, dimmed,
// the error on hover; with no numbers yet, the error itself.
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
  const u = document.querySelector('#usage'), seen = el => !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden', r = u.getBoundingClientRect();
  return { hidden: u.hidden, pin: u.classList.contains('pin'), stale: u.classList.contains('stale'), top: Math.round(r.top), height: Math.round(r.height),
    open: seen(u.querySelector('.uopen')), line: seen(u.querySelector('.uline')), note: [...u.querySelectorAll('.unote')].find(seen)?.textContent || null,
    title: u.querySelector('.uline')?.title || '',
    rows: [...u.querySelectorAll('.urow')].map(row => { const bar = row.querySelector('.ubar'), tick = bar.querySelector('b');
      return { label: row.querySelector('.ul').textContent, pct: row.querySelector('.up').textContent, reset: row.querySelector('.ur').textContent,
        colour: row.querySelector('.ubar i').style.getPropertyValue('--u'), width: row.querySelector('.ubar i').style.width,
        tick: tick ? Math.round(parseFloat(tick.style.left)) : null }; }),
    chips: [...u.querySelectorAll('.uchip')].map(c => ({ k: c.querySelector('.uk').textContent, pct: c.querySelector('b').textContent,
      ring: Math.round(c.querySelector('.uring').getBoundingClientRect().width), shown: seen(c), words: seen(c.querySelector('.uk')),
      text: seen(c.querySelector('.uk')) ? c.querySelector('.uk').textContent + ' ' + c.querySelector('b').textContent : null })) };
})())`).then(JSON.parse);

export default async function (ctx) {
  const out = {};
  const board = () => ctx.waitFor(`document.querySelectorAll('#slist > .card').length > 0`, { what: 'the board' });
  const move = (x, y) => ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) });
  await board();

  // USAGE=off: the server says so, and the page keeps no bar for it
  await ctx.waitFor(`document.querySelector('#usage').hidden`, { what: 'the bar hidden under USAGE=off' });
  ctx.assert.equal((await ctx.server.api('api/usage')).body.off, true, 'the server flags the route off');
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#settings #usage, #settings .urow')`), false, 'nothing of the usage is left in the cog');

  // Numbers, from the stub: a tag and a percent per window at the row's end, the rows out of sight
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await ctx.reload(); await board();
  await ctx.waitFor(`document.querySelectorAll('#usage .urow').length === 4`, { what: 'four rows' });
  await move(900, 500); await ctx.settle();
  out.rest = await bar(ctx);
  const head = await ctx.evaluate(`JSON.stringify((r => [Math.round(r.top), Math.round(r.bottom)])(document.querySelector('#shd').getBoundingClientRect()))`).then(JSON.parse);
  ctx.assert.deepEqual([out.rest.hidden, out.rest.line, out.rest.open], [false, true, false], 'the rings shown, the rows not');
  ctx.assert.ok(out.rest.top >= head[0] && out.rest.top + out.rest.height <= head[1], `in the head row (${out.rest.top}, ${JSON.stringify(head)})`);
  ctx.assert.deepEqual(out.rest.chips.map(c => c.text), ['5H 42%', '1W 75%', 'F 95%', null], 'in words: a tag and a percent for each limit (2026-09-28, later) — the credit grant only over the row');
  ctx.assert.equal(out.rest.chips.every(c => c.ring === 0), true, 'no rings in the row');
  out.tag = await ctx.evaluate(`JSON.stringify((s => ({ weight: s.fontWeight, family: s.fontFamily, fill: s.backgroundColor !== 'rgba(0, 0, 0, 0)' }))(getComputedStyle(document.querySelector('#usage .uchip .uk'))))`).then(JSON.parse);
  ctx.assert.ok(out.tag.weight === '800' && /rounded/i.test(out.tag.family) && out.tag.fill, `the tag set apart: ${JSON.stringify(out.tag)}`);
  ctx.assert.deepEqual(out.rest.rows.map(r => r.pct), ['42%', '75%', '95%', '12%']);
  ctx.assert.deepEqual(out.rest.rows.map(r => r.colour), ['var(--spend)', 'var(--spend)', 'var(--needs)', 'var(--spend)'], 'orange, red from 90');
  // 2 h 30 m left of five hours, 3 d 12 h of seven days: both clocks stand half way; a credit grant has no clock
  ctx.assert.deepEqual(out.rest.rows.map(r => r.tick), [50, 50, 50, null], 'a tick where the clock stands, where the window has one');
  ctx.assert.deepEqual(out.rest.rows.map(r => r.reset), ['2h 30m', '3d 12h', '3d 12h', '']);
  await ctx.shot('1-words', await ctx.evaluate(`(r => ({ x: 0, y: Math.max(0, r.top - 70), width: 520, height: 120 }))(document.querySelector('#shd').getBoundingClientRect())`));

  // Pointed at, the rows come over the row a beat later; the pointer gone, they go
  const ring = await ctx.evaluate(`JSON.stringify((r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))(document.querySelector('#usage .uline').getBoundingClientRect()))`).then(JSON.parse);
  await move(ring.x, ring.y);
  await ctx.sleep(100);
  ctx.assert.equal((await bar(ctx)).open, false, 'not at once');
  await ctx.waitFor(`getComputedStyle(document.querySelector('#usage .uopen')).visibility === 'visible'`, { what: 'the rows on hover' });
  await ctx.settle();
  ctx.assert.ok(await ctx.evaluate(`document.querySelector('#usage .uopen').getBoundingClientRect().bottom <= document.querySelector('#shd').getBoundingClientRect().top + 1`), 'over the row, the list under it being the rest of the column');
  await ctx.shot('2-hover', await ctx.evaluate(`(r => ({ x: 0, y: Math.max(0, r.top - 240), width: 520, height: 300 }))(document.querySelector('#shd').getBoundingClientRect())`));
  await move(900, 500);
  await ctx.waitFor(`getComputedStyle(document.querySelector('#usage .uopen')).visibility === 'hidden'`, { what: 'the rows gone' });

  // A click keeps them; its heading, or a click elsewhere, lets them go
  await ctx.evaluate(`document.querySelector('#usage .uline').click()`);
  ctx.assert.deepEqual([(await bar(ctx)).pin, (await bar(ctx)).open], [true, true], 'pinned by a click on the rings');
  await ctx.evaluate(`document.querySelector('#usage .uhd').click()`);
  ctx.assert.equal((await bar(ctx)).pin, false, 'its heading lets it go');
  await ctx.evaluate(`document.querySelector('#usage .uline').click()`);
  await ctx.evaluate(`document.querySelector('#slist').click()`);
  ctx.assert.equal((await bar(ctx)).pin, false, 'a click elsewhere too');

  // The rail: the rings stack over the fish, bigger, with their tags; a click there changes nothing
  await ctx.key('KeyB');
  await ctx.evaluate(`document.querySelector('#usage .uline').click()`);
  out.rail = await bar(ctx);
  ctx.assert.equal(out.rail.pin, false, 'a click on the rail pins nothing');
  ctx.assert.equal(out.rail.open, false, 'the rail never shows the rows');
  ctx.assert.equal(out.rail.chips.every(c => c.shown && c.ring === 32), true, 'big rings on the rail');
  ctx.assert.equal(await ctx.evaluate(`(() => { const t = [...document.querySelectorAll('#usage .uchip')].map(c => c.getBoundingClientRect().top); return t.every((y, i) => !i || y > t[i - 1]); })()`), true, 'stacked');
  await ctx.shot('3-rail', { x: 0, y: 600, width: 300, height: 400 });
  await ctx.key('KeyB');

  // A cap in money (2026-10-08): "$ 54%" in the row, and over it the amounts under the bar, the month's clock ticked
  await ctx.evaluate(`sessionStorage.setItem('usageMode', 'cap')`);
  await ctx.reload(); await board();
  await ctx.waitFor(`document.querySelector('#usage .uchip .uk')?.textContent === '$'`, { what: 'the cap in the row' });
  out.cap = await bar(ctx);
  ctx.assert.deepEqual(out.cap.chips.map(c => c.text), ['$ 54%'], 'the cap in words, its tag a $');
  ctx.assert.deepEqual(out.cap.rows.map(r => [r.label, r.pct]), [['spend · this month', '54%']]);
  ctx.assert.ok(out.cap.rows[0].tick > 40 && out.cap.rows[0].tick < 60, `the month's clock about half way: ${out.cap.rows[0].tick}`);
  out.capMoney = await ctx.evaluate(`document.querySelector('#usage .urow .umoney')?.textContent`);
  ctx.assert.equal(out.capMoney, "$271 of $500", "what is spent of it, in its currency — whole units from 100 up");
  await ctx.evaluate(`document.querySelector('#usage .uline').click()`);
  await ctx.shot('3b-cap', await ctx.evaluate(`(r => ({ x: 0, y: Math.max(0, r.top - 140), width: 520, height: 200 }))(document.querySelector('#shd').getBoundingClientRect())`));
  await ctx.evaluate(`document.querySelector('#slist').click(); sessionStorage.removeItem('usageMode')`);
  await ctx.reload(); await board();
  await ctx.waitFor(`document.querySelectorAll('#usage .urow').length === 4`, { what: 'the four windows back' });

  // A failure once there are numbers: kept, dimmed, the error on hover. Two minutes on and back into view is due.
  await ctx.evaluate(`sessionStorage.setItem('usageMode', 'fail'); { const real = Date.now; Date.now = () => real() + 3 * 60e3; } document.dispatchEvent(new Event('visibilitychange'))`);
  await ctx.waitFor(`document.querySelector('#usage').classList.contains('stale')`, { what: 'the bar marked stale' });
  out.stale = await bar(ctx);
  ctx.assert.equal(out.stale.rows.length, 4, 'the last numbers stay');
  ctx.assert.match(out.stale.title, /since then: keychain access refused/, 'the error on hover');

  // A failure with no numbers yet is a sentence, cut short in the row
  await ctx.reload(); await board();
  await ctx.waitFor(`document.querySelector('#usage .unote')?.textContent.includes('keychain')`, { what: 'the error in the bar' });
  out.none = await bar(ctx);
  ctx.assert.equal(out.none.hidden, false, 'an error is shown, not hidden');
  ctx.assert.match(out.none.note, /keychain access refused/);
  await ctx.shot('4-error', await ctx.evaluate(`(r => ({ x: 0, y: Math.max(0, r.top - 70), width: 520, height: 120 }))(document.querySelector('#shd').getBoundingClientRect())`));
  return out;
}
