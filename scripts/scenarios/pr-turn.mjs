// A PR come round to you (2026-09-28, Ricardo: "me knowing that a chat with PRs where I asked for review or left a
// review was already addressed, by pushed to the branch, or replies on the PR"). GitHub is the fake gh, answering from
// a file the scenario rewrites. What this checks: a PR you reviewed and wait on is an outlined chip that says so in its
// tooltip; ticked, the chat is done; the author pushing un-ticks it by the PR's own watch — the chat is not touched —,
// fills the chip, and sends one alert with the server's heading, a banner in a browser; the header's chip is filled and
// its row says why; a second tick holds, and holds through a restart (the board remembers when it learnt of the move);
// your next review hands the PR back and the chip empties.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'peix-gh-')), file = join(dir, 'prs.json');
const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const user = login => ({ login, __typename: 'User' });
const commit = (at, login) => ({ __typename: 'PullRequestCommit', commit: { committedDate: at, author: { user: { login } } } });
/** acme/repo-a#12 by ana, reviewed by me an hour ago on commit A; `o` moves it. #13 nobody here has touched. */
function write(o = {}) {
  const base = {
    state: 'OPEN', title: 'Base of the follow-up', createdAt: ago(300), headRefOid: 'A', author: user('ana'),
    viewerLatestReview: { submittedAt: ago(60), commit: { oid: 'A' } }, reviewRequests: { nodes: [] },
    reviews: { nodes: [{ author: user('me'), state: 'CHANGES_REQUESTED', submittedAt: ago(60) }] }, comments: { nodes: [] },
    pushes: { nodes: [commit(ago(120), 'ana')] }, asks: { nodes: [] }
  };
  writeFileSync(file, JSON.stringify({ 'acme/repo-a#12': { ...base, ...o }, 'acme/repo-a#13': { state: 'OPEN', title: 'The follow-up', author: user('ana') } }));
}
write();

export const meta = {
  server: true, fixture: 'auto',
  // the watch at under a second, so the registry poll (1.2 s here) asks every time
  env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: file, FAKEGH_VIEWER: 'me', PR_WATCH_MS: '500' }
};

export default async function (ctx) {
  const out = {};
  try {
    const [two] = ctx.fixture.chats;
    const card = `document.querySelector('#slist > .card[data-id="${two.id}"]')`;
    const chip = n => `${card}?.querySelector('.cpr[data-url$="/pull/${n}"]')`;
    const look = () => ctx.evaluate(`JSON.stringify({ done: window.peix.session('${two.id}').done, cls: ${card}?.className.trim().split(/\\s+/),
      turn12: ${chip(12)}?.dataset.turn, turn13: ${chip(13)}?.dataset.turn, tip12: ${chip(12)}?.title, bg12: ${chip(12)} && getComputedStyle(${chip(12)}).backgroundColor,
      badge: ${card}?.querySelector('.badge')?.textContent || null })`).then(JSON.parse);
    const tick = done => ctx.server.post(`api/sessions/${two.id}/done`, { done });

    await ctx.waitFor(`${chip(12)}?.dataset.turn === 'them'`, { timeout: 10_000, what: 'the reviewed PR waiting on its author' });
    out.waiting = await look();
    ctx.assert.equal(out.waiting.turn13, '', 'a PR nobody here touched has no turn');
    ctx.assert.match(out.waiting.tip12, /waiting on ana/, 'the tooltip says whom it waits on');
    ctx.assert.equal(out.waiting.bg12, 'rgba(0, 0, 0, 0)', 'waiting on them: an outlined chip');

    // a browser that has granted notifications, faked so the banners are counted; a second listener sees every alert
    await ctx.evaluate(`(() => {
      window.__banners = []; window.__alerts = [];
      window.Notification = class { static permission = 'granted'; static requestPermission() { return Promise.resolve('granted'); }
        constructor(title, o) { window.__banners.push({ title, body: o?.body || '' }); } close() {} };
      window.__es = new EventSource('/events'); window.__es.addEventListener('alert', e => window.__alerts.push(JSON.parse(e.data)));
    })()`);
    await ctx.waitFor(`window.__es.readyState === 1`, { what: 'the second listener' });

    await tick(true);
    await ctx.waitFor(`window.peix.session('${two.id}').done === true`, { what: 'the chat ticked done' });
    await ctx.sleep(2500);   // two watches of the PR, and nothing moved
    ctx.assert.equal((await look()).done, true, 'waiting on them, the tick holds');

    // ana pushes: the head is no longer the commit my review was on
    write({ headRefOid: 'B', pushes: { nodes: [commit(ago(120), 'ana'), commit(ago(1), 'ana')] } });
    await ctx.waitFor(`window.peix.session('${two.id}').done === false`, { timeout: 10_000, what: 'the push to un-tick the chat' });
    await ctx.waitFor(`${chip(12)}?.dataset.turn === 'you' && window.__alerts.length > 0`, { what: 'the chip filled and the alert' });
    await ctx.settle();
    out.moved = await look();
    out.alerts = await ctx.evaluate(`JSON.stringify(window.__alerts)`).then(JSON.parse);
    out.banners = await ctx.evaluate(`JSON.stringify(window.__banners)`).then(JSON.parse);
    ctx.assert.ok(!out.moved.cls.includes('done'), 'the card is not done any more');
    ctx.assert.match(out.moved.tip12, /your move — pushed since your review/);
    ctx.assert.notEqual(out.moved.bg12, 'rgba(0, 0, 0, 0)', 'your move: a filled chip');
    ctx.assert.equal(out.alerts.length, 1, 'one alert');
    ctx.assert.deepEqual([out.alerts[0].kind, out.alerts[0].heading, out.alerts[0].snippet, out.alerts[0].sessionId], ['pr', 'Your move · repo-a#12', 'pushed since your review', two.id]);
    ctx.assert.equal(out.banners[0]?.title, 'Your move · repo-a#12', 'the banner wears the server\'s heading');
    ctx.assert.equal(out.moved.badge, '1', 'and the card counts it unread');
    await ctx.shot('1-card', await ctx.evaluate(`(r => ({ x: r.left, y: r.top - 4, width: r.width, height: r.height + 8 }))(${card}.getBoundingClientRect())`));

    // the chat: the header's chip filled, its row saying why
    await ctx.openChat(two.id);
    await ctx.evaluate(`document.querySelector('#prToggle').click()`);
    await ctx.waitFor(`document.querySelector('#prlist .prrow[data-turn="you"] .why')`, { what: 'the PR row saying why' });
    await ctx.settle();
    out.head = await ctx.evaluate(`JSON.stringify({ chip: document.querySelector('#prToggle .hpr[data-turn="you"]')?.textContent,
      bg: getComputedStyle(document.querySelector('#prToggle .hpr[data-turn="you"]')).backgroundImage,
      why: document.querySelector('#prlist .prrow[data-turn="you"] .why').textContent })`).then(JSON.parse);
    ctx.assert.equal(out.head.chip, '#12');
    ctx.assert.equal(out.head.bg, 'none', 'the header\'s chip drops its wash for the fill');
    ctx.assert.equal(out.head.why, 'your move · pushed since your review');
    await ctx.shot('2-header', await ctx.evaluate(`(r => ({ x: r.left, y: 0, width: r.width, height: 110 }))(document.querySelector('#chat').getBoundingClientRect())`));

    // ticked again, having seen it: it holds — and through a restart, where the board has to remember when it learnt
    await tick(true);
    await ctx.waitFor(`window.peix.session('${two.id}').done === true`, { what: 'ticked again' });
    await ctx.sleep(2500);
    ctx.assert.equal((await look()).done, true, 'the move already seen does not un-tick it again');
    await ctx.server.restart();
    await ctx.send('Page.reload'); await ctx.sleep(800);
    await ctx.waitFor(`window.peix.session('${two.id}')?.prs?.find(p => p.url.endsWith('/pull/12'))?.turn?.you === true`, { timeout: 10_000, what: 'the PR asked about after the restart' });
    await ctx.sleep(1500);
    ctx.assert.equal((await look()).done, true, 'after a restart the tick still holds');

    // my next review, on the new head: back with ana, the chip empties, the chat stays done
    write({ headRefOid: 'B', pushes: { nodes: [commit(ago(1), 'ana')] }, viewerLatestReview: { submittedAt: ago(0), commit: { oid: 'B' } },
      reviews: { nodes: [{ author: user('me'), state: 'APPROVED', submittedAt: ago(0) }] } });
    await ctx.waitFor(`${chip(12)}?.dataset.turn === 'them'`, { timeout: 10_000, what: 'the PR handed back' });
    out.back = await look();
    ctx.assert.equal(out.back.done, true, 'still done');
    ctx.assert.equal(out.back.bg12, 'rgba(0, 0, 0, 0)', 'an outlined chip again');
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
