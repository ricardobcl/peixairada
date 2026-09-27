// The card's marks of 2026-09-27 (Ricardo: "sort by the latest: either my reply or claude reply · if the chat is using
// Fable, put a special marker on the card · the time since last update on the card should only show on hover and
// should be top left"). Three chats in one folder: one on Fable whose reply is the newest word of the three, one on
// Opus you wrote to earlier — the reply came a minute later —, one you spoke last on, most recently of all. What is
// checked: the order goes by the last word whoever said it — Claude's reply lifts a card above one you prompted
// after its prompt, which your last touch alone never did — and ⌥⌘K and the day lines agree; the F marks the Fable
// card and no other, and names the model on hover; the time stands in the top row left of the ✓ (2026-09-27, later),
// and shows only under the pointer, with nothing in the row moving (later still).
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFixture, replyLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

const titles = ctx => ctx.evaluate(`[...document.querySelectorAll('#slist > .card .title')].map(t => t.textContent)`);
const card = t => `[...document.querySelectorAll('#slist > .card')].find(c => c.querySelector('.title').textContent === ${JSON.stringify(t)})`;
const rects = (ctx, t) => ctx.evaluate(`(c => { const r = e => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  return { card: r(c), time: r(c.querySelector('.time')), title: r(c.querySelector('.title')), top: r(c.querySelector('.top')), op: getComputedStyle(c.querySelector('.time')).opacity, text: c.querySelector('.time').textContent }; })(${card(t)})`);

export default async function (ctx) {
  const out = {};
  const cwd = join(tmpdir(), 'peix-card-marks', 'marks-repo');
  const T = Date.now(), ago = ms => new Date(T - ms);
  const base = id => ({ isSidechain: false, userType: 'external', entrypoint: 'cli', cwd, sessionId: id, version: 'fixture', gitBranch: 'main' });
  const said = (id, text, at) => ({ ...base(id), parentUuid: null, type: 'user', uuid: randomUUID(), timestamp: at.toISOString(), message: { role: 'user', content: [{ type: 'text', text }] } });
  makeFixture(ctx.fixture.dir, [
    // your prompt at −4 h, Claude's reply — on Fable — at −1 h: Claude had the last word, and the newest of the three
    { cwd, title: 'Fable replied last', prompt: 'port the parser', reply: 'starting on it', at: ago(4 * 3600_000), model: 'claude-fable-5-1',
      lines: id => replyLines({ id, cwd, text: 'ported, tests green', at: ago(3600_000), model: 'claude-fable-5-1' }) },
    // your prompt at −3 h, the reply — on Opus — a minute later: under your last touch alone this card led the one above
    { cwd, title: 'Opus, you wrote after it', prompt: 'list the flags', reply: 'three flags', at: ago(3 * 3600_000 - 60_000), model: 'claude-opus-5-5' },
    // your word the newest of all: a prompt at −31 min and an Escape at −30, after a reply hours old
    { cwd, title: 'You spoke last', prompt: 'rename the column', reply: 'renamed', at: ago(5 * 3600_000),
      lines: id => [said(id, 'and the one beside it', ago(31 * 60_000)), said(id, '[Request interrupted by user]', ago(30 * 60_000))] },
  ]);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 5`, { what: 'the three chats and the fixture\'s two' });

  // ---- the order: the last word, whoever said it ----
  out.order = await titles(ctx);
  ctx.assert.deepEqual(out.order.slice(0, 3), ['You spoke last', 'Fable replied last', 'Opus, you wrote after it'], 'your Escape, then Claude\'s reply, then the older exchange');
  out.api = (await ctx.server.api('api/sessions')).body.sessions.map(s => s.title).filter(t => out.order.slice(0, 3).includes(t));
  ctx.assert.deepEqual(out.api, out.order.slice(0, 3), 'the server lists them in the same order');
  out.tips = await ctx.evaluate(`[...document.querySelectorAll('#slist > .card')].slice(0, 3).map(c => c.querySelector('.time').title)`);
  ctx.assert.match(out.tips[1], /you last wrote 4h ago · Claude last replied 1h ago/, 'the tip says both');
  await ctx.key('KeyK');
  await ctx.waitFor(`document.querySelector('#pick').open && document.querySelectorAll('#picklist .pkrow').length >= 3`, { what: 'the chat picker' });
  out.picker = await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow')].slice(0, 3).map(r => r.querySelector('.n').textContent.replace('current', '') + ' · ' + r.querySelector('.t').textContent)`);
  ctx.assert.deepEqual(out.picker, ['You spoke last · 30m', 'Fable replied last · 1h', 'Opus, you wrote after it · 2h'], '⌥⌘K: the same order, aged by the last word');
  await ctx.evaluate(`document.querySelector('#pick').close()`);

  // ---- the F on the Fable card, and on no other ----
  out.fable = await ctx.evaluate(`[...document.querySelectorAll('#slist > .card')].filter(c => c.querySelector('.fable')).map(c => [c.querySelector('.title').textContent, c.querySelector('.fable').title])`);
  ctx.assert.deepEqual(out.fable, [['Fable replied last', 'on Fable — claude-fable-5-1, the model Claude last answered with']], 'one mark, naming the model');
  ctx.assert.ok(await ctx.evaluate(`${card('Fable replied last')}.querySelector('.top .fable svg')`), 'an inline SVG in the top row');
  // the ✓ before the F, both ending the top row; with no F the ✓ stands where the F would (Ricardo, the same day)
  const ends = t => ctx.evaluate(`(c => { const r = e => e && Math.round(e.getBoundingClientRect().right), x = e => e && Math.round(e.getBoundingClientRect().left), edge = r(c) - 12; const a = c.querySelector('.top .act'), f = c.querySelector('.top .fable');
    return { edge, act: r(a), actLeft: x(a), fable: r(f), fableLeft: x(f), y: Math.round(a.getBoundingClientRect().top) - Math.round(c.querySelector('.repo').getBoundingClientRect().top), inTrow: !!c.querySelector('.trow .act') }; })(${card(t)})`);
  out.ends = { fable: await ends('Fable replied last'), opus: await ends('Opus, you wrote after it') };
  ctx.assert.equal(out.ends.fable.fable, out.ends.fable.edge, 'the F ends the row, at the padding');
  ctx.assert.ok(out.ends.fable.act < out.ends.fable.fableLeft, 'the ✓ before the F');
  ctx.assert.equal(out.ends.opus.fable, null, 'no F on the Opus card');
  ctx.assert.equal(out.ends.opus.act, out.ends.opus.edge, 'the ✓ takes the F\'s place');
  ctx.assert.ok(Math.abs(out.ends.opus.y) <= 2 && !out.ends.opus.inTrow, 'at the project name\'s height, not in the title row');

  // ---- the time: in the top row, left of the ✓ (2026-09-27, later), and only under the pointer (later still) ----
  const t = 'Opus, you wrote after it';
  out.rest = await rects(ctx, t);
  ctx.assert.equal(out.rest.op, '0', 'invisible at rest');
  ctx.assert.equal(out.rest.text, '2h', 'when anything last happened — the reply');
  const c = out.rest.card;
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x + c.w / 2, y: c.y + c.h / 2 });
  await ctx.waitFor(`getComputedStyle(${card(t)}.querySelector('.time')).opacity !== '0'`, { what: 'the time fading in' });
  await ctx.sleep(250);
  out.hover = await rects(ctx, t);
  ctx.assert.ok(Number(out.hover.op) > 0.5, `shown under the pointer (opacity ${out.hover.op})`);
  const at = r => [r.x, r.y];   // a hover brings out a mark in the title row, which narrows the title; where things start is what must hold
  ctx.assert.deepEqual([out.hover.time, at(out.hover.title), at(out.hover.top)], [out.rest.time, at(out.rest.title), at(out.rest.top)], 'it kept its room at rest: nothing moved');
  await ctx.shot('hover', { x: 0, y: 40, width: 400, height: 460 });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1000, y: 500 });
  const place = title => ctx.evaluate(`JSON.stringify((c => { const r = q => { const e = c.querySelector(q), b = e && e.getBoundingClientRect(); return b && { l: Math.round(b.left), r: Math.round(b.right), y: Math.round(b.top + b.height / 2) }; };
    return { time: r('.top .time'), inTrow: !!c.querySelector('.trow .time'), act: r('.top .act'), fable: r('.top .fable') }; })(${card(title)}))`).then(JSON.parse);
  out.place = { opus: await place(t), fable: await place('Fable replied last') };
  ctx.assert.ok(out.place.opus.time && !out.place.opus.inTrow, 'in the top row, not the title row');
  ctx.assert.ok(out.place.opus.act && out.place.opus.time.r <= out.place.opus.act.l, `left of the ✓ (time ends ${out.place.opus.time.r}, ✓ starts ${out.place.opus.act?.l})`);
  ctx.assert.ok(Math.abs(out.place.opus.time.y - out.place.opus.act.y) <= 2, 'on the ✓\'s line');
  ctx.assert.ok(out.place.fable.time.r <= out.place.fable.act.l && out.place.fable.act.r <= out.place.fable.fable.l, 'time · ✓ · F, in that order, on the Fable card');
  await ctx.shot('rest', { x: 0, y: 40, width: 400, height: 460 });
  return out;
}
