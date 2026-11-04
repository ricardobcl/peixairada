// A project in view is unmistakable, and easy to leave (2026-11-04, round XXV). What this checks: nothing at all on ALL; on a
// project the list's own tab, level with the chat's toolbar and on the cards' edges, says its name, how many of how many and
// Show all, the cards sliding by its height; a question elsewhere is counted on the way out, and a click goes to it; narrow,
// the count gives way first and a long name fades, Show all whole; the list's ground a tint of the project, and of nothing else;
// the toolbar's tab solid with the funnel while on, a named project's too; the list ends on what is hidden; ⌥⌘P ⌥⌘P lets go and
// comes back, a card's menu too; a chat from elsewhere lets it go; its tab flies, and waves when left on; at the notch it stays level with the toolbar.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'medium', cardsSnipOne: true, lanesShut: [] } };

export default async function (ctx) {
  const out = {}, now = Date.now(), root = realpathSync(tmpDir('peix-filter-')), sleeper = spawn('sleep', ['300'], { stdio: 'ignore' });
  const LONG = 'a-very-long-project-name-that-goes-on-and-on-and-on';
  const near = (a, b, what, by = 1.5) => ctx.assert.ok(Math.abs(a - b) <= by, `${what}: ${a} against ${b}`);
  const cue = () => ctx.evaluate(`(() => { const c = document.querySelector('#stitle'); if (c.hidden) return null;
    const box = e => { if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, h: b.height, w: b.width }; };
    const words = e => { const g = document.createRange(); g.selectNodeContents(e); return box(g); };
    const n = c.querySelector('.t .n');
    return { name: n.textContent, count: c.querySelector('.cn').textContent, shown: !!box(c.querySelector('.cn')), way: c.querySelector('.out').textContent, box: box(c), tab: box(c.querySelector('.t')), words: words(n), wholeName: n.scrollWidth <= n.clientWidth, sx: box(c.querySelector('.sx')), out: box(c.querySelector('.out')), fits: c.scrollWidth <= c.clientWidth };
  })()`);
  const head = () => ctx.evaluate(`(() => { const h = document.querySelector('#shead').getBoundingClientRect(), t = document.createRange(); t.selectNodeContents(document.querySelector('#shead h2 .t')); const r = t.getBoundingClientRect(); return { t: h.top, b: h.bottom, mid: (r.top + r.bottom) / 2 }; })()`);
  const pick = async name => { await ctx.key('KeyP'); await ctx.sleep(150); await ctx.evaluate(`(() => { const q = document.querySelector('#pickq'); q.value = ${JSON.stringify(name)}; q.dispatchEvent(new Event('input')); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); await ctx.settle(); };
  const project = () => ctx.evaluate(`window.peix.prefs().project.split('/').pop()`);
  const showAll = async () => { await ctx.evaluate(`document.querySelector('#stitle .sx').click()`); await ctx.settle(); };
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd: join(root, 'shop'), title: 'First in the shop', prompt: 'hi', reply: 'Hello.', at: new Date(now - 60_000) },
      { cwd: join(root, 'shop'), title: 'Second in the shop', prompt: 'hi', reply: 'Hello.', at: new Date(now - 120_000) },
      { cwd: join(root, 'other'), title: 'Asking elsewhere', prompt: 'go', reply: 'one question', at: new Date(now - 180_000), live: { pid: sleeper.pid, startedAt: now - 3600_000, status: 'waiting', waitingFor: 'input needed', statusAt: now - 180_000 } },
      { cwd: join(root, LONG), title: 'Far along', prompt: 'hi', reply: 'Hello.', at: new Date(now - 240_000) },
    ]);
    const [first, , asker] = chats;
    await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projects: { shop: { color: '#3b7ddd' }, other: { color: '#2e9e6a' } } }) });
    await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${asker.id}"].asking') && document.querySelector('#slist > .card[data-id="${first.id}"]')`, { what: 'the rows' });
    await ctx.openChat(first.id); await ctx.settle();

    // nothing on ALL
    ctx.assert.equal(await cue(), null, 'ALL says nothing');
    const notDone = await ctx.evaluate(`window.peix.sessions().filter(s => !s.done).length`);

    // the list's own tab, level with the toolbar, on the cards' edges
    await pick('shop');
    const c = out.cue = await cue(), h = await head();
    ctx.assert.deepEqual([c.name, c.count, c.way], ['shop', `2 of ${notDone}`, '1 asking·Show all'], 'its name, how many of how many, and the way out in words');
    near(c.box.t, h.t, 'level with the toolbar: its top'); near(c.box.b, h.b, 'and its foot');
    near((c.words.t + c.words.b) / 2, h.mid, 'its words level with the title');
    const row = await ctx.evaluate(`(() => { const c = document.querySelector('#slist > .card'), b = c.getBoundingClientRect(), g = document.createRange(); g.selectNodeContents(c.querySelector('.title')); return { l: b.left, r: b.right, words: g.getBoundingClientRect().left }; })()`);
    near(c.tab.l, row.l, "the tab on the cards' left edge"); near(c.out.r, row.r, 'the way out on their right'); near(c.words.l, row.words, "its words on the title's edge");
    ctx.assert.ok(c.sx.h >= 24 && c.sx.w >= 24, `the way out a target of 24 px at least: ${c.sx.w} × ${c.sx.h}`);
    ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#slist > .gsep.lane[data-away]')`), false, 'no line over the lanes: the count is on the way out');
    await ctx.shot('project-filter-light');

    // the list keeps the cue's row, the first card under it: the cards slide by its height
    await showAll();
    ctx.assert.equal(await cue(), null, 'Show all: nothing again');
    let n0 = (await ctx.peix('motion()')).length;
    await pick('other');
    out.slide = (await ctx.peix('motion()')).slice(n0).find(m => m.id === asker.id && m.kind === 'flip');
    ctx.assert.ok(out.slide && out.slide.dy <= -40, `the card on top slides down by the cue's height: ${JSON.stringify(out.slide)}`);
    ctx.assert.equal((await cue()).way, 'Show all', 'no question outside it: no count');
    await showAll();

    // a question elsewhere: the count goes to it
    await pick('shop');
    await ctx.evaluate(`document.querySelector('#stitle .ask').click()`);
    await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(asker.id)}`, { what: 'the question opened' });
    await ctx.settle();
    // …and a chat from another project lets the filter go: it never takes a value you did not give it, and ⌥⌘P ⌥⌘P brings it back
    ctx.assert.equal(await project(), 'all', 'opening a chat elsewhere lets go to ALL, the filter not moving to its folder');
    ctx.assert.equal(await cue(), null, 'and the cue leaves');
    ctx.assert.equal(await ctx.evaluate(`window.peix.prefs().lastProject.split('/').pop()`), 'shop', 'the project last in view is kept');

    // narrow: the count first, a long name fades, Show all whole
    await ctx.evaluate(`document.querySelector('#sessions').style.width = '300px'`);
    await pick(LONG);
    const w = out.narrow = await cue();
    ctx.assert.equal(w.shown, false, 'the count gives way first');
    ctx.assert.equal(w.wholeName, false, 'a long name ends in …');
    ctx.assert.ok(w.fits && w.sx.r <= w.box.r + .5, `Show all whole: ${JSON.stringify(w)}`);
    await showAll();
    await ctx.evaluate(`document.querySelector('#sessions').style.width = '417px'`);

    // the list's ground takes a tint of the project, the chat and the status bar as they were; no colour, no tint; ALL, none
    const grounds = () => ctx.evaluate(`({ list: getComputedStyle(document.querySelector('#sessions')).backgroundColor, bar: getComputedStyle(document.querySelector('#sbar')).backgroundColor, chat: getComputedStyle(document.querySelector('#chat')).backgroundColor, card: getComputedStyle(document.querySelector('#slist > .card:not(.active)') || document.body).backgroundColor })`);
    const plain = out.plain = await grounds();
    ctx.assert.equal(plain.list, plain.bar, 'on ALL the list is the frame');
    await pick('shop');
    const tinted = out.tinted = await grounds();
    ctx.assert.notEqual(tinted.list, plain.list, 'a project in view tints the list');
    ctx.assert.deepEqual([tinted.bar, tinted.chat], [plain.bar, plain.chat], 'the status bar and the chat as they were');
    ctx.assert.notEqual(tinted.card, plain.card, 'its cards are raised from that ground');
    await showAll();
    await pick(LONG);
    ctx.assert.equal((await grounds()).list, plain.list, 'no colour, no tint');
    await showAll();

    // the toolbar's tab says it: the funnel under the pointer, solid with the funnel kept while on, a click lets go; another
    // project in view says nothing there, and a click narrows to its own; a named project holding the chat is on too
    const tb = () => ctx.evaluate(`(r => { const st = getComputedStyle(r), f = getComputedStyle(r.querySelector('.fun')); return { on: r.classList.contains('on'), ink: st.color, ground: st.backgroundColor, fun: f.opacity, line: st.textDecorationLine }; })(document.querySelector('#shead .repo'))`);
    await ctx.openChat(first.id); await ctx.settle();
    const off = out.tabOff = await tb();
    ctx.assert.deepEqual([off.on, off.fun], [false, '0'], 'off: no funnel at rest');
    await ctx.evaluate(`document.querySelector('#shead .repo').click()`);
    await ctx.settle();
    const on = out.tabOn = await tb();
    ctx.assert.deepEqual([on.on, on.ink, on.fun, on.line], [true, 'rgb(255, 255, 255)', '1', 'none'], 'on: solid, its words white, the funnel kept, no underline');
    ctx.assert.notEqual(on.ground, off.ground, 'and its ground changed');
    ctx.assert.equal(await project(), 'shop', 'the click narrowed to it');
    await ctx.evaluate(`document.querySelector('#shead .repo').click()`);
    await ctx.settle();
    ctx.assert.equal(await project(), 'all', 'and again lets go');
    await pick('other');
    ctx.assert.equal((await tb()).on, false, 'another project in view: nothing here');
    await ctx.evaluate(`document.querySelector('#shead .repo').click()`);
    await ctx.settle();
    ctx.assert.equal(await project(), 'shop', 'a click narrows to the chat\'s own');
    await showAll();
    await ctx.server.api('api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'web set', cwds: [join(root, 'shop'), join(root, 'other')] }) });
    await ctx.waitFor(`(() => true)()`, { what: 'the set' }); await ctx.sleep(300);
    await pick('web set');
    ctx.assert.equal((await tb()).on, true, 'a named project holding the chat is on');
    await ctx.evaluate(`document.querySelector('#shead .repo').click()`);
    await ctx.settle();
    ctx.assert.equal(await project(), 'all', 'and a click lets go of it');

    // the list's end says what is hidden, a square a project, and a click lets go; not on ALL, nor under a query
    await pick('shop');
    const others = () => ctx.evaluate(`(e => e && { text: e.querySelector('.ln').textContent, squares: e.querySelectorAll('.sqs i').length, last: e === document.querySelector('#slist').lastElementChild })(document.querySelector('#slist > .gsep.others'))`);
    const rest = notDone - 2, kinds = await ctx.evaluate(`new Set(window.peix.sessions().filter(s => !s.done && !s.cwd?.endsWith('/shop')).map(s => s.project)).size`);
    ctx.assert.deepEqual(out.others = await others(), { text: `${rest} more in other projects`, squares: kinds, last: true }, 'the list ends on what is hidden');
    await ctx.evaluate(`document.querySelector('#q').value = 'first'; document.querySelector('#q').dispatchEvent(new Event('input'))`); await ctx.settle();
    ctx.assert.equal(await others(), null, 'a query is about something else');
    await ctx.evaluate(`document.querySelector('#q').value = ''; document.querySelector('#q').dispatchEvent(new Event('input'))`); await ctx.settle();
    await ctx.evaluate(`document.querySelector('#slist > .gsep.others').click()`); await ctx.settle();
    ctx.assert.equal(await project(), 'all', 'a click is Show all');
    ctx.assert.equal(await others(), null, 'ALL hides nothing');

    // ⌥⌘P ⌥⌘P: on a project, ALL; on ALL, back to it; ⌥⌘P ⏎ still lands on ALL, and nothing to go back to is nothing
    await pick('shop');
    await ctx.key('KeyP'); await ctx.sleep(120); await ctx.key('KeyP'); await ctx.settle();
    ctx.assert.deepEqual([await project(), await ctx.evaluate(`document.querySelector('#pick').open`)], ['all', false], 'twice on a project: ALL, the picker gone');
    await ctx.key('KeyP'); await ctx.sleep(120); await ctx.key('KeyP'); await ctx.settle();
    ctx.assert.deepEqual([await project(), await ctx.evaluate(`document.querySelector('#pick').open`)], ['shop', false], 'twice on ALL: back to it');
    await ctx.key('KeyP'); await ctx.sleep(120);
    await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); await ctx.settle();
    ctx.assert.equal(await project(), 'all', '⌥⌘P ⏎ lands on ALL, whatever it was');

    // a card's menu narrows to its project, and lets go
    const right = id => ctx.evaluate(`(el => { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8 })); })(document.querySelector('#slist > .card[data-id="${id}"]'))`);
    const menuRow = t => ctx.evaluate(`(b => b ? (b.click(), 'pressed') : 'none')([...document.querySelectorAll('#ctxm button')].find(b => b.textContent.startsWith(${JSON.stringify(t)})))`);
    await right(first.id);
    ctx.assert.notEqual(await menuRow('Only shop'), 'none', 'the row names the project'); await ctx.settle();
    ctx.assert.equal(await project(), 'shop', 'it narrows to it');
    await right(first.id);
    ctx.assert.notEqual(await menuRow('Every project'), 'none', 'on a project the row lets go'); await ctx.settle();
    ctx.assert.equal(await project(), 'all', 'it lets go');

    // the tab flies up with the filter and back without it, by a stand-in that leaves nothing behind; switching projects does not
    await ctx.openChat(first.id); await ctx.settle();
    const cueMoves = async fn => { const n = (await ctx.peix('motion()')).length; await fn(); const stand = await ctx.evaluate(`!!document.querySelector('.tabfly')`), hidden = await ctx.evaluate(`document.querySelector('#stitle .t')?.style.visibility || ''`); await ctx.settle(); return { kinds: (await ctx.peix('motion()')).slice(n).filter(m => m.id === 'cue').map(m => m.kind), stand, hidden, left: await ctx.evaluate(`!!document.querySelector('.tabfly')`), after: await ctx.evaluate(`document.querySelector('#stitle .t')?.style.visibility || ''`) }; };
    ctx.assert.deepEqual(out.flyUp = await cueMoves(() => ctx.evaluate(`document.querySelector('#shead .repo').click()`)), { kinds: ['flyup'], stand: true, hidden: 'hidden', left: false, after: '' }, 'on: the open card\'s tab flies up, the cue\'s own hidden till it lands');
    ctx.assert.deepEqual((await cueMoves(async () => { await ctx.key('KeyP'); await ctx.sleep(120); await ctx.evaluate(`(() => { const q = document.querySelector('#pickq'); q.value = 'other'; q.dispatchEvent(new Event('input')); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); })).kinds, [], 'another project: the cue is there already, no flight');
    await ctx.evaluate(`document.querySelector('#shead .repo').click()`); await ctx.settle();
    ctx.assert.deepEqual(out.flyBack = await cueMoves(() => ctx.evaluate(`document.querySelector('#stitle .sx').click()`)), { kinds: ['flyback'], stand: true, hidden: '', left: false, after: '' }, 'Show all: it goes back down');

    // left on, it waves once on coming back from away, and on launch; not on a short look away, nor with nothing on
    await pick('shop');
    const waves = async fn => { const n = (await ctx.peix('motion()')).length; await fn(); await ctx.sleep(700); return (await ctx.peix('motion()')).slice(n).filter(m => m.kind === 'wave').length; };
    const OUT = await ctx.evaluate(`Date.now() - 3 * 3600_000`);
    ctx.assert.equal(await waves(() => ctx.evaluate(`window.peixFront(false, Date.now() - 1000); window.peixFront(true)`)), 0, 'a short look away: nothing');
    ctx.assert.equal(await waves(() => ctx.evaluate(`window.peixFront(false, ${OUT}); window.peixFront(true)`)), 1, 'back from away: it waves');
    await ctx.reload(); await ctx.sleep(900);
    ctx.assert.ok((await ctx.peix('motion()')).some(m => m.id === 'cue' && m.kind === 'wave'), 'and on launch');
    await ctx.settle(); await ctx.evaluate(`document.querySelector('#stitle .sx').click()`); await ctx.settle();
    ctx.assert.equal(await waves(() => ctx.evaluate(`window.peixFront(false, ${OUT}); window.peixFront(true)`)), 0, 'nothing on ALL');

    // at the notch: lowered with the toolbar, level with it; the list under the housing, under its strip
    await pick('shop');
    await ctx.evaluate(`window.peixFill(true, { top: 32, left: 500, right: 700 })`);
    await ctx.settle(); await ctx.sleep(200);
    const nc = await cue(), nh = await head();
    ctx.assert.ok(nh.b - nh.t > 60, `the toolbar lowered: ${JSON.stringify(nh)}`);
    near(nc.box.b, nh.b, 'at the notch, its foot the toolbar\'s'); near((nc.words.t + nc.words.b) / 2, nh.mid, 'its words level with the title', 2);
    await ctx.evaluate(`window.peixFill(true, { top: 32, left: 100, right: 300 })`);
    await ctx.settle(); await ctx.sleep(200);
    const nl = await cue();
    ctx.assert.ok(nl.box.t >= 32, `under the housing, under its strip: ${nl.box.t}`);
    await ctx.evaluate(`window.peixFill(false, null)`);
    await ctx.settle();
    return out;
  } finally { sleeper.kill(); }
}
