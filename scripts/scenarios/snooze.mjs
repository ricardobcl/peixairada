// Snooze (2026-11-24, round XXX). What this checks, on compact cards at same height: a right-click's Snooze… is a menu of
// times, each with its clock time and a digit, and the things the chat could wait for; a digit picks one, the card leaves
// its lane for Snoozed, saying when it wakes, and nothing counts it — the Dock's and the menu bar's numbers, New replies, a
// reply landing in it; Wake it now puts it back unmarked; ⌥⌘S opens the same menu on the open chat, and Pick a time… a box;
// a snooze whose time comes wakes it by itself: at the top of its lane, marked back and counted a new reply till it is
// opened, flaring once, with one banner for the app; ⌥⌘K still finds a snoozed chat, marked; and a banner's In an hour
// snoozes its chat.
import { appendFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeFixture, replyLines } from '../fixture.mjs';

export const meta = {
  server: true,
  fixture: 'auto',
  prefs: { cards: 'compact', cardsEven: true, lanesShut: ['done', 'idle'], zzLane: 1 },
};

const SETUP = `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };`;

export default async function (ctx) {
  const out = {},
    cwd = realpathSync(tmpdir()),
    ago = m => new Date(Date.now() - m * 60_000);
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: SETUP });
  await ctx.reload();
  makeFixture(
    ctx.fixture.dir,
    [
      ['Release notes for 4.2', 30],
      ['Checkout copy for 4.2', 45],
    ].map(([title, m]) => ({ cwd, title, prompt: `Work on: ${title}`, reply: 'Done, have a look.', at: ago(m) })),
  );
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 4`, {
    what: 'the four cards',
    timeout: 15000,
  });
  const id = title => ctx.evaluate(`window.peix.sessions().find(s => s.title === ${JSON.stringify(title)})?.id`);
  const notes = await id('Release notes for 4.2'),
    copy = await id('Checkout copy for 4.2');
  const card = cid => `document.querySelector('#slist > .card[data-id="${cid}"]')`;
  const rightClick = cid =>
    ctx.evaluate(
      `(c => c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: c.getBoundingClientRect().x + 30, clientY: c.getBoundingClientRect().y + 10 })))(${card(cid)})`,
    );
  const row = re => `[...document.querySelectorAll('#ctxm button')].find(b => ${re}.test(b.textContent))`;
  const rows = () =>
    ctx
      .evaluate(
        `JSON.stringify([...document.querySelectorAll('#ctxm button')].map(b => b.textContent.replace(/\\s+/g, ' ').trim()))`,
      )
      .then(JSON.parse);
  const summary = async cid => (await ctx.server.api('api/sessions')).body.sessions.find(s => s.id === cid);
  const digit = n =>
    ctx.evaluate(
      `document.querySelector('#ctxm').dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit${n}', key: '${n}', bubbles: true, cancelable: true }))`,
    );
  const lastState = () =>
    ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'state').pop() || null)`).then(JSON.parse);
  const land = async cid => {
    const file = await ctx.evaluate(`window.peix.session(${JSON.stringify(cid)}).file`);
    appendFileSync(
      file,
      replyLines({ id: cid, cwd, text: 'More done.', at: new Date() })
        .map(l => JSON.stringify(l))
        .join('\n') + '\n',
    );
  };

  // ---- a right-click's Snooze…: the times with their clock and a digit, and the things to wait for ----
  await rightClick(notes);
  await ctx.waitFor(row('/^Snooze…/'), { what: 'the Snooze… row' });
  await ctx.evaluate(`${row('/^Snooze…/')}.click()`);
  await ctx.waitFor(row('/In 1 hour/'), { what: 'the snooze menu' });
  out.menu = await rows();
  ctx.assert.match(out.menu[0], /^1In 1 hour\d\d:\d\d$/, 'a digit, the time and when');
  ctx.assert.ok(
    out.menu.some(r => /^3(Tomorrow|This) morning/.test(r)),
    'the morning',
  );
  ctx.assert.ok(
    out.menu.some(r => /^5Pick a time…/.test(r)),
    'a time of your own',
  );
  ctx.assert.ok(
    out.menu.some(r => /^Until something happens/.test(r)),
    'nothing to wait for in a quiet chat, said',
  );
  await ctx.settle();
  await ctx.shot('menu', { x: 0, y: 0, width: 520, height: 520 });

  // ---- 1 picks: the card goes to Snoozed, saying when ----
  await digit(1);
  await ctx.waitFor(`${card(notes)}?.dataset.rank === 'snoozed'`, { what: 'the card in Snoozed', timeout: 8000 });
  const z = (await summary(notes)).snooze;
  ctx.assert.ok(
    z?.until && Math.abs(Date.parse(z.until) - Date.now() - 3_600_000) < 60_000,
    `an hour on: ${JSON.stringify(z)}`,
  );
  out.lane = await ctx.evaluate(
    `(c => ({ lane: c.previousElementSibling?.closest('.gsep.lane')?.dataset.lane || [...document.querySelectorAll('#slist > .gsep.lane')].filter(h => h.compareDocumentPosition(c) & 4).pop()?.dataset.lane, says: c.querySelector('.snz')?.textContent }))(${card(notes)})`,
  );
  ctx.assert.equal(out.lane.lane, 'snoozed', 'under the Snoozed head');
  ctx.assert.match(out.lane.says, /^till \d\d:\d\d$/, 'when it wakes');
  await ctx.settle();
  await ctx.shot('snoozed', { x: 0, y: 0, width: 460, height: 460 });

  // ---- counted nowhere: a reply landing in it is no new reply, nor the Dock's ----
  await land(notes);
  await ctx.waitFor(
    `window.peix.session(${JSON.stringify(notes)}).lastReplyAt > new Date(Date.now() - 10000).toISOString()`,
    { what: 'the reply heard' },
  );
  await ctx.sleep(600);
  const st = await lastState();
  ctx.assert.ok(!(st?.replied || []).some(r => r.id === notes), "not in the app's new replies");
  ctx.assert.equal(
    await ctx.evaluate(`${card(notes)}.dataset.rank`),
    'snoozed',
    'still snoozed: a reply is not a wake',
  );

  // ---- Wake it now: back on its lane, unmarked ----
  await rightClick(notes);
  await ctx.waitFor(row('/^Wake it now/'), { what: 'the Wake row' });
  await ctx.evaluate(`${row('/^Wake it now/')}.click()`);
  await ctx.waitFor(`${card(notes)}?.dataset.rank === 'ready'`, { what: 'back in Ready' });
  ctx.assert.equal(
    await ctx.evaluate(`!!${card(notes)}.querySelector('.lback')`),
    false,
    'woken by hand, no back mark',
  );

  // ---- ⌥⌘S on the open chat: the same menu; Pick a time… a box ----
  await ctx.openChat(copy);
  await ctx.key('KeyS');
  await ctx.waitFor(row('/Pick a time/'), { what: '⌥⌘S: the snooze menu' });
  await ctx.evaluate(`${row('/Pick a time/')}.click()`);
  await ctx.waitFor(`document.querySelector('#zzPick[open]') && document.querySelector('#zzAt').value`, {
    what: 'the box for a time',
  });
  await ctx.evaluate(`document.querySelector('#zzCancel').click()`);

  // ---- a time that comes: the oldest chat wakes by itself at the top of its lane, marked back and a new reply, flaring
  // once, with one banner — and opened, the mark goes ----
  const old = ctx.fixture.chats[0].id,
    t0 = await ctx.evaluate(`window.peix.motion().length`);
  await ctx.server.post(`api/sessions/${old}/snooze`, { until: new Date(Date.now() + 1500).toISOString() });
  await ctx.waitFor(`${card(old)}?.dataset.rank === 'snoozed'`, { what: 'snoozed by the route' });
  await ctx.waitFor(`${card(old)}?.querySelector('.lback')`, { what: 'back by itself, marked', timeout: 15000 });
  await ctx.settle();
  out.back = await ctx.evaluate(
    `({ first: [...document.querySelectorAll('#slist > .card')].find(c => c.dataset.rank === 'ready')?.dataset.id === ${JSON.stringify(old)}, flare: window.peix.motion().slice(${t0}).some(m => m.kind === 'woke' && m.id === ${JSON.stringify(old)}) })`,
  );
  ctx.assert.deepEqual(out.back, { first: true, flare: true }, 'at the top of Ready, flaring as it came');
  await ctx.sleep(400);
  ctx.assert.ok(
    ((await lastState())?.replied || []).some(r => r.id === old),
    "counted a new reply, the Dock's",
  );
  out.alert = await ctx
    .evaluate(
      `JSON.stringify(window.__posts.filter(m => m.type === 'alert' && m.kind === 'back').map(m => [m.sessionId, m.heading]))`,
    )
    .then(JSON.parse);
  ctx.assert.equal(out.alert.length, 1, `one banner: ${JSON.stringify(out.alert)}`);
  ctx.assert.equal(out.alert[0][0], old);
  ctx.assert.match(out.alert[0][1], /^Back · /);
  await ctx.shot('back', { x: 0, y: 0, width: 460, height: 460 });
  await ctx.openChat(old);
  await ctx.waitFor(`!${card(old)}.querySelector('.lback')`, { what: 'opened, the mark gone' });

  // ---- ⌥⌘K still finds a snoozed chat, marked ----
  await ctx.server.post(`api/sessions/${notes}/snooze`, { until: new Date(Date.now() + 3_600_000).toISOString() });
  await ctx.waitFor(`${card(notes)}?.dataset.rank === 'snoozed'`, { what: 'snoozed again' });
  await ctx.key('KeyK');
  await ctx.waitFor(`document.querySelector('#pick[open]')`, { what: 'the chat picker' });
  out.picker = await ctx.evaluate(
    `[...document.querySelectorAll('#picklist .pkrow')].find(r => r.textContent.includes('Release notes for 4.2'))?.querySelector('.zzt')?.textContent.trim() || null`,
  );
  ctx.assert.match(out.picker || '', /^snoozed till/, 'marked snoozed in ⌥⌘K');
  await ctx.evaluate(`document.querySelector('#pick').close()`);

  // ---- a banner's In an hour (the app's peixSnooze): the chat snoozed an hour ----
  await ctx.evaluate(`window.peixSnooze(${JSON.stringify(copy)})`);
  for (let i = 0; i < 40 && !(await summary(copy)).snooze; i++) await ctx.sleep(100);
  const zz = (await summary(copy)).snooze;
  ctx.assert.ok(
    zz?.until && Math.abs(Date.parse(zz.until) - Date.now() - 3_600_000) < 60_000,
    `the banner's In an hour: ${JSON.stringify(zz)}`,
  );
  return out;
}
