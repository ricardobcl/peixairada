// A chat opened twice before its transcript came keeps what the stream said meanwhile (2026-10-14). Two asks for one
// chat were both taken: the first answer drew the log and let the stream's entries in, and the second — read before
// those entries were folded — put the log back as it was, the reply that came between gone until something else came.
// Each ask is numbered and only the newest is taken; the stream waits for it. What this checks: a card clicked twice
// (a double click), the second answer held back by the page's fetch until a reply has been appended and pushed, then
// let go — the log ends with that reply.
import { appendFileSync } from 'node:fs';
import { replyLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {}, [a, b] = ctx.fixture.chats;
  await ctx.openChat(b.id);
  // the page's second /messages ask for chat a: its answer held until the scenario lets it go
  await ctx.evaluate(`(() => {
    const real = window.fetch; window.__asks = 0; window.__first = false;
    window.__hold = new Promise(r => { window.__release = r; });
    window.fetch = async (url, o) => {
      const mine = String(url).includes(${JSON.stringify(`/api/sessions/${a.id}/messages`)}), n = mine ? ++window.__asks : 0;
      const r = await real(url, o);
      if (n === 1) window.__first = true;
      if (n === 2) { const body = await r.text(); await window.__hold; return new Response(body, { status: r.status, headers: r.headers }); }
      return r;
    };
  })()`);
  // a double click on its card, as the pointer makes it: the second click lands on the card the first one redrew
  await ctx.settle();
  const at0 = await ctx.evaluate(`(r => ({ x: r.left + r.width / 2, y: r.top + 14 }))(document.querySelector('#slist > .card[data-id="${a.id}"] .title').getBoundingClientRect())`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at0.x, y: at0.y });
  for (const clickCount of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: at0.x, y: at0.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount });
  await ctx.waitFor(`window.__first && window.__asks === 2`, { what: 'both asks out, the first answered' });
  await ctx.sleep(300);   // the first answer taken, if it is
  // a reply lands while the second ask is on its way: the server folds it and pushes it
  const text = 'The reply that came between the two answers.', at = new Date(Date.now() + 1000);
  appendFileSync(a.file, replyLines({ id: a.id, cwd: a.cwd, text, at }).map(l => JSON.stringify(l)).join('\n') + '\n');
  await ctx.waitFor(`window.peix.session('${a.id}')?.lastReplyAt === '${at.toISOString()}'`, { what: 'the reply pushed' });
  await ctx.sleep(300);   // its entries event, right after the summary's
  await ctx.evaluate(`window.__release()`);
  await ctx.sleep(500);
  out.last = await ctx.evaluate(`document.querySelector('#log > .msg:last-of-type')?.textContent || ''`);
  out.count = await ctx.evaluate(`[...document.querySelectorAll('#log .msg')].filter(m => m.textContent.includes(${JSON.stringify(text)})).length`);
  ctx.assert.ok(out.last.includes(text), `the log ends with the reply that came between the answers: ${JSON.stringify(out.last.slice(0, 120))}`);
  ctx.assert.equal(out.count, 1, 'drawn once');
  return out;
}
