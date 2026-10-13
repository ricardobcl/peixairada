// The small motions of 2026-10-11 (the third studies, 1–28), one section each, on the auto fixture's two chats. What
// is checked is what each one promises a hand would see: a press dips, a count rolls, a moment plays once — read off
// computed styles and the page's own motion log, since a 200 ms move is over before a screenshot would catch it.
export const meta = { server: true, fixture: 'auto' };

const at = sel => `(r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }))(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`;

export default async function (ctx) {
  const out = {};
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 2`, { what: 'the fixture\'s two chats' });
  await ctx.settle();
  const mouse = (type, p) => ctx.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });

  // ---- 2 · a press dips: the card to 99 %, a control to 97 %, and a press on a control inside a card dips the control alone.
  // Let go off it, so nothing is clicked. ----
  const press = async (sel, read) => {
    await ctx.settle();   // a draw between the press and the read replaces the node, and the new one is not :active
    const p = await ctx.evaluate(at(sel));
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await mouse('mousePressed', p);
    // held: read until the dip has settled — two reads alike, 80 ms apart (a page out of sight runs late)
    let seen = null;
    for (let i = 0, last; i < 12; i++) { await ctx.sleep(80); const v = JSON.stringify(await ctx.evaluate(read)); if (v === last) { seen = JSON.parse(v); break; } last = v; }
    // let go somewhere else, so the press is not a click (a ✓ would tick the chat, a chip would filter the list) — out in
    // the chat column: the list's left edge calls the timeline out, which then lies over the cards
    const off = { x: 1000, y: 500 };
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: off.x, y: off.y, buttons: 1 });
    await mouse('mouseReleased', off); await ctx.sleep(400);
    return seen;
  };
  // what a held element's scale comes to: its transitions run to their end first — a page out of sight draws no frames
  // for a while, and a transition then stands at its start however long the press is held
  const held = sel => `(e => { e.getAnimations().forEach(a => { try { a.finish(); } catch {} }); return getComputedStyle(e).scale; })(document.querySelector(${JSON.stringify(sel)}))`;
  out.press = {
    card: await press('#slist > .card .title', held('#slist > .card')),
    chip: await press('#qBtn', held('#qBtn')),   // the magnifier (a state chip until 2026-10-11, later, when they went)
    tick: await press('#slist > .card .top .act', `[${held('#slist > .card')}, ${held('#slist > .card .top .act')}]`),
    after: await ctx.evaluate(held('#qBtn')),
  };
  ctx.assert.equal(out.press.card, '0.99', 'a card held down dips to 99 %');
  ctx.assert.equal(out.press.chip, '0.97', 'a chip held down dips to 97 %');
  ctx.assert.deepEqual(out.press.tick, ['none', '0.97'], 'the ✓ dips, the card under it does not');
  ctx.assert.equal(out.press.after, 'none', 'and springs back on release');

  // ---- 3 · a count rolls: tick a chat done and the Ready lane's count slides to its new value, reading as the number
  // throughout ----
  const [one, two] = ctx.fixture.chats;
  await ctx.server.post(`api/sessions/${two.id}/done`, { done: true });
  await ctx.waitFor(`window.peix.motion().some(m => m.kind === 'roll' && m.id === 'lane:ready')`, { what: 'the Ready lane\'s count to roll' });
  out.rolling = await ctx.evaluate(`[...document.querySelectorAll('.rn.rolling')].map(e => e.dataset.rk + ':' + e.querySelectorAll('.rcol').length)`);
  ctx.assert.ok(out.rolling.some(r => r.startsWith('lane:ready:')), 'the lane\'s count is a strip of digits while it rolls');
  await ctx.waitFor(`!document.querySelector('#slist .rn.rolling')`, { what: 'the counts landed, plain text again' });   // the list's: the bar's CPU and memory roll every 3 s
  await ctx.settle();
  out.rolled = await ctx.evaluate(`({ lane: document.querySelector('.gsep.lane.ready b')?.textContent, left: document.querySelectorAll('#slist .rn.rolling').length, rolls: window.peix.motion().filter(m => m.kind === 'roll').map(m => m.id) })`);
  ctx.assert.equal(out.rolled.lane, '1', 'the Ready lane counts one, as text');
  ctx.assert.equal(out.rolled.left, 0, 'nothing is left rolling');
  ctx.assert.ok(out.rolled.rolls.includes('lane:ready'), 'the lane\'s count rolled');
  await ctx.server.post(`api/sessions/${two.id}/done`, { done: false });
  await ctx.waitFor(`document.querySelector('.gsep.lane.ready b')?.textContent === '2'`, { what: 'both ready again' });
  await ctx.settle();

  // ---- 4 · a tick is felt: the ✓ fills and draws its stroke, and only then is the server told — the card goes to the
  // done ones and the Done count rolls on ----
  const card2 = `document.querySelector('#slist > .card[data-id="${two.id}"]')`;
  await ctx.evaluate(`${card2}.querySelector('.act[data-act="done"]').click()`);
  out.tick = await ctx.evaluate(`({ mark: !!${card2}.querySelector('.act.tk .tk'), done: ${card2}.classList.contains('done'), drawing: ${card2}.querySelector('.act.tk path').getAnimations().map(a => a.animationName) })`);
  ctx.assert.deepEqual(out.tick, { mark: true, done: false, drawing: ['tkdraw'] }, 'the ✓ draws itself before the card is done');
  await ctx.waitFor(`${card2}?.classList.contains('done')`, { what: 'the card ticked done once the stroke is drawn' });
  await ctx.settle();
  out.ticked = await ctx.evaluate(`({ done: document.querySelector('.gsep.lane.done b')?.textContent, rolled: window.peix.motion().filter(m => m.kind === 'roll').map(m => m.id).slice(-3) })`);
  ctx.assert.equal(out.ticked.done, '1', 'the Done lane counts it');
  await ctx.server.post(`api/sessions/${two.id}/done`, { done: false });
  await ctx.waitFor(`document.querySelector('.gsep.lane.ready b')?.textContent === '2'`, { what: 'both ready again' });
  await ctx.settle();

  // ---- 5 · all caught up: tick the last ready chat and a still head says so where the Ready lane was, its mark hopping
  // and throwing sparks once; a list that only ever had nothing ready gets the head without the moment ----
  const tickIt = async id => { await ctx.evaluate(`document.querySelector('#slist > .card[data-id="${id}"] .act[data-act="done"]').click()`); await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${id}"]')?.classList.contains('done')`, { what: 'ticked' }); };
  await tickIt(one.id);
  out.zeroBefore = await ctx.evaluate(`!!document.querySelector('#slist > .gsep.lane.zero')`);
  await tickIt(two.id);
  await ctx.waitFor(`window.peix.motion().some(m => m.kind === 'caughtup')`, { what: 'the moment' });
  out.zero = await ctx.evaluate(`(z => ({ text: z?.textContent, sparks: z?.querySelectorAll('.spark').length, next: z?.nextElementSibling?.className, ready: !!document.querySelector('.gsep.lane.ready') }))(document.querySelector('#slist > .gsep.lane.zero'))`);
  ctx.assert.equal(out.zeroBefore, false, 'not while one is still ready');
  ctx.assert.equal(out.zero.text, 'All caught up', 'the head says so');
  ctx.assert.ok(out.zero.sparks > 0, 'and throws its sparks');
  ctx.assert.match(out.zero.next, /lane done/, 'over the done cards, where the Ready lane goes');
  ctx.assert.equal(out.zero.ready, false, 'no Ready lane');
  // the sparks go on their animations' finish, an event a page out of sight hears late
  await ctx.waitFor(`document.querySelectorAll('.spark').length === 0`, { what: 'the sparks gone', timeout: 4000 });
  for (const c of [one, two]) await ctx.server.post(`api/sessions/${c.id}/done`, { done: false });
  await ctx.waitFor(`document.querySelector('.gsep.lane.ready b')?.textContent === '2' && !document.querySelector('.gsep.lane.zero')`, { what: 'both ready again, the head gone' });
  await ctx.settle();

  // ---- 10 · located: a chat opened from ⌥⌘K flashes its card once (the harness's openChat goes by the address, a
  // deep link's way, which locates too) ----
  await ctx.openChat(one.id); await ctx.settle();
  const m0 = await ctx.evaluate(`Math.round(performance.now())`);
  await ctx.key('KeyK');
  await ctx.waitFor(`document.querySelector('#pick').open`, { what: 'the chat picker' });
  await ctx.fill('#pickq', 'plain');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))`);
  await ctx.waitFor(`window.peix.motion().filter(m => m.at >= ${m0}).some(m => m.kind === 'locate')`, { what: 'the card located' });
  out.located = await ctx.evaluate(`({ current: window.peix.state().current, ids: window.peix.motion().filter(m => m.at >= ${m0}).filter(m => m.kind === 'locate').map(m => m.id), sweep: !!document.querySelector('#slist > .card > .loc') })`);
  ctx.assert.equal(out.located.ids.length, 1, 'one flash');
  ctx.assert.equal(out.located.ids[0], out.located.current, 'on the chat it opened');
  await ctx.waitFor(`document.querySelectorAll('#slist .loc').length === 0`, { what: 'the sweep gone', timeout: 4000 });

  // ---- 16 · the title travels: a card clicked open sends its title into the header; ⌥⌘↓ does not ----
  const other = (await ctx.evaluate(`window.peix.state().current`)) === one.id ? two : one;
  const p16 = await ctx.evaluate(at(`#slist > .card[data-id="${other.id}"] .title`));
  const m16 = await ctx.evaluate(`Math.round(performance.now())`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p16.x, y: p16.y });
  await mouse('mousePressed', p16); await mouse('mouseReleased', p16);
  out.fly = await ctx.evaluate(`({ fly: document.querySelector('.flytitle')?.textContent, hidden: document.querySelector('#shead h2 .t')?.style.opacity, head: document.querySelector('#shead h2 .t')?.textContent })`);
  ctx.assert.equal(out.fly.fly, out.fly.head, 'a copy of the title on its way to the header');
  ctx.assert.equal(out.fly.hidden, '0', 'the header\'s own waits');
  await ctx.waitFor(`!document.querySelector('.flytitle') && document.querySelector('#shead h2 .t')?.style.opacity === ''`, { what: 'the title landed', timeout: 4000 });
  await ctx.key('ArrowDown'); await ctx.settle();
  ctx.assert.equal((await ctx.evaluate(`window.peix.motion().filter(m => m.at >= ${m16})`)).filter(m => m.kind === 'fly').length, 1, 'a key flies nothing');

  // ---- 20 · the fish belly-up: the stream down, the status bar's fish (and the list's) floats belly-up; back, it flips
  // over and wiggles ----
  const restarting = ctx.server.restart();
  await ctx.waitFor(`document.querySelector('#sbar .conn')?.classList.contains('off')`, { what: 'the stream down', timeout: 10_000 });
  out.belly = await ctx.evaluate(`(c => ({ anim: getComputedStyle(c.querySelector('.logo .fishg')).animationName, brand: document.querySelector('#brandBtn').classList.contains('off') }))(document.querySelector('#sbar .conn'))`);
  ctx.assert.deepEqual(out.belly, { anim: 'bellyup', brand: true }, 'belly-up, in the bar and in the list\'s head');
  await restarting;
  await ctx.waitFor(`window.peix.motion().some(m => m.kind === 'fishback')`, { what: 'the fish flipped back', timeout: 15_000 });
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#sbar .conn .logo .fishg')).animationName`), 'bellyback', 'it flips over');

  // ---- 21 · the fish in the status bar: nothing at work, it still swims, at half the pace, back and forth in its lane
  // (2026-10-11, later: it stopped before, and went off one side to come back on the other) ----
  // (its rate is its pace, or three times that while it darts at a bubble — below; the swim's length, not its playback
  // rate, since 2026-10-13: peix.state().swim.rate reads it back)
  const fishAt = `(l => l && (a => ({ rest: l.classList.contains('rest'), fish: !!l.querySelector('.swimmer > .fw > svg.ft'), running: a?.playState, rate: window.peix.state().swim.rate / (window.peix.state().swim.dart ? 3 : 1),
    inLane: (r => r.left >= l.getBoundingClientRect().left - 1 && r.right <= l.getBoundingClientRect().right + 1)(l.querySelector('.swimmer').getBoundingClientRect()) }))(document.getAnimations().find(a => a.id === 'swim')))(document.querySelector('#sbSwim'))`;
  out.swim = await ctx.evaluate(fishAt);
  ctx.assert.deepEqual(out.swim, { rest: true, fish: true, running: 'running', rate: .5, inLane: true }, `swimming slowly, in the lane: ${JSON.stringify(out.swim)}`);
  // its path, sampled: from the right end to the left facing left, turned there, back to the right facing right — never
  // outside the lane (the animation is moved by hand and put back)
  // two frames first (2026-10-13): the path is the lane's width, set by its ResizeObserver a frame after the bar moved —
  // a count rolling or the connection's word changes the lane's room, and a read in between saw the old path
  out.path = await ctx.evaluate(`(async () => { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const a = document.getAnimations().find(a => a.id === 'swim'), l = document.querySelector('#sbSwim'), f = l.querySelector('.swimmer'), d = a.effect.getTiming().duration, t0 = a.currentTime, lr = l.getBoundingClientRect(), at = [];
    a.pause(); for (const k of [0, .25, .4999, .5001, .75, .9999]) { a.currentTime = d * k; const r = f.getBoundingClientRect(); at.push({ k, x: Math.round(r.left - lr.left), right: Math.round(lr.right - r.right), facing: new DOMMatrix(getComputedStyle(f).transform).a < 0 ? 'right' : 'left' }); }
    a.currentTime = t0; a.play(); return at; })()`);
  const [s0, s1, s2, s3, s4, s5] = out.path;
  ctx.assert.ok(s0.right <= 3 && s2.x <= 3 && s3.x <= 3 && s5.right <= 3 && s1.x > s2.x && s4.x > s3.x, `end to end and back: ${JSON.stringify(out.path)}`);
  ctx.assert.deepEqual(out.path.map(p => p.facing), ['left', 'left', 'left', 'right', 'right', 'right'], 'turning at the end');
  ctx.assert.ok(out.path.every(p => p.x >= 0 && p.right >= 0), `never outside the lane: ${JSON.stringify(out.path)}`);

  // …and it eats (2026-10-11, late night): the pointer on it is a pat — it wiggles, and blurps a bubble out ahead of itself;
  // it swims after it, its mouth open at the last and darting the last stretch, and gulps it, its pace back after;
  // every third one gulped, a burp rises. The fish is put in the lane's middle heading left first, so there is room
  // ahead — only with nothing out, in the same evaluation, so a blurp of its own is never left behind it.
  const patIt = `(l => { if (window.peix.state().swim.food.length) return false; (a => { a.currentTime = a.effect.getTiming().duration * .25; })(document.getAnimations().find(a => a.id === 'swim'));
    l.querySelector('.swimmer').dispatchEvent(new PointerEvent('pointerenter')); return true; })(document.querySelector('#sbSwim'))`;
  // A quiet moment first, the mark after it (2026-10-13): a burp rises 600 ms after a third gulp, so one of a gulp before
  // the mark must land before it; and the fish blurps on its own now and then, so a pat that finds a bubble out waits
  // for the next quiet moment rather than failing.
  let m21 = 0, eaten = 0, patted = false;
  await ctx.evaluate(`(l => { window.__opened = false; new MutationObserver(() => { window.__opened ||= l.classList.contains('open'); }).observe(l, { attributes: true }); })(document.querySelector('#sbSwim'))`);
  for (let i = 0; i < 10 && !patted; i++) {
    await ctx.waitFor(`!window.peix.state().swim.food.length`, { what: 'nothing out to eat', timeout: 15_000 });
    await ctx.sleep(700);
    m21 = await ctx.evaluate(`Math.round(performance.now())`); eaten = await ctx.evaluate(`window.peix.state().swim.eaten`);
    patted = await ctx.evaluate(`(window.__opened = false, ${patIt})`);
  }
  ctx.assert.ok(patted, 'patted');
  await ctx.waitFor(`window.peix.state().swim.food.length`, { what: 'a bubble blurped out', timeout: 4000 });
  out.food = await ctx.evaluate(`(s => ({ kinds: window.peix.motion().filter(m => m.at >= ${m21}).map(m => m.kind).filter(k => k === 'pat' || k === 'blurp'), ahead: s.food.every(x => x < document.querySelector('#sbSwim .swimmer').getBoundingClientRect().left - document.querySelector('#sbSwim').getBoundingClientRect().left), shown: document.querySelectorAll('#sbSwim .food').length }))(window.peix.state().swim)`);
  ctx.assert.deepEqual([out.food.kinds[0], out.food.kinds.includes('blurp'), out.food.ahead, out.food.shown > 0], ['pat', true, true, true], `a pat, then a bubble ahead of its mouth: ${JSON.stringify(out.food)}`);
  await ctx.waitFor(`!window.peix.state().swim.food.length && window.peix.state().swim.eaten > ${eaten}`, { what: 'the bubbles gulped', timeout: 15_000 });
  // …and gone from the lane: each leaves on its animation's finish, which a busy headless page can run late (2026-10-13)
  await ctx.waitFor(`!document.querySelector('#sbSwim .food')`, { what: 'the gulped bubbles gone from the lane', timeout: 5000 });
  out.ate = await ctx.evaluate(`({ kinds: [...new Set(window.peix.motion().filter(m => m.at >= ${m21}).map(m => m.kind).filter(k => /^(dart|gulp)$/.test(k)))], opened: window.__opened, left: document.querySelectorAll('#sbSwim .food').length, rate: window.peix.state().swim.rate, open: document.querySelector('#sbSwim').classList.contains('open') })`);
  ctx.assert.deepEqual(out.ate, { kinds: ['dart', 'gulp'], opened: true, left: 0, rate: .5, open: false }, `chased, mouth open, gulped, its pace back: ${JSON.stringify(out.ate)}`);
  for (const until = Date.now() + 40_000; !(await ctx.evaluate(`window.peix.motion().filter(m => m.at >= ${m21}).some(m => m.kind === 'burp')`)) && Date.now() < until;) { await ctx.evaluate(patIt); await ctx.sleep(600); }
  out.burp = await ctx.evaluate(`window.peix.motion().filter(m => m.at >= ${m21}).filter(m => m.kind === 'gulp' || m.kind === 'burp').map(m => m.kind + (m.kind === 'gulp' ? m.dy : ''))`);
  ctx.assert.ok(out.burp.includes('burp') && out.burp.filter(k => k.startsWith('gulp')).some(k => +k.slice(4) % 3 === 0), `a burp after every third: ${JSON.stringify(out.burp)}`);

  // ---- 22 · an empty list is the fish, resting, and the way to fill it ----
  await ctx.fill('#q', 'zzqqxx');
  await ctx.waitFor(`!!document.querySelector('#slist > .none .nfish svg')`, { what: 'the empty list\'s fish' });
  out.empty = await ctx.evaluate(`[...document.querySelectorAll('#slist > .none > b, #slist > .none > span:not(.nfish)')].map(e => e.textContent)`);
  ctx.assert.deepEqual(out.empty, ['Nothing matches', 'another word, or Esc for every chat']);
  await ctx.fill('#q', '');
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 2`, { what: 'the cards back' });

  // ---- 24 · a bump where a divider snaps: the list's splitter pulled to its own width (380) snaps there and says so ----
  const sp = await ctx.evaluate(`(r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), left: Math.round(document.querySelector('#sessions').getBoundingClientRect().left) }))(document.querySelector('#splitter').getBoundingClientRect())`);
  await ctx.drag({ x: sp.x, y: sp.y }, { x: sp.left + 520, y: sp.y });
  const m24 = await ctx.evaluate(`Math.round(performance.now())`);
  await ctx.drag({ x: sp.left + 520, y: sp.y }, { x: sp.left + 384, y: sp.y });
  out.snap = await ctx.evaluate(`({ width: window.peix.prefs().sessionsWidth, bumps: window.peix.motion().filter(m => m.at >= ${m24}).filter(m => m.kind === 'haptic:alignment').length })`);
  ctx.assert.deepEqual(out.snap, { width: 380, bumps: 1 }, 'snapped to the list\'s own width, with one bump');

  // ---- 25 · sounds, off by default: switched on (a hand's click, so the page may make sound), it plays its tick; an
  // alert with the board in front is heard ----
  ctx.assert.equal((await ctx.peix('prefs()')).sounds, false, 'off to begin with');
  await ctx.cmd('Comma');
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
  await ctx.settle();
  const so = await ctx.evaluate(at('#soundsOn'));
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: so.x, y: so.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await ctx.waitFor(`window.peix.motion().some(m => m.kind === 'sound:reply')`, { what: 'the tick, to hear it', timeout: 3000 });
  await ctx.cmd('Comma'); await ctx.waitFor(`!document.querySelector('#settings').open`, { what: 'the settings closed' });
  const m25 = await ctx.evaluate(`Math.round(performance.now())`);
  await ctx.server.post('api/test-notify', {});
  await ctx.waitFor(`window.peix.motion().filter(m => m.at >= ${m25}).some(m => m.kind === 'sound:reply')`, { what: 'the alert heard', timeout: 4000 });

  // ---- 28 · fade, not …: a title too long for the card fades out at its last line's end; a short one is left alone ----
  const long = 'A title long enough to run past three lines of a card in the list, so that its end has to go somewhere — and it fades rather than ending in an ellipsis, the way the tabs of a browser do it';
  await ctx.server.api(`api/sessions/${two.id}/title`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: long }) });
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${two.id}"] .title')?.textContent.startsWith('A title long')`, { what: 'the long title on its card' });
  await ctx.evaluate(`document.querySelector('#sessions').style.width = '300px'`);   // a narrow list: the board keeps 120 characters of a title, three lines of a wide card
  await ctx.sleep(200); await ctx.settle();
  out.fade = await ctx.evaluate(`({ long: document.querySelector('#slist > .card[data-id="${two.id}"] .title').classList.contains('over'), short: document.querySelector('#slist > .card[data-id="${one.id}"] .title').classList.contains('over'), mask: getComputedStyle(document.querySelector('#slist > .card[data-id="${two.id}"] .title')).maskImage.slice(0, 15) })`);
  ctx.assert.deepEqual([out.fade.long, out.fade.short], [true, false], 'the long one fades, the short one does not');
  return out;
}
