// The board without its projects column (2026-09-24). What this checks: there is no column; the list's foot names the
// project — on a row of its own since 2026-10-08, and the chat header's folder name toggles it — and is the way to
// another — a click is ⌥⌘P's picker, × goes back to ALL, which shows nothing at all and no colour square since
// 2026-09-27 —; the two things only the column's rows did are in the picker (✎ on a named project,
// ＋ new project last); the settings are the header's ··· and ⌘,; and the fish — the status bar's since 2026-10-09 (it
// headed the list's foot row until then) — is the About box (2026-09-27).
import { readFileSync } from 'node:fs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length > 0`, { what: 'the board' });
  const head = () => ctx.evaluate(`JSON.stringify({ text: document.querySelector('#stitle').textContent, hidden: document.querySelector('#stitle').hidden, sq: !!document.querySelector('#stitle .sq'), x: !!document.querySelector('#stitle .sx'), project: window.peix.prefs().project })`).then(JSON.parse);
  const pickOpen = () => ctx.evaluate(`document.querySelector('#pick').open`);
  const closePick = () => ctx.evaluate(`document.querySelector('#pick').close()`);

  // One column, and none of the list's old controls in it: no ＋ (⌥⌘N, 2026-09-28), no « (⌥⌘B), no state chips (the
  // lanes fold instead, 2026-10-11, later) — the search and the filter are the status bar's (status-bar.mjs)
  out.layout = await ctx.evaluate(`JSON.stringify({ projects: !!document.querySelector('#projects, #plist'), plus: !!document.querySelector('#newChatBtn'), fold: !!document.querySelector('#sessPinBtn'),
    chips: document.querySelectorAll('.fchip').length, search: document.querySelector('#qBtn').closest('#sbar, #sessions')?.id })`).then(JSON.parse);
  ctx.assert.deepEqual(out.layout, { projects: false, plus: false, fold: false, chips: 0, search: 'sbar' }, 'no projects column, and the list\'s controls are the bar\'s');
  out.all = await head();
  ctx.assert.deepEqual([out.all.text, out.all.hidden], ['', true], 'ALL says nothing: no filter is the default (2026-09-27; the word alone before)');
  ctx.assert.equal(out.all.x, false, 'ALL has nothing to clear');
  await ctx.shot('1-all', { x: 0, y: 0, width: 520, height: 140 });

  // The head is the picker — on ALL there is nothing to click, so ⌥⌘P
  await ctx.key('KeyP');
  ctx.assert.equal(await pickOpen(), true, '⌥⌘P opens the picker');
  out.picker = await ctx.evaluate(`JSON.stringify({ hint: document.querySelector('#pickq').placeholder, rows: [...document.querySelectorAll('#picklist .pkrow .n')].map(n => n.firstChild.textContent) })`).then(JSON.parse);
  ctx.assert.match(out.picker.hint, /^Project/, '…the project picker, ⌥⌘P\'s');
  ctx.assert.equal(out.picker.rows[0], 'ALL');
  ctx.assert.equal(out.picker.rows.at(-1), '＋ new project', '＋ new project closes the list');
  const folder = out.picker.rows[1];
  await ctx.evaluate(`(() => { const q = document.querySelector('#pickq'); q.value = ${JSON.stringify(folder)}; q.dispatchEvent(new Event('input')); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  out.proj = await head();
  ctx.assert.equal(await pickOpen(), false, 'the choice closes it');
  ctx.assert.ok(out.proj.text.startsWith(folder) && !out.proj.hidden, 'the head names the project chosen');
  ctx.assert.equal(out.proj.x, true, '…with × beside it');
  ctx.assert.equal(out.proj.sq, false, '…and no colour square: the chat header\'s is the picker (2026-09-27)');
  // A row of its own at the list's foot (2026-10-08): the whole list's width, the name whole and × in sight — squeezed
  // into the controls' row before, a list at its usual width showed × alone
  out.projRow = await ctx.evaluate(`JSON.stringify((() => { const r = q => document.querySelector(q).getBoundingClientRect(), t = document.querySelector('#stitle .t'), row = r('#stitle'), s = document.querySelector('#sessions'), list = r('#sessions'), x = r('#stitle .sx');
    return { full: Math.round(list.width - 2 * s.clientLeft - row.width), foot: Math.round(list.bottom - s.clientTop - row.bottom), whole: t.scrollWidth <= t.clientWidth, x: x.width > 0 && x.right <= row.right }; })())`).then(JSON.parse);
  ctx.assert.deepEqual(out.projRow, { full: 0, foot: 0, whole: true, x: true }, `the project's row: full width, at the list's foot, the name whole, × in it: ${JSON.stringify(out.projRow)}`);
  await ctx.evaluate(`document.querySelector('#stitle .t').click()`);
  ctx.assert.equal(await pickOpen(), true, 'a click on the name opens the picker');
  await closePick();
  ctx.assert.notEqual(out.proj.project, 'all');
  await ctx.shot('2-project', { x: 0, y: 0, width: 520, height: 140 });
  await ctx.evaluate(`document.querySelector('#stitle .sx').click()`);
  ctx.assert.equal(await pickOpen(), false, '× opens nothing');
  ctx.assert.equal((await head()).project, 'all', '× is ALL again');

  // What only the column's rows did: ✎ on a named project, ＋ new project
  const cwd = (await ctx.peix('sessions()'))[0].cwd;
  await ctx.server.api('api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'cue set', cwds: [cwd] }) });
  await ctx.key('KeyP');
  await ctx.waitFor(`[...document.querySelectorAll('#picklist .pkrow')].some(r => r.textContent.includes('cue set'))`, { what: 'the named project in the picker' });
  out.pencils = await ctx.evaluate(`document.querySelectorAll('#picklist .pked').length`);
  ctx.assert.equal(out.pencils, 1, '✎ on the named project, and on nothing else');
  await ctx.evaluate(`document.querySelector('#picklist .pked').click()`);
  out.edit = await ctx.evaluate(`JSON.stringify({ pick: document.querySelector('#pick').open, editor: document.querySelector('#pdlg').open, name: document.querySelector('#pname').value })`).then(JSON.parse);
  ctx.assert.deepEqual(out.edit, { pick: false, editor: true, name: 'cue set' }, '✎ gives way to the project\'s editor');
  await ctx.evaluate(`document.querySelector('#pdlg').close()`);
  await ctx.key('KeyP');
  await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow')].at(-1).click()`);
  out.fresh = await ctx.evaluate(`JSON.stringify({ editor: document.querySelector('#pdlg').open, title: document.querySelector('#pdlgTitle').textContent, name: document.querySelector('#pname').value })`).then(JSON.parse);
  ctx.assert.deepEqual(out.fresh, { editor: true, title: 'New project', name: '' }, '＋ new project opens an empty editor');
  await ctx.evaluate(`document.querySelector('#pdlg').close()`);

  // The list hidden (⌥⌘B), a project picked shows it, narrowed (2026-10-25; the list folded to a rail kept the project's
  // short name as the picker's handle until then)
  await ctx.key('KeyB');
  await ctx.waitFor(`window.peix.prefs().listHidden`, { what: 'the list hidden' });
  await ctx.key('KeyP');
  await ctx.evaluate(`(() => { const q = document.querySelector('#pickq'); q.value = ${JSON.stringify(folder)}; q.dispatchEvent(new Event('input')); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  await ctx.waitFor(`!window.peix.prefs().listHidden && !document.querySelector('#stitle').hidden`, { what: 'the list shown for the project, its foot naming it' });

  // The settings (2026-09-28): no cog in the list — the chat header's ···, a chat or none, and ⌘,; a modal, centred
  ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#cogBtn, #pfoot')`), false, 'no cog in the list');
  await ctx.evaluate(`document.querySelector('#noChatMore').click()`);
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: "the settings from the empty header's ···" });
  await ctx.settle();
  const dlg = await ctx.evaluate(`JSON.stringify((d => { const r = d.getBoundingClientRect(); return { modal: d.matches(':modal'), centred: Math.abs(r.left + r.width / 2 - innerWidth / 2) < 2 && Math.abs(r.top + r.height / 2 - innerHeight / 2) < 2 }; })(document.querySelector('#settings')))`).then(JSON.parse);
  ctx.assert.deepEqual(dlg, { modal: true, centred: true }, 'a modal dialog, centred');
  await ctx.shot('4-settings', { x: 0, y: 0, width: 1400, height: 1000 });
  await ctx.evaluate(`document.querySelector('#settingsClose').click()`);
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#settings').open`), false, '× closes it');
  await ctx.openChat(ctx.fixture.chats[0].id);
  await ctx.evaluate(`document.querySelector('#moreBtn').click()`);
  await ctx.waitFor(`document.querySelector('#hmenu').open && !!document.querySelector('#hmenu #settingsBtn')`, { what: 'the chat header\'s ··· with its settings row' });
  await ctx.evaluate(`document.querySelector('#settingsBtn').click()`);
  ctx.assert.deepEqual(await ctx.evaluate(`[document.querySelector('#hmenu').open, document.querySelector('#settings').open]`), [false, true], 'the row closes the menu and opens the settings');
  await ctx.cmd('Comma');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#settings').open`), false, '⌘, toggles them');
  await ctx.evaluate(`document.querySelector('#stitle .sx').click()`);
  // The chat header's folder name is the filter's toggle (2026-10-08): a click shows that folder's chats, the next ALL
  // (a chat in a worktree of a repo is the repo's project, 2026-10-13: the suite run from one)
  const chatCwd = await ctx.evaluate(`window.peix.session(window.peix.state().current).cwd.replace(/\\/\\.claude\\/worktrees\\/[^/]+(?:\\/.*)?$/, '')`);
  await ctx.evaluate(`document.querySelector('#shead .repo').click()`);
  out.toggle = [await ctx.evaluate(`window.peix.prefs().project`), await ctx.evaluate(`document.querySelector('#shead .repo').classList.contains('on')`), await ctx.evaluate(`!document.querySelector('#stitle').hidden`)];
  ctx.assert.deepEqual(out.toggle, [chatCwd, true, true], 'the header\'s folder name filters the list to it, and says so');
  await ctx.evaluate(`document.querySelector('#shead .repo').click()`);
  ctx.assert.deepEqual([await ctx.evaluate(`window.peix.prefs().project`), await ctx.evaluate(`document.querySelector('#shead .repo').classList.contains('on')`)], ['all', false], '…and again lets go: ALL');

  // The fish, clicked, is the About box (2026-09-27): modal, centred, saying the package's version and what the
  // board touches; Esc closes it
  await ctx.evaluate(`document.querySelector('#sbar .conn').click()`);
  await ctx.settle();   // a dialog rises as it opens (2026-09-27, night): centred once it has
  out.about = await ctx.evaluate(`JSON.stringify((d => { const r = d.getBoundingClientRect(); return { open: d.open, modal: d.matches(':modal'),
    centred: Math.abs((r.left + r.width / 2) - innerWidth / 2) < 2 && Math.abs((r.top + r.height / 2) - innerHeight / 2) < 2, text: d.textContent.replace(/\\s+/g, ' ') }; })(document.querySelector('#about')))`).then(JSON.parse);
  const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
  ctx.assert.deepEqual([out.about.open, out.about.modal, out.about.centred], [true, true, true], `the About box is up, modal and centred`);
  ctx.assert.ok(out.about.text.includes(`version${version}`) && out.about.text.includes('writes nothing there'), `…saying the version and what the board touches: ${out.about.text}`);
  await ctx.shot('5-about', { x: 0, y: 0, width: 1000, height: 700 });
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await ctx.waitFor(`!document.querySelector('#about').open`, { what: 'Esc closing About' });
  return out;
}
