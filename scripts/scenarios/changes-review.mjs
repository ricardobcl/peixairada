// A review of the diff (2026-10-28). The changes tab's chat of changes-tab.mjs — a branch, two edited files and an
// untracked one. What this checks: a line's + opens a box, Add to review (and ⌘⏎) keeps the comment under its line, the
// file's count and the bar at the tab's foot; a re-read (↻) keeps them where they were; the turn's scope, which lacks a
// file, shows that one's comment at the top as not in this diff; Edit changes one in place; a reload of the page brings
// the review back (sessionStorage); a range, as GitHub's — a drag from a line's + over others, from the removed lines to
// an added one, and a ⇧-click with a box open — sits under its last line with every line of it marked, through a
// re-read; Submit types the whole review into the chat's claude as one prompt — its comments by file and line, each
// with its line or a range's lines as the diff marks them, then the review's own words — and the review is gone.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, toolLines } from '../fixture.mjs';
import { tmpDir, waitFor } from '../../lib/testserver.mjs';

const repo = join(realpathSync(tmpDir('peix-rev-')), 'shop');
mkdirSync(join(repo, 'src'), { recursive: true });
const g = (...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
g('init', '-q', '-b', 'main');
writeFileSync(join(repo, 'src', 'cart.js'), 'export const total = items =>\n  items.reduce((n, i) => n + i.price, 0);\n');
writeFileSync(join(repo, 'README.md'), '# shop\n');
g('add', '.'); g('commit', '-q', '-m', 'base'); g('checkout', '-q', '-b', 'feat/tax');
writeFileSync(join(repo, 'src', 'cart.js'), 'export const total = (items, tax = 0) =>\n  items.reduce((n, i) => n + i.price, 0) * (1 + tax);\n');
writeFileSync(join(repo, 'README.md'), '# shop\n\nNow with tax.\n');
writeFileSync(join(repo, 'src', 'tax.js'), 'export const VAT = 0.23;\n');

export const meta = { server: true, fake: true, fixture: 'auto' };

export default async function (ctx) {
  const now = Date.now(), out = {};
  const { chats } = makeFixture(ctx.fixture.dir, [{ cwd: repo, title: 'Add tax to the cart', prompt: 'add a tax to the cart total', reply: 'Done — total takes a tax rate.', at: new Date(now - 120_000),
    lines: id => toolLines({ id, cwd: repo, name: 'Edit', input: { file_path: join(repo, 'src', 'cart.js') }, result: 'The file has been updated.', at: new Date(now - 100_000) }) }]);
  const [chat] = chats;
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${chat.id}"]')`, { what: 'its card', timeout: 10000 });
  await ctx.openChat(chat.id);
  await ctx.evaluate(`document.querySelector('#termBtn').click()`);
  await ctx.waitPrompt(30_000, 0);
  await ctx.key('KeyD');
  await ctx.waitFor(`!document.querySelector('#chg').hidden && document.querySelectorAll('#chg .cf').length`, { what: 'the changes tab' });
  await ctx.evaluate(`document.querySelector('#chg [data-scope="uncommitted"]').click()`);
  await ctx.waitFor(`document.querySelectorAll('#chg .cf').length === 3`, { what: 'every uncommitted file' });

  const line = (path, text) => `[...document.querySelectorAll('#chg .cfile[data-path="${path}"] .dl')].find(l => l.querySelector('code').textContent.includes(${JSON.stringify(text)}))`;
  const comment = async (path, text, words, how) => {
    await ctx.evaluate(`${line(path, text)}.querySelector('.dlp').click()`);
    await ctx.waitFor(`document.activeElement === document.querySelector('#chg .lnote textarea')`, { what: 'the comment box, with the keys' });
    await ctx.fill('#chg .lnote textarea', words);
    if (how === 'key') await ctx.evaluate(`document.querySelector('#chg .lnote textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }))`);
    else await ctx.evaluate(`document.querySelector('#chg .lnote [data-note="add"]').click()`);
    await ctx.waitFor(`!document.querySelector('#chg .lnote')`, { what: 'the box closed' });
  };
  const placed = () => ctx.evaluate(`[...document.querySelectorAll('#chg .lcmt:not(.gone)')].map(c => ({ path: c.closest('.cfile')?.dataset.path, after: c.previousElementSibling.matches('.dl') ? c.previousElementSibling.querySelector('code').textContent : null, text: c.querySelector('.tx').textContent }))`);
  const bar = () => ctx.evaluate(`document.querySelector('#chg .crev .rh')?.textContent || null`);

  // two comments: one by its button, one by ⌘⏎ — each under its line, counted on its file and in the bar
  await comment('src/cart.js', '(1 + tax)', 'should tax be rounded?', 'button');
  await comment('README.md', 'Now with tax.', 'say which tax', 'key');
  out.placed = await placed();
  ctx.assert.deepEqual(out.placed, [
    { path: 'README.md', after: 'Now with tax.', text: 'say which tax' },
    { path: 'src/cart.js', after: '  items.reduce((n, i) => n + i.price, 0) * (1 + tax);', text: 'should tax be rounded?' },
  ]);
  ctx.assert.equal(await bar(), 'Review · 2 comments');
  ctx.assert.deepEqual(await ctx.evaluate(`[...document.querySelectorAll('#chg .cf .rc')].map(r => r.closest('.cf').dataset.path + ' ' + r.textContent)`), ['README.md 1', 'src/cart.js 1']);
  await ctx.settle(); await ctx.shot('two-comments');

  // read again: still under their lines
  await ctx.evaluate(`document.querySelector('#chg [data-act="reload"]').click()`);
  await ctx.sleep(600); await ctx.waitFor(`document.querySelectorAll('#chg .cf').length === 3 && document.querySelectorAll('#chg .lcmt').length === 2`, { what: 'the diff read again' });
  ctx.assert.deepEqual(await placed(), out.placed, 'a re-read keeps them where they were');

  // the turn's scope has cart.js alone: README's comment waits at the top, still in the review
  await ctx.evaluate(`document.querySelector('#chg [data-scope="turn"]').click()`);
  await ctx.waitFor(`document.querySelectorAll('#chg .cf').length === 1 && document.querySelector('#chg .cgone .lcmt')`, { what: 'the turn’s scope' });
  out.gone = await ctx.evaluate(`[...document.querySelectorAll('#chg .cgone .lcmt .tx')].map(t => t.textContent)`);
  ctx.assert.deepEqual(out.gone, ['say which tax']);
  ctx.assert.equal(await bar(), 'Review · 2 comments · 1 not in this diff');
  await ctx.settle(); await ctx.shot('not-in-this-diff');
  await ctx.evaluate(`document.querySelector('#chg [data-scope="uncommitted"]').click()`);
  await ctx.waitFor(`document.querySelectorAll('#chg .cf').length === 3 && !document.querySelector('#chg .cgone')`, { what: 'uncommitted again' });

  // Edit: the box in its place, Save keeps the change there
  await ctx.evaluate(`[...document.querySelectorAll('#chg .lcmt')].find(c => c.closest('.cfile').dataset.path === 'src/cart.js').querySelector('[data-cmt="edit"]').click()`);
  await ctx.waitFor(`document.querySelector('#chg .cfile[data-path="src/cart.js"] .lnote textarea')?.value === 'should tax be rounded?'`, { what: 'the comment in its box' });
  await ctx.fill('#chg .lnote textarea', 'round the total to cents');
  await ctx.settle(); await ctx.shot('editing');
  await ctx.evaluate(`document.querySelector('#chg .lnote [data-note="add"]').click()`);
  await ctx.waitFor(`[...document.querySelectorAll('#chg .lcmt .tx')].some(t => t.textContent === 'round the total to cents')`, { what: 'the edit saved' });
  ctx.assert.equal(await bar(), 'Review · 2 comments', 'an edit is no new comment');

  // a reload of the page: the tab and the review are back
  await ctx.fill('#chg .crev textarea', 'keep the tests green');
  await ctx.sleep(500);   // keepTabs is written 400 ms after a change
  await ctx.reload();
  await ctx.openChat(chat.id);
  await ctx.waitFor(`!document.querySelector('#chg').hidden && document.querySelectorAll('#chg .lcmt').length === 2`, { what: 'the review after a reload', timeout: 15000 });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#chg .crev textarea').value`), 'keep the tests green');

  // a range by a drag: from the + of cart.js's first removed line to its first added one — three lines, tinted as it goes
  const at = (path, side, n) => `#chg .cfile[data-path="${path}"] .dl.${side === 'a' ? 'del' : 'add'}[data-${side}="${n}"]`;
  const sel = () => ctx.evaluate(`[...document.querySelectorAll('#chg .dl.sel')].map(l => (l.dataset.a || '-') + '/' + (l.dataset.b || '-'))`);
  out.dragging = await ctx.drag(`${at('src/cart.js', 'a', 1)} .dlp`, at('src/cart.js', 'b', 1), sel);
  ctx.assert.deepEqual(out.dragging, ['1/-', '2/-', '-/1'], 'the lines picked as the drag goes');
  await ctx.waitFor(`document.activeElement === document.querySelector('#chg .lnote textarea')`, { what: 'the range’s box, with the keys' });
  out.dragBox = await ctx.evaluate(`(b => ({ who: b.querySelector('.who').textContent, after: b.previousElementSibling.querySelector('code').textContent, hint: b.querySelector('textarea').placeholder }))(document.querySelector('#chg .lnote'))`);
  ctx.assert.deepEqual(out.dragBox, { who: 'A comment on src/cart.js:−1 to +1', after: 'export const total = (items, tax = 0) =>', hint: 'What should Claude do about these lines?' });
  ctx.assert.deepEqual(await sel(), ['1/-', '2/-', '-/1'], 'the box’s lines lit while it is open');
  await ctx.settle(); await ctx.shot('range-box');
  await ctx.fill('#chg .lnote textarea', 'one signature, not two');
  await ctx.evaluate(`document.querySelector('#chg .lnote [data-note="add"]').click()`);
  await ctx.waitFor(`!document.querySelector('#chg .lnote')`, { what: 'the range saved' });

  // a range by ⇧-click: README's first line's box, stretched down to its third — Shift on another line's +
  await ctx.evaluate(`document.querySelector('#chg .cfile[data-path="README.md"] .dl.ctx[data-b="1"] .dlp').click()`);
  await ctx.waitFor(`document.querySelector('#chg .lnote')`, { what: 'README’s box' });
  await ctx.fill('#chg .lnote textarea', 'a section on the tax');
  await ctx.evaluate(`document.querySelector('${at('README.md', 'b', 3)} .dlp').dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`document.querySelector('#chg .lnote .who')?.textContent === 'A comment on README.md:1–3'`, { what: 'the box stretched' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#chg .lnote textarea').value`), 'a section on the tax', 'the words kept');
  ctx.assert.deepEqual(await sel(), ['1/1', '-/2', '-/3']);
  await ctx.evaluate(`document.querySelector('#chg .lnote textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }))`);
  await ctx.waitFor(`!document.querySelector('#chg .lnote')`, { what: 'the stretched one saved' });
  ctx.assert.equal(await bar(), 'Review · 4 comments');
  // every line of a range is marked, and a re-read finds them all again
  const marked = () => ctx.evaluate(`[...document.querySelectorAll('#chg .dl.cmted')].map(l => l.closest('.cfile').dataset.path + ' ' + (l.dataset.a || '-') + '/' + (l.dataset.b || '-'))`);
  out.marked = await marked();
  ctx.assert.deepEqual(out.marked, ['README.md 1/1', 'README.md -/2', 'README.md -/3', 'src/cart.js 1/-', 'src/cart.js 2/-', 'src/cart.js -/1', 'src/cart.js -/2']);
  // the pointer on a range's comment lights its lines, and off it lets them go
  const over = await ctx.evaluate(`(r => ({ x: Math.round(r.left + 60), y: Math.round(r.top + r.height / 2) }))([...document.querySelectorAll('#chg .lcmt')].find(c => c.querySelector('.tx').textContent === 'one signature, not two').getBoundingClientRect())`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: over.x, y: over.y });
  await ctx.waitFor(`document.querySelectorAll('#chg .dl.lit').length === 3 && document.querySelector('#chg .cfile[data-path="src/cart.js"] .dl.del[data-a="1"]').matches('.lit')`, { what: 'the range lit under the pointer' });
  await ctx.settle(); await ctx.shot('ranges');
  await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: over.x, y: 5 });
  await ctx.waitFor(`!document.querySelector('#chg .dl.lit')`, { what: 'the lines let go' });
  await ctx.evaluate(`document.querySelector('#chg [data-act="reload"]').click()`);
  await ctx.sleep(600); await ctx.waitFor(`document.querySelectorAll('#chg .lcmt').length === 4`, { what: 'the diff read again' });
  ctx.assert.deepEqual(await marked(), out.marked, 'a re-read keeps the ranges');

  // Submit: one prompt in the drawer, and the review is gone
  await ctx.waitPrompt(30_000, 0);
  await ctx.evaluate(`document.querySelector('#chg [data-rev="submit"]').click()`);
  await ctx.waitFor(`!document.querySelector('#chg .crev') && !document.querySelector('#chg .lcmt')`, { what: 'the review sent' });
  // the prompt as the fake claude wrote it to the transcript: the drawer's ESC CR are its newlines
  const typed = () => readFileSync(chat.file, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(l => l.type === 'user').map(l => [].concat(l.message.content).map(c => c.text ?? c).join('')).pop();
  await waitFor(() => typed()?.includes('Overall: keep the tests green'), { what: 'the review in the drawer', timeout: 10000 });
  out.prompt = typed();
  ctx.assert.equal(out.prompt, [
    'A review of the changes — 4 comments; address each:',
    '1. README.md:1–3\n   >  # shop\n   > +\n   > +Now with tax.\n   a section on the tax',
    '2. README.md:3\n   > Now with tax.\n   say which tax',
    '3. src/cart.js, old line 1 to new line 1\n   > -export const total = items =>\n   > -  items.reduce((n, i) => n + i.price, 0);\n   > +export const total = (items, tax = 0) =>\n   one signature, not two',
    '4. src/cart.js:2\n   > items.reduce((n, i) => n + i.price, 0) * (1 + tax);\n   round the total to cents',
    'Overall: keep the tests green'].join('\n\n'));
  await ctx.sleep(500);   // keepTabs again
  ctx.assert.equal(await ctx.evaluate(`JSON.parse(sessionStorage.getItem('peixairada-tabs') || '{}').reviews?.length ?? 0`), 0, 'nothing kept once sent');
  return { placed: out.placed, gone: out.gone, dragBox: out.dragBox, prompt: out.prompt };
}
