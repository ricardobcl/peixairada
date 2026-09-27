// The open transcript while its chat lives (2026-09-27, night): presence at its foot — Claude's mark and "clauding…"
// while the chat works, the question while it asks, nothing once it is ready — kept the last thing in the log as
// replies come in. Two live chats in the fixture (a `sleep` each, the server only asks whether the pid is there): one
// mid tool call, one the registry says is waiting on a permission prompt; the first gets its end_turn written in.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeFixture, replyLines, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

const presence = ctx => ctx.evaluate(`JSON.stringify((p => p ? { text: p.textContent.trim(), ask: p.classList.contains('ask'), last: p === p.parentElement.lastElementChild, pix: !!p.querySelector('.pix'), anim: p.querySelector('.pix svg') ? getComputedStyle(p.querySelector('.pix svg')).animationName : null } : null)(document.querySelector('#log > .presence')))`).then(JSON.parse);

export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-tlive', 'tlive-repo'), now = Date.now();
  const sleeps = [0, 1].map(() => spawn('sleep', ['120'], { stdio: 'ignore' }));
  const live = (i, extra = {}) => ({ pid: sleeps[i].pid, startedAt: now - 3600_000, ...extra });
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Clauding', prompt: 'build it', reply: 'on it', at: new Date(now - 60_000), live: live(0),
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm run build', description: 'build' }, at: new Date(now - 10_000) }) },
      { cwd, title: 'Asking', prompt: 'may I?', reply: 'one question', at: new Date(now - 120_000), live: live(1, { status: 'waiting', waitingFor: 'permission prompt' }) },
    ]);
    const [working, asking] = chats;
    await ctx.waitFor(`document.querySelector('#slist > .card.working') && document.querySelector('#slist > .card.asking')`, { what: 'a clauding card and an asking one' });

    // clauding: the mark and the word, last in the log, in step with the divider
    await ctx.openChat(working.id);
    await ctx.waitFor(`!!document.querySelector('#log > .presence')`, { what: 'presence at the foot of the transcript' });
    out.working = await presence(ctx);
    ctx.assert.match(out.working.text, /^clauding…$/, 'the word');
    ctx.assert.ok(out.working.pix && out.working.anim === 'pix', "Claude's mark, stepping its frames");
    ctx.assert.ok(out.working.last && !out.working.ask, 'last in the log, and not a question');
    await ctx.shot('clauding');

    // the reply lands: the presence goes, the reply is the last thing
    appendFileSync(working.file, replyLines({ id: working.id, cwd, text: 'Built, all green.', at: new Date() }).map(l => JSON.stringify(l)).join('\n') + '\n');
    await ctx.waitFor(`!document.querySelector('#log > .presence') && /Built, all green/.test(document.querySelector('#log').lastElementChild?.textContent || '')`, { what: 'the presence gone and the reply last', timeout: 6000 });
    out.landed = await ctx.evaluate(`document.querySelector('#log').lastElementChild.className`);
    ctx.assert.match(out.landed, /\bmsg\b.*\bassistant\b/, 'the reply closes the log');

    // asking: the question in the card's red, from the registry's word
    await ctx.openChat(asking.id);
    await ctx.waitFor(`document.querySelector('#log > .presence.ask')`, { what: 'the question at the foot' });
    out.asking = await presence(ctx);
    ctx.assert.match(out.asking.text, /asking you — permission prompt/, 'what the registry says it waits on');
    ctx.assert.ok(out.asking.last, 'last in the log');
    await ctx.shot('asking');
  } finally { for (const s of sleeps) s.kill(); }
  return out;
}
