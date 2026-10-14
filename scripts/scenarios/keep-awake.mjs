// Keeping the Mac awake (2026-10-08): since 2026-10-09 both switches are buttons of the status bar — the cup, idle sleep
// held off (amber while on), and the laptop, no sleep even with the lid closed (red while on) — muted marks while off
// (the chat header's cup and a row of ··· while the bar could be off, until 2026-10-14). What this checks, against the
// test server's fakes (caffeinate, pmset, no Touch ID nor password): the bar's buttons switch and say so; the lid's
// setting is read from the system, so one changed elsewhere shows by itself; on a charger set never to sleep the cup is
// muted, on or off, and its tooltip says why (2026-10-09).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  const pmset = join(ctx.server.dir, 'pmset'), lid = () => { try { return readFileSync(pmset, 'utf8'); } catch { return '0'; } };
  const power = join(ctx.server.dir, 'pmset-power');   // the fake's power: its source and the idle minutes on it
  const barShot = async label => { const r = await ctx.evaluate(`JSON.stringify(document.querySelector('#sbRight').getBoundingClientRect())`).then(JSON.parse);
    await ctx.shot(label, { x: Math.round(r.x) - 8, y: Math.round(r.y) - 8, width: Math.round(r.width) + 16, height: Math.round(r.height) + 16 }); };
  const btns = () => ctx.evaluate(`JSON.stringify(['#sbAwake', '#sbLid'].map(q => (b => b && [b.classList.contains('off'), b.textContent])(document.querySelector('#sbar ' + q))))`).then(JSON.parse);
  const server = async () => (({ awake, lid }) => ({ awake, lid }))((await ctx.server.api('api/awake')).body);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length > 0 && !!document.querySelector('#sbAwake')`, { what: 'the board and its bar' });
  out.rest = await btns();
  ctx.assert.deepEqual(out.rest, [[true, ''], [true, '']], 'both in the bar, muted marks while off');
  await ctx.openChat(ctx.fixture.chats[0].id);

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
  await barShot('1-bar');
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

  // the charger in, set never to sleep on it: nothing for the cup to hold off — muted, saying why, and still a switch
  const cup = () => ctx.evaluate(`JSON.stringify((b => [b.classList.contains('moot'), b.classList.contains('off'), b.textContent, b.title])(document.querySelector('#sbAwake')))`).then(JSON.parse);
  writeFileSync(power, 'ac 0');
  await ctx.waitFor(`document.querySelector('#sbAwake')?.classList.contains('moot')`, { timeout: 8000, what: 'the cup moot on the charger' });
  out.mootOff = await cup();
  ctx.assert.deepEqual(out.mootOff.slice(0, 3), [true, true, ''], 'off and muted');
  ctx.assert.match(out.mootOff[3], /^On power, this Mac is set never to sleep on its own .*Switch it on to hold idle sleep off on battery$/, 'the tooltip says why');
  await ctx.evaluate(`document.querySelector('#sbAwake').click()`);
  await ctx.waitFor(`document.querySelector('#sbAwake')?.textContent === 'awake'`, { what: 'on, on the charger' });
  out.mootOn = await cup();
  ctx.assert.deepEqual(out.mootOn.slice(0, 3), [true, false, 'awake'], 'on, and muted all the same');
  ctx.assert.match(out.mootOn[3], /On: it holds idle sleep off on battery\. Click to turn it off$/);
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#sbAwake')).color === getComputedStyle(document.querySelector('#sbLid')).color`), true, 'in the muted ink, as the lid\'s mark off');
  await ctx.settle();
  await barShot('2-moot');
  writeFileSync(power, 'battery 1');   // unplugged: the cup holds idle sleep off, in amber
  await ctx.waitFor(`!document.querySelector('#sbAwake')?.classList.contains('moot')`, { timeout: 8000, what: 'the cup lit again on battery' });
  ctx.assert.equal((await cup())[2], 'awake');
  await ctx.evaluate(`document.querySelector('#sbAwake').click()`);
  await ctx.waitFor(`document.querySelector('#sbAwake')?.classList.contains('off')`, { what: 'off again' });

  return out;
}
