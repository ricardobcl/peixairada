// A round let go (2026-10-12). GitHub is the fake gh, answering from a file the scenario rewrites: a PR you reviewed,
// pushed to since — your move. What this checks: ⌥ held over the card's *your move* turns its tag red with an ✕;
// ⌥-click lets the round go — the line leaves the card, the PR's row under the header says *let go*, no alert, and the
// PR is asked about again and again (and through a restart) without coming back; the author's next push is a move as
// any other: the line back and one alert. The chat header's *your move* lets go the same way, and so does the card's
// right-click menu.
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from '../../lib/testserver.mjs';

const dir = tmpDir('peix-gh-'), file = join(dir, 'prs.json');
const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const user = login => ({ login, __typename: 'User', avatarUrl: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#8250df"/></svg>`) });
const commit = (at, login) => ({ __typename: 'PullRequestCommit', commit: { committedDate: at, author: { user: { login } } } });
/** acme/repo-a#12 by ana, reviewed by me an hour ago on commit A, and pushed to since (`head`, `pushes`). */
function write(head, pushes) {
  const pr = {
    state: 'OPEN', title: 'Base of the follow-up', createdAt: ago(300), headRefOid: head, author: user('ana'),
    viewerLatestReview: { submittedAt: ago(60), commit: { oid: 'A' } }, reviewRequests: { nodes: [] },
    reviews: { nodes: [{ author: user('me'), state: 'CHANGES_REQUESTED', submittedAt: ago(60) }] }, comments: { nodes: [] },
    pushes: { nodes: pushes.map(m => commit(ago(m), 'ana')) }, asks: { nodes: [] }
  };
  writeFileSync(file, JSON.stringify({ 'acme/repo-a#12': pr, 'acme/repo-a#13': { state: 'OPEN', title: 'The follow-up', author: user('ana') } }));
}
write('B', [120, 30]);

export const meta = {
  server: true, fixture: 'auto',
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, FAKEGH_VIEWER: 'me', PR_WATCH_MS: '500' }
};

export default async function (ctx) {
  const out = {};
  try {
    const [two] = ctx.fixture.chats;
    const card = `document.querySelector('#slist > .card[data-id="${two.id}"]')`;
    const turn = () => ctx.evaluate(`JSON.stringify(window.peix.session('${two.id}')?.prs?.find(p => p.url.endsWith('/pull/12'))?.turn || null)`).then(JSON.parse);
    const centre = sel => ctx.evaluate(`(r => r && ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))(document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect())`);
    const mouse = (type, p, alt) => ctx.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, modifiers: alt ? 1 : 0, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
    const altClick = async p => { await mouse('mouseMoved', p, true); await mouse('mousePressed', p, true); await mouse('mouseReleased', p, true); };
    const tag = sel => ctx.evaluate(`(t => t && JSON.stringify({ alt: document.documentElement.hasAttribute('data-alt'), bg: getComputedStyle(t).backgroundColor, ic: getComputedStyle(t.querySelector('.ic')).display,
      x: getComputedStyle(t, '::before').content, red: (p => { p.style.color = 'var(--needs)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; })(document.createElement('i')) }))(document.querySelector(${JSON.stringify(sel)}))`).then(JSON.parse);

    await ctx.waitFor(`${card}?.querySelector('.state.prmove')`, { timeout: 10_000, what: 'the PR at your move, on the card' });
    await ctx.evaluate(`(() => { window.__alerts = []; window.__es = new EventSource('/events'); window.__es.addEventListener('alert', e => window.__alerts.push(JSON.parse(e.data))); })()`);
    await ctx.waitFor(`window.__es.readyState === 1`, { what: 'a listener for the alerts' });
    await ctx.settle();
    // the line says so: the pointer resting on it shows the PR's rounds, the ⌥-click at their foot (2026-10-15; its tooltip before)
    const rest = await centre(`#slist > .card[data-id="${two.id}"] .state.prmove`);
    await mouse('mouseMoved', rest, false);
    await ctx.waitFor(`document.querySelector('#rpop.on .rpf')`, { what: 'the rounds under the pointer' });
    ctx.assert.match(await ctx.evaluate(`document.querySelector('#rpop .rpf').textContent`), /⌥-click “your move”: let this round go/, 'the line says so');

    // ⌥ held over the line: the tag in red, an ✕ for its mark; without ⌥, the tag as it is
    const line = `#slist > .card[data-id="${two.id}"] .state.prmove`, at = await centre(line);
    await mouse('mouseMoved', at, false); await ctx.settle();
    out.plain = await tag(`${line} .ymove`);
    await mouse('mouseMoved', { x: at.x + 1, y: at.y }, true); await ctx.settle();
    out.alt = await tag(`${line} .ymove`);
    ctx.assert.deepEqual([out.plain.alt, out.plain.ic, out.plain.x], [false, 'block', 'none'], `no ⌥: the tag as it is: ${JSON.stringify(out.plain)}`);
    ctx.assert.deepEqual([out.alt.alt, out.alt.ic, out.alt.bg], [true, 'none', out.alt.red], `⌥ over it: red, the mark an ✕: ${JSON.stringify(out.alt)}`);
    ctx.assert.notEqual(out.alt.x, 'none');
    await ctx.shot('1-alt-hover', await ctx.evaluate(`(r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))(${card}.getBoundingClientRect())`));

    // ⌥-click: the round let go
    await altClick(at);
    await ctx.waitFor(`!${card}.querySelector('.state.prmove')`, { what: 'the line gone from the card' });
    out.waived = await turn();
    ctx.assert.deepEqual([out.waived.you, out.waived.waived, out.waived.why], [false, true, 'pushed since your review']);
    await ctx.openChat(two.id);
    await ctx.waitFor(`document.querySelector('#prlist .prrow[data-url$="/pull/12"] .why.let')`, { what: 'the PR row saying let go' });
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#prlist .prrow[data-url$="/pull/12"] .why.let').textContent`), 'let go · pushed since your review');
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#shead .hmove')`), null, 'nor in the chat header');

    // asked about again and again, and through a restart: still let go, and nothing said
    await ctx.sleep(2500);
    ctx.assert.equal((await turn()).waived, true, 'the same round, polled');
    await ctx.server.restart();
    await ctx.reload();
    await ctx.waitFor(`window.peix.session('${two.id}')?.prs?.find(p => p.url.endsWith('/pull/12'))?.turn?.waived === true`, { timeout: 10_000, what: 'let go after a restart' });
    await ctx.evaluate(`(() => { window.__alerts = []; window.__es = new EventSource('/events'); window.__es.addEventListener('alert', e => window.__alerts.push(JSON.parse(e.data))); })()`);
    await ctx.waitFor(`window.__es.readyState === 1`, { what: 'the listener again' });
    await ctx.sleep(1500);
    ctx.assert.equal(await ctx.evaluate(`${card}.querySelector('.state.prmove')`), null, 'no line after the restart');

    // ana pushes again: the next move — the line back, and one alert
    write('C', [120, 30, 0]);
    await ctx.waitFor(`${card}?.querySelector('.state.prmove') && window.__alerts.length > 0`, { timeout: 10_000, what: 'the next move, and its alert' });
    out.alerts = await ctx.evaluate(`JSON.stringify(window.__alerts)`).then(JSON.parse);
    ctx.assert.deepEqual(out.alerts.map(a => [a.kind, a.heading, a.sessionId]), [['pr', 'Your move · repo-a#12', two.id]], 'one alert');
    ctx.assert.equal((await turn()).waived, undefined, 'the mark gone with the move');

    // the chat header's *your move* lets go the same way
    await ctx.openChat(two.id);
    await ctx.waitFor(`document.querySelector('#shead .hmove')`, { what: 'the header saying your move' });
    await ctx.settle();
    const head = await centre('#shead .hmove');
    await mouse('mouseMoved', head, true); await ctx.settle();
    ctx.assert.equal((await tag('#shead .hmove .ymove')).ic, 'none', 'the ✕ in the header too');
    await ctx.shot('2-header-alt-hover');
    await altClick(head);
    await ctx.waitFor(`!document.querySelector('#shead .hmove') && !${card}.querySelector('.state.prmove')`, { what: 'let go from the header' });
    ctx.assert.equal((await turn()).waived, true);
    ctx.assert.equal(await ctx.evaluate(`window.__alerts.length`), 1, 'and nothing more said');

    // …and the card's right-click menu, once ana pushes yet again
    write('D', [120, 30, 0, 0]);
    await ctx.waitFor(`${card}?.querySelector('.state.prmove') && window.__alerts.length === 2`, { timeout: 10_000, what: 'the move after that' });
    await ctx.settle();
    await ctx.evaluate(`(c => c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: c.getBoundingClientRect().left + 40, clientY: c.getBoundingClientRect().top + 20 })))(${card}.querySelector('.title') || ${card})`);
    await ctx.waitFor(`document.querySelector('#ctxm').open`, { what: 'the card\'s menu' });
    await ctx.evaluate(`[...document.querySelectorAll('#ctxm button')].find(b => b.textContent === 'Let this round of your move go').click()`);
    await ctx.waitFor(`!${card}.querySelector('.state.prmove')`, { what: 'let go from the menu' });
    ctx.assert.equal((await turn()).waived, true);
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
