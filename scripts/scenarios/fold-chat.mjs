// Fold into… (2026-10-31, round XIV's I5): one chat's handoff typed into another's drawer, unsent, and the first ticked
// done. What this checks: a card's menu, the picker of where it can go (not itself), the box with the handoff; Fold opens
// the other chat, resumes its drawer (it had no claude), types the handoff into its prompt and sends nothing — ⏎ in the
// drawer sends it —; the first chat is done, both are tied; a chat at work cannot be folded.
export const meta = { server: true, fake: true, fixture: 'auto' };
const sid = JSON.stringify;

export default async function (ctx) {
  const out = {}, [twoPrs, plain] = ctx.fixture.chats;
  const card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;
  const right = sel => ctx.evaluate(`(el => { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8 })); })(${sel})`);
  const row = t => `[...document.querySelectorAll('#ctxm button')].find(b => b.textContent.startsWith(${sid(t)}))`;
  const enter = (sel, more = '') => ctx.evaluate(`document.querySelector(${sid(sel)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true${more} }))`);
  await ctx.waitFor(`!!${card(plain.id)} && !!${card(twoPrs.id)}`, { what: 'both cards' });

  // ---- the menu, the picker (not itself), the box ----
  await right(`${card(twoPrs.id)}.querySelector('.title')`);
  out.row = await ctx.evaluate(`(b => b && { off: b.disabled, text: b.textContent })(${row('Fold into…')})`);
  ctx.assert.equal(out.row?.off, false, `the card's menu has it: ${JSON.stringify(out.row)}`);
  await ctx.evaluate(`${row('Fold into…')}.click()`);
  await ctx.waitFor(`document.querySelector('#pick').open && document.querySelector('#pickq').placeholder.startsWith('Fold “Two PRs mentioned” into')`, { what: 'the picker' });
  out.targets = await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow .n')].map(n => n.textContent)`);
  ctx.assert.deepEqual(out.targets, ['Plain chat'], 'every chat but itself');
  await enter('#pickq');
  await ctx.waitFor(`document.querySelector('#handoff').open && !document.querySelector('#hoText').disabled && /^Another chat of mine/.test(document.querySelector('#hoText').value)`, { timeout: 10_000, what: 'the box, the handoff in it' });
  out.box = await ctx.evaluate(`({ title: document.querySelector('#hoTitle').textContent, chats: [...document.querySelectorAll('#hoChats .hochat')].map(e => e.textContent), say: document.querySelector('#hoSay').textContent, go: document.querySelector('#hoGo').textContent })`);
  ctx.assert.deepEqual(out.box.chats, ['repo-aTwo PRs mentionedthen done', 'TPlain chatgets it, unsent']);
  ctx.assert.match(out.box.say, /not sent: read it there, and ⏎ sends it/);
  await ctx.settle(); await ctx.shot('1-box');
  await enter('#hoText', ', metaKey: true');

  // ---- the other chat opened, its drawer resumed, the handoff in its prompt — unsent ----
  await ctx.waitFor(`window.peix.state().current === ${sid(plain.id)}`, { what: 'the chat it went into, opened' });
  await ctx.waitFor(`(s => s?.alive && s.terminal?.exited === null)(window.peix.session(${sid(plain.id)}))`, { timeout: 20_000, what: 'its drawer resumed' });
  await ctx.waitFor(`[...document.querySelectorAll('#termBody .xterm-rows > div')].some(r => r.textContent.includes('❯ Another chat of mine, folded into this one'))`, { timeout: 15_000, what: 'the handoff in its prompt' });
  await ctx.sleep(1200);
  out.unsent = await ctx.evaluate(`window.peix.session(${sid(plain.id)}).lastPrompt`);
  ctx.assert.equal(out.unsent, 'what day is it?', 'typed, not sent');
  await ctx.waitFor(`(s => s?.done && s.links?.some(l => l.k === 'fold' && l.dir === 'out' && l.id === ${sid(plain.id)}))(window.peix.session(${sid(twoPrs.id)}))`, { timeout: 10_000, what: 'the first chat done, tied to it' });
  out.into = await ctx.evaluate(`window.peix.session(${sid(plain.id)}).links`);
  ctx.assert.deepEqual(out.into.map(l => [l.k, l.dir, l.id]), [['fold', 'in', twoPrs.id]]);
  await ctx.settle(); await ctx.shot('2-unsent');
  // ⏎ in the drawer is yours, and sends it
  await ctx.type('');
  await ctx.waitFor(`/^Another chat of mine/.test(window.peix.session(${sid(plain.id)})?.lastPrompt || '')`, { timeout: 15_000, what: 'sent by your ⏎' });

  // ---- a chat at work is not folded ----
  await ctx.type('slow 20');
  await ctx.waitFor(`window.peix.session(${sid(plain.id)})?.status === 'working'`, { timeout: 10_000, what: 'the chat at work' });
  await ctx.settle();
  await right(`${card(plain.id)}.querySelector('.title')`);
  out.busy = await ctx.evaluate(`(b => b && { off: b.disabled, text: b.textContent })(${row('Fold into…')})`);
  ctx.assert.deepEqual(out.busy, { off: true, text: 'Fold into…it is at work — fold it once it is idle' });
  await ctx.evaluate(`document.querySelector('#ctxm').close()`);
  const t = (await ctx.peix(`session(${sid(plain.id)})`)).terminal;
  if (t) await ctx.server.api(`/api/terminals/${t.id}`, { method: 'DELETE' });
  return out;
}
