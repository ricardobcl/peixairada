// The ⌥⌘ family on a fixture: G opens the picker on a two-PR chat, ⏎ opens the first, G again moves to the next
// and back; T, E, V and C hit their routes (stubbed); O is the project picker; ↓ ↑ walk the list; the cog lists every
// key; no chat → a note.
export const meta = { server: true, fixture: 'auto' };
export default async function (ctx) {
  const [two, plain] = ctx.fixture.chats;
  const out = {};
  const txt = sel => ctx.evaluate(`(document.querySelector(${JSON.stringify(sel)})?.textContent || '').trim().replace(/\\s+/g, ' ')`);
  const bar = () => ctx.evaluate(`document.querySelector('#prbar').hidden ? null : document.querySelector('#prbar .num')?.textContent`);
  // no chat open: notes
  await ctx.key('KeyG'); out.noChatNote = await txt('.note');
  await ctx.evaluate(`document.querySelectorAll('.note').forEach(n => n.remove())`);
  // the two-PR chat
  await ctx.openChat(two.id);
  await ctx.waitFor(`document.querySelectorAll('#prlist .prrow').length === 2`, { what: 'two PR rows' });
  await ctx.key('KeyG');
  out.picker = { open: await ctx.evaluate(`document.querySelector('#pick').open`), rows: await ctx.evaluate(`document.querySelectorAll('#picklist .pkrow.pr').length`), placeholder: await ctx.evaluate(`document.querySelector('#pickq').placeholder`) };
  ctx.assert.equal(out.picker.open, true); ctx.assert.equal(out.picker.rows, 2);
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.sleep(300);
  out.first = await bar(); ctx.assert.ok(out.first, 'the first PR opened in the strip');
  await ctx.key('KeyG'); await ctx.sleep(300); out.second = await bar();
  ctx.assert.notEqual(out.second, out.first, 'G again moved to the other PR');
  await ctx.key('KeyG'); await ctx.sleep(300); out.third = await bar();
  ctx.assert.equal(out.third, out.first, 'and back');
  out.peixState = await ctx.peix('state()');
  ctx.assert.match(String(out.peixState.prbar), /\/pull\/\d+$/, 'the strip holds the current PR (pane pages exist only in the app)');
  // T, E, V and C, routes stubbed so nothing spawns or opens
  await ctx.evaluate(`window.__hits = []; const real = window.fetch; window.fetch = (u, o) => { const s = String(u); if (/\\/(terminal|vscode-web|focus|shell)$/.test(s)) { window.__hits.push([s, o?.method]); return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'stubbed' }) }); } return real(u, o); }`);
  for (const k of ['KeyT', 'KeyE', 'KeyV', 'KeyC']) { await ctx.key(k); await ctx.sleep(200); }
  out.hits = await ctx.evaluate(`JSON.stringify(window.__hits)`).then(JSON.parse);
  for (const route of ['/shell', '/vscode-web', '/focus', '/terminal']) ctx.assert.ok(out.hits.some(h => h[0].endsWith(route)), `${route} was hit (T zsh, E web editor, V VS Code, C claude)`);
  // ⌃⌘ is not the chord
  await ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyO', key: 'o', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true }))`);
  out.wrongChord = await ctx.evaluate(`document.querySelector('#pick').open`); ctx.assert.equal(out.wrongChord, false, '⌃⌘O does not open the picker');
  // O, the project picker
  await ctx.evaluate(`document.querySelector('#pick').close()`);
  await ctx.key('KeyO');
  out.projectPicker = { open: await ctx.evaluate(`document.querySelector('#pick').open`), rows: await ctx.evaluate(`document.querySelectorAll('#picklist .pkrow:not(.pr)').length`) };
  ctx.assert.ok(out.projectPicker.open && out.projectPicker.rows >= 2);
  await ctx.evaluate(`document.querySelector('#pick').close()`);
  // ↓ and ↑ walk the list as shown: from the two-PR chat to the card beside it and back
  await ctx.openChat(two.id);
  const order = await ctx.evaluate(`[...document.querySelectorAll('#slist .card')].map(c => c.dataset.id)`);
  const at = order.indexOf(two.id), down = at + 1 < order.length, beside = order[down ? at + 1 : at - 1];
  ctx.assert.ok(beside, 'a card beside it');
  await ctx.key(down ? 'ArrowDown' : 'ArrowUp'); await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(beside)}`, { what: 'the chat beside it opened' });
  await ctx.key(down ? 'ArrowUp' : 'ArrowDown'); await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(two.id)}`, { what: 'and back' });
  out.arrows = { cards: order.length, beside };
  // the plain chat: no PR → a note
  await ctx.openChat(plain.id); await ctx.key('KeyG'); out.noPrNote = await txt('.note');
  ctx.assert.match(out.noPrNote, /No PR/);
  // the cog lists the keys
  out.cog = await ctx.evaluate(`[...document.querySelectorAll('#settings .keys kbd')].map(k => k.textContent)`);
  ctx.assert.deepEqual(out.cog.slice(0, 7), ['⌥⌘T', '⌥⌘E', '⌥⌘V', '⌥⌘G', '⌥⌘C', '⌥⌘O', '⌥⌘↑↓']);
  await ctx.shot('cog');
  return out;
}
