// The board keeps its frames off the main thread (2026-10-13): with the lights the user lives with on — tiles, the
// floating header, the status bar and its fish, two chats clauding, one asking, one with a monitor — nothing that never
// ends is an animated SVG group or runs at a playback rate other than 1, nothing runs with nothing drawn, and no
// inherited registered property is transitioned over a big subtree (lib/animcheck.mjs). Chrome is the harness: one rule
// (an animation kept on a `display: none` pseudo-element) is WebKit's alone and is held by `npm run perf` instead.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ANIM_RULES } from '../../lib/animcheck.mjs';
import { makeFixture, toolLines, taskNoteLine } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'compact' } };

export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-rules', 'rules-repo'), now = Date.now();
  const sleeps = [0, 1, 2, 3].map(() => spawn('sleep', ['120'], { stdio: 'ignore' }));
  const live = (i, extra = {}) => ({ pid: sleeps[i].pid, startedAt: now - 3600_000, ...extra });
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Clauding', prompt: 'build it', reply: 'on it', at: new Date(now - 60_000), live: live(0, { status: 'busy' }),
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm run build', description: 'build' }, at: new Date(now - 10_000) }) },
      { cwd, title: 'Clauding too', prompt: 'test it', reply: 'on it', at: new Date(now - 90_000), live: live(3, { status: 'busy' }),   // two at work: the fish faster than 1
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test', description: 'test' }, at: new Date(now - 8_000) }) },
      { cwd, title: 'Asking', prompt: 'may I?', reply: 'one question', at: new Date(now - 120_000), live: live(1, { status: 'waiting', waitingFor: 'permission prompt' }) },
      { cwd, title: 'Watching', prompt: 'watch it', reply: 'watching', at: new Date(now - 180_000), live: live(2, { status: 'idle' }),
        lines: id => [taskNoteLine({ id, cwd, taskId: 'b1', summary: 'a watch', event: 'tick', at: new Date(now - 5_000) })] },
    ]);
    await ctx.waitFor(`document.querySelector('#slist > .card.working') && document.querySelector('#slist > .card.asking')`, { what: 'a clauding card and an asking one', timeout: 15000 });
    await ctx.openChat(chats[0].id);   // its presence line shimmers
    await ctx.waitFor(`document.querySelector('#log > .presence')`, { what: "the clauding chat's presence line" });
    await ctx.settle();
    out.running = await ctx.evaluate(`[...new Set(document.getAnimations().filter(a => a.playState === 'running').map(a => a.animationName || a.id || 'transition'))].sort()`);
    ctx.assert.ok(['ring', 'sonar', 'wag', 'swim'].every(n => out.running.includes(n)), `the lights on: ${JSON.stringify(out.running)}`);
    out.broken = await ctx.evaluate(ANIM_RULES);
    ctx.assert.deepEqual(out.broken, [], `nothing that keeps WebKit's frames on the main thread: ${JSON.stringify(out.broken)}`);
    return out;
  } finally { for (const s of sleeps) s.kill(); }
}
