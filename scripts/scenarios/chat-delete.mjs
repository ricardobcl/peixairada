// Delete from the board (2026-11-04), ⌥-click on any card's button. What is checked, on the same-height cards it is used on: ⌥
// over an idle chat with no PRs turns its ✓ into the ✕, red, and a real ⌥-click draws it, takes the card off and moves the
// open chat on; a done chat's ↩ the same; a chat asking has no button until ⌥, and its ✕ asks once more, naming what it ends,
// before it ends the claude; the card's menu and ··· have it. ⌥⌘K, typed, finds a deleted chat and says so, the bar under it
// puts it back, and a reload keeps one off.
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture } from '../fixture.mjs';

export const meta = { server: true, fake: true, fixture: 'auto', prefs: { cards: 'compact', cardsEven: true, lanesShut: [] } };
const sid = JSON.stringify;

export default async function (ctx) {
  const out = {}, cwd = ctx.fixture.chats[0].cwd, at = new Date(Date.now() - 3600_000);
  const made = makeFixture(ctx.fixture.dir, ['Idle one', 'Asking one', 'Done one', 'By the menu', 'By three dots'].map((title, i) => ({ cwd, title, prompt: `words of ${title}`, reply: 'a reply', at: new Date(at.getTime() - i * 60_000) })));
  const [idle, askingChat, doneChat, byMenu, byDots] = made.chats ?? made;
  await ctx.reload();
  const card = id => `document.querySelector('#slist > .card[data-id=${sid(id)}]')`;
  await ctx.waitFor(`!!${card(idle.id)} && !!${card(byDots.id)}`, { what: 'the cards' });
  const session = id => ctx.peix(`session(${sid(id)})`);
  const move = async (id, modifiers = 0) => {
    const c = await ctx.evaluate(`(r => ({ x: r.left + r.width / 2, y: r.bottom - 3 }))(${card(id)}.getBoundingClientRect())`);
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y, modifiers }); await ctx.sleep(120);
    return ctx.evaluate(`(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))(${card(id)}.querySelector('.act').getBoundingClientRect())`);
  };
  const shows = id => ctx.evaluate(`JSON.stringify((b => ({ act: b.dataset.act, shown: getComputedStyle(b).display !== 'none', x: getComputedStyle(b.querySelector('.fx')).display, tick: b.querySelector('.tk:not(.fx)') ? getComputedStyle(b.querySelector('.tk:not(.fx)')).display : null, bg: getComputedStyle(b).backgroundColor, title: b.title }))(${card(id)}.querySelector('.act')))`).then(JSON.parse);
  const altClick = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, modifiers: 1 }); };

  // ---- an idle chat with no PRs, open: the ✕ under ⌥, drawn when clicked; the card goes, the column moves on ----
  await ctx.openChat(idle.id);
  await ctx.settle();
  let at1 = await move(idle.id);
  out.rest = await shows(idle.id);
  ctx.assert.deepEqual([out.rest.act, out.rest.x], ['done', 'none'], 'no ⌥: the ✓');
  ctx.assert.match(out.rest.title, /⌥-click: delete from the board/, 'which says so');
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at1.x, y: at1.y, modifiers: 1 });
  await ctx.settle();
  out.alt = await shows(idle.id);
  ctx.assert.deepEqual([out.alt.x, out.alt.tick], ['block', 'none'], `⌥: the ✕ for the ✓, with no PRs on the chat: ${JSON.stringify(out.alt)}`);
  ctx.assert.notEqual(out.alt.bg, 'rgba(0, 0, 0, 0)', 'on red');
  await ctx.shot('1-alt');
  await altClick(at1.x, at1.y);
  ctx.assert.ok(await ctx.evaluate(`!!${card(idle.id)}?.querySelector('.act.tk.fg')`), 'the ✕ is what draws');
  await ctx.waitFor(`window.peix.session(${sid(idle.id)}).removed === true`, { what: 'deleted' });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 800, y: 500, modifiers: 0 });
  await ctx.settle();
  ctx.assert.equal(await ctx.evaluate(`!!${card(idle.id)}`), false, 'its card gone');
  ctx.assert.notEqual(await ctx.evaluate(`window.peix.state().current`), idle.id, 'and the column moved on');

  // ---- a chat asking: no button until ⌥, and the ✕ asks once more, saying what it ends ----
  const asker = spawn('sleep', ['120'], { stdio: 'ignore' });
  const procStart = execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(asker.pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' } }).trim();
  writeFileSync(join(ctx.fixture.dir, 'sessions', `${asker.pid}.json`), JSON.stringify({ pid: asker.pid, sessionId: askingChat.id, cwd, startedAt: Date.now(), procStart, kind: 'interactive', entrypoint: 'cli', status: 'waiting', waitingFor: 'input needed', statusUpdatedAt: Date.now() }));
  try {
    await ctx.waitFor(`window.peix.session(${sid(askingChat.id)})?.status === 'needs-input' && !!${card(askingChat.id)}?.classList.contains('asking')`, { what: 'the chat asking' });
    await ctx.settle();
    await move(askingChat.id);
    out.askRest = await shows(askingChat.id);
    ctx.assert.deepEqual([out.askRest.act, out.askRest.shown], ['del', false], 'no ✓ on a chat asking, and no ✕ without ⌥');
    const at2 = await move(askingChat.id, 1);
    out.askAlt = await shows(askingChat.id);
    ctx.assert.deepEqual([out.askAlt.act, out.askAlt.shown, out.askAlt.x], ['del', true, 'block'], '⌥ brings it');
    await altClick(at2.x, at2.y);
    await ctx.waitFor(`!!${card(askingChat.id)}.querySelector('.act.armed.del')`, { what: 'armed' });
    out.armed = await ctx.evaluate(`${card(askingChat.id)}.querySelector('.act.armed.del').textContent`);
    ctx.assert.equal(out.armed, 'ends its question');
    ctx.assert.equal(asker.exitCode ?? asker.signalCode ?? null, null, 'nothing ended yet');
    await ctx.shot('2-armed');
    await ctx.evaluate(`${card(askingChat.id)}.querySelector('.act.armed.del').click()`);
    await ctx.waitFor(`window.peix.session(${sid(askingChat.id)}).removed === true`, { what: 'deleted, on the second' });
    await ctx.waitFor(`!window.peix.session(${sid(askingChat.id)}).alive`, { timeout: 15_000, what: 'its claude ended' });
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 800, y: 500, modifiers: 0 });
  } finally { try { asker.kill(); } catch {} }

  // ---- a done chat's ↩ ----
  await ctx.evaluate(`${card(doneChat.id)}.querySelector('.act').click()`);
  await ctx.waitFor(`window.peix.session(${sid(doneChat.id)}).done === true`, { what: 'ticked' });
  await ctx.settle();
  await ctx.waitFor(`!!${card(doneChat.id)}?.querySelector('.act[data-act="reopen"]')`, { what: 'its ↩' });
  const at3 = await move(doneChat.id, 1);
  out.doneAlt = await shows(doneChat.id);
  ctx.assert.deepEqual([out.doneAlt.act, out.doneAlt.x, out.doneAlt.tick], ['reopen', 'block', 'none'], '⌥ over ↩: the ✕');
  await altClick(at3.x, at3.y);
  await ctx.waitFor(`window.peix.session(${sid(doneChat.id)}).removed === true`, { what: 'a done chat deleted' });
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 800, y: 500, modifiers: 0 });
  await ctx.settle();

  // ---- the card's menu, ··· ----
  await ctx.evaluate(`(el => { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8 })); })(${card(byMenu.id)}.querySelector('.title'))`);
  out.menuRow = await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.textContent.startsWith('Delete from the board'))?.textContent`);
  ctx.assert.match(out.menuRow, /the transcript stays/);
  await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.textContent.startsWith('Delete from the board')).click()`);
  await ctx.waitFor(`window.peix.session(${sid(byMenu.id)}).removed === true`, { what: 'by its menu' });
  await ctx.openChat(byDots.id);
  await ctx.evaluate(`document.querySelector('#delBtn').click()`);
  await ctx.waitFor(`window.peix.session(${sid(byDots.id)}).removed === true`, { what: 'by ···' });
  await ctx.settle();

  // ---- found again: ⌥⌘K, typed; the bar; put back ----
  await ctx.key('KeyK');
  await ctx.waitFor(`document.querySelector('#pick').open`, { what: 'the picker' });
  out.emptyBox = await ctx.evaluate(`[...document.querySelectorAll('#pick .pkrow')].some(r => r.textContent.includes('Idle one'))`);
  ctx.assert.equal(out.emptyBox, false, 'not with nothing typed');
  await ctx.fill('#pickq', 'Idle one');
  await ctx.waitFor(`[...document.querySelectorAll('#pick .pkrow')].some(r => r.textContent.includes('Idle one'))`, { what: 'typed, it is found' });
  out.row = await ctx.evaluate(`[...document.querySelectorAll('#pick .pkrow')].find(r => r.textContent.includes('Idle one')).textContent`);
  ctx.assert.match(out.row, /deleted from the board/);
  await ctx.evaluate(`[...document.querySelectorAll('#pick .pkrow')].find(r => r.textContent.includes('Idle one')).click()`);
  await ctx.waitFor(`window.peix.state().current === ${sid(idle.id)} && !!document.querySelector('#undelGo')`, { what: 'open, the bar saying so' });
  out.bar = await ctx.evaluate(`document.querySelector('#resume .t b').textContent`);
  ctx.assert.equal(out.bar, 'Deleted from the board');
  ctx.assert.equal(await ctx.evaluate(`!!${card(idle.id)}`), false, 'open, with no card of its own');
  await ctx.settle(); await ctx.shot('3-found');
  await ctx.reload();
  await ctx.waitFor(`window.peix.state().current === ${sid(idle.id)}`, { what: 'a reload keeps it open' });
  ctx.assert.equal(await ctx.evaluate(`!!${card(byDots.id)}`), false, 'and the deleted off the list');
  await ctx.waitFor(`!!document.querySelector('#undelGo')`, { what: 'the bar again' });
  await ctx.evaluate(`document.querySelector('#undelGo').click()`);
  await ctx.waitFor(`!!${card(idle.id)} && !window.peix.session(${sid(idle.id)}).removed`, { what: 'its card back' });
  ctx.assert.equal((await session(idle.id)).done, false);
  return out;
}
