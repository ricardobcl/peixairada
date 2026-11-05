// The real Claude Code in a drawer as the column changes shape (2026-11-05), in Chrome and then in WebKit by the window's own
// frames: each change shows one new screen — not the old one cut to the new grid first, not a frame with half a repaint.
// A lab of its own (lib/reallab.mjs): its own HOME and config, no API, nothing spent. No Claude Code here, or a locked
// screen for the WebKit half, and it says so and passes.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { FRAME_WATCH, looks } from '../../lib/framewatch.mjs';
import { labChat, realLab } from '../../lib/reallab.mjs';

const lab = realLab(), id = lab.bin ? labChat(lab, 25) : null;
export const meta = { server: true, env: lab.env, prefs: { cards: 'medium' } };

const CHANGES = [['split ⌘2', 'cmd', 'Digit2'], ['closed ⌘W', 'cmd', 'KeyW'], ['list hidden ⌥⌘B', 'alt', 'KeyB'], ['list shown ⌥⌘B', 'alt', 'KeyB']];

export default async function (ctx) {
  if (!lab.bin) { ctx.log('no Claude Code installed here: nothing checked'); return { skipped: 'no Claude Code' }; }
  const { assert } = ctx, out = { cli: lab.bin.split('/').pop(), chrome: {}, webkit: {} };
  await ctx.waitFor(`window.peix?.sessions().some(s => s.id === '${id}')`, { what: 'the lab chat' });
  await ctx.openChat(id); await ctx.key('KeyC'); await ctx.waitPrompt(30000);
  await ctx.sleep(2500); await ctx.settle();
  for (const round of [1, 2]) for (const [label, mod, code] of CHANGES) {
    await ctx.watchFrames(0); await ctx.sleep(150);
    const at = await ctx.evaluate('performance.now()');
    await (mod === 'cmd' ? ctx.cmd(code) : ctx.key(code));
    await ctx.sleep(250); await ctx.waitFor(`(x => !x.hold && !x.refits)(window.peix.grid(0))`, { timeout: 3000, what: `${label}: let go` }); await ctx.sleep(500);
    // the change's own: its first half second — the CLI changes its hints a moment later, on its own
    const end = await ctx.evaluate('performance.now()'), { frames } = await ctx.frames(), t0 = end - frames.at(-1).t, fin = frames.at(-1).n;
    const seen = looks(frames).slice(1).filter(f => f.t + t0 - at < 500);
    const part = frames.filter(f => f.n < fin * .6);
    (out.chrome[label] ||= []).push(`${seen.length} look(s)${part.length ? `, ${part.length} partial` : ''}`);
    assert.equal(part.length, 0, `${label}: no frame with part of a screen: ${JSON.stringify(part.slice(0, 2))}`);
    assert.ok(seen.length <= 2, `${label}: one new screen, not ${seen.length}: ${JSON.stringify(seen.map(f => [f.t, f.cols, f.rows, f.n]))}`);
  }
  const total = Object.values(out.chrome).flat().map(s => +s[0]).reduce((a, b) => a + b, 0);
  // the code before drew two a change, 16 here; the CLI changes a hint on its own now and then, inside the half second
  assert.ok(total <= CHANGES.length * 2 + 4, `one new screen a change, near enough (${total} for ${CHANGES.length * 2})`);

  // WebKit, the app's engine, by the window's own frames: Chrome's page goes home first, so it holds no drawer
  const key = await ctx.evaluate('window.PEIX_KEY');
  await ctx.key('Digit0'); await ctx.sleep(500);
  const body = `const w = ${FRAME_WATCH};
    const K = (code, alt) => document.dispatchEvent(new KeyboardEvent('keydown', { code, key: 'x', metaKey: true, altKey: alt, bubbles: true, cancelable: true }));
    await until(() => [...document.querySelectorAll('#termBody .xterm-rows > div')].some(r => r.textContent.includes('❯')), 30000, 'the prompt');
    await sleep(2500);
    const out = {};
    for (const round of [1, 2]) for (const [label, mod, code] of ${JSON.stringify(CHANGES)}) {
      // the column under the header, whose own title and marks change with the column's width
      const r = document.querySelector('#groups').getBoundingClientRect(), top = Math.max(r.top, document.querySelector('#shead').getBoundingClientRect().bottom);
      const t0 = performance.now(), b = burst(900, [r.left, top, r.width, r.bottom - top].map(Math.round)); await sleep(120);
      const at = performance.now() - t0;
      K(code, mod === 'alt');
      const got = await b; await sleep(300);
      (out[label] ||= []).push(got.frames.filter(f => f.t < at + 500).map(f => f.t + 'ms ' + f.bands));   // the change's own half second
    }
    return JSON.stringify(out);`;
  const r = spawnSync('node', ['scripts/webkit.mjs', '--hash', id, body], { encoding: 'utf8', timeout: 90000, env: { ...process.env, URL: ctx.server.url, KEY: key, SIZE: '2400x1300', TIMEOUT: '80', PREFS: JSON.stringify({ cards: 'medium', toured: true }) } });
  if (/the page is hidden/.test(r.stderr + r.stdout)) { ctx.log('the screen is locked: WebKit runs no frames, its half not checked'); return { ...out, webkit: 'skipped: the screen is locked' }; }
  const line = r.stdout.split('\n').find(l => l.startsWith('"{'));
  assert.ok(line, `an answer from WebKit: ${(r.stderr + r.stdout).slice(-600)}`);
  const wk = JSON.parse(JSON.parse(line));
  for (const [label, runs] of Object.entries(wk)) {
    out.webkit[label] = runs.map(f => f.map(x => x.split(' ')[0]).join(' '));   // when each new frame came, the burst's clock (the key at about 120 ms)
    // a frame whose bottom third is bare, between two that are not, is half a repaint; frames alike in where their ink is
    // are one look (an edge's colour easing makes frames that differ by a shade)
    for (const all of runs) {
      const f = all.filter((x, i) => !i || x.split(' ')[1] !== all[i - 1].split(' ')[1]);
      const torn = f.slice(1, -1).filter(x => /\.{4,}-?$/.test(x.split(' ')[1]) && !/\.{4,}-?$/.test(f.at(-1).split(' ')[1]));
      assert.equal(torn.length, 0, `${label} in WebKit: no frame with its bottom gone: ${JSON.stringify(f)}`);
      assert.ok(f.length - 1 <= 2, `${label} in WebKit: one new screen, not ${f.length - 1}: ${JSON.stringify(f)}`);
    }
  }
  ctx.log(JSON.stringify(out));
  return out;
}
