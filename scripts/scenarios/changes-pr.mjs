// A PR's diff in the changes tab (2026-10-13). A chat in a checkout of acme/widgets on main, with an edit not committed,
// names three PRs: #14 (its branch checked out nowhere), #15 (checked out in a worktree under .claude/worktrees/) and
// acme/gadgets#16 (another repo). What this checks: each PR row says where its branch lives; Diff on #14 opens the tab
// on the PR scope with the PR's own files — read from origin's refs, the folder's branch, tree and refs untouched;
// the scope's PR #14 ▾ lists the chat's PRs with their branches and where they are; #16 picked comes from GitHub's
// diff (the fake gh's); and the folder's own scopes are as they were.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from '../fixture.mjs';

const root = mkdtempSync(join(realpathSync(tmpdir()), 'peix-chgpr-'));
const claudeDir = join(root, 'claude'), origin = join(root, 'origin.git'), seed = join(root, 'seed'), repo = join(root, 'work', 'widgets');
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe', env }).toString().trim();
const put = (dir, f, text) => { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), text); };

execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
execFileSync('git', ['init', '-q', '-b', 'main', seed]);
put(seed, 'src/cart.js', 'export const total = items => items.reduce((n, i) => n + i.price, 0);\n');
put(seed, 'README.md', '# widgets\n');
git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', 'base'); git(seed, 'push', '-q', origin, 'main');
const pr = (n, branch, files) => {
  git(seed, 'checkout', '-q', '-b', branch, 'main');
  for (const [f, t] of Object.entries(files)) put(seed, f, t);
  git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', branch);
  git(seed, 'push', '-q', origin, `${branch}:refs/pull/${n}/head`, `${branch}:refs/heads/${branch}`);
};
pr(14, 'feat/tax-rounding', { 'src/cart.js': 'export const total = items => Math.round(items.reduce((n, i) => n + i.price, 0) * 100) / 100;\n', 'src/round.js': 'export const round2 = x => Math.round(x * 100) / 100;\n' });
pr(15, 'feat/rates', { 'src/rates.js': 'export const rates = r => fetch(`/api/rates/${r}`);\n' });
// the chat's checkout: GitHub's address for origin, on main, an edit not committed; #15's branch in a worktree inside it
execFileSync('git', ['clone', '-q', '--no-local', '--config', `url.${origin}.insteadOf=https://github.com/acme/widgets`, 'https://github.com/acme/widgets', repo], { stdio: 'pipe', env });
git(repo, 'worktree', 'add', '-q', join(repo, '.claude', 'worktrees', 'feat-rates'), 'feat/rates');
put(repo, '.git/info/exclude', '.claude\n');
put(repo, 'README.md', '# widgets\n\nnot committed\n');

const prsFile = join(root, 'prs.json'), refs = (head, base = 'main') => ({ headRefName: head, baseRefName: base, isCrossRepository: false, headRepository: { nameWithOwner: 'acme/widgets' } });
writeFileSync(prsFile, JSON.stringify({
  'acme/widgets#14': { state: 'OPEN', title: 'Round tax to the cent', createdAt: '2026-10-09T09:00:00Z', ...refs('feat/tax-rounding') },
  'acme/widgets#15': { state: 'OPEN', title: 'Rates from the API', createdAt: '2026-10-10T09:00:00Z', ...refs('feat/rates') },
  'acme/gadgets#16': { state: 'OPEN', title: 'Gadgets count', createdAt: '2026-10-11T09:00:00Z', headRefName: 'count', baseRefName: 'main',
    diff: 'diff --git a/count.js b/count.js\nnew file mode 100644\n--- /dev/null\n+++ b/count.js\n@@ -0,0 +1,2 @@\n+export const count = xs => xs.length;\n+export default count;\n' },
}));
const { chats: [chat] } = makeFixture(claudeDir, [{ cwd: repo, at: new Date(Date.now() - 300_000), title: 'Tax and rates',
  prompt: 'Look at https://github.com/acme/widgets/pull/14, https://github.com/acme/widgets/pull/15 and https://github.com/acme/gadgets/pull/16',
  reply: 'All three read. #14 rounds the total, #15 reads the rates, gadgets#16 counts.' }]);
const before = { head: git(repo, 'rev-parse', 'HEAD'), branch: git(repo, 'branch', '--show-current'), status: git(repo, 'status', '--porcelain'), refs: git(repo, 'for-each-ref') };

export const meta = {
  server: true, fixture: claudeDir,
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: prsFile, PR_TTL_MS: '300' },
  prefs: { headFloat: true, prsOpen: true, changesScope: 'turn' },
};

export default async function (ctx) {
  const out = {};
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${chat.id}"]')`, { what: 'its card', timeout: 15000 });
  await ctx.openChat(chat.id);
  const u = n => `https://github.com/acme/${n === 16 ? 'gadgets' : 'widgets'}/pull/${n}`;
  const where = () => ctx.evaluate(`JSON.stringify(Object.fromEntries([...document.querySelectorAll('#prlist .prline')].map(l => [l.querySelector('.num').textContent, [l.querySelector('.prwhere')?.className.replace('prwhere ', ''), l.querySelector('.prwhere')?.textContent, !!l.querySelector('.pract[data-pract="diff"]')]])))`).then(JSON.parse);
  await ctx.waitFor(`document.querySelectorAll('#prlist .prline .prwhere').length === 3`, { what: 'where each PR’s branch lives', timeout: 20000 });
  out.where = await where();
  ctx.assert.deepEqual(out.where, { 'widgets#14': ['none', 'not checked out', true], 'widgets#15': ['wt', 'worktree feat-rates', true], 'gadgets#16': ['away', 'not this folder’s repo', true] }, JSON.stringify(out.where));
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#prlist .prrow').length`), 3, 'the rows the harness reads, one each');

  // Diff on #14: the tab, on the PR scope, the PR's two files — read from origin, the folder left as it was
  await ctx.evaluate(`document.querySelector('#prlist .pract[data-url="${u(14)}"]').click()`);
  const files = () => ctx.evaluate(`[...document.querySelectorAll('#chg .cf')].map(b => b.dataset.path).join()`);
  await ctx.waitFor(`!document.querySelector('#chg').hidden && [...document.querySelectorAll('#chg .cf')].map(b => b.dataset.path).join() === 'src/cart.js,src/round.js'`, { what: 'PR #14’s files', timeout: 30000 });
  out.head14 = await ctx.evaluate(`JSON.stringify({ seg: document.querySelector('#chg .cseg .on').textContent, br: [...document.querySelectorAll('#chg .r1 .br')].map(b => b.textContent), src: document.querySelector('#chg .csrc').textContent, acts: [...document.querySelectorAll('#chg .acts .cbtn')].map(b => b.textContent) })`).then(JSON.parse);
  ctx.assert.equal(out.head14.seg, 'PR #14 ▾');
  ctx.assert.deepEqual(out.head14.br, ['feat/tax-rounding', 'main'], 'its head → its base');
  ctx.assert.match(out.head14.src, /^as pushed, at [0-9a-f]{7} · read from origin, nothing checked out$/);
  ctx.assert.deepEqual(out.head14.acts, ['#14 ↗'], 'no Commit… or Push: those are the folder’s');
  ctx.assert.equal((await ctx.peix('prefs()')).changesScope, 'pr', 'the scope remembered');
  const now = { head: git(repo, 'rev-parse', 'HEAD'), branch: git(repo, 'branch', '--show-current'), status: git(repo, 'status', '--porcelain'), refs: git(repo, 'for-each-ref') };
  ctx.assert.deepEqual(now, before, 'the folder’s HEAD, branch, tree and refs untouched');
  await ctx.settle(); await ctx.shot('1-pr-scope');

  // PR #14 ▾: the chat's PRs, each with its branch and where it is; #16 picked comes from GitHub's diff
  await ctx.evaluate(`document.querySelector('#chg .cseg .prsc').click()`);
  await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: 'the PR picker' });
  out.menu = await ctx.evaluate(`JSON.stringify(Object.fromEntries([...document.querySelectorAll('#ctxm button')].map(b => [b.querySelector('.cn')?.textContent, [b.querySelector('.ct').textContent, b.querySelector('.csub')?.textContent, b.getAttribute('aria-checked')]])))`).then(JSON.parse);
  ctx.assert.deepEqual(out.menu, { 'feat/tax-rounding': ['#14 Round tax to the cent', 'not checked out', 'true'], 'feat/rates': ['#15 Rates from the API', 'worktree feat-rates', 'false'], count: ['#16 Gadgets count', 'not this folder’s repo', 'false'] }, JSON.stringify(out.menu));
  await ctx.settle(); await ctx.shot('2-picker');
  await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.querySelector('.cn')?.textContent === 'count').click()`);
  await ctx.waitFor(`[...document.querySelectorAll('#chg .cf')].map(b => b.dataset.path).join() === 'count.js'`, { what: 'gadgets#16’s file, from GitHub', timeout: 20000 });
  out.src16 = await ctx.evaluate(`document.querySelector('#chg .csrc').textContent`);
  ctx.assert.equal(out.src16, 'from GitHub (gh pr diff) — it is not in this checkout\'s repo');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#chg .cf b').textContent`), 'A');

  // the folder's own scope: its uncommitted README, as before
  await ctx.evaluate(`document.querySelector('#chg [data-scope="uncommitted"]').click()`);
  await ctx.waitFor(`[...document.querySelectorAll('#chg .cf')].map(b => b.dataset.path).join() === 'README.md'`, { what: 'the folder’s own edit', timeout: 15000 });
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#chg .r1 .br').textContent`), /^main$/);
  out.files = await files();
  return out;
}
