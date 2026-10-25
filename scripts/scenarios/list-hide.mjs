// The chat list hidden (2026-10-25; folded to a rail of squares from 2026-09-22). What this checks: the status bar's
// first button (#sbList) and ⌥⌘B take the list and its splitter out of the layout — the chat the whole width — and
// bring them back with the list's scroll as it was; the button's mark and words say which. Hidden, nothing on a card
// runs (a clauding card's ring is no animation at all, so WebKit has none to keep on the main thread), and shown
// again the rings turn in step. ⌥⌘↑↓ still walk the chats; what only narrows the list — the magnifier, a filter —
// shows it. Kept across a reload, and a board saved with the list folded to its rail comes back with it hidden. At the
// notch the chat's tile takes the screen's top left corner the list had.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ANIM_RULES } from '../../lib/animcheck.mjs';
import { makeFixture, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

const LOOK = `JSON.stringify((() => {
  const r = el => el.getBoundingClientRect(), b = document.querySelector('#sbList');
  return { hidden: document.querySelector('#main').classList.contains('lhide'), list: getComputedStyle(document.querySelector('#sessions')).display,
    splitter: getComputedStyle(document.querySelector('#splitter')).display, chatLeft: Math.round(r(document.querySelector('#chat')).left),
    chatW: Math.round(r(document.querySelector('#chat')).width), pressed: b.getAttribute('aria-pressed'), title: b.title,
    pane: getComputedStyle(b.querySelector('.lpane')).opacity, pref: window.peix.prefs().listHidden };
})())`;
// the rings and pings of the cards, as the document runs them
const RINGS = `document.getAnimations().filter(a => a.effect?.target?.closest?.('#sessions')).map(a => ({ name: a.animationName, state: a.playState, start: a.startTime }))`;

export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-hide', 'hide-repo');
  const sleep = spawn('sleep', ['300'], { stdio: 'ignore' });
  const look = () => ctx.evaluate(LOOK).then(JSON.parse);
  const click = async sel => {
    const p = await ctx.evaluate(`(r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }))(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`);
    for (const type of ['mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  };
  try {
    const now = Date.now(), at = ms => new Date(now - ms);
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Clauding away', prompt: 'refactor the parser', reply: 'on it', at: at(60_000), live: { pid: sleep.pid, startedAt: now - 3600_000 },
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test', description: 'run the tests' }, at: at(30_000) }) },
      ...Array.from({ length: 24 }, (_, i) => ({ cwd, title: `Older chat ${i + 1}`, prompt: 'a question', reply: 'an answer', at: at(600_000 + i * 60_000) })),
    ]);
    await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 27 && !!document.querySelector('#slist > .card.working')`, { what: 'the chats, one clauding' });
    await ctx.openChat(chats[3].id);
    await ctx.settle();

    // shown: the button's pane filled, its words the way to hide it; the ring turns
    out.shown = await look();
    ctx.assert.deepEqual([out.shown.hidden, out.shown.list, out.shown.pressed, out.shown.title, out.shown.pane, out.shown.pref],
      [false, 'grid', 'true', 'Hide the chat list (⌥⌘B)', '1', false], 'the list shows, and the button says it would hide it');
    ctx.assert.ok(await ctx.evaluate(`document.querySelector('#sbList').getBoundingClientRect().left - document.querySelector('#sbar').getBoundingClientRect().left < 16`), 'first in the status bar');
    ctx.assert.ok((await ctx.evaluate(RINGS)).some(a => a.name === 'ring' && a.state === 'running'), 'the clauding card’s ring runs');
    await ctx.evaluate(`document.querySelector('#slist').scrollTop = 420`);
    out.scroll = await ctx.evaluate(`document.querySelector('#slist').scrollTop`);
    ctx.assert.ok(out.scroll > 300, `the list scrolls: ${out.scroll}`);

    // the button hides it: the chat takes its room, and nothing on a card runs
    await click('#sbList');
    await ctx.settle();
    out.hidden = await look();
    ctx.assert.deepEqual([out.hidden.hidden, out.hidden.list, out.hidden.splitter, out.hidden.pressed, out.hidden.title, out.hidden.pane, out.hidden.pref],
      [true, 'none', 'none', 'false', 'Show the chat list (⌥⌘B)', '0', true], 'hidden, and the button says it would show it');
    ctx.assert.equal(out.hidden.chatLeft, 8, 'the chat starts where the list did, the tiles’ gap from the window’s edge');
    ctx.assert.ok(out.hidden.chatW >= out.shown.chatW + 380, `the chat the whole width: ${out.shown.chatW} → ${out.hidden.chatW}`);
    ctx.assert.deepEqual(await ctx.evaluate(RINGS), [], 'no animation runs in the hidden list');
    ctx.assert.deepEqual(await ctx.evaluate(ANIM_RULES), [], 'and nothing breaks the compositor’s rules');
    ctx.assert.ok(await ctx.evaluate(`document.querySelector('#chat').classList.contains('kf')`), 'the keys’ border on the chat');
    await ctx.shot('hidden');

    // ⌥⌘↓ walks the chats as the list orders them, hidden or not
    await ctx.key('ArrowDown');
    await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(chats[4].id)}`, { what: 'the next chat opened' });

    // ⌥⌘B brings it back as it was: its scroll, the ring turning in step with the document's clock
    await ctx.key('KeyB');
    await ctx.waitFor(`!document.querySelector('#main').classList.contains('lhide')`, { what: 'the list back' });
    await ctx.waitFor(`(r => r.some(a => a.name === 'ring') && r.every(a => a.state === 'running' && a.start === 0))(${RINGS})`, { what: 'the ring turning again, phased' });
    out.back = { ...(await look()), scroll: await ctx.evaluate(`document.querySelector('#slist').scrollTop`) };
    ctx.assert.deepEqual([out.back.list, out.back.splitter, out.back.chatW, out.back.pressed], ['grid', 'block', out.shown.chatW, 'true'], 'the list and the chat as they were');
    ctx.assert.ok(Math.abs(out.back.scroll - out.scroll) <= 1, `the list scrolled where it was: ${out.scroll} → ${out.back.scroll}`);

    // the magnifier needs the list: ⌥⌘F shows it, the box with the keys
    await ctx.key('KeyB');
    await ctx.waitFor(`window.peix.prefs().listHidden`, { what: 'hidden again' });
    await ctx.key('KeyF');
    out.find = await ctx.evaluate(`JSON.stringify({ hidden: window.peix.prefs().listHidden, focused: document.activeElement?.id || null })`).then(JSON.parse);
    ctx.assert.deepEqual(out.find, { hidden: false, focused: 'q' }, '⌥⌘F shows the list and puts the keys in the box');
    await ctx.evaluate(`document.querySelector('#q').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);

    // …and so does a filter picked from the funnel
    await ctx.key('KeyB');
    await ctx.waitFor(`window.peix.prefs().listHidden`, { what: 'hidden once more' });
    await click('#fBtn');
    await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: 'the funnel’s menu' });
    await ctx.evaluate(`[...document.querySelectorAll('#ctxm button[data-i]')].find(b => /new replies/i.test(b.textContent)).click()`);
    await ctx.waitFor(`window.peix.prefs().listFilter === 'replied'`, { what: 'the filter on' });
    ctx.assert.equal(await ctx.evaluate(`window.peix.prefs().listHidden`), false, 'a filter shows the list it narrows');
    await click('#fBtn');
    await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: 'the funnel’s menu again' });
    await ctx.evaluate(`[...document.querySelectorAll('#ctxm button[data-i]')].find(b => /every chat/i.test(b.textContent)).click()`);
    await ctx.waitFor(`window.peix.prefs().listFilter === null`, { what: 'the filter off' });

    // kept across a reload
    await click('#sbList');
    await ctx.waitFor(`window.peix.prefs().listHidden`, { what: 'hidden by the button' });
    await ctx.reload();
    await ctx.settle();
    ctx.assert.deepEqual(await look().then(l => [l.hidden, l.list, l.pressed]), [true, 'none', 'false'], 'hidden after a reload');

    // a board saved with the list folded to its rail (sessionsCompact) comes back with it hidden — and one unfolded, shown
    for (const [compact, hidden] of [[true, true], [false, false]]) {
      await ctx.evaluate(`(p => { delete p.listHidden; p.sessionsCompact = ${compact}; localStorage.setItem('peixairada-prefs', JSON.stringify(p)); })(JSON.parse(localStorage.getItem('peixairada-prefs')))`);
      await ctx.reload();
      const p = await ctx.evaluate(`JSON.stringify({ hidden: document.querySelector('#main').classList.contains('lhide'), compact: 'sessionsCompact' in window.peix.prefs() })`).then(JSON.parse);
      ctx.assert.deepEqual(p, { hidden, compact: false }, `folded ${compact} → hidden ${hidden}, the old key gone`);
    }

    // at the notch: hidden, the chat's tile rounds the screen's top left corner too
    await ctx.key('KeyB');
    await ctx.waitFor(`window.peix.prefs().listHidden`, { what: 'hidden for the notch' });
    const N = await ctx.evaluate(`(w => ({ top: 32, left: w / 2 - 92.5, right: w / 2 + 92.5 }))(innerWidth)`);
    await ctx.evaluate(`window.peixFill(true, ${JSON.stringify(N)})`);
    await ctx.waitFor(`document.querySelector('#main').classList.contains('notch')`, { what: 'the fill at the notch' });
    out.corners = await ctx.evaluate(`(c => [c.borderTopLeftRadius, c.borderTopRightRadius])(getComputedStyle(document.querySelector('#chat')))`);
    ctx.assert.deepEqual(out.corners, ['10px', '10px'], 'both of the screen’s top corners round on the chat');
    await ctx.settle(); await ctx.shot('notch');
    await ctx.evaluate(`window.peixFill(false, null)`);
    return out;
  } finally {
    sleep.kill();
  }
}
