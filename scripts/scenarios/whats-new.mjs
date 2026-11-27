// What's new (2026-11-24): once the board is quiet, a dialog of four pages — each an example of Space, its picture that
// example at work —; ← → and the dots move; the last page's button opens Space and the news is seen. Later closes it
// until the next day, once; closed again, seen. The keys' sheet and ⌥⌘L open it again whenever. Opened by itself it
// waits while a box or a terminal has the keys, and then puts them on the dialog, not on Next (2026-11-24, review).
export const meta = { server: true, fixture: 'auto', prefs: { newsSeen: [], space: false } };

export default async function (ctx) {
  const out = {};

  const key = async (key, code, vk) => {
    await ctx.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  };

  const page = () =>
    ctx.evaluate(
      `({ tag: document.querySelector('#newsTag').textContent, title: document.querySelector('#newsTitle').textContent, next: document.querySelector('#newsNext').textContent, back: !document.querySelector('#newsBack').hidden, later: !document.querySelector('#newsLater').hidden, dots: document.querySelectorAll('#newsDots button').length, pic: document.querySelector('#newsPic').children.length })`,
    );

  const open = () => ctx.evaluate(`document.querySelector('#news').open`);

  await ctx.waitFor(`document.querySelector('#news').open`, { what: 'what’s new, on its own' });
  await ctx.settle();
  out.first = await page();

  ctx.assert.deepEqual(
    [out.first.tag, out.first.title, out.first.next, out.first.back, out.first.later, out.first.dots],
    ['New in Space · 1 of 4', 'Answer without opening the chat', 'Next', false, true, 4],
  );

  ctx.assert.ok(out.first.pic > 7, 'a picture');

  ctx.assert.equal(
    await ctx.evaluate(`document.activeElement.id`),
    'news',
    'opened by itself: the keys on the dialog, not on Next',
  );

  await ctx.shot('whats-new-1');
  await key('ArrowRight', 'ArrowRight', 39);
  ctx.assert.equal((await page()).title, 'Find what needs a look', '→ the next page');
  await ctx.settle();
  await ctx.shot('whats-new-2');
  await ctx.evaluate(`document.querySelector('#newsDots button[data-i="2"]').click()`);
  ctx.assert.equal((await page()).title, 'See where each PR stands', 'a dot: its page');
  await ctx.settle();
  await ctx.shot('whats-new-3');
  await key('ArrowLeft', 'ArrowLeft', 37);
  ctx.assert.equal((await page()).tag, 'New in Space · 2 of 4', '← back');

  out.inView = await ctx.evaluate(
    `(r => r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth)(document.querySelector('#news').getBoundingClientRect())`,
  );

  ctx.assert.equal(out.inView, true);

  // Later: gone till tomorrow, not seen; a reload does not bring it
  await ctx.evaluate(`document.querySelector('#newsLater').click()`);
  await ctx.waitFor(`!document.querySelector('#news').open && peix.prefs().newsLater > 0`, { what: 'Later: closed' }); // its close event a task after
  out.later = await ctx.evaluate(`[peix.prefs().newsSeen, peix.prefs().newsLater > Date.now()]`);
  ctx.assert.deepEqual(out.later, [[], true], 'not seen, put off till tomorrow');
  await ctx.reload();
  await ctx.sleep(2500);
  ctx.assert.equal(await open(), false, 'not again today');

  // tomorrow: once more; closed by ×, seen
  await ctx.evaluate(
    `(k => { const p = JSON.parse(localStorage.getItem(k)); p.newsLater = 1; localStorage.setItem(k, JSON.stringify(p)); })('peixairada-prefs')`,
  );

  await ctx.reload();

  await ctx.evaluate(
    `document.body.appendChild(Object.assign(document.createElement('input'), { id: 'held' })).focus()`,
  );

  await ctx.sleep(2500);
  ctx.assert.equal(await open(), false, 'a box with the keys: it waits');
  await ctx.evaluate(`document.querySelector('#held').remove()`);
  await ctx.waitFor(`document.querySelector('#news').open`, { what: 'the next day, once more, the box let go' });
  ctx.assert.equal(await ctx.evaluate(`document.activeElement.id`), 'news', 'the keys on the dialog again');
  await ctx.evaluate(`document.querySelector('#newsX').click()`);

  await ctx.waitFor(`!document.querySelector('#news').open && peix.prefs().newsSeen.includes('space')`, {
    what: '×: seen',
  });

  await ctx.reload();
  await ctx.sleep(2500);
  ctx.assert.equal(await open(), false, 'seen: never by itself again');

  // asked for: from the keys' sheet; the last page opens Space
  await ctx.evaluate(`document.querySelector('#ksNews').click()`);
  await ctx.waitFor(`document.querySelector('#news').open`, { what: 'from the keys’ sheet' });
  ctx.assert.equal(await ctx.evaluate(`document.activeElement.id`), 'newsNext', 'asked for: the keys on Next');
  for (let index = 0; index < 3; index++) await key('ArrowRight', 'ArrowRight', 39);
  out.last = await page();

  ctx.assert.deepEqual(
    [out.last.title, out.last.next, out.last.later, out.last.back],
    ['Tidy up in one go', 'Open Space', false, true],
    'the last page: the thing itself',
  );

  await ctx.settle();
  await ctx.shot('whats-new-4');
  await ctx.evaluate(`document.querySelector('#newsNext').click()`);

  await ctx.waitFor(
    `!document.querySelector('#news').open && peix.prefs().space === true && document.querySelector('#space') && getComputedStyle(document.querySelector('#space')).display !== 'none'`,
    { what: 'Space open' },
  );

  return out;
}
