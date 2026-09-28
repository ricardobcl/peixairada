// The ⌥⌘ family on a fixture: G opens the picker on a two-PR chat, ⏎ opens the first, G again is the picker again
// with that one marked, a click on the other opens it; T, E and C hit their routes (stubbed), V none; P is the project
// picker; K the chat picker (fuzzy search, best match first, ⏎ opens across projects) — F, the list's own box, is
// chat-filter.mjs; N a chat (project → its open chats and ＋ a new one
// → environment, stubbed); O the project the cog names for it (2026-09-28; oracle, written in, before), straight to the
// environments (a pinned folder called oracle stands in for the real one — with no chats of its own the chats step
// skips itself); ↓ ↑ walk the list; ← → the tab beside (a real zsh); { } folds per chat; Esc closes a picker and is
// taken; the cog lists every key; no chat → a note, no project for ⌥⌘O → a note, one that is not on the board → a note.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ⌥⌘N's project step also lists the folders under the org's directory — an empty one of the test server's own,
// so this stays about the board's projects and off whatever ~/acme holds (lib/testserver.mjs sets ORG_DIR).
export const meta = { server: true, fixture: 'auto' };
export default async function (ctx) {
  const [two, plain] = ctx.fixture.chats;
  const out = {};
  const txt = sel => ctx.evaluate(`(document.querySelector(${JSON.stringify(sel)})?.textContent || '').trim().replace(/\\s+/g, ' ')`);
  const bar = () => ctx.peix('state().pr');   // the PR in front of you — the strip that said it went on 2026-09-24
  // no chat open: notes
  await ctx.key('KeyG'); out.noChatNote = await txt('.note');
  await ctx.evaluate(`document.querySelectorAll('.note').forEach(n => n.remove())`);
  // ⌥⌘O with no project named for it says where to name one; named, but not on this board yet (it is pinned into place
  // further down), it says that
  await ctx.key('KeyO'); out.noQuickNote = await txt('.note');
  ctx.assert.match(out.noQuickNote, /No project for ⌥⌘O yet — the settings \(⌘,\)/);
  await ctx.evaluate(`document.querySelectorAll('.note').forEach(n => n.remove())`);
  await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quick: 'oracle' }) });
  await ctx.waitFor(`document.querySelector('#quickKey').textContent.startsWith('oracle — ')`, { what: 'the setup reaching the page, the cog\'s key line with it' });
  await ctx.key('KeyO'); out.noOracleNote = await txt('.note');
  ctx.assert.match(out.noOracleNote, /No oracle folder/);
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
  ctx.assert.equal(out.again.current, (await ctx.peix('state()')).pr, 'the one showing is marked current');
  await ctx.evaluate(`document.querySelector('#picklist .pkrow.pr:not(:has(.cur))').click()`);
  await ctx.sleep(300); out.second = await bar();
  ctx.assert.notEqual(out.second, out.first, 'the other row opened the other PR');
  out.peixState = await ctx.peix('state()');
  ctx.assert.match(String(out.peixState.pr), /\/pull\/\d+$/, 'the board holds the current PR (pane pages exist only in the app)');
  // ← and →: the tab beside, wrapping. The chat alone is a note; ⌥⌘T's zsh is this chat's second tab, so it splits the
  // column and opens in the right half (2026-09-22) — the two strips are one row (2026-09-25), so → wraps to the chat
  // in the left half and ← comes back across; × on the zsh tab ends it, and the split the board made itself goes too
  await ctx.key('ArrowRight'); out.tabNote = await txt('.note'); ctx.assert.match(out.tabNote, /Only the chat/);
  await ctx.evaluate(`document.querySelectorAll('.note').forEach(n => n.remove())`);
  await ctx.key('KeyT'); await ctx.waitFor(`window.peix.state().halves[1] === 'shell'`, { what: 'the zsh tab, in the right half' });
  // the tab the keys are on — in the right half, since the second tab split the column; alone there, it has no strip
  const onTab = () => ctx.peix('state().tab');
  out.split = { on: await ctx.peix('state().split'), focusG: await ctx.peix('state().focusG'), halves: await ctx.peix('state().halves') };
  ctx.assert.deepEqual(out.split, { on: true, focusG: 1, halves: ['chat', 'shell'] }, 'a second tab splits the column and opens in the right half');
  ctx.assert.equal(await onTab(), 'shell');
  await ctx.key('ArrowRight'); await ctx.waitFor(`window.peix.state().focusG === 0 && window.peix.state().tab === 'chat'`, { what: '→ wraps to the chat, in the left half' });
  await ctx.key('ArrowLeft'); await ctx.waitFor(`window.peix.state().focusG === 1 && window.peix.state().tab === 'shell'`, { what: '← back across to the zsh' });
  ctx.assert.deepEqual(await ctx.peix('state().halves'), ['chat', 'shell'], 'walking the tabs moved none of them');
  out.tabs = { after: await onTab() };
  // ⌥⌘W ends the zsh the keys are in — the × its strip would have had — the keys go back to the chat, and the split
  // the board made itself goes when the tab does
  await ctx.key('KeyW');
  ctx.assert.equal(await ctx.peix('state().focusG'), 0, 'the keys went back to the chat at once');
  await ctx.waitFor(`document.querySelector('#ptabs').hidden && !window.peix.state().split`, { what: 'the zsh ended by ⌥⌘W — and the split with it' });
  // the { } button: folds by the cog's default, its own word per chat
  out.fold = { before: await ctx.evaluate(`document.querySelector('#foldBtn').classList.contains('on')`) };
  await ctx.evaluate(`document.querySelector('#foldBtn').click()`);
  out.fold.after = await ctx.evaluate(`document.querySelector('#foldBtn').classList.contains('on')`);
  out.fold.pref = (await ctx.peix('prefs()')).foldBy[two.id];
  ctx.assert.deepEqual(out.fold, { before: true, after: false, pref: false }, 'the fold button flips this chat only');
  await ctx.evaluate(`document.querySelector('#foldBtn').click()`);
  // the header's colour square (2026-09-22): out of sight until the pointer is in the header, and a click moves the
  // page's one <input type=color> under it, pointed at this chat's folder — the panel itself is the browser's, so
  // this stops where the wiring does
  const sq = `document.querySelector('#shead h2 .sq.pick')`;
  out.sq = { cwd: await ctx.evaluate(`${sq}.dataset.cwd`), opacity: await ctx.evaluate(`getComputedStyle(${sq}).opacity`) };
  ctx.assert.equal(out.sq.cwd, (await ctx.peix('session()')).cwd, "the square is this chat's folder");
  ctx.assert.equal(out.sq.opacity, '0', 'and it is not inked until the header is hovered');
  const hr = await ctx.evaluate(`JSON.stringify((r => ({ x: r.x, y: r.y, h: r.height }))(document.querySelector('#shead').getBoundingClientRect()))`).then(JSON.parse);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(hr.x + 20), y: Math.round(hr.y + hr.h / 2) });
  await ctx.waitFor(`getComputedStyle(${sq}).opacity === '1'`, { what: 'the square shown with the pointer in the header' });
  await ctx.shot('header-swatch', { x: Math.round(hr.x), y: Math.round(hr.y), width: 420, height: Math.round(hr.h) });
  await ctx.evaluate(`${sq}.click()`);
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#colorInput').dataset.cwd`), out.sq.cwd, 'a click points the colour input at that folder');
  // T, E and C, routes stubbed so nothing spawns or opens; V is no key any more (the focus button only)
  await ctx.evaluate(`window.__hits = []; const real = window.fetch; window.fetch = (u, o) => { const s = String(u); if (/\\/(terminal|vscode-web|focus|shell)$/.test(s)) { window.__hits.push([s, o?.method]); return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'stubbed' }) }); } return real(u, o); }`);
  for (const k of ['KeyT', 'KeyE', 'KeyV', 'KeyC']) { await ctx.key(k); await ctx.sleep(200); }
  out.hits = await ctx.evaluate(`JSON.stringify(window.__hits)`).then(JSON.parse);
  for (const route of ['/shell', '/vscode-web', '/terminal']) ctx.assert.ok(out.hits.some(h => h[0].endsWith(route)), `${route} was hit (T zsh, E web editor, C claude)`);
  ctx.assert.ok(!out.hits.some(h => h[0].endsWith('/focus')), '⌥⌘V does nothing');
  // ⌃⌘ is not the chord
  await ctx.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true }))`);
  out.wrongChord = await ctx.evaluate(`document.querySelector('#pick').open`); ctx.assert.equal(out.wrongChord, false, '⌃⌘P does not open the picker');
  // P, the project picker
  await ctx.evaluate(`document.querySelector('#pick').close()`);
  await ctx.key('KeyP');
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
  // …and fuzzily since 2026-09-21 ("keep K but make it fuzzy"): the letters in order, nowhere near each other, with
  // the best match leading — no chat here holds the string `pln cht` anywhere. ⏎ below opens that top row.
  await ctx.evaluate(`(() => { const b = document.querySelector('#pickq'); b.value = 'pln cht'; b.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  out.chatFuzzy = {
    rows: await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow.chat .n')].map(e => { const n = e.cloneNode(true); n.querySelector('.cur')?.remove(); return n.textContent; })`),
    marks: await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow.chat:first-child .n b')].map(e => e.textContent)`),
    literal: await ctx.evaluate(`window.peix.sessions().map(s => window.peix.session(s.id)).filter(s => JSON.stringify(s).toLowerCase().includes('pln cht')).length`),
  };
  ctx.assert.equal(out.chatFuzzy.literal, 0, 'no chat holds the query literally — only a fuzzy match finds one');
  ctx.assert.equal(out.chatFuzzy.rows[0], 'Plain chat', 'and the best match leads');
  ctx.assert.deepEqual(out.chatFuzzy.marks, ['Pl', 'n', 'ch', 't'], 'the bolding is the letters that matched, runs merged');
  await ctx.shot('chat-picker-fuzzy');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`window.peix.state().current === ${JSON.stringify(plain.id)}`, { what: 'the plain chat opened from the picker' });
  out.chatOpened = { current: (await ctx.peix('state()')).current, project: (await ctx.peix('prefs()')).project, inList: await ctx.evaluate(`!!document.querySelector('#slist .card[data-id=${JSON.stringify(plain.id)}]')`), picker: await ctx.evaluate(`document.querySelector('#pick').open`) };
  ctx.assert.ok(out.chatOpened.inList, 'the opened chat is in the list shown (ALL here; openSession switches project when it is not)'); ctx.assert.equal(out.chatOpened.picker, false);
  // N, a chat: the project step (the column's list without ALL), then that project's open chats with ＋ new chat at
  // their head, then — the launchers route stubbed to answer as oracle's Taskfile would — the environment step,
  // whose ⏎ posts `task <name>` to /api/terminals (stubbed: nothing spawns)
  await ctx.evaluate(`window.__posts = []; const real2 = window.fetch; window.fetch = (u, o) => { const s = String(u); if (s.startsWith('/api/launchers')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ launchers: [{ name: 'production-workload', desc: 'Launch Claude Code against the production workload cluster' }, { name: 'sandbox-workload', desc: 'Launch Claude Code against the sandbox workload cluster' }] }) }); if (s === '/api/terminals' && o?.method === 'POST') { window.__posts.push(JSON.parse(o.body)); return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'stubbed' }) }); } return real2(u, o); }`);
  await ctx.key('KeyN');
  out.newPicker = { placeholder: await ctx.evaluate(`document.querySelector('#pickq').placeholder`), names: await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow .n')].map(e => e.firstChild.textContent)`) };
  ctx.assert.match(out.newPicker.placeholder, /^New chat — a project, a folder in /); ctx.assert.ok(out.newPicker.names.length >= 2 && !out.newPicker.names.includes('ALL'), 'the projects, without ALL');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);   // the first project: its open chats
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.includes('an open chat, or ＋ a new one')`, { what: "the project's chats step" });
  out.chatsStep = { head: await ctx.evaluate(`document.querySelector('#picklist .pkrow')?.className`), rows: await ctx.evaluate(`document.querySelectorAll('#picklist .pkrow').length`), sel: await ctx.evaluate(`document.querySelector('#picklist .pkrow.sel .n')?.textContent`) };
  ctx.assert.match(out.chatsStep.head, /\bnew\b/, '＋ new chat heads the list, and is what ⏎ takes');
  ctx.assert.equal(out.chatsStep.rows, 2, '＋ and the one chat that project has');
  ctx.assert.match(out.chatsStep.sel, /new chat/);
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);   // ＋ new chat: one folder → the environment step
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('New chat in ')`, { what: 'the environment step, naming the folder' });
  out.envStep = { open: await ctx.evaluate(`document.querySelector('#pick').open`), names: await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow.env .n')].map(e => e.textContent)`) };
  ctx.assert.deepEqual(out.envStep, { open: true, names: ['production-workload', 'sandbox-workload'] });
  await ctx.shot('env-picker');
  for (const key of ['ArrowDown', 'Enter']) await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`window.__posts.length === 1`, { what: 'the new chat posted' });
  out.newPosted = (await ctx.evaluate(`JSON.stringify(window.__posts)`).then(JSON.parse))[0];
  ctx.assert.equal(out.newPosted.task, 'sandbox-workload', '⏎ on the second environment starts task sandbox-workload');
  ctx.assert.equal(out.newPosted.cwd.split('/').pop(), out.newPicker.names[0], 'in the project chosen first');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#pick').open`), false, 'the picker closed on the last step');
  // O, oracle: the project and the folder are answered, so the picker opens on the environments (the launchers route
  // above is still stubbed) and the environment's own chats follow — this oracle has none, so the step is ＋ new chat
  // alone (2026-09-22) and a second ⏎ starts it. A pin is how a folder reaches the board without a chat of its own.
  const oracleCwd = join(tmpdir(), 'peix-oracle-fixture', 'oracle');
  await ctx.server.api('api/pins', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pins: [oracleCwd] }) });
  await ctx.waitFor(`window.peix.state().pins.includes(${JSON.stringify(oracleCwd)})`, { what: 'the oracle folder pinned on the board' });
  await ctx.key('KeyO');
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('oracle — ')`, { what: 'the environment step, straight from ⌥⌘O' });
  out.oracleStep = { placeholder: await ctx.evaluate(`document.querySelector('#pickq').placeholder`), names: await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow.env .n')].map(e => e.textContent)`) };
  ctx.assert.match(out.oracleStep.placeholder, /^oracle — which environment/, 'the step says which folder, since ⌥⌘O never asked');
  ctx.assert.deepEqual(out.oracleStep.names, ['production-workload', 'sandbox-workload'], '⌥⌘O opens on oracle\'s environments');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.includes('task production-workload')`, { what: 'the chats step, with nothing in it' });
  out.oracleChats = await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow')].map(r => r.className)`);
  ctx.assert.equal(out.oracleChats.length, 1, 'an environment with no chats still offers ＋ new chat');
  ctx.assert.match(out.oracleChats[0], /\bnew\b/, '…and that row is the only one, selected for ⏎');
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`window.__posts.length === 2`, { what: 'the oracle chat posted' });
  out.oraclePosted = (await ctx.evaluate(`JSON.stringify(window.__posts)`).then(JSON.parse))[1];
  ctx.assert.deepEqual({ cwd: out.oraclePosted.cwd, task: out.oraclePosted.task }, { cwd: oracleCwd, task: 'production-workload' }, '⏎ on ＋ new chat starts task production-workload in oracle');
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
  await ctx.key('KeyP'); ctx.assert.equal(await ctx.evaluate(`document.querySelector('#pick').open`), true);
  out.escPicker = { taken: await escOn('#pickq'), open: await ctx.evaluate(`document.querySelector('#pick').open`) };
  ctx.assert.deepEqual(out.escPicker, { taken: true, open: false }, 'Esc closes the picker and is marked handled');
  await ctx.cmd('Comma'); ctx.assert.equal(await ctx.evaluate(`document.querySelector('#settings').open`), true, '⌘, opens the settings');
  out.escSettings = { taken: await escOn('body'), open: await ctx.evaluate(`document.querySelector('#settings').open`) };
  ctx.assert.deepEqual(out.escSettings, { taken: true, open: false }, 'Esc closes the settings and is marked handled');
  await ctx.cmd('Comma'); await ctx.cmd('Comma');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#settings').open`), false, '⌘, again closes them');
  out.escIdle = await escOn('body'); ctx.assert.equal(out.escIdle, false, 'with nothing to close, Esc is left alone');
  // the cog lists the keys
  out.cog = await ctx.evaluate(`[...document.querySelectorAll('#settings .keys kbd')].map(k => k.textContent)`);
  ctx.assert.deepEqual(out.cog.slice(0, 12), ['⌥⌘T', '⌥⌘E', '⌥⌘G', '⌥⌘C', '⌥⌘O', '⌥⌘P', '⌥⌘K', '⌥⌘F', '⌥⌘N', '⌥⌘↑↓', '⌥⌘←→', '⌥⌘W']);
  await ctx.shot('cog');
  return out;
}
