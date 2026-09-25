// The drawer after a re-attach: the zsh tab and back (⌥⌘T, then ⌥⌘C) — and the screen must be whole: prompt,
// rules, status bar — not the lone digits of a truncated replay (2026-09-20). Runs the fake claude on a fixture
// chat; the zsh is a real login shell. Since 2026-09-22 the zsh is a second tab, so it splits the column and opens
// in the right half, and since 2026-09-25 nothing trades places — so ⌘W folds the zsh's half away first, and the
// zsh tab and back happen in the one column, as they did before the split: the claude drawer lets go for the zsh
// and ⌥⌘C re-attaches it at the size it left at.
export const meta = { server: true, fake: true, fixture: 'auto' };
export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  await ctx.openChat(chat.id);
  await ctx.key('KeyC');                       // ⌥⌘C: resume it in the drawer
  await ctx.waitPrompt();
  await ctx.sleep(4000);                       // a few status ticks — cells rewritten, nothing else
  const live = await ctx.screen();
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#ptabs').hidden`), true, 'no tabs without a zsh');
  await ctx.shot('0-live', { x: 430, y: 0, width: 1270, height: 1000 });
  await ctx.key('KeyT');                       // ⌥⌘T: the zsh tab — the pane shows a shell now
  await ctx.waitFor(`!document.querySelector('#ptabsB').hidden && document.querySelector('#ptabsB .ptab.on')?.dataset.tab === 'shell'`, { what: 'the zsh tab, in the half the split made' });
  await ctx.waitFor(`window.peix.session()?.shell && window.peix.state().termId === window.peix.session().shell.id`, { what: 'the shell attached' });
  await ctx.sleep(1500);
  const shell = await ctx.screen(1);
  ctx.assert.ok(!shell.some(r => /fake mode on/.test(r)), 'the zsh tab shows the shell, not claude');
  await ctx.shot('1-zsh', { x: 430, y: 0, width: 1270, height: 1000 });
  await ctx.cmd('KeyW');                       // the zsh's half closes: one column, claude in it, the zsh a tab
  await ctx.waitFor(`window.peix.state().split === false && window.peix.state().termId === window.peix.session().terminal.id`, { what: 'one column, on claude' });
  await ctx.sleep(1000);
  await ctx.evaluate(`document.querySelector('#ptabs .ptab[data-tab="shell"]').click()`);   // the zsh tab: the claude drawer lets go
  await ctx.waitFor(`window.peix.state().termId === window.peix.session().shell.id`, { what: 'the zsh in the column, the claude drawer let go' });
  await ctx.sleep(800);
  await ctx.key('KeyC');                       // and back to the claude session, in the one column
  await ctx.waitPrompt(30_000, 0);
  await ctx.sleep(1500);
  const back = await ctx.screen(0);
  await ctx.shot('2-reattached', { x: 430, y: 0, width: 1270, height: 1000 });
  const has = (rows, re) => rows.some(r => re.test(r));
  ctx.assert.ok(has(back, /^❯/), 'the prompt is back');
  ctx.assert.ok(has(back, /^─{20,}/), 'the rules are back');
  // …and the strip costs the body exactly its own height, no more: a half whose rows are not placed by hand
  // slides the body into the `auto` row, where it sizes itself to the terminal instead of the pane (2026-09-22)
  const g = await ctx.evaluate(`JSON.stringify(['#grp', '#gbody', '#ptabs'].map(s => { const e = document.querySelector(s); return e.hidden ? 0 : Math.round(e.getBoundingClientRect().height); }))`).then(JSON.parse);
  ctx.assert.ok(Math.abs(g[0] - g[1] - g[2]) <= 1, `the body (${g[1]}) and the strip (${g[2]}) fill the half (${g[0]})`);
  ctx.assert.ok(g[1] > 400, `the body is the pane's height, not the terminal's (${g[1]})`);
  ctx.assert.ok(has(back, /fake mode on/), 'the status bar is whole');
  ctx.assert.ok(has(back, /elapsed \d+m \d\ds/), 'the timer line is whole, not lone digits');
  // the tab strip costs the drawer a row, so the fake's first line sits in scrollback now: the whole buffer has it
  ctx.assert.ok(has(await ctx.peix('buffer()'), /fake claude · session/), 'the scrollback came back with the screen');
  const terms = await ctx.server.terminals();
  const t = terms.find(x => !x.shell), sh = terms.find(x => x.shell);
  ctx.assert.ok(t.lastSnapshotChars > 200, 'the page was served a snapshot');
  ctx.assert.ok(sh && sh.exited === null && sh.sessionId === chat.id, 'the zsh is still there behind its tab');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#ptabs .ptab.on')?.dataset.tab`), 'chat', 'the claude tab is the one on');
  ctx.assert.deepEqual(await ctx.peix('state().halves'), ['chat', null], 'in the one column, the zsh a tab beside it');
  return { rowsLive: live.length, rowsShell: shell.length, rowsBack: back.length, snapshotChars: t.lastSnapshotChars, tail: back.slice(-4) };
}
