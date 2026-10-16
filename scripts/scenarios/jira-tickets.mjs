// Jira tickets as PRs are (2026-10-08). Jira is the fake (scripts/fakejira.mjs), its token in the server's environment;
// a chat names ACME-12 (in progress, yours), OPS-7 (done) and UTF-8 (no project of the site's). What this checks: the
// Setup's Jira section takes the site and the login and says who you are; the card wears its tickets in their
// status's colours as a stack, as its PRs are (2026-10-11; the first and a count before), fanned under the pointer;
// the chat header has them among its chips, and its rows under it; nothing of UTF-8.
import { startFakeJira } from '../fakejira.mjs';
import { makeFixture } from '../fixture.mjs';

const jira = await startFakeJira({ projects: ['ACME', 'OPS'], issues: {
  'ACME-12': { summary: 'Fees for the new market', status: 'In Progress', cat: 'indeterminate', type: 'Story', assignee: 'me' },
  'OPS-7': { summary: 'Rotate the keys', status: 'Done', cat: 'done', assignee: 'Ana' },
} });

export const meta = { server: true, fixture: 'auto', env: { JIRA_API_TOKEN: jira.token } };

export default async function (ctx) {
  const out = {};
  try {
    const { chats: [c] } = makeFixture(ctx.fixture.dir, [{ cwd: process.cwd(), at: new Date(Date.now() - 30_000), title: 'Fees work',
      prompt: 'Pick up ACME-12 — and OPS-7 is done. UTF-8 everywhere.', reply: 'On ACME-12 now; OPS-7 was closed last week.' }]);
    const card = `document.querySelector('#slist > .card[data-id="${c.id}"]')`;
    await ctx.waitFor(`!!${card}`, { what: 'the chat\'s card' });
    ctx.assert.equal(await ctx.evaluate(`${card}.querySelectorAll('.ctk').length`), 0, 'no site set up, no tickets');

    // Settings › Jira: the site and the login; the token is the environment's, and the line says who Jira says you are
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
    await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="jira"]').click()`);
    await ctx.waitFor(`!!document.querySelector('#jiraSet .sjsite')`, { what: 'the Jira pane' });
    const set = (sel, value) => ctx.evaluate(`(() => { const x = document.querySelector('#jiraSet ${sel}'); x.value = ${JSON.stringify(value)}; x.dispatchEvent(new Event('input', { bubbles: true })); x.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await set('.sjsite', jira.url);
    await set('.sjmail', jira.email);
    await ctx.waitFor(`/Signed in as/.test(document.querySelector('#jiraSet .sjst')?.textContent || '')`, { timeout: 10_000, what: 'signed in, said in the Setup' });
    out.setup = await ctx.evaluate(`JSON.stringify({ line: document.querySelector('#jiraSet .sjst').textContent, token: document.querySelector('#jiraSet .sjtok').placeholder })`).then(JSON.parse);
    ctx.assert.match(out.setup.line, /Signed in as Me Myself/);
    ctx.assert.match(out.setup.token, /JIRA_API_TOKEN/, 'the token box says where the token is');
    ctx.assert.equal((await ctx.server.api('api/config')).body.jira.site, jira.url, 'the site in the setup');
    await ctx.settle();
    await ctx.shot('1-setup', await ctx.evaluate(`(r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))(document.querySelector('#settings').getBoundingClientRect())`));
    await ctx.evaluate(`document.querySelector('#settingsClose').click()`);

    // The card: a stack of its tickets, the branch's or the last named on top in its status's colour, no count
    await ctx.waitFor(`${card}?.querySelector('.ctk')?.dataset.cat === 'doing' && ${card}.querySelectorAll('.ctk').length === 2`, { timeout: 10_000, what: 'the tickets on the card' });
    out.card = await ctx.evaluate(`JSON.stringify((t => ({ key: t.textContent, cat: t.dataset.cat, url: t.dataset.url, keys: [...t.parentElement.children].map(x => x.textContent), stack: t.parentElement.className, more: !!${card}.querySelector('.more'), bg: getComputedStyle(t).backgroundColor, tip: t.title }))(${card}.querySelector('.ctk')))`).then(JSON.parse);
    ctx.assert.deepEqual([out.card.key, out.card.keys, out.card.stack, out.card.more, out.card.url], ['ACME-12', ['ACME-12', 'OPS-7'], 'tprs ttks', false, `${jira.url}/browse/ACME-12`]);
    ctx.assert.match(out.card.tip, /Fees for the new market[\s\S]*In Progress[\s\S]*yours/, 'the top one\'s tooltip is its own');
    const fan = () => ctx.evaluate(`JSON.stringify([...${card}.querySelectorAll('.ctk')].map(t => { const r = t.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), getComputedStyle(t).color]; }))`).then(JSON.parse);
    await ctx.settle();
    out.stacked = await fan();
    ctx.assert.ok(out.stacked[1][0] < out.stacked[0][0] && out.stacked[1][1] > out.stacked[0][0], `stacked: OPS-7 under ACME-12, a sliver of it showing — ${JSON.stringify(out.stacked)}`);
    const at = await ctx.evaluate(`(r => ({ x: r.right - 8, y: r.top + r.height / 2 }))(${card}.querySelector('.ctk').getBoundingClientRect())`);
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
    await ctx.sleep(450); await ctx.settle();
    out.fanned = await fan();
    ctx.assert.ok(out.fanned[1][1] <= out.fanned[0][0] + 1, `fanned under the pointer, side by side — ${JSON.stringify(out.fanned)}`);
    await ctx.shot('2-card-fanned', await ctx.evaluate(`(r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))(${card}.getBoundingClientRect())`));
    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 900 });
    ctx.assert.notEqual(out.card.bg, 'rgba(0, 0, 0, 0)', 'solid, in its colour');
    await ctx.settle();
    await ctx.shot('2-card', await ctx.evaluate(`(r => ({ x: r.left, y: r.top, width: r.width, height: r.height }))(${card}.getBoundingClientRect())`));

    // The header: among the chips, after the PRs; the rows under it
    await ctx.openChat(c.id);
    await ctx.waitFor(`document.querySelectorAll('#shead .hpr.tk').length === 2`, { what: 'the header\'s ticket chips' });
    out.head = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#shead .hpr.tk')].map(e => [e.textContent, e.dataset.cat]))`).then(JSON.parse);
    ctx.assert.deepEqual(out.head, [['ACME-12', 'doing'], ['OPS-7', 'done']]);
    await ctx.evaluate(`document.querySelector('#prToggle').click()`);
    await ctx.waitFor(`!document.querySelector('#prlist').hidden`, { what: 'the rows' });
    out.rows = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#prlist .prrow.tk')].map(e => [e.querySelector('.st').textContent, e.querySelector('.num').textContent, e.querySelector('.t').textContent, e.querySelector('.who').textContent]))`).then(JSON.parse);
    ctx.assert.deepEqual(out.rows, [['In Progress', 'ACME-12', 'Fees for the new market', 'yours'], ['Done', 'OPS-7', 'Rotate the keys', 'Ana']]);
    await ctx.settle();
    await ctx.shot('3-header', { x: 380, y: 0, width: 1320, height: 140 });
    ctx.assert.ok(!jira.bulk.flat().includes('UTF-8'), 'UTF-8 was never asked: no project of the site\'s');
    await ctx.evaluate(`document.querySelector('#prToggle').click()`);
  } finally { await jira.close(); }
  return out;
}
