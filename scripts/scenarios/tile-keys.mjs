// The tiles by the keys (2026-11-25), Tile new terminals on and the column split: ⌥⌘←→↑↓ take the keys to the tile that
// way by where it stands (the way back the tile just left), ⌥⌘⇧ + an arrow moves the tile — two side by side trade
// places, none that way and it is that whole side —, ⌘D / ⇧⌘D a new zsh in a tile cut side by side / one over the
// other whatever its shape. What this keeps honest: the tree (state().tiles) and the boxes after each key; no
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

  // a third tile, under the zsh: ↑↓ between the two on the right, ← to claude's, → back to the one it left, not the top
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
  await go('ArrowRight', 2, '⌥⌘→ back to the bottom one it came from');

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

  // ⌥⌘⇧←: the fourth beside claude's, on its left; the right column closes over the room it left; nothing re-attached
  const ids = await Promise.all([0, 1, 2, 3].map(g => ctx.peix(`term(${g}).id`)));
  await shift('ArrowLeft');
  await ctx.waitFor(`window.peix.state().tiles?.a?.d === 'row'`, { what: 'the fourth moved left' });
  ctx.assert.deepEqual(
    await tiles(ctx),
    {
      d: 'row',
      r: 0.5,
      a: { d: 'row', r: 0.5, a: { g: 3 }, b: { g: 0 } },
      b: { d: 'col', r: 0.5, a: { g: 1 }, b: { g: 2 } },
    },
    "left of claude's, the rest closed up",
  );
  ctx.assert.equal(await focus(ctx), 3, 'the keys went with it');
  await ctx.settle();
  let b = await Promise.all([3, 0, 1, 2].map(g => box(ctx, g)));
  ctx.assert.ok(right(b[0], b[1]) && right(b[1], b[2]) && below(b[2], b[3]), `3 | 0 | 1 over 2: ${JSON.stringify(b)}`);
  ctx.assert.deepEqual(
    await Promise.all([0, 1, 2, 3].map(g => ctx.peix(`term(${g}).id`))),
    ids,
    'the same terminals in the same tiles',
  );
  ctx.assert.ok(
    (await Promise.all([0, 1, 2, 3].map(g => ctx.peix(`term(${g}).ws`)))).every(w => w === 1),
    'every tile still attached',
  );

  // ⌥⌘⇧→: back past claude's — two side by side trade places
  await shift('ArrowRight');
  await ctx.waitFor(`window.peix.state().tiles?.a?.a?.g === 0`, { what: 'the fourth moved right' });
  ctx.assert.deepEqual((await tiles(ctx)).a, { d: 'row', r: 0.5, a: { g: 0 }, b: { g: 3 } }, 'the two traded places');

  // ⌥⌘⇧↑ with nothing above: the whole top of the column
  await shift('ArrowUp');
  await ctx.waitFor(`window.peix.state().tiles?.d === 'col'`, { what: 'the fourth up top' });
  const t = await tiles(ctx);
  ctx.assert.deepEqual(t.a, { g: 3 }, 'the top, whole');
  await ctx.settle();
  b = await Promise.all([3, 0, 1].map(g => box(ctx, g)));
  ctx.assert.ok(
    below(b[0], b[1]) && below(b[0], b[2]) && b[0].w > b[1].w + b[2].w - 20,
    `across the top: ${JSON.stringify(b)}`,
  );
  await shift('ArrowUp');
  ctx.assert.deepEqual(await tiles(ctx), t, 'up again: it is the top already, nothing moves');
  await ctx.shot('moved');

  // ⇧⌘D from the other chat's one half: its first split one over the other, though the column is wide
  await ctx.openChat(other.id);
  await cmdShift('KeyD');
  await ctx.waitFor(`window.peix.state().split === true && window.peix.term(1).ws === 1`, {
    what: 'its zsh in the second half',
  });
  ctx.assert.equal(await ctx.peix('state().stacked'), true, '⇧⌘D: one over the other');
  ctx.assert.ok(below(await box(ctx, 0), await box(ctx, 1)), 'the zsh under the chat');

  // the switch off: ⌘D and ⌥⌘⇧← are no keys of the board's (they go on, to a page or the browser), ⌥⌘↑↓ the list's
  await ctx.evaluate(`document.querySelector('#autoTile').click()`);
  ctx.assert.equal((await ctx.peix('prefs()')).autoTile, false, 'the setting is off');
  ctx.assert.equal(await ctx.cmd('KeyD'), true, '⌘D left alone');
  ctx.assert.equal(await shift('ArrowLeft'), true, '⌥⌘⇧← left alone');
  ctx.assert.equal(await ctx.peix('state().tiles'), null, 'nothing cut');
  await walk(other.id, chat.id);
  return { tree: t };
}
