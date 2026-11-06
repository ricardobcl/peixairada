// A new chat as an agent (2026-11-06, round XXVIII — A1 B1 C1 D1 E1 E2 E3), under compact and same height. storefront is a
// git checkout of acme/storefront with two agents of its own; the config has one of yours and an enabled plugin's two. What
// this checks: ⌥⌘N's ＋ ends its line with a chip, as Claude ▾; @ in the box lists the agents under ＋ — Claude, the
// folder's and yours by name, the plugin's and Claude Code's own a folded row each — typing narrows them, ⏎ takes one and the
// chip says it and its model; ⏎ on ＋ starts the fake claude with --agent; the next ⌥⌘N starts on that agent; esc shuts the
// list and not the picker; on "new worktree" the box takes the branch and the @ together. A chat that ran as an agent wears
// it on its card, in its header, in ⌥⌘K and on its resume bar. A PR row's Chat ▾ offers the agents and any of them through
// the agent picker, the one taken first next time; ⌥⌘L offers a new chat by an agent's name.
import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

const root = realpathSync(tmpDir('peix-agent-'));
const claudeDir = join(root, 'claude'), origin = join(root, 'origin.git'), seed = join(root, 'seed'), repo = join(root, 'work', 'storefront'), kit = join(root, 'kit');
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe', env }).toString().trim();
const put = (dir, f, text) => { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), text); };
const md = front => `---\n${front}\n---\n\nYou do the thing.\n`;
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
execFileSync('git', ['init', '-q', '-b', 'main', seed]);
put(seed, 'README.md', '# storefront\n');
put(seed, '.claude/agents/reviewer.md', md('name: reviewer\ndescription: Reviews the diff against main and lists what to fix\nmodel: sonnet\ncolor: purple'));
put(seed, '.claude/agents/a11y-auditor.md', md('name: a11y-auditor\ndescription: Checks the components against WCAG 2.2 and fixes what fails\nmodel: inherit\ncolor: green'));
git(seed, 'add', '.'); git(seed, 'add', '-f', '.claude/agents'); git(seed, 'commit', '-q', '-m', 'base'); git(seed, 'push', '-q', origin, 'main');   // -f: a global excludes file may name .claude
git(seed, 'checkout', '-q', '-b', 'fix/grid'); put(seed, 'grid.css', '.grid { color: var(--ink); }\n');
git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', 'grid'); git(seed, 'push', '-q', origin, 'fix/grid:refs/pull/14/head', 'fix/grid:refs/heads/fix/grid');
execFileSync('git', ['clone', '-q', '--no-local', '--config', `url.${origin}.insteadOf=https://github.com/acme/storefront`, 'https://github.com/acme/storefront', repo], { stdio: 'pipe', env });
put(claudeDir, 'agents/scout.md', md('name: scout\ndescription: Reads only — maps the code and answers questions\ncolor: cyan'));
put(kit, 'agents/code-reviewer.md', md('name: code-reviewer\ndescription: Reviews code against the project’s guidelines\nmodel: opus\ncolor: green'));
put(kit, 'agents/silent-failure-hunter.md', md('name: silent-failure-hunter\ndescription: Finds swallowed errors and bad fallbacks\ncolor: yellow'));
put(claudeDir, 'plugins/installed_plugins.json', JSON.stringify({ version: 2, plugins: { 'kit@market': [{ scope: 'user', installPath: kit }] } }));
put(claudeDir, 'settings.json', JSON.stringify({ enabledPlugins: { 'kit@market': true } }));
const real = realpathSync(repo), wt = n => join(real, '.claude', 'worktrees', n);
const prsFile = join(root, 'prs.json');
writeFileSync(prsFile, JSON.stringify({ 'acme/storefront#14': { state: 'OPEN', title: 'Product grid follows the dark theme', createdAt: '2026-11-05T09:00:00Z', headRefName: 'fix/grid', baseRefName: 'main', isCrossRepository: false } }));
const { chats: [prChat, asAgent] } = makeFixture(claudeDir, [
  { cwd: repo, at: new Date(Date.now() - 300_000), title: 'Product grid', prompt: 'Look at https://github.com/acme/storefront/pull/14', reply: 'Read it.' },
  { cwd: repo, at: new Date(Date.now() - 600_000), title: 'Review the cart', prompt: 'review the cart', reply: 'Three things to fix.' },
]);
{ const { readFileSync } = await import('node:fs'); const f = join(claudeDir, 'projects', repo.replace(/[/.]/g, '-'), `${asAgent.id}.jsonl`); writeFileSync(f, JSON.stringify({ type: 'agent-setting', agentSetting: 'reviewer', sessionId: asAgent.id }) + '\n' + readFileSync(f, 'utf8')); }

export const meta = {
  server: true, fake: true, fixture: claudeDir,
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: prsFile, PR_TTL_MS: '300' },
  prefs: { cards: 'compact', cardsEven: true, prsOpen: true },
};

export default async function (ctx) {
  const out = {};
  const q = js => ctx.evaluate(js);
  const rows = () => q(`JSON.stringify([...document.querySelectorAll('#picklist > .pkrow')].map(r => ({ cls: r.className, n: (n => { const c = n.cloneNode(true); c.querySelector('.cur')?.remove(); return c.textContent.trim(); })(r.querySelector('.n')), src: r.querySelector('.src')?.textContent || null })))`).then(JSON.parse);
  const press = key => q(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true, cancelable: true }))`);
  const holderWith = async (want, n = 1) => { for (let i = 0; i < 150; i++) { const h = ctx.server.holders().filter(h => !h.shell && want(h)); if (h.length >= n) return h; await ctx.sleep(100); } return []; };
  const toChats = async () => {
    await ctx.key('KeyN');
    await ctx.waitFor(`document.querySelector('#pick').open`, { what: '⌥⌘N' });
    await ctx.fill('#pickq', 'storefront'); await press('Enter');
    await ctx.waitFor(`document.querySelector('#picklist .pkrow.new .pkag')`, { what: '＋ with its chip', timeout: 10000 });
  };

  // C1 + E3: the chat that ran as @reviewer wears it on its card, in its header, and its resume bar says it
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${asAgent.id}"] .top .chip.runas')`, { what: 'its card’s @reviewer', timeout: 15000 });
  out.card = await q(`(c => c.textContent + '|' + c.querySelector('.asdot').dataset.c)(document.querySelector('#slist > .card[data-id="${asAgent.id}"] .top .chip.runas'))`);
  ctx.assert.equal(out.card, '@reviewer|purple');
  ctx.assert.equal(await q(`document.querySelector('#slist > .card[data-id="${prChat.id}"] .chip.runas')`), null, 'a plain chat has none');
  await ctx.openChat(asAgent.id);
  await ctx.waitFor(`document.querySelector('#shead h2 .runas') && !document.querySelector('#resume').hidden`, { what: 'its header and resume bar' });
  out.head = await q(`document.querySelector('#shead h2 .runas').textContent`);
  out.resume = await q(`document.querySelector('#resumeGo').textContent`);
  ctx.assert.equal(out.head, '@reviewer');
  ctx.assert.match(out.resume, /^Resume as @reviewer/);
  await ctx.settle(); await ctx.shot('1-card-header-resume');
  // …and in ⌥⌘K, found by it
  await ctx.key('KeyK'); await ctx.waitFor(`document.querySelector('#pick').open`, { what: '⌥⌘K' });
  await ctx.fill('#pickq', '@reviewer');
  out.k = await q(`[...document.querySelectorAll('#picklist .pkrow.chat')].map(r => r.querySelector('.runas')?.textContent || '-')`);
  ctx.assert.deepEqual(out.k, ['@reviewer'], `⌥⌘K finds it by its agent: ${JSON.stringify(out.k)}`);
  await q(`document.querySelector('#pick').close()`);

  // A1: ⌥⌘N's ＋ ends its line with the chip, as Claude ▾; the foot says @
  await toChats();
  out.chip = await q(`document.querySelector('#picklist .pkrow.new .pkag').textContent.trim()`);
  ctx.assert.equal(out.chip, 'as Claude ▾');
  ctx.assert.match(await q(`document.querySelector('#pickfoot').textContent`), /an agent to run it/);
  ctx.assert.match(await q(`document.querySelector('#picklist .pkrow.new .pkline .cur').textContent`), /as it stands/, 'the line still says where');
  await ctx.settle(); await ctx.shot('2-chip-at-rest');
  // B1: @ lists them under ＋ — Claude, the folder's and yours, a row each for the plugin's and Claude Code's own
  await ctx.fill('#pickq', '@');
  out.list = await rows();
  ctx.assert.deepEqual(out.list.map(r => r.n), ['＋ new chat', 'Claude', '@a11y-auditor', '@reviewer', '@scout', '2 from kit', '4 of Claude Code’s own'], JSON.stringify(out.list));
  ctx.assert.deepEqual(out.list.slice(2, 5).map(r => r.src), ['this folder', 'this folder', 'yours']);
  ctx.assert.match(out.list[2].cls, /\bsel\b/, 'the first agent selected');
  ctx.assert.match(await q(`document.querySelector('#pickfoot').textContent`), /takes the agent/);
  await ctx.settle(); await ctx.shot('3-the-list');
  // → opens a folded row
  await press('ArrowDown'); await press('ArrowDown'); await press('ArrowDown');
  await q(`(i => { i.setSelectionRange(1, 1); })(document.querySelector('#pickq'))`);
  await press('ArrowRight');
  out.unfolded = (await rows()).map(r => r.n);
  ctx.assert.ok(out.unfolded.includes('@code-reviewer') && out.unfolded.includes('@silent-failure-hunter'), JSON.stringify(out.unfolded));
  // typed, it narrows; ⏎ takes the first match: the chip says it and its model, the box is empty, the chats are back
  await ctx.fill('#pickq', '@rev');
  out.typed = await rows();
  ctx.assert.equal(out.typed[1].n, '@reviewer', JSON.stringify(out.typed));
  ctx.assert.match(out.typed[1].cls, /\bsel\b/);
  await press('Enter');
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.new .pkag.on')`, { what: 'the chip on @reviewer' });
  out.taken = await q(`JSON.stringify({ chip: document.querySelector('#picklist .pkrow.new .pkag').textContent.trim(), line: document.querySelector('#picklist .pkrow.new .pkline').textContent, box: document.querySelector('#pickq').value, chats: document.querySelectorAll('#picklist .pkrow.chat:not(.new)').length })`).then(JSON.parse);
  ctx.assert.deepEqual([out.taken.chip, out.taken.box], ['@reviewer ▾', ''], JSON.stringify(out.taken));
  ctx.assert.match(out.taken.line, /on sonnet/);
  ctx.assert.equal(out.taken.chats, 2, 'the chats are back');
  await ctx.settle(); await ctx.shot('4-taken');
  // ⏎ on ＋: the fake claude with --agent reviewer, its card wearing it
  await press('Enter');
  const [h1] = await holderWith(h => h.cwd === real && h.args?.includes('--agent'));
  ctx.assert.deepEqual(h1?.args, ['--agent', 'reviewer'], JSON.stringify(h1));
  await ctx.waitFor(`[...document.querySelectorAll('#slist > .card .top .chip.runas')].length === 2`, { what: 'the new chat’s card, as @reviewer', timeout: 15000 });

  // D1: the next ⌥⌘N starts on the agent taken; esc shuts the list and not the picker; ⏎ on Claude puts it back
  await toChats();
  out.again = await q(`document.querySelector('#picklist .pkrow.new .pkline').textContent`);
  ctx.assert.match(out.again, /@reviewer ▾.*the last you took here/, out.again);
  await q(`document.querySelector('#picklist .pkrow.new .pkag').click()`);
  ctx.assert.equal(await q(`document.querySelector('#pickq').value`), '@', 'the chip opens the list');
  await q(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
  ctx.assert.deepEqual(await q(`[document.querySelector('#pick').open, document.querySelector('#pickq').value, document.querySelectorAll('#picklist .pkrow.asrow').length]`), [true, '', 0], 'esc: the list shut, the picker up');
  await ctx.fill('#pickq', '@');
  ctx.assert.match((await rows())[3].cls, /\bsel\b/, 'the list opens on the chip\'s agent');
  await ctx.fill('#pickq', '@cl');
  ctx.assert.deepEqual([(await rows())[1].n, /\bsel\b/.test((await rows())[1].cls)], ['Claude', true], 'Claude first for its name'); await press('Enter');
  ctx.assert.equal(await q(`document.querySelector('#picklist .pkrow.new .pkag').textContent.trim()`), 'as Claude ▾');

  // on "new worktree" the box takes the branch and the @: ⏎ takes the agent and leaves the branch; the chat starts in its worktree as it
  await press('ArrowRight');
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.new.wt')`, { what: 'new worktree' });
  await ctx.fill('#pickq', 'fix-cart @a11');
  ctx.assert.equal((await rows())[1].n, '@a11y-auditor');
  await press('Enter');
  ctx.assert.equal(await q(`document.querySelector('#pickq').value`), 'fix-cart');
  await ctx.waitFor(`/a new branch/.test(document.querySelector('#picklist .pkrow.new .pkline .cur').textContent)`, { what: 'the branch said', timeout: 10000 });
  await ctx.settle(); await ctx.shot('5-worktree-and-agent');
  await press('Enter');
  await ctx.waitFor(`document.querySelector('#pick').open && window.peix.state && document.querySelector('#picklist .pkrow.base')`, { what: 'the base step', timeout: 10000 });
  await press('Enter');
  const [h2] = await holderWith(h => h.cwd === wt('fix-cart'));
  ctx.assert.deepEqual(h2?.args, ['--agent', 'a11y-auditor'], JSON.stringify(h2));
  await ctx.waitFor(`window.peix.session(window.peix.state().current)?.cwd === ${JSON.stringify(wt('fix-cart'))}`, { what: 'the column on it, registered', timeout: 15000 });

  // E1: a PR row's Chat ▾ — a chat on its branch, the folder's and your agents, any through the agent picker
  await ctx.openChat(prChat.id);
  const chatBtn = `document.querySelector('#prlist .pract[data-pract="chat"]')`;
  await ctx.waitFor(chatBtn, { what: 'Chat ▾ on #14', timeout: 20000 });
  await q(`${chatBtn}.click()`);
  await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: 'its menu' });
  out.menu = await q(`[...document.querySelectorAll('#ctxm button .ct')].map(b => b.textContent)`);
  ctx.assert.deepEqual(out.menu, ['A chat on its branch', '…as @a11y-auditor', '…as @reviewer', '…as @scout', '…as another agent…'], JSON.stringify(out.menu));
  await ctx.settle(); await ctx.shot('6-pr-chat-menu');
  await q(`[...document.querySelectorAll('#ctxm button')].find(b => /another agent/.test(b.textContent)).click()`);
  await ctx.waitFor(`document.querySelector('#pick').open && document.querySelector('#picklist .pkrow.asrow')`, { what: 'the agent picker' });
  await ctx.fill('#pickq', 'code rev');
  ctx.assert.equal((await rows())[0].n, '@code-reviewer');
  await press('Enter');
  const [h3] = await holderWith(h => h.cwd === wt('fix-grid'));
  ctx.assert.deepEqual(h3?.args, ['--agent', 'kit:code-reviewer'], JSON.stringify(h3));
  await ctx.openChat(prChat.id);
  await ctx.waitFor(chatBtn, { what: 'Chat ▾ again', timeout: 20000 });
  await q(`${chatBtn}.click()`);
  await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: 'its menu again' });
  out.menu2 = await q(`[...document.querySelectorAll('#ctxm button')].slice(1, 2).map(b => b.textContent)`);
  ctx.assert.match(out.menu2[0], /…as @code-reviewer.*the agent you last took for a PR/, JSON.stringify(out.menu2));
  await q(`document.querySelector('#ctxm').close()`);

  // E2: ⌥⌘L by an agent's name — a new chat as it, in the project of the chat open
  await ctx.key('KeyL'); await ctx.waitFor(`document.querySelector('#pick').open`, { what: '⌥⌘L' });
  await ctx.fill('#pickq', 'reviewer');
  await ctx.waitFor(`[...document.querySelectorAll('#picklist .pkrow.action .n')].some(n => n.textContent.startsWith('New chat as @reviewer'))`, { what: 'New chat as @reviewer', timeout: 10000 });
  out.launch = await q(`[...document.querySelectorAll('#picklist .pkrow.action .n')].map(n => n.textContent).filter(t => /^New chat as/.test(t))`);
  ctx.assert.match(out.launch[0], /New chat as @reviewer — in storefront, on sonnet/, JSON.stringify(out.launch));
  await ctx.settle(); await ctx.shot('7-launcher');
  await q(`document.querySelector('#pick').close()`);
  return out;
}
