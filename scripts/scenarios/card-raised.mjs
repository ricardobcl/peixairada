// Raised cards (2026-11-03, round XXII's E4 and H1; Settings › Chat list, off by default): the chat's material a step lower, and under
// the pointer a card comes up. What this checks: off, a row is as it was, no ground and no shadow; on, a ground between the frame and the
// chat and lighter than the frame in both themes, the chat's hairline and a small shadow, no card redrawn and none taller; a state keeps
// its own edge (the open row its solid colour, a question its red, a ring no hairline); the PR chips tint against the card's ground;
// under the pointer the card rises 1 px and its shadow deepens, its hit area reaching 2 px lower so it does not drop off the pointer; a
// question keeps still; reduced motion leaves the shadow alone; the switch outlives a reload. Shots dark and light.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFixture } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'compact', cardsEven: true } };

export default async function (ctx) {
  const a = ctx.assert, out = {}, cwd = join(tmpdir(), 'peix-card-raised', 'raised-repo');
  const asker = spawn('sleep', ['120'], { stdio: 'ignore' });
  try {
    const at = new Date(Date.now() - 3600_000);
    makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Asking you', prompt: 'clean the old branches', reply: 'on it', at, live: { pid: asker.pid, startedAt: Date.now() - 600_000, status: 'waiting', waitingFor: 'permission prompt' } },
      { cwd, title: 'A ready one', prompt: 'hello', reply: 'hi', at: new Date(at.getTime() - 60_000) },
      { cwd, title: 'The open one', prompt: 'hello', reply: 'hi', at: new Date(at.getTime() - 120_000) },
    ]);
    await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 5 && !!document.querySelector('#slist > .card.asking')`, { what: 'the chats' });
    const openId = await ctx.evaluate(`[...document.querySelectorAll('#slist > .card')].find(c => c.querySelector('.title').textContent === 'The open one').dataset.id`);
    await ctx.openChat(openId);
    await ctx.settle();
    const card = t => `[...document.querySelectorAll('#slist > .card')].find(c => c.querySelector('.title').textContent === '${t}')`;
    const look = t => ctx.evaluate(`JSON.stringify((c => { const s = getComputedStyle(c), n = document.querySelector('#sessions'), frame = getComputedStyle(n).backgroundColor; return { bg: s.backgroundColor, frame, shadow: s.boxShadow, h: +c.getBoundingClientRect().height.toFixed(2), kept: c.__mark === 1, tr: s.translate }; })(${card(t)}))`).then(JSON.parse);
    const lum = async col => ctx.evaluate(`(() => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '${col}'; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return (d[0] + d[1] + d[2]) / 3; })()`);
    const none = 'rgba(0, 0, 0, 0)';

    // off: today's rows
    a.equal(await ctx.evaluate(`document.querySelector('#sessions').hasAttribute('data-raised')`), false, 'off by default');
    const off = await look('A ready one');
    a.deepEqual([off.bg, off.shadow], [none, 'none'], 'a row at rest: no ground, no shadow');
    await ctx.evaluate(`for (const c of document.querySelectorAll('#slist > .card')) c.__mark = 1`);

    // on
    await ctx.evaluate(`document.querySelector('#cardsRaised').click()`); await ctx.settle();
    for (const dark of [false, true]) {
      await ctx.evaluate(`document.documentElement.dataset.theme = '${dark ? 'dark' : 'light'}'; document.documentElement.dataset.frame = '${dark ? 'dark' : 'light'}'`);
      await ctx.settle();
      const on = await look('A ready one');
      a.notEqual(on.bg, none, 'a ground');
      a.equal(await lum(on.bg) > await lum(on.frame), true, `${dark ? 'dark' : 'light'}: lighter than the frame (${on.bg} on ${on.frame})`);
      if (!dark) a.equal(await lum(on.bg) < await lum(await ctx.evaluate(`getComputedStyle(document.querySelector('#chat')).backgroundColor`)), true, 'and below the chat in the light');
      a.match(on.shadow, /0px 0px 0px 1px/, 'the hairline');
      a.equal(on.kept, true, 'no card redrawn');
      a.equal(on.h, off.h, 'no taller');
      await ctx.shot(`raised-${dark ? 'dark' : 'light'}`, { x: 0, y: 0, width: 420, height: 520 });
    }
    await ctx.evaluate(`document.documentElement.dataset.theme = 'light'; document.documentElement.dataset.frame = 'light'`); await ctx.settle();

    // a state's own edge
    const open = await look('The open one'), asks = await look('Asking you');
    a.equal(open.shadow, 'none', 'the open row: its solid colour alone');
    a.notEqual(open.bg, (await look('A ready one')).bg, 'solid, not the ground');
    a.match(asks.shadow, /inset/, 'a question: its red hairline');

    // the PR chips tint against the card's ground
    a.notEqual(await ctx.evaluate(`getComputedStyle(${card('A ready one')}).getPropertyValue('--side').trim()`), await ctx.evaluate(`getComputedStyle(document.querySelector('#sessions')).getPropertyValue('--side').trim()`), 'the card\'s --side is its ground');

    // under the pointer
    const hover = async t => { const p = await ctx.evaluate(`(r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))(${card(t)}.getBoundingClientRect())`); await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await ctx.sleep(450); };
    const rest = await look('A ready one');
    await hover('A ready one');
    const up = await look('A ready one');
    a.equal(up.tr, '0px -1px', 'it rises 1 px');
    a.notEqual(up.shadow, rest.shadow, 'its shadow deepens');
    out.lip = await ctx.evaluate(`(c => { const b = getComputedStyle(c, '::before'); return { content: b.content, bottom: b.bottom }; })(${card('A ready one')})`);
    a.deepEqual(out.lip, { content: '""', bottom: '-2px' }, 'its hit area reaches 2 px lower');
    await hover('Asking you');
    a.equal((await look('Asking you')).tr, 'none', 'a question keeps still');
    await hover('The open one');
    a.notEqual((await look('The open one')).shadow, 'none', 'the open row comes up too');
    await ctx.shot('raised-hover', { x: 0, y: 0, width: 420, height: 520 });
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 500 });

    // reduced motion: the shadow says it, nothing moves
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await hover('A ready one');
    a.equal((await look('A ready one')).tr, 'none', 'no rise under reduced motion');
    await ctx.send('Emulation.setEmulatedMedia', { features: [] });
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 500 });

    // kept; and off is today's again
    await ctx.reload();
    a.equal(await ctx.evaluate(`document.querySelector('#sessions').hasAttribute('data-raised') && document.querySelector('#cardsRaised').checked`), true, 'kept across a reload');
    await ctx.evaluate(`document.querySelector('#cardsRaised').click()`); await ctx.settle();
    const back = await look('A ready one');
    a.deepEqual([back.bg, back.shadow], [none, 'none'], 'off: a row again');
    return out;
  } finally { asker.kill(); }
}
