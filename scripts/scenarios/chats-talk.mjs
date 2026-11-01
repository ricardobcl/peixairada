// Chats that talk (2026-10-31, round XIV's I2): one chat messaged another with SendMessage, and both ends say so. Two
// live chats — storefront's "Retry declined payments" sent billing-api's "Queue for invoice webhooks" a message, which
// it took in and answered, and a second that waits while billing-api is at work. What this checks: the receiving card
// wears ← from Retry declined payments, in words for a screen reader too, and a click on it opens the sender; the
// transcript has the message as a row of its own — not your bubble, not Claude's —, its sender a button that opens that
// chat, its mode said; the waiting one at the log's foot, queued, before the presence line; the sender's SendMessage
// row links back to where it went; your last prompt and word are still yours. Shots dark and light.
import { spawn } from 'node:child_process';
import { appendFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, peerLines, replyLines, toolLines } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'large' } };

export default async function (ctx) {
  const out = {}, now = Date.now(), root = realpathSync(tmpDir('peix-talk-'));
  const sleeps = [0, 1].map(() => spawn('sleep', ['300'], { stdio: 'ignore' }));
  const ago = s => new Date(now - s * 1000);
  const A = { cwd: join(root, 'storefront') }, B = { cwd: join(root, 'billing-api') };
  try {
    let first, second;
    const { chats } = makeFixture(ctx.fixture.dir, [
      { ...A, title: 'Retry declined payments', prompt: 'retry declined cards, then tell billing', reply: 'Merged the retry module.', at: ago(900), live: { pid: sleeps[0].pid, name: 'storefront-1', startedAt: now - 3600_000 },
        lines: id => { A.id = id; return []; } },
      { ...B, title: 'Queue for invoice webhooks', prompt: 'queue the invoice webhooks', reply: 'Queued them on SQS.', at: ago(800), live: { pid: sleeps[1].pid, name: 'billing-api', startedAt: now - 3600_000 },
        lines: id => {
          B.id = id;
          first = peerLines({ from: A, to: B, fromName: 'storefront-1', toName: 'billing-api', pid: sleeps[0].pid, at: ago(600), body: 'The retry module is merged — import it from `@acme/payments` instead of your own loop.' });
          second = peerLines({ from: A, to: B, fromName: 'storefront-1', toName: 'billing-api', pid: sleeps[0].pid, at: ago(30), body: 'One more: the webhook secret moved to the vault.' });
          return [...first.delivered, ...replyLines({ id, cwd: B.cwd, text: 'Switched to the shared retry module.', at: ago(560) }),
            ...toolLines({ id, cwd: B.cwd, name: 'Bash', input: { command: 'npm test', description: 'Run the webhook tests' }, at: ago(60) }), second.queued[0]];
        } },
    ]);
    const [a, b] = chats;
    // the sender's side: its SendMessages and their results, written once the fixture knew both ids, and its turn's end
    appendFileSync(a.file, [...first.sent, ...second.sent, ...replyLines({ id: a.id, cwd: A.cwd, text: 'Told billing-api twice.', at: ago(20) })].map(l => JSON.stringify(l)).join('\n') + '\n');

    const card = `#slist > .card[data-id="${b.id}"]`;
    await ctx.waitFor(`document.querySelector('${card} .chip.peerin')`, { what: 'the receiving card’s mark', timeout: 20000 });
    await ctx.settle();
    out.mark = await ctx.evaluate(`(c => ({ text: c.textContent, sid: c.dataset.sid, said: c.querySelector('.vh')?.textContent, tip: c.title }))(document.querySelector('${card} .chip.peerin'))`);
    ctx.assert.match(out.mark.text, /←\s*from Retry declined payments/, 'the card says who messaged it, by that chat’s title');
    ctx.assert.equal(out.mark.sid, a.id);
    ctx.assert.match(out.mark.tip, /waiting for this chat/, 'the newest is the one still queued');
    ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#slist > .card[data-id="${a.id}"] .chip.peerin')`), false, 'the sender’s card has no mark');

    await ctx.openChat(b.id);
    await ctx.waitFor(`document.querySelector('#log .msg.peer:not(.queued)') && document.querySelector('#log > .peerq .msg.peer.queued')`, { what: 'the message rows' });
    await ctx.settle();
    out.row = await ctx.evaluate(`(r => ({ cls: r.className, who: r.querySelector('.who').textContent, sid: r.querySelector('.peerlink')?.dataset.sid, mode: r.querySelector('.pmode')?.textContent,
      text: r.querySelector('.text').textContent.trim(), code: !!r.querySelector('.text code'), said: r.querySelector('.vh')?.textContent,
      bubbles: document.querySelectorAll('#log .msg.user').length }))(document.querySelector('#log .msg.peer:not(.queued)'))`);
    ctx.assert.match(out.row.who, /from Retry declined payments/); ctx.assert.equal(out.row.sid, a.id);
    ctx.assert.equal(out.row.mode, 'prompting', 'the sender’s permission mode said');
    ctx.assert.match(out.row.text, /retry module is merged/); ctx.assert.equal(out.row.code, true, 'its words drawn as Claude’s are');
    ctx.assert.equal(out.row.bubbles, 1, 'one bubble of yours — the message is not one');
    out.queued = await ctx.evaluate(`(q => ({ pq: q.querySelector('.pq')?.textContent, text: q.querySelector('.text').textContent, beforePresence: !!document.querySelector('#log > .peerq + .presence'),
      last: [...document.querySelectorAll('#log > *')].slice(-2).map(n => n.className) }))(document.querySelector('#log > .peerq .msg.peer.queued'))`);
    ctx.assert.equal(out.queued.pq, 'queued'); ctx.assert.match(out.queued.text, /webhook secret/);
    ctx.assert.equal(out.queued.beforePresence, true, 'the queue is the log’s foot, before the clauding line');
    const sum = await ctx.evaluate(`peix.session('${b.id}')`);
    ctx.assert.equal(sum.lastPrompt, 'queue the invoice webhooks', 'your last prompt, still yours');
    await ctx.shot('chats-talk-large');

    // the sender's name, clicked: that chat, and its SendMessage row links back
    await ctx.evaluate(`document.querySelector('#log .msg.peer .peerlink').click()`);
    await ctx.waitFor(`document.querySelector('#log[data-sid="${a.id}"]')`, { what: 'the sender open' });
    await ctx.waitFor(`document.querySelector('#log .tool .peerlink[data-sid="${b.id}"]')`, { what: 'the SendMessage row’s link' });
    out.send = await ctx.evaluate(`[...document.querySelectorAll('#log .tool .peerlink')].map(l => l.textContent)`);
    ctx.assert.deepEqual(out.send, ['→ Queue for invoice webhooks', '→ Queue for invoice webhooks'], 'each send names the chat it reached');
    await ctx.evaluate(`document.querySelector('#log details.toolgroup').open = true`);
    await ctx.settle();
    await ctx.shot('chats-talk-sender');

    // the card's mark, clicked, opens the sender too
    await ctx.openChat(b.id);
    await ctx.evaluate(`document.querySelector('${card} .chip.peerin').click()`);
    await ctx.waitFor(`peix.state().current === '${a.id}'`, { what: 'the mark opens the sender' });

    // dark and light
    for (const scheme of ['dark', 'light']) {
      await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
      await ctx.reload();
      await ctx.openChat(b.id);
      await ctx.waitFor(`document.querySelector('#log .msg.peer') && document.querySelector('${card} .chip.peerin')`, { what: `the rows in ${scheme}` });
      await ctx.settle();
      out[scheme] = await ctx.evaluate(`(c => { const r = c.getBoundingClientRect(), t = c.closest('.card').getBoundingClientRect(); return { inCard: r.right <= t.right + 0.5 && r.left >= t.left - 0.5, w: Math.round(r.width), shown: getComputedStyle(c).display !== 'none' }; })(document.querySelector('${card} .chip.peerin'))`);
      ctx.assert.equal(out[scheme].shown, true, `the mark shows in ${scheme}`);
      ctx.assert.equal(out[scheme].inCard, true, `and stays inside its card in ${scheme}`);
      await ctx.shot(`chats-talk-${scheme}`);
    }
    return out;
  } finally { for (const s of sleeps) s.kill(); }
}
