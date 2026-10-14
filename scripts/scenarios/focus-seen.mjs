// A reply to the open chat while the board is on screen but another window has the keys is unread, and seen once the
// board has them back (2026-10-14): only a page coming back into view cleared it — a board beside the editor, never
// hidden, kept the open chat's badge, its New replies and the Dock's count until the chat was opened again. What this
// checks: the page's focus taken away (CDP's focus emulation off), a reply appended to the open chat — its card's
// badge, a new reply —, the focus given back — no badge, not a new reply, the server told.
import { appendFileSync } from 'node:fs';
import { replyLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {}, chat = ctx.fixture.chats[1];
  const card = `document.querySelector('#slist > .card[data-id="${chat.id}"]')`;
  const fresh = `(s => !!s && !!s.seenAt && s.lastReplyAt > s.seenAt)(window.peix.session('${chat.id}'))`;
  await ctx.openChat(chat.id);
  await ctx.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  await ctx.waitFor(`!document.hasFocus()`, { what: 'the page without the keys' });
  await ctx.sleep(200); const at = new Date();   // after the open marked it seen, before the focus comes back
  appendFileSync(chat.file, replyLines({ id: chat.id, cwd: chat.cwd, text: 'A reply while you were in another window.', at }).map(l => JSON.stringify(l)).join('\n') + '\n');
  await ctx.waitFor(`!!${card}?.querySelector('.badge') && ${fresh}`, { what: 'the reply unread on its card, a new reply' });
  out.away = await ctx.evaluate(`${card}.querySelector('.badge').textContent`);
  await ctx.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await ctx.waitFor(`document.hasFocus() && !${card}?.querySelector('.badge') && !${fresh}`, { what: 'the focus back: the badge gone, the reply seen' });
  // the server has it too: a reload keeps the reply seen
  await ctx.sleep(300);
  await ctx.reload();
  await ctx.waitFor(`!!window.peix.session('${chat.id}')`, { what: 'the chat after a reload' });
  out.after = await ctx.evaluate(`JSON.stringify((s => ({ seenAt: s.seenAt, lastReplyAt: s.lastReplyAt }))(window.peix.session('${chat.id}')))`).then(JSON.parse);
  ctx.assert.ok(out.after.seenAt >= out.after.lastReplyAt, `seen on the server: ${JSON.stringify(out.after)}`);
  return out;
}
