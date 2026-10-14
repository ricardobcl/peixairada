// Chats in worktrees (2026-10-13). A chat in a checkout of acme/widgets names PR #14, whose branch is checked out
// nowhere; another chat is in another folder. What this checks: the PR row's Chat makes a worktree inside the repo for
// the branch and starts a chat there (the fake claude); that chat is the repo's — its card says widgets and wears the
// branch, the project pickers list widgets once and never the worktree, the header's folder narrows the list to both
// widgets chats; the launcher's PR row has Chat too; and ⌥⌘N's chats step gives ＋ a switch — this folder or a new
// worktree (←→, a click) — whose row says what the branch typed would do, in red where it would share a tree, and
// makes a worktree from origin's main for a new name and starts a chat in it.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from '../fixture.mjs';

const root = mkdtempSync(join(realpathSync(tmpdir()), 'peix-chwt-'));
const claudeDir = join(root, 'claude'), origin = join(root, 'origin.git'), seed = join(root, 'seed'), repo = join(root, 'work', 'widgets'), other = join(root, 'work', 'storefront');
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe', env }).toString().trim();
const put = (dir, f, text) => { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), text); };
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
execFileSync('git', ['init', '-q', '-b', 'main', seed]);
put(seed, 'README.md', '# widgets\n'); put(seed, '.gitignore', '.claude/\n');
git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', 'base'); git(seed, 'push', '-q', origin, 'main');
git(seed, 'checkout', '-q', '-b', 'feat/tax-rounding'); put(seed, 'round.js', 'export const round2 = x => Math.round(x * 100) / 100;\n');
git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', 'round'); git(seed, 'push', '-q', origin, 'feat/tax-rounding:refs/pull/14/head', 'feat/tax-rounding:refs/heads/feat/tax-rounding');
execFileSync('git', ['clone', '-q', '--no-local', '--config', `url.${origin}.insteadOf=https://github.com/acme/widgets`, 'https://github.com/acme/widgets', repo], { stdio: 'pipe', env });
mkdirSync(other, { recursive: true });
const real = realpathSync(repo), wt = n => join(real, '.claude', 'worktrees', n);

const prsFile = join(root, 'prs.json');
writeFileSync(prsFile, JSON.stringify({ 'acme/widgets#14': { state: 'OPEN', title: 'Round tax to the cent', createdAt: '2026-10-09T09:00:00Z', headRefName: 'feat/tax-rounding', baseRefName: 'main', isCrossRepository: false } }));
const { chats: [chat] } = makeFixture(claudeDir, [
  { cwd: repo, at: new Date(Date.now() - 300_000), title: 'Tax rounding', prompt: 'Look at https://github.com/acme/widgets/pull/14', reply: 'Read it.' },
  { cwd: other, at: new Date(Date.now() - 600_000), title: 'Product grid', prompt: 'the grid in dark mode', reply: 'Done.' },
]);

export const meta = {
  server: true, fake: true, fixture: claudeDir,
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: prsFile, PR_TTL_MS: '300' },
  prefs: { prsOpen: true },
};

export default async function (ctx) {
  const out = {};
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${chat.id}"]')`, { what: 'its card', timeout: 15000 });
  await ctx.openChat(chat.id);
  const u14 = 'https://github.com/acme/widgets/pull/14';
  await ctx.waitFor(`document.querySelector('#prlist .pract[data-pract="chat"][data-url="${u14}"]')`, { what: 'Chat on #14’s row', timeout: 20000 });
  const termIn = async dir => (await ctx.server.terminals()).find(t => t.cwd === dir && !t.shell);

  // Chat on #14: a worktree for its branch inside the repo, and a chat in it — the repo's
  await ctx.evaluate(`document.querySelector('#prlist .pract[data-pract="chat"][data-url="${u14}"]').click()`);
  for (let i = 0; i < 150 && !(await termIn(wt('feat-tax-rounding'))); i++) await ctx.sleep(100);
  ctx.assert.ok(await termIn(wt('feat-tax-rounding')), 'a chat started in .claude/worktrees/feat-tax-rounding');
  ctx.assert.equal(git(wt('feat-tax-rounding'), 'branch', '--show-current'), 'feat/tax-rounding');
  ctx.assert.equal(git(repo, 'branch', '--show-current'), 'main', 'the folder’s branch untouched');
  const card = `[...document.querySelectorAll('#slist > .card')].find(c => window.peix.session(c.dataset.id)?.cwd?.includes('/.claude/worktrees/feat-tax-rounding'))`;
  await ctx.waitFor(`${card}?.querySelector('.chip.wtb')`, { what: 'the new chat’s card, with its branch', timeout: 20000 });
  out.card = await ctx.evaluate(`JSON.stringify((c => ({ repo: c.querySelector('.repo')?.textContent || null, chip: c.querySelector('.chip.wtb').textContent, project: window.peix.session(c.dataset.id).project }))(${card}))`).then(JSON.parse);
  ctx.assert.deepEqual([out.card.chip, out.card.project], ['feat/tax-rounding', 'widgets'], JSON.stringify(out.card));
  await ctx.settle(); await ctx.shot('1-worktree-chat');

  // the project pickers: widgets once, the worktree never
  await ctx.key('KeyP');
  await ctx.waitFor(`document.querySelector('#pick').open && document.querySelectorAll('#picklist .pkrow').length`, { what: '⌥⌘P' });
  out.projects = await ctx.evaluate(`[...document.querySelectorAll('#picklist .pkrow:not(.newproj) .n')].map(n => { const c = n.cloneNode(true); c.querySelector('.cur')?.remove(); return c.textContent; })`);
  ctx.assert.deepEqual(out.projects.filter(n => n !== 'ALL').sort(), ['storefront', 'widgets'], JSON.stringify(out.projects));
  await ctx.evaluate(`document.querySelector('#pick').close()`);
  // the header's folder of the worktree chat narrows the list to the repo's chats, both
  await ctx.evaluate(`${card}.click()`);
  await ctx.waitFor(`window.peix.state().current && window.peix.session(window.peix.state().current).cwd.includes('feat-tax-rounding') && document.querySelector('#shead .repo')`, { what: 'the worktree chat open' });
  await ctx.evaluate(`document.querySelector('#shead .repo').click()`);
  await ctx.waitFor(`document.querySelector('#shead .repo.on')`, { what: 'the project in view' });
  out.inView = await ctx.evaluate(`[...document.querySelectorAll('#slist > .card')].map(c => window.peix.session(c.dataset.id).project)`);
  ctx.assert.deepEqual(out.inView, ['widgets', 'widgets'], 'the repo’s chats, the worktree’s among them');
  ctx.assert.equal((await ctx.peix('prefs()')).project, real, 'keyed by the repo, never the worktree');

  // the launcher's PR row: Chat
  await ctx.key('KeyL');
  await ctx.fill('#pickq', '#');
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.pr .pkchat[data-url="${u14}"]')`, { what: 'Chat on the launcher’s PR row' });
  await ctx.evaluate(`document.querySelector('#pick').close()`);

  // ⌥⌘N: the chats step's ＋ has a switch, this folder | new worktree — → past the box's end, ← past its start, or a
  // click. On "new worktree" the box names the branch and the row says what ⏎ would do; ⏎ makes a worktree from origin's
  // main and starts a chat in it
  const press = (key, at) => ctx.evaluate(`(q => { ${at === undefined ? '' : `q.setSelectionRange(${at}, ${at});`} q.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true, cancelable: true })); })(document.querySelector('#pickq'))`);
  const plus = () => ctx.evaluate(`(r => r && { n: r.querySelector('.n').firstChild.textContent + (r.querySelector('.n b')?.textContent || ''), say: r.querySelector('.cur').textContent, tone: r.querySelector('.cur').className, wt: r.classList.contains('wt'), sel: r.classList.contains('sel'), on: r.querySelector('.pkmode [aria-checked="true"]')?.textContent, foot: document.querySelector('#pickfoot').hidden ? null : document.querySelector('#pickfoot').textContent })(document.querySelector('#picklist .pkrow.new'))`);
  await ctx.key('KeyN');
  await ctx.waitFor(`document.querySelector('#pick').open && document.querySelector('#picklist .pkrow.sel')`, { what: '⌥⌘N' });
  await press('Enter');
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.new .pkmode')`, { what: 'the switch on ＋', timeout: 10000 });
  out.here = await plus();
  ctx.assert.deepEqual([out.here.n, out.here.say, out.here.on, out.here.wt], ['＋ new chat', 'in widgets as it stands — on main', 'this folder', false], JSON.stringify(out.here));
  await ctx.settle(); await ctx.shot('2-this-folder');
  ctx.assert.match(out.here.foot, /←→ ＋ new chat in this folder, or in a new worktree/);
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#picklist .pkrow.branch').length`), 0, 'no row of its own any more');
  await press('ArrowRight');
  out.empty = await plus();
  ctx.assert.deepEqual([out.empty.n, out.empty.say, out.empty.on, out.empty.wt], ['＋ new chat in a new worktree', 'type a branch name — a new one starts from origin/main', 'new worktree', true], JSON.stringify(out.empty));
  // the folder's own branch, and one out in the PR's worktree with a chat at work there: ⏎ would share them — in red
  await ctx.fill('#pickq', 'main');
  await ctx.waitFor(`/own branch/.test(document.querySelector('#picklist .pkrow.new .cur').textContent)`, { what: 'main: the folder’s own' });
  out.main = await plus();
  ctx.assert.deepEqual([out.main.say, out.main.tone, out.main.sel], ['already widgets\'s own branch: ⏎ shares that folder', 'cur warn', true], JSON.stringify(out.main));
  await ctx.fill('#pickq', 'feat/tax-rounding');
  await ctx.waitFor(`/out in/.test(document.querySelector('#picklist .pkrow.new .cur').textContent)`, { what: 'feat/tax-rounding: out in its worktree' });
  ctx.assert.equal((await plus()).say, 'already out in widgets/.claude/worktrees/feat-tax-rounding: ⏎ shares that worktree — 1 chat at work there');
  await ctx.settle(); await ctx.shot('2-shared');
  await ctx.fill('#pickq', 'feat/bad..name');
  await ctx.waitFor(`/not a name/.test(document.querySelector('#picklist .pkrow.new .cur').textContent)`, { what: 'a name git refuses' });
  // ← at the box's start back to this folder (the text a query again), → at its end over again, a click likewise
  await press('ArrowLeft', 0);
  ctx.assert.equal((await plus()).on, 'this folder');
  await ctx.fill('#pickq', 'feat/new-thing');
  ctx.assert.equal((await plus()).sel, true, 'a name no chat has: ＋ selected, as before');
  await press('ArrowRight');
  ctx.assert.equal((await plus()).on, 'new worktree');
  await ctx.evaluate(`document.querySelector('#picklist .pkmode [data-wt="0"]').click()`);
  ctx.assert.equal((await plus()).on, 'this folder', 'a click');
  await ctx.evaluate(`document.querySelector('#picklist .pkmode [data-wt="1"]').click()`);
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.new .cur').textContent === 'a new branch from origin/main, in a worktree of its own'`, { what: 'a new name: what ⏎ does' });
  ctx.assert.equal(await ctx.evaluate(`document.activeElement.id`), 'pickq', 'the box keeps the keys');
  await ctx.settle(); await ctx.shot('2-new-worktree');
  await press('Enter');
  for (let i = 0; i < 150 && !(await termIn(wt('feat-new-thing'))); i++) await ctx.sleep(100);
  ctx.assert.ok(await termIn(wt('feat-new-thing')), 'a chat started in .claude/worktrees/feat-new-thing');
  ctx.assert.equal(git(wt('feat-new-thing'), 'rev-parse', 'HEAD'), git(repo, 'rev-parse', 'origin/main'), 'from origin’s main');
  ctx.assert.equal(git(wt('feat-new-thing'), 'branch', '--show-current'), 'feat/new-thing');
  return out;
}
