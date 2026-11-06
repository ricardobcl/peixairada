// Chats in worktrees (2026-10-13). A chat in a checkout of acme/widgets names PR #14, whose branch is checked out
// nowhere; another chat is in another folder. What this checks: the PR row's Chat ▾ makes a worktree inside the repo for
// the branch and starts a chat there (the fake claude); that chat is the repo's — its card says widgets and wears the
// branch, the project pickers list widgets once and never the worktree, the header's folder narrows the list to both
// widgets chats; the launcher's PR row has Chat too; and ⌥⌘N's chats step gives ＋ a switch — this folder or a new
// worktree (←→, a click) — whose row says what the branch typed would do, in red where it would share a tree; a new
// name asks what it starts from (2026-10-28: origin's main selected, typing filters, ← back to the name) and ⏎ makes a
// worktree from it and starts a chat there. One press is one chat (2026-11-04): with origin slow to answer, real clicks
// on the base row, a ⏎ twice on ＋, Chat twice on a PR, the picker left and the same asked again.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

const root = realpathSync(tmpDir('peix-chwt-'));
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

// origin slow to say whether it has a branch under slow/: as long as this Mac's SSH took on 2026-11-04
const slowGit = join(root, 'slowgit');
writeFileSync(slowGit, '#!/bin/sh\ncase "$*" in *ls-remote*slow/again*) sleep 8;; *ls-remote*slow/*) sleep 3;; *ls-remote*off/*) exit 128;; esac\nexec git "$@"\n'); chmodSync(slowGit, 0o755);
const prsFile = join(root, 'prs.json');
writeFileSync(prsFile, JSON.stringify({ 'acme/widgets#14': { state: 'OPEN', title: 'Round tax to the cent', createdAt: '2026-10-09T09:00:00Z', headRefName: 'feat/tax-rounding', baseRefName: 'main', isCrossRepository: false } }));
const { chats: [chat] } = makeFixture(claudeDir, [
  { cwd: repo, at: new Date(Date.now() - 300_000), title: 'Tax rounding', prompt: 'Look at https://github.com/acme/widgets/pull/14', reply: 'Read it.' },
  { cwd: other, at: new Date(Date.now() - 600_000), title: 'Product grid', prompt: 'the grid in dark mode', reply: 'Done.' },
]);

export const meta = {
  server: true, fake: true, fixture: claudeDir,
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: prsFile, PR_TTL_MS: '300', GIT_BIN: slowGit, WT_ASK_MS: '20000' },
  prefs: { prsOpen: true },
};

export default async function (ctx) {
  const out = {};
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${chat.id}"]')`, { what: 'its card', timeout: 15000 });
  await ctx.openChat(chat.id);
  const u14 = 'https://github.com/acme/widgets/pull/14';
  await ctx.waitFor(`document.querySelector('#prlist .pract[data-pract="chat"][data-url="${u14}"]')`, { what: 'Chat on #14’s row', timeout: 20000 });
  const termIn = async dir => (await ctx.server.terminals()).find(t => t.cwd === dir && !t.shell);

  // Chat ▾ on #14, its first row (2026-11-06: the rest are agents): a worktree for its branch inside the repo, and a chat in it — the repo's
  const chatRow = async () => { await ctx.evaluate(`document.querySelector('#prlist .pract[data-pract="chat"][data-url="${u14}"]').click()`); await ctx.waitFor(`document.querySelector('#ctxm').open && document.querySelector('#ctxm button[data-i="0"]')`, { what: 'Chat ▾’s menu' }); };
  await chatRow();
  await ctx.evaluate(`document.querySelector('#ctxm button[data-i="0"]').click()`);
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
  ctx.assert.match(out.here.foot, /←→ this folder or a new worktree · @ an agent to run it/);
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#picklist .pkrow.branch').length`), 0, 'no row of its own any more');
  await press('ArrowRight');
  out.empty = await plus();
  ctx.assert.deepEqual([out.empty.n, out.empty.say, out.empty.on, out.empty.wt], ['＋ new chat in a new worktree', 'type a branch name — for a new one, ⏎ asks what it starts from, main first', 'new worktree', true], JSON.stringify(out.empty));
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
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.new .cur').textContent === 'a new branch in a worktree of its own — ⏎ asks what it starts from, main first'`, { what: 'a new name: what ⏎ does' });
  ctx.assert.equal(await ctx.evaluate(`document.activeElement.id`), 'pickq', 'the box keeps the keys');
  await ctx.settle(); await ctx.shot('2-new-worktree');
  // ⏎: what it starts from — the checkout's branches and origin's, origin's main first and selected (main here is at
  // its commit, and the PR's branch here at origin's: neither adds a row)
  const bases = () => ctx.evaluate(`({ rows: [...document.querySelectorAll('#picklist .pkrow.base')].map(r => { const n = r.querySelector('.n').cloneNode(true), c = n.querySelector('.cur'); c?.remove(); return [n.textContent, r.querySelector('.num').textContent, c?.textContent || '', r.classList.contains('sel')]; }), q: document.querySelector('#pickq').value, ph: document.querySelector('#pickq').placeholder, foot: document.querySelector('#pickfoot').checkVisibility() ? document.querySelector('#pickfoot').textContent : null })`);
  await press('Enter');
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.base')`, { what: 'the base step' });
  out.bases = await bases();
  ctx.assert.deepEqual(out.bases.rows, [['origin/main', 'origin', 'default', true], ['origin/feat/tax-rounding', 'origin', '', false]], JSON.stringify(out.bases));
  ctx.assert.match(out.bases.ph, /^feat\/new-thing — what it starts from .* ← back · esc$/);
  ctx.assert.match(out.bases.foot, /^⏎ a worktree from the branch selected · ← back to its name$/, 'its own foot, not the chats step’s');
  await ctx.settle(); await ctx.shot('3-base');
  await ctx.fill('#pickq', 'tax');
  ctx.assert.deepEqual((await bases()).rows.map(r => [r[0], r[3]]), [['origin/feat/tax-rounding', true]], 'typing filters, the best match selected');
  await ctx.fill('#pickq', '');
  // ← on the empty box: back to the name, "new worktree" still on
  await press('ArrowLeft', 0);
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.new.wt')`, { what: 'back on ＋' });
  ctx.assert.deepEqual(await ctx.evaluate(`[document.querySelector('#pickq').value, document.querySelector('#picklist .pkrow.new .pkmode [aria-checked="true"]').textContent]`), ['feat/new-thing', 'new worktree']);
  await press('Enter');
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.base.sel')`, { what: 'the base step again' });
  ctx.assert.equal((await bases()).rows[0][3], true, 'the default selected: ⏎ ⏎ is the common case');
  await press('Enter');
  for (let i = 0; i < 150 && !(await termIn(wt('feat-new-thing'))); i++) await ctx.sleep(100);
  ctx.assert.ok(await termIn(wt('feat-new-thing')), 'a chat started in .claude/worktrees/feat-new-thing');
  ctx.assert.equal(git(wt('feat-new-thing'), 'rev-parse', 'HEAD'), git(repo, 'rev-parse', 'origin/main'), 'from origin’s main');
  ctx.assert.equal(git(wt('feat-new-thing'), 'branch', '--show-current'), 'feat/new-thing');

  // One press is one chat (2026-11-04). The way to a branch's base step, the chats in a folder, and a wait long enough
  // for a second one to have shown
  const chatsIn = async dir => (await ctx.server.terminals()).filter(t => t.cwd === dir && !t.shell).length;
  const noSecond = async (dir, want, what) => {
    await ctx.waitFor(`!document.querySelector('#pick').open`, { what: `the picker gone: ${what}`, timeout: 15000 });
    for (let i = 0; i < 100 && await chatsIn(dir) < want; i++) await ctx.sleep(100);
    await ctx.sleep(1000);
    ctx.assert.equal(await chatsIn(dir), want, `one chat: ${what}`);
  };
  const toChats = async () => {
    await ctx.key('KeyN');
    await ctx.waitFor(`document.querySelector('#pick').open && document.querySelector('#picklist .pkrow.sel')`, { what: '⌥⌘N' });
    await press('Enter');
    await ctx.waitFor(`document.querySelector('#picklist .pkrow.new .pkmode')`, { what: 'the switch on ＋', timeout: 10000 });
  };
  const toBase = async name => {
    await toChats(); await press('ArrowRight');
    await ctx.fill('#pickq', name);
    await ctx.waitFor(`/a new branch/.test(document.querySelector('#picklist .pkrow.new .cur')?.textContent || '')`, { what: 'a new name' });
    await press('Enter');
    await ctx.waitFor(`document.querySelector('#picklist .pkrow.base.sel')`, { what: 'the base step' });
  };
  // real clicks on the row, the worktree not there yet: the rows dim and take nothing
  await toBase('slow/clicks');
  const click = async () => {
    const at = await ctx.evaluate(`(b => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 }))(document.querySelector('#picklist .pkrow.base').getBoundingClientRect())`);
    for (const type of ['mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
  };
  for (let i = 0; i < 4; i++) { await click(); await ctx.sleep(150); }
  out.busy = await ctx.evaluate(`(c => ({ opacity: c.opacity, cursor: c.cursor, disabled: document.querySelector('#pickq').disabled, ph: document.querySelector('#pickq').placeholder }))(getComputedStyle(document.querySelector('#picklist .pkrow.base')))`);
  ctx.assert.deepEqual([out.busy.opacity, out.busy.cursor, out.busy.disabled], ['0.5', 'progress', true], JSON.stringify(out.busy));
  ctx.assert.match(out.busy.ph, /^making a worktree for slow\/clicks from origin\/main…$/);
  await ctx.shot('4-making');
  await noSecond(wt('slow-clicks'), 1, 'four clicks on the base row');
  // the picker left while it is made, and the same branch asked for again: the same ask
  await toBase('slow/again');
  await press('Enter');
  await ctx.evaluate(`document.querySelector('#pick').close()`); await ctx.settle();   // its close event, which a step opened before it would take for its own
  await toBase('slow/again');
  await press('Enter');
  await ctx.waitFor(`/^Already starting a chat on slow\\/again/.test(document.querySelector('.note')?.textContent || '')`, { what: 'it says so' });
  await noSecond(wt('slow-again'), 1, 'the same branch asked for twice');
  // ⏎ twice on ＋ in this folder, while the folder is asked how it starts claude
  const here = await chatsIn(real);
  await toChats();
  await ctx.evaluate(`(q => { for (let i = 0; i < 2; i++) q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })(document.querySelector('#pickq'))`);
  await noSecond(real, here + 1, '⏎ twice on ＋');
  // origin does not answer: the chat starts all the same, and the board says what it could not check
  await toBase('off/line');
  await press('Enter');
  await ctx.waitFor(`/^Origin did not answer: off\\/line starts from origin\\/main, unchecked/.test(document.querySelector('.note')?.textContent || '')`, { what: 'it says so', timeout: 10000 });
  await noSecond(wt('off-line'), 1, 'origin does not answer');
  ctx.assert.equal(git(wt('off-line'), 'rev-parse', 'HEAD'), git(repo, 'rev-parse', 'origin/main'), 'from the base picked');
  // Chat twice on a PR's row
  await ctx.openChat(chat.id);
  await ctx.waitFor(`document.querySelector('#prlist .pract[data-pract="chat"][data-url="${u14}"]')`, { what: 'Chat on #14’s row', timeout: 20000 });
  const onPr = await chatsIn(wt('feat-tax-rounding'));
  await chatRow();
  await ctx.evaluate(`(b => { b.click(); b.click(); })(document.querySelector('#ctxm button[data-i="0"]'))`);
  await noSecond(wt('feat-tax-rounding'), onPr + 1, 'Chat twice on a PR');
  return out;
}
