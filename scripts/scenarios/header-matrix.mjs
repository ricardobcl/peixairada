// The chat header's PRs are the card's matrix (2026-11-03), with a git mark beside it that lists them. GitHub is the fake gh. Chats on one PR, a
// stack with CI and a move, seven, fourteen, thirty, and tickets alone. What this checks: the squares and the number a card has; one row, then two, then three as the count or
// the row asks, the toolbar no taller and the row one line, the title keeping its room; past three rows' room the box scrolls, the number
// put, the numbered square in sight, the end with more faded; a stack's line within a row and none at a row's start; CI (the number's badge, a failing square's ring, a
// running square's pulse); a square's card under the pointer, below the header; its click its PR; the mark says how many and folds the rows, no chips anywhere; tickets are dots; with a page on a tab under the header, a square's card clear of it.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';
import { makeFixture } from '../fixture.mjs';

const dir = tmpDir('peix-hmx-'), file = join(dir, 'prs.json');
const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const face = login => ({ login, __typename: 'User' });
const ci = state => ({ commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] } });
const pr = o => ({ isDraft: false, isCrossRepository: false, author: face('me'), reviewRequests: { nodes: [] }, reviews: { nodes: [] }, comments: { nodes: [] }, ...o });
const part = (n, updated = 1000) => pr({ state: n % 7 ? 'OPEN' : 'MERGED', title: `Part ${n}`, baseRefName: 'main', headRefName: `part-${n}`, createdAt: ago(2000), updatedAt: ago(updated) });
const range = (a, n) => Array.from({ length: n }, (_, i) => a + i);
writeFileSync(file, JSON.stringify({
  'acme/app#21': pr({ state: 'OPEN', title: 'Alone', baseRefName: 'main', headRefName: 'alone', createdAt: ago(50), updatedAt: ago(40), ...ci('SUCCESS') }),
  'acme/app#11': pr({ state: 'OPEN', title: 'The client', baseRefName: 'main', headRefName: 'retry-client', createdAt: ago(300), updatedAt: ago(250), ...ci('FAILURE') }),
  'acme/app#12': pr({ state: 'OPEN', title: 'The backoff', baseRefName: 'retry-client', headRefName: 'retry-backoff', createdAt: ago(200), updatedAt: ago(5), ...ci('PENDING'), comments: { nodes: [{ author: face('joel'), createdAt: ago(5) }] } }),
  'acme/app#13': pr({ state: 'OPEN', isDraft: true, title: 'The error page', baseRefName: 'retry-backoff', headRefName: 'retry-page', createdAt: ago(100), updatedAt: ago(90), ...ci('SUCCESS') }),
  'acme/docs#5': pr({ state: 'MERGED', title: 'Document the retries', baseRefName: 'main', headRefName: 'retry-docs', createdAt: ago(400), updatedAt: ago(1) }),
  ...Object.fromEntries(range(101, 7).map(n => [`acme/app#${n}`, part(n)])),
  ...Object.fromEntries(range(201, 14).map(n => [`acme/app#${n}`, part(n)])),
  ...Object.fromEntries(range(301, 30).map(n => [`acme/app#${n}`, part(n, n === 330 ? 2 : 1000 - n)])),
}));

export const meta = { server: true, fixture: 'auto', prefs: { sessionsWidth: 380 },
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, FAKEGH_VIEWER: 'me' } };

const pull = (repo, n) => `https://github.com/acme/${repo}/pull/${n}`;

export default async function (ctx) {
  const out = {}, a = ctx.assert, cwd = join(dir, 'hmx-repo'), now = Date.now(), urls = (from, n) => range(from, n).map(x => pull('app', x)).join(' ');
  const { chats: [one, stack, seven, fourteen, thirty] } = makeFixture(ctx.fixture.dir, [
    { cwd, title: 'On one PR', prompt: `look at ${pull('app', 21)}`, reply: 'looked', at: new Date(now - 60_000) },
    { cwd, title: 'On a stack', prompt: `the stack: ${pull('app', 11)} ${pull('app', 12)} ${pull('app', 13)}, and ${pull('docs', 5)}`, reply: 'looked', at: new Date(now - 120_000) },
    { cwd, title: 'On seven', prompt: urls(101, 7), reply: 'looked', at: new Date(now - 180_000) },
    { cwd, title: 'On fourteen', prompt: urls(201, 14), reply: 'looked', at: new Date(now - 240_000) },
    { cwd, title: 'On thirty', prompt: urls(301, 30), reply: 'looked', at: new Date(now - 300_000) },
  ]);
  await ctx.evaluate(`window.open = url => { (window.__opened ||= []).push(url); return null; }`);
  const opened = async (s, count) => { await ctx.waitFor(`!!window.peix.session(${JSON.stringify(s.id)})`, { timeout: 15_000, what: 'the chat on the board' }); await ctx.openChat(s.id); await ctx.waitFor(`document.querySelectorAll('#shead > .tmx .mxs[data-state="open"], #shead > .tmx .mxs[data-state="merged"], #shead > .tmx .mxs[data-state="draft"]').length === ${count}`, { timeout: 20_000, what: `${count} squares in the header` }); await ctx.settle(); };
  const look = () => ctx.evaluate(`JSON.stringify((() => {
    const h = document.querySelector('#shead'), m = h.querySelector(':scope > .tmx'), g = m?.querySelector('.mxg'), t = document.querySelector('#prToggle'), h2 = h.querySelector('h2'), r = e => e.getBoundingClientRect();
    const sq = m ? [...m.querySelectorAll('.mxs')] : [];
    return { rows: new Set(sq.map(e => Math.round(r(e).top))).size, cols: +m?.style.getPropertyValue('--cols'), n: sq.length, size: sq[0] && Math.round(r(sq[0]).width), num: m?.querySelector('.mxn')?.firstChild?.textContent, you: !!m?.querySelector('.mxn.you'),
      head: Math.round(r(h).height), inHead: sq.every(e => r(e).top >= r(h).top && r(e).bottom <= r(h).bottom), oneLine: Math.abs((r(t).top + r(t).height / 2) - (r(h2).top + r(h2).height / 2)) < 12, title: Math.round(r(h2).width - h2.querySelector('.repo').offsetWidth),
      scrolls: g ? g.scrollWidth > g.clientWidth + 1 : false, ofr: g?.classList.contains('ofr'), mark: t?.querySelector('.ic') ? 'pr' : null, chips: h.querySelectorAll('.hpr, .hcaret').length, toggleNext: m?.nextElementSibling?.id };
  })())`).then(JSON.parse);
  const count = () => ctx.evaluate(`document.querySelector('#prToggle .rn')?.textContent`);
  const crop = async (name, w = 1320) => ctx.shot(name, { x: 380, y: 0, width: w, height: 70 });

  await opened(one, 1);
  out.one = await look();
  a.deepEqual([out.one.rows, out.one.size, out.one.num, out.one.head, out.one.toggleNext, out.one.chips], [1, 9, '#21', 43, 'prToggle', 0], `one PR: a square and its number, the mark beside them, no chip: ${JSON.stringify(out.one)}`);
  a.equal(await count(), '1', 'the mark says how many');
  await crop('1-one');

  await opened(stack, 4);
  await ctx.waitFor(`document.querySelector('#shead > .tmx .mxn.you')`, { what: 'the move' , timeout: 15_000 }).catch(() => {});
  out.stack = await look();
  a.equal(out.stack.rows, 1, 'four: one row');
  out.ci = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#shead > .tmx .mxs')].map(e => { const c = getComputedStyle(e); return [e.dataset.url.split('/').pop(), e.dataset.checks || '', c.outlineStyle, c.animationName, e.classList.contains('j')]; }))`).then(JSON.parse);
  a.deepEqual(out.ci, [['11', 'fail', 'solid', 'none', false], ['12', 'pending', 'none', 'mxrun', true], ['13', 'pass', 'none', 'none', true], ['5', '', 'none', 'none', false]], `CI on the squares, a stack's lines: ${JSON.stringify(out.ci)}`);
  await crop('2-stack');

  await opened(seven, 7);
  out.seven = await look();
  a.equal(out.seven.rows, 1, 'seven: one row');
  await crop('3-seven');

  await opened(fourteen, 14);
  out.fourteen = await look();
  a.deepEqual([out.fourteen.rows, out.fourteen.cols, out.fourteen.head, out.fourteen.inHead, out.fourteen.oneLine], [2, 7, 43, true, true], `fourteen: two rows, the toolbar no taller: ${JSON.stringify(out.fourteen)}`);
  await crop('4-fourteen');

  await opened(thirty, 30);
  out.thirty = await look();
  a.deepEqual([out.thirty.rows, out.thirty.cols, out.thirty.head, out.thirty.inHead, out.thirty.num, out.thirty.scrolls], [3, 10, 43, true, '#330', false], `thirty: three rows, the toolbar no taller: ${JSON.stringify(out.thirty)}`);
  a.equal(await count(), '30', 'and of thirty');
  await crop('5-thirty');

  // the number's square is in sight; a wide row asks no more rows than the count does, and a narrow one more
  const width = w => ctx.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false }).then(() => ctx.sleep(300)).then(() => ctx.settle());
  await opened(seven, 7);
  await width(806);   // a column of some 420 px
  out.sevenNarrow = await look();
  a.deepEqual([out.sevenNarrow.oneLine, out.sevenNarrow.head, out.sevenNarrow.scrolls], [true, 43, false], `seven, narrow: one line: ${JSON.stringify(out.sevenNarrow)}`);
  a.ok(out.sevenNarrow.rows > 1, 'more rows than the wide row asks');
  await opened(thirty, 30);
  out.narrow = await look();
  a.deepEqual([out.narrow.rows, out.narrow.oneLine, out.narrow.head, out.narrow.inHead], [3, true, 43, true], `thirty, narrow: three rows, one line: ${JSON.stringify(out.narrow)}`);
  a.ok(out.narrow.title >= 100, `the title keeps its room: ${JSON.stringify(out.narrow)}`);
  await ctx.shot('6-narrow', { x: 380, y: 0, width: 426, height: 70 });
  await width(760);   // narrower than three rows' room: the box scrolls, the number put
  out.scroll = await look();
  a.deepEqual([out.scroll.rows, out.scroll.oneLine, out.scroll.scrolls, out.scroll.head], [3, true, true, 43], `narrower: it scrolls: ${JSON.stringify(out.scroll)}`);
  out.lead = await ctx.evaluate(`JSON.stringify((() => { const g = document.querySelector('#shead > .tmx .mxg'), l = g.querySelector('.mxs.lead').getBoundingClientRect(), b = g.getBoundingClientRect(); return { inside: l.left >= b.left && l.right <= b.right, edge: g.classList.contains('ofl') || g.classList.contains('ofr') }; })())`).then(JSON.parse);
  a.deepEqual(out.lead, { inside: true, edge: true }, 'the numbered square in sight, an end faded');
  const before = await ctx.evaluate(`document.querySelector('#shead > .tmx .mxg').scrollLeft`), at = await ctx.evaluate(`(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))(document.querySelector('#shead > .tmx .mxg').getBoundingClientRect())`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y }); await ctx.sleep(100);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: -40 }); await ctx.sleep(200);
  a.notEqual(await ctx.evaluate(`document.querySelector('#shead > .tmx .mxg').scrollLeft`), before, 'a wheel moves the squares');
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 500 });
  await width(1700);
  a.equal((await look()).rows, 3, 'and wide again');

  // a stack's line breaks at a row's start: the fourth of a stack in three columns has none
  await ctx.evaluate(`(m => { m.style.setProperty('--cols', 3); [...m.querySelectorAll('.mxs')].forEach((e, i) => e.classList.toggle('jw', i % 3 === 0)); })(document.querySelector('#shead > .tmx'))`);
  a.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#shead > .tmx .mxs.jw'), '::before').content`), 'none', 'none at a row\'s start');

  // a square's card, below the header; the number's its PR's; its click its PR; no tooltip of the system's
  await opened(stack, 4);
  const centre = sel => ctx.evaluate(`(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))(document.querySelector('${sel}').getBoundingClientRect())`);
  const sq11 = await centre('#shead > .tmx .mxs[data-url$="/11"]');
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sq11.x, y: sq11.y });
  await ctx.waitFor(`document.querySelector('#mxtip.on')`, { what: 'a square\'s card' });
  await ctx.settle();
  out.tip = await ctx.evaluate(`JSON.stringify((t => { const r = t.getBoundingClientRect(), h = document.querySelector('#shead').getBoundingClientRect(); return { title: t.querySelector('.mtt').textContent, below: t.classList.contains('below') && r.top >= h.bottom - 8, inside: r.right <= innerWidth, ck: t.querySelector('.mtck')?.textContent, tips: document.querySelectorAll('#shead > .tmx [title]:not(.tk)').length, hot: !!document.querySelector('#shead > .tmx .mxs.hot') }; })(document.querySelector('#mxtip')))`).then(JSON.parse);
  a.deepEqual(out.tip, { title: '#11The client', below: true, inside: true, ck: 'checks failing', tips: 0, hot: true }, `its card under the header: ${JSON.stringify(out.tip)}`);
  await ctx.shot('7-card', { x: 1100, y: 0, width: 600, height: 300 });
  const nm = await centre('#shead > .tmx .mxn');
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: nm.x, y: nm.y });
  await ctx.waitFor(`document.querySelector('#mxtip.on .mtt')?.textContent.startsWith('#12')`, { what: 'the number\'s PR\'s card' });
  for (const type of ['mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: sq11.x, y: sq11.y, button: 'left', clickCount: 1 });
  await ctx.waitFor(`window.peix.state().pr === '${pull('app', 11)}'`, { what: 'the square\'s PR opened' });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 500 });
  await ctx.waitFor(`!document.querySelector('#mxtip.on')`, { what: 'the card gone' });
  a.equal(await ctx.evaluate(`window.peix.prefs().prsOpen`), false, 'the rows left folded');

  // the mark lists them, and says it
  out.mark = await ctx.evaluate(`JSON.stringify((t => ({ expanded: t.getAttribute('aria-expanded'), tip: t.title, controls: t.getAttribute('aria-controls') }))(document.querySelector('#prToggle')))`).then(JSON.parse);
  a.deepEqual([out.mark.expanded, out.mark.controls], ['false', 'prlist']);
  a.match(out.mark.tip, /^4 PRs in this chat: click to list them/);
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  await ctx.waitFor(`!document.querySelector('#prlist').hidden`, { what: 'the rows' });
  a.equal(await ctx.evaluate(`document.querySelector('#prToggle').classList.contains('on') && document.querySelector('#prToggle').getAttribute('aria-expanded')`), 'true', 'lit while they show');
  a.equal(await ctx.evaluate(`document.querySelectorAll('#prlist .prrow').length`), 4, 'one row each');
  await ctx.settle();
  await ctx.shot('8-listed', { x: 380, y: 0, width: 1320, height: 190 });
  await ctx.evaluate(`document.querySelector('#prToggle').click()`);

  // in the app, with a PR on a tab under the header: its card would be under that native page, so it goes over the list, beside the column, no arrow
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.evaluate(`location.reload()`);
  await ctx.waitFor(`window.__posts && document.querySelectorAll('.card').length > 0`, { what: 'the board again, with the bridge' });
  await opened(stack, 4);
  await ctx.evaluate(`document.querySelector('#shead > .tmx .mxs[data-url$="/11"]').click()`);
  await ctx.waitFor(`(document.querySelector('#ptabsB .ptab.on')?.dataset.tab || '').startsWith('gh:')`, { what: 'the PR on a tab in the right half' });
  await ctx.settle();
  const sqApp = await centre('#shead > .tmx .mxs[data-url$="/13"]');
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sqApp.x, y: sqApp.y });
  await ctx.waitFor(`document.querySelector('#mxtip.on .mtt')?.textContent.startsWith('#13')`, { what: 'the square\'s card, with a page under the header' });
  await ctx.settle();
  out.far = await ctx.evaluate(`JSON.stringify((() => { const t = document.querySelector('#mxtip'), r = t.getBoundingClientRect(), h = document.querySelector('#shead').getBoundingClientRect(), panes = window.__posts.filter(m => m.type === 'pane').at(-1).panes;
    return { far: t.classList.contains('far'), panes: panes.length, left: r.left >= 8, beside: r.right <= h.left, clear: !panes.some(p => p.left < r.right && r.left < p.left + p.width && p.top < r.bottom && r.top < p.top + p.height), arrow: getComputedStyle(t, '::after').display }; })())`).then(JSON.parse);
  a.deepEqual(out.far, { far: true, panes: 1, left: true, beside: true, clear: true, arrow: 'none' }, `over the list, clear of the page: ${JSON.stringify(out.far)}`);
  await ctx.shot('9-card-with-page', { x: 0, y: 0, width: 1700, height: 320 });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 500 });
  return out;
}
