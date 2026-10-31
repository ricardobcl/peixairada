// Send to… (2026-10-31, round XIV's I1): a message of yours to a chat, from its card's right-click menu or the launcher's
// chat picker, written in a box of its own. What this checks: the card's row and the box naming the chat; ⏎ on a chat
// with no process resumes it in a drawer with the words as its first prompt (the fake answers them); the launcher's
// picker to the same chat, now with a drawer, types them in and sends; a chat live in another terminal is a row that
// is there but off, saying why, in the menu and in the picker.
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { procStartOf } from '../fixture.mjs';

export const meta = { server: true, fake: true, fixture: 'auto' };
const sid = JSON.stringify;

export default async function (ctx) {
  const out = {}, [twoPrs, plain] = ctx.fixture.chats;
  const card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;
  const right = sel => ctx.evaluate(`(el => { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8 })); })(${sel})`);
  const row = t => `[...document.querySelectorAll('#ctxm button')].find(b => b.textContent.startsWith(${sid(t)}))`;
  const enter = sel => ctx.evaluate(`document.querySelector(${sid(sel)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`!!${card(plain.id)}`, { what: 'the plain chat\'s card' });

  // ---- the card's menu, the box, ⏎: a chat with no process resumes with the words ----
  await right(`${card(plain.id)}.querySelector('.title')`);
  out.row = await ctx.evaluate(`(b => b && { off: b.disabled, text: b.textContent })(${row('Send to this chat…')})`);
  ctx.assert.deepEqual(out.row, { off: false, text: 'Send to this chat…' }, 'the card\'s menu has the row, on');
  await ctx.evaluate(`${row('Send to this chat…')}.click()`);
  await ctx.waitFor(`document.querySelector('#handoff').open && document.activeElement?.id === 'hoText'`, { what: 'the box, its words\' keys' });
  out.box = await ctx.evaluate(`({ title: document.querySelector('#hoTitle').textContent, chat: document.querySelector('#hoChats .hochat .ht').textContent, say: document.querySelector('#hoSay').textContent })`);
  ctx.assert.equal(out.box.chat, 'Plain chat', 'it names the chat');
  ctx.assert.match(out.box.say, /isn’t running: its drawer opens here/, 'and says how the words will land');
  await ctx.fill('#hoText', 'hello from the board');
  await ctx.settle(); await ctx.shot('1-box');
  await enter('#hoText');
  await ctx.waitFor(`!document.querySelector('#handoff').open`, { what: 'the box closed on ⏎' });
  await ctx.waitFor(`(s => s?.alive && s.terminal?.exited === null && s.lastPrompt === 'hello from the board')(window.peix.session(${sid(plain.id)}))`, { timeout: 20_000, what: 'the chat resumed in a drawer, the words its prompt' });
  await ctx.waitFor(`/You said: hello from the board/.test(window.peix.session(${sid(plain.id)})?.lastReply || '')`, { timeout: 20_000, what: 'its Claude answering them' });
  out.notOpened = await ctx.evaluate(`window.peix.state().current`);
  ctx.assert.notEqual(out.notOpened, plain.id, 'the column stays where it was: sending is not going there');

  // ---- the launcher's picker: the same chat, its drawer here now — typed in and sent ----
  await ctx.key('KeyL');
  await ctx.fill('#pickq', '>send to');
  await ctx.waitFor(`[...document.querySelectorAll('#picklist .pkrow.action')].some(r => /Send to a chat/.test(r.textContent))`, { what: 'the launcher\'s row' });
  await enter('#pickq');
  await ctx.waitFor(`window.peix.state().pick?.mode === 'chatpick' || document.querySelector('#pickq').placeholder.startsWith('Send to a chat')`, { what: 'the chat picker' });
  await ctx.fill('#pickq', 'plain');
  await enter('#pickq');
  await ctx.waitFor(`document.querySelector('#handoff').open`, { what: 'the box, from the picker' });
  out.say2 = await ctx.evaluate(`document.querySelector('#hoSay').textContent`);
  ctx.assert.match(out.say2, /^Typed into its drawer here and sent/, 'a chat with a drawer: typed in');
  await ctx.fill('#hoText', 'and a second word');
  await enter('#hoText');
  await ctx.waitFor(`window.peix.session(${sid(plain.id)})?.lastPrompt === 'and a second word'`, { timeout: 20_000, what: 'the second message its prompt' });

  // ---- a chat live in another terminal: there, but off ----
  const pid = process.pid, reg = join(ctx.fixture.dir, 'sessions', `${pid}.json`);
  writeFileSync(reg, JSON.stringify({ pid, procStart: procStartOf(pid), sessionId: twoPrs.id, cwd: twoPrs.cwd, startedAt: Date.now() - 60_000, version: 'fixture', kind: 'interactive', entrypoint: 'cli', status: 'idle', statusUpdatedAt: Date.now() }));
  try {
    await ctx.waitFor(`window.peix.session(${sid(twoPrs.id)})?.alive`, { timeout: 15_000, what: 'the other chat live elsewhere' });
    await ctx.settle();
    await right(`${card(twoPrs.id)}.querySelector('.title')`);
    out.elsewhere = await ctx.evaluate(`(b => b && { off: b.disabled, text: b.textContent })(${row('Send to this chat…')})`);
    ctx.assert.equal(out.elsewhere.off, true, 'the row is off');
    ctx.assert.match(out.elsewhere.text, /another terminal, out of the board's reach/, 'and says why');
    await ctx.settle(); await ctx.shot('2-menu-off');
    await ctx.evaluate(`document.querySelector('#ctxm').close()`);
    await ctx.key('KeyL'); await ctx.fill('#pickq', '>send to'); await enter('#pickq');
    await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('Send to a chat')`, { what: 'the picker again' });
    out.picker = await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow')].map(r => ({ off: r.classList.contains('off'), text: r.querySelector('.n').textContent }))`);
    ctx.assert.ok(out.picker.some(r => r.off && /out of the board's reach/.test(r.text)), `the picker dims it, saying why: ${JSON.stringify(out.picker)}`);
    ctx.assert.ok(out.picker.some(r => !r.off && /^Plain chat/.test(r.text)), 'and keeps the one it can send to');
    await ctx.settle(); await ctx.shot('3-picker');
    await ctx.evaluate(`document.querySelector('#pick').close()`);
  } finally { try { unlinkSync(reg); } catch {} }
  const t = (await ctx.peix(`session(${sid(plain.id)})`)).terminal;
  if (t) await ctx.server.api(`/api/terminals/${t.id}`, { method: 'DELETE' });
  return out;
}
