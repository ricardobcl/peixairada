// The real Claude Code in a drawer as the column changes shape (2026-11-05), in Chrome and then in WebKit by the window's own
// frames: each change shows one new screen — not the old one cut to the new grid first, not a frame with half a repaint.
// A lab of its own (lib/reallab.mjs): its own HOME and config, no API, nothing spent. No Claude Code here, or a locked
// screen for the WebKit half, and it says so and passes.
import { spawnSync } from 'node:child_process';
import { FRAME_WATCH, looks } from '../../lib/framewatch.mjs';
import { labChat, realLab } from '../../lib/reallab.mjs';

const lab = realLab();
const id = lab.bin ? labChat(lab, 25) : null;

export const meta = { server: true, env: lab.env, prefs: { cards: 'medium' } };

const CHANGES = [
  ['split ⌘2', 'cmd', 'Digit2'],
  ['closed ⌘W', 'cmd', 'KeyW'],
  ['list hidden ⌥⌘B', 'alt', 'KeyB'],
  ['list shown ⌥⌘B', 'alt', 'KeyB'],
];

export default async function (ctx) {
  if (!lab.bin) {
    ctx.log('no Claude Code installed here: nothing checked');
    return { skipped: 'no Claude Code' };
  }

  const { assert } = ctx;
  const out = { cli: lab.bin.split('/').pop(), chrome: {}, webkit: {} };

  await ctx.waitFor(`window.peix?.sessions().some(s => s.id === '${id}')`, { what: 'the lab chat' });
  await ctx.openChat(id);
  await ctx.key('KeyC');
  await ctx.waitPrompt(30000);
  await ctx.sleep(2500);
  await ctx.settle();

  for (let round = 1; round <= 2; round++) {
    for (const [label, mod, code] of CHANGES) {
      await ctx.watchFrames(0);
      await ctx.sleep(150);
      const at = await ctx.evaluate('performance.now()');

      await (mod === 'cmd' ? ctx.cmd(code) : ctx.key(code));
      await ctx.sleep(250);

      await ctx.waitFor(`(x => !x.hold && !x.refits)(window.peix.grid(0))`, {
        timeout: 3000,
        what: `${label}: let go`,
      });

      await ctx.sleep(500);

      // the change's own: its first half second — the CLI changes its hints a moment later, on its own
      const end = await ctx.evaluate('performance.now()');
      const { frames } = await ctx.frames();
      const t0 = end - frames.at(-1).t;
      const fin = frames.at(-1).n;

      const seen = looks(frames)
        .slice(1)
        .filter(frame => frame.t + t0 - at < 500);

      const part = frames.filter(frame => frame.n < fin * 0.6);

      (out.chrome[label] ||= []).push(`${seen.length} look(s)${part.length ? `, ${part.length} partial` : ''}`);
      assert.equal(part.length, 0, `${label}: no frame with part of a screen: ${JSON.stringify(part.slice(0, 2))}`);

      assert.ok(
        seen.length <= 2,
        `${label}: one new screen, not ${seen.length}: ${JSON.stringify(seen.map(frame => [frame.t, frame.cols, frame.rows, frame.n]))}`,
      );
    }
  }

  const total = Object.values(out.chrome)
    .flat()
    .map(entry => +entry[0])
    .reduce((sum, count) => sum + count, 0);

  // the code before drew two a change, 16 here; the CLI changes a hint on its own now and then, inside the half second
  assert.ok(
    total <= CHANGES.length * 2 + 4,
    `one new screen a change, near enough (${total} for ${CHANGES.length * 2})`,
  );

  // WebKit, the app's engine, by the window's own frames: Chrome's page goes home first, so it holds no drawer
  const key = await ctx.evaluate('window.PEIX_KEY');

  await ctx.key('Digit0');
  await ctx.sleep(500);

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

  const result = spawnSync('node', ['scripts/webkit.mjs', '--hash', id, body], {
    encoding: 'utf8',
    timeout: 90000,
    env: {
      ...process.env,
      URL: ctx.server.url,
      KEY: key,
      SIZE: '2400x1300',
      TIMEOUT: '80',
      PREFS: JSON.stringify({ cards: 'medium', toured: true }),
    },
  });

  if (/the page is hidden/.test(result.stderr + result.stdout)) {
    ctx.log('the screen is locked: WebKit runs no frames, its half not checked');
    return { ...out, webkit: 'skipped: the screen is locked' };
  }

  const line = result.stdout.split('\n').find(outputLine => outputLine.startsWith('"{'));

  assert.ok(line, `an answer from WebKit: ${(result.stderr + result.stdout).slice(-600)}`);
  const wk = JSON.parse(JSON.parse(line));

  for (const [label, runs] of Object.entries(wk)) {
    out.webkit[label] = runs.map(run => run.map(frame => frame.split(' ')[0]).join(' ')); // when each new frame came, the burst's clock (the key at about 120 ms)

    // a frame whose bottom third is bare, between two that are not, is half a repaint; frames alike in where their ink is
    // are one look (an edge's colour easing makes frames that differ by a shade)
    for (const all of runs) {
      const changes = all.filter((frame, index) => !index || frame.split(' ')[1] !== all[index - 1].split(' ')[1]);

      const torn = changes
        .slice(1, -1)
        .filter(frame => /\.{4,}-?$/.test(frame.split(' ')[1]) && !/\.{4,}-?$/.test(changes.at(-1).split(' ')[1]));

      assert.equal(torn.length, 0, `${label} in WebKit: no frame with its bottom gone: ${JSON.stringify(changes)}`);

      assert.ok(
        changes.length - 1 <= 2,
        `${label} in WebKit: one new screen, not ${changes.length - 1}: ${JSON.stringify(changes)}`,
      );
    }
  }

  ctx.log(JSON.stringify(out));
  return out;
}
