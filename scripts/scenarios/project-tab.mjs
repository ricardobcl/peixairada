// The project's corner tab, and the edges round it (2026-11-03, round XXI), on the prefs it was chosen on. A row's tab sits in
// its top-left corner, its words on the title's edge and the top row on one line; no project shown, no tab and the row's 18 px.
// What only the pointer shows keeps no room at rest, so the chips run to the right edge; it comes under the pointer and
// the row keeps its height; the ✓ stays in the keys' way. A chat with no process dims its row, not its tab; open, nothing.
// The toolbar's tab, one shape: in the sheet's corner down to the hairline, its words level with the title — lowered at
// the notch too; a header with no project keeps its words where they were. The lane heads and the day lines on the rows' edges.
// The chips one corner. The tab's inks are INK_CHECK's. Shots dark and light.
import { spawn } from 'node:child_process';
import { realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

const dir = tmpDir('peix-gh-'), file = join(dir, 'prs.json');
const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const user = login => ({ login, __typename: 'User', avatarUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#8250df"/></svg>') });
writeFileSync(file, JSON.stringify({ 'acme/moved#12': {
  state: 'OPEN', title: 'Base of the follow-up', createdAt: ago(300), headRefOid: 'B', author: user('ana'), viewerLatestReview: { submittedAt: ago(60), commit: { oid: 'A' } }, reviewRequests: { nodes: [] },
  reviews: { nodes: [{ author: user('me'), state: 'CHANGES_REQUESTED', submittedAt: ago(60) }] }, comments: { nodes: [] }, pushes: { nodes: [{ __typename: 'PullRequestCommit', commit: { committedDate: ago(30), author: { user: { login: 'ana' } } } }] }, asks: { nodes: [] },
} }));

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'compact', cardsEven: true, prChips: 'matrix', lanesShut: [] },
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, FAKEGH_VIEWER: 'me', PR_WATCH_MS: '500' } };

export default async function (ctx) {
  const out = {}, now = Date.now(), root = realpathSync(tmpDir('peix-tab-')), sleeper = spawn('sleep', ['300'], { stdio: 'ignore' });
  const near = (a, b, what, by = .6) => ctx.assert.ok(Math.abs(a - b) <= by, `${what}: ${a} against ${b}`);
  const read = id => ctx.evaluate(`(c => {
    const box = s => { const e = s ? c.querySelector(s) : c; if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(), st = getComputedStyle(e); return { l: b.left, r: b.right, t: b.top, b: b.bottom, h: b.height, w: b.width, mid: (b.top + b.bottom) / 2, op: st.opacity, round: st.borderRadius }; };
    const words = s => { const r = document.createRange(); r.selectNodeContents(c.querySelector(s)); return r.getBoundingClientRect().left; };
    const squares = c.querySelectorAll('.tmx .mxs'), last = squares[squares.length - 1]?.getBoundingClientRect();
    return { card: box(), top: box('.top'), tab: box('.top .repo'), tabWords: c.querySelector('.top .repo') && words('.top .repo'), titleWords: words('.title'), title: box('.title'), trow: box('.trow'), titleRoom: parseFloat(getComputedStyle(c.querySelector('.title')).marginRight),
      act: box('.act'), time: box('.time'), where: box('.chip.elsewhere'), tmx: box('.tmx'), lastSquare: last ? last.right : null, ymove: box('.ymove'), trowEnd: [...c.querySelectorAll('.trow > *')].filter(e => e.getClientRects().length).pop().getBoundingClientRect().right, hastab: c.querySelector('.top').classList.contains('hastab') };
  })(document.querySelector('#slist > .card[data-id="${id}"]'))`);
  const point = (x, y) => ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  const over = async c => { await point(c.l + c.w / 2, c.b - 4); await ctx.sleep(250); };
  const away = async () => { await point(1000, 500); await ctx.sleep(200); };
  const head = () => ctx.evaluate(`(() => { const h = document.querySelector('#shead'), r = h.querySelector('h2 .repo'), t = h.querySelector('h2 .t'), m = h.querySelector('#moreBtn'), hb = h.getBoundingClientRect(), rb = r.getBoundingClientRect();
    const text = e => { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect(); }, mid = b => (b.top + b.bottom) / 2, rw = text(r), tw = text(t);
    return { head: { l: hb.left, t: hb.top, b: hb.bottom }, tab: { l: rb.left, t: rb.top, b: rb.bottom }, round: getComputedStyle(r).borderRadius, wordsL: rw.left, wordsMid: mid(rw), titleMid: mid(tw), moreMid: mid(m.getBoundingClientRect()), clipped: h.querySelector('h2').getBoundingClientRect().top <= rb.top };
  })()`);
  const tabInToolbar = (h, what) => {
    near(h.tab.l, h.head.l, `${what}: the tab at the toolbar's left`);
    near(h.tab.t, h.head.t, `${what}: at its top`);
    near(h.tab.b, h.head.b - 1, `${what}: down to the hairline`);
    near(h.wordsMid, h.titleMid, `${what}: its words level with the title`, 1);
    near(h.titleMid, h.moreMid, `${what}: the title on the row's line`, 1);
    near(h.wordsL, h.head.l + 12, `${what}: its words at the toolbar's padding`);
  };
  try {
    // a header with no project: its words where they were
    await ctx.waitFor(`document.querySelector('#shead h2') && !document.querySelector('#shead h2 .repo')`, { what: 'the empty header' });
    out.home = await ctx.evaluate(`(() => { const h = document.querySelector('#shead'), g = document.createRange(); g.selectNodeContents(h.querySelector('h2')); return { head: h.getBoundingClientRect().left, words: g.getBoundingClientRect().left }; })()`);
    near(out.home.words, out.home.head + 12, 'Home’s words at the toolbar’s padding');

    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd: join(root, 'live-repo'), title: 'Live elsewhere', prompt: 'hi', reply: 'Hello.', at: new Date(now - 60_000), live: { pid: sleeper.pid, startedAt: now - 3600_000 } },
      { cwd: join(root, 'moved'), title: 'A PR at your move', prompt: 'look at https://github.com/acme/moved/pull/12', reply: 'On https://github.com/acme/moved/pull/12 now.', at: new Date(now - 120_000) },
      { cwd: join(root, 'old-repo'), title: 'From another day', prompt: 'hi', reply: 'Hello.', at: new Date(now - 3 * 86400_000 / 2) },
    ]);
    const [live, moved, old] = chats;
    await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${moved.id}"] .tmx .mxs') && document.querySelector('#slist > .card[data-id="${moved.id}"] .ymove') && document.querySelector('#slist > .card[data-id="${live.id}"] .chip.elsewhere') && document.querySelector('#slist > .card[data-id="${old.id}"]')`, { what: 'the rows' });
    await ctx.settle();

    // the row's tab
    const L = out.live = await read(live.id), M = out.moved = await read(moved.id);
    for (const [what, c] of [['live', L], ['with a PR', M]]) {
      ctx.assert.ok(c.hastab, `${what}: the top row knows`);
      near(c.tab.l, c.card.l, `${what}: the tab at the row's left`);
      near(c.tab.t, c.card.t, `${what}: at its top`);
      ctx.assert.equal(c.tab.h, 26, `${what}: its height`);
      ctx.assert.equal(c.tab.round, '7px 0px 8px', `${what}: the row's corner, then its free one`);
      near(c.tabWords, c.titleWords, `${what}: its words on the title's edge`);
    }
    ctx.assert.equal(L.card.h, 79, 'one height at same height');
    ctx.assert.equal(M.card.h, 79, 'a move line in the place it holds');
    near(M.tmx.mid, M.tab.mid, 'the PRs on the tab’s line');
    near(L.where.mid, L.tab.mid, 'the marks on the tab’s line');

    // the right edge at rest, and under the pointer
    const R = L.card.r - 12;
    ctx.assert.deepEqual([L.time, L.act.w], [null, 0], 'the age and the ✓ keep no room at rest');
    near(L.where.r, R, '>_ on the right edge');
    near(M.lastSquare, R, 'the last PR on the right edge');
    await over(L.card);
    const LH = out.liveHover = await read(live.id);
    ctx.assert.equal(LH.act.w, 22, 'the ✓ comes');
    near(LH.act.r, R, 'on the right edge');
    near(LH.where.r, R - 22 - 7, '>_ pushed left of it');
    ctx.assert.ok(LH.time, 'the age comes');
    near(LH.trowEnd, R, 'the title’s row still ends on the right edge');
    ctx.assert.equal(LH.card.h, L.card.h, 'the row keeps its height');
    await over(M.card);
    const MH = await read(moved.id);
    near(MH.lastSquare, R, 'the PRs stay put: the ✓ comes left of them');
    await away();
    await ctx.evaluate(`document.querySelector('#slist > .card[data-id="${live.id}"] .act').focus({ focusVisible: true })`);
    ctx.assert.equal((await read(live.id)).act.w, 22, 'the ✓ in the keys’ way');
    await ctx.evaluate(`document.activeElement.blur()`);

    // no process: its row dimmed, its tab whole; open, nothing dimmed
    ctx.assert.deepEqual([M.card.op, M.tab.op, M.trow.op], ['1', '1', '0.8'], 'a chat with no process: the row dimmed, not its tab');
    ctx.assert.deepEqual([L.card.op, L.trow.op], ['1', '1'], 'a live one not at all');
    ctx.assert.equal(M.ymove.round, '6px', 'the tag the chips’ corner');
    ctx.assert.equal(L.where.round, '6px', 'a chip that corner');

    // the lane heads and the day lines on the rows' edges
    out.edges = await ctx.evaluate(`(() => { const lane = document.querySelector('.gsep.lane.ready'), text = e => { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect(); }; const day = document.querySelector('.gsep.day b');
      return { mark: lane.querySelector('i').getBoundingClientRect().left, name: text(lane.querySelector('.ln')).left, chevron: lane.querySelector('.lc').getBoundingClientRect().right, day: day && text(day).left }; })()`);
    near(out.edges.mark, L.titleWords, 'the lane’s mark on the title’s edge');
    near(out.edges.name, L.titleWords + 18, 'its name on an agent row’s words');
    near(out.edges.chevron, R, 'its chevron on the right edge');
    near(out.edges.day, L.titleWords, 'a day line on the title’s edge');
    await ctx.shot('project-tab-dark');

    // the toolbar's: one shape, whatever lowers it
    await ctx.openChat(moved.id);
    await ctx.settle();
    out.head = await head();
    ctx.assert.equal(out.head.round, '0px 0px 8px', 'the sheet’s corner, then its free one');
    tabInToolbar(out.head, 'the toolbar');
    const O = await read(moved.id);
    ctx.assert.deepEqual([O.card.op, O.trow.op], ['1', '1'], 'open, nothing dimmed');
    await ctx.evaluate(`document.querySelector('#shead').style.setProperty('--hdrop', '8px')`);
    tabInToolbar(out.dropped = await head(), 'lowered under the housing');
    await ctx.evaluate(`document.querySelector('#shead').style.removeProperty('--hdrop')`);
    await ctx.evaluate(`window.peixFill(true, { top: 32, left: 500, right: 700 })`);
    await ctx.sleep(250);
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#chat').classList.contains('npad')`), true, 'the header too far left for a title: below the strip');
    tabInToolbar(out.npad = await head(), 'below the strip');
    await ctx.evaluate(`window.peixFill(false, null)`);
    await ctx.sleep(250);

    // a title that wraps keeps its room: the pointer never shortens a row under itself
    await ctx.evaluate(`document.querySelector('#cardsEven').click()`); await ctx.settle();
    const U = await read(live.id);
    ctx.assert.equal(U.titleRoom, 28, 'at rest, the age’s room');
    await over(U.card);
    const UH = await read(live.id);
    near(UH.title.w, U.title.w, 'under the pointer the age has it: the same lines', 1);
    await away();
    await ctx.evaluate(`document.querySelector('#cardsEven').click()`); await ctx.settle();

    // one project in view: no tab, the row's 18 px
    await ctx.evaluate(`document.querySelector('#shead .repo').click()`);
    await ctx.waitFor(`!document.querySelector('#slist > .card[data-id="${moved.id}"] .top .repo')`, { what: 'the project in view' });
    await ctx.settle();
    const P = out.picked = await read(moved.id);
    ctx.assert.deepEqual([P.hastab, P.top.h, P.card.h], [false, 18, 74], 'no tab: the row as it was');
    await ctx.evaluate(`document.querySelector('#shead .repo').click()`);
    await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${moved.id}"] .top .repo')`, { what: 'every project' });

    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await ctx.sleep(300); await ctx.settle();
    await ctx.shot('project-tab-light');
    return out;
  } finally { sleeper.kill(); }
}
