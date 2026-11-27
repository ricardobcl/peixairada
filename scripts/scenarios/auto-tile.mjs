// Auto-tiling (2026-11-25, Settings › Terminal, prefs.autoTile): the first terminal splits the column by its shape; each
// one after it cuts the tile the keys are in in two along its longer side, as i3's autotiling (2026-11-25, later): a
// tall tile one over the other, a wide one side by side, so the cuts take turns; the new terminal in the second part.
// What this keeps honest: the tree the tiles are
// (state().tiles) and where each tile lands; every tile's terminal attached and fitted to its own body; ⌘2 turning the
// split the keys' tile is half of; the divider dragged into the tree; a terminal that exits taking
// its tile with it, the keys back in the tile it was cut from (2026-11-25, later); ⌃⌘←→ round one strip's tabs; the tiles across a reload; ⌘0 back to one half, nothing ended; and the switch off: today's tabs.
export const meta = { server: true, fake: true, fixture: 'auto', prefs: { autoTile: true } };

const grp = tile => `document.querySelector('#groups > .grp[data-g="${tile}"]')`;

const box = (ctx, tile) =>
  ctx
    .evaluate(
      `(() => { const e = ${grp(tile)}; if (!e || e.hidden) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }); })()`,
    )
    .then(JSON.parse);

const leaves = node => (!node ? [] : 'g' in node ? [node.g] : [...leaves(node.a), ...leaves(node.b)]);
const tiles = ctx => ctx.peix('state().tiles');

const fits = async (ctx, gs) => {
  await ctx.settle();

  for (const tile of gs) {
    const term = await ctx.peix(`term(${tile})`);

    ctx.assert.ok(
      term.screen.w <= term.body.w + 0.5 && term.screen.h <= term.body.h + 0.5 && term.screen.w > 100,
      `tile ${tile}: the screen (${term.screen.w}×${term.screen.h}) fits the body (${term.body.w}×${term.body.h})`,
    );
  }
};

const attached = (ctx, gs) =>
  ctx.waitFor(`[${gs}].every(g => window.peix.term(g).ws === 1)`, { what: `tiles ${gs} attached` });

const prompt = (ctx, tile) =>
  ctx.waitFor(
    `[...document.querySelectorAll('${tile ? `#termBody${tile + 1}` : '#termBody'} .xterm-rows > div')].some(r => /[$%❯]/.test(r.textContent))`,
    { what: `a prompt in tile ${tile}` },
  );

// what the room checks read (2026-11-26, tileSizes: each tile's box and body by the tree) is the tiles as laid out
const sized = async (ctx, what) => {
  await ctx.settle();

  const off = await ctx
    .evaluate(
      `JSON.stringify(Object.entries(window.peix.tileSizes()).map(([g, z]) => { const e = document.querySelector('#groups > .grp[data-g="' + g + '"]'), r = e.getBoundingClientRect(), b = e.querySelector('.gbody').getBoundingClientRect(); return [+g, Math.max(Math.abs(z.w - r.width), Math.abs(z.h - r.height), Math.abs(z.bw - b.width), Math.abs(z.bh - b.height))]; }))`,
    )
    .then(JSON.parse);

  ctx.assert.ok(
    off.every(([, delta]) => delta < 1.5),
    `${what}: the tree's sizes are the tiles' own, to a pixel (${JSON.stringify(off)})`,
  );
};

const right = (first, second) => second.x >= first.x + first.w - 1;
const below = (first, second) => second.y >= first.y + first.h - 1;

export default async function (ctx) {
  const chat = ctx.fixture.chats[1];

  await ctx.openChat(chat.id);
  await ctx.key('KeyC');
  await ctx.waitPrompt();

  // the first zsh splits the column by its shape: wider than tall, side by side — two halves, no tree
  await ctx.key('KeyT');

  await ctx.waitFor(
    `JSON.stringify(window.peix.state().halves.map(k => k && k.split(':')[0])) === '["chat","shell"]'`,
    { what: 'the zsh in the second half' },
  );

  ctx.assert.equal(await tiles(ctx), null, 'two halves are no tree');
  ctx.assert.equal(await ctx.peix('state().stacked'), false, 'the wide column split side by side');
  await attached(ctx, [0, 1]);

  // ⌘T from the zsh: its half is taller than wide, so it is cut one over the other
  await ctx.cmd('KeyT');
  await ctx.waitFor(`window.peix.state().tiles && window.peix.term(2).ws === 1`, { what: 'a third tile, attached' });
  let tree = await tiles(ctx);

  ctx.assert.deepEqual(
    tree,
    { d: 'row', r: 0.5, a: { g: 0 }, b: { d: 'col', r: 0.5, a: { g: 1 }, b: { g: 2 } } },
    'the tall half cut one over the other',
  );

  ctx.assert.equal(await ctx.peix('state().focusG'), 2, 'the keys in the new tile');
  await prompt(ctx, 2);
  let boxes = await Promise.all([0, 1, 2].map(tile => box(ctx, tile)));

  ctx.assert.ok(
    right(boxes[0], boxes[1]) && below(boxes[1], boxes[2]) && Math.abs(boxes[1].x - boxes[2].x) <= 1,
    `one over the other on the right: ${JSON.stringify(boxes)}`,
  );

  ctx.assert.ok(boxes[2].w > boxes[2].h, `the new tile is wider than tall (${boxes[2].w}×${boxes[2].h})`);
  await fits(ctx, [0, 1, 2]);
  await ctx.shot('three');

  // ⌘T from that wide tile: cut side by side — the cuts take turns
  await ctx.cmd('KeyT');

  await ctx.waitFor(`JSON.stringify(window.peix.state().tiles).includes('"g":3') && window.peix.term(3).ws === 1`, {
    what: 'a fourth tile, attached',
  });

  tree = await tiles(ctx);

  ctx.assert.deepEqual(
    tree.b,
    { d: 'col', r: 0.5, a: { g: 1 }, b: { d: 'row', r: 0.5, a: { g: 2 }, b: { g: 3 } } },
    'the wide tile cut side by side',
  );

  await prompt(ctx, 3);
  boxes = await Promise.all([1, 2, 3].map(tile => box(ctx, tile)));

  ctx.assert.ok(
    below(boxes[0], boxes[1]) && right(boxes[1], boxes[2]) && Math.abs(boxes[1].y - boxes[2].y) <= 1,
    `the bottom right in two, side by side: ${JSON.stringify(boxes)}`,
  );

  await fits(ctx, [0, 1, 2, 3]);

  ctx.assert.equal(
    await ctx.evaluate(`document.querySelectorAll('#groups > .tdiv:not([hidden])').length`),
    3,
    'a divider a split',
  );

  await sized(ctx, 'four tiles');
  await ctx.shot('four');

  // ⌘2: the second tile, and the split it is half of turned side by side — the same terminals, nothing re-attached
  const ids = await Promise.all([0, 1, 2, 3].map(tile => ctx.peix(`term(${tile}).id`)));

  await ctx.cmd('Digit2');
  await ctx.waitFor(`window.peix.state().tiles?.b.d === 'row'`, { what: 'the right half turned side by side' });
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, '⌘2 is the second tile');
  boxes = await Promise.all([0, 1, 2, 3].map(tile => box(ctx, tile)));

  ctx.assert.ok(
    right(boxes[0], boxes[1]) && right(boxes[1], boxes[2]) && right(boxes[2], boxes[3]),
    `four across: ${JSON.stringify(boxes)}`,
  );

  ctx.assert.deepEqual(
    await Promise.all([0, 1, 2, 3].map(tile => ctx.peix(`term(${tile}).id`))),
    ids,
    'the same terminals in the same tiles',
  );

  await fits(ctx, [0, 1, 2, 3]);

  // the second tile, tall and narrow, zoomed to the wide column; ⌘T (2026-11-26): cut by its own shape — one over the
  // other — not the zoomed box's, which would have cut it side by side. ⌥⌘W folds the new tile again.
  await ctx.key('KeyT'); // its zsh's key again: the tile fills the column
  await ctx.waitFor(`window.peix.state().zoomed === 1`, { what: 'the second tile zoomed' });
  await ctx.cmd('KeyT');

  await ctx.waitFor(`JSON.stringify(window.peix.state().tiles).includes('"g":4') && window.peix.term(4).ws === 1`, {
    what: 'a fifth tile, attached',
  });

  ctx.assert.equal(await ctx.peix('state().zoomed'), null, 'the zoom gone with the cut');

  ctx.assert.deepEqual(
    (await tiles(ctx)).b.a,
    { d: 'col', r: 0.5, a: { g: 1 }, b: { g: 4 } },
    'the tall tile cut one over the other',
  );

  await ctx.key('KeyW');
  await ctx.waitFor(`!JSON.stringify(window.peix.state().tiles).includes('"g":4')`, { what: 'the fifth tile folded' });
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, 'the keys back in the second tile');

  // the root's divider dragged to 30 %: claude's part narrows, the tree keeps it
  const claudeBox = await box(ctx, 0);

  const all = await ctx
    .evaluate(`JSON.stringify(document.querySelector('#groups').getBoundingClientRect())`)
    .then(JSON.parse);

  await ctx.drag('#groups > .tdiv[data-path=""]', { x: Math.round(all.left + all.width * 0.3), y: claudeBox.y + 100 });
  tree = await tiles(ctx);
  ctx.assert.ok(Math.abs(tree.r - 0.3) < 0.03, `the root at ${tree.r}`);
  ctx.assert.ok(Math.abs((await box(ctx, 0)).w - all.width * 0.3) < 12, "claude's tile is 30 % of the column");
  await fits(ctx, [0, 1, 2, 3]);

  // a divider pressed, then the window left mid-drag (2026-11-26: ⌘-Tab, a release in another app — no pointerup):
  // the drag ends with the window's blur, and the pointer back over the board moves nothing
  const tdiv = `document.querySelector('#groups > .tdiv[data-path=""]')`;

  const press = await ctx
    .evaluate(`(r => JSON.stringify({ x: r.left + r.width / 2, y: r.top + 100 }))(${tdiv}.getBoundingClientRect())`)
    .then(JSON.parse);

  await ctx.evaluate(
    `${tdiv}.dispatchEvent(new PointerEvent('pointerdown', { clientX: ${press.x}, clientY: ${press.y}, button: 0, bubbles: true }))`,
  );

  ctx.assert.equal(await ctx.evaluate(`${tdiv}.classList.contains('drag')`), true, 'the divider pressed');
  await ctx.evaluate(`window.dispatchEvent(new Event('blur'))`);

  await ctx.evaluate(
    `window.dispatchEvent(new PointerEvent('pointermove', { clientX: ${Math.round(all.left + all.width * 0.6)}, clientY: ${press.y} }))`,
  );

  ctx.assert.equal((await tiles(ctx)).r, tree.r, 'a move after the blur moves nothing');

  ctx.assert.deepEqual(
    await ctx
      .evaluate(`JSON.stringify([${tdiv}.classList.contains('drag'), document.body.style.userSelect])`)
      .then(JSON.parse),
    [false, ''],
    'the divider let go, text selectable again',
  );

  // ··· › tidy the tiles (2026-11-25): even cuts, claude's on the left, each next the left or top half of the room
  // left, the keys' tile the first of them (2026-11-26) — the keys in 3: 3 top right, then 1 and 2 at the bottom;
  // nothing re-attached; the keys where they were
  await ctx.evaluate(
    `document.querySelector('#termBody4').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`,
  );

  await ctx.waitFor(`window.peix.state().focusG === 3`, { what: 'the keys in the fourth tile' });
  // its glyph is strokes, as on the tab strip, never a square filled solid (2026-11-26)
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  await ctx.waitFor(`document.querySelector('#hmenu').open`, { what: 'the header menu' });
  await ctx.settle();
  await ctx.shot('tidy-row');

  ctx.assert.deepEqual(
    await ctx.evaluate(
      `(s => ({ fill: s.fill, stroke: s.stroke !== 'none' }))(getComputedStyle(document.querySelector('#tidyBtn .ic')))`,
    ),
    { fill: 'none', stroke: true },
  );

  await ctx.evaluate(`document.querySelector('#hmenu').close()`);
  await ctx.evaluate(`document.querySelector('#tidyBtn').click()`);
  await ctx.waitFor(`window.peix.state().tiles?.r === .5`, { what: 'the tiles tidied' });

  ctx.assert.deepEqual(
    await tiles(ctx),
    {
      d: 'row',
      r: 0.5,
      a: { g: 0 },
      b: { d: 'col', r: 0.5, a: { g: 3 }, b: { d: 'row', r: 0.5, a: { g: 1 }, b: { g: 2 } } },
    },
    "the keys' tile the biggest after claude's",
  );

  ctx.assert.equal(await ctx.peix('state().focusG'), 3, 'the keys stayed');

  // the keys in 1: tidied again, 1 top right, then the rest in the tree's order — 3, 2 — under it
  await ctx.evaluate(
    `document.querySelector('#termBodyB').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`,
  );

  await ctx.waitFor(`window.peix.state().focusG === 1`, { what: 'the keys in the second tile' });
  const kept = 1;

  await ctx.evaluate(`document.querySelector('#tidyBtn').click()`);
  await ctx.waitFor(`window.peix.state().tiles?.b.a.g === 1`, { what: 'tidied again' });

  ctx.assert.deepEqual(
    await tiles(ctx),
    {
      d: 'row',
      r: 0.5,
      a: { g: 0 },
      b: { d: 'col', r: 0.5, a: { g: 1 }, b: { d: 'row', r: 0.5, a: { g: 3 }, b: { g: 2 } } },
    },
    'tidied, the bigger tiles left and up',
  );

  ctx.assert.equal(await ctx.peix('state().focusG'), kept, 'the keys stayed');

  ctx.assert.deepEqual(
    await Promise.all([0, 1, 2, 3].map(tile => ctx.peix(`term(${tile}).id`))),
    ids,
    'the same terminals, tidied',
  );

  await ctx.settle();
  boxes = await Promise.all([0, 1, 2, 3].map(tile => box(ctx, tile)));

  ctx.assert.ok(
    right(boxes[0], boxes[1]) &&
      below(boxes[1], boxes[2]) &&
      right(boxes[3], boxes[2]) &&
      below(boxes[1], boxes[3]) &&
      Math.abs(boxes[0].w - all.width / 2) < 12,
    `0 | 1 over (3 | 2): ${JSON.stringify(boxes)}`,
  );

  await fits(ctx, [0, 1, 2, 3]);
  await ctx.shot('tidy');
  // ⌘2 turns its split back side by side, as before the tidy, for what follows
  await ctx.cmd('Digit2');
  await ctx.waitFor(`window.peix.state().tiles?.b.d === 'row'`, { what: 'the right side by side again' });

  // across a reload: the same tree, every tile attached again, and the arrows' memory of the tiles (2026-11-26)
  const seen = await ctx.peix('state().seen');

  ctx.assert.ok(seen.length > 2, `the tiles the keys were in: ${seen}`);
  await ctx.reload();
  await ctx.openChat(chat.id);
  await attached(ctx, [0, 1, 2, 3]);
  ctx.assert.deepEqual(leaves(await tiles(ctx)), [0, 1, 3, 2], 'the tiles came back, as tidied');
  ctx.assert.deepEqual(await ctx.peix('state().seen'), seen, 'which the keys were in last, as before');

  // ⌥⌘W on the fourth: its zsh ends, and its tile with it — the one it was cut from takes the room
  await ctx.evaluate(
    `document.querySelector('#termBody4').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`,
  );

  await ctx.waitFor(`window.peix.state().focusG === 3`, { what: 'the keys in the fourth tile' });
  await ctx.key('KeyW');

  await ctx.waitFor(
    `JSON.stringify(window.peix.state().tiles?.b) === JSON.stringify({ d: 'row', r: .5, a: { g: 1 }, b: { g: 2 } })`,
    { what: 'the fourth tile folded' },
  );

  ctx.assert.equal(await box(ctx, 3), null, 'its tile hidden');
  ctx.assert.equal(await ctx.peix('state().focusG'), 2, 'the keys back in the tile it was cut from, not the first');
  await fits(ctx, [0, 1, 2]);

  // exit in the second tile, a first part: the keys go to its sibling's nearest tile — the third, not claude's
  await ctx.evaluate(
    `document.querySelector('#termBodyB').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`,
  );

  await ctx.waitFor(`window.peix.state().focusG === 1`, { what: 'the keys in the second tile' });
  await ctx.type('exit', 1);

  await ctx.waitFor(`JSON.stringify(window.peix.state().tiles?.b) === JSON.stringify({ g: 2 })`, {
    what: 'the second tile folded',
  });

  ctx.assert.equal(await ctx.peix('state().focusG'), 2, 'the keys in the tile beside it');

  // ⌘0: only the tile the keys are in — one half, every tab in its strip, nothing ended
  await ctx.cmd('Digit0');
  await ctx.waitFor(`window.peix.state().split === false`, { what: 'one half' });
  ctx.assert.equal(await tiles(ctx), null, 'no tree');

  ctx.assert.equal(
    await ctx.evaluate(`document.querySelectorAll('#groups > .tdiv:not([hidden])').length`),
    0,
    'no dividers',
  );

  ctx.assert.equal(
    (await ctx.peix(`session(${JSON.stringify(chat.id)})`)).shells.filter(shell => shell.exited === null).length,
    1,
    'the zsh left still runs',
  );

  // the switch off: today's — the next terminal splits once, the one after is a tab beside it
  await ctx.evaluate(`document.querySelector('#autoTile').click()`);
  ctx.assert.equal((await ctx.peix('prefs()')).autoTile, false, 'the setting is off');
  await ctx.key('KeyC');
  await ctx.cmd('KeyT');

  await ctx.waitFor(`window.peix.state().split === true && window.peix.state().strips[1].length === 2`, {
    what: 'the new zsh in the second half',
  });

  await ctx.cmd('KeyT');
  await ctx.waitFor(`window.peix.state().strips[1].length === 3`, { what: 'another, as a tab' });
  ctx.assert.equal(await tiles(ctx), null, 'still two halves');
  await ctx.shot('off');

  // ⌃⌘←→ (2026-11-25): the tabs of the half the keys are in, its strip alone, round — never claude's on the other side
  const ctrl = code =>
    ctx.evaluate(
      `document.dispatchEvent(new KeyboardEvent('keydown', { code: ${JSON.stringify(code)}, key: 'x', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true }))`,
    );

  const strip = await ctx.peix('state().strips[1]');
  const at = (await ctx.peix('state().halves'))[1];

  for (const [code, step] of [
    ['ArrowRight', 1],
    ['ArrowRight', 2],
    ['ArrowRight', 3],
    ['ArrowLeft', 2],
  ]) {
    const want = strip[(strip.indexOf(at) + step) % strip.length];

    await ctrl(code);

    await ctx.waitFor(`window.peix.state().halves[1] === ${JSON.stringify(want)} && window.peix.state().focusG === 1`, {
      what: `⌃⌘${code === 'ArrowRight' ? '→' : '←'} to ${want}`,
    });
  }

  ctx.assert.equal((await ctx.peix('state().halves'))[0], 'chat', "claude's half as it was");
  return { tree };
}
