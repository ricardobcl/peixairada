// The people row (2026-09-29). Three chats: one on a PR ana wrote
// and rui approved, one on a PR rui commented on and eva pushed to, one on no PR. GitHub is the fake gh; the faces are
// data: images, so nothing is fetched. What this checks: the row under the cards holds everyone in the view's PRs —
// you left out — once each, the newest first; a face narrows the list, its counts and the chips to that person's chats
// and rings the face; another face moves the filter; the same face again lets go; the choice is a pref; the rail has no
// row.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tmpDir } from '../../lib/testserver.mjs';
import { fileURLToPath } from 'node:url';
import { makeFixture } from '../fixture.mjs';

const dir = tmpDir('peix-people-'), file = join(dir, 'prs.json');
const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const face = (login, fill) => ({ login, __typename: 'User', avatarUrl: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${fill}"/></svg>`) });
const [ana, rui, eva, me] = [face('ana', '#2f9e5b'), face('rui', '#8250df'), face('eva', '#d9a82a'), face('me', '#888')];
writeFileSync(file, JSON.stringify({
  'acme/app#1': { state: 'OPEN', title: 'One', createdAt: ago(300), headRefOid: 'A', author: ana, reviews: { nodes: [{ author: rui, state: 'APPROVED', submittedAt: ago(30) }, { author: me, state: 'COMMENTED', submittedAt: ago(20) }] }, comments: { nodes: [] }, pushes: { nodes: [] }, asks: { nodes: [] }, reviewRequests: { nodes: [] } },
  'acme/app#2': { state: 'OPEN', title: 'Two', createdAt: ago(200), headRefOid: 'B', author: me, reviews: { nodes: [] }, comments: { nodes: [{ author: rui, createdAt: ago(10) }] },
    pushes: { nodes: [{ __typename: 'HeadRefForcePushedEvent', createdAt: ago(5), actor: eva }] }, asks: { nodes: [] }, reviewRequests: { nodes: [] } }
}));

export const meta = { server: true, fixture: 'auto', env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, FAKEGH_VIEWER: 'me' }, prefs: { statusBar: false } };   // the faces' row under the list: with the status bar on (the default since 2026-10-09) they are in the bar — status-bar.mjs

export default async function (ctx) {
  const out = {}, cwd = join(tmpdir(), 'peix-people', 'people-repo'), now = Date.now();
  const { chats } = makeFixture(ctx.fixture.dir, [
    { cwd, title: 'On one', prompt: 'look at https://github.com/acme/app/pull/1', reply: 'looked', at: new Date(now - 60_000) },
    { cwd, title: 'On two', prompt: 'look at https://github.com/acme/app/pull/2', reply: 'looked', at: new Date(now - 120_000) },
    { cwd, title: 'On none', prompt: 'no PR here', reply: 'none', at: new Date(now - 180_000) },
  ]);
  // the cards by the fixture's names (a chat on a PR is titled by it once GitHub answers)
  const names = Object.fromEntries(chats.map((c, i) => [c.id, ['On one', 'On two', 'On none'][i]]));
  const titles = () => ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#slist > .card')].map(c => c.dataset.id))`).then(JSON.parse).then(ids => ids.map(id => names[id]).filter(Boolean));
  const row = () => ctx.evaluate(`JSON.stringify({ hidden: document.querySelector('#people').hidden, on: document.querySelector('#people').classList.contains('on'),
    faces: [...document.querySelectorAll('#people button[data-login]')].map(b => b.dataset.login + (b.classList.contains('on') ? '*' : '')), ready: +document.querySelector('#fchips .fchip.ready .n').textContent })`).then(JSON.parse);
  const click = async login => { await ctx.evaluate(`document.querySelector('#people button[data-login="${login}"]').click()`); await ctx.sleep(100); await ctx.settle(); };

  // narrowed to the folder, so the fixture's own chats (and their PRs) stay out of it
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 5`, { what: 'the three chats and the fixture\'s two' });
  await ctx.key('KeyP');
  await ctx.evaluate(`(() => { const q = document.querySelector('#pickq'); q.value = 'people-repo'; q.dispatchEvent(new Event('input', { bubbles: true })); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 3 && document.querySelectorAll('#people button[data-login]').length === 3`, { what: 'the folder\'s chats, and the faces from their PRs', timeout: 10_000 });
  await ctx.settle();
  out.all = { ...(await row()), titles: await titles() };
  ctx.assert.deepEqual(out.all.faces, ['eva', 'rui', 'ana'], 'everyone in the view\'s PRs, you left out, the newest first');
  ctx.assert.equal(out.all.hidden, false);
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#people img').complete && document.querySelector('#people img').naturalWidth > 0`), true, 'their faces');
  const lr = await ctx.evaluate(`JSON.stringify((l => ({ list: Math.round(l.getBoundingClientRect().bottom), row: Math.round(document.querySelector('#people').getBoundingClientRect().top), foot: Math.round(document.querySelector('#shd').getBoundingClientRect().top) }))(document.querySelector('#slist')))`).then(JSON.parse);
  ctx.assert.ok(lr.row >= lr.list - 1 && lr.foot >= lr.row + 20, `the row is under the cards, over the list's row: ${JSON.stringify(lr)}`);
  await ctx.shot('all', { x: 0, y: 500, width: 400, height: 500 });

  await click('rui');
  await ctx.waitFor(`window.peix.state().person === 'rui'`, { what: 'rui chosen' });
  out.rui = { ...(await row()), titles: await titles() };
  ctx.assert.deepEqual(out.rui, { hidden: false, on: true, faces: ['eva', 'rui*', 'ana'], ready: 2, titles: ['On one', 'On two'] }, 'rui is in both PRs: those two chats, counted');
  await ctx.shot('rui', { x: 0, y: 500, width: 400, height: 500 });

  // GitHub's mark heads them, and folds them (2026-10-09): the count instead of the faces, but for the one the list is
  // narrowed to — the filter stays in sight; a pref; the mark again unfolds
  const fold = () => ctx.evaluate(`JSON.stringify((g => ({ github: !!g?.querySelector('svg path[d^="M8 0C3.58"]'), count: g?.querySelector('b')?.textContent || null, expanded: g?.getAttribute('aria-expanded') }))(document.querySelector('#people .pgh')))`).then(JSON.parse);
  ctx.assert.deepEqual(await fold(), { github: true, count: null, expanded: 'true' }, 'GitHub\'s mark first, unfolded');
  await ctx.evaluate(`document.querySelector('#people .pgh').click()`); await ctx.settle();
  out.folded = { ...(await row()), ...(await fold()), titles: await titles() };
  ctx.assert.deepEqual([out.folded.faces, out.folded.count, out.folded.expanded, out.folded.titles], [['rui*'], '3', 'false', ['On one', 'On two']], `folded: the count, rui's face alone, still narrowed: ${JSON.stringify(out.folded)}`);
  ctx.assert.equal(await ctx.peix('prefs().peopleFold'), true, 'and it is a pref');
  await ctx.shot('folded', { x: 0, y: 500, width: 400, height: 500 });
  await ctx.evaluate(`document.querySelector('#people .pgh').click()`); await ctx.settle();
  ctx.assert.deepEqual((await row()).faces, ['eva', 'rui*', 'ana'], 'the mark again: every face back');

  await click('ana');
  out.ana = { ...(await row()), titles: await titles() };
  ctx.assert.deepEqual([out.ana.faces, out.ana.titles, out.ana.ready], [['eva', 'rui', 'ana*'], ['On one'], 1], 'another face moves the filter');
  ctx.assert.equal((await ctx.peix('prefs()')).person, 'ana', 'and it is a pref');

  await click('ana');
  out.back = { ...(await row()), titles: await titles() };
  ctx.assert.deepEqual([out.back.on, out.back.titles.length, out.back.ready], [false, 3, 3], 'the same face again: every chat');

  await ctx.key('KeyB'); await ctx.settle();
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#people')).display`), 'none', 'no row on the rail');
  await ctx.key('KeyB');

  // the status bar on (2026-10-09): the faces are its middle, and still narrow the list
  await ctx.evaluate(`document.querySelector('#sbarOn').click()`);
  await ctx.settle();
  out.docked = await ctx.evaluate(`JSON.stringify((p => { const r = p.getBoundingClientRect(), b = document.querySelector('#sbar').getBoundingClientRect(); return { inBar: p.parentElement.id, mid: Math.abs((r.left + r.right) / 2 - (b.left + b.right) / 2) < b.width / 4, faces: p.querySelectorAll('button[data-login]').length }; })(document.querySelector('#people')))`).then(JSON.parse);
  ctx.assert.deepEqual([out.docked.inBar, out.docked.mid, out.docked.faces], ['sbPeople', true, 3], `in the bar's middle: ${JSON.stringify(out.docked)}`);
  await click('ana');
  ctx.assert.deepEqual(await titles(), ['On one'], 'a face there narrows the list as ever');
  await click('ana');
  await ctx.shot('docked', { x: 0, y: 880, width: 1700, height: 120 });
  await ctx.evaluate(`document.querySelector('#sbarOn').click()`);
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#people').parentElement.id`), 'sessions', 'the bar off: back under the list');
  return out;
}
