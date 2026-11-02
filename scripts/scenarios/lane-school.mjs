// The lane is the minimap (2026-11-01, round XIX's W1; a switch, off by default): a fish per live chat. What this checks: off,
// the one fish; on, one per live chat in its colour and place, asking red and still with a ping, at work swimming, ready
// dimmed and still; a click opens that chat and not the overview; places hold when a chat changes state, and its node is
// kept; past twelve the ones that want you stay and a count stands for the rest; off again, the one fish swims on.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeFixture, toolLines } from '../fixture.mjs';
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const cwd = realpathSync(tmpdir()), sleeps = Array.from({ length: 16 }, () => spawn('sleep', ['120'], { stdio: 'ignore' }));
  try {
    const ago = m => Date.now() - m * 60_000, live = (i, o = {}) => ({ pid: sleeps[i].pid, startedAt: ago(200 - i), ...o });
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#sbSwim .schoolbox')`), null, 'off by default');
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Asks', prompt: 'go', reply: 'one question', at: new Date(ago(9)), live: live(0, { status: 'waiting', waitingFor: 'input needed' }) },
      { cwd, title: 'Works', prompt: 'go', reply: 'on it', at: new Date(ago(8)), live: live(1), lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test', description: 'tests' }, at: new Date(ago(1)) }) },
      { cwd, title: 'Rests', prompt: 'go', reply: 'done', at: new Date(ago(7)), live: live(2, { status: 'idle' }) },
    ]);
    await ctx.waitFor(`window.peix.sessions().filter(s => s.alive).length === 3`, { what: 'three live chats', timeout: 15000 });
    await ctx.evaluate(`(s => { s.click(); })(document.querySelector('#laneSchool'))`);
    await ctx.waitFor(`document.querySelectorAll('#sbSwim .sf').length === 3`, { what: 'a fish each' });
    const read = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#sbSwim .sf')].map(b => { const r = b.getBoundingClientRect(); return { title: b.title.split(' · ')[1], cls: b.className.replace('sf ', ''), x: Math.round(r.left), running: b.querySelector('.fw').getAnimations().filter(a => a.playState === 'running').length, ping: getComputedStyle(b, '::before').content !== 'none' }; }))`).then(JSON.parse);
    const three = await read();
    const by = Object.fromEntries(three.map(f => [f.title, f]));   // their places go by when the board first saw each: three at once here
    ctx.assert.deepEqual(['Asks', 'Works', 'Rests'].map(t => by[t]?.cls), ['s-ask', 's-work', 's-ready'], 'each its state');
    ctx.assert.deepEqual(['Asks', 'Works', 'Rests'].map(t => by[t].running), [0, 1, 0], 'only the one at work swims');
    ctx.assert.deepEqual(['Asks', 'Works', 'Rests'].map(t => by[t].ping), [true, false, false], 'the one asking pings');
    ctx.assert.deepEqual(three.map(f => f.x), [...three.map(f => f.x)].sort((p, q) => p - q), 'spread along the lane');
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#sbSwim .swimmer')).visibility`), 'hidden', 'the one fish out of sight');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#sbSwim .swimmer').getAnimations().filter(a => a.id === 'swim' && a.playState === 'running').length`), 0, 'and not swimming behind it');
    await ctx.evaluate(`window.__node = document.querySelector('#sbSwim .sf[data-id="${chats[2].id}"]')`);
    // a click opens it, not the overview
    await ctx.evaluate(`document.querySelector('#sbSwim .sf[data-id="${chats[2].id}"]').click()`);
    await ctx.waitFor(`window.peix.state().current === '${chats[2].id}'`, { what: 'that chat open' });
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#ov')?.open || false`), false, 'not the overview');
    ctx.assert.equal(await ctx.evaluate(`window.__node === document.querySelector('#sbSwim .sf[data-id="${chats[2].id}"]')`), true, 'its node kept across renders');
    // past twelve: those that want you stay, and a count stands for the rest
    makeFixture(ctx.fixture.dir, Array.from({ length: 12 }, (_, i) => ({ cwd, title: `Idle ${i}`, prompt: 'go', reply: 'done', at: new Date(ago(60 + i)), live: live(3 + i, { status: 'idle' }) })));
    await ctx.waitFor(`document.querySelector('#sbSwim .sfmore')`, { what: 'the count', timeout: 15000 });
    const many = await read();
    ctx.assert.equal(many.length, 11, 'eleven fish and a count');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#sbSwim .sfmore').textContent`), '+4');
    ctx.assert.ok(['Asks', 'Works'].every(t => many.some(f => f.title === t)), 'the ones that want you or work stay');
    // off again
    await ctx.evaluate(`document.querySelector('#laneSchool').click()`);
    await ctx.waitFor(`!document.querySelector('#sbSwim .schoolbox')`, { what: 'the school gone' });
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#sbSwim .swimmer')).visibility`), 'visible', 'the one fish back');
    return { three };
  } finally { for (const s of sleeps) s.kill(); }
}
