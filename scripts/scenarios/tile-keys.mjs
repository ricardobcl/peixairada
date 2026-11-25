// The tiles by the keys (2026-11-25), Tile new terminals on and the column split: ⌥⌘←→↑↓ take the keys to the tile that
// way by where it stands (of several, the one the keys were in last), ⌥⌘⇧ + an arrow moves the tile — two side by side trade
// places, none that way and it is that whole side —, ⌘D / ⇧⌘D a new zsh in a tile cut side by side / one over the
// other whatever its shape, ⌥⌘⇧T a zsh on a tab where the keys are, never a tile. What this keeps honest: the tree (state().tiles) and the boxes after each key; no
// terminal attached again by a move; at an edge nothing moves, the chat neither; the switch off, the keys as ever
// (⌥⌘↑↓ the list's chats).
export const meta = { server: true, fake: true, fixture: 'auto', prefs: { autoTile: true } };

const grp = g => `document.querySelector('#groups > .grp[data-g="${g}"]')`;
const box = (ctx, g) =>
  ctx
    .evaluate(
      `(() => { const e = ${grp(g)}; if (!e || e.hidden) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }); })()`,
    )
    .then(JSON.parse);
const right = (a, b) => b.x >= a.x + a.w - 1,
  below = (a, b) => b.y >= a.y + a.h - 1;
const tiles = ctx => ctx.peix('state().tiles');
const focus = ctx => ctx.peix('state().focusG');

export default async function (ctx) {
  const shift = code =>
    ctx.evaluate(
      `document.dispatchEvent(new KeyboardEvent('keydown', { code: ${JSON.stringify(code)}, key: 'x', metaKey: true, altKey: true, shiftKey: true, bubbles: true, cancelable: true }))`,
    );
  const ctrlAlt = code =>
    ctx.evaluate(
      `document.dispatchEvent(new KeyboardEvent('keydown', { code: ${JSON.stringify(code)}, key: 'x', metaKey: true, altKey: true, ctrlKey: true, bubbles: true, cancelable: true }))`,
    );
  const cmdShift = code =>
    ctx.evaluate(
      `document.dispatchEvent(new KeyboardEvent('keydown', { code: ${JSON.stringify(code)}, key: 'x', metaKey: true, shiftKey: true, bubbles: true, cancelable: true }))`,
    );
  const go = async (code, want, what) => {
    await ctx.key(code);
    await ctx.waitFor(`window.peix.state().focusG === ${want}`, { what });
  };
  const chat = ctx.fixture.chats[1],
    other = ctx.fixture.chats[0];
  const walk = async (from, to) => {
    // ⌥⌘↑ or ↓, whichever way the list has `to` from `from`
    const ids = await ctx
      .evaluate(`JSON.stringify([...document.querySelectorAll('#slist > .card')].map(x => x.dataset.id))`)
      .then(JSON.parse);
    await ctx.key(ids.indexOf(to) < ids.indexOf(from) ? 'ArrowUp' : 'ArrowDown');
    await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(to)}`, { what: 'the next chat in the list' });
  };
  await ctx.openChat(chat.id);
  // one half, the setting on: ⌥⌘↑↓ are the list's still
  await walk(chat.id, other.id);
  await walk(other.id, chat.id);
  await ctx.waitFor(`document.querySelector('#log')?.dataset.sid === ${JSON.stringify(chat.id)}`, {
    what: 'its transcript',
  });
  await ctx.key('KeyC');
  await ctx.waitPrompt();

  // ⌘D from one half: split side by side. Then ←→ between the halves, ↑ nothing — and the chat stays
  await ctx.cmd('KeyD');
  await ctx.waitFor(`window.peix.state().split === true && window.peix.term(1).ws === 1`, {
    what: 'the zsh in the second half',
  });
  ctx.assert.equal(await ctx.peix('state().stacked'), false, '⌘D: side by side');
  await go('ArrowLeft', 0, "⌥⌘← to claude's half");
  await go('ArrowRight', 1, '⌥⌘→ back');
  await ctx.key('ArrowUp');
  ctx.assert.equal(await focus(ctx), 1, 'nothing above: the keys stay');
  ctx.assert.equal(await ctx.peix('state().current'), chat.id, '…and so does the chat');

  // a third tile, under the zsh: ↑↓ between the two on the right, ← to claude's, → back to the one of them the keys were
  // in last (2026-11-25, later: i3's focus stack), whichever that is
  await ctx.cmd('KeyT');
  await ctx.waitFor(`window.peix.state().tiles && window.peix.term(2).ws === 1`, { what: 'a third tile' });
  ctx.assert.deepEqual(
    await tiles(ctx),
    { d: 'row', r: 0.5, a: { g: 0 }, b: { d: 'col', r: 0.5, a: { g: 1 }, b: { g: 2 } } },
    'cut one over the other',
  );
  await go('ArrowUp', 1, '⌥⌘↑ to the top right');
  await go('ArrowDown', 2, '⌥⌘↓ to the bottom right');
  await go('ArrowLeft', 0, "⌥⌘← to claude's");
  await go('ArrowRight', 2, '⌥⌘→ back to the bottom one, the last of them');
  await go('ArrowUp', 1, '⌥⌘↑ to the top right');
  await go('ArrowLeft', 0, "⌥⌘← to claude's again");
  await go('ArrowRight', 1, '⌥⌘→ now to the top one');
  await go('ArrowDown', 2, '⌥⌘↓ to the bottom right again');

  // ⇧⌘D on that wide tile: one over the other all the same, not side by side as its shape would cut it
  await cmdShift('KeyD');
  await ctx.waitFor(`JSON.stringify(window.peix.state().tiles).includes('"g":3') && window.peix.term(3).ws === 1`, {
    what: 'a fourth tile, attached',
  });
  ctx.assert.deepEqual(
    (await tiles(ctx)).b.b,
    { d: 'col', r: 0.5, a: { g: 2 }, b: { g: 3 } },
    '⇧⌘D cut it one over the other',
  );
  ctx.assert.equal(await focus(ctx), 3, 'the keys in the new tile');
  await ctx.shot('cut');

  // ⌥⌘⇧ is i3's move (2026-11-25, later); the tree read as i3's lists — here claude's | (1 / 2 / 3), the keys in 3.
  const moved = async (code, want, what) => {
    await shift(code);
    await ctx.waitFor(
      `JSON.stringify((function s(n) { return 'g' in n ? n.g : [n.d, s(n.a), s(n.b)]; })(window.peix.state().tiles)) === ${JSON.stringify(JSON.stringify(want))}`,
      { what },
    );
  };
  const ids = await Promise.all([0, 1, 2, 3].map(g => ctx.peix(`term(${g}).id`)));
  // ← out of its stack: a column of its own between claude's and the stack — nothing cut in two, nothing re-attached
  await moved('ArrowLeft', ['row', 0, ['row', 3, ['col', 1, 2]]], 'the fourth a column of its own');
  ctx.assert.equal(await focus(ctx), 3, 'the keys went with it');
  await ctx.settle();
  let b = await Promise.all([0, 3, 1, 2].map(g => box(ctx, g)));
  ctx.assert.ok(
    right(b[0], b[1]) && right(b[1], b[2]) && below(b[2], b[3]) && Math.abs(b[1].h - b[0].h) <= 2,
    `0 | 3 | 1 over 2: ${JSON.stringify(b)}`,
  );
  ctx.assert.deepEqual(
    await Promise.all([0, 1, 2, 3].map(g => ctx.peix(`term(${g}).id`))),
    ids,
    'the same terminals in the same tiles',
  );
  ctx.assert.ok(
    (await Promise.all([0, 1, 2, 3].map(g => ctx.peix(`term(${g}).ws`)))).every(w => w === 1),
    'every tile still attached',
  );
  // ← again, in a row now: it and claude's trade places
  await moved('ArrowLeft', ['row', 3, ['row', 0, ['col', 1, 2]]], "traded with claude's");
  await moved('ArrowRight', ['row', 0, ['row', 3, ['col', 1, 2]]], 'and back');
  // → into the stack across the arrow: after the one of it the keys were in last (2), at its foot
  await moved('ArrowRight', ['row', 0, ['col', 1, ['col', 2, 3]]], 'into the stack, under 2');
  // ↑ in the stack: trades with 2, then 1; at its top, out: the whole top of the column
  await moved('ArrowUp', ['row', 0, ['col', 1, ['col', 3, 2]]], 'over 2');
  await moved('ArrowUp', ['row', 0, ['col', 3, ['col', 1, 2]]], 'over 1');
  await moved('ArrowUp', ['col', 3, ['row', 0, ['col', 1, 2]]], 'the whole top');
  const t = await tiles(ctx);
  await ctx.settle();
  b = await Promise.all([3, 0, 1].map(g => box(ctx, g)));
  ctx.assert.ok(
    below(b[0], b[1]) && below(b[0], b[2]) && b[0].w > b[1].w + b[2].w - 20,
    `across the top: ${JSON.stringify(b)}`,
  );
  await shift('ArrowUp');
  ctx.assert.deepEqual(await tiles(ctx), t, 'up again: it is the top already, nothing moves');
  await ctx.shot('moved');

  // ⌥⌘⇧T in that tile: a zsh on a tab beside its own, the tree as it was — no tile cut
  await shift('KeyT');
  await ctx.waitFor(`window.peix.state().strips[3]?.length === 2`, { what: 'a second tab in the fourth tile' });
  ctx.assert.deepEqual(await tiles(ctx), t, 'no new tile');
  ctx.assert.equal(await focus(ctx), 3, 'the keys still in it');
  const [first, added] = await ctx.peix('state().strips[3]');
  ctx.assert.equal((await ctx.peix('state().halves'))[3], added, 'the new one in front');
  await ctx.evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'x', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true }))`,
  );
  await ctx.waitFor(`window.peix.state().halves[3] === ${JSON.stringify(first)}`, {
    what: '⌃⌘← back to its first tab',
  });
  // ⌃⌥⌘T (2026-11-25): that tab out into a tile of its own, cut from this one — a wide tile, so side by side
  await ctrlAlt('KeyT');
  await ctx.waitFor(`JSON.stringify(window.peix.state().tiles).includes('"g":4') && window.peix.term(4).ws === 1`, {
    what: 'the tab a tile of its own, attached',
  });
  ctx.assert.deepEqual(
    (await tiles(ctx)).a,
    { d: 'row', r: 0.5, a: { g: 3 }, b: { g: 4 } },
    'cut from its tile side by side',
  );
  ctx.assert.deepEqual(await ctx.peix('state().strips[3]'), [added], 'the other tab left behind');
  ctx.assert.deepEqual(await ctx.peix('state().strips[4]'), [first], 'it, alone in the new tile');
  ctx.assert.equal(await focus(ctx), 4, 'the keys went with it');
  await ctrlAlt('KeyT');
  ctx.assert.ok(!JSON.stringify(await tiles(ctx)).includes('"g":5'), 'alone in its tile: nothing to take out');

  // ⇧⌘D from the other chat's one half: its first split one over the other, though the column is wide
  await ctx.openChat(other.id);
  // ⌥⌘⇧T with one half: a tab, no split
  await shift('KeyT');
  await ctx.waitFor(`window.peix.state().strips[0].length === 2`, { what: 'a zsh tab beside the chat' });
  ctx.assert.equal(await ctx.peix('state().split'), false, 'one half still');
  // ⌃⌥⌘T with one half: the zsh out beside the chat, side by side on the wide column, the chat on the left
  await ctrlAlt('KeyT');
  await ctx.waitFor(`window.peix.state().split === true && window.peix.term(1).ws === 1`, {
    what: 'the zsh out in the second half',
  });
  ctx.assert.deepEqual(
    await ctx.peix('state().strips'),
    [['chat'], [(await ctx.peix('state().halves'))[1]]],
    'the chat alone left, the zsh right',
  );
  ctx.assert.equal(await ctx.peix('state().stacked'), false, 'side by side');
  ctx.assert.ok(right(await box(ctx, 0), await box(ctx, 1)), 'the chat on the left');
  await ctx.cmd('Digit0'); // one half again, both tabs, for ⇧⌘D
  await ctx.waitFor(`window.peix.state().split === false`, { what: 'one half again' });
  await cmdShift('KeyD');
  await ctx.waitFor(`window.peix.state().split === true && window.peix.term(1).ws === 1`, {
    what: 'its zsh in the second half',
  });
  ctx.assert.equal(await ctx.peix('state().stacked'), true, '⇧⌘D: one over the other');
  ctx.assert.ok(below(await box(ctx, 0), await box(ctx, 1)), 'the zsh under the chat');
  // tidied (2026-11-25): two halves on a wide column go side by side, claude's on the left — no tree made
  await ctx.evaluate(`document.querySelector('#spiralBtn').click()`);
  await ctx.waitFor(`window.peix.state().stacked === false`, { what: 'the halves side by side' });
  ctx.assert.equal(await ctx.peix('state().tiles'), null, 'still two halves');
  ctx.assert.ok(right(await box(ctx, 0), await box(ctx, 1)), 'the chat on the left');

  // the switch off: ⌘D and ⌥⌘⇧← are no keys of the board's (they go on, to a page or the browser), ⌥⌘↑↓ the list's
  await ctx.evaluate(`document.querySelector('#autoTile').click()`);
  ctx.assert.equal((await ctx.peix('prefs()')).autoTile, false, 'the setting is off');
  ctx.assert.equal(await ctx.cmd('KeyD'), true, '⌘D left alone');
  ctx.assert.equal(await shift('ArrowLeft'), true, '⌥⌘⇧← left alone');
  ctx.assert.equal(await ctrlAlt('KeyT'), true, '⌃⌥⌘T left alone');
  ctx.assert.equal(await ctx.peix('state().tiles'), null, 'nothing cut');
  await walk(other.id, chat.id);
  return { tree: t };
}
