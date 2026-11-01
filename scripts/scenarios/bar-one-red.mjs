// One red on the status bar (2026-11-01, round XIX's S3): red means a chat is asking you. A meter past 90 % keeps the ink
// and says so with a ! that reads without colour, the lid's switch is amber, and with nothing asking nothing on the bar is
// red; the chat asking is the one thing that is. What this checks: all of that, by computed colour, on a bar made hot.
export const meta = { server: true, fixture: 'auto' };

const HOT = `(() => { const real = window.fetch, soon = h => new Date(Date.now() + h * 3600e3).toISOString(), json = o => Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } }));
  window.fetch = (u, o) => String(u).includes('/api/usage') ? json({ windows: [{ key: 'five_hour', label: 'session · 5 h', percent: 42, resetsAt: soon(2.5) }, { key: 'seven_day', label: 'week · all models', percent: 93, resetsAt: soon(84) }], other: [], fetchedAt: new Date().toISOString() })
    : String(u).includes('/api/stats') ? json({ cpu: 96, mem: { used: 95, total: 100 }, claude: { rss: 1e9, n: 2 } }) : real(u, o); })()`;

export default async function (ctx) {
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: HOT });
  await ctx.reload();
  await ctx.waitFor(`/!96%/.test(document.querySelector('#sbRight').textContent) && /!93%/.test(document.querySelector('#sbRight').textContent)`, { what: 'the meters past 90 % with their !' });
  const read = () => ctx.evaluate(`JSON.stringify((() => {
    const css = v => { const d = document.createElement('i'); d.style.color = 'var(' + v + ')'; document.querySelector('#sbar').append(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    const red = css('--needs'), ink = css('--ink');
    const reds = [...document.querySelectorAll('#sbar *')].filter(e => e.offsetParent && (getComputedStyle(e).color === red || e.style.getPropertyValue('--u') === 'var(--needs)') && e.textContent.trim()).map(e => e.textContent.trim().slice(0, 30));
    const hot = [...document.querySelectorAll('#sbRight .m')].map(m => [m.firstChild.textContent, m.querySelector('i')?.style.getPropertyValue('--u'), m.querySelector('b')?.textContent]);
    return { reds, hot, lidRed: getComputedStyle(document.querySelector('#sbLid')).color === red };
  })())`).then(JSON.parse);
  const out = await read();
  ctx.assert.deepEqual(out.reds, [], `nothing on the bar is red while nothing asks: ${JSON.stringify(out.reds)}`);
  ctx.assert.ok(out.hot.some(([l, u, t]) => l === 'CPU' && u === 'var(--ink)' && t === '!96%'), `CPU past 90 %: the ink and a !: ${JSON.stringify(out.hot)}`);
  ctx.assert.ok(out.hot.some(([l, u, t]) => l === 'RAM' && u === 'var(--ink)' && t === '!95%'), 'RAM likewise');
  ctx.assert.ok(out.hot.some(([, u, t]) => u === 'var(--ink)' && t === '!93%'), 'and the plan usage');
  ctx.assert.ok(out.hot.some(([, u, t]) => u === 'var(--spend)' && t === '42%'), 'a meter under 90 % keeps its colour and no !');
  await ctx.evaluate(`document.querySelector('#sbLid').classList.remove('off')`);
  ctx.assert.equal((await read()).lidRed, false, "the lid's switch, on, is not red");
  return out;
}
