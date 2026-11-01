// A lane folds and opens in one motion (2026-11-01). Folding, each card had folded on its own, the day lines went at
// once, and the head — drawn as a new node, put after the folding cards — vanished from its place while they jumped
// up into it, then rode up under them; opening, the cards below slid down across the new ones from where they had
// been while the lines jumped; in the sidebar the list under a folded card overshot by 5 px a card and dropped back.
// What this checks, frame by frame (the moves paused right after the click and stepped through), in the sidebar (tiles
// too, until 2026-11-01): the head is the same node and never moves; folding, the lane's cards and day lines are one `.leaving`
// block under the head, each standing where it stood while the lane under it rises over them, and nothing jumps at
// either end; opening, the cards are the list's own at once (`#slist > .card`), each at its place, shown only down to
// the lane under them as it slides down from where it stood; nothing else in the list FLIPs; a click mid-fold or
// mid-opening takes the motion back from where it stands; a head stuck over its lane folds it with nothing in sight
// jumping; and under reduced motion it all happens at once. Shots: mid-fold and mid-opening.
import { realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { lanesShut: [] } };

const IDS = `['fold', 'enter', 'open', 'leave', 'flip']`;
// the click, and every move it started paused at its start (window.__held), the rest of the page's motion left be
const click = (ctx, lane) => ctx.evaluate(`(() => {
  const n0 = window.peix.motion().length, h = document.querySelector('#slist > .gsep.lane[data-lane="${lane}"]'); window.__head = h;
  h.click();
  window.__held = document.getAnimations().filter(a => ${IDS}.includes(a.id)); window.__held.forEach(a => a.pause());
  return { ids: window.__held.map(a => a.id), kinds: window.peix.motion().slice(n0).map(m => m.kind) };
})()`);
const at = (ctx, t) => ctx.evaluate(`window.__held.forEach(a => a.currentTime = ${t})`);
const run = ctx => ctx.evaluate(`window.__held.forEach(a => a.play())`);
// where things stand, in the list's own pixels: the lane's head, the next lane's head, the lane's cards by title (in
// the list or in a fold) with how much of each shows, and how the list's children run from the head
const look = (ctx, lane, next) => ctx.evaluate(`(() => {
  const l = document.querySelector('#slist'), lr = l.getBoundingClientRect(), y = r => Math.round((r.top - lr.top) * 10) / 10;
  // a length of the clip as the engine writes it — 12px, 100%, calc(100% - 12px) — in pixels of a box h tall
  const len = (t, h) => { let v = 0, sign = 1; for (const k of t.replace(/^calc\\((.*)\\)$/, '$1').split(/\\s+/)) { if (k === '-' || k === '+') { sign = k === '-' ? -1 : 1; continue; } v += sign * (k.endsWith('%') ? parseFloat(k) / 100 * h : parseFloat(k)); sign = 1; } return v; };
  const h = l.querySelector(':scope > .gsep.lane[data-lane="${lane}"]'), n = l.querySelector(':scope > .gsep.lane[data-lane="${next}"]');
  const kids = [...l.children], from = kids.indexOf(h), to = kids.indexOf(n);
  const mine = kids.slice(from + 1, to < 0 ? undefined : to);
  const cards = mine.flatMap(k => k.classList.contains('card') ? [k] : [...k.querySelectorAll('.card')]).map(c => {
    const r = c.getBoundingClientRect(), ins = /^inset\\((.*)\\)$/.exec(getComputedStyle(c).clipPath)?.[1].match(/calc\\([^)]*\\)|\\S+/g) || [];
    const cut = ins.length ? len(ins[ins.length > 2 ? 2 : 0], r.height) : 0, box = c.closest('.leaving')?.getBoundingClientRect();
    return { t: c.querySelector('.title').textContent, y: y(r), shows: Math.round(Math.max(0, Math.min(r.bottom - cut, box ? box.bottom : Infinity) - r.top) * 10) / 10, own: c.parentElement === l, id: c.dataset.id || null };
  });
  return { head: y(h.getBoundingClientRect()), same: h === window.__head, next: n ? y(n.getBoundingClientRect()) : null, order: mine.map(k => k.classList.contains('leaving') ? 'fold' : k.classList.contains('card') ? 'card' : k.classList.contains('day') ? 'day' : k.className),
    cards, counted: l.querySelectorAll(':scope > .card').length, foot: l.clientHeight, flips: document.getAnimations().filter(a => a.id === 'flip').length, scroll: l.scrollTop };
})()`);
const near = (a, b, d = 1) => Math.abs(a - b) <= d;
// the same place, or both past the list's foot: what is out of sight there moves at once (only the window's room slides)
const same = (a, b, foot) => near(a, b) || (a >= foot - 1 && b >= foot - 1);

export default async function (ctx) {
  const out = {}, now = Date.now(), cwd = realpathSync(tmpDir('peix-fold-'));
  const ago = m => new Date(now - m * 60_000), days = d => { const t = new Date(); t.setDate(t.getDate() - d); return t; };
  await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projects: { [basename(cwd)]: { color: '#3b82f6' } } }) });
  const ready = ['Product grid follows the dark theme', 'Node 22 across every service', 'Flaky test in the refunds suite', 'Rename the billing events', 'Pin the lockfile', 'Cache the exchange rates', 'Drop the legacy webhooks', 'Retry the payouts'];
  const { chats } = makeFixture(ctx.fixture.dir, [
    ...ready.map((title, k) => ({ cwd, title, prompt: `${title.toLowerCase()}, please`, reply: 'Done, the tests pass.', at: k < 4 ? ago(90 + k * 30) : days(1 + (k > 5)) })),
    ...['Old spike on the search index', 'The flags cleanup', 'A wiki page'].map((title, k) => ({ cwd, title, prompt: 'this', reply: 'done', at: days(8 + k) })),
  ]);
  await ctx.waitFor(`window.peix.sessions().filter(s => s.cwd === ${JSON.stringify(cwd)}).length === ${chats.length} && document.querySelector('#slist > .gsep.lane.idle')`, { what: 'the board' });
  await ctx.settle(); await ctx.waitFor(`!document.querySelector('.rn.rolling')`);
  const crop = () => ctx.evaluate(`(r => ({ x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 760), scale: 2 }))(document.querySelector('#sessions').getBoundingClientRect())`);
  const T = [0, 40, 80, 120, 160, 200];

  for (const layout of ['sidebar']) {
    const o = out[layout] = {};
    // ---- folding Ready: one block under a head that stays, the lane under it rising over the cards ----
    const open0 = await look(ctx, 'ready', 'idle');
    ctx.assert.equal(open0.cards.length, 10, `${layout}: Ready's ten cards`);
    ctx.assert.ok(open0.order.includes('day'), `${layout}: day lines in the lane: ${open0.order}`);
    o.fold = await click(ctx, 'ready');
    ctx.assert.deepEqual([...new Set(o.fold.ids)], ['fold'], `${layout}: folding is one move, the lane's: ${o.fold.ids}`);
    ctx.assert.deepEqual(o.fold.kinds.filter(k => k !== 'roll'), ['fold', ...Array(10).fill('leave')], `${layout}: the fold, and each card noted leaving: ${o.fold.kinds}`);
    o.foldFrames = [];
    for (const t of T) {
      await at(ctx, t); const f = await look(ctx, 'ready', 'idle'); o.foldFrames.push({ t, head: f.head, next: f.next });
      ctx.assert.equal(f.same, true, `${layout} fold @${t}: the head the same node`);
      ctx.assert.equal(f.head, open0.head, `${layout} fold @${t}: the head where it stood`);
      ctx.assert.deepEqual(f.order, ['fold'], `${layout} fold @${t}: under the head one block, the cards and day lines in it: ${f.order}`);
      ctx.assert.equal(f.counted, 3, `${layout} fold @${t}: the folding cards not the list's`);
      ctx.assert.equal(f.flips, 0, `${layout} fold @${t}: nothing else slides`);
      f.cards.forEach((c, i) => {
        ctx.assert.ok(near(c.y, open0.cards[i].y, .5) && c.t === open0.cards[i].t && !c.own && !c.id, `${layout} fold @${t}: ${c.t} stands where it stood, out of the list's count: ${JSON.stringify([c, open0.cards[i]])}`);
        ctx.assert.ok(!c.shows || c.y + c.shows <= f.next + .5, `${layout} fold @${t}: ${c.t} shows only above the lane rising over it: ${JSON.stringify(c)}, next ${f.next}`);
      });
      if (t === 0) ctx.assert.ok(same(f.next, open0.next, f.foot), `${layout} fold @0: Idle's head where it was: ${f.next} vs ${open0.next}`);
      if (t === 80) await ctx.shot(`${layout}-fold`, await crop());
    }
    for (let i = 1; i < o.foldFrames.length; i++) ctx.assert.ok(o.foldFrames[i].next < o.foldFrames[i - 1].next, `${layout}: Idle's head rises all the way: ${JSON.stringify(o.foldFrames)}`);
    await at(ctx, 219.9); const end = await look(ctx, 'ready', 'idle');
    await run(ctx); await ctx.waitFor(`!document.querySelector('#slist > .leaving')`, { what: 'the fold done' }); await ctx.settle();
    const shut = await look(ctx, 'ready', 'idle');
    ctx.assert.ok(near(end.next, shut.next), `${layout}: no jump as the fold ends: ${end.next} → ${shut.next}`);
    ctx.assert.deepEqual([shut.same, shut.head, shut.order, shut.counted], [true, open0.head, [], 3], `${layout}: folded, the head kept`);
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#slist > .gsep.lane.ready').getAttribute('aria-expanded')`), 'false');

    // ---- opening it: the cards in place and the list's at once, the lane under them sliding down off them ----
    o.open = await click(ctx, 'ready');
    ctx.assert.deepEqual([...new Set(o.open.ids)].sort(), ['enter', 'open'], `${layout}: opening, the cards uncovered and the lane under them sliding: ${o.open.ids}`);
    o.openFrames = [];
    for (const t of T) {
      await at(ctx, t); const f = await look(ctx, 'ready', 'idle'); o.openFrames.push({ t, next: f.next });
      ctx.assert.deepEqual([f.same, f.head, f.counted, f.flips], [true, open0.head, 13, 0], `${layout} open @${t}: the head kept where it stood, the cards the list's, nothing sliding across them`);
      ctx.assert.deepEqual(f.order, open0.order, `${layout} open @${t}: the lane as it was drawn`);
      f.cards.forEach((c, i) => {
        ctx.assert.ok(near(c.y, open0.cards[i].y, .5) && c.own && c.id, `${layout} open @${t}: ${c.t} at its place: ${JSON.stringify([c, open0.cards[i]])}`);
        ctx.assert.ok(!c.shows || c.y + c.shows <= f.next + .5, `${layout} open @${t}: ${c.t} shows only above the lane sliding off it: ${JSON.stringify(c)}, next ${f.next}`);
      });
      if (t === 0) ctx.assert.ok(near(f.next, shut.next) && f.cards.every(c => c.shows === 0), `${layout} open @0: Idle's head where it was, nothing of Ready shown yet: ${f.next} vs ${shut.next}`);
      if (t === 80) await ctx.shot(`${layout}-open`, await crop());
    }
    for (let i = 1; i < o.openFrames.length; i++) ctx.assert.ok(o.openFrames[i].next > o.openFrames[i - 1].next, `${layout}: Idle's head slides down all the way: ${JSON.stringify(o.openFrames)}`);
    await at(ctx, 219.9); const end2 = await look(ctx, 'ready', 'idle');
    await run(ctx); await ctx.settle();
    const back = await look(ctx, 'ready', 'idle');
    ctx.assert.ok(same(end2.next, back.next, back.foot) && near(back.next, open0.next), `${layout}: no jump as it ends, Idle's head back where it was: ${end2.next} → ${back.next} (${open0.next})`);
    ctx.assert.ok(back.cards.every((c, i) => near(c.shows, open0.cards[i].shows)), `${layout}: every card whole again`);

    // ---- a click mid-way takes the motion back from where it stands ----
    await click(ctx, 'ready'); await at(ctx, 90); const mid = await look(ctx, 'ready', 'idle');
    const re = await click(ctx, 'ready'); const turned = await look(ctx, 'ready', 'idle');
    ctx.assert.ok(same(mid.next, turned.next, mid.foot), `${layout}: opened mid-fold, Idle's head goes on from where it was: ${mid.next} → ${turned.next}`);
    ctx.assert.ok(re.ids.includes('open') && !turned.order.includes('fold'), `${layout}: the fold under way let go: ${turned.order}`);
    await at(ctx, 90); const mid2 = await look(ctx, 'ready', 'idle');
    await click(ctx, 'ready'); const turned2 = await look(ctx, 'ready', 'idle');
    ctx.assert.ok(same(mid2.next, turned2.next, mid2.foot), `${layout}: folded mid-opening, Idle's head goes on from where it was: ${mid2.next} → ${turned2.next}`);
    ctx.assert.ok(turned2.cards.every((c, i) => near(c.y, open0.cards[i].y, .5)), `${layout}: …and the cards from where they stood`);
    await run(ctx); await ctx.waitFor(`!document.querySelector('#slist > .leaving')`, { what: 'folded again' }); await ctx.settle();
    await click(ctx, 'ready'); await run(ctx); await ctx.settle();
    ctx.assert.equal((await look(ctx, 'ready', 'idle')).cards.length, 10, `${layout}: open again`);
  }

  // ---- a head stuck over its lane (the sidebar's): what shows under it stays put as the fold starts ----
  await ctx.evaluate(`(l => { l.scrollTop = 0; l.scrollTop = l.querySelector(':scope > .gsep.lane.ready').offsetTop + 200; })(document.querySelector('#slist'))`);
  await ctx.sleep(250); await ctx.settle();
  const before = await look(ctx, 'ready', 'idle');
  const shown = before.cards.filter(c => c.y >= 30 && c.y < 600);
  ctx.assert.ok(before.scroll > 0 && near(before.head, 0) && shown.length >= 2, `the head stuck over its cards: ${JSON.stringify(before)}`);
  await click(ctx, 'ready');
  const stuck = await look(ctx, 'ready', 'idle');
  ctx.assert.ok(near(stuck.head, 0), `the head still at the top: ${stuck.head}`);
  for (const c of shown) { const now = stuck.cards.find(x => x.t === c.t); ctx.assert.ok(now && near(now.y, c.y), `${c.t} where it showed: ${JSON.stringify([c, now])}`); }
  await run(ctx); await ctx.waitFor(`!document.querySelector('#slist > .leaving')`, { what: 'the stuck lane folded' }); await ctx.settle();
  out.stuck = await ctx.evaluate(`(l => { const r = l.querySelector(':scope > .gsep.lane.ready').getBoundingClientRect(), lr = l.getBoundingClientRect(); return { top: Math.round(r.top - lr.top), inSight: r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1 }; })(document.querySelector('#slist'))`);
  ctx.assert.equal(out.stuck.inSight, true, `the folded head in sight: ${JSON.stringify(out.stuck)}`);
  await ctx.evaluate(`document.querySelector('#slist').scrollTop = 0`); await ctx.settle();
  await click(ctx, 'ready'); await run(ctx); await ctx.settle();

  // ---- reduced motion: at once, the caret too ----
  await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await ctx.waitFor(`matchMedia('(prefers-reduced-motion: reduce)').matches`, { what: 'reduced motion' });
  const r1 = await click(ctx, 'ready'), rs = await look(ctx, 'ready', 'idle');
  const caret = await ctx.evaluate(`getComputedStyle(document.querySelector('#slist > .gsep.lane.ready .lc')).transitionDuration`);
  ctx.assert.deepEqual([r1.ids, rs.order, rs.same, caret], [[], [], true, '0s'], `reduced: folded at once: ${JSON.stringify([r1, rs.order, caret])}`);
  const r2 = await click(ctx, 'ready'), ro = await look(ctx, 'ready', 'idle');
  ctx.assert.deepEqual([r2.ids, ro.cards.length, ro.cards.every(c => c.shows > 0)], [[], 10, true], 'reduced: opened at once');
  await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: '' }] });
  return out;
}
