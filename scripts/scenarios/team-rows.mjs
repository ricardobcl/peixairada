// An agent team under its lead (2026-10-31, round XIV's I9): a lead chat whose claude runs with three teammates — one
// at work, one done, one only the roster knows yet — and a chat whose team is itself alone. What this checks: the lead's
// card has a row per teammate, by name, its state in words and its last line (the tool it calls, what it said); the
// other card none; a teammate's next step changes its row and keeps the card's node (filled after the render, as the
// live line is); compact cards keep the rows, compact's same height hides them. Shots in tiles and the sidebar, dark and
// light.
import { spawn } from 'node:child_process';
import { appendFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, teamFiles } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'large' } };

const rows = (ctx, id) => ctx.evaluate(`[...document.querySelectorAll('#slist > .card[data-id="${id}"] .team .tm')].map(r => ({
  name: r.querySelector(':scope > b').textContent, state: r.dataset.state, said: r.querySelector('.ts').textContent, last: r.querySelector('.tl')?.textContent || '' }))`);

export default async function (ctx) {
  const out = {}, now = Date.now(), root = realpathSync(tmpDir('peix-team-'));
  const sleeps = [0, 1].map(() => spawn('sleep', ['300'], { stdio: 'ignore' }));
  const live = i => ({ pid: sleeps[i].pid, startedAt: now - 3600_000 });
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd: join(root, 'storefront'), title: 'Review the payments stack', prompt: 'review the payments stack as a team', reply: 'Three teammates on it.', at: new Date(now - 300_000), live: live(0) },
      { cwd: join(root, 'billing-api'), title: 'Queue for invoice webhooks', prompt: 'queue the invoice webhooks', reply: 'Queued them.', at: new Date(now - 400_000), live: live(1) },
    ]);
    const [lead, alone] = chats;
    const { sub } = teamFiles({ dir: ctx.fixture.dir, lead, also: ['scribe'], mates: [
      { name: 'reviewer', summary: 'Review PR 482', work: 'Run the payment tests' },
      { name: 'tester', summary: 'Test the retry path', said: 'All `12` retry tests pass on the new client.' },
    ] });
    teamFiles({ dir: ctx.fixture.dir, lead: alone, mates: [] });

    await ctx.waitFor(`document.querySelectorAll('#slist > .card[data-id="${lead.id}"] .team .tm').length === 3`, { what: 'the lead’s three rows', timeout: 20000 });
    await ctx.settle();
    out.rows = await rows(ctx, lead.id);
    ctx.assert.deepEqual(out.rows.map(r => [r.name, r.state, r.said]), [['reviewer', 'work', 'at work'], ['scribe', 'joined', 'joined'], ['tester', 'done', 'done']]);
    ctx.assert.equal(out.rows[0].last, 'Bash Run the payment tests', 'at work: the tool it calls');
    ctx.assert.match(out.rows[2].last, /All 12 retry tests pass/, 'done: what it said');
    ctx.assert.equal(await ctx.evaluate(`!!document.querySelector('#slist > .card[data-id="${alone.id}"] .team')`), false, 'a team of the lead alone: no rows');
    ctx.assert.match(await ctx.evaluate(`document.querySelector('#slist > .card[data-id="${lead.id}"] .team').textContent`), /^Its team: /, 'said for a screen reader');
    await ctx.shot('team-rows-tiles-dark');

    // the reviewer takes its next step, still at work: its row changes, the card's node stays
    await ctx.evaluate(`document.querySelector('#slist > .card[data-id="${lead.id}"]')._mark = 1`);
    const tf = readdirSync(sub).find(n => n.includes('areviewer-') && n.endsWith('.jsonl'));
    appendFileSync(join(sub, tf), JSON.stringify({ isSidechain: true, type: 'assistant', timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_t2', name: 'Read', input: { file_path: join(root, 'storefront', 'src', 'retry.ts') } }], stop_reason: 'tool_use' } }) + '\n');
    await ctx.waitFor(`[...document.querySelectorAll('#slist > .card[data-id="${lead.id}"] .team .tm')].some(r => r.textContent.includes('reviewer') && r.textContent.includes('retry.ts'))`, { what: 'the reviewer\u2019s next step' });
    out.kept = await ctx.evaluate(`document.querySelector('#slist > .card[data-id="${lead.id}"]')._mark === 1`);
    ctx.assert.equal(out.kept, true, 'the card’s node kept');
    out.reviewer = (await rows(ctx, lead.id)).find(r => r.name === 'reviewer');
    ctx.assert.match(out.reviewer.last, /^Read src\/retry\.ts$/, "a path in the chat's folder from there");

    // compact keeps them; compact's same height does not
    await ctx.evaluate(`document.querySelector('#sessions').dataset.cards = 'compact'`);
    ctx.assert.notEqual(await ctx.evaluate(`getComputedStyle(document.querySelector('#slist > .card[data-id="${lead.id}"] .team')).display`), 'none', 'shown on a compact card');
    await ctx.evaluate(`document.querySelector('#sessions').dataset.even = ''`);
    ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#slist > .card[data-id="${lead.id}"] .team')).display`), 'none', 'not at one height');
    await ctx.evaluate(`delete document.querySelector('#sessions').dataset.even; document.querySelector('#sessions').dataset.cards = 'large'`);

    for (const [layout, scheme] of [['sidebar', 'dark'], ['sidebar', 'light'], ['tiles', 'light']]) {
      await ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
      await ctx.evaluate(`localStorage.setItem('peixairada-prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('peixairada-prefs') || '{}'), layout: '${layout}' }))`);
      await ctx.reload();
      await ctx.openChat(lead.id);
      await ctx.waitFor(`document.querySelectorAll('#slist > .card[data-id="${lead.id}"] .team .tm').length === 3`, { what: `the rows in ${layout}, ${scheme}` });
      await ctx.settle();
      out[`${layout}-${scheme}`] = await ctx.evaluate(`(t => { const r = t.getBoundingClientRect(), c = t.closest('.card').getBoundingClientRect(); return { inside: r.left >= c.left - .5 && r.right <= c.right + .5 && r.bottom <= c.bottom + .5, h: Math.round(r.height) }; })(document.querySelector('#slist > .card[data-id="${lead.id}"] .team'))`);
      ctx.assert.equal(out[`${layout}-${scheme}`].inside, true, `the rows inside the card in ${layout}`);
      await ctx.shot(`team-rows-${layout}-${scheme}`);
    }
    return out;
  } finally { for (const s of sleeps) s.kill(); }
}
