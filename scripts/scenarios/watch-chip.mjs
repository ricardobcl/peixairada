// A watching card is the node it was through its monitor's events and the clock (2026-10-14): the chip's tooltip — what
// is running, the time left, how many events — was in the card's markup, so every event and every minute drew the card
// anew (the cards are reconciled by their markup). It is written after the draw now, as an age is. What this checks:
// a chat with a monitor that has reported once; an event more keeps the card's node and its tooltip counts two; the
// header's chip of the open chat says the same and counts the next.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { makeFixture, replyLines, taskNoteLine, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {}, cwd = ctx.fixture.chats[0]?.cwd || process.cwd(), mon = 'mon7wt3c4';
  const sleeper = spawn('sleep', ['300'], { stdio: 'ignore' });
  const now = Date.now(), at = ms => new Date(now - ms);
  try {
    const { chats: [w] } = makeFixture(ctx.fixture.dir, [{ cwd, title: 'Watching CI', prompt: 'watch the CI on #382', reply: 'watching', at: at(600_000), live: { pid: sleeper.pid, startedAt: now - 3600_000 },
      lines: id => [
        ...toolLines({ id, cwd, name: 'Monitor', input: { command: 'gh pr checks 382', description: 'CI checks on PR #382', timeout_ms: 1800_000 },
          result: `Monitor started (task ${mon}, expires in 30m unless the source ends first).`, at: at(240_000) }),
        taskNoteLine({ id, cwd, taskId: mon, summary: 'Monitor event: "CI checks on PR #382"', event: 'Build: pass', at: at(120_000) }),
        ...replyLines({ id, cwd, text: 'Build passed; still waiting on the rest.', at: at(115_000) }),
      ] }]);
    const card = `document.querySelector('#slist > .card[data-id="${w.id}"]')`, tip = `${card}?.querySelector('.chip.watch')?.title`;
    const event = text => appendFileSync(w.file, JSON.stringify(taskNoteLine({ id: w.id, cwd, taskId: mon, summary: 'Monitor event: "CI checks on PR #382"', event: text })) + '\n');
    await ctx.waitFor(`${card}?.classList.contains('watching') && !!${tip}`, { what: 'the watching card and its chip' });
    await ctx.settle();
    out.before = await ctx.evaluate(`(window.__wcard = ${card}, ${tip})`);
    ctx.assert.match(out.before, /^monitor: CI checks on PR #382 · \d+m left · 1 event$/, `the chip's tooltip: ${out.before}`);
    event('Tests: 212 passed');
    await ctx.waitFor(`/ · 2 events$/.test(${tip} || '')`, { what: 'the tooltip counting the new event' });
    await ctx.settle();
    out.after = await ctx.evaluate(tip);
    ctx.assert.ok(await ctx.evaluate(`window.__wcard.isConnected && ${card} === window.__wcard`), 'the card kept its node through the event');
    // the header's chip, the open chat's
    await ctx.openChat(w.id);
    await ctx.waitFor(`/ · 2 events$/.test(document.querySelector('#shead .chip.watch')?.title || '')`, { what: "the header's chip and its tooltip" });
    event('Lint: clean');
    await ctx.waitFor(`/ · 3 events$/.test(document.querySelector('#shead .chip.watch')?.title || '')`, { what: "the header's tooltip counting the next" });
    out.head = await ctx.evaluate(`document.querySelector('#shead .chip.watch').title`);
    return out;
  } finally { try { sleeper.kill(); } catch {} }
}
