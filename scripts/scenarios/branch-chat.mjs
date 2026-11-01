// Branch from here (2026-10-31, round XIV's I6): a copy of a chat in a drawer of its own. What this checks: the header's
// ··· and a card's menu have it; Branch opens the column on the copy — a new id, its drawer attached, the fake started
// as `--resume <id> --fork-session --session-id <new>` —, the chat it copied not resumed nor written to; the copy's card
// says *branch* and the first one's *1 branch*, each ··· naming the other; a word typed in the copy is its own.
export const meta = { server: true, fake: true, fixture: 'auto' };
const sid = JSON.stringify;

export default async function (ctx) {
  const out = {}, [twoPrs, plain] = ctx.fixture.chats;
  const card = id => `document.querySelector('#slist > .card[data-id="${id}"]')`;
  const right = sel => ctx.evaluate(`(el => { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8 })); })(${sel})`);
  await ctx.waitFor(`!!${card(twoPrs.id)}`, { what: 'the cards' });
  await right(`${card(twoPrs.id)}.querySelector('.title')`);
  out.cardRow = await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.textContent.startsWith('Branch from here'))?.textContent || null`);
  ctx.assert.match(out.cardRow || '', /^Branch from herea copy in a drawer of its own/, 'a card\'s menu has it');
  await ctx.evaluate(`document.querySelector('#ctxm').close()`);

  // ---- ···'s Branch: the column on the copy, its drawer ----
  await ctx.openChat(plain.id);
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  await ctx.waitFor(`!!document.querySelector('#hmenu[open] #branchBtn')`, { what: '··· with Branch from here' });
  await ctx.settle(); await ctx.shot('1-menu');
  await ctx.evaluate(`document.querySelector('#branchBtn').click()`);
  const copy = await ctx.waitFor(`(c => c && c !== ${sid(plain.id)} && c)(window.peix.state().current)`, { timeout: 10_000, what: 'the column on the copy' });
  await ctx.waitFor(`(s => s?.alive && s.terminal?.exited === null && window.peix.state().termSession === ${sid(copy)})(window.peix.session(${sid(copy)}))`, { timeout: 20_000, what: 'its claude up in its drawer, attached' });
  await ctx.waitPrompt();
  out.screen = (await ctx.screen()).find(l => l.startsWith('fake claude')) || '';
  ctx.assert.match(out.screen, new RegExp(`session ${copy} \\(a branch of ${plain.id.slice(0, 8)}\\)`), 'claude started as a fork of it, under the board\'s id');
  ctx.assert.match(ctx.server.logText(), new RegExp(`--resume ${plain.id} --fork-session --session-id ${copy}`));
  out.orig = await ctx.evaluate(`(s => ({ alive: s.alive, terminal: s.terminal?.id || null }))(window.peix.session(${sid(plain.id)}))`);
  ctx.assert.deepEqual(out.orig, { alive: false, terminal: null }, 'the chat it copied is not resumed');

  // ---- tied both ways: the cards, each ··· ----
  await ctx.settle();
  out.chips = await ctx.evaluate(`[${sid(copy)}, ${sid(plain.id)}].map(id => document.querySelector('#slist > .card[data-id="' + id + '"] .chip.lnk')?.textContent || null)`);
  ctx.assert.deepEqual(out.chips, ['branch', '1 branch']);
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  out.copyMenu = await ctx.evaluate(`[...document.querySelectorAll('#hmenu [data-lnk]')].map(b => b.textContent)`);
  ctx.assert.deepEqual(out.copyMenu, ['Branched from “Plain chat”']);
  await ctx.settle(); await ctx.shot('2-copy');
  await ctx.evaluate(`document.querySelector('#hmenu').close()`);

  // ---- a word in the copy is the copy's ----
  await ctx.type('try it the other way');
  await ctx.waitFor(`window.peix.session(${sid(copy)})?.lastPrompt === 'try it the other way'`, { timeout: 15_000, what: 'the copy taking the word' });
  ctx.assert.equal(await ctx.evaluate(`window.peix.session(${sid(plain.id)}).lastPrompt`), 'what day is it?', 'the chat it copied did not');
  await ctx.openChat(plain.id);
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  out.origMenu = await ctx.evaluate(`[...document.querySelectorAll('#hmenu [data-lnk]')].map(b => b.textContent)`);
  ctx.assert.equal(out.origMenu.length, 1); ctx.assert.match(out.origMenu[0], /^Its branch “/);
  await ctx.evaluate(`document.querySelector('#hmenu').close()`);
  const t = (await ctx.peix(`session(${sid(copy)})`)).terminal;
  if (t) await ctx.server.api(`/api/terminals/${t.id}`, { method: 'DELETE' });
  return out;
}
