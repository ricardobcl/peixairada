// The changes tab (2026-10-10). A chat whose folder is a git repo with a branch, an edited file, another edited file
// and an untracked one; its last turn edited the first. What this checks: the header's +n −n says the uncommitted size
// and a click on it opens the tab (⌥⌘D the same), beside the chat, the column split; the turn's scope shows the one file
// it edited, uncommitted shows all three (the new one as added), the files list scrolls to a file; a note on a line goes
// into the chat's claude in its drawer as a prompt; Commit… types `git commit -v` into the chat's zsh, unrun; and the
// tab's ⌥⌘W closes it.
import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, toolLines } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

const repo = join(realpathSync(tmpDir('peix-chg-')), 'shop');
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

  // the header's +n −n, and a click on it opens the tab beside the chat
  await ctx.waitFor(`document.querySelector('#diffBtn')?.textContent === '+5−2'`, { what: 'the header’s +5 −2', timeout: 15000 });
  await ctx.evaluate(`document.querySelector('#diffBtn').click()`);
  await ctx.waitFor(`window.peix.state().tabs.includes('changes') && !document.querySelector('#chg').hidden && document.querySelectorAll('#chg .cf').length`, { what: 'the changes tab', timeout: 10000 });
  out.halves = (await ctx.peix('state()')).halves;
  ctx.assert.deepEqual(out.halves, ['chat', 'changes'], 'the chat on the left, its changes on the right');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#chg').closest('.gbody').id`), 'gbodyB');

  // this turn: the one file it edited
  const files = () => ctx.evaluate(`[...document.querySelectorAll('#chg .cf')].map(b => b.dataset.path)`);
  ctx.assert.deepEqual(await files(), ['src/cart.js'], 'the turn’s own edit');
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#chg .br').textContent`), /feat\/tax/);
  // uncommitted: all three, the untracked one as added
  await ctx.evaluate(`document.querySelector('#chg [data-scope="uncommitted"]').click()`);
  await ctx.waitFor(`document.querySelectorAll('#chg .cf').length === 3`, { what: 'every uncommitted file' });
  ctx.assert.deepEqual(await files(), ['README.md', 'src/cart.js', 'src/tax.js']);
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#chg .cf[data-path="src/tax.js"] b').textContent`), 'A');
  ctx.assert.ok(await ctx.evaluate(`[...document.querySelectorAll('#chg .cfile[data-path="src/cart.js"] .dl.add code')].some(c => c.textContent.includes('(1 + tax)'))`), 'the added line, highlighted');
  ctx.assert.equal((await ctx.peix('prefs()')).changesScope, 'uncommitted', 'the scope is remembered');
  await ctx.evaluate(`document.querySelector('#chg .cf[data-path="src/tax.js"]').click()`);
  await ctx.settle(); await ctx.shot('uncommitted');

  // a note on a line: typed into the chat's claude, here in its drawer
  await ctx.evaluate(`document.querySelector('#termBtn').click()`);
  await ctx.waitPrompt(30_000, 0);
  await ctx.evaluate(`document.querySelector('#chg .cfile[data-path="src/cart.js"] .dl.add .dlp').click()`);
  await ctx.waitFor(`document.querySelector('#chg .lnote textarea')`, { what: 'the note box' });
  await ctx.fill('#chg .lnote textarea', 'should tax be rounded?');
  await ctx.evaluate(`document.querySelector('#chg .lnote [data-note="send"]').click()`);
  await ctx.waitFor(`window.peix.screen(0).some(r => r.includes('src/cart.js:1 — should tax be rounded?'))`, { what: 'the note in the drawer', timeout: 10000 });

  // Commit…: typed into the zsh, not run
  await ctx.evaluate(`document.querySelector('#chg [data-act="commit"]').click()`);
  await ctx.waitFor(`window.peix.state().tabs.some(k => k.startsWith('shell:')) && window.peix.screen(1).some(r => r.includes('git commit -v'))`, { what: 'git commit -v typed in the zsh', timeout: 20000 });
  out.commitTyped = true;

  // ⌥⌘W on the changes tab closes it
  await ctx.evaluate(`document.querySelector('#ptabsB .ptab[data-tab="changes"]').click()`);
  await ctx.waitFor(`window.peix.state().tab === 'changes'`, { what: 'the changes tab in front' });
  await ctx.key('KeyW');
  await ctx.waitFor(`!window.peix.state().tabs.includes('changes') && document.querySelector('#chg').hidden`, { what: 'the tab closed' });
  return out;
}
