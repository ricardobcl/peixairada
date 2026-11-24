// Space's working node (2026-11-24): a light turns round it — an arc on its edge, its bloom under the box, both `ring`,
// phased. A watching node's the same in cyan, slower; an asking one keeps its pings and has none; a ready one is still.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { tmpDir } from '../../lib/testserver.mjs';
import { makeFixture, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { space: true, spOff: [], cards: 'compact', spVisits: false, skinFollow: false, look: 'dark' } };

export default async function (ctx) {
  const ps = [0, 1].map(() => spawn('sleep', ['300'], { stdio: 'ignore' }));
  try {
    const root = tmpDir('peix-spg-'), d = n => { const p = join(root, n); mkdirSync(p, { recursive: true }); return p; }, now = Date.now(), ago = m => new Date(now - m * 60_000);
    const { chats: [work, ask, ready] } = makeFixture(ctx.fixture.dir, [
      { cwd: d('storefront'), title: 'Retry declined card payments', prompt: 'go', reply: 'On it.', at: ago(1), live: { pid: ps[0].pid, startedAt: now - 3_600_000, status: 'busy' }, lines: id => toolLines({ id, cwd: join(root, 'storefront'), name: 'Bash', input: { command: 'npm test' }, at: ago(0.5) }) },
      { cwd: d('billing-api'), title: 'Queue for invoice webhooks', prompt: 'pick', reply: 'Which?', at: ago(2), live: { pid: ps[1].pid, startedAt: now - 3_600_000, status: 'waiting', waitingFor: 'input needed' } },
      { cwd: d('docs'), title: 'Write the retry docs', prompt: 'docs', reply: 'Written.', at: ago(30) },
    ]);
    const node = id => `document.querySelector('#spgrid .spt[data-id="${id}"]')`;
    await ctx.waitFor(`${node(work.id)}?.querySelector('.spbox[data-st="work"]') && ${node(ask.id)}?.querySelector('.spbox[data-st="ask"]') && ${node(ready.id)}`, { what: 'the three nodes', timeout: 20000 });
    const out = await ctx.evaluate(`[${[work, ask, ready].map(c => `'${c.id}'`).join(',')}].map(id => { const n = document.querySelector('#spgrid .spt[data-id="' + id + '"]'), rg = n.querySelector('.sprg'), hl = n.querySelector('.sphl');
      return [!!rg, !!hl, rg ? getComputedStyle(rg, '::before').animationName : '', hl ? getComputedStyle(hl, '::before').animationName : ''];
    })`);
    ctx.assert.deepEqual(out, [[true, true, 'ring', 'ring'], [false, false, '', ''], [false, false, '', '']], 'the working node lit and turning; the asking and the ready ones not');
    out.phased = await ctx.evaluate(`(() => { const as = document.getAnimations().filter(a => a.animationName === 'ring' && a.effect?.target?.closest?.('#space')); return as.length >= 2 && new Set(as.map(a => Math.round(Number(a.currentTime) % 2400 / 50))).size === 1; })()`);
    ctx.assert.equal(out.phased, true, 'arc and bloom in step');
    await ctx.settle(); await ctx.shot('space-glow-dark');
    await ctx.evaluate(`peix.prefs(); document.documentElement.dataset.theme = 'light'`);
    await ctx.sleep(300); await ctx.shot('space-glow-light');
    return out;
  } finally { for (const p of ps) p.kill(); }
}
