// The board without its projects column (2026-09-24, Ricardo: "remove the entire 1st column and make the project cue
// on the 2nd column open the project select (P hotkey). leave the app icon at the top"). What this checks: there is
// no column; the fish heads the chat list (and, clicked, is the About box, 2026-09-27); the list's head names the
// project and is the way to another — a click is ⌥⌘P's picker, × goes back to ALL, which shows nothing at all and
// no colour square since 2026-09-27 —, open list or rail; the two things only the column's rows did
// are in the picker (✎ on a named project, ＋ new project last); and the cog still owns the window's bottom left
// pixel, from the list's foot, with the popover opening beside its cell.
import { readFileSync } from 'node:fs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length > 0`, { what: 'the board' });
  const head = () => ctx.evaluate(`JSON.stringify({ text: document.querySelector('#stitle').textContent, hidden: document.querySelector('#stitle').hidden, sq: !!document.querySelector('#stitle .sq'), x: !!document.querySelector('#stitle .sx'), project: window.peix.prefs().project })`).then(JSON.parse);
  const pickOpen = () => ctx.evaluate(`document.querySelector('#pick').open`);
  const closePick = () => ctx.evaluate(`document.querySelector('#pick').close()`);

  // One column: the fish first in the list's head
  out.layout = await ctx.evaluate(`JSON.stringify({ projects: !!document.querySelector('#projects, #plist'), first: document.querySelector('#shd').firstElementChild.id,
    fishX: Math.round(document.querySelector('#brandBtn').getBoundingClientRect().left) })`).then(JSON.parse);
  ctx.assert.deepEqual(out.layout, { projects: false, first: 'brandBtn', fishX: out.layout.fishX }, 'no projects column, and the fish heads the chat list');
  ctx.assert.ok(out.layout.fishX < 24, 'at the window\'s left');
  out.all = await head();
  ctx.assert.deepEqual([out.all.text, out.all.hidden], ['', true], 'ALL says nothing: no filter is the default (2026-09-27; the word alone before)');
  ctx.assert.equal(out.all.x, false, 'ALL has nothing to clear');
  await ctx.shot('1-all', { x: 0, y: 0, width: 520, height: 140 });

  // One row atop the list (2026-09-24): the filters and ＋ are in the head, the cards start right under it, ＋ is an
  // icon alone, and on ALL it is ⌥⌘N's flow; since 2026-09-28 the foot — the cog, the usage — ends that row, and « went
  out.row = await ctx.evaluate(`JSON.stringify((() => { const h = document.querySelector('#shd'), r = h.getBoundingClientRect(), f = document.querySelector('#sfoot').getBoundingClientRect();
    return { inHead: ['#qBtn', '#fchips'].every(q => h.contains(document.querySelector(q))), fold: !!document.querySelector('#sessPinBtn'), plus: !!document.querySelector('#newChatBtn'), h: Math.round(r.height),
      foot: [Math.round(f.top), Math.round(f.height), Math.round(f.left - r.right)], head: [Math.round(r.top), Math.round(r.height)],
      under: Math.round(document.querySelector('#slist').getBoundingClientRect().top - r.bottom),
      chips: [...document.querySelectorAll('#fchips .fchip')].map(c => c.className.replace(/\s+/g, ' ').trim()) }; })())`).then(JSON.parse);
  ctx.assert.equal(out.row.inHead, true, 'the magnifier and the chips are in the head');
  ctx.assert.equal(out.row.plus, false, 'no ＋ — ⌥⌘N (2026-09-28)');
  ctx.assert.equal(out.row.fold, false, 'no « — ⌘B folds the list');
  ctx.assert.deepEqual([out.row.foot[0], out.row.foot[1], out.row.foot[2]], [out.row.head[0], out.row.head[1], 0], 'the foot is the head row\'s right end, as tall');
  ctx.assert.ok(out.row.h <= 44 && out.row.under === 0, 'one row, and the cards right under it');
  ctx.assert.deepEqual(out.row.chips, ['fchip ready on', 'fchip working on', 'fchip done on'], 'the three state chips, on');
  // The magnifier is small (2026-09-28; a field from the fish to the first chip from 2026-09-27): open, its icon is the
  // box's left cap and the box takes the room the row has spare — the rings', too, while it is open
  const field = () => ctx.evaluate(`JSON.stringify((() => { const x = q => { const r = document.querySelector(q).getBoundingClientRect(); return r.width ? [Math.round(r.left), Math.round(r.right)] : null; };
    return { fish: x('#brandBtn'), btn: x('#qBtn'), box: x('#q'), chip: x('#fchips .fchip') }; })())`).then(JSON.parse);
  out.field = { rest: await field() };
  const { rest } = out.field;
  ctx.assert.ok(rest.btn[0] - rest.fish[1] <= 6 && rest.chip[0] - rest.btn[1] <= 4 && rest.btn[1] - rest.btn[0] < 30, `at rest the magnifier is an icon beside the fish: ${JSON.stringify(rest)}`);
  await ctx.evaluate(`document.querySelector('#qBtn').click()`);
  out.field.open = await field();
  const { open } = out.field;
  ctx.assert.ok(open.box && open.box[0] <= open.btn[1] && open.chip[0] - open.box[1] <= 4 && open.btn[0] === rest.btn[0] && open.box[1] - open.btn[0] > 80, `open, the icon and the box are one field before the chips: ${JSON.stringify(open)}`);
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#usage')).display`), 'none', 'the rings make room while it is open');
  await ctx.shot('1b-search', { x: 0, y: 0, width: 520, height: 140 });
  await ctx.evaluate(`document.querySelector('#q').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  ctx.assert.deepEqual(await field(), rest, 'Esc puts the field back as it was');

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

  // The rail keeps the fish and, for a project, its short name — the picker's handle there (the square, until 2026-09-27)
  await ctx.key('KeyP');
  await ctx.evaluate(`(() => { const q = document.querySelector('#pickq'); q.value = ${JSON.stringify(folder)}; q.dispatchEvent(new Event('input')); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  await ctx.cmd('KeyB');
  out.rail = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#stitle > *')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.className + ':' + e.textContent))`).then(JSON.parse);
  ctx.assert.ok(out.rail.length === 1 && /^ab:\S{1,3}$/.test(out.rail[0]), `on the rail the head is the project's short name alone: ${JSON.stringify(out.rail)}`);
  await ctx.evaluate(`document.querySelector('#stitle .ab').click()`);
  ctx.assert.equal(await pickOpen(), true, 'and it opens the picker');
  await closePick();
  await ctx.shot('3-rail', { x: 0, y: 0, width: 300, height: 1000 });

  await ctx.cmd('KeyB');
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

  // The fish, clicked, is the About box (2026-09-27): modal, centred, saying the package's version and what the
  // board touches; Esc closes it
  await ctx.evaluate(`document.querySelector('#brandBtn').click()`);
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
