// Keeping the Mac awake (2026-10-08): since 2026-10-09 both switches are buttons of the status bar — the cup, idle sleep
// held off (amber while on), and the laptop, no sleep even with the lid closed (red while on) — muted marks while off.
// With the bar off they are the chat header's cup, before ···, and a row of ···. What this checks, against the test
// server's fakes (caffeinate, pmset, no Touch ID nor password): the bar's buttons switch and say so; the header has no
// cup while the bar has them; the lid's setting is read from the system, so one changed elsewhere shows by itself; and
// with the bar off the header's cup and the menu's row are back.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  const pmset = join(ctx.server.dir, 'pmset'), lid = () => { try { return readFileSync(pmset, 'utf8'); } catch { return '0'; } };
  const btns = () => ctx.evaluate(`JSON.stringify(['#sbAwake', '#sbLid'].map(q => (b => b && [b.classList.contains('off'), b.textContent])(document.querySelector('#sbar ' + q))))`).then(JSON.parse);
  const server = async () => (await ctx.server.api('api/awake')).body;
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length > 0 && !!document.querySelector('#sbAwake')`, { what: 'the board and its bar' });
  out.rest = await btns();
  ctx.assert.deepEqual(out.rest, [[true, ''], [true, '']], 'both in the bar, muted marks while off');
  await ctx.openChat(ctx.fixture.chats[0].id);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#shead #awakeBtn')`), false, 'no cup in the header while the bar has it');
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#hmenu #lidBtn')`), false, 'nor the lid in ···');
  await ctx.evaluate(`document.querySelector('#hmenu').close()`);

  // the cup: idle sleep held off, in amber, saying so; the laptop: the system's setting (the fake's file), in red
  await ctx.evaluate(`document.querySelector('#sbAwake').click()`);
  await ctx.waitFor(`document.querySelector('#sbAwake')?.textContent === 'awake'`, { what: 'awake' });
  ctx.assert.equal((await server()).awake, true, 'the server holds it');
  await ctx.evaluate(`document.querySelector('#sbLid').click()`);
  await ctx.waitFor(`document.querySelector('#sbLid')?.textContent === 'lid closed'`, { what: 'the lid' });
  ctx.assert.equal(lid(), '1', 'pmset -a disablesleep 1');
  out.on = await btns();
  ctx.assert.deepEqual(out.on, [[false, 'awake'], [false, 'lid closed']]);
  await ctx.settle();
  await ctx.shot('1-bar', { x: 1100, y: 940, width: 600, height: 60 });
  await ctx.evaluate(`document.querySelector('#sbLid').click()`);
  await ctx.waitFor(`document.querySelector('#sbLid')?.classList.contains('off')`, { what: 'the lid off' });
  await ctx.evaluate(`document.querySelector('#sbAwake').click()`);
  await ctx.waitFor(`document.querySelector('#sbAwake')?.classList.contains('off')`, { what: 'awake off' });
  ctx.assert.deepEqual([await server(), lid()], [{ awake: false, lid: false }, '0']);

  // set elsewhere (pmset by hand, another app): the poll reads it, and the bar says so
  writeFileSync(pmset, '1');
  await ctx.waitFor(`!document.querySelector('#sbLid')?.classList.contains('off')`, { timeout: 8000, what: 'the lid set elsewhere, read back' });
  writeFileSync(pmset, '0');
  await ctx.waitFor(`document.querySelector('#sbLid')?.classList.contains('off')`, { timeout: 8000, what: 'and let go elsewhere' });

  // the bar off: the header's cup before ··· and the menu's lid row are back, and switch as they did
  await ctx.evaluate(`document.querySelector('#sbarOn').click()`);
  await ctx.waitFor(`!!document.querySelector('#shead #awakeBtn')`, { what: 'the header\'s cup with the bar off' });
  out.head = await ctx.evaluate(`(m => [m.classList.contains('off'), m.nextElementSibling?.classList.contains('hmore')])(document.querySelector('#shead #awakeBtn'))`);
  ctx.assert.deepEqual(out.head, [true, true], 'a muted cup, before ···');
  await ctx.evaluate(`document.querySelector('#awakeBtn').click()`);
  await ctx.waitFor(`document.querySelector('#awakeBtn')?.textContent === 'awake'`, { what: 'awake from the header' });
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  await ctx.waitFor(`!!document.querySelector('#hmenu #lidBtn')`, { what: 'the lid\'s row in ···' });
  await ctx.evaluate(`document.querySelector('#lidBtn').click()`);
  await ctx.waitFor(`document.querySelector('#shead #awakeBtn')?.classList.contains('lid') && document.querySelector('#lidBtn .k').textContent === 'on'`, { what: 'the lid from ···' });
  ctx.assert.equal(lid(), '1');
  await ctx.evaluate(`document.querySelector('#lidBtn').click()`);
  await ctx.waitFor(`document.querySelector('#lidBtn .k').textContent === 'off'`, { what: 'the lid off from ···' });
  await ctx.evaluate(`document.querySelector('#hmenu').close(); document.querySelector('#awakeBtn').click()`);
  await ctx.waitFor(`document.querySelector('#awakeBtn')?.classList.contains('off')`, { what: 'off again' });
  await ctx.evaluate(`document.querySelector('#sbarOn').click()`);
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#shead #awakeBtn')`), false, 'the bar on again: the header\'s cup goes');
  return out;
}
