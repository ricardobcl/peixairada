// ⌥⌘N's first row is a chat in no folder (2026-10-14): ＋ new chat — no folder, which starts claude at once in the board's
// own folder (`about.scratch`, `<state dir>/no folder`, made by the server when a chat starts there) — no project, no
// chats step, no Taskfile asked. On ALL the selection starts on it; a project in view keeps the selection; a name typed
// hides it like any row it does not match. The chat is then a project named `no folder` like any other. Runs the fake claude.
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

export const meta = { server: true, fake: true, fixture: 'auto' };

const enter = ctx => ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
// Each row as it reads: the name without the path badge, the badge, its kind and whether it is the selection.
const rows = ctx => ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow')].map(r => { const n = r.querySelector('.n').cloneNode(true); const cur = n.querySelector('.cur'); const path = cur?.textContent || ''; cur?.remove(); return { name: n.textContent, path, none: r.classList.contains('nofolder'), x: !!r.querySelector('.pkx'), sel: r.classList.contains('sel') }; })`);

export default async function (ctx) {
  const out = {};
  const [a, b] = ctx.fixture.chats, known = [a.id, b.id];
  const scratch = join(realpathSync(ctx.server.dir), 'no folder');
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 2`, { what: 'the two fixture cards' });
  ctx.assert.equal(existsSync(scratch), false, 'nothing made before a chat asks for it');

  // ---- on ALL: the row heads the step, selected ----
  await ctx.key('KeyN');
  await ctx.waitFor(`document.querySelector('#pick').open && document.querySelector('#picklist .pkrow.nofolder')`, { what: '⌥⌘N with its first row' });
  out.rows = await rows(ctx);
  out.hint = await ctx.evaluate(`document.querySelector('#pickq').placeholder`);
  await ctx.settle(); await ctx.shot('1-first-row');
  ctx.assert.deepEqual(out.rows[0], { name: '＋ new chat — no folder', path: scratch.replace(/^\/Users\/[^/]+/, '~'), none: true, x: false, sel: true }, `the first row, selected, saying where, no ✕: ${JSON.stringify(out.rows[0])}`);
  ctx.assert.equal(out.rows.filter(r => r.none).length, 1, 'one such row');
  ctx.assert.match(out.hint, /, or no folder at all · /, 'the box says it takes none');

  // ---- a name typed hides it; emptied, it is back ----
  const project = a.cwd.replace(/\/\.claude\/worktrees\/[^/]+$/, '').split('/').pop();   // this checkout's — b's is the temp dir, T, which "new chat" holds
  await ctx.fill('#pickq', project);
  out.typed = await rows(ctx);
  ctx.assert.ok(!out.typed.some(r => r.none), `a project's name typed: the row is gone — ${JSON.stringify(out.typed)}`);
  ctx.assert.equal(out.typed[0].name, project, 'and the project leads');
  ctx.assert.ok(out.typed[0].sel, 'selected');
  await ctx.fill('#pickq', 'no folder');
  out.found = await rows(ctx);
  ctx.assert.ok(out.found[0].none && out.found[0].sel, 'found by its own words');
  await ctx.fill('#pickq', '');
  ctx.assert.ok((await rows(ctx))[0].none, 'the box emptied: first again');
  await ctx.evaluate(`document.querySelector('#pick').close()`);

  // ---- a project in view keeps the selection, the row still first ----
  await ctx.evaluate(`(() => { const p = JSON.parse(localStorage.getItem('peixairada-prefs') || '{}'); p.project = ${JSON.stringify(b.cwd)}; localStorage.setItem('peixairada-prefs', JSON.stringify(p)); })()`);
  await ctx.reload();
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 1`, { what: "b's folder in view" });
  await ctx.key('KeyN');
  await ctx.waitFor(`document.querySelector('#pick').open && document.querySelector('#picklist .pkrow.sel .cur')?.textContent === 'current'`, { what: 'the step on the project in view' });
  out.inView = await rows(ctx);
  ctx.assert.ok(out.inView[0].none && !out.inView[0].sel, 'the row first, the project in view selected');

  // ---- ⏎ on it: claude in the board's folder, made for it, the chat's card and header named `no folder` ----
  await ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))`);
  ctx.assert.ok((await rows(ctx))[0].sel, '↑ onto it');
  await enter(ctx);
  await ctx.waitFor(`(s => s.current && !${JSON.stringify(known)}.includes(s.current) && s.termSession === s.current)(window.peix.state())`, { what: 'the new chat in its drawer', timeout: 20_000 });
  const id = (await ctx.peix('state()')).current;
  await ctx.waitFor(`!!document.querySelector('#slist > .card[data-id=${JSON.stringify(id)}]')`, { what: 'its card', timeout: 5000 });
  out.picker = await ctx.evaluate(`document.querySelector('#pick').open`);
  out.session = await ctx.peix(`session(${JSON.stringify(id)})`).then(s => ({ cwd: s.cwd, project: s.project, alive: s.alive }));
  out.made = existsSync(scratch);
  out.head = await ctx.evaluate(`document.querySelector('#shead .repo')?.textContent`);
  out.card = await ctx.evaluate(`(c => ({ project: c.querySelector('.top .repo')?.textContent ?? null, title: c.querySelector('.title').textContent, active: c.classList.contains('active') }))(document.querySelector('#slist > .card[data-id=${JSON.stringify(id)}]'))`);
  await ctx.waitPrompt();
  await ctx.settle(); await ctx.shot('2-the-chat');
  ctx.assert.equal(out.picker, false, 'the picker closed: no chats step');
  ctx.assert.deepEqual(out.session, { cwd: scratch, project: 'no folder', alive: true }, 'claude runs in the board\'s own folder');
  ctx.assert.ok(out.made, 'the folder made for it');
  ctx.assert.equal(out.head, 'no folder', 'the header says where');
  ctx.assert.deepEqual(out.card, { project: 'no folder', title: '(no messages yet)', active: true }, 'its card in the list shown, the open one, named for its folder');
  return out;
}
