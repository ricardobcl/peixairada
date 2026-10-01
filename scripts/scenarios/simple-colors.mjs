// Simple colours (2026-10-01, Ricardo: "some people don't like so many colors in the apps, it's too stimulating. can
// we have a them config with simple colors?"). A folder with a Peacock colour and three chats in it: one clauding, one
// asking, one on an open PR with a face and a block of code. What this checks: off (the default), the cards, the
// splitter and the open chat's header wear the folder's colour, the list ALL's black, a PR chip its state's green; the
// settings' switch turns the board to greys — no card, list or header in a colour, the clauding light, the PR chip,
// the state chips' dots and the code in grey, GitHub's faces too — while a question is still the accent and the setup
// still shows the folder's colour (it is where the colour is set); the choice is this browser's pref and a reload keeps
// it; off again, the colours come back.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture, toolLines } from '../fixture.mjs';

const dir = mkdtempSync(join(tmpdir(), 'peix-simple-')), prs = join(dir, 'prs.json'), cwd = join(dir, 'calm-repo');
const COLOR = '#2f7fd8';
mkdirSync(join(cwd, '.vscode'), { recursive: true });
writeFileSync(join(cwd, '.vscode', 'settings.json'), JSON.stringify({ 'peacock.color': COLOR }));
const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const face = (login, fill) => ({ login, __typename: 'User', avatarUrl: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${fill}"/></svg>`) });
writeFileSync(prs, JSON.stringify({
  'acme/calm#5': { state: 'OPEN', title: 'Quiet the board', createdAt: ago(300), headRefOid: 'A', author: face('ana', '#2f9e5b'),
    reviews: { nodes: [] }, comments: { nodes: [] }, pushes: { nodes: [] }, asks: { nodes: [] }, reviewRequests: { nodes: [] } },
}));

export const meta = { server: true, fixture: 'auto', env: { GH_BIN: fileURLToPath(new URL('../fakegh.mjs', import.meta.url)), FAKEGH_PRS: prs, FAKEGH_VIEWER: 'me' } };

/** The largest spread between a colour's channels, over every colour in a computed value — 0 to 255, -1 for none.
 *  A grey is a few units of spread (--nocolor's warm grey is 6); the folder's blue mixed into a card is far more. */
function chroma(v) {
  const hex = h => (h.length < 6 ? [...h].map(c => c + c).join('') : h).match(/../g).slice(0, 3).map(x => parseInt(x, 16));
  const cs = [...String(v).matchAll(/rgba?\(([^)]*)\)|color\(srgb ([^)]*)\)|#([0-9a-f]{3,8})\b/gi)].map(m =>
    m[1] ? m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number) : m[2] ? m[2].split(/[\s/]+/).filter(Boolean).slice(0, 3).map(x => Number(x) * 255) : hex(m[3]));
  return cs.length ? Math.round(Math.max(...cs.map(c => Math.max(...c) - Math.min(...c)))) : -1;
}

export default async function (ctx) {
  const out = {}, now = Date.now();
  const sleeps = [0, 1].map(() => spawn('sleep', ['120'], { stdio: 'ignore' }));
  const live = i => ({ pid: sleeps[i].pid, startedAt: now - 3600_000 });
  try {
    const { chats } = makeFixture(ctx.fixture.dir, [
      { cwd, title: 'Clauding', prompt: 'run the tests', reply: 'on it', at: new Date(now - 60_000), live: live(0),
        lines: id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test', description: 'test' }, at: new Date(now - 5_000) }) },
      { cwd, title: 'Asking', prompt: 'move the webhooks', reply: 'one question first', at: new Date(now - 120_000), live: live(1),
        lines: id => toolLines({ id, cwd, name: 'AskUserQuestion', at: new Date(now - 10_000),
          input: { questions: [{ question: 'Which queue?', header: 'Queue', options: [{ label: 'SQS' }, { label: 'Redis' }] }] } }) },
      { cwd, title: 'On a PR', prompt: 'open https://github.com/acme/calm/pull/5', at: new Date(now - 180_000),
        reply: 'Opened https://github.com/acme/calm/pull/5:\n\n```js\nconst quiet = "yes"; // fewer colours\n```' },
    ]);
    const [busy, asking, onPr] = chats;
    await ctx.evaluate(`window.__chroma = ${chroma.toString()}`);
    await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${busy.id}"]')?.style.getPropertyValue('--repo') === '${COLOR}'`, { what: "the folder's Peacock colour (polled every 3 s)", timeout: 10000 });
    await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${onPr.id}"] .cpr[data-state="open"]') && document.querySelector('#slist > .card[data-id="${onPr.id}"] .faces img')`, { what: 'the PR answered, with its face', timeout: 20000 });
    await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${asking.id}"]')?.classList.contains('asking')`, { what: 'the question on its card' });
    await ctx.openChat(onPr.id);
    await ctx.waitFor(`document.querySelector('#log .hljs-keyword')`, { what: 'the code, highlighted' });
    await ctx.settle();

    const look = () => ctx.evaluate(`JSON.stringify((() => {
      const cs = (el, p) => el ? getComputedStyle(el).getPropertyValue(p) : null, root = document.documentElement;
      const card = id => document.querySelector('#slist > .card[data-id="' + id + '"]'), plain = card(${JSON.stringify(onPr.id)});
      return {
        colors: root.dataset.colors, pref: !!window.peix.prefs().simpleColors,
        repo: [${JSON.stringify(busy.id)}, ${JSON.stringify(onPr.id)}].map(id => card(id).style.getPropertyValue('--repo')),
        list: document.querySelector('#sessions').style.getPropertyValue('--repo'),
        tinted: document.querySelector('#chat').classList.contains('tinted'),
        card: __chroma(cs(card(${JSON.stringify(asking.id)}), 'background-image')),
        open: __chroma(cs(plain, 'background-image')), head: __chroma(cs(document.querySelector('#chat'), '--hbg')),
        split: __chroma(cs(document.querySelector('#main'), '--openc')), lit: __chroma(cs(card(${JSON.stringify(busy.id)}), '--lit')),
        pr: __chroma(cs(plain.querySelector('.cpr[data-state="open"]'), 'background-color')), hpr: __chroma(cs(document.querySelector('.shead .hpr[data-state="open"]'), 'background-color')),
        dots: [...document.querySelectorAll('#fchips .fchip')].map(c => __chroma(cs(c, '--c'))),
        code: ['.hljs-keyword', '.hljs-string'].map(q => __chroma(cs(document.querySelector('#log ' + q), 'color'))),
        face: cs(plain.querySelector('.faces img'), 'filter'),
        asking: card(${JSON.stringify(asking.id)}).classList.contains('asking'), needs: cs(root, '--needs').trim(), accent: cs(root, '--accent').trim(),
      };
    })())`).then(JSON.parse);
    const setSimple = async on => {
      await ctx.cmd('Comma');
      await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
      out.switch = await ctx.evaluate(`document.querySelector('#simpleColors').closest('label').textContent.trim()`);
      if (await ctx.evaluate(`document.querySelector('#simpleColors').checked`) !== on) await ctx.evaluate(`document.querySelector('#simpleColors').click()`);
      await ctx.cmd('Comma');
      await ctx.waitFor(`!document.querySelector('#settings').open`, { what: 'the settings closed' });
      await ctx.settle();
    };

    // 1 · off, the default: the folder's colour on its cards, the list and the header; ALL's black; a green PR chip
    out.full = await look();
    ctx.assert.equal(out.full.colors, 'full', 'colours by default');
    ctx.assert.deepEqual(out.full.repo, [COLOR, COLOR], 'the cards wear the folder\'s colour');
    ctx.assert.equal(out.full.list, '#000000', 'ALL is black');
    ctx.assert.equal(out.full.tinted, true, 'the chat header is tinted');
    for (const k of ['card', 'open', 'head', 'split', 'lit', 'pr', 'hpr']) ctx.assert.ok(out.full[k] > 40, `${k} in a colour: ${JSON.stringify(out.full)}`);
    ctx.assert.ok(out.full.dots.some(c => c > 40) && out.full.code.every(c => c > 40), `the state chips' dots and the code in colour: ${JSON.stringify(out.full)}`);
    ctx.assert.equal(out.full.face, 'none', 'a face in its colours');
    await ctx.shot('full');

    // 2 · the switch: greys, and the accent for the question
    await setSimple(true);
    ctx.assert.match(out.switch, /simple colours/, 'the switch says what it is');
    out.simple = await look();
    ctx.assert.deepEqual([out.simple.colors, out.simple.pref], ['simple', true], 'the root says it, and it is a pref');
    ctx.assert.deepEqual(out.simple.repo, ['', ''], 'no card wears the folder\'s colour');
    ctx.assert.equal(out.simple.list, '', 'nor the list, ALL\'s black included');
    ctx.assert.equal(out.simple.tinted, false, 'the chat header is the plain one');
    for (const k of ['card', 'open', 'head', 'split', 'lit', 'pr', 'hpr']) ctx.assert.ok(out.simple[k] >= 0 && out.simple[k] <= 12, `${k} in grey: ${JSON.stringify(out.simple)}`);
    ctx.assert.ok(out.simple.dots.every(c => c >= 0 && c <= 12) && out.simple.code.every(c => c >= 0 && c <= 12), `the dots and the code in grey: ${JSON.stringify(out.simple)}`);
    ctx.assert.equal(out.simple.face, 'grayscale(1)', 'a face in grey');
    ctx.assert.equal(out.simple.asking, true, 'the question is still on its card');
    ctx.assert.equal(out.simple.needs, out.simple.accent, 'and it is the accent — the one colour left, for what wants you');
    await ctx.shot('simple');

    // 3 · the setup is where a colour is set: its square still shows it
    await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projects: { 'calm-repo': { abbr: 'CR' } } }) });
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
    await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="setup"]').click()`);
    await ctx.waitFor(`document.querySelector('#setup .srow.proj[data-name="calm-repo"] .stile')`, { what: 'the project\'s row in the setup' });
    out.tile = await ctx.evaluate(`document.querySelector('#setup .srow.proj[data-name="calm-repo"] .stile').style.background`);
    ctx.assert.ok(chroma(out.tile) > 40, `the setup's square in the folder's colour: ${out.tile}`);
    await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="board"]').click()`);
    await ctx.cmd('Comma');
    await ctx.waitFor(`!document.querySelector('#settings').open`, { what: 'the settings closed' });

    // 4 · a reload keeps it
    await ctx.send('Page.reload'); await ctx.sleep(500);
    await ctx.waitFor(`document.querySelectorAll('#slist > .card').length >= 3`, { what: 'the board again' });
    await ctx.evaluate(`window.__chroma = ${chroma.toString()}`);
    await ctx.openChat(onPr.id);
    await ctx.waitFor(`document.querySelector('#log .hljs-keyword')`, { what: 'the code again' });
    await ctx.settle();
    out.reload = await look();
    ctx.assert.deepEqual([out.reload.colors, out.reload.repo, out.reload.tinted], ['simple', ['', ''], false], 'still greys after a reload');

    // 5 · off again: the colours come back
    await setSimple(false);
    out.back = await look();
    ctx.assert.deepEqual([out.back.colors, out.back.repo, out.back.list, out.back.tinted], ['full', [COLOR, COLOR], '#000000', true], 'the colours are back');
    ctx.assert.ok(out.back.card > 40 && out.back.pr > 40, `in colour again: ${JSON.stringify(out.back)}`);
    return out;
  } finally {
    for (const p of sleeps) p.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}
