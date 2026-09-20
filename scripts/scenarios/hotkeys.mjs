// The ⌥⌘ family on a fixture: G opens the picker on a two-PR chat, ⏎ opens the first, G again is the picker again
// with that one marked, a click on the other opens it; T, E and C hit their routes (stubbed), V none; O is the project
// picker; K the chat picker (search, ⏎ opens across projects); ↓ ↑ walk the list; Esc closes a picker and is taken; the cog
// lists every key; no chat → a note.
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
  await ctx.key('KeyG');   // again, with one showing: the picker again, that one marked current
  out.again = { open: await ctx.evaluate(`document.querySelector('#pick').open`), current: await ctx.evaluate(`document.querySelector('#picklist .pkrow.pr .cur')?.closest('.pkrow')?.title || null`) };
  ctx.assert.equal(out.again.open, true, 'G with several PRs is always the picker');
  ctx.assert.equal(out.again.current, (await ctx.peix('state()')).prbar, 'the one showing is marked current');
  await ctx.evaluate(`document.querySelector('#picklist .pkrow.pr:not(:has(.cur))').click()`);
  await ctx.sleep(300); out.second = await bar();
  ctx.assert.notEqual(out.second, out.first, 'the other row opened the other PR');
  out.peixState = await ctx.peix('state()');
  ctx.assert.match(String(out.peixState.prbar), /\/pull\/\d+$/, 'the strip holds the current PR (pane pages exist only in the app)');
  // T, E and C, routes stubbed so nothing spawns or opens; V is no key any more (the focus button only)
  await ctx.evaluate(`window.__hits = []; const real = window.fetch; window.fetch = (u, o) => { const s = String(u); if (/\\/(terminal|vscode-web|focus|shell)$/.test(s)) { window.__hits.push([s, o?.method]); return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'stubbed' }) }); } return real(u, o); }`);
  for (const k of ['KeyT', 'KeyE', 'KeyV', 'KeyC']) { await ctx.key(k); await ctx.sleep(200); }
  out.hits = await ctx.evaluate(`JSON.stringify(window.__hits)`).then(JSON.parse);
  for (const route of ['/shell', '/vscode-web', '/terminal']) ctx.assert.ok(out.hits.some(h => h[0].endsWith(route)), `${route} was hit (T zsh, E web editor, C claude)`);
  ctx.assert.ok(!out.hits.some(h => h[0].endsWith('/focus')), '⌥⌘V does nothing');
  // ⌃⌘ is not the chord
  await ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyO', key: 'o', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true }))`);
  out.wrongChord = await ctx.evaluate(`document.querySelector('#pick').open`); ctx.assert.equal(out.wrongChord, false, '⌃⌘O does not open the picker');
  // O, the project picker
  await ctx.evaluate(`document.querySelector('#pick').close()`);
  await ctx.key('KeyO');
  out.projectPicker = { open: await ctx.evaluate(`document.querySelector('#pick').open`), rows: await ctx.evaluate(`document.querySelectorAll('#picklist .pkrow:not(.pr)').length`) };
  ctx.assert.ok(out.projectPicker.open && out.projectPicker.rows >= 2);
  await ctx.evaluate(`document.querySelector('#pick').close()`);
  // K, the chat picker: every ready or clauding chat across the projects (both fixture chats), the open one marked, the
  // box searches title, project and prompt; ⏎ opens the chat and switches to its project
  await ctx.openChat(two.id); await ctx.key('KeyK');
  out.chatPicker = { open: await ctx.evaluate(`document.querySelector('#pick').open`), rows: await ctx.evaluate(`document.querySelectorAll('#picklist .pkrow.chat').length`), placeholder: await ctx.evaluate(`document.querySelector('#pickq').placeholder`), current: await ctx.evaluate(`document.querySelector('#picklist .pkrow.chat:has(.cur) .n')?.textContent || null`), states: await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow.chat .st')].map(e => e.textContent)`) };
  ctx.assert.equal(out.chatPicker.open, true); ctx.assert.equal(out.chatPicker.rows, 2, 'both fixture chats are ready');
  ctx.assert.match(out.chatPicker.placeholder, /^Chat/); ctx.assert.match(out.chatPicker.current, /Two PRs/); ctx.assert.deepEqual(out.chatPicker.states, ['ready', 'ready']);
  await ctx.shot('chat-picker');
  await ctx.evaluate(`const q = document.querySelector('#pickq'); q.value = 'day is'; q.dispatchEvent(new Event('input', { bubbles: true }))`);   // the plain chat's prompt
  out.chatFilter = await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow.chat .n')].map(e => e.textContent)`);
  ctx.assert.deepEqual(out.chatFilter, ['Plain chat'], 'the box searches the prompt too');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(plain.id)}`, { what: 'the plain chat opened from the picker' });
  out.chatOpened = { current: (await ctx.peix('state()')).current, project: (await ctx.peix('prefs()')).project, inList: await ctx.evaluate(`!!document.querySelector('#slist .card[data-id=${JSON.stringify(plain.id)}]')`), picker: await ctx.evaluate(`document.querySelector('#pick').open`) };
  ctx.assert.ok(out.chatOpened.inList, 'the opened chat is in the list shown (ALL here; openSession switches project when it is not)'); ctx.assert.equal(out.chatOpened.picker, false);
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
  // Esc with the picker up closes it and is taken (defaultPrevented) — an Esc the page leaves alone climbs to the app's
  // window, which in full screen leaves full screen; the same for the settings popover; with nothing to close it is left
  // alone (the filter boxes, the rename box, full screen keep it)
  const escOn = sel => ctx.evaluate(`(() => { const e = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }); (document.querySelector(${JSON.stringify(sel)}) || document.body).dispatchEvent(e); return e.defaultPrevented; })()`);
  await ctx.key('KeyO'); ctx.assert.equal(await ctx.evaluate(`document.querySelector('#pick').open`), true);
  out.escPicker = { taken: await escOn('#pickq'), open: await ctx.evaluate(`document.querySelector('#pick').open`) };
  ctx.assert.deepEqual(out.escPicker, { taken: true, open: false }, 'Esc closes the picker and is marked handled');
  await ctx.evaluate(`document.querySelector('#cogBtn').click()`); ctx.assert.equal(await ctx.evaluate(`document.querySelector('#settings').hidden`), false);
  out.escSettings = { taken: await escOn('body'), hidden: await ctx.evaluate(`document.querySelector('#settings').hidden`) };
  ctx.assert.deepEqual(out.escSettings, { taken: true, hidden: true }, 'Esc closes the settings popover and is marked handled');
  out.escIdle = await escOn('body'); ctx.assert.equal(out.escIdle, false, 'with nothing to close, Esc is left alone');
  // the cog lists the keys
  out.cog = await ctx.evaluate(`[...document.querySelectorAll('#settings .keys kbd')].map(k => k.textContent)`);
  ctx.assert.deepEqual(out.cog.slice(0, 7), ['⌥⌘T', '⌥⌘E', '⌥⌘G', '⌥⌘C', '⌥⌘O', '⌥⌘K', '⌥⌘↑↓']);
  await ctx.shot('cog');
  return out;
}
