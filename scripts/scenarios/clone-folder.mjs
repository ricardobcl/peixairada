// A chat whose folder is not checked out (2026-10-09): resuming it, or starting a new chat there, clones the repo first
// and says so while it runs. The folder of repos is the setup's root (ORG_DIR, org acme); gh is the fake, which clones
// without the network over FAKEGH_CLONE_MS and has no repo named no-such-…. What this checks: the resume bar says
// beforehand what Resume will do (and the button says *Clone and resume*); clicked, the bar is the clone — its title, git's
// phase and percent, the line along its top — and the status bar has a segment for it; then the drawer comes up in the
// cloned folder. A repo GitHub has not got is the bar's error in gh's words, and nothing is left behind. A folder
// under no root with an org is said to be beyond a clone. And ⌥⌘N's new chat in a folder not checked out shows the
// clone in the column, then the new chat.
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpDir } from '../../lib/testserver.mjs';
import { makeFixture } from '../fixture.mjs';

const org = tmpDir('peix-org-');
export const meta = { server: true, fake: true, fixture: 'auto', env: { ORG_DIR: org, ORG: 'acme', FAKEGH_CLONE_MS: '2400' } };

const bar = `document.querySelector('#resume')`;
const resume = ctx => ctx.evaluate(`JSON.stringify((b => ({ hidden: b.hidden, cloning: b.classList.contains('cloning'), err: b.classList.contains('err'), title: b.querySelector('.t b')?.textContent, text: b.querySelector('.t > span')?.textContent, go: b.querySelector('#resumeGo')?.textContent, line: getComputedStyle(b, '::before').transform }))(${bar}))`).then(JSON.parse);
const enter = ctx => ctx.evaluate(`document.querySelector('#pickq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);

export default async function (ctx) {
  const out = {}, now = Date.now(), elsewhere = join(tmpDir('peix-gone-'), 'scratch');
  mkdirSync(join(org, 'ledger', '.git'), { recursive: true });   // one repo that is here, so the root is a root
  const { chats: [widgets, nosuch, lost, gadgets] } = makeFixture(ctx.fixture.dir, [
    { cwd: join(org, 'widgets'), title: 'In widgets', prompt: 'fix the widget', reply: 'fixed', at: new Date(now - 60_000) },
    { cwd: join(org, 'no-such-repo'), title: 'In a repo GitHub has not got', prompt: 'hello', reply: 'hi', at: new Date(now - 120_000) },
    { cwd: elsewhere, title: 'In a folder long gone', prompt: 'hello', reply: 'hi', at: new Date(now - 180_000) },
    { cwd: join(org, 'gadgets'), title: 'In gadgets', prompt: 'hello', reply: 'hi', at: new Date(now - 240_000) },
  ]);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length >= 4`, { timeout: 15_000, what: 'the four chats' });

  // ---- before: the bar says the folder is not checked out, and what Resume will do ----
  await ctx.openChat(widgets.id);
  await ctx.waitFor(`!${bar}.hidden`, { what: 'the resume bar' });
  out.before = await resume(ctx);
  ctx.assert.match(out.before.text, /Its folder, .*widgets, is not checked out: Resume clones acme\/widgets there first/);
  ctx.assert.match(out.before.go, /^Clone and resume/);

  // ---- Resume: the bar is the clone, the status bar has it, then the drawer in the cloned folder ----
  await ctx.evaluate(`document.querySelector('#resumeGo').click()`);
  await ctx.waitFor(`${bar}.classList.contains('cloning')`, { what: 'the bar cloning' });
  await ctx.waitFor(`/receiving objects · ([1-9]|[1-7]\\d)%/.test(${bar}.querySelector('.cp')?.textContent || '')`, { timeout: 8000, what: 'git\'s progress, part way' });
  await ctx.waitFor(`(m => m > 0 && m < 1)(Number(getComputedStyle(${bar}, '::before').transform.match(/matrix\\(([^,]+)/)?.[1]))`, { timeout: 4000, what: 'the line along the top, part way (it eases)' });
  out.cloning = await resume(ctx);
  ctx.assert.equal(out.cloning.title, 'Cloning acme/widgets');
  ctx.assert.match(out.cloning.text, /not checked out: cloning it into .*widgets, then resuming/);
  ctx.assert.match(out.cloning.go, /^cloning… \d+%$/);
  out.lineScale = Number(out.cloning.line.match(/matrix\(([^,]+)/)?.[1]);
  ctx.assert.ok(out.lineScale > 0 && out.lineScale < 1, `the line along the top part way: ${out.cloning.line}`);
  out.sbar = await ctx.evaluate(`document.querySelector('#sbar .cl')?.textContent`);
  ctx.assert.match(out.sbar || '', /^cloning acme\/widgets\d+%$/, 'and in the status bar');
  await ctx.shot('1-cloning', { x: 0, y: 0, width: 1400, height: 1000 });
  await ctx.waitPrompt(30_000);
  ctx.assert.ok(existsSync(join(org, 'widgets', '.git', 'config')), 'cloned into the root');
  await ctx.waitFor(`${bar}.hidden && !document.querySelector('#sbar .cl')`, { what: 'the bar and the segment gone' });
  out.term = await ctx.evaluate(`peix.session(${JSON.stringify(widgets.id)}).terminal?.cwd || null`);

  // ---- a repo GitHub has not got: the bar's error in gh's words, nothing left behind ----
  await ctx.openChat(nosuch.id);
  await ctx.waitFor(`!${bar}.hidden && /^Clone and resume/.test(${bar}.querySelector('#resumeGo')?.textContent)`, { what: 'the bar on the second chat' });
  await ctx.evaluate(`document.querySelector('#resumeGo').click()`);
  await ctx.waitFor(`${bar}.classList.contains('err')`, { timeout: 8000, what: 'the clone\'s failure' });
  out.fail = await resume(ctx);
  ctx.assert.equal(out.fail.title, 'Could not resume this chat');
  ctx.assert.match(out.fail.text, /^Could not clone acme\/no-such-repo: GraphQL: Could not resolve to a Repository/);
  ctx.assert.ok(!existsSync(join(org, 'no-such-repo')), 'nothing left behind');

  // ---- a folder under no root with an org: beyond a clone, said so ----
  await ctx.openChat(lost.id);
  await ctx.waitFor(`!${bar}.hidden`, { what: 'the bar on the third chat' });
  out.lost = await resume(ctx);
  ctx.assert.match(out.lost.text, /is not there, and no folder of repos with an org holds it to clone it from/);
  ctx.assert.match(out.lost.go, /^Resume/);

  // ---- ⌥⌘N in a folder not checked out: the column is the clone, then the new chat ----
  await ctx.key('KeyN');
  await ctx.waitFor(`document.querySelector('#pick').open && document.querySelector('#pickq').placeholder.startsWith('New chat — a project')`, { what: 'the project step' });
  await ctx.fill('#pickq', 'gadgets');
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.sel')?.textContent.includes('gadgets')`, { what: 'gadgets picked' });
  await enter(ctx);
  await ctx.waitFor(`document.querySelector('#pickq').placeholder.startsWith('gadgets —')`, { what: 'its chats step' });
  await ctx.waitFor(`document.querySelector('#picklist .pkrow.sel')?.textContent.includes('new chat')`, { what: '＋ new chat selected' });
  await enter(ctx);
  await ctx.waitFor(`!!document.querySelector('#log .clonebox')`, { timeout: 8000, what: 'the column cloning' });
  await ctx.waitFor(`/%$/.test(document.querySelector('#log .clonebox .cp')?.textContent || '')`, { timeout: 8000, what: 'its progress' });
  out.newClone = await ctx.evaluate(`JSON.stringify({ head: document.querySelector('#shead h2')?.textContent, box: document.querySelector('#log .clonebox').textContent, p: getComputedStyle(document.querySelector('#log .clonebox')).getPropertyValue('--p') })`).then(JSON.parse);
  ctx.assert.match(out.newClone.head, /^gadgets.*cloning acme\/gadgets…$/);
  ctx.assert.match(out.newClone.box, /^Cloning acme\/gadgets into .*gadgets: the folder is not checked out yet, and the chat starts once it is\./);
  await ctx.shot('2-new-chat-cloning', { x: 0, y: 0, width: 1400, height: 1000 });
  await ctx.waitFor(`/new chat/.test(document.querySelector('#shead h2')?.textContent || '')`, { timeout: 15_000, what: 'the new chat\'s column' });
  await ctx.waitPrompt(30_000);
  ctx.assert.ok(existsSync(join(org, 'gadgets', '.git', 'config')), 'gadgets cloned');
  return out;
}
