// Auto-tiling (2026-11-25, Settings › Terminal, prefs.autoTile): the first terminal splits the column by its shape; each
// one after it cuts the tile the keys are in in two along its longer side, as i3's autotiling (2026-11-25, later): a
// tall tile one over the other, a wide one side by side, so the cuts take turns; the new terminal in the second part.
// What this keeps honest: the tree the tiles are
// (state().tiles) and where each tile lands; every tile's terminal attached and fitted to its own body; ⌘2 turning the
// split the keys' tile is half of; the divider dragged into the tree; a terminal that exits taking
// its tile with it, the keys back in the tile it was cut from (2026-11-25, later); ⌃⌘←→ round one strip's tabs; the tiles across a reload; ⌘0 back to one half, nothing ended; and the switch off: today's tabs.
export const meta = { server: true, fake: true, fixture: 'auto', prefs: { autoTile: true } };

const grp = g => `document.querySelector('#groups > .grp[data-g="${g}"]')`;
const box = (ctx, g) =>
  ctx
    .evaluate(
      `(() => { const e = ${grp(g)}; if (!e || e.hidden) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }); })()`,
    )
    .then(JSON.parse);
const leaves = n => (!n ? [] : 'g' in n ? [n.g] : [...leaves(n.a), ...leaves(n.b)]);
const tiles = ctx => ctx.peix('state().tiles');
const fits = async (ctx, gs) => {
  await ctx.settle();
  for (const g of gs) {
    const d = await ctx.peix(`term(${g})`);
    ctx.assert.ok(
      d.screen.w <= d.body.w + 0.5 && d.screen.h <= d.body.h + 0.5 && d.screen.w > 100,
      `tile ${g}: the screen (${d.screen.w}×${d.screen.h}) fits the body (${d.body.w}×${d.body.h})`,
    );
  }
};
const attached = (ctx, gs) =>
  ctx.waitFor(`[${gs}].every(g => window.peix.term(g).ws === 1)`, { what: `tiles ${gs} attached` });
const prompt = (ctx, g) =>
  ctx.waitFor(
    `[...document.querySelectorAll('${g ? `#termBody${g + 1}` : '#termBody'} .xterm-rows > div')].some(r => /[$%❯]/.test(r.textContent))`,
    { what: `a prompt in tile ${g}` },
  );
const right = (a, b) => b.x >= a.x + a.w - 1,
  below = (a, b) => b.y >= a.y + a.h - 1;

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
  let t = await tiles(ctx);
  ctx.assert.deepEqual(
    t,
    { d: 'row', r: 0.5, a: { g: 0 }, b: { d: 'col', r: 0.5, a: { g: 1 }, b: { g: 2 } } },
    'the tall half cut one over the other',
  );
  ctx.assert.equal(await ctx.peix('state().focusG'), 2, 'the keys in the new tile');
  await prompt(ctx, 2);
  let b = await Promise.all([0, 1, 2].map(g => box(ctx, g)));
  ctx.assert.ok(
    right(b[0], b[1]) && below(b[1], b[2]) && Math.abs(b[1].x - b[2].x) <= 1,
    `one over the other on the right: ${JSON.stringify(b)}`,
  );
  ctx.assert.ok(b[2].w > b[2].h, `the new tile is wider than tall (${b[2].w}×${b[2].h})`);
  await fits(ctx, [0, 1, 2]);
  await ctx.shot('three');

  // ⌘T from that wide tile: cut side by side — the cuts take turns
  await ctx.cmd('KeyT');
  await ctx.waitFor(`JSON.stringify(window.peix.state().tiles).includes('"g":3') && window.peix.term(3).ws === 1`, {
    what: 'a fourth tile, attached',
  });
  t = await tiles(ctx);
  ctx.assert.deepEqual(
    t.b,
    { d: 'col', r: 0.5, a: { g: 1 }, b: { d: 'row', r: 0.5, a: { g: 2 }, b: { g: 3 } } },
    'the wide tile cut side by side',
  );
  await prompt(ctx, 3);
  b = await Promise.all([1, 2, 3].map(g => box(ctx, g)));
  ctx.assert.ok(
    below(b[0], b[1]) && right(b[1], b[2]) && Math.abs(b[1].y - b[2].y) <= 1,
    `the bottom right in two, side by side: ${JSON.stringify(b)}`,
  );
  await fits(ctx, [0, 1, 2, 3]);
  ctx.assert.equal(
    await ctx.evaluate(`document.querySelectorAll('#groups > .tdiv:not([hidden])').length`),
    3,
    'a divider a split',
  );
  await ctx.shot('four');

  // ⌘2: the second tile, and the split it is half of turned side by side — the same terminals, nothing re-attached
  const ids = await Promise.all([0, 1, 2, 3].map(g => ctx.peix(`term(${g}).id`)));
  await ctx.cmd('Digit2');
  await ctx.waitFor(`window.peix.state().tiles?.b.d === 'row'`, { what: 'the right half turned side by side' });
  ctx.assert.equal(await ctx.peix('state().focusG'), 1, '⌘2 is the second tile');
  b = await Promise.all([0, 1, 2, 3].map(g => box(ctx, g)));
  ctx.assert.ok(right(b[0], b[1]) && right(b[1], b[2]) && right(b[2], b[3]), `four across: ${JSON.stringify(b)}`);
  ctx.assert.deepEqual(
    await Promise.all([0, 1, 2, 3].map(g => ctx.peix(`term(${g}).id`))),
    ids,
    'the same terminals in the same tiles',
  );
  await fits(ctx, [0, 1, 2, 3]);

  // the root's divider dragged to 30 %: claude's part narrows, the tree keeps it
  const g = await box(ctx, 0),
    all = await ctx
      .evaluate(`JSON.stringify(document.querySelector('#groups').getBoundingClientRect())`)
      .then(JSON.parse);
  await ctx.drag('#groups > .tdiv[data-path=""]', { x: Math.round(all.left + all.width * 0.3), y: g.y + 100 });
  t = await tiles(ctx);
  ctx.assert.ok(Math.abs(t.r - 0.3) < 0.03, `the root at ${t.r}`);
  ctx.assert.ok(Math.abs((await box(ctx, 0)).w - all.width * 0.3) < 12, "claude's tile is 30 % of the column");
  await fits(ctx, [0, 1, 2, 3]);

  // ··· › tidy the tiles (2026-11-25): even cuts, claude's on the left, each next the left or top half of the room
  // left, the keys' tile the first of them (2026-11-26) — the keys in 3: 3 top right, then 1 and 2 at the bottom;
  // nothing re-attached; the keys where they were
  await ctx.evaluate(
    `document.querySelector('#termBody4').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`,
  );
  await ctx.waitFor(`window.peix.state().focusG === 3`, { what: 'the keys in the fourth tile' });
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
    await Promise.all([0, 1, 2, 3].map(g => ctx.peix(`term(${g}).id`))),
    ids,
    'the same terminals, tidied',
  );
  await ctx.settle();
  b = await Promise.all([0, 1, 2, 3].map(g => box(ctx, g)));
  ctx.assert.ok(
    right(b[0], b[1]) &&
      below(b[1], b[2]) &&
      right(b[3], b[2]) &&
      below(b[1], b[3]) &&
      Math.abs(b[0].w - all.width / 2) < 12,
    `0 | 1 over (3 | 2): ${JSON.stringify(b)}`,
  );
  await fits(ctx, [0, 1, 2, 3]);
  await ctx.shot('tidy');
  // ⌘2 turns its split back side by side, as before the tidy, for what follows
  await ctx.cmd('Digit2');
  await ctx.waitFor(`window.peix.state().tiles?.b.d === 'row'`, { what: 'the right side by side again' });

  // across a reload: the same tree, every tile attached again
  await ctx.reload();
  await ctx.openChat(chat.id);
  await attached(ctx, [0, 1, 2, 3]);
  ctx.assert.deepEqual(leaves(await tiles(ctx)), [0, 1, 3, 2], 'the tiles came back, as tidied');

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
    (await ctx.peix(`session(${JSON.stringify(chat.id)})`)).shells.filter(x => x.exited === null).length,
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
  const strip = await ctx.peix('state().strips[1]'),
    at = (await ctx.peix('state().halves'))[1];
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
  return { tree: t };
}
