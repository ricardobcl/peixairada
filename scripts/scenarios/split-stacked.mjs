// ⌥⌘2 splits the chat column one half over the other, and ⌥⌘1 / ⌥⌘2 move the keys between the top and the bottom
// (2026-09-27). What this keeps honest: the digit is the pane and the modifier the layout — ⌘2 on a stacked split turns
// it side by side, ⌥⌘1 on a side-by-side one turns it stacked, and neither re-attaches a terminal; the divider lies
// across and drags up and down into a pref of its own; the layout is the chat's, follows it back, and outlives its
// split, so a tab opening beside the chat later comes back stacked; ⌘0 and ⌘W close halves the same way either way.
// Since 2026-09-28 a half with one tab that is not a web page has no strip, so ◫ / ⊟ are on an empty half's strip only
// — the keys turn the rest — and the zsh's × is the ··· menu's (or ⌥⌘W).
export const meta = { server: true, fake: true, fixture: 'auto' };

const halves = ctx => ctx.peix('state().halves');
const rects = ctx => ctx.evaluate(`JSON.stringify(Object.fromEntries(['#grp', '#grpB', '#gsplit', '#groups'].map(id => { const r = document.querySelector(id).getBoundingClientRect(); return [id.slice(1), { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }]; })))`).then(JSON.parse);
const layout = ctx => ctx.evaluate(`JSON.stringify({ stack: document.querySelector('#groups').classList.contains('stack'), dir: getComputedStyle(document.querySelector('#groups')).flexDirection, cursor: getComputedStyle(document.querySelector('#gsplit')).cursor, turn: document.querySelector('#ptabsB .gturn')?.textContent || null })`).then(JSON.parse);
const ids = ctx => Promise.all([0, 1].map(g => ctx.peix(`term(${g}).id`)));
const fits = async ctx => { for (const g of [0, 1]) { const d = await ctx.peix(`term(${g})`); ctx.assert.ok(d.screen.w <= d.body.w + 0.5 && d.screen.h <= d.body.h + 0.5, `half ${g}: the screen (${d.screen.w}×${d.screen.h}) fits the body (${d.body.w}×${d.body.h})`); } };

export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  await ctx.openChat(chat.id);
  await ctx.key('KeyC');
  await ctx.waitPrompt();

  // ⌥⌘2 splits one over the other: the second half is under the first, the divider lies across, the keys are below
  await ctx.key('Digit2');
  await ctx.waitFor(`window.peix.state().split === true && window.peix.state().stacked === true`, { what: 'the stacked split' });
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, '⌥⌘2 put the keys in the bottom half');
  let l = await layout(ctx), r = await rects(ctx);
  ctx.assert.deepEqual({ stack: l.stack, dir: l.dir, cursor: l.cursor }, { stack: true, dir: 'column', cursor: 'row-resize' }, 'the column stands, the divider resizes up and down');
  ctx.assert.ok(r.grpB.y >= r.grp.y + r.grp.h, `the second half (y ${r.grpB.y}) is under the first (ends ${r.grp.y + r.grp.h})`);
  ctx.assert.ok(Math.abs(r.grp.w - r.groups.w) <= 1 && Math.abs(r.grpB.w - r.groups.w) <= 1, 'both halves are as wide as the column');
  ctx.assert.ok(r.gsplit.h === 6 && Math.abs(r.gsplit.w - r.groups.w) <= 1, `the divider is 6 px tall across the column (${r.gsplit.w}×${r.gsplit.h})`);
  ctx.assert.equal(l.turn, '◫', 'the empty half\'s strip offers the side-by-side layout');
  await ctx.shot('stacked-empty');
  // …and turns it: side by side, then stacked again
  await ctx.evaluate(`document.querySelector('#ptabsB .gturn').click()`);
  await ctx.waitFor(`window.peix.state().stacked === false`, { what: 'the button turned it side by side' });
  ctx.assert.equal((await layout(ctx)).turn, '⊟', 'and now offers the stack');
  await ctx.evaluate(`document.querySelector('#ptabsB .gturn').click()`);
  await ctx.waitFor(`window.peix.state().stacked === true`, { what: 'the button stacked it again' });

  // ⌥⌘T puts the zsh in the bottom half: two live terminals, one over the other, each fitted to its own body
  await ctx.key('KeyT');
  await ctx.waitFor(`JSON.stringify(window.peix.state().halves) === '["chat","shell"]'`, { what: 'the zsh in the bottom half' });
  await ctx.waitFor(`window.peix.term(1).ws === 1 && window.peix.term(0).ws === 1`, { what: 'both halves attached' });
  await ctx.waitFor(`[...document.querySelectorAll('#termBodyB .xterm-rows > div')].some(r => /[$%❯]/.test(r.textContent))`, { what: 'the zsh prompt in the bottom half' });
  await fits(ctx);
  ctx.assert.deepEqual(await ctx.evaluate(`JSON.stringify(['#ptabs', '#ptabsB'].map(id => { const e = document.querySelector(id); return [e.classList.contains('lone'), Math.round(e.getBoundingClientRect().height)]; }))`).then(JSON.parse),
    [[true, 2], [true, 2]], 'one tab in each half: a 2 px rule over each, no strip');
  await ctx.shot('stacked');

  // ⌘2 on a stacked split turns it side by side — the same terminals in the same halves, nothing re-attached
  const before = await ids(ctx);
  await ctx.cmd('Digit2');
  await ctx.waitFor(`window.peix.state().stacked === false && window.peix.state().split === true`, { what: 'turned side by side' });
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, '⌘2 kept the keys in pane 2');
  l = await layout(ctx); r = await rects(ctx);
  ctx.assert.deepEqual({ dir: l.dir, cursor: l.cursor, turn: l.turn }, { dir: 'row', cursor: 'col-resize', turn: null }, 'a row again, the divider upright — and no ⊟, neither half having a strip');
  ctx.assert.ok(r.grpB.x >= r.grp.x + r.grp.w, `the second half (x ${r.grpB.x}) is right of the first (ends ${r.grp.x + r.grp.w})`);
  ctx.assert.deepEqual(await halves(ctx), ['chat', 'shell'], 'the tabs stayed where they were');
  ctx.assert.deepEqual(await ids(ctx), before, 'the same two terminals, still attached');
  await fits(ctx);
  await ctx.shot('turned');

  // ⌥⌘1 on a side-by-side split turns it stacked and takes the keys to the top
  await ctx.key('Digit1');
  await ctx.waitFor(`window.peix.state().stacked === true`, { what: 'stacked again' });
  ctx.assert.equal(await ctx.peix('state().focusG'), 0, '⌥⌘1 put the keys in the top half');
  ctx.assert.deepEqual(await ids(ctx), before, 'and re-attached nothing');

  // the divider drags up and down, into its own pref: side by side keeps its place
  r = await rects(ctx);
  await ctx.drag('#gsplit', { x: r.groups.x + Math.round(r.groups.w / 2), y: r.groups.y + Math.round(r.groups.h * .3) });
  const p = await ctx.peix('prefs()');
  ctx.assert.ok(Math.abs(p.stackAt - .3) < .02, `the stacked divider is at ${p.stackAt}`);
  ctx.assert.equal(p.splitAt, .5, 'the side-by-side divider did not move');
  r = await rects(ctx);
  ctx.assert.ok(Math.abs(r.grp.h - (r.groups.h - 6) * .3) <= 3, `the top half is 30 % of the column (${r.grp.h} of ${r.groups.h})`);
  await fits(ctx);
  await ctx.shot('dragged');

  // the layout is the chat's: another chat is whole, and coming back finds this one still stacked
  const other = ctx.fixture.chats[0];
  await ctx.openChat(other.id);
  await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(other.id)}`, { what: 'the other chat' });
  ctx.assert.deepEqual([await ctx.peix('state().split'), (await layout(ctx)).stack], [false, false], 'the other chat is one half, in a row');
  await ctx.openChat(chat.id);
  await ctx.waitFor(`window.peix.state().stacked === true`, { what: 'the stacked chat still stacked' });
  await ctx.waitFor(`JSON.stringify(window.peix.state().halves) === '["chat","shell"]'`, { what: 'both halves back as they were' });

  // ⌘W closes the half the keys are in — the top one — and the zsh is the column
  await ctx.cmd('Digit1');
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), true, '⌘W was the board\'s to take');
  await ctx.waitFor(`window.peix.state().split === false`, { what: 'the split closed' });
  ctx.assert.deepEqual(await halves(ctx), ['shell', null], 'the bottom half is what stayed');
  ctx.assert.equal((await layout(ctx)).stack, false, 'one half stands in a row');

  // the modifier says the layout of a split asked for by hand: ⌘2 now is side by side, ⌥⌘2 stacked
  await ctx.cmd('Digit2');
  await ctx.waitFor(`window.peix.state().split === true && window.peix.state().stacked === false`, { what: '⌘2: side by side' });
  ctx.assert.deepEqual(await halves(ctx), ['chat', 'shell'], 'claude on the left, the zsh beside it');
  await ctx.cmd('Digit0');
  await ctx.waitFor(`window.peix.state().split === false`, { what: '⌘0 closed the other half' });
  ctx.assert.deepEqual(await halves(ctx), ['shell', null], 'the half the keys were in stayed');
  await ctx.key('Digit2');
  await ctx.waitFor(`window.peix.state().split === true && window.peix.state().stacked === true`, { what: '⌥⌘2: stacked' });
  ctx.assert.deepEqual(await halves(ctx), ['chat', 'shell'], 'claude on top, the zsh under it');
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, 'the keys in the bottom half');

  // ⌘0 on a stacked split closes the other half the same way
  await ctx.cmd('Digit0');
  await ctx.waitFor(`window.peix.state().split === false`, { what: '⌘0 closed the top half' });
  ctx.assert.deepEqual(await halves(ctx), ['shell', null], 'the zsh, which the keys were in, is the column');

  // the layout outlives the split: the zsh ended and opened again, the board's own split comes back stacked
  await ctx.evaluate(`document.querySelector('#ptabs .ptab[data-tab="shell"] .x').click()`);
  await ctx.waitFor(`!window.peix.session().shell || window.peix.session().shell.exited !== null`, { what: 'the zsh ended' });   // it lingers, exited, for a while
  await ctx.waitFor(`JSON.stringify(window.peix.state().halves) === '["chat",null]'`, { what: 'the chat alone' });
  await ctx.key('KeyT');
  await ctx.waitFor(`JSON.stringify(window.peix.state().halves) === '["chat","shell"]'`, { what: 'a new zsh beside the chat' });
  ctx.assert.equal(await ctx.peix('state().stacked'), true, 'the split the board made itself is stacked, as the chat was left');
  await ctx.waitFor(`window.peix.term(1).ws === 1`, { what: 'the new zsh attached below' });
  await fits(ctx);
  await ctx.shot('remembered');

  // ··· ends the zsh — the × its half has no strip for — the keys come back to claude, and the split the board made
  // for the zsh folds with it
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  await ctx.evaluate(`document.querySelector('#hmenu #shellEndBtn').click()`);
  ctx.assert.equal(await ctx.peix('state().focusG'), 0, 'the keys went back to claude at once');
  await ctx.waitFor(`!window.peix.session().shell || window.peix.session().shell.exited !== null`, { what: 'the zsh ended from ···' });
  await ctx.waitFor(`window.peix.state().split === false`, { what: 'the board\'s own split folded' });
  ctx.assert.deepEqual(await halves(ctx), ['chat', null], 'claude is the column');
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#hmenu #shellEndBtn')`), false, 'and ··· has no zsh to end');
  await ctx.evaluate(`document.querySelector('#hmenu').close()`);

  return { stackAt: p.stackAt, splitAt: p.splitAt };
}
