// ⌘2 splits the chat column in two and ⌘1 / ⌘2 move the keys between the halves (2026-09-22). What this keeps
// honest: a tab lives in exactly one half, both halves can hold a live terminal at the same time, ⌘W leaves the half
// the keys were not in, and ⌘0 leaves the one they are in (with nothing split it is the chat's size again). Since
// 2026-09-25 a split always puts claude in the left half, whatever the column was showing. Since 2026-09-28 a half
// whose one tab is not a web page has no strip — a 2 px rule, the accent under the keys, the same height either way —
// and ⌥⌘W closes the tab the keys are in; an empty half keeps its strip (the drop, ⊟, ⨯). A tab dragged across is
// pane-tabs.mjs's: a page gives a half the second tab a drag starts from.
export const meta = { server: true, fake: true, fixture: 'auto' };

const halves = ctx => ctx.peix('state().halves');
const strips = ctx => ctx.evaluate(`JSON.stringify(['#ptabs', '#ptabsB'].map(id => [...document.querySelectorAll(id + ' .ptab')].map(b => b.dataset.tab)))`).then(JSON.parse);
// each strip: a rule (.lone) or a strip, and how tall
const rules = ctx => ctx.evaluate(`JSON.stringify(['#ptabs', '#ptabsB'].map(id => (e => ({ lone: e.classList.contains('lone'), h: Math.round(e.getBoundingClientRect().height) }))(document.querySelector(id))))`).then(JSON.parse);
const shown = ctx => ctx.evaluate(`JSON.stringify({ termA: !document.querySelector('#term').hidden, termB: !document.querySelector('#termB').hidden, log: !document.querySelector('#log').hidden, logIn: document.querySelector('#log').parentElement.id, empty: !!document.querySelector('.gempty') })`).then(JSON.parse);

export default async function (ctx) {
  const chat = ctx.fixture.chats[1];
  await ctx.openChat(chat.id);

  // the chat's own claude, in the one half there is
  await ctx.key('KeyC');
  await ctx.waitPrompt();
  ctx.assert.deepEqual(await halves(ctx), ['chat', null], 'one half, on the chat');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#grpB').hidden`), true, 'no second half yet');

  // ⌘2 splits, and the keys land in the right half — which has nothing to show yet, and says so; claude alone in the
  // left half has no strip, the empty half keeps its own
  await ctx.cmd('Digit2');
  await ctx.waitFor(`window.peix.state().split === true`, { what: 'the split' });
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, '⌘2 put the keys in the right half');
  ctx.assert.deepEqual(await halves(ctx), ['chat', null], 'the chat stayed on the left');
  ctx.assert.ok((await shown(ctx)).empty, 'the empty half says what would fill it');
  const e = await rules(ctx);
  ctx.assert.deepEqual(e.map(x => x.lone), [true, false], 'claude alone has a rule for a strip; the empty half keeps its strip');
  ctx.assert.equal(e[0].h, 2, 'the rule is 2 px');
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#ptabsB .pdrop') && !!document.querySelector('#ptabsB .gclose') && !!document.querySelector('#ptabsB .gturn')`), true, 'the empty strip: the drop, ⊟ and ⨯');
  await ctx.shot('empty');

  // ⌥⌘T opens the zsh in the half the keys are in: two live terminals, side by side, and no strip over either
  await ctx.key('KeyT');
  await ctx.waitFor(`JSON.stringify(window.peix.state().halves) === '["chat","shell"]'`, { what: 'the zsh in the right half' });
  await ctx.waitFor(`window.peix.term(1).ws === 1 && window.peix.term(0).ws === 1`, { what: 'both halves attached' });
  ctx.assert.deepEqual(await ctx.peix('state().strips'), [['chat'], ['shell']], 'each half holds its own tab');
  ctx.assert.deepEqual(await strips(ctx), [[], []], 'one tab each: neither strip lists anything');
  ctx.assert.deepEqual((await rules(ctx)).map(x => [x.lone, x.h]), [[true, 2], [true, 2]], 'both are a 2 px rule');
  const two = await shown(ctx);
  ctx.assert.deepEqual({ termA: two.termA, termB: two.termB, empty: two.empty }, { termA: true, termB: true, empty: false }, 'a drawer in each half');
  ctx.assert.ok(!two.log, 'the transcript is under the claude drawer, not beside it');
  await ctx.waitFor(`[...document.querySelectorAll('#termBodyB .xterm-rows > div')].some(r => /[$%❯]/.test(r.textContent))`, { what: 'the zsh prompt in the right half' });
  ctx.assert.ok((await ctx.screen(1)).length, 'ctx.screen(1) reads the right half');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#grpB').classList.contains('on') && !document.querySelector('#grp').classList.contains('on')`), true, 'the right half is the one marked');
  ctx.assert.ok(/inset/.test(await ctx.evaluate(`getComputedStyle(document.querySelector('#ptabsB')).boxShadow`)), 'and its rule is the accent');
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#ptabs')).boxShadow`), 'none', 'the other one\'s is not');
  await ctx.shot('split');

  // the fit is each half's own: neither terminal runs past its body
  for (const g of [0, 1]) {
    const d = await ctx.peix(`term(${g})`);
    ctx.assert.ok(d.screen.w <= d.body.w + 0.5 && d.screen.h <= d.body.h + 0.5, `half ${g}: the screen (${d.screen.w}×${d.screen.h}) fits the body (${d.body.w}×${d.body.h})`);
  }

  // the split is the chat's, not the board's: another chat is whole, and coming back finds it still in two
  const other = ctx.fixture.chats[0];
  await ctx.openChat(other.id);
  await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(other.id)}`, { what: 'the other chat' });
  ctx.assert.equal(await ctx.peix('state().split'), false, 'the other chat is one half');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#grpB').hidden`), true, 'and its right half is not even there');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#ptabs').classList.contains('lone')`), false, 'and no rule where its strip would be');
  await ctx.openChat(chat.id);
  await ctx.waitFor(`window.peix.state().split === true`, { what: 'the split chat still split' });
  await ctx.waitFor(`JSON.stringify(window.peix.state().halves) === '["chat","shell"]'`, { what: 'both halves back as they were' });
  await ctx.waitFor(`window.peix.term(1).ws === 1 && window.peix.term(0).ws === 1`, { what: 'both halves attached again' });

  // ⌘1 goes back to the left half — and neither terminal changes size, the rule being as tall lit as not; ⌥⌘→ walks
  // the halves as one row, into the zsh on the right
  const sizes = () => Promise.all([0, 1].map(g => ctx.peix(`term(${g})`).then(d => `${d.cols}×${d.rows}`)));
  const was = await sizes();
  await ctx.cmd('Digit1');
  ctx.assert.equal(await ctx.peix('state().focusG'), 0, '⌘1 put the keys back in the left half');
  ctx.assert.ok(/inset/.test(await ctx.evaluate(`getComputedStyle(document.querySelector('#ptabs')).boxShadow`)), 'the left rule lit');
  ctx.assert.deepEqual(await sizes(), was, 'moving the keys resized neither terminal');
  await ctx.key('ArrowRight');
  await ctx.waitFor(`window.peix.state().focusG === 1`, { what: '⌥⌘→ across the divider' });
  ctx.assert.equal(await ctx.peix('state().tab'), 'shell', 'onto the zsh, which stayed where it was');

  // ⌥⌘W on the chat's tab closes nothing: it has no ×, and says what does
  await ctx.cmd('Digit1');
  await ctx.key('KeyW');
  ctx.assert.match(await ctx.evaluate(`document.querySelector('.note')?.textContent || ''`), /chat tab stays/, 'a note says so');
  ctx.assert.deepEqual(await halves(ctx), ['chat', 'shell'], 'and both halves are as they were');
  await ctx.evaluate(`document.querySelectorAll('.note').forEach(n => n.remove())`);

  // ⌘W closes the half the keys are in — the left one, claude's — and the zsh is the column, claude a tab beside it
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), true, '⌘W was the board\'s to take');
  await ctx.waitFor(`window.peix.state().split === false`, { what: 'the split closed' });
  ctx.assert.deepEqual(await halves(ctx), ['shell', null], 'the half the keys were not in is what stayed');
  ctx.assert.deepEqual(await strips(ctx), [['chat', 'shell'], []], 'one half with two tabs: its strip lists both');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#ptabs').classList.contains('lone')`), false, 'a whole strip, not a rule');
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('KeyW', 'cmd')`), false, 'with one half ⌘W is the window\'s again');

  // ⌘2 again, from the zsh alone: claude takes the left half back and the zsh goes beside it (2026-09-25), the keys
  // staying on the zsh
  await ctx.cmd('Digit2');
  await ctx.waitFor(`JSON.stringify(window.peix.state().halves) === '["chat","shell"]'`, { what: 'the split again, claude on the left' });
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, 'the keys stay on the zsh, now in the right half');

  // ⌥⌘W there ends the zsh (2026-09-28) — the
  // keys go back to claude, and a split asked for by hand keeps its half, empty, with its strip back
  await ctx.key('KeyW');
  await ctx.waitFor(`!window.peix.session().shell || window.peix.session().shell.exited !== null`, { what: 'the zsh ended by ⌥⌘W' });   // it lingers, exited, for a while
  await ctx.waitFor(`JSON.stringify(window.peix.state().halves) === '["chat",null]'`, { what: 'the right half empty' });
  ctx.assert.equal(await ctx.peix('state().split'), true, 'the split asked for by hand stays');
  ctx.assert.equal(await ctx.peix('state().focusG'), 0, 'the keys went back to claude');
  ctx.assert.deepEqual((await rules(ctx)).map(x => x.lone), [true, false], 'the empty half has its strip again');
  ctx.assert.ok((await ctx.server.terminals()).every(t => !t.shell || t.exited !== null), 'the server ended the zsh');
  await ctx.shot('zsh-closed');
  // …and the ⨯ on that strip closes the half it sits in: the claude drawer is the whole column
  await ctx.evaluate(`document.querySelector('#ptabsB .gclose').click()`);
  await ctx.waitFor(`window.peix.state().split === false`, { what: 'the right half closed' });
  ctx.assert.deepEqual(await halves(ctx), ['chat', null], 'the right ⨯ leaves the chat');
  const end = await shown(ctx);
  ctx.assert.deepEqual({ termA: end.termA, termB: end.termB, logIn: end.logIn }, { termA: true, termB: false, logIn: 'gbody' },
    'the claude drawer is the whole column again');
  await ctx.shot('closed');

  // ⌘0 is ⌘W the other way round (2026-09-22): the half the keys are in stays, the other one goes
  await ctx.cmd('Digit2');
  await ctx.waitFor(`window.peix.state().split === true`, { what: 'split once more' });
  await ctx.key('KeyT');
  await ctx.waitFor(`JSON.stringify(window.peix.state().halves) === '["chat","shell"]'`, { what: 'a new zsh in the right half' });
  const before = await halves(ctx);
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, 'the keys in the right half');
  await ctx.cmd('Digit0');
  await ctx.waitFor(`window.peix.state().split === false`, { what: '⌘0 closed the other half' });
  ctx.assert.deepEqual(await halves(ctx), [before[1], null], 'what the keys were in is what the column keeps');
  // …and with one half it is what ⌘0 always was: the chat's size back to normal
  await ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true, bubbles: true, cancelable: true }))`);
  ctx.assert.ok((await ctx.peix('prefs()')).chatZoom < 1, '⌘− shrinks the chat');
  ctx.assert.equal(await ctx.evaluate(`window.peixKey('Digit0', 'cmd')`), true, '⌘0 is taken with one half too');
  ctx.assert.equal((await ctx.peix('prefs()')).chatZoom, 1, '…and there it is the size going back to normal');

  return { split: two, after: end };
}
