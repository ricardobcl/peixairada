// The editor at a PR's branch (2026-10-13), with the app's bridge faked (the pane's tabs) and VS Code Web's start
// answered by the page's own stub (nothing is started). A chat in a checkout of acme/widgets on main, an edit not
// committed, another chat live in the same folder; PR #14's branch checked out nowhere, #15's in a worktree inside the
// repo, a node project whose lockfile both trees share. What this checks: each PR row has Editor ▾; #15's menu opens its
// worktree, offers review only, links node_modules (nothing installed) and says why the folder is not switched; #14's
// "a worktree for it" makes .claude/worktrees/feat-tax-rounding, opens VS Code Web on it as the tab "widgets @
// feat/tax-rounding", and the row then says where it is — the folder's branch and tree untouched; with the other chat
// gone and the edit undone, "Switch this folder…" types `git switch feat/tax-rounding` into the chat's zsh, unrun. The
// external editor is a row beside the tree's own, and Vim picked opens the tree in vim on a tab (2026-10-21).
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from '../fixture.mjs';
import { tmpDir, waitFor } from '../../lib/testserver.mjs';

const root = realpathSync(tmpDir('peix-edbr-'));
const claudeDir = join(root, 'claude'), origin = join(root, 'origin.git'), seed = join(root, 'seed'), repo = join(root, 'work', 'widgets');
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe', env }).toString().trim();
const put = (dir, f, text) => { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), text); };

execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
execFileSync('git', ['init', '-q', '-b', 'main', seed]);
put(seed, 'package.json', '{ "name": "widgets" }\n'); put(seed, 'package-lock.json', '{ "lockfileVersion": 3 }\n'); put(seed, '.gitignore', 'node_modules/\n.claude/\n');
put(seed, 'src/cart.js', 'export const total = items => items.reduce((n, i) => n + i.price, 0);\n'); put(seed, 'README.md', '# widgets\n');
git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', 'base'); git(seed, 'push', '-q', origin, 'main');
const pr = (n, branch, files) => {
  git(seed, 'checkout', '-q', '-b', branch, 'main');
  for (const [f, t] of Object.entries(files)) put(seed, f, t);
  git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', branch);
  git(seed, 'push', '-q', origin, `${branch}:refs/pull/${n}/head`, `${branch}:refs/heads/${branch}`);
};
pr(14, 'feat/tax-rounding', { 'src/round.js': 'export const round2 = x => Math.round(x * 100) / 100;\n' });
pr(15, 'feat/rates', { 'src/rates.js': 'export const rates = r => fetch(`/api/rates/${r}`);\n' });
pr(16, 'fix/empty-cart', { 'src/cart.js': 'export const total = (items = []) => items.reduce((n, i) => n + i.price, 0);\n' });
execFileSync('git', ['clone', '-q', '--no-local', '--config', `url.${origin}.insteadOf=https://github.com/acme/widgets`, 'https://github.com/acme/widgets', repo], { stdio: 'pipe', env });
git(repo, 'worktree', 'add', '-q', join(repo, '.claude', 'worktrees', 'feat-rates'), 'feat/rates');
mkdirSync(join(repo, 'node_modules', 'left-pad'), { recursive: true });
put(repo, 'README.md', '# widgets\n\nnot committed\n');
const real = realpathSync(repo), wt = n => join(real, '.claude', 'worktrees', n);

const prsFile = join(root, 'prs.json'), refs = head => ({ headRefName: head, baseRefName: 'main', isCrossRepository: false, headRepository: { nameWithOwner: 'acme/widgets' } });
writeFileSync(prsFile, JSON.stringify({
  'acme/widgets#14': { state: 'OPEN', title: 'Round tax to the cent', createdAt: '2026-10-09T09:00:00Z', ...refs('feat/tax-rounding') },
  'acme/widgets#15': { state: 'OPEN', title: 'Rates from the API', createdAt: '2026-10-10T09:00:00Z', ...refs('feat/rates') },
  'acme/widgets#16': { state: 'OPEN', title: 'An empty cart', createdAt: '2026-10-11T09:00:00Z', ...refs('fix/empty-cart') },
}));
const { chats: [chat, other] } = makeFixture(claudeDir, [
  { cwd: repo, at: new Date(Date.now() - 300_000), title: 'Tax and rates', prompt: 'Look at https://github.com/acme/widgets/pull/14, https://github.com/acme/widgets/pull/15 and https://github.com/acme/widgets/pull/16', reply: 'All three read.' },
  { cwd: repo, at: new Date(Date.now() - 3 * 86_400_000), title: 'Checkout spacing', prompt: 'the button is cramped', reply: 'Padded.', live: { pid: process.pid } },
]);
const folder = () => ({ head: git(repo, 'rev-parse', 'HEAD'), branch: git(repo, 'branch', '--show-current') });
const before = folder();

export const meta = {
  server: true, fixture: claudeDir,
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: prsFile, PR_TTL_MS: '300' },
  prefs: { prsOpen: true },
};

export default async function (ctx) {
  const out = {};
  // the bridge and VS Code Web's answer, before the page's script runs — inApp is read once, at load
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };
    { const of = window.fetch; window.fetch = (u, o) => String(u).endsWith('/api/vscode-web') ? Promise.resolve(new Response('{"url":"http://127.0.0.1:7332/","started":false}', { headers: { 'content-type': 'application/json' } })) : of(u, o); }` });
  await ctx.evaluate(`location.reload()`);
  await ctx.waitFor(`window.__posts && document.querySelector('#slist > .card[data-id="${chat.id}"]')`, { what: 'the board again, with the bridge', timeout: 15000 });
  await ctx.openChat(chat.id);
  const u = n => `https://github.com/acme/widgets/pull/${n}`, ed = n => `#prlist .pract[data-pract="editor"][data-url="${u(n)}"]`;
  await ctx.waitFor(`document.querySelector('${ed(14)}') && document.querySelector('${ed(15)}')`, { what: 'Editor ▾ on both rows', timeout: 20000 });
  const menu = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#ctxm button')].map(b => [b.querySelector('.ct')?.textContent ?? b.textContent, b.querySelector('.csub')?.textContent || '', b.disabled]))`).then(JSON.parse);
  const openMenu = async n => { await ctx.evaluate(`document.querySelector('${ed(n)}').click()`); await ctx.waitFor(`document.querySelector('#ctxm').open && document.querySelectorAll('#ctxm button').length`, { what: `#${n}'s editor menu` }); return menu(); };
  const pick = t => ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => (b.querySelector('.ct')?.textContent ?? b.textContent).startsWith(${JSON.stringify(t)})).click()`);

  // #15: its worktree, review only, node_modules linked, and why the folder is not switched
  out.menu15 = await openMenu(15);
  ctx.assert.deepEqual(out.menu15.map(r => r[0]), ['Open worktree feat-rates in VS Code Web', '…or in VS Code, its own window', 'Review only, detached', 'Link node_modules from widgets', 'Switch this folder to feat/rates…'], JSON.stringify(out.menu15));
  ctx.assert.equal(out.menu15[0][1], 'widgets/.claude/worktrees/feat-rates · on feat/rates');
  ctx.assert.deepEqual(out.menu15[4].slice(1), ['not offered: feat/rates is out in feat-rates — open that instead · another chat works here — Checkout spacing · 1 file is not committed', true], 'the switch, disabled, saying why');
  await ctx.settle(); await ctx.shot('1-editor-menu');
  await pick('Link node_modules');
  await ctx.waitFor(`!document.querySelector('#ctxm').open`, { what: 'the menu closed' });
  for (let i = 0; i < 50 && !existsSync(join(wt('feat-rates'), 'node_modules')); i++) await ctx.sleep(100);
  ctx.assert.ok(lstatSync(join(wt('feat-rates'), 'node_modules')).isSymbolicLink(), 'node_modules linked, nothing installed');

  // the in-app editor Vim (2026-10-21): #15's worktree opened in vim, on a tab of its own, run in it
  await ctx.evaluate(`document.querySelector('#inEdPick [data-ined="vim"]').click()`);
  await ctx.waitFor(`document.querySelector('${ed(15)}')`, { what: 'Editor ▾ again, its trees read anew' });
  out.menu15v = await openMenu(15);
  ctx.assert.deepEqual(out.menu15v.slice(0, 2).map(r => r[0]), ['Open worktree feat-rates in Vim', '…or in VS Code, its own window']);
  await pick('Open worktree feat-rates in Vim');
  const vim = await waitFor(async () => (await ctx.server.terminals()).find(t => t.editor === 'vim' && t.cwd === wt('feat-rates') && t.exited === null), { what: 'vim in the worktree' });
  await ctx.waitFor(`window.peix.state().tab === 'shell:${vim.id}'`, { what: 'its tab in front' });
  await ctx.evaluate(`document.querySelector('#inEdPick [data-ined="vscode"]').click()`);

  // #14: a worktree for it — made, opened in VS Code Web on a tab named for it; the folder as it was
  out.menu14 = await openMenu(14);
  ctx.assert.equal(out.menu14[0][0], 'A worktree for it, in VS Code Web');
  ctx.assert.equal(out.menu14[0][1], 'widgets/.claude/worktrees/feat-tax-rounding · on feat/tax-rounding, tracking origin');
  await pick('A worktree for it');
  const ideTab = `window.peix.state().tabs.find(k => k.startsWith('ide:') && k.includes(encodeURIComponent('feat-tax-rounding')))`;
  await ctx.waitFor(`${ideTab} && window.peix.state().tab === ${ideTab}`, { what: 'the worktree’s editor tab, in front', timeout: 30000 });
  ctx.assert.equal(git(wt('feat-tax-rounding'), 'rev-parse', '--abbrev-ref', '@{u}'), 'origin/feat/tax-rounding');
  ctx.assert.deepEqual(folder(), before, 'the folder’s branch untouched');
  await ctx.waitFor(`document.querySelector('#prlist .prrow[data-url="${u(14)}"]')?.closest('.prline')?.querySelector('.prwhere')?.textContent === 'worktree feat-tax-rounding'`, { what: '#14’s row saying where its branch is now', timeout: 15000 });
  const posted = await ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'pane').pop()?.panes?.map(p => p.key) || [])`).then(JSON.parse);
  ctx.assert.ok(posted.some(k => k.includes(encodeURIComponent(wt('feat-tax-rounding')))), 'the shell asked to show VS Code Web on the worktree');

  // the other chat gone and the edit undone: the switch is offered, and only typed
  rmSync(join(claudeDir, 'sessions', `${process.pid}.json`));
  git(repo, 'checkout', '--', 'README.md');
  await ctx.waitFor(`!window.peix.session('${other.id}').alive`, { what: 'the other chat no longer live', timeout: 15000 });
  await ctx.evaluate(`document.querySelector('#ctxm').open && document.querySelector('#ctxm').close()`);
  out.menu16 = await openMenu(16);
  ctx.assert.deepEqual(out.menu16.map(r => [r[0], r[2]]), [['A worktree for it, in VS Code Web', false], ['Review only, detached', false], ['Switch this folder to fix/empty-cart…', false]], JSON.stringify(out.menu16));
  ctx.assert.equal(out.menu16[2][1], 'git switch fix/empty-cart typed into its zsh, not run');
  await pick('Switch this folder');
  await ctx.waitFor(`window.peix.state().tabs.some(k => k.startsWith('shell:')) && [0, 1].some(g => window.peix.screen(g).some(r => r.includes('git switch fix/empty-cart')))`, { what: 'git switch typed into the zsh', timeout: 20000 });
  ctx.assert.deepEqual(folder(), before, 'typed, not run');
  // the zsh beside it: the editor's tab, behind, wears the worktree's name
  out.tab = await ctx.evaluate(`[...document.querySelectorAll('.ptab')].find(t => t.dataset.tab === ${ideTab})?.textContent.trim()`);
  ctx.assert.equal(out.tab, 'widgets @ feat/tax-rounding');
  await ctx.settle(); await ctx.shot('2-worktree-tab');
  return out;
}
