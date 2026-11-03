// One line (2026-11-03, round XXII's S1): a fourth card size, compact at one height, its third row saying the first thing there is
// to say: the question, your move, what it is doing, else the last word, cut to one line. What this checks: every card one
// height, and no taller than same height's; who has the row on each card; no row left blank when there is a word; the title one
// line; the switches under the size off with why; no card redrawn by the change; a card with agents still grows; the pick outlives a
// reload. A row with no process keeps your word at its full ink (dimmed it read 3.4:1).
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFixture, toolLines } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto', prefs: { cards: 'compact', cardsEven: true } };

const LONG = 'A word long enough to run off the end of the line at any width the list can be, and on, and on, and on past all of it, which is how most of them are.';

export default async function (ctx) {
  const a = ctx.assert, out = {}, cwd = join(tmpdir(), 'peix-card-line', 'line-repo');
  const asker = spawn('sleep', ['120'], { stdio: 'ignore' }), watcher = spawn('sleep', ['120'], { stdio: 'ignore' });
  try {
    const at = new Date(Date.now() - 3600_000), ts = ms => new Date(at.getTime() + ms).toISOString();
    const base = id => ({ isSidechain: false, userType: 'external', entrypoint: 'cli', cwd, sessionId: id, version: 'fixture', gitBranch: 'main' });
    const said = (id, text, ms) => ({ ...base(id), parentUuid: null, type: 'user', uuid: randomUUID(), timestamp: ts(ms), message: { role: 'user', content: [{ type: 'text', text }] } });
    makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Claude spoke last', prompt: 'is the build green?', reply: LONG, at },
      { cwd, title: 'You spoke last', prompt: 'rename the column', reply: 'renamed', at: new Date(at.getTime() - 60_000),
        lines: id => [said(id, LONG, 30_000), said(id, '[Request interrupted by user]', 40_000)] },
      { cwd, title: 'Asking you', prompt: 'clean the old branches', reply: LONG, at: new Date(at.getTime() - 120_000), live: { pid: asker.pid, startedAt: Date.now() - 600_000, status: 'waiting', waitingFor: 'permission prompt' } },
      { cwd, title: 'A title long enough to run onto a second line of the card, and on to a third where the list is narrow, and a little more', prompt: 'a long one', reply: 'yes', at: new Date(at.getTime() - 180_000) },
      { cwd, title: 'Watching a run', prompt: 'watch the deploy', reply: 'watching', at: new Date(at.getTime() - 240_000), live: { pid: watcher.pid, startedAt: Date.now() - 600_000, status: 'idle', statusAt: Date.now() },
        lines: id => toolLines({ id, cwd, name: 'Monitor', input: { command: 'gh run watch', description: 'the deploy run', timeout_ms: 1800_000 }, result: 'Monitor started (task lin99zz11, expires in 30m unless the source ends first).', at: new Date(Date.now() - 200_000) }) },
    ]);
    await ctx.waitFor(`document.querySelectorAll('#slist > .card').length === 7 && !!document.querySelector('#slist > .card.asking')`, { what: 'the five chats and the fixture\'s two' });
    await ctx.settle();
    const cards = () => ctx.evaluate(`JSON.stringify(Object.fromEntries([...document.querySelectorAll('#slist > .card')].map(c => {
      const seen = sel => [...c.querySelectorAll(sel)].filter(x => getComputedStyle(x).display !== 'none' && getComputedStyle(x).visibility !== 'hidden');
      const rows = sel => { const e = seen(sel)[0]; return e ? Math.round(e.getBoundingClientRect().height) : 0; };
      return [c.querySelector('.title').textContent.slice(0, 24), { h: +c.getBoundingClientRect().height.toFixed(2), title: rows('.title'), word: seen('.snip').map(x => x.classList.contains('you') ? 'you' : 'claude'), wordH: rows('.snip'), ask: rows('.state.needs-input'), live: rows('.state.live'), node: c.__mark === 1 }];
    })))`).then(JSON.parse);

    const even = await cards();
    await ctx.evaluate(`for (const c of document.querySelectorAll('#slist > .card')) c.__mark = 1`);
    await ctx.evaluate(`document.querySelector('#cardsSize [data-v="3"]').click()`);
    await ctx.settle();
    out.line = await cards();
    a.deepEqual(await ctx.evaluate(`({ on: document.querySelector('#cardsSize [aria-checked="true"]').textContent, cards: document.querySelector('#sessions').dataset.cards, line: document.querySelector('#sessions').hasAttribute('data-line'), even: document.querySelector('#sessions').hasAttribute('data-even'), pref: window.peix.prefs().cards })`),
      { on: 'One line', cards: 'compact', line: true, even: true, pref: 'line' }, 'the stop, the list\'s two attributes');
    const c = out.line, long = Object.keys(c).find(k => k.startsWith('A title long'));
    for (const [k, v] of Object.entries(c)) {
      a.equal(v.node, true, `${k}: the card's node kept (the size re-renders nothing)`);
      a.equal(v.title <= 19, true, `${k}: its title on one line (${v.title})`);
      a.equal(v.h, even[k].h, `${k}: no taller than same height`);
    }
    a.equal(new Set(Object.values(c).map(v => v.h)).size, 1, `one height: ${Object.values(c).map(v => v.h)}`);
    // who has the row
    a.deepEqual([c['Claude spoke last'].word, c['Claude spoke last'].wordH], [['claude'], 16], 'the last word, Claude\'s, one line');
    a.deepEqual([c['You spoke last'].word, c['You spoke last'].wordH], [['you'], 16], 'the last word, yours');
    a.deepEqual([c['Asking you'].word, c['Asking you'].ask], [[], 16], 'the question, not the word');
    a.deepEqual([c['Watching a run'].word, c['Watching a run'].live], [['claude'], 0], 'a monitor with no event yet says nothing: the word');
    const doing = await ctx.evaluate(`JSON.stringify((k => { const l = k.querySelector('.state.live'), was = k.getBoundingClientRect().height; l.innerHTML = '<span class="ll"><b>Bash</b><span>the deploy</span></span>'; const v = { words: [...k.querySelectorAll('.snip')].filter(x => getComputedStyle(x).display !== 'none').length, live: Math.round(l.getBoundingClientRect().height), same: k.getBoundingClientRect().height === was }; l.innerHTML = ''; return v; })(document.querySelector('#slist > .card.watching')))`).then(JSON.parse);
    a.deepEqual(doing, { words: 0, live: 16, same: true }, 'what it is doing, not the word');
    a.equal(c[long].word.length, 1, 'a long title keeps its word');
    // your word on a row with no process reads at its full ink
    a.equal(await ctx.evaluate(`getComputedStyle([...document.querySelectorAll('#slist > .card.gone .snip.you:not(.older)')].find(x => getComputedStyle(x).display !== 'none')).opacity`), '1', 'not dimmed');
    // the switches under the size
    const dep = row => ctx.evaluate(`(r => ({ off: r.classList.contains('off') && r.querySelector('input').disabled, say: r.querySelector('small').textContent }))(document.querySelector('${row}'))`);
    a.deepEqual(await dep('#laneRow'), { off: true, say: 'One line keeps every card one height' });
    a.deepEqual(await dep('#evenRow'), { off: true, say: 'Only with compact cards' });
    // a PR at your move has the row: a stand-in of its line, as cardHtml writes it
    const moved = await ctx.evaluate(`JSON.stringify((() => { const k = document.querySelector('#slist > .card:not(.asking)'), m = document.createElement('div'); k.classList.add('rowmove'); m.className = 'state prmove'; m.innerHTML = '<b class="ymove">your move</b><span class="q">#7 · why</span>'; k.querySelector('.state.moveslot')?.replaceWith(m); const s = [...k.querySelectorAll('.snip')].filter(x => getComputedStyle(x).display !== 'none').length; return { words: s, h: +k.getBoundingClientRect().height.toFixed(2) }; })())`).then(JSON.parse);
    a.deepEqual(moved.words, 0, 'your move, not the word');
    a.equal(moved.h, c['Claude spoke last'].h, 'the same height with a move on the row');
    await ctx.shot('one-line', { x: 0, y: 0, width: 420, height: 640 });
    // kept across a reload
    await ctx.reload();
    a.equal(await ctx.evaluate(`document.querySelector('#sessions').hasAttribute('data-line')`), true, 'kept');
    a.equal(await ctx.evaluate(`document.querySelector('#cardsSize [aria-checked="true"]').textContent`), 'One line');
    return out;
  } finally { asker.kill(); watcher.kill(); }
}
