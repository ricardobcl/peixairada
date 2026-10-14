// The people row (2026-09-29). Three chats: one on a PR ana wrote
// and rui approved, one on a PR rui commented on and eva pushed to, one on no PR. GitHub is the fake gh; the faces are
// data: images, so nothing is fetched. What this checks: the faces are folded behind GitHub's mark to begin with, and
// the mark unfolds them; the row in the status bar holds everyone in the view's PRs — you left out — once each, the
// newest first; a face narrows the list, its counts and the chips to that person's chats and rings the face, and keeps
// it folded; another face moves the filter; the same face again lets go; the choice is a pref; folded, the fish's lane
// takes the room the faces had.
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

export const meta = { server: true, fixture: 'auto', env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, FAKEGH_VIEWER: 'me' } };

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
    faces: [...document.querySelectorAll('#people button[data-login]')].map(b => b.dataset.login + (b.classList.contains('on') ? '*' : '')), ready: +(document.querySelector('#slist > .gsep.lane.ready b')?.textContent || 0) })`).then(JSON.parse);   // the Ready lane's count (the chip's until 2026-10-11, later)
  const click = async login => { await ctx.evaluate(`document.querySelector('#people button[data-login="${login}"]').click()`); await ctx.sleep(100); await ctx.settle(); };

  // narrowed to the folder, so the fixture's own chats (and their PRs) stay out of it
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 5`, { what: 'the three chats and the fixture\'s two' });
  await ctx.key('KeyP');
  await ctx.evaluate(`(() => { const q = document.querySelector('#pickq'); q.value = 'people-repo'; q.dispatchEvent(new Event('input', { bubbles: true })); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`);
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 3 && document.querySelectorAll('#people button[data-login]').length === 3`, { what: 'the folder\'s chats, and the faces from their PRs', timeout: 10_000 });
  await ctx.settle();

  // GitHub's mark heads them and folds them (2026-10-11, later; off by default, and a count beside the mark, from
  // 2026-10-09): folded to begin with — the mark alone, no face seen — and the mark unfolds them, a pref
  const fold = () => ctx.evaluate(`JSON.stringify((p => ({ folded: p.classList.contains('compact'), github: !!p.querySelector('.pgh svg path[d^="M8 0C3.58"]'), expanded: p.querySelector('.pgh')?.getAttribute('aria-expanded'),
    shown: [...p.querySelectorAll('button[data-login]')].filter(b => b.getClientRects().length).map(b => b.dataset.login + (b.classList.contains('on') ? '*' : '')) }))(document.querySelector('#people')))`).then(JSON.parse);
  const mark = async () => { await ctx.evaluate(`document.querySelector('#people .pgh').click()`); await ctx.sleep(50); await ctx.settle(); };
  out.folded = await fold();
  ctx.assert.deepEqual(out.folded, { folded: true, github: true, expanded: 'false', shown: [] }, `folded to begin with: ${JSON.stringify(out.folded)}`);
  await ctx.shot('folded', { x: 0, y: 880, width: 1700, height: 120 });
  await mark();
  out.unfolded = await fold();
  ctx.assert.deepEqual(out.unfolded, { folded: false, github: true, expanded: 'true', shown: ['eva', 'rui', 'ana'] }, `the mark unfolds them: ${JSON.stringify(out.unfolded)}`);
  ctx.assert.equal(await ctx.peix('prefs().peopleCompact'), false, 'and it is a pref');

  out.all = { ...(await row()), titles: await titles() };
  ctx.assert.deepEqual(out.all.faces, ['eva', 'rui', 'ana'], 'everyone in the view\'s PRs, you left out, the newest first');
  ctx.assert.equal(out.all.hidden, false);
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#people img').complete && document.querySelector('#people img').naturalWidth > 0`), true, 'their faces');
  await ctx.shot('all', { x: 0, y: 880, width: 1700, height: 120 });

  await click('rui');
  await ctx.waitFor(`window.peix.state().person === 'rui'`, { what: 'rui chosen' });
  out.rui = { ...(await row()), titles: await titles() };
  ctx.assert.deepEqual(out.rui, { hidden: false, on: true, faces: ['eva', 'rui*', 'ana'], ready: 2, titles: ['On one', 'On two'] }, 'rui is in both PRs: those two chats, counted');
  await ctx.shot('rui', { x: 0, y: 880, width: 1700, height: 120 });

  // folded while narrowed: the face the list is narrowed to stays in sight, the list still narrowed; unfolded again
  await mark();
  out.narrowFolded = { ...(await fold()), titles: await titles() };
  ctx.assert.deepEqual([out.narrowFolded.folded, out.narrowFolded.shown, out.narrowFolded.titles], [true, ['rui*'], ['On one', 'On two']], `folded, rui's face kept: ${JSON.stringify(out.narrowFolded)}`);
  await ctx.shot('folded-rui', { x: 0, y: 880, width: 1700, height: 120 });
  await mark();
  ctx.assert.deepEqual((await fold()).shown, ['eva', 'rui*', 'ana'], 'the mark again: every face');

  await click('ana');
  out.ana = { ...(await row()), titles: await titles() };
  ctx.assert.deepEqual([out.ana.faces, out.ana.titles, out.ana.ready], [['eva', 'rui', 'ana*'], ['On one'], 1], 'another face moves the filter');
  // the funnel counts what the list would show (2026-10-14): the face narrowing it, and a query, as the list does
  const funnel = async () => { await ctx.evaluate(`document.querySelector('#fBtn').click()`); await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: "the funnel's menu" });
    const m = await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].map(b => b.textContent).filter(t => /^(Your move|New replies)\\d+$/.test(t))`);
    await ctx.evaluate(`document.querySelector('#ctxm').close()`); await ctx.sleep(200); return m; };
  out.funnelAna = await funnel();
  ctx.assert.deepEqual(out.funnelAna, ['Your move0', 'New replies0'], `with ana's face, the funnel counts ana's chats alone: ${JSON.stringify(out.funnelAna)}`);
  ctx.assert.equal((await ctx.peix('prefs()')).person, 'ana', 'and it is a pref');

  await click('ana');
  out.back = { ...(await row()), titles: await titles() };
  ctx.assert.deepEqual([out.back.on, out.back.titles.length, out.back.ready], [false, 3, 3], 'the same face again: every chat');
  ctx.assert.deepEqual(await funnel(), ['Your move1', 'New replies0'], "every chat: On two's PR at your move");
  await ctx.fill('#q', 'zzqqxx');
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 0`, { what: 'a query matching nothing' });
  out.funnelQuery = await funnel();
  ctx.assert.deepEqual(out.funnelQuery, ['Your move0', 'New replies0'], `…and none under a query that leaves no chat: ${JSON.stringify(out.funnelQuery)}`);
  await ctx.fill('#q', '');
  await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 3`, { what: 'every chat again' });

  // in the status bar (2026-10-09; under the list's cards with the bar off, until it was always there, 2026-10-14) — since
  // 2026-10-11, later, after the left's segments and before the fish's lane, which takes the bar's free room
  await ctx.settle();
  out.docked = await ctx.evaluate(`JSON.stringify((p => { const r = p.getBoundingClientRect(), f = document.querySelector('#sbSwim').getBoundingClientRect(), l = document.querySelector('#sbLeft').getBoundingClientRect(); return { inBar: p.parentElement.id, placed: r.left >= l.right - 1 && r.right <= f.left + 1 && f.width > 200, faces: p.querySelectorAll('button[data-login]').length }; })(document.querySelector('#people')))`).then(JSON.parse);
  ctx.assert.deepEqual([out.docked.inBar, out.docked.placed, out.docked.faces], ['sbPeople', true, 3], `before the fish's wide lane: ${JSON.stringify(out.docked)}`);
  await click('ana');
  ctx.assert.deepEqual(await titles(), ['On one'], 'a face there narrows the list as ever');
  await click('ana');
  await ctx.shot('docked', { x: 0, y: 880, width: 1700, height: 120 });
  // folded there, the faces' room is the fish's: the lane grows by it, the mark alone before it — and the mark stays put
  const lane = () => ctx.evaluate(`Math.round(document.querySelector('#sbSwim').getBoundingClientRect().width)`), at = () => ctx.evaluate(`Math.round(document.querySelector('#people .pgh').getBoundingClientRect().left)`);
  const wide = await lane(), was = await at();
  await mark();
  out.barFolded = { ...(await fold()), lane: [wide, await lane()], mark: [was, await at()], people: await ctx.evaluate(`Math.round(document.querySelector('#sbPeople').getBoundingClientRect().width)`) };
  ctx.assert.deepEqual([out.barFolded.folded, out.barFolded.shown], [true, []], 'folded in the bar: no face');
  ctx.assert.ok(out.barFolded.lane[1] >= out.barFolded.lane[0] + 3 * 18 && out.barFolded.people < 50, `the fish takes the faces' room: ${JSON.stringify(out.barFolded)}`);
  ctx.assert.equal(out.barFolded.mark[1], out.barFolded.mark[0], 'GitHub\'s mark where it was');
  await ctx.shot('docked-folded', { x: 0, y: 880, width: 1700, height: 120 });
  return out;
}
