// A chat whose worktree was removed (2026-10-19; "Could not resume this chat … a worktree since removed?" before): the
// resume bar says the resume makes the tree again, on the chat's branch; Resume makes it at its path, the chat runs
// there, and the header says where it is. A repo of its own beside the fixture's chat A (the runner removes that
// folder), the tree on branch lunch removed with `git worktree remove`, and a transcript written in its folder there.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chatLines, slugOf } from '../fixture.mjs';

export const meta = { server: true, fake: true, fixture: 'auto' };

const sid = JSON.stringify;
const BAR = `document.querySelector('#resume')`;

export default async function (ctx) {
  const out = {};
  const repo = join(dirname(ctx.fixture.chats[0].cwd), 'widgets'), tree = join(repo, '.claude', 'worktrees', 'lunch');
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe', env }).toString().trim();
  execFileSync('git', ['init', '-q', '-b', 'main', repo], { env }); writeFileSync(join(repo, 'a.js'), 'a\n'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'base');
  git(repo, 'worktree', 'add', '-q', '-b', 'lunch', tree); git(repo, 'worktree', 'remove', tree);
  const id = randomUUID(), proj = join(ctx.fixture.dir, 'projects', slugOf(tree)); mkdirSync(proj, { recursive: true });
  writeFileSync(join(proj, `${id}.jsonl`), chatLines({ id, cwd: tree, branch: 'lunch', title: 'Lunch menus', prompt: 'read the lunch menus', reply: 'Done — on lunch, landed on main.', at: new Date(Date.now() - 600_000) }).map(l => JSON.stringify(l)).join('\n') + '\n');
  await ctx.waitFor(`window.peix.session(${sid(id)})?.back?.tree === ${sid(tree)}`, { what: 'the new chat on the board, its worktree gone' });

  // ---- the bar: what Resume will do ----
  await ctx.openChat(id);
  await ctx.waitFor(`!${BAR}.hidden`, { what: 'the resume bar' });
  out.bar = await ctx.evaluate(`({ title: ${BAR}.querySelector('.t b').textContent, said: ${BAR}.querySelector('.t span')?.textContent, go: document.querySelector('#resumeGo')?.textContent, tip: document.querySelector('#resumeGo')?.title })`);
  ctx.assert.match(out.bar.title, /Claude isn’t running/, 'not "Could not resume this chat"');
  ctx.assert.equal(out.bar.said, `Its worktree, ${tree}, is gone — resuming makes it again, on lunch.`);
  ctx.assert.match(out.bar.go, /^Resume⌥⌘C$/);
  ctx.assert.match(out.bar.tip, /^git worktree add, then claude --resume/);
  await ctx.shot('bar');

  // ---- Resume: the tree again, the chat in it, the header says so ----
  await ctx.evaluate(`document.querySelector('#resumeGo').click()`);
  await ctx.waitFor(`(s => s?.alive && s.live?.cwd === ${sid(tree)})(window.peix.session(${sid(id)}))`, { what: 'the chat running in its tree again', timeout: 15_000 });
  await ctx.waitFor(`${BAR}.hidden`, { what: 'the bar gone under the drawer' });
  out.note = await ctx.evaluate(`document.querySelector('.note')?.textContent || null`);
  ctx.assert.equal(out.note, `Its worktree is back: ${tree} on lunch`);
  ctx.assert.ok(existsSync(tree), 'the folder is there');
  out.branch = git(tree, 'branch', '--show-current');
  ctx.assert.equal(out.branch, 'lunch');
  await ctx.waitPrompt();
  await ctx.shot('resumed');
  return out;
}
