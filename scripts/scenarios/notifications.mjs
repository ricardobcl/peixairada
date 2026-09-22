// The cog's switch for system notifications (2026-09-23). It is the server's setting, not a pref: every alert still
// reaches every page — the unread counts on the cards and the Dock go on — but with the switch off it goes out
// `quiet`, and nothing posts a banner for it: not the app (main.swift reads the flag off the bridge), not a browser
// tab (the page's Notification below), not the server's osascript. What this checks is the page's half, the
// server's word travelling to every page, and that the word survives a restart.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  const sw = `document.querySelector('#notifyOn')`;
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length > 0`, { what: 'the board' });
  ctx.assert.equal(await ctx.evaluate(`${sw}.checked`), true, 'on by default');

  // A browser that has granted notifications — faked, so the banners are counted instead of shown — and a second
  // listener on the stream, to see every alert whatever the page does with it.
  await ctx.evaluate(`(() => {
    window.__banners = []; window.__alerts = [];
    window.Notification = class { static permission = 'granted'; static requestPermission() { return Promise.resolve('granted'); }
      constructor(title, o) { window.__banners.push({ title, body: o?.body || '' }); } close() {} };
    window.__es = new EventSource('/events'); window.__es.addEventListener('alert', e => window.__alerts.push(JSON.parse(e.data)));
  })()`);
  await ctx.waitFor(`window.__es.readyState === 1`, { what: 'the second listener connected' });

  await ctx.server.api('api/test-notify', { method: 'POST' });
  await ctx.waitFor(`window.__banners.length === 1`, { what: 'a banner for the alert while notifications are on' });
  out.on = await ctx.evaluate(`({ quiet: window.__alerts[0]?.quiet, banner: window.__banners[0]?.title })`);
  ctx.assert.equal(out.on.quiet, false, 'the alert is not quiet');

  // Off, from the popover itself
  await ctx.evaluate(`document.querySelector('#cogBtn').click()`);
  await ctx.waitFor(`!document.querySelector('#settings').hidden`, { what: 'the popover' });
  await ctx.shot('1-on', { x: 0, y: 0, width: 620, height: 1000 });
  await ctx.evaluate(`${sw}.click()`);
  ctx.assert.equal(await ctx.evaluate(`${sw}.checked`), false, 'the switch is off');
  for (let i = 0; i < 20 && (await ctx.server.api('api/sessions')).body.notifications !== false; i++) await ctx.sleep(100);
  ctx.assert.equal((await ctx.server.api('api/sessions')).body.notifications, false, 'the server says off');
  ctx.assert.equal(JSON.parse(readFileSync(join(ctx.server.dir, 'state.json'), 'utf8')).notifications, false, '…and has it in the state file');
  await ctx.shot('2-off', { x: 0, y: 0, width: 620, height: 1000 });

  await ctx.server.api('api/test-notify', { method: 'POST' });
  await ctx.waitFor(`window.__alerts.length === 2`, { what: 'the second alert on the stream' });
  await ctx.sleep(300);
  out.off = await ctx.evaluate(`({ quiet: window.__alerts[1]?.quiet, banners: window.__banners.length })`);
  ctx.assert.deepEqual(out.off, { quiet: true, banners: 1 }, 'the alert still comes, quiet, and no banner follows it');

  // The server's word reaches every page: another tab (here, the API) turns it back on and this page's switch follows
  await ctx.server.api('api/notifications', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: true }) });
  await ctx.waitFor(`${sw}.checked === true`, { what: 'the switch following the server back on' });
  ctx.assert.equal((await ctx.server.api('api/notifications', { method: 'PUT', body: '{"on":"yes"}' })).status, 400, 'anything but a boolean is refused');
  await ctx.server.api('api/notifications', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: false }) });
  await ctx.waitFor(`${sw}.checked === false`, { what: 'and off again' });

  // A restart keeps it, and a fresh page reads it from the snapshot (the markup's own default is on)
  await ctx.server.restart();
  ctx.assert.equal((await ctx.server.api('api/sessions')).body.notifications, false, 'off after a restart');
  await ctx.send('Page.reload'); await ctx.sleep(1200);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length > 0`, { what: 'the board after the reload' });
  out.afterRestart = await ctx.evaluate(`${sw}.checked`);
  ctx.assert.equal(out.afterRestart, false, 'the reloaded page shows it off');
  return out;
}
