// The cog's card slider (2026-09-25, Ricardo: "compact the cards by 1) [large] as is 2) [medium] leave the last
// interaction, either me or claude and 3) [compact] remove both … make it a slider"). Three chats: one Claude had the
// last word on, one you had — a second prompt, then Escape, so the reply on its card is the turn before's —, and one
// waiting on your answer. What is checked: large shows both words on every card; medium the last one only, yours or
// Claude's as the case is; compact neither, the cards shorter each step; the question stays at every size; the
// slider and its stop names both move it; and the choice outlives a reload.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFixture } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

// Per card: which words show (display, not markup — the markup always holds both), the question line, the height.
const cards = ctx => ctx.evaluate(`JSON.stringify(Object.fromEntries([...document.querySelectorAll('#slist > .card')].map(c => [c.querySelector('.title').textContent, {
  words: [...c.querySelectorAll('.snip')].filter(x => getComputedStyle(x).display !== 'none').map(x => (x.classList.contains('you') ? 'you: ' : 'claude: ') + x.textContent.trim()),
  ask: !!c.querySelector('.state.needs-input') && getComputedStyle(c.querySelector('.state.needs-input')).display !== 'none',
  h: Math.round(c.getBoundingClientRect().height),
}])))`).then(JSON.parse);
const slider = ctx => ctx.evaluate(`({ v: document.querySelector('#cardsSize').value, list: document.querySelector('#sessions').dataset.cards, on: document.querySelector('#settings .dens .stops .on')?.textContent || null })`);

export default async function (ctx) {
  const out = {};
  const cwd = join(tmpdir(), 'peix-card-sizes', 'sizes-repo');
  const sleeper = spawn('sleep', ['120'], { stdio: 'ignore' });
  try {
    const at = new Date(Date.now() - 3600_000), ts = ms => new Date(at.getTime() + ms).toISOString();
    const base = id => ({ isSidechain: false, userType: 'external', entrypoint: 'cli', cwd, sessionId: id, version: 'fixture', gitBranch: 'main' });
    const said = (id, text, ms) => ({ ...base(id), parentUuid: null, type: 'user', uuid: randomUUID(), timestamp: ts(ms), message: { role: 'user', content: [{ type: 'text', text }] } });
    makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Claude spoke last', prompt: 'is the build green?', reply: 'green on every job', at },
      { cwd, title: 'You spoke last', prompt: 'rename the column', reply: 'renamed', at: new Date(at.getTime() - 60_000),
        lines: id => [said(id, 'and the one beside it too', 30_000), said(id, '[Request interrupted by user]', 40_000)] },
      { cwd, title: 'Asking you', prompt: 'clean the old branches', reply: 'on it', at: new Date(at.getTime() - 120_000),
        live: { pid: sleeper.pid, startedAt: Date.now() - 600_000, status: 'waiting', waitingFor: 'permission prompt' } },
      { cwd, title: 'A title long enough to run onto a second line of the card, and on to a third where the list is narrow', prompt: 'a long one', reply: 'yes', at: new Date(at.getTime() - 180_000) },
    ]);
    await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 6`, { what: 'the four chats and the fixture\'s two' });
    await ctx.waitFor(`!!document.querySelector('#slist > .card.asking')`, { what: 'the asking card' });

    // large, the default: both words everywhere
    out.large = { slider: await slider(ctx), cards: await cards(ctx) };
    ctx.assert.deepEqual(out.large.slider, { v: '0', list: 'large', on: 'large' });
    ctx.assert.deepEqual(out.large.cards['Claude spoke last'].words, ['you: is the build green?', 'claude: green on every job']);
    ctx.assert.deepEqual(out.large.cards['You spoke last'].words, ['you: and the one beside it too', 'claude: renamed']);
    ctx.assert.equal(out.large.cards['Asking you'].ask, true);
    await ctx.shot('large', { x: 0, y: 0, width: 420, height: 640 });

    // medium, from the slider: the last word only — Claude's on one card, yours on the other
    await ctx.evaluate(`(() => { const r = document.querySelector('#cardsSize'); r.value = '1'; r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    out.medium = { slider: await slider(ctx), cards: await cards(ctx) };
    ctx.assert.deepEqual(out.medium.slider, { v: '1', list: 'medium', on: 'medium' });
    ctx.assert.deepEqual(out.medium.cards['Claude spoke last'].words, ['claude: green on every job'], 'Claude had the last word');
    ctx.assert.deepEqual(out.medium.cards['You spoke last'].words, ['you: and the one beside it too'], 'you had it — the reply is the turn before\'s');
    ctx.assert.equal(out.medium.cards['Asking you'].ask, true, 'the question stays');
    await ctx.shot('medium', { x: 0, y: 0, width: 420, height: 640 });

    // compact, from the stop's name: no words at all
    await ctx.evaluate(`document.querySelector('#settings .dens .stops [data-v="2"]').click()`);
    out.compact = { slider: await slider(ctx), cards: await cards(ctx) };
    ctx.assert.deepEqual(out.compact.slider, { v: '2', list: 'compact', on: 'compact' });
    for (const [t, c] of Object.entries(out.compact.cards)) ctx.assert.deepEqual(c.words, [], `no words on "${t}"`);
    ctx.assert.equal(out.compact.cards['Asking you'].ask, true, 'the question stays even here');
    for (const t of ['Claude spoke last', 'You spoke last']) {
      const [l, m, c] = [out.large, out.medium, out.compact].map(x => x.cards[t].h);
      ctx.assert.ok(l > m && m > c, `"${t}" shrinks at each step: ${l} → ${m} → ${c}`);
    }
    await ctx.shot('compact', { x: 0, y: 0, width: 420, height: 640 });
    ctx.assert.equal((await ctx.peix('prefs()')).cards, 'compact');

    // compact's own switch (2026-09-29, Ricardo: "add an option in the compact setting to make cards same height"):
    // shown under compact only; on, the title is one line and nothing hangs under it, so every card is one height
    const heights = cs => [...new Set(Object.values(cs).map(c => c.h))];
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#evenRow').hidden`), false, 'the switch shows under compact');
    ctx.assert.ok(heights(out.compact.cards).length > 1, `compact cards are of several heights: ${heights(out.compact.cards)}`);
    await ctx.evaluate(`document.querySelector('#cardsEven').click()`); await ctx.settle();
    out.even = { cards: await cards(ctx), attr: await ctx.evaluate(`document.querySelector('#sessions').hasAttribute('data-even')`) };
    ctx.assert.equal(out.even.attr, true);
    ctx.assert.deepEqual(heights(out.even.cards).length, 1, `one height for every card: ${JSON.stringify(Object.fromEntries(Object.entries(out.even.cards).map(([t, c]) => [t, c.h])))}`);
    ctx.assert.equal(out.even.cards['Asking you'].ask, false, 'the question is left to the card\'s blinking edge');
    ctx.assert.equal(await ctx.evaluate(`[...document.querySelectorAll('#slist > .card .state.moveslot')].every(x => getComputedStyle(x).visibility === 'hidden' && x.getClientRects().length)`), true, 'no card has a move here: each holds the line\'s place, unseen');
    await ctx.shot('even', { x: 0, y: 0, width: 420, height: 640 });
    await ctx.evaluate(`document.querySelector('#settings .dens .stops [data-v="1"]').click()`);
    ctx.assert.deepEqual(await ctx.evaluate(`[document.querySelector('#evenRow').hidden, document.querySelector('#sessions').hasAttribute('data-even')]`), [true, false], 'medium: no switch, and nothing evened');
    await ctx.evaluate(`document.querySelector('#settings .dens .stops [data-v="2"]').click()`);
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#sessions').hasAttribute('data-even')`), true, 'back to compact, the switch as it was left');
    ctx.assert.equal((await ctx.peix('prefs()')).cardsEven, true, 'a pref');

    // the settings, to look at the slider
    await ctx.cmd('Comma'); await ctx.settle();
    const r = await ctx.evaluate(`(r => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }))(document.querySelector('#settings').getBoundingClientRect())`);
    await ctx.shot('cog', r);
    await ctx.cmd('Comma');

    // a reload keeps it: a pref of this window
    await ctx.send('Page.reload'); await ctx.sleep(1200);
    await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 6`, { what: 'the list back after the reload' });
    out.reloaded = { slider: await slider(ctx), words: Object.values(await cards(ctx)).flatMap(c => c.words) };
    ctx.assert.deepEqual(out.reloaded, { slider: { v: '2', list: 'compact', on: 'compact' }, words: [] }, 'compact after a reload');
    return out;
  } finally { sleeper.kill(); }
}
