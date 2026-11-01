// Merge with… (2026-10-31, round XIV's I4): two or more chats into a new one. What this checks: a card's menu opens the
// picker with that chat taken in, ⏎ takes another in, the first row goes on; the box holds the handoff the server wrote
// from both transcripts, the folder the first chat's; your words added to it, ⌘⏎ starts a new chat in a drawer with it
// as its first prompt — the column on it at once —; the old chats stay as they were, each tied to the new one: the
// cards say so, and the new chat's ··· lists where it came from.
export const meta = { server: true, fake: true, fixture: 'auto' };
const sid = JSON.stringify;

export default async function (ctx) {
  const out = {}, [twoPrs, plain] = ctx.fixture.chats;
  const card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;
  const right = sel => ctx.evaluate(`(el => { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8 })); })(${sel})`);
  const enter = (sel, more = '') => ctx.evaluate(`document.querySelector(${sid(sel)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true${more} }))`);
  await ctx.waitFor(`!!${card(plain.id)} && !!${card(twoPrs.id)}`, { what: 'both cards' });
  const before = await ctx.evaluate(`window.peix.sessions().map(s => s.id)`);

  // ---- the picker: this chat in, another taken in, the first row on ----
  await right(`${card(plain.id)}.querySelector('.title')`);
  await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.textContent.startsWith('Merge with…')).click()`);
  await ctx.waitFor(`document.querySelector('#pick').open && /1 in/.test(document.querySelector('#pickq').placeholder)`, { what: 'the picker, the card\'s chat in' });
  out.first = await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow')].map(r => r.textContent.trim())`);
  ctx.assert.match(out.first[0], /^Merge — 1 chat in so far/, 'the first row says what is in');
  ctx.assert.ok(out.first.some(t => t.startsWith('✓taken in: Plain chat')), `the card's chat is in, the ✓ said in words too: ${JSON.stringify(out.first)}`);
  await ctx.fill('#pickq', 'two prs');
  await enter('#pickq');
  await ctx.waitFor(`/2 in/.test(document.querySelector('#pickq').placeholder)`, { what: 'the second chat taken in' });
  await ctx.settle(); await ctx.shot('1-picker');
  await ctx.evaluate(`document.querySelector('#picklist .pkrow.go').click()`);

  // ---- the box: the handoff from both, the first chat's folder ----
  await ctx.waitFor(`document.querySelector('#handoff').open && !document.querySelector('#hoText').disabled && document.querySelector('#hoText').value.includes('## 2.')`, { timeout: 10_000, what: 'the handoff in the box' });
  out.box = await ctx.evaluate(`({ title: document.querySelector('#hoTitle').textContent, chats: [...document.querySelectorAll('#hoChats .ht')].map(e => e.textContent), cwd: document.querySelector('#hoCwd').value, options: document.querySelectorAll('#hoCwd option').length, text: document.querySelector('#hoText').value, go: document.querySelector('#hoGo').textContent })`);
  ctx.assert.equal(out.box.title, 'Merge 2 chats into a new chat');
  ctx.assert.deepEqual(out.box.chats, ['Plain chat', 'Two PRs mentioned'], 'in the order taken in');
  ctx.assert.equal(out.box.cwd, plain.cwd, 'the folder: the first chat\'s');
  ctx.assert.equal(out.box.options, 3, 'either chat\'s folder, or none');
  ctx.assert.match(out.box.text, /^A handoff: 2 chats of mine[\s\S]*## 1\. Plain chat[\s\S]*Last asked: what day is it\?[\s\S]*> It is a fixture\. No PRs here\.[\s\S]*## 2\. Two PRs mentioned[\s\S]*PRs: https:\/\/github\.com\/acme\/repo-a\/pull\/1[23]/, out.box.text);
  ctx.assert.equal(out.box.go, 'Start');
  await ctx.settle(); await ctx.shot('2-box');
  await ctx.evaluate(`(t => { t.value += '\\n\\nKeep it short.'; })(document.querySelector('#hoText'))`);
  await enter('#hoText', ', metaKey: true');

  // ---- the new chat: a drawer, the handoff its first prompt, tied both ways ----
  const fresh = await ctx.waitFor(`(() => { const s = window.peix.sessions().map(x => window.peix.session(x.id)).find(s => !${sid(before)}.includes(s.id) && s.links?.length === 2); return s && s.id; })()`, { timeout: 15_000, what: 'the new chat, tied to both' });
  ctx.assert.equal(await ctx.evaluate(`window.peix.state().current`), fresh, 'the column on it at once');
  await ctx.waitFor(`(s => s?.alive && s.terminal?.exited === null && /^A handoff: 2 chats/.test(s.lastPrompt || ''))(window.peix.session(${sid(fresh)}))`, { timeout: 20_000, what: 'its claude up, the handoff its first prompt' });
  const said = (await ctx.server.api(`/api/sessions/${fresh}/messages`)).body.entries.find(e => e.role === 'user' && e.kind === 'text')?.text || '';
  ctx.assert.match(said, /^A handoff: 2 chats[\s\S]*## 2\. Two PRs mentioned[\s\S]*\n\nKeep it short\.$/, 'the prompt: the handoff as it stood in the box, your words in it');
  await ctx.settle();
  out.cards = await ctx.evaluate(`Object.fromEntries([${sid(fresh)}, ${sid(plain.id)}, ${sid(twoPrs.id)}].map(id => [id.slice(0, 8), document.querySelector('#slist > .card[data-id="' + id + '"] .chip.lnk')?.textContent || null]))`);
  ctx.assert.equal(out.cards[fresh.slice(0, 8)], 'merge of 2', JSON.stringify(out.cards));
  ctx.assert.equal(out.cards[plain.id.slice(0, 8)], 'merged'); ctx.assert.equal(out.cards[twoPrs.id.slice(0, 8)], 'merged');
  out.oldStay = await ctx.evaluate(`[${sid(plain.id)}, ${sid(twoPrs.id)}].map(id => (s => ({ done: s.done, alive: s.alive }))(window.peix.session(id)))`);
  ctx.assert.deepEqual(out.oldStay, [{ done: false, alive: false }, { done: false, alive: false }], 'the old chats stay as they were');
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  out.menu = await ctx.evaluate(`[...document.querySelectorAll('#hmenu [data-lnk]')].map(b => b.textContent)`);
  ctx.assert.deepEqual(out.menu.sort(), ['Merged from “Plain chat”', 'Merged from “Two PRs mentioned”'], '··· lists where it came from');
  await ctx.settle(); await ctx.shot('3-merged');
  await ctx.evaluate(`[...document.querySelectorAll('#hmenu [data-lnk]')].find(b => /Plain chat/.test(b.textContent)).click()`);
  await ctx.waitFor(`window.peix.state().current === ${sid(plain.id)}`, { what: 'a row opens the chat it names' });
  const t = (await ctx.peix(`session(${sid(fresh)})`)).terminal;
  if (t) await ctx.server.api(`/api/terminals/${t.id}`, { method: 'DELETE' });
  return out;
}
