// Top priority (2026-11-24, round XXX). What this checks, on compact cards at same height (the owner's board): the
// section off until switched on, then above every lane, empty a dashed line to drop on; a right-click, ⌥⌘I and a drag
// put chats in it, numbered; ⌥⌘⇧↑ and the menu's rows move one, each move said to a reader; a reply in one moves nothing
// in it, while the same reply outside it climbs its lane; a drag between two of its cards places, onto a card's middle it
// folds, as anywhere; a chat ticked in it stays, dimmed, and Clear done takes it out; ⌥⌘U is the section alone under a tab
// that says so, Show all the way back; off and on again it comes back as it was, and a reload keeps it.
import { appendFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeFixture, replyLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'compact', cardsEven: true, lanesShut: ['done', 'idle', 'snoozed'] } };

const SETUP = `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };`;

export default async function (ctx) {
  const out = {}, cwd = realpathSync(tmpdir()), ago = m => new Date(Date.now() - m * 60_000);
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: SETUP });
  await ctx.reload();
  makeFixture(ctx.fixture.dir, [['Release notes for 4.2', 30], ['Checkout copy for 4.2', 45], ['Cache the search suggestions', 60]]
    .map(([title, m]) => ({ cwd, title, prompt: `Work on: ${title}`, reply: 'Done, have a look.', at: ago(m) })));
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 5`, { what: 'the five cards', timeout: 15000 });
  const id = title => ctx.evaluate(`window.peix.sessions().find(s => s.title === ${JSON.stringify(title)})?.id`);
  const notes = await id('Release notes for 4.2'), copy = await id('Checkout copy for 4.2'), cache = await id('Cache the search suggestions');
  const card = cid => `document.querySelector('#slist > .card[data-id="${cid}"]')`;
  const sec = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#slist > .card.inprio')].map(c => [c.dataset.id, c.querySelector('.pn')?.textContent]))`).then(JSON.parse);
  const order = () => ctx.evaluate(`JSON.stringify(window.peix.priority())`).then(JSON.parse);
  const server = async () => (await ctx.server.api('api/sessions')).body.priority;
  const rightClick = cid => ctx.evaluate(`(c => c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: c.getBoundingClientRect().x + 30, clientY: c.getBoundingClientRect().y + 10 })))(${card(cid)})`);
  const row = re => `[...document.querySelectorAll('#ctxm button')].find(b => ${re}.test(b.textContent))`;
  const menuRow = async (cid, re) => { await rightClick(cid); await ctx.waitFor(row(re), { what: `the row ${re}` }); await ctx.evaluate(`${row(re)}.click()`); };
  const shiftKey = code => ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { code: ${JSON.stringify(code)}, key: 'x', metaKey: true, altKey: true, shiftKey: true, bubbles: true, cancelable: true }))`);
  const until = async (fn, want, what) => { for (let i = 0; i < 40; i++) { if (JSON.stringify(await fn()) === JSON.stringify(want)) return; await ctx.sleep(100); } ctx.assert.deepEqual(await fn(), want, what); };

  // ---- off until switched on: today's list, and no row in a card's menu ----
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#slist > .gsep.lane.prio')`), false, 'no section while it is off');
  await rightClick(notes); await ctx.waitFor(row('/^Open$/'), { what: "a card's menu" });
  ctx.assert.equal(await ctx.evaluate(`!!${row('/Top priority/')}`), false, 'no Top priority row while it is off');
  await ctx.evaluate(`document.querySelector('#ctxm').close()`);

  // ---- switched on: the section first, empty, a place to drop ----
  await ctx.evaluate(`document.querySelector('#prioOn').click()`); await ctx.settle();
  out.empty = await ctx.evaluate(`(l => ({ first: l.firstElementChild?.matches('.gsep.lane.prio'), drop: l.querySelector('.gsep.pempty')?.textContent }))(document.querySelector('#slist'))`);
  ctx.assert.deepEqual(out.empty, { first: true, drop: 'Drag a card here, or right-click one › Top priority' }, 'the section heads the list, empty');
  await ctx.shot('empty', { x: 0, y: 0, width: 460, height: 420 });

  // ---- in: a right-click, then ⌥⌘I on the open chat ----
  await menuRow(notes, '/^Top priority/');
  await until(order, [notes], 'the right-click put it in');
  await ctx.openChat(copy);
  await ctx.key('KeyI');
  await until(order, [notes, copy], '⌥⌘I put the open chat in, at the end');
  await until(sec, [[notes, '1'], [copy, '2']], 'numbered, in that order, in the section');
  ctx.assert.deepEqual(await server(), [notes, copy], 'the server keeps the order');

  // ---- ⌥⌘⇧↑ moves the open chat's card up, said to a reader ----
  await shiftKey('ArrowUp');
  await until(order, [copy, notes], 'a place up');
  out.said = await ctx.evaluate(`document.querySelector('#prioSay').textContent`);
  ctx.assert.equal(out.said, 'Checkout copy for 4.2, 1 of 2 in Top priority', 'the move said');

  // ---- a reply moves nothing in it; the same reply outside climbs its lane ----
  const land = (cid, file) => appendFileSync(file, replyLines({ id: cid, cwd, text: 'More done.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
  const file = cid => ctx.evaluate(`window.peix.session(${JSON.stringify(cid)}).file`);
  land(notes, await file(notes));
  await ctx.waitFor(`window.peix.session(${JSON.stringify(notes)}).lastReplyAt > new Date(Date.now() - 10000).toISOString()`, { what: 'the reply in the section heard' });
  await ctx.settle();
  ctx.assert.deepEqual((await sec()).map(x => x[0]), [copy, notes], 'its slot holds');
  land(cache, await file(cache));
  await ctx.waitFor(`${card(cache)} && [...document.querySelectorAll('#slist > .card:not(.inprio)')][0] === ${card(cache)}`, { what: 'the reply outside it at the top of its lane' });

  // ---- a drag: between two of its cards places; onto one's middle is Fold into… ----
  const rect = cid => ctx.evaluate(`JSON.stringify(${card(cid)}.getBoundingClientRect())`).then(JSON.parse);
  const mouse = (type, x, y, buttons = 1) => ctx.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
  const lift = async cid => { const r = await rect(cid); await mouse('mousePressed', r.x + r.width / 2, r.y + 6); await mouse('mouseMoved', r.x + r.width / 2, r.y + 20); await ctx.sleep(50); };
  const ghost = () => ctx.evaluate(`document.querySelector('#cdghost .cdsay')?.textContent`);
  await lift(cache);
  const [r1, r2] = [await rect(copy), await rect(notes)];
  await mouse('mouseMoved', r1.x + r1.width / 2, r1.y + r1.height / 2); await ctx.sleep(80);
  out.onto = await ghost();
  ctx.assert.equal(out.onto, `Fold into “Checkout copy for 4.2”`, 'the middle of a card folds, as anywhere');
  await mouse('mouseMoved', r1.x + r1.width / 2, (r1.bottom + r2.top) / 2); await ctx.sleep(80);
  out.between = await ghost();
  ctx.assert.equal(out.between, 'Into Top priority, 2nd', 'between two cards places it');
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#cdgap')`), true, 'a line says where');
  await ctx.shot('drag-between', { x: 0, y: 0, width: 460, height: 460 });
  await mouse('mouseReleased', r1.x + r1.width / 2, (r1.bottom + r2.top) / 2, 0);
  await until(order, [copy, cache, notes], 'let go between them, it is there');
  await ctx.waitFor(`!document.querySelector('#cdgap, #cdghost')`, { what: 'the line and the ghost gone' });

  // ---- the menu's rows: to the bottom, up ----
  await menuRow(copy, '/^To the bottom/');
  await until(order, [cache, notes, copy], 'to the bottom');
  await menuRow(copy, '/^Move up/');
  await until(order, [cache, copy, notes], 'a place up');

  // ---- ticked in it: it stays, dimmed, the head counts it, Clear done takes it out ----
  await ctx.server.post(`api/sessions/${notes}/done`, { done: true });
  await ctx.waitFor(`${card(notes)}?.classList.contains('pdone')`, { what: 'the ticked card dimmed in its slot' });
  ctx.assert.deepEqual((await sec()).map(x => x[0]), [cache, copy, notes], 'it keeps its slot');
  out.tally = await ctx.evaluate(`document.querySelector('#slist > .gsep.lane.prio').textContent.replace(/\\s+/g, ' ').trim()`);
  ctx.assert.match(out.tally, /1 of 3 done Clear done/, 'the head says so');
  await ctx.shot('done', { x: 0, y: 0, width: 460, height: 460 });
  await ctx.evaluate(`document.querySelector('#slist > .gsep.lane.prio .clr').click()`);
  await until(order, [cache, copy], 'Clear done took it out');

  // ---- same height: a card in the section is as tall as one outside ----
  out.heights = await ctx.evaluate(`[...new Set([...document.querySelectorAll('#slist > .card:not(.asking)')].map(c => Math.round(c.getBoundingClientRect().height)))]`);
  ctx.assert.equal(out.heights.length, 1, `every card one height: ${out.heights}`);

  // ---- ⌥⌘U: the section alone, its tab, Show all back ----
  await ctx.key('KeyU'); await ctx.settle();
  out.focus = await ctx.evaluate(`({ cards: [...document.querySelectorAll('#slist > .card')].map(c => c.dataset.id), tab: !document.querySelector('#stitle').hidden && document.querySelector('#stitle .t').textContent, n: document.querySelector('#stitle .cn').textContent.trim(), funnel: document.querySelector('#fBtn .fl').textContent })`);
  ctx.assert.deepEqual(out.focus.cards, [cache, copy], 'the section alone');
  ctx.assert.equal(out.focus.tab, 'Top priority', 'the tab says so');
  ctx.assert.match(out.focus.n, /^2 of \d+$/, 'how many of the chats not done');
  ctx.assert.equal(out.focus.funnel, 'Top priority only · 2', 'the funnel says so too');
  await ctx.shot('focus', { x: 0, y: 0, width: 460, height: 360 });
  // the rest is quiet as when fishing, but a question still rings; the section's own alerts as ever
  const posted = async (sid, kind) => { await ctx.evaluate(`window.peix.alert({ kind: '${kind}', sessionId: ${JSON.stringify(sid)}, project: 'x', title: 't', snippet: '' })`); return ctx.evaluate(`(m => m && { quiet: m.quiet, kind: m.kind })(window.__posts.filter(m => m.type === 'alert').pop())`); };
  const plain = ctx.fixture.chats[1].id;
  out.hush = { out: await posted(plain, 'reply'), ask: await posted(plain, 'needs-input'), in: await posted(cache, 'reply') };
  ctx.assert.deepEqual(out.hush, { out: { quiet: true, kind: 'reply' }, ask: { quiet: false, kind: 'needs-input' }, in: { quiet: false, kind: 'reply' } }, 'out of the section held, its questions and the section heard');
  await ctx.evaluate(`document.querySelector('#stitle .sx').click()`); await ctx.settle();
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#slist > .card').length >= 4 && document.querySelector('#stitle').hidden`), true, 'Show all: every chat again');

  // ---- off and on again as it was; a reload keeps it ----
  await ctx.evaluate(`document.querySelector('#prioOn').click()`); await ctx.settle();
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#slist > .card.inprio').length`), 0, 'off: no section');
  await ctx.evaluate(`document.querySelector('#prioOn').click()`); await ctx.settle();
  await until(async () => (await sec()).map(x => x[0]), [cache, copy], 'on again, as it was');
  await ctx.reload();
  await ctx.waitFor(`document.querySelectorAll('#slist > .card.inprio').length === 2`, { what: 'the section after a reload' });
  ctx.assert.deepEqual((await sec()).map(x => x[0]), [cache, copy], 'a reload keeps it');
  await ctx.shot('kept', { x: 0, y: 0, width: 460, height: 460 });

  // ---- snoozed, a chat keeps its slot out of sight, the head saying so; awake, it is back in it ----
  await ctx.server.post(`api/sessions/${cache}/snooze`, { until: new Date(Date.now() + 3_600_000).toISOString() });
  await until(async () => (await sec()).map(x => x[0]), [copy], 'snoozed, out of sight');
  out.zz = await ctx.evaluate(`document.querySelector('#slist > .gsep.lane.prio').textContent.replace(/\\s+/g, ' ').trim()`);
  ctx.assert.match(out.zz, /\+1 snoozed/, 'the head says so');
  await ctx.server.post(`api/sessions/${cache}/snooze`, { undo: true });
  await until(async () => (await sec()).map(x => x[0]), [cache, copy], 'awake, back in its slot');
  return out;
}
