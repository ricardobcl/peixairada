// The board without its projects column (2026-09-24, Ricardo: "remove the entire 1st column and make the project cue
// on the 2nd column open the project select (P hotkey). leave the app icon at the top"). What this checks: there is
// no column; the fish heads the chat list; the list's head names the project and is the way to another — a click is
// ⌥⌘P's picker, × goes back to ALL, which has none —, open list or rail; the two things only the column's rows did
// are in the picker (✎ on a named project, ＋ new project last); and the cog still owns the window's bottom left
// pixel, from the list's foot, with the popover opening beside its cell.
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length > 0`, { what: 'the board' });
  const head = () => ctx.evaluate(`JSON.stringify({ text: document.querySelector('#stitle').textContent, x: !!document.querySelector('#stitle .sx'), project: window.peix.prefs().project })`).then(JSON.parse);
  const pickOpen = () => ctx.evaluate(`document.querySelector('#pick').open`);
  const closePick = () => ctx.evaluate(`document.querySelector('#pick').close()`);

  // One column: the fish first in the list's head
  out.layout = await ctx.evaluate(`JSON.stringify({ projects: !!document.querySelector('#projects, #plist'), first: document.querySelector('#shd').firstElementChild.id,
    fishX: Math.round(document.querySelector('#brandBtn').getBoundingClientRect().left) })`).then(JSON.parse);
  ctx.assert.deepEqual(out.layout, { projects: false, first: 'brandBtn', fishX: out.layout.fishX }, 'no projects column, and the fish heads the chat list');
  ctx.assert.ok(out.layout.fishX < 24, 'at the window\'s left');
  out.all = await head();
  ctx.assert.match(out.all.text, /^ALL▾\d+$/, 'ALL, its caret and its count');
  ctx.assert.equal(out.all.x, false, 'ALL has nothing to clear');
  await ctx.shot('1-all', { x: 0, y: 0, width: 520, height: 140 });

  // The head is the picker
  await ctx.evaluate(`document.querySelector('#stitle .t').click()`);
  ctx.assert.equal(await pickOpen(), true, 'a click on the project opens the picker');
  out.picker = await ctx.evaluate(`JSON.stringify({ hint: document.querySelector('#pickq').placeholder, rows: [...document.querySelectorAll('#picklist .pkrow .n')].map(n => n.firstChild.textContent) })`).then(JSON.parse);
  ctx.assert.match(out.picker.hint, /^Project/, '…the project picker, ⌥⌘P\'s');
  ctx.assert.equal(out.picker.rows[0], 'ALL');
  ctx.assert.equal(out.picker.rows.at(-1), '＋ new project', '＋ new project closes the list');
  const folder = out.picker.rows[1];
  await ctx.evaluate(`(() => { const q = document.querySelector('#pickq'); q.value = ${JSON.stringify(folder)}; q.dispatchEvent(new Event('input')); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  out.proj = await head();
  ctx.assert.equal(await pickOpen(), false, 'the choice closes it');
  ctx.assert.ok(out.proj.text.startsWith(folder + '▾'), 'the head names the project chosen');
  ctx.assert.equal(out.proj.x, true, '…with × beside it');
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

  // The rail keeps the fish and the square, and the square is the picker too
  await ctx.cmd('KeyB');
  out.rail = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#stitle > *')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.className))`).then(JSON.parse);
  ctx.assert.deepEqual(out.rail, ['sq'], 'on the rail the head is the square alone');
  await ctx.evaluate(`document.querySelector('#stitle .sq').click()`);
  ctx.assert.equal(await pickOpen(), true, 'and it opens the picker');
  await closePick();
  await ctx.shot('3-rail', { x: 0, y: 0, width: 300, height: 1000 });

  // The cog owns the corner, rail or not, and its popover opens beside the cell
  for (const where of ['rail', 'list']) {
    const corner = await ctx.evaluate(`!!document.elementFromPoint(0, innerHeight - 1)?.closest('#pfoot')`);
    ctx.assert.equal(corner, true, `the bottom left pixel is the cog's (${where})`);
    await ctx.evaluate(`document.querySelector('#cogBtn').click()`);
    const gap = await ctx.evaluate(`Math.round(document.querySelector('#settings').getBoundingClientRect().left - document.querySelector('#pfoot').getBoundingClientRect().right)`);
    ctx.assert.equal(gap, 8, `the popover opens beside the cog's cell (${where})`);
    if (where === 'list') await ctx.shot('4-cog', { x: 0, y: 0, width: 620, height: 1000 });
    await ctx.evaluate(`document.querySelector('#cogBtn').click()`);
    if (where === 'rail') await ctx.cmd('KeyB');
  }
  return out;
}
