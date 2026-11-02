// Your word takes the list to the card (2026-11-02): an old chat well down the list, resumed and written in, goes to the
// top — and the list went on showing where it had been. What is checked, the real way through (the card clicked, Resume,
// the drawer's keyboard): the list at the top with the card in sight, the card rising from where it stood and the rest
// coming from a screen away at most. A word with the list scrolled elsewhere brings it back; hidden, it waits for the
// list to show; under reduced motion it is a jump. What does not: another chat's word, or the open chat's reply landing,
// leave a list you scrolled where it is.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { chatLines, makeFixture } from '../fixture.mjs';

export const meta = { server: true, fake: true, fixture: 'auto' };

const sid = JSON.stringify;
const LIST = `document.querySelector('#slist')`;
const card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;
const reduce = (ctx, on) => ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : '' }] });

export default async function (ctx) {
  const out = {}, cwd = ctx.fixture.chats[1].cwd, day = 86_400_000, now = Date.now();
  const { chats } = makeFixture(ctx.fixture.dir, Array.from({ length: 34 }, (_, i) => ({
    cwd, title: `Old chat ${String(i).padStart(2, '0')}`, prompt: `an old question ${i}`, reply: 'an old answer', at: new Date(now - 8 * day - i * 3_600_000) })));
  await ctx.waitFor(`document.querySelectorAll('#slist > .card[data-rank="idle"]').length >= 30`, { what: 'the Idle lane', timeout: 15_000 });
  await ctx.settle();

  const look = id => ctx.evaluate(`JSON.stringify((l => { const c = ${card(id)}, a = l.getBoundingClientRect(), r = c.getBoundingClientRect(), stick = parseFloat(getComputedStyle(l).scrollPaddingTop) || 0;
    return { top: Math.round(l.scrollTop), rank: c.dataset.rank, seen: r.top >= a.top + stick - 1 && r.bottom <= a.bottom + 1, y: Math.round(r.top - a.top), h: Math.round(a.height), first: l.querySelector(':scope > .card') === c }; })(${LIST}))`).then(JSON.parse);
  const words = n => ctx.waitFor(`(s => s && s.lastUserAt > ${sid(n)})(window.peix.session(${sid(old.id)}))`, { what: 'the word in the transcript', timeout: 10_000 });
  const scrollDown = async () => { await ctx.evaluate(`(l => { l.scrollTop = l.scrollHeight; })(${LIST})`); await ctx.settle(); return ctx.evaluate(`${LIST}.scrollTop`); };

  // ---- well down the list: clicked, the card in sight, the list far from its top ----
  const old = chats[24];
  await ctx.evaluate(`${card(old.id)}.scrollIntoView({ block: 'center' })`); await ctx.settle();
  await ctx.evaluate(`${card(old.id)}.click()`);
  await ctx.waitFor(`window.peix.state().current === ${sid(old.id)} && !document.querySelector('#resume').hidden`, { what: 'the old chat open, its resume bar' });
  await ctx.settle();
  out.opened = await look(old.id);
  ctx.assert.ok(out.opened.top > 500, `the list well down (${out.opened.top})`);
  ctx.assert.ok(out.opened.seen, 'the card in sight');
  ctx.assert.equal(out.opened.rank, 'idle', 'in the Idle lane');

  // ---- resumed: nothing has been said, the list stays ----
  await ctx.evaluate(`document.querySelector('#resumeGo').click()`);
  await ctx.waitFor(`window.peix.state().termSession === ${sid(old.id)} && window.peix.session(${sid(old.id)})?.alive`, { what: 'the drawer on the old chat', timeout: 15_000 });
  await ctx.waitPrompt();
  await ctx.settle();
  out.resumed = await look(old.id);
  ctx.assert.equal(out.resumed.top, out.opened.top, 'a resume alone moves no list');

  // ---- your word: the card at the top, and the list with it ----
  const n0 = (await ctx.peix('motion()')).length, said0 = (await ctx.peix(`session(${sid(old.id)})`)).lastUserAt;
  await ctx.type('slow 4 and one more thing\r');   // the fake answers in four seconds: the reply lands below, with the list elsewhere
  await words(said0);
  await ctx.waitFor(`${card(old.id)}.dataset.rank !== 'idle'`, { what: 'the card out of the Idle lane' });
  await ctx.shot('moved');
  await ctx.settle();
  out.wrote = await look(old.id);
  ctx.assert.ok(out.wrote.first, 'the card is the first in the list');
  ctx.assert.equal(out.wrote.top, 0, `the list at its top (${out.wrote.top})`);
  ctx.assert.ok(out.wrote.seen, `the card in sight (y ${out.wrote.y})`);
  await ctx.shot('at-top');
  const flips = (await ctx.peix('motion()')).slice(n0).filter(m => m.kind === 'flip');
  const mine = flips.find(m => m.id === old.id);
  out.flips = { mine, others: flips.length - 1, far: Math.max(...flips.map(m => Math.abs(m.dy))) };
  ctx.assert.ok(mine && mine.dy > 0, `the card rose from where it stood: ${JSON.stringify(mine)}`);
  ctx.assert.ok(out.flips.far <= out.wrote.h, `nothing slid from further than a screen (${out.flips.far}, the list ${out.wrote.h})`);

  // ---- the reply landing, with the list scrolled away by hand: it stays ----
  const landedAt = await scrollDown();
  ctx.assert.equal((await ctx.peix(`session(${sid(old.id)})`)).status, 'working', 'the reply still to land');
  await ctx.waitFor(`window.peix.session(${sid(old.id)}).status === 'idle'`, { what: 'the reply landed', timeout: 15_000 });
  await ctx.settle();
  out.landed = await look(old.id);
  ctx.assert.ok(out.landed.top > landedAt - 200, `a reply leaves the list where you left it (${landedAt} → ${out.landed.top})`);

  // ---- another chat's word: the list stays, and the chat open stays open ----
  const other = chats[3];
  const said1 = await scrollDown();
  appendFileSync(other.file, chatLines({ id: other.id, cwd, prompt: 'a word in another chat', reply: 'and back', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
  await ctx.waitFor(`${card(other.id)}.dataset.rank !== 'idle'`, { what: 'the other chat out of the Idle lane' });
  await ctx.settle();
  out.other = await ctx.evaluate(`${LIST}.scrollTop`);
  ctx.assert.ok(out.other > said1 - 300, `another chat's word leaves the list (${said1} → ${out.other})`);

  // ---- your word again, with the card scrolled out of sight: the list comes back ----
  await scrollDown();
  out.away = await look(old.id);
  ctx.assert.ok(!out.away.seen, 'the card out of sight');
  const said2 = (await ctx.peix(`session(${sid(old.id)})`)).lastUserAt;
  await ctx.type('again\r');
  await words(said2);
  await ctx.waitFor(`${LIST}.scrollTop < 300`, { what: 'the list back at the card' });
  await ctx.settle();
  out.back = await look(old.id);
  ctx.assert.ok(out.back.seen, `the card in sight once more (${JSON.stringify(out.back)})`);
  await ctx.waitFor(`window.peix.session(${sid(old.id)}).status === 'idle'`, { what: 'that reply landed', timeout: 15_000 });

  // ---- reduced motion: the same place, no slide ----
  await reduce(ctx, true);
  await ctx.waitFor(`matchMedia('(prefers-reduced-motion: reduce)').matches`, { what: 'the page seeing reduced motion' });
  await scrollDown();
  const n1 = (await ctx.peix('motion()')).length, said3 = (await ctx.peix(`session(${sid(old.id)})`)).lastUserAt;
  await ctx.type('quietly\r');
  await words(said3);
  await ctx.waitFor(`${LIST}.scrollTop < 300`, { what: 'the list at the card, under reduced motion' });
  out.reduced = await look(old.id);
  ctx.assert.ok(out.reduced.seen, 'in sight under reduced motion');
  ctx.assert.equal((await ctx.peix('motion()')).slice(n1).filter(m => m.kind === 'flip').length, 0, 'and nothing slid');
  await reduce(ctx, false);
  await ctx.waitFor(`window.peix.session(${sid(old.id)}).status === 'idle'`, { what: 'that reply landed', timeout: 15_000 });

  // ---- hidden: it waits for the list to show ----
  await scrollDown();
  await ctx.key('KeyB');
  await ctx.waitFor(`document.querySelector('#main').classList.contains('lhide')`, { what: 'the list hidden' });
  const said4 = (await ctx.peix(`session(${sid(old.id)})`)).lastUserAt;
  await ctx.type('with the list hidden\r');
  await words(said4);
  await ctx.sleep(300);
  await ctx.key('KeyB');
  await ctx.waitFor(`!document.querySelector('#main').classList.contains('lhide')`, { what: 'the list back' });
  await ctx.settle();
  out.shown = await look(old.id);
  ctx.assert.ok(out.shown.seen, `shown, the list is at the card (${JSON.stringify(out.shown)})`);

  // ---- in WebKit, the app's engine: a word written into the open chat's transcript, the list far down ----
  const far = chats[10], body = `
    const id = ${sid(far.id)}, list = document.querySelector('#slist');
    location.hash = id; await until(() => window.peix.state().current === id, 6000, 'the chat open');
    await sleep(300); list.scrollTop = list.scrollHeight; await sleep(300);
    const from = list.scrollTop; say('READY');
    await until(() => list.scrollTop < from - 300, 20000, 'the list at the card');
    await sleep(400);
    const a = list.getBoundingClientRect(), r = document.querySelector('#slist > .card[data-id="' + id + '"]').getBoundingClientRect();
    return JSON.stringify({ from, top: list.scrollTop, seen: r.top >= a.top - 1 && r.bottom <= a.bottom + 1, slid: window.peix.motion().filter(m => m.kind === 'flip' && m.id === id).at(-1) });`;
  const wk = spawn('node', ['scripts/webkit.mjs', body], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, URL: ctx.server.url, KEY: ctx.server.key, SIZE: '1200x500', PREFS: JSON.stringify({ toured: true, lanesShut: [] }), TIMEOUT: '50' } });
  let said = '';
  const told = new Promise(res => { const hear = d => { said += d; if (said.includes('READY')) { res(); wk.stderr.off('data', hear); wk.stdout.off('data', hear); } }; wk.stderr.on('data', hear); wk.stdout.on('data', hear); wk.on('close', res); });
  const ended = new Promise(res => { let all = ''; wk.stdout.on('data', d => { all += d; }); wk.on('close', () => res(all)); });
  await told;
  if (said.includes('READY')) appendFileSync(far.file, chatLines({ id: far.id, cwd, prompt: 'a word in WebKit', reply: 'and back', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
  const printed = await ended;
  if (/the page is hidden/.test(said + printed)) { ctx.log('the screen is locked: WebKit runs no frames, nothing checked there'); out.webkit = 'skipped: the screen is locked'; return out; }
  const line = printed.split('\n').find(l => l.startsWith('"{'));
  ctx.assert.ok(line, `an answer from WebKit: ${(said + printed).slice(-600)}`);
  out.webkit = JSON.parse(JSON.parse(line));
  ctx.assert.equal(out.webkit.top, 0, `WebKit: the list at its top (${JSON.stringify(out.webkit)})`);
  ctx.assert.ok(out.webkit.seen, 'WebKit: the card in sight');
  return out;
}
