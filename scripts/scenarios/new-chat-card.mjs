// A new chat has a card before its first word (2026-09-27). ⌥⌘N ⏎ ⏎ on a folder project starts claude in a drawer;
// the registry names the session before any transcript exists, and the board hid a live chat with no activity — a rule
// for VS Code's restored panels. Now the card is there at once: "(no messages yet)", the project's, first in the ready
// group by its start, the open one, its age counted from the start; the first prompt then titles it and it keeps its
// place, one card throughout. drawer-clear.mjs checks the same for /clear. The empty card carries the ✓ like any idle
// chat (the same day), and ticked it is gone — its
// drawer ended, no dimmed card left, since an empty chat has nothing to resume — and the column moves on to the card
// below it (2026-09-30, tick-next.mjs). Runs the fake claude.
import { waitFor } from '../../lib/testserver.mjs';

export const meta = { server: true, fake: true, fixture: 'auto' };

const cardOf = (ctx, id) => ctx.evaluate(`(() => { const cards = [...document.querySelectorAll('#slist > .card')]; const c = cards.find(c => c.dataset.id === ${JSON.stringify(id)});
  return JSON.stringify(!c ? null : { at: cards.indexOf(c), n: cards.filter(x => x.dataset.id === ${JSON.stringify(id)}).length, active: c.classList.contains('active'), title: c.querySelector('.title').textContent,
    time: c.querySelector('.trow .time')?.textContent ?? null, tip: c.querySelector('.trow .time')?.title ?? null, snips: c.querySelectorAll('.snip').length, tick: !!c.querySelector('.act') }); })()`).then(JSON.parse);

export default async function (ctx) {
  const out = {};
  const [a, b] = ctx.fixture.chats;   // b's folder is the temp dir: no Taskfile, so ⌥⌘N ⏎ ⏎ starts claude without a question
  const known = [a.id, b.id];
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 2`, { what: 'the two fixture cards' });
  // ⌥⌘N opens on the project in view (＋ went on 2026-09-28): select b's folder the way the page remembers it, and load again
  await ctx.evaluate(`(() => { const p = JSON.parse(localStorage.getItem('peixairada-prefs') || '{}'); p.project = ${JSON.stringify(b.cwd)}; localStorage.setItem('peixairada-prefs', JSON.stringify(p)); })()`);
  await ctx.reload();
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 1`, { what: "b's folder in view" });
  // ⌥⌘N, ⏎ on the project it opened on, ⏎ on ＋ new chat
  const newChat = async () => {
    await ctx.key('KeyN');
    await ctx.waitFor(`document.querySelector('#pick').open && document.querySelector('#picklist .pkrow.sel .cur')?.textContent === 'current'`, { what: 'the project step on the project in view' });
    const enter = () => ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
    await enter();
    await ctx.waitFor(`document.querySelector('#picklist .pkrow.sel')?.textContent.includes('new chat')`, { what: 'the chats step, ＋ new chat selected' });
    await enter();
  };
  out.ready0 = Number(await ctx.evaluate(`document.querySelector('#fchips .fchip.ready .n').textContent`));

  await newChat();
  await ctx.waitFor(`(s => s.current && !${JSON.stringify(known)}.includes(s.current) && s.termSession === s.current)(window.peix.state())`, { what: 'the board on the new chat, its drawer running it', timeout: 20_000 });
  const id = (await ctx.peix('state()')).current;
  // The card, before anything was typed: the session push follows the terminal event by a beat, so wait for it.
  await ctx.waitFor(`!!document.querySelector('#slist > .card[data-id=${JSON.stringify(id)}]')`, { what: 'a card for the new chat', timeout: 5000 });
  out.fresh = await cardOf(ctx, id);
  out.session = await ctx.peix(`session(${JSON.stringify(id)})`).then(s => ({ title: s.title, startedAt: s.startedAt, lastActivity: s.lastActivity, alive: s.alive, status: s.status, file: s.file }));
  out.ready1 = Number(await ctx.evaluate(`document.querySelector('#fchips .fchip.ready .n').textContent`));
  await ctx.waitPrompt();
  await ctx.shot('fresh', { x: 0, y: 0, width: 1270, height: 600 });
  ctx.assert.ok(out.fresh, 'the new chat has a card before its first word');
  ctx.assert.equal(out.fresh.n, 1, 'one card for it');
  ctx.assert.equal(out.fresh.title, '(no messages yet)', 'titled as the empty chat it is');
  ctx.assert.equal(out.fresh.active, true, 'and it is the open one');
  ctx.assert.equal(out.fresh.at, 0, 'first in the list — the newest thing you did');
  ctx.assert.match(out.fresh.time || '', /^\d+s$/, 'its age counts from its start');
  ctx.assert.match(out.fresh.tip || '', /^started \d+s ago · no messages yet$/, '…and the tooltip says which start');
  ctx.assert.equal(out.fresh.snips, 0, 'no words on it yet');
  ctx.assert.equal(out.fresh.tick, true, 'the ✓ is there to clean it up');
  ctx.assert.equal(out.ready1, out.ready0 + 1, 'the ready count took it in');
  ctx.assert.ok(out.session.startedAt && !out.session.lastActivity && out.session.alive && !out.session.file, `the summary: a live chat with a start and no transcript — ${JSON.stringify(out.session)}`);
  ctx.assert.equal(out.session.status, 'idle');

  // The first prompt titles the card, which stays where it was — the same card, not a second one.
  const type = text => ctx.type(text);
  await type('hello from the board');
  await ctx.waitFor(`window.peix.session(${JSON.stringify(id)})?.lastPrompt === 'hello from the board'`, { what: 'the prompt on the summary', timeout: 15_000 });
  await ctx.sleep(300);
  out.spoken = await cardOf(ctx, id);
  out.after = await ctx.peix(`session(${JSON.stringify(id)})`).then(s => ({ title: s.title, startedAt: s.startedAt, lastActivity: s.lastActivity, file: s.file }));
  await ctx.shot('spoken', { x: 0, y: 0, width: 1270, height: 600 });
  ctx.assert.equal(out.spoken.n, 1, 'still one card');
  ctx.assert.equal(out.spoken.title, 'hello from the board', 'the prompt is its title now');
  ctx.assert.equal(out.spoken.at, 0, 'and it kept its place');
  ctx.assert.equal(out.spoken.active, true);
  ctx.assert.ok(out.after.file && out.after.lastActivity, 'the transcript exists now');
  ctx.assert.equal(out.after.startedAt, out.session.startedAt, 'the start is carried over the transcript arriving');

  // A second empty chat, ticked done before a word: the card goes at once, and the drawer with it. The count is read
  // once the first chat's reply has landed (2026-10-09): the fake takes seven 60 ms lines over it, and read while it
  // was still clauding the count was one short of what it came back to.
  await ctx.waitFor(`window.peix.session(${JSON.stringify(id)})?.status === 'idle' && document.querySelector('#fchips .fchip.working .n')?.textContent === '0'`, { what: 'the first chat\'s reply landed', timeout: 10_000 });
  const ready2 = Number(await ctx.evaluate(`document.querySelector('#fchips .fchip.ready .n').textContent`));
  await newChat();
  await ctx.waitFor(`(s => s.current && !${JSON.stringify([...known, id])}.includes(s.current) && s.termSession === s.current)(window.peix.state())`, { what: 'the board on a second new chat', timeout: 20_000 });
  const id2 = (await ctx.peix('state()')).current;
  await ctx.waitFor(`!!document.querySelector('#slist > .card[data-id=${JSON.stringify(id2)}] .act[data-act=done]')`, { what: "the second chat's card, with its ✓", timeout: 5000 });
  await ctx.evaluate(`document.querySelector('#slist > .card[data-id=${JSON.stringify(id2)}] .act').click()`);
  await ctx.waitFor(`!document.querySelector('#slist > .card[data-id=${JSON.stringify(id2)}]')`, { what: 'the ticked empty card gone', timeout: 5000 });
  await waitFor(async () => (await ctx.server.terminals()).every(t => t.sessionId !== id2 || t.exited !== null), { what: "the ticked chat's drawer ended", timeout: 10_000 });
  await ctx.waitFor(`(s => s && !s.alive && s.done)(window.peix.session(${JSON.stringify(id2)}))`, { what: 'its claude gone, the chat done', timeout: 10_000 });
  await ctx.sleep(300);
  out.ticked = { card: await cardOf(ctx, id2), first: await cardOf(ctx, id), ready: Number(await ctx.evaluate(`document.querySelector('#fchips .fchip.ready .n').textContent`)),
    done: Number(await ctx.evaluate(`document.querySelector('#fchips .fchip.done .n')?.textContent || 0`)),
    column: JSON.parse(await ctx.evaluate(`JSON.stringify({ current: window.peix.state().current, hash: location.hash, head: document.querySelector('#shead').textContent, log: document.querySelector('#log').textContent, tinted: document.querySelector('#chat').classList.contains('tinted') })`)) };
  await ctx.shot('ticked', { x: 0, y: 0, width: 1270, height: 600 });
  ctx.assert.equal(out.ticked.card, null, 'no card for the ticked empty chat, not even a dimmed one');
  ctx.assert.ok(out.ticked.first, 'the first new chat keeps its card');
  ctx.assert.equal(out.ticked.ready, ready2, 'the ready count is back where it was');
  ctx.assert.equal(out.ticked.done, 0, 'and done did not take it in');
  ctx.assert.deepEqual({ current: out.ticked.column.current, hash: out.ticked.column.hash }, { current: id, hash: '#' + id },
    'the column moved on to the card below the ticked one: the first new chat');
  await ctx.waitFor(`document.querySelector('#shead').textContent.includes('hello from the board')`, { what: 'the first chat\'s header drawn' });
  return out;
}
