// The lane heads, L1 (2026-10-31, round XIII — Linear's states): a still glyph a lane in its colour — asking a dot with
// a halo, clauding a half-filled ring, watching a dashed ring round a dot, ready a ring round a dot, idle a dotted ring,
// done filled —, the name in ink, the count bare, no pixels and no shimmer; each head sticky at the list's top while its
// lane scrolls under it, on the list's ground. What this checks, in the sidebar (sentence case, each head a band of the
// list's own ground; tiles' small caps went with them, 2026-11-01): the glyphs and inks; a head stuck over the cards scrolling under it, the
// ones stuck under it hidden; the list's top end counting the cards under it and its fog below it; at the notch, below
// the strip with its ground over it; a stuck head clicked folds its lane and stays in sight; the day lines and the
// timeline's runs as they were; nothing in a head moving, reduced motion or not. Shots dark and light.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { makeFixture, replyLines, toolLines } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { lanesShut: [] } };

const heads = ctx => ctx.evaluate(`(() => {
  const ink = getComputedStyle(document.querySelector('#slist > .card .title')).color, muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  return [...document.querySelectorAll('#slist > .gsep.lane[data-lane]')].map(h => { const i = getComputedStyle(h.querySelector(':scope > i')), b = getComputedStyle(h.querySelector('b'));
    return { lane: h.dataset.lane, name: h.querySelector('.ln').textContent, n: h.querySelector('b').textContent, glyph: [i.borderTopStyle, /conic/.test(i.backgroundImage) ? 'half' : /radial/.test(i.backgroundImage) ? 'dot' : i.backgroundColor !== 'rgba(0, 0, 0, 0)' ? 'filled' : 'ring', i.boxShadow !== 'none' ? 'halo' : ''].filter(Boolean).join(' '),
      ink: getComputedStyle(h.querySelector('.ln')).color === ink, bare: b.backgroundColor === 'rgba(0, 0, 0, 0)', pos: getComputedStyle(h).position, caps: getComputedStyle(h).textTransform,
      moving: h.getAnimations({ subtree: true }).length, pix: !!h.querySelector('.pix, .shim') }; });
})()`);

export default async function (ctx) {
  const out = {}, now = Date.now(), cwd = realpathSync(tmpDir('peix-heads-'));
  const sleeps = Array.from({ length: 5 }, () => spawn('sleep', ['300'], { stdio: 'ignore' }));
  const live = (i, extra = {}) => ({ pid: sleeps[i].pid, startedAt: now - 3600_000, ...extra });
  const ago = m => new Date(now - m * 60_000), days = d => { const t = new Date(); t.setDate(t.getDate() - d); return t; };
  const monitor = (id, task, at) => toolLines({ id, cwd, name: 'Monitor', input: { command: 'gh run watch', description: 'the release build', timeout_ms: 3600_000 }, result: `Monitor started (task ${task}, expires in 60m).`, at });
  try {
    await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projects: { [basename(cwd)]: { color: '#3b82f6' } } }) });
    const ready = ['Product grid follows the dark theme', 'Node 22 across every service', 'Flaky test in the refunds suite', 'Rename the billing events', 'Pin the lockfile', 'Cache the exchange rates',
      'Drop the legacy webhooks', 'Retry the payouts', 'Split the ledger job', 'Bump the SDK'];
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Queue for invoice webhooks', prompt: 'move the webhooks off the request path', reply: 'one question first', at: ago(20), live: live(0, { status: 'waiting', waitingFor: 'permission prompt' }) },
      { cwd, title: 'Retry declined card payments', prompt: 'retry declined cards with backoff', reply: 'on it', at: ago(30), live: live(1),
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test -- payments', description: 'Run the payment tests' }, at: ago(1) }) },
      { cwd, title: 'Review the staging VPC plan', prompt: 'review the plan from every angle', reply: 'on it', at: ago(40), live: live(2),
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'terraform plan' }, at: ago(2) }) },
      { cwd, title: 'Watch the release build', prompt: 'tell me when the iOS job finishes', reply: 'watching', at: ago(50), live: live(3),
        lines: id => [...monitor(id, 'monrel01', ago(49)), ...replyLines({ id, cwd, text: 'Android is green; still waiting on iOS.', at: ago(48) })] },
      { cwd, title: 'Watch the canary', prompt: 'watch the canary error rate', reply: 'watching', at: ago(57), live: live(4),
        lines: id => [...monitor(id, 'moncan02', ago(56)), ...replyLines({ id, cwd, text: 'Under 1 %, still watching.', at: ago(55) })] },
      ...ready.map((title, k) => ({ cwd, title, prompt: `${title.toLowerCase()}, please`, reply: 'Done, the tests pass.', at: k < 4 ? ago(90 + k * 30) : days(1 + (k > 7)) })),
      ...['Old spike on the search index', 'The flags cleanup', 'A wiki page'].map((title, k) => ({ cwd, title, prompt: 'this', reply: 'done', at: days(8 + k) })),
    ]);
    await ctx.waitFor(`window.peix.sessions().filter(s => s.cwd === ${JSON.stringify(cwd)}).length === ${chats.length} && document.querySelector('#slist > .gsep.lane.watching')`, { what: 'the board' });
    await ctx.server.post(`api/sessions/${chats.find(c => c.title === 'A wiki page').id}/done`, { done: true });
    await ctx.waitFor(`document.querySelector('#slist > .gsep.lane.done')`, { what: 'a done lane' });
    await ctx.openChat(chats[1].id);
    await ctx.settle(); await ctx.waitFor(`!document.querySelector('.rn.rolling')`);

    // ---- the heads: a glyph a lane, the name in ink, the count bare, nothing moving ----
    const want = { asking: 'solid filled halo', working: 'solid half', watching: 'dashed dot', ready: 'solid dot', idle: 'dotted ring', done: 'solid filled' };
    const check = async (layout, caps) => {
      const h = await heads(ctx);
      ctx.assert.deepEqual(h.map(x => x.lane), ['asking', 'working', 'watching', 'ready', 'idle', 'done'], `${layout}: the six lanes, Watching after Clauding`);
      for (const x of h) {
        ctx.assert.equal(x.glyph, want[x.lane], `${layout}: ${x.lane}'s glyph`);
        ctx.assert.deepEqual([x.ink, x.bare, x.pos, x.caps, x.moving, x.pix], [true, true, 'sticky', caps, 0, false], `${layout}: ${x.lane} — ink, a bare count, sticky, ${caps}, still: ${JSON.stringify(x)}`);
      }
      return h;
    };
    out.heads = await check('sidebar', 'none');

    // ---- scrolled: Ready's head stuck at the top, its cards passing under it ----
    const stuck = async () => {
      await ctx.evaluate(`(l => { l.scrollTop = 0; const h = l.querySelector(':scope > .gsep.lane.ready'); l.scrollTop = h.offsetTop + 260; })(document.querySelector('#slist'))`);
      await ctx.sleep(250);
      return ctx.evaluate(`(() => {
        const l = document.querySelector('#slist'), lr = l.getBoundingClientRect(), h = l.querySelector(':scope > .gsep.lane.ready'), hr = h.getBoundingClientRect();
        const top = [...l.querySelectorAll(':scope > .gsep.lane[data-lane]')].filter(x => Math.abs(x.getBoundingClientRect().top - lr.top) < 1.5).pop();
        const at = document.elementFromPoint(hr.left + hr.width * .6, hr.top + hr.height / 2);
        const stick = h.offsetHeight, under = [...l.querySelectorAll(':scope > .card')].filter(c => c.offsetTop + c.offsetHeight / 2 < l.scrollTop + stick).length;
        const up = document.querySelector('#sup');
        const covered = [...l.querySelectorAll(':scope > .gsep.lane[data-lane]')].filter(x => getComputedStyle(x).visibility === 'hidden').map(x => x.dataset.lane);
        return { covered, lane: top?.dataset.lane, flush: Math.round(hr.top - lr.top), onTop: !!at?.closest('.gsep.lane.ready'), cardBelow: [...l.querySelectorAll(':scope > .card')].some(c => { const r = c.getBoundingClientRect(); return r.top < hr.bottom && r.bottom > hr.top; }),
          up: up.classList.contains('on') ? +up.querySelector('b').textContent : 0, under, fog: getComputedStyle(up).marginTop, stick: stick + 'px', pad: getComputedStyle(l).scrollPaddingTop };
      })()`);
    };
    out.stuck = await stuck();
    ctx.assert.deepEqual([out.stuck.lane, out.stuck.flush, out.stuck.onTop, out.stuck.cardBelow], ['ready', 0, true, true], `Ready's head stuck at the top, over a card scrolling under it: ${JSON.stringify(out.stuck)}`);
    ctx.assert.deepEqual(out.stuck.covered, ['asking', 'working', 'watching'], 'the heads stuck under it hidden: a head of glass would show them');
    ctx.assert.equal(out.stuck.up, out.stuck.under, 'the top end counts every card whose middle is above the list or under the stuck head');
    ctx.assert.deepEqual([out.stuck.fog, out.stuck.pad], [out.stuck.stick, out.stuck.stick], 'its fog starts under the head, and a card scrolled to stops under it');
    await ctx.settle();
    const crop = () => ctx.evaluate(`(r => ({ x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 760), scale: 2 }))(document.querySelector('#sessions').getBoundingClientRect())`);
    await ctx.shot('dark-stuck', await crop());
    // the day lines scroll as before, under it
    out.days = await ctx.evaluate(`[...document.querySelectorAll('#slist > .gsep.day')].map(d => d.textContent + ':' + getComputedStyle(d).position)`);
    ctx.assert.ok(out.days.length >= 1 && out.days.every(d => d.endsWith(':static')), `the day lines: ${out.days}`);
    // the timeline's runs know the new lane
    await ctx.evaluate(`document.querySelector('#sessions').classList.add('tlshow'); window.dispatchEvent(new Event('resize'))`);
    await ctx.sleep(200);
    out.runs = (await ctx.peix(`state().timeline.runs`)).map(r => r.g);
    ctx.assert.ok(out.runs.includes('watching') && out.runs.indexOf('watching') < out.runs.indexOf('ready'), `the timeline's runs: ${out.runs}`);
    await ctx.evaluate(`document.querySelector('#sessions').classList.remove('tlshow')`);
    // the stuck head clicked folds its lane, and stays in sight
    await ctx.evaluate(`document.querySelector('#slist > .gsep.lane.ready').click()`);
    await ctx.waitFor(`document.querySelector('#slist > .gsep.lane.ready.shut')`, { what: 'Ready folded' });
    await ctx.settle();
    out.folded = await ctx.evaluate(`(l => { const r = l.querySelector(':scope > .gsep.lane.ready').getBoundingClientRect(), lr = l.getBoundingClientRect(); return { inSight: r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1 }; })(document.querySelector('#slist'))`);
    ctx.assert.equal(out.folded.inSight, true, 'the folded head in sight');
    await ctx.evaluate(`document.querySelector('#slist > .gsep.lane.ready').click()`);
    await ctx.waitFor(`!document.querySelector('#slist > .gsep.lane.ready.shut')`, { what: 'Ready open again' });
    // light
    await ctx.evaluate(`document.documentElement.dataset.theme = 'light'`); await ctx.settle();
    await stuck(); await ctx.settle(); await ctx.shot('light-stuck', await crop());
    // at the notch, the list padded under its strip: the head sticks below the strip, its ground over it, the top end
    // under the head
    await ctx.evaluate(`document.documentElement.dataset.theme = 'dark'; window.peixFill(true, { top: 32, left: 100, right: 285 })`);
    await ctx.waitFor(`document.querySelector('#sessions.npad')`, { what: 'the list padded for the strip' });
    await ctx.evaluate(`(l => { l.scrollTop = 0; l.scrollTop = l.querySelector(':scope > .gsep.lane.ready').offsetTop + 260; })(document.querySelector('#slist'))`);
    await ctx.sleep(300);
    out.notch = await ctx.evaluate(`(() => { const l = document.querySelector('#slist'), lr = l.getBoundingClientRect(), h = l.querySelector(':scope > .gsep.lane.ready'), hr = h.getBoundingClientRect();
      return { pad: parseFloat(getComputedStyle(l).paddingTop), at: Math.round(hr.top - lr.top), stuck: h.classList.contains('stuck'), cover: parseFloat(getComputedStyle(h, '::before').height), up: Math.round(document.querySelector('#sup').getBoundingClientRect().top - hr.bottom) }; })()`);
    ctx.assert.deepEqual([out.notch.at, out.notch.stuck, out.notch.cover, out.notch.up], [out.notch.pad, true, out.notch.pad, 0], `at the notch: ${JSON.stringify(out.notch)}`);
    await ctx.settle(); await ctx.shot('notch', await crop());
    await ctx.evaluate(`window.peixFill(false, null)`);
    await ctx.waitFor(`!document.querySelector('#sessions.npad')`, { what: 'the strip gone' });
    // reduced motion: still nothing moving in a head (and nothing to hold)
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await ctx.waitFor(`matchMedia('(prefers-reduced-motion: reduce)').matches`, { what: 'reduced motion' });
    ctx.assert.ok((await heads(ctx)).every(h => h.moving === 0), 'reduced: the heads as they are');
    await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: '' }] });

    // ---- every head a band of the list's own ground, stuck or not, nothing blurred through it ----
    await ctx.evaluate(`document.documentElement.dataset.theme = 'dark'`);
    out.sideStuck = await stuck();
    ctx.assert.deepEqual([out.sideStuck.lane, out.sideStuck.flush, out.sideStuck.onTop, out.sideStuck.up === out.sideStuck.under], ['ready', 0, true, true], `the sidebar's stuck head: ${JSON.stringify(out.sideStuck)}`);
    out.bands = await ctx.evaluate(`(side => [...document.querySelectorAll('#slist > .gsep.lane[data-lane]')].map(h => h.dataset.lane + ':' + (getComputedStyle(h).backdropFilter === 'none' && getComputedStyle(h).backgroundColor === side)))(getComputedStyle(document.querySelector('#sessions')).backgroundColor)`);
    ctx.assert.ok(out.bands.every(x => x.endsWith(':true')), `each head on the list's ground: ${out.bands}`);
    await ctx.settle(); await ctx.shot('dark', await crop());
    await ctx.evaluate(`document.documentElement.dataset.theme = 'light'`); await ctx.settle(); await ctx.shot('light', await crop());
    await ctx.evaluate(`document.querySelector('#slist').scrollTop = 0`); await ctx.sleep(200); await ctx.settle();
    ctx.assert.deepEqual(await ctx.evaluate(`[...document.querySelectorAll('#slist > .gsep.lane.covered')].length`), 0, 'at the top, none hidden');
    await ctx.shot('light-top', await crop());
    await ctx.evaluate(`document.documentElement.dataset.theme = 'dark'`); await ctx.settle(); await ctx.shot('dark-top', await crop());
    return out;
  } finally { for (const p of sleeps) try { p.kill(); } catch {} }
}
