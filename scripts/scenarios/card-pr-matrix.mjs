// A card's PRs as a matrix (2026-11-01, round XVI's M5; the one way since 2026-11-03). GitHub
// is the fake gh. Four chats: one on a stack of three PRs in one repo (#11 › #12 › #13, each based on the one before) and
// a merged PR elsewhere that GitHub updated last, #12 at your move; one on a lone open PR; one on a merged, a closed and
// an open PR named in another order than GitHub updated them; one on thirty. What this checks: a square a PR in its
// state's colour, a draft hollow, in stack order, a stack's joined by a line and a PR on its own apart, 9 px however
// many and nothing round any (2026-11-01, later); the number the PR at your move's in the accent — else the one GitHub
// updated last's (updatedAt) in ink; past the row's room the squares scrolling in their box — the numbered one in
// sight, the end with more faded, a wheel moving them and not the number, the project's name whole; no tooltip of the
// system's, but a square's card under the pointer (its repo and state, number and title, CI, place in the stack, whose
// move), coming on a spring with the square lifted, going from square to square, the number's its PR's; a square's
// click (its PR) and its right-click menu; the pointer at rest on the card bringing up every PR with its title, a
// stack's rows together — not at once, and gone for a square's card. And none with the PRs left off the cards.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';
import { makeFixture } from '../fixture.mjs';

const dir = tmpDir('peix-mx-'), file = join(dir, 'prs.json');
const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const face = login => ({ login, __typename: 'User', avatarUrl: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#2e9e6a"/><text x="8" y="12" font-size="10" text-anchor="middle" fill="#fff">${login[0]}</text></svg>`) });
const ci = state => ({ commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] } });
const pr = o => ({ isDraft: false, isCrossRepository: false, author: face('me'), reviewRequests: { nodes: [] }, reviews: { nodes: [] }, comments: { nodes: [] }, ...o });
const MANY = Array.from({ length: 30 }, (_, i) => 41 + i);   // #41…#70, #70 updated last
writeFileSync(file, JSON.stringify({
  'acme/app#11': pr({ state: 'OPEN', title: 'The client', baseRefName: 'main', headRefName: 'retry-client', createdAt: ago(300), updatedAt: ago(250), ...ci('SUCCESS') }),
  'acme/app#12': pr({ state: 'OPEN', title: 'The backoff', baseRefName: 'retry-client', headRefName: 'retry-backoff', createdAt: ago(200), updatedAt: ago(5), ...ci('PENDING'),
    comments: { nodes: [{ author: face('joel'), createdAt: ago(5) }] } }),
  'acme/app#13': pr({ state: 'OPEN', isDraft: true, title: 'The error page', baseRefName: 'retry-backoff', headRefName: 'retry-page', createdAt: ago(100), updatedAt: ago(90), ...ci('FAILURE') }),
  'acme/docs#5': pr({ state: 'MERGED', title: 'Document the retries', baseRefName: 'main', headRefName: 'retry-docs', createdAt: ago(400), updatedAt: ago(1) }),
  'acme/app#21': pr({ state: 'OPEN', title: 'Alone', baseRefName: 'main', headRefName: 'alone', createdAt: ago(50), updatedAt: ago(40), ...ci('FAILURE') }),
  'acme/app#31': pr({ state: 'MERGED', title: 'Shipped', baseRefName: 'main', headRefName: 'shipped', createdAt: ago(900), updatedAt: ago(800) }),
  'acme/app#32': pr({ state: 'CLOSED', title: 'Dropped', baseRefName: 'main', headRefName: 'dropped', createdAt: ago(800), updatedAt: ago(10) }),
  'acme/app#33': pr({ state: 'OPEN', title: 'Still open', baseRefName: 'main', headRefName: 'still', createdAt: ago(700), updatedAt: ago(60), ...ci('SUCCESS') }),
  ...Object.fromEntries(MANY.map(n => [`acme/app#${n}`, pr({ state: n % 7 ? 'OPEN' : 'MERGED', title: `Part ${n}`, baseRefName: 'main', headRefName: `part-${n}`, createdAt: ago(2000), updatedAt: ago(n === 70 ? 2 : 1000 - n) })])),
}));

export const meta = { server: true, fixture: 'auto', prefs: { sessionsWidth: 320 },
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, FAKEGH_VIEWER: 'me' } };

const pull = (repo, n) => `https://github.com/acme/${repo}/pull/${n}`;

export default async function (ctx) {
  const out = {}, cwd = join(dir, 'mx-repo'), now = Date.now();
  const { chats: [stack, lone, upd, many] } = makeFixture(ctx.fixture.dir, [
    { cwd, title: 'On a stack', prompt: `the stack: ${pull('app', 11)} ${pull('app', 12)} ${pull('app', 13)}, and ${pull('docs', 5)}`, reply: 'looked', at: new Date(now - 60_000) },
    { cwd, title: 'On one', prompt: `look at ${pull('app', 21)}`, reply: 'looked', at: new Date(now - 120_000) },
    { cwd, title: 'On three', prompt: `look at ${pull('app', 32)}, ${pull('app', 33)} and ${pull('app', 31)}`, reply: 'looked', at: new Date(now - 180_000) },
    { cwd, title: 'On thirty', prompt: `the parts: ${MANY.map(n => pull('app', n)).join(' ')}`, reply: 'looked', at: new Date(now - 240_000) },
  ]);
  const card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;
  await ctx.waitFor(`${card(stack.id)}?.querySelector('.tmx .mxn.you') && ${card(stack.id)}.querySelectorAll('.mxs[data-state="open"]').length === 2 && ${card(lone.id)}?.querySelector('.mxs[data-state="open"]')`
    + ` && ${card(upd.id)}?.querySelector('.mxs[data-state="closed"]') && ${card(many.id)}?.querySelectorAll('.mxs[data-state="open"]').length > 20`,
    { timeout: 30_000, what: 'the PR states and branches from the fake gh' });
  await ctx.evaluate(`window.open = url => { (window.__opened ||= []).push(url); return null; }`);
  await ctx.settle();

  /** A card's matrix: the number and its colour, each square (number, state, * the numbered one), its stacks, the box. */
  const look = id => ctx.evaluate(`JSON.stringify((c => { const m = c.querySelector('.tmx'), n = m?.querySelector('.mxn'), g = m?.querySelector('.mxg'), lead = m?.querySelector('.mxs.lead');
    const num = a => a.dataset.url.split('/').pop(), cs = e => getComputedStyle(e), rect = e => e.getBoundingClientRect();
    return { num: n?.textContent.replace(/[,—].*$/s, '').trim(), you: n?.classList.contains('you'), ink: n && cs(n).color,
      squares: [...(m?.querySelectorAll('.mxs') || [])].map(a => '#' + num(a) + ':' + a.dataset.state + (a.classList.contains('lead') ? '*' : '')),
      stacks: [...(m?.querySelectorAll('.mxc') || [])].map(x => x.querySelectorAll('.mxs').length + '/' + x.querySelectorAll('s').length),
      round: [...(m?.querySelectorAll('.mxs:not([data-state="draft"])') || [])].map(q => cs(q).outlineStyle + ' ' + cs(q).boxShadow).filter(x => x !== 'none none'),
      tips: m ? m.querySelectorAll('[title]').length : 0,
      draft: (d => d && { bg: cs(d).backgroundColor, shadow: cs(d).boxShadow })(m?.querySelector('.mxs[data-state="draft"]')),
      size: (q => q && Math.round(rect(q).width))(m?.querySelector('.mxs')),
      box: g && { w: g.clientWidth, sw: g.scrollWidth, x: Math.round(g.scrollLeft), ofl: g.classList.contains('ofl'), ofr: g.classList.contains('ofr'), mask: cs(g).maskImage || cs(g).webkitMaskImage },
      leadIn: lead && g && (r => (b => r.left >= b.left && r.right <= b.right)(rect(g)))(rect(lead)),
      nx: n && Math.round(rect(n).left), repo: (r => r && { w: r.clientWidth, sw: r.scrollWidth })(c.querySelector('.top .repo')),
      shown: m ? rect(m).width > 0 : false };
  })(${card(id)}))`).then(JSON.parse);
  const accent = await ctx.evaluate(`(e => { e.style.color = 'var(--mxyou)'; document.querySelector('#slist .tmx').append(e); const c = getComputedStyle(e).color; e.remove(); return c; })(document.createElement('i'))`);   // the accent towards the ink (--mxyou)
  const ink = await ctx.evaluate(`getComputedStyle(document.body).color`);
  ctx.assert.notEqual(accent, ink, 'the move’s colour is not the ink');

  out.stack = await look(stack.id);
  ctx.assert.deepEqual(out.stack.squares, ['#11:open', '#12:open*', '#13:draft', '#5:merged'], 'a square a PR, by repo and number, the stack base first, #12 the numbered one');
  ctx.assert.deepEqual(out.stack.stacks, ['3/2', '1/0'], 'the stack of three joined by two lines, the merged PR on its own apart');
  ctx.assert.deepEqual([out.stack.num, out.stack.you, out.stack.ink], ['#12', true, accent], 'the number follows your move, in the accent — not #5, which GitHub updated last');
  ctx.assert.deepEqual([out.stack.round, out.stack.tips], [[], 0], 'nothing round any square, the numbered one either; no tooltip of the system’s');
  ctx.assert.ok(/rgba\(0, 0, 0, 0\)|transparent/.test(out.stack.draft.bg) && /inset/.test(out.stack.draft.shadow), `a draft hollow: ${JSON.stringify(out.stack.draft)}`);
  ctx.assert.equal(out.stack.size, 9, '9 px squares');
  out.lone = await look(lone.id);
  ctx.assert.deepEqual([out.lone.num, out.lone.you, out.lone.ink, out.lone.squares], ['#21', false, ink, ['#21:open*']], 'a lone PR: its number in ink');
  out.upd = await look(upd.id);
  ctx.assert.deepEqual([out.upd.num, out.upd.squares], ['#32', ['#31:merged', '#32:closed*', '#33:open']], 'no move: the one GitHub updated last, whatever order the chat named them in');
  ctx.assert.equal(await ctx.evaluate(`window.peix.session(${JSON.stringify(upd.id)}).prs.find(p => p.number === 32).updated`), JSON.parse(readFileSync(file, 'utf8'))['acme/app#32'].updatedAt, 'GitHub’s updatedAt on the chat’s PR');
  out.many = await look(many.id);
  ctx.assert.deepEqual([out.many.size, out.many.squares.length, out.many.num], [9, 30, '#70'], 'thirty the same size; the number the newest');
  ctx.assert.ok(out.many.box.sw > out.many.box.w, `thirty run past the row's room: ${JSON.stringify(out.many.box)}`);
  ctx.assert.ok(out.many.leadIn && out.many.box.x > 0 && out.many.box.ofl && !out.many.box.ofr && /gradient/.test(out.many.box.mask), `the numbered square, the last, scrolled into sight; the start faded: ${JSON.stringify(out.many.box)}`);
  ctx.assert.ok(out.many.repo.sw <= out.many.repo.w + 1, `the project's name whole: ${JSON.stringify(out.many.repo)}`);
  await ctx.shot('matrix');

  // a wheel over it moves the squares, not the number
  const mc = await ctx.evaluate(`(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))(${card(many.id)}.querySelector('.mxg').getBoundingClientRect())`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mc.x, y: mc.y });
  await ctx.sleep(100); const under = await look(many.id);   // the pointer brings the ✓, which takes its room from the squares' (2026-11-03)
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mc.x, y: mc.y, deltaX: 0, deltaY: -120 });
  await ctx.waitFor(`${card(many.id)}.querySelector('.mxg').scrollLeft < ${under.box.x}`, { what: 'the squares scrolled back by the wheel' });
  await ctx.sleep(100);
  out.wheeled = await look(many.id);
  ctx.assert.equal(out.wheeled.nx, under.nx, 'the number stays put');
  ctx.assert.ok(out.wheeled.box.ofr, `more past the end now, faded: ${JSON.stringify(out.wheeled.box)}`);
  ctx.assert.equal(await ctx.evaluate(`document.scrollingElement.scrollTop + document.querySelector('#slist').scrollTop`), 0, 'the list did not scroll');

  // a square: its card under the pointer — on a spring, the square lifted —, from square to square, the number's
  const sq = n => `${card(stack.id)}.querySelector('.mxs[data-url$="/pull/${n}"]')`;
  const centre = el => ctx.evaluate(`(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))(${el}.getBoundingClientRect())`);
  const tipSays = () => ctx.evaluate(`JSON.stringify((t => ({ repo: t.querySelector('.mtr').textContent, state: t.querySelector('.mts').textContent, title: t.querySelector('.mtt').textContent,
    ck: t.querySelector('.mtck')?.textContent || '', stack: t.querySelector('.mtk')?.textContent || '', move: t.querySelector('.mtm')?.textContent || '', clear: (r => (m => r.bottom <= m.top || r.top >= m.bottom)(${card(stack.id)}.querySelector('.tmx').getBoundingClientRect()))(t.getBoundingClientRect()) }))(document.querySelector('#mxtip')))`).then(JSON.parse);
  const at12 = await centre(sq(12));
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at12.x, y: at12.y });
  await ctx.waitFor(`document.querySelector('#mxtip.on')`, { what: '#12’s card' });
  out.spring = await ctx.evaluate(`document.querySelector('#mxtip').getAnimations().filter(a => a.transitionProperty === 'transform').map(a => a.effect.getComputedTiming().easing.slice(0, 7))`);
  ctx.assert.deepEqual(out.spring, ['linear('], 'it comes on the spring');
  await ctx.settle();
  out.card12 = await tipSays();
  ctx.assert.deepEqual(out.card12, { repo: 'acme/app', state: 'Open', title: '#12The backoff', ck: 'checks running', stack: '2 of 3 in a stack', move: 'your move1 comment from joel', clear: true }, 'its repo and state, number and title, CI, place in the stack, whose move — over the square or, at the list’s top, under it');
  ctx.assert.deepEqual(await ctx.evaluate(`[${sq(12)}.classList.contains('hot'), getComputedStyle(${sq(12)}).scale, !!document.querySelector('#rpop.on')]`), [true, '1.3', false], 'its square lifted; nothing else up');
  const at5 = await centre(sq(5));
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at5.x, y: at5.y });
  await ctx.waitFor(`document.querySelector('#mxtip.on .mtt')?.textContent.startsWith('#5')`, { what: 'on to #5’s card' });
  await ctx.settle();
  out.card5 = await tipSays();
  ctx.assert.deepEqual([out.card5.repo, out.card5.state, out.card5.title, out.card5.stack], ['acme/docs', 'Merged', '#5Document the retries', ''], 'a merged one on its own says so');
  const atN = await centre(`${card(stack.id)}.querySelector('.mxn')`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: atN.x, y: atN.y });
  await ctx.waitFor(`document.querySelector('#mxtip.on .mtt')?.textContent.startsWith('#12')`, { what: 'the number’s card' });
  ctx.assert.deepEqual(await ctx.evaluate(`[${sq(12)}.classList.contains('hot'), ${sq(5)}.classList.contains('hot')]`), [true, false], 'the number lifts the square it names');
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
  await ctx.waitFor(`!document.querySelector('#mxtip.on') && !${sq(12)}.classList.contains('hot')`, { what: 'the card gone with the pointer' });

  // its click and its right-click menu
  await ctx.evaluate(`${sq(11)}.click()`);
  await ctx.waitFor(`(window.__opened || []).includes(${JSON.stringify(pull('app', 11))})`, { what: 'the square’s PR opened' });
  const at11 = await ctx.evaluate(`(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))(${sq(11)}.getBoundingClientRect())`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at11.x, y: at11.y, button: 'right', clickCount: 1 });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at11.x, y: at11.y, button: 'right', clickCount: 1 });
  await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: 'the square’s menu' });
  out.menu = await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].map(b => b.textContent)`);
  ctx.assert.ok(out.menu[0] === 'Open the PR' && out.menu.some(t => t.startsWith('Take it off')), `the chip's menu: ${out.menu}`);
  await ctx.evaluate(`document.querySelector('#ctxm').close()`);

  // the pointer at rest on the card: every PR, the matrix's order, with its title; the stack's rows together — after a
  // while, not at once
  const atT = await centre(`${card(stack.id)}.querySelector('.title')`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: atT.x, y: atT.y });
  await ctx.sleep(250);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#rpop.on')`), false, 'not at once');
  await ctx.waitFor(`document.querySelector('#rpop.on .rpr.mx')`, { what: 'every PR with the pointer at rest' });
  out.pop = await ctx.evaluate(`JSON.stringify({ rows: [...document.querySelectorAll('#rpop .rpr.mx')].map(r => r.querySelector('.pchip').textContent + ' ' + r.querySelector('.h').textContent + ' · ' + r.querySelector('.st').textContent + (r.dataset.k === 'you' ? ' · your move' : '')),
    stack: document.querySelectorAll('#rpop .rstk > .rpr').length, head: document.querySelector('#rpop .rph').textContent, ck: document.querySelector('#rpop .rpr.mx .s').textContent })`).then(JSON.parse);
  ctx.assert.deepEqual(out.pop.rows, ['#11 The client · open', '#12 The backoff · open · your move', '#13 The error page · draft', '#5 Document the retries · merged'], 'every PR, numbered and titled, in the matrix’s order');
  ctx.assert.deepEqual([out.pop.stack, out.pop.head], [3, 'this chat’s PRs · 4'], 'the stack’s three together');
  ctx.assert.ok(out.pop.ck.includes('checks passed'), `a PR's CI: ${out.pop.ck}`);
  await ctx.shot('popover');
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at11.x, y: at11.y });
  await ctx.waitFor(`!document.querySelector('#rpop.on') && document.querySelector('#mxtip.on')`, { what: 'a square’s card in its place' });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });

  // with no PRs on cards, the matrix hidden
  await ctx.evaluate(`document.querySelector('#settingsBtn').click()`);
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
  await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="list"]').click()`);
  await ctx.waitFor(`document.querySelector('#cardLab [data-part="prs"]')`, { what: 'the card in the pane' });
  await ctx.evaluate(`document.querySelector('#cardLab [data-part="prs"]').click()`);
  await ctx.evaluate(`document.querySelector('#settings').close()`);
  await ctx.settle();
  ctx.assert.equal((await look(stack.id)).shown, false, 'the matrix hidden with the PRs');

  return out;
}
