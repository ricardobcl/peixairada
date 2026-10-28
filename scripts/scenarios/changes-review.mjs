// A review of the diff (2026-10-28). The changes tab's chat of changes-tab.mjs — a branch, two edited files and an
// untracked one. What this checks: a line's + opens a box, Add to review (and ⌘⏎) keeps the comment under its line, the
// file's count and the bar at the tab's foot; a re-read (↻) keeps them where they were; the turn's scope, which lacks a
// file, shows that one's comment at the top as not in this diff; Edit changes one in place; a reload of the page brings
// the review back (sessionStorage); Submit types the whole review into the chat's claude as one prompt — its comments
// by file and line, each with its line, then the review's own words — and the review is gone.
import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, toolLines } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

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

  // Submit: one prompt in the drawer, and the review is gone
  await ctx.waitPrompt(30_000, 0);
  await ctx.evaluate(`document.querySelector('#chg [data-rev="submit"]').click()`);
  await ctx.waitFor(`!document.querySelector('#chg .crev') && !document.querySelector('#chg .lcmt')`, { what: 'the review sent' });
  // the screen as one string without its spaces: a long line wraps, and the fake indents a prompt's lines after its first
  const flat = `window.peix.screen(0).join('').replace(/\\s+/g, '')`;
  await ctx.waitFor(`${flat}.includes('Overall:keepthetestsgreen')`, { what: 'the review in the drawer', timeout: 10000 });
  const said = await ctx.evaluate(flat);
  for (const want of ['A review of the changes — 2 comments; address each:', '1. README.md:3', '> Now with tax.', 'say which tax', '2. src/cart.js:2', '> items.reduce((n, i) => n + i.price, 0) * (1 + tax);', 'round the total to cents', 'Overall: keep the tests green'])
    ctx.assert.ok(said.includes(want.replace(/\s+/g, '')), `the prompt has ${want}`);
  await ctx.sleep(500);   // keepTabs again
  ctx.assert.equal(await ctx.evaluate(`JSON.parse(sessionStorage.getItem('peixairada-tabs') || '{}').reviews?.length ?? 0`), 0, 'nothing kept once sent');
  return { placed: out.placed, gone: out.gone };
}
