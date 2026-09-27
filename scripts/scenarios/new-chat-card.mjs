// A new chat has a card before its first word (2026-09-27, Ricardo: "when I clear the chat or when I select new chat, I
// don't see the card until I press enter to send the first message"). ＋ on a folder project starts claude in a drawer;
// the registry names the session before any transcript exists, and the board hid a live chat with no activity — a rule
// for VS Code's restored panels. Now the card is there at once: "(no messages yet)", the project's, first in the ready
// group by its start, the open one, its age counted from the start; the first prompt then titles it and it keeps its
// place, one card throughout. drawer-clear.mjs checks the same for /clear. Runs the fake claude.
export const meta = { server: true, fake: true, fixture: 'auto' };

const cardOf = (ctx, id) => ctx.evaluate(`(() => { const cards = [...document.querySelectorAll('#slist > .card')]; const c = cards.find(c => c.dataset.id === ${JSON.stringify(id)});
  return JSON.stringify(!c ? null : { at: cards.indexOf(c), n: cards.filter(x => x.dataset.id === ${JSON.stringify(id)}).length, active: c.classList.contains('active'), title: c.querySelector('.title').textContent,
    time: c.querySelector('.top .time')?.textContent ?? null, tip: c.querySelector('.top .time')?.title ?? null, snips: c.querySelectorAll('.snip').length, tick: !!c.querySelector('.act') }); })()`).then(JSON.parse);

export default async function (ctx) {
  const out = {};
  const [a, b] = ctx.fixture.chats;   // b's folder is the temp dir: no Taskfile, so ＋ starts claude without a question
  const known = [a.id, b.id];
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 2`, { what: 'the two fixture cards' });
  // ＋ acts on the project in view: select b's folder the way the page remembers it, and load again
  await ctx.evaluate(`(() => { const p = JSON.parse(localStorage.getItem('peixairada-prefs') || '{}'); p.project = ${JSON.stringify(b.cwd)}; localStorage.setItem('peixairada-prefs', JSON.stringify(p)); })()`);
  await ctx.send('Page.reload'); await ctx.sleep(800);
  await ctx.waitFor(`document.querySelector('#newChatBtn')?.dataset.key === ${JSON.stringify(b.cwd)} && document.querySelectorAll('#slist > .card').length === 1`, { what: "b's folder in view, ＋ on it" });
  out.ready0 = Number(await ctx.evaluate(`document.querySelector('#fchips .fchip.ready .n').textContent`));

  await ctx.evaluate(`document.querySelector('#newChatBtn').click()`);
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
  ctx.assert.equal(out.fresh.tick, false, 'nothing to tick done');
  ctx.assert.equal(out.ready1, out.ready0 + 1, 'the ready count took it in');
  ctx.assert.ok(out.session.startedAt && !out.session.lastActivity && out.session.alive && !out.session.file, `the summary: a live chat with a start and no transcript — ${JSON.stringify(out.session)}`);
  ctx.assert.equal(out.session.status, 'idle');

  // The first prompt titles the card, which stays where it was — the same card, not a second one.
  const type = async text => {
    await ctx.evaluate(`document.querySelector('#termBody textarea').dispatchEvent(new InputEvent('input', { data: ${JSON.stringify(text)}, inputType: 'insertText', bubbles: true }))`);
    await ctx.evaluate(`document.querySelector('#termBody textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))`);
  };
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
  return out;
}
