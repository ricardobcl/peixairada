// Keeping the Mac awake (2026-10-08; the button always in sight since 2026-10-09): a button at the header's right end,
// before ···, in a chat's header and in the empty one — a muted cup while the Mac may sleep, *awake* in amber while the
// server holds idle sleep off — and the lid's setting a row of ···. What this checks, against the test server's fakes
// (caffeinate, pmset, no password): the button switches and says so; the row turns the lid on and the button becomes
// the laptop; it is there with no chat open; its click with the lid on lets the lid sleep the Mac again; and the lid's
// setting is read from the system, so one changed elsewhere shows up by itself.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  const pmset = join(ctx.server.dir, 'pmset'), lid = () => { try { return readFileSync(pmset, 'utf8'); } catch { return '0'; } };
  const btn = () => ctx.evaluate(`JSON.stringify((m => m && { off: m.classList.contains('off'), lid: m.classList.contains('lid'), text: m.textContent, beforeMore: m.nextElementSibling?.classList.contains('hmore'),
    right: Math.round(innerWidth - m.getBoundingClientRect().right), top: Math.round(m.getBoundingClientRect().top) })(document.querySelector('#shead #awakeBtn')))`).then(JSON.parse);
  const server = async () => (await ctx.server.api('api/awake')).body;
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length > 0`, { what: 'the board' });
  out.rest = await btn();
  ctx.assert.deepEqual([out.rest.off, out.rest.text, out.rest.beforeMore], [true, '', true], `off, a muted cup before ···, with no chat open: ${JSON.stringify(out.rest)}`);

  // In a chat's header: a click keeps the Mac awake — the cup in amber, saying so — and the menu has the lid alone
  await ctx.openChat(ctx.fixture.chats[0].id);
  ctx.assert.equal((await btn()).off, true, 'in the chat\'s header too');
  await ctx.shot('0-off', { x: 700, y: 0, width: 1000, height: 60 });
  await ctx.evaluate(`document.querySelector('#awakeBtn').click()`);
  await ctx.waitFor(`document.querySelector('#awakeBtn')?.textContent === 'awake'`, { what: 'awake' });
  ctx.assert.equal((await server()).awake, true, 'the server holds it');
  out.cup = await btn();
  ctx.assert.deepEqual([out.cup.off, out.cup.lid, out.cup.beforeMore], [false, false, true], `the cup in amber, before ···: ${JSON.stringify(out.cup)}`);
  ctx.assert.ok(out.cup.right < 60 && out.cup.top < 30, `at the window's top right: ${JSON.stringify(out.cup)}`);
  await ctx.shot('1-awake', { x: 700, y: 0, width: 1000, height: 60 });
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  await ctx.waitFor(`document.querySelector('#hmenu').open`, { what: 'the menu' });
  out.rows = await ctx.evaluate(`JSON.stringify([!!document.querySelector('#hmenu #awakeBtn'), document.querySelector('#hmenu #lidBtn .k')?.textContent])`).then(JSON.parse);
  ctx.assert.deepEqual(out.rows, [false, 'off'], 'the menu: the lid\'s row alone');

  // The lid, from its row: the system's setting (the fake's file), and the button becomes the laptop
  await ctx.evaluate(`document.querySelector('#lidBtn').click()`);
  await ctx.waitFor(`document.querySelector('#shead #awakeBtn')?.classList.contains('lid') && document.querySelector('#lidBtn .k').textContent === 'on'`, { what: 'the lid on the button, and its row answered' });
  ctx.assert.equal(lid(), '1', 'pmset -a disablesleep 1');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#hmenu').open`), true, 'a toggle leaves the menu up');
  await ctx.settle();
  await ctx.shot('2-menu', await ctx.evaluate(`(r => ({ x: Math.max(0, r.left - 140), y: 0, width: r.width + 160, height: r.bottom + 20 }))(document.querySelector('#hmenu').getBoundingClientRect())`));
  await ctx.evaluate(`document.querySelector('#hmenu').close()`);

  // No chat open: the empty header wears it too
  await ctx.evaluate(`history.replaceState(null, '', location.pathname)`);
  await ctx.reload();
  await ctx.waitFor(`!!document.querySelector('#shead #noChatMore') && document.querySelector('#shead #awakeBtn')?.classList.contains('lid')`, { what: 'the laptop in the empty header' });
  await ctx.shot('3-empty', { x: 700, y: 0, width: 1000, height: 60 });

  // With the lid on, a click lets the lid sleep the Mac again — idle sleep still held off — and the next lets it sleep
  await ctx.evaluate(`document.querySelector('#awakeBtn').click()`);
  await ctx.waitFor(`(b => b && !b.classList.contains('lid') && !b.classList.contains('off'))(document.querySelector('#awakeBtn'))`, { what: 'the lid off, the cup still on' });
  ctx.assert.deepEqual([await server(), lid()], [{ awake: true, lid: false }, '0'], 'pmset -a disablesleep 0, caffeinate kept');
  await ctx.evaluate(`document.querySelector('#awakeBtn').click()`);
  await ctx.waitFor(`document.querySelector('#awakeBtn')?.classList.contains('off')`, { what: 'off again' });
  ctx.assert.deepEqual(await server(), { awake: false, lid: false });

  // Set elsewhere (pmset by hand, another app): the poll reads it, and the button says so
  writeFileSync(pmset, '1');
  await ctx.waitFor(`document.querySelector('#shead #awakeBtn')?.classList.contains('lid')`, { timeout: 8000, what: 'the lid set elsewhere, read back' });
  writeFileSync(pmset, '0');
  await ctx.waitFor(`document.querySelector('#shead #awakeBtn')?.classList.contains('off')`, { timeout: 8000, what: 'and let go elsewhere' });
  return out;
}
