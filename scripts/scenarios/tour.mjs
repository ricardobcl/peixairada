// The tour (2026-10-14): the board's main parts one at a time, a hole in a dim veil round each and a card beside it.
// Checked: it comes up once on its own, when the first run's question is answered (Skip here), modal — the ⌥⌘ keys
// swallowed under it; the hello is centred with the hole shut; → walks every step, each card on screen and clear of
// its part, the hole round the part (the list, a card, the search, the home column, the status bar); ← steps back;
// esc leaves it, taken, and a note says where it waits; a reload does not bring it back; it starts again from the
// launcher's menu, the settings' head, home's keys line, the ? sheet and the About box; with a chat open the chat step
// is its body and its resume bar, and its header has a step of its own; with the status bar off (and no plan usage, as on
// every test server) that step is left out and the search is found at the list's foot; Done ends it without a note;
// under reduced motion nothing glides.
export const meta = { server: true, fixture: 'auto', env: { ORG_DIR: '', ORG: '' }, prefs: { toured: false } };

export default async function (ctx) {
  const out = {};
  const tour = () => ctx.evaluate('window.peix.tour()');
  // the card, the hole and the part as drawn, once the glide has landed
  const geom = () => ctx.evaluate(`JSON.stringify((() => {
    const q = s => document.querySelector(s), box = el => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
    const t = window.peix.tour(), parts = t.parts.map(p => box(q(p)));   // the part: its elements' boxes, as one
    const part = parts.length ? parts.reduce((a, b) => ({ l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) })) : null;
    if (part) Object.assign(part, { w: part.r - part.l, h: part.b - part.t });
    return { step: t.step, parts: t.parts, card: box(q('#tour .tcard')), hole: box(q('#tour .thole')), shut: q('#tour .thole').classList.contains('none'), part,
      title: q('#tourTitle').textContent, num: q('#tourNum').textContent, next: q('#tourNext').textContent, back: !q('#tourBack').hidden, skip: !q('#tourSkip').hidden,
      focus: document.activeElement?.id, W: innerWidth, H: innerHeight };
  })())`).then(JSON.parse);
  const arrow = async key => { const k = { ArrowRight: 39, ArrowLeft: 37, Escape: 27 }[key]; await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: k }); await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: k }); };
  const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  /** Every step from here to the last: on screen, beside its part (or inside it, at its foot, with no room round it). */
  async function walk(label) {
    const seen = [];
    for (;;) {
      await ctx.settle();
      const g = await geom(); seen.push(g);
      await ctx.shot(`${label}-${g.step}`);
      ctx.assert.ok(g.card.l >= 0 && g.card.t >= 0 && g.card.r <= g.W && g.card.b <= g.H, `${label} ${g.step}: the card on screen ${JSON.stringify(g.card)}`);
      ctx.assert.equal(g.focus, 'tourNext', `${label} ${g.step}: the keys on Next`);
      if (g.part) {
        ctx.assert.ok(!g.shut, `${label} ${g.step}: the hole open round its part`);
        const P = 6, inV = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        for (const [k, want] of [['l', inV(g.part.l - P, 2, g.W)], ['t', inV(g.part.t - P, 2, g.H)], ['r', inV(g.part.r + P, 0, g.W - 2)], ['b', inV(g.part.b + P, 0, g.H - 2)]])
          ctx.assert.ok(Math.abs(g.hole[k] - want) <= 1, `${label} ${g.step}: the hole's ${k} ${g.hole[k]} round the part (${want})`);
        const inside = g.card.l >= g.hole.l && g.card.r <= g.hole.r && g.card.t >= g.hole.t && g.card.b <= g.hole.b;
        ctx.assert.ok(!overlap(g.card, g.hole) || inside, `${label} ${g.step}: the card clear of its part, or inside it — card ${JSON.stringify(g.card)} hole ${JSON.stringify(g.hole)}`);
      } else {
        ctx.assert.ok(g.shut, `${label} ${g.step}: no part, the hole shut`);
        ctx.assert.ok(Math.abs((g.card.l + g.card.r) / 2 - g.W / 2) <= 1 && Math.abs((g.card.t + g.card.b) / 2 - g.H / 2) <= 1, `${label} ${g.step}: no part, the card centred ${JSON.stringify(g.card)}`);
      }
      if (g.next === 'Done') break;
      await arrow('ArrowRight');
      await ctx.waitFor(`window.peix.tour().step !== ${JSON.stringify(g.step)}`, { what: `${label}: the step after ${g.step}` });
    }
    return seen;
  }

  // ---- once, on its own, when the first run's question is answered ----
  await ctx.waitFor(`document.querySelector('#welcome').open`, { what: 'the first run’s question' });
  ctx.assert.equal((await tour()).open, false, 'not over the question');
  await ctx.evaluate(`document.querySelector('#wskip').click()`);
  await ctx.waitFor(`window.peix.tour().open`, { what: 'the tour, once the question was answered' });
  await ctx.settle();
  out.hello = await geom();
  await ctx.shot('hello');
  ctx.assert.ok(await ctx.evaluate(`document.querySelector('#tour').matches(':modal') && !document.querySelector('#welcome').open`), 'modal, and the question gone');
  ctx.assert.deepEqual([out.hello.step, out.hello.next, out.hello.back, out.hello.skip, out.hello.num], ['hello', 'Show me round', false, true, '1 of 9'], 'the hello: Show me round or Skip, nothing before it — and no step about the header with no chat open');
  ctx.assert.deepEqual((await tour()).steps, ['hello', 'list', 'card', 'find', 'chat', 'tabs', 'bar', 'keys', 'bye'], 'its steps with no chat open');
  await ctx.key('KeyN');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#pick').open`), false, '⌥⌘N swallowed under it');

  // ---- → to the end, ← back ----
  out.first = await walk('first');
  const by = id => out.first.find(g => g.step === id);
  ctx.assert.ok(by('list').part && by('list').part.l <= 20 && by('list').card.l >= by('list').hole.r, 'the list, at the window’s left, the card to its right');
  ctx.assert.ok(by('card').part && by('card').card.l >= by('card').hole.r, 'a card, the card to its right');
  ctx.assert.ok(by('find').part && by('find').card.b <= by('find').hole.t, 'the search in the status bar, the card above it');
  ctx.assert.ok(by('chat').part && by('chat').card.r <= by('chat').hole.l, 'the home column, the card over the list beside it');
  ctx.assert.ok(by('bar').part && by('bar').part.w >= by('bar').W - 40 && by('bar').card.b <= by('bar').hole.t, 'the status bar, the card above it');
  ctx.assert.ok(by('tabs').shut, 'no chat open: the tabs step has no part');
  ctx.assert.deepEqual([out.first.at(-1).step, out.first.at(-1).skip], ['bye', false], 'the last: Done, no Skip');
  await arrow('ArrowRight'); await ctx.sleep(200);
  ctx.assert.equal((await tour()).open, true, '→ on the last step does not leave');
  await arrow('ArrowLeft');
  await ctx.waitFor(`window.peix.tour().step === 'keys'`, { what: '← back a step' });

  // ---- esc leaves it, taken, and says where it waits ----
  await arrow('Escape');
  await ctx.waitFor(`!window.peix.tour().open`, { what: 'esc leaves it' });
  out.left = await ctx.waitFor(`document.querySelector('.note')?.textContent`, { what: 'where it waits' });
  ctx.assert.match(out.left, /Settings \(⌘,\), ⌥⌘L and home/);
  ctx.assert.equal(await ctx.evaluate('window.peix.prefs().toured'), true, 'taken');
  await ctx.reload();
  await ctx.sleep(600);
  ctx.assert.equal((await tour()).open, false, 'not again after a reload');

  // ---- again whenever asked: the launcher, the settings, home, the ? sheet, About ----
  const again = async (label, how) => {
    await how();
    await ctx.waitFor(`window.peix.tour().open && window.peix.tour().step === 'hello'`, { what: `the tour from ${label}` });
    ctx.assert.equal(await ctx.evaluate(`[...document.querySelectorAll('dialog[open]')].map(d => d.id).join()`), 'tour', `${label}: the tour alone up`);
    await ctx.evaluate(`document.querySelector('#tourSkip').click()`);
    await ctx.waitFor(`!window.peix.tour().open`, { what: `${label}: Skip` });
  };
  await again('the launcher', async () => {
    await ctx.key('KeyL');
    await ctx.waitFor(`document.querySelector('#pick').open`, { what: '⌥⌘L' });
    await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow.menu')].find(r => r.querySelector('.n').textContent === 'Tour').click()`);
  });
  await again('the settings', async () => {
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: '⌘,' });
    await ctx.evaluate(`document.querySelector('#tourBtn').click()`);
  });
  await again('home', () => ctx.evaluate(`document.querySelector('#home .hgo[data-go="tour"]').click()`));
  await again('the ? sheet', async () => {
    await ctx.evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }))`);
    await ctx.waitFor(`document.querySelector('#keysheet').open`, { what: '?' });
    await ctx.evaluate(`document.querySelector('#ksTour').click()`);
  });
  await again('About', async () => {
    await ctx.evaluate(`document.querySelector('#brandBtn').click()`);
    await ctx.waitFor(`document.querySelector('#about').open`, { what: 'About' });
    await ctx.evaluate(`document.querySelector('#aboutTour').click()`);
  });

  // ---- a chat open: its body, its header, its tabs; Done ends it with no note ----
  await ctx.openChat(ctx.fixture.chats[0].id);
  await ctx.settle();
  await ctx.evaluate(`document.querySelectorAll('.note').forEach(n => n.remove())`);
  await ctx.evaluate(`document.querySelector('#tourBtn').click()`);
  await ctx.waitFor(`window.peix.tour().open`, { what: 'the tour on a chat' });
  ctx.assert.deepEqual((await tour()).steps, ['hello', 'list', 'card', 'find', 'chat', 'head', 'tabs', 'bar', 'keys', 'bye'], 'its steps with a chat open');
  out.chat = await walk('chat');
  const on = id => out.chat.find(g => g.step === id);
  ctx.assert.equal(on('chat').title, 'The chat, live');
  ctx.assert.deepEqual(on('chat').parts, ['#groups', '#resume'], 'its body and its resume bar, drawn round as one');
  ctx.assert.ok(on('head').part && on('head').card.t >= on('head').hole.b, 'the header, the card under it');
  ctx.assert.ok(on('tabs').shut, 'one tab: no strip to show, the card in the middle');
  await ctx.evaluate(`window.peix.tour()`);
  for (let i = 0; i < 4; i++) { await arrow('ArrowLeft'); await ctx.sleep(50); }
  await ctx.waitFor(`window.peix.tour().step === 'head'`, { what: 'back to the header' });
  await ctx.settle();
  await ctx.shot('chat-head');
  for (let i = 0; i < 4; i++) { await arrow('ArrowRight'); await ctx.sleep(50); }
  await ctx.waitFor(`window.peix.tour().step === 'bye'`, { what: 'on to the end' });
  await ctx.evaluate(`document.querySelector('#tourNext').click()`);
  await ctx.waitFor(`!window.peix.tour().open`, { what: 'Done' });
  await ctx.sleep(200);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('.note')`), false, 'Done says nothing');

  // ---- split: the tabs step is the strip ----
  await ctx.cmd('Digit2');
  await ctx.waitFor(`window.peix.state().split`, { what: '⌘2 splits' });
  await ctx.settle();
  await ctx.evaluate(`document.querySelector('#tourBtn').click()`);
  await ctx.waitFor(`window.peix.tour().open`, { what: 'the tour, split' });
  for (let i = 0; i < 6; i++) await arrow('ArrowRight');
  await ctx.waitFor(`window.peix.tour().step === 'tabs'`, { what: 'the tabs step, split' });
  await ctx.settle();
  out.split = await geom();
  await ctx.shot('tabs-split');
  ctx.assert.ok(out.split.part && out.split.part.h > 12 && out.split.card.t >= out.split.hole.b, `split: a strip, the card under it ${JSON.stringify(out.split)}`);
  await ctx.evaluate(`document.querySelector('#tourNext').click()`);
  await arrow('Escape');
  await ctx.waitFor(`!window.peix.tour().open`, { what: 'esc' });
  await ctx.cmd('Digit0');
  await ctx.waitFor(`!window.peix.state().split`, { what: '⌘0 unsplits' });

  // ---- the status bar off: no step for it, the search at the list's foot ----
  await ctx.evaluate(`document.querySelector('#sbarOn').click()`);
  await ctx.evaluate(`document.querySelector('#ksTour').click()`);
  await ctx.waitFor(`window.peix.tour().open`, { what: 'the tour, the bar off' });
  ctx.assert.deepEqual((await tour()).steps, ['hello', 'list', 'card', 'find', 'chat', 'head', 'tabs', 'keys', 'bye'], 'no bar and no plan usage: no step for them');
  for (let i = 0; i < 3; i++) await arrow('ArrowRight');
  await ctx.waitFor(`window.peix.tour().step === 'find'`, { what: 'the search' });
  await ctx.settle();
  out.findHead = await geom();
  ctx.assert.ok(out.findHead.part && out.findHead.part.r <= 380 && out.findHead.part.b > out.findHead.H - 60 && out.findHead.card.b <= out.findHead.hole.t, `the search at the list's foot, the card above it ${JSON.stringify(out.findHead)}`);
  await ctx.evaluate(`document.querySelector('#tourSkip').click()`);
  await ctx.waitFor(`!window.peix.tour().open`, { what: 'Skip' });
  await ctx.evaluate(`document.querySelector('#sbarOn').click()`);

  // ---- dark, and under reduced motion nothing glides ----
  await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await ctx.sleep(300);
  await ctx.evaluate(`document.querySelector('#tourBtn').click()`);
  await ctx.waitFor(`window.peix.tour().open`, { what: 'the tour, dark' });
  await arrow('ArrowRight'); await arrow('ArrowRight');
  await ctx.waitFor(`window.peix.tour().step === 'card'`, { what: 'the card step, dark' });
  out.reduced = await ctx.evaluate(`getComputedStyle(document.querySelector('#tour .thole')).transitionProperty + ' | ' + getComputedStyle(document.querySelector('#tour .tcard')).transitionProperty + ' | ' + getComputedStyle(document.querySelector('#tour .tin')).animationName`);
  ctx.assert.equal(out.reduced, 'outline-color | outline-color | none', 'reduced motion: the ring fades, nothing glides');
  await ctx.settle();
  await ctx.shot('card-dark');
  await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await arrow('ArrowRight'); await arrow('ArrowRight');
  await ctx.waitFor(`window.peix.tour().step === 'chat'`, { what: 'the chat step, light' });
  await ctx.settle();
  await ctx.shot('chat-light');
  await arrow('Escape');
  await ctx.waitFor(`!window.peix.tour().open`, { what: 'esc' });
  return out;
}
