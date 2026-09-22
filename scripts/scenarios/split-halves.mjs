// ⌘2 splits the chat column in two and ⌘1 / ⌘2 move the keys between the halves (2026-09-22). What this keeps
// honest: a tab lives in exactly one half, both halves can hold a live terminal at the same time, choosing in one
// half what the other is showing makes the two trade places, and ⨯ leaves the half you were in.
export const meta = { server: true, fake: true, fixture: 'auto' };

const halves = ctx => ctx.peix('state().halves');
const shown = ctx => ctx.evaluate(`JSON.stringify({ termA: !document.querySelector('#term').hidden, termB: !document.querySelector('#termB').hidden, log: !document.querySelector('#log').hidden, logIn: document.querySelector('#log').parentElement.id, empty: !!document.querySelector('.gempty') })`).then(JSON.parse);

export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  await ctx.openChat(chat.id);

  // the chat's own claude, in the one half there is
  await ctx.key('KeyC');
  await ctx.waitPrompt();
  ctx.assert.deepEqual(await halves(ctx), ['chat', null], 'one half, on the chat');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#grpB').hidden`), true, 'no second half yet');

  // ⌘2 splits, and the keys land in the right half — which has nothing to show yet, and says so
  await ctx.cmd('Digit2');
  await ctx.waitFor(`window.peix.state().split === true`, { what: 'the split' });
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, '⌘2 put the keys in the right half');
  ctx.assert.deepEqual(await halves(ctx), ['chat', null], 'the chat stayed on the left');
  ctx.assert.ok((await shown(ctx)).empty, 'the empty half says what would fill it');
  await ctx.shot('empty');

  // ⌥⌘T opens the zsh in the half the keys are in: two live terminals, side by side
  await ctx.key('KeyT');
  await ctx.waitFor(`JSON.stringify(window.peix.state().halves) === '["chat","shell"]'`, { what: 'the zsh in the right half' });
  await ctx.waitFor(`window.peix.term(1).ws === 1 && window.peix.term(0).ws === 1`, { what: 'both halves attached' });
  const two = await shown(ctx);
  ctx.assert.deepEqual({ termA: two.termA, termB: two.termB, empty: two.empty }, { termA: true, termB: true, empty: false }, 'a drawer in each half');
  ctx.assert.ok(!two.log, 'the transcript is under the claude drawer, not beside it');
  await ctx.waitFor(`[...document.querySelectorAll('#termBodyB .xterm-rows > div')].some(r => /[$%❯]/.test(r.textContent))`, { what: 'the zsh prompt in the right half' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#grpB').classList.contains('on') && !document.querySelector('#grp').classList.contains('on')`), true, 'the right half is the one marked');
  ctx.assert.ok(/inset/.test(await ctx.evaluate(`getComputedStyle(document.querySelector('#ptabsB')).boxShadow`)), 'and it wears the accent rule');
  await ctx.shot('split');

  // the fit is each half's own: neither terminal runs past its body
  for (const g of [0, 1]) {
    const d = await ctx.peix(`term(${g})`);
    ctx.assert.ok(d.screen.w <= d.body.w + 0.5 && d.screen.h <= d.body.h + 0.5, `half ${g}: the screen (${d.screen.w}×${d.screen.h}) fits the body (${d.body.w}×${d.body.h})`);
  }

  // ⌘1 goes back to the left half; asking the *other* half's strip for the chat tab moves it there and the zsh
  // back here — they trade places — and the keys go with the click
  await ctx.cmd('Digit1');
  ctx.assert.equal(await ctx.peix('state().focusG'), 0, '⌘1 put the keys back in the left half');
  await ctx.evaluate(`document.querySelector('#ptabsB .ptab[data-tab="chat"]').click()`);
  await ctx.waitFor(`JSON.stringify(window.peix.state().halves) === '["shell","chat"]'`, { what: 'the two tabs trading places' });
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, 'the keys followed the click into the right half');
  ctx.assert.equal((await shown(ctx)).logIn, 'gbodyB', 'the transcript moved with the chat tab');

  // ⨯ closes the split, and the half the keys were in is what stays
  await ctx.evaluate(`document.querySelector('#ptabsB .gclose').click()`);
  await ctx.waitFor(`window.peix.state().split === false`, { what: 'the split closed' });
  ctx.assert.deepEqual(await halves(ctx), ['chat', null], 'the half the keys were in is what stayed');
  const end = await shown(ctx);
  ctx.assert.deepEqual({ termA: end.termA, termB: end.termB, logIn: end.logIn }, { termA: true, termB: false, logIn: 'gbody' },
    'the right half is gone and the claude drawer is the whole column again');
  await ctx.shot('closed');

  return { split: two, after: end };
}
