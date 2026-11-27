// The drawer's whole state machine, at random (2026-11-05): every way the column changes shape, in a seeded order, close
// together or far apart, while a claude and a zsh draw and keys are typed — the states one scenario's steps never reach.
//   npm run scenario -- scripts/scenarios/drawer-soak.mjs -- [seed] [ops]
// Every few steps, once it is quiet, what must always hold: the grid is what the body holds; the holder's PTY is that size;
// the page's screen and the holder's are the same, character for character (a drift no later line repairs); nothing is left
// holding the screen. At the end every key typed reached claude, in order. Its log's line names the seed: run it again.
import { frameTrouble, holderRows } from '../../lib/framewatch.mjs';

export const meta = {
  server: true,
  fake: true,
  fixture: 'auto',
  env: { FAKE_TUI: 'fullscreen', FAKE_SIZE_MARK: '1', FAKE_ANSWER: 'real', FAKE_ANSWER_GAP_MS: '1' },
};

const rng = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let bits = Math.imul(seed ^ (seed >>> 15), 1 | seed);

  bits = (bits + Math.imul(bits ^ (bits >>> 7), 61 | bits)) ^ bits;
  return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
};

// With the transcript in the scrollback, the page's xterm and the holder's reflow what is above the live region their own
// ways, the code before this soak as now (2026-11-05, an open item): only the region the app draws is compared there (LIVE_ONLY).
const clean = rows => rows.map(row => row.replace(/\d+m \d\ds/, 'T').replace(/\s+$/, ''));

export default async function (ctx) {
  const LIVE_ONLY = ctx.server.env.FAKE_TUI !== 'fullscreen';

  const { assert } = ctx;
  const seed = Number(ctx.args[0] ?? 7);
  const ops = Number(ctx.args[1] ?? 40);
  const random = rng(seed);
  const pick = choices => choices[Math.floor(random() * choices.length)];

  const [chatA, chatB] = ctx.fixture.chats;

  const typed = new Map([
    [chatA.id, []],
    [chatB.id, []],
  ]);

  const trail = [];

  for (const chat of [chatA, chatB]) {
    await ctx.openChat(chat.id);
    await ctx.key('KeyC');
    await ctx.waitPrompt();
    await ctx.sleep(400);
  }

  const typeNow = async text => {
    // no Enter, into the half holding the chat's own claude; nothing there, nothing typed
    const where = await ctx
      .evaluate(
        `(() => { const st = window.peix.state(); return JSON.stringify({ id: st.current, g: st.halves.indexOf('chat') }); })()`,
      )
      .then(JSON.parse);

    if (where.g < 0 || !(await ctx.peix('session()'))?.terminal) return;

    const sent = await ctx.evaluate(
      `(() => { const x = document.querySelector('#termBody${where.g ? 'B' : ''} textarea'), g = window.peix.grid(${where.g}); if (!x || !g.id) return false; x.dispatchEvent(new InputEvent('input', { data: ${JSON.stringify(text)}, inputType: 'insertText', bubbles: true })); return true; })()`,
    );

    if (sent) typed.get(where.id)?.push(text);
  };

  const OPS = {
    split: () => ctx.cmd('Digit2'),
    stack: () => ctx.key('Digit2'),
    side: () => ctx.cmd('Digit1'),
    closeHalf: () => ctx.cmd('KeyW'),
    other: () => ctx.cmd('Digit0'),
    zsh: () => ctx.key('KeyT'),
    closeTab: () => ctx.key('KeyW'),
    list: () => ctx.key('KeyB'),
    zoomed: () => ctx.key('KeyC'),
    window: () =>
      ctx.send('Emulation.setDeviceMetricsOverride', {
        width: 1100 + Math.floor(random() * 700),
        height: 700 + Math.floor(random() * 400),
        deviceScaleFactor: 0,
        mobile: false,
      }),
    chat: async () => {
      const cur = await ctx.peix('state().current');
      const to = cur === chatA.id ? chatB : chatA;

      await ctx.evaluate(`document.querySelector('#slist > .card[data-id="${to.id}"] .title')?.click()`);
    },
    size: () =>
      ctx.evaluate(
        `document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(pick(['=', '-', '0']))}, metaKey: true, bubbles: true, cancelable: true }))`,
      ),
    drag: async () => {
      const sel = pick(['#splitter', '#gsplit']);

      const center = await ctx.evaluate(
        `(e => { if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })(document.querySelector(${JSON.stringify(sel)}))`,
      );

      if (!center) return;

      const dx = Math.round((random() - 0.5) * 240);

      const mouse = (type, pointerX, buttons) =>
        ctx.send('Input.dispatchMouseEvent', {
          type,
          x: pointerX,
          y: center.y,
          button: 'left',
          buttons,
          clickCount: 1,
        });

      await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x, y: center.y });
      await mouse('mousePressed', center.x, 1);

      for (let step = 1; step <= 6; step++) {
        await mouse('mouseMoved', center.x + Math.round((dx * step) / 6), 1);
        await ctx.sleep(16);
      }

      await mouse('mouseReleased', center.x + dx, 0);
    },
    type: () => typeNow(`k${trail.length}.`),
    reload: async () => {
      await ctx.reload();
      await ctx.sleep(300);
    },
  };

  const WEIGHTS = [
    'split',
    'split',
    'stack',
    'side',
    'closeHalf',
    'closeHalf',
    'other',
    'zsh',
    'closeTab',
    'list',
    'list',
    'zoomed',
    'window',
    'window',
    'chat',
    'chat',
    'size',
    'drag',
    'drag',
    'type',
    'type',
    'type',
    'reload',
  ];

  const check = async why => {
    await ctx.sleep(50); // the body's observer first: what an op changed is the next frame's

    await ctx.waitFor(`[0, 1].every(g => (x => !x.hold && !x.refits)(window.peix.grid(g)))`, {
      timeout: 4000,
      what: `the screen let go, ${why}, after ${trail.slice(-6).join(' ')} (seed ${seed})`,
    });

    await ctx.sleep(450);
    await ctx.settle();

    for (const half of [0, 1]) {
      const term = await ctx.peix(`term(${half})`);

      const shown = await ctx.evaluate(
        `!document.querySelector('${half ? '#termB' : '#term'}').hidden && !document.querySelector('${half ? '#grpB' : '#grp'}').hidden`,
      );

      if (!term.id || !shown || term.exited !== null) continue;
      const at = `${why}, half ${half}, seed ${seed}, after ${trail.slice(-8).join(' ')}`;

      if (term.cols !== term.propose.cols || term.rows !== term.propose.rows) {
        ctx.log(`FITS ${JSON.stringify(await ctx.peix(`fits?.(${half})`))}`);
      }

      assert.deepEqual(
        [term.cols, term.rows],
        [term.propose.cols, term.propose.rows],
        `the grid is what the body holds: ${at}`,
      );

      const holder = (await ctx.server.terminals()).find(entry => entry.id === term.id);

      assert.deepEqual(
        [holder.cols, holder.rows],
        [Math.max(20, term.cols), term.rows],
        `the holder's PTY is that size: ${at}`,
      );

      // the timer's cells and a repaint on its way aside, three looks for it to come out the same
      let page;
      let held;

      for (let attempt = 0; attempt < 4; attempt++) {
        [page, held] = [
          clean(await ctx.peix(`screen(${half})`)),
          clean((await holderRows(ctx.server, term.id)).rows),
        ].map(rows => (LIVE_ONLY ? rows.slice(-6) : rows));

        if (JSON.stringify(page) === JSON.stringify(held)) break;
        await ctx.sleep(400);
      }

      const diff = page
        .map((row, line) => (row === held[line] ? null : { y: line, page: row, holder: held[line] }))
        .filter(Boolean);

      if (diff.length) ctx.log(`FITS ${JSON.stringify(await ctx.peix(`fits?.(${half})`))}`);

      if (diff.length) {
        ctx.log(
          `VIEW ${JSON.stringify(await ctx.evaluate(`(v => ({ top: v.scrollTop, height: v.scrollHeight, client: v.clientHeight }))(document.querySelector("${half ? '#termBodyB' : '#termBody'} .xterm-viewport"))`))} TAIL ${JSON.stringify((await ctx.peix(`buffer(${half})`)).slice(-12))}`,
        );
      }

      if (diff.length) {
        ctx.log(
          `DIFF ${at}\nPAGE ${JSON.stringify(page)}\nHELD ${JSON.stringify(held)}\nBYTES ${JSON.stringify((await holderRows(ctx.server, term.id)).raw)}`,
        );
      }

      assert.deepEqual(diff.slice(0, 4), [], `the page's screen is the holder's (${diff.length} rows differ): ${at}`);
    }
  };

  await ctx.watchFrames(0);
  const when = []; // each step's time on the page's clock, so a frame that went wrong names the step before it
  const mark = async op => when.push({ op, i: trail.length - 1, t: await ctx.evaluate('performance.now()') });

  for (let step = 0; step < ops; step++) {
    const op = pick(WEIGHTS);

    trail.push(op);
    await mark(op);
    await OPS[op]();

    if (op === 'reload') {
      await ctx.watchFrames(0);
      await mark('reloaded');
    }

    await ctx.sleep(pick([0, 0, 0, 16, 40, 90, 150, 300, 700]));
    if (step % 7 === 6) await check(`step ${step}`);
  }

  await check('the end');

  const recorded = await ctx.frames();
  const bad = frameTrouble(recorded.frames, { top: !LIVE_ONLY });

  const after = frame => {
    const time = recorded.t0 + frame.t;
    const marked = when.filter(entry => entry.t <= time).at(-1);

    return marked ? `${marked.op}#${marked.i}+${Math.round(time - marked.t)}ms` : '?';
  };

  for (const [kind, list] of Object.entries(bad)) {
    if (list.length) {
      ctx.log(
        `${kind}: ${list
          .slice(0, 12)
          .map(frame => `${after(frame)} ${frame.cols}x${frame.rows} top ${frame.top} bottom ${frame.bottom}`)
          .join(' | ')}`,
      );
    }
  }

  // every key typed reached its claude, in order: the line goes in with an Enter, and the transcript says what it got
  await ctx.cmd('Digit1').catch(() => {});
  const words = {};

  for (const chat of [chatA, chatB]) {
    if (!typed.get(chat.id).length) continue;
    await ctx.evaluate(`document.querySelector('#slist > .card[data-id="${chat.id}"] .title')?.click()`);
    await ctx.waitFor(`window.peix.state().current === '${chat.id}'`, { what: 'the chat' });
    await ctx.key('KeyC');

    await ctx.waitFor(`window.peix.state().halves.includes('chat') && window.peix.session()?.terminal`, {
      what: 'its claude',
    });

    await ctx.sleep(700);
    const half = await ctx.evaluate(`window.peix.state().halves.indexOf('chat')`);

    await ctx.evaluate(
      `document.querySelector('#termBody${half ? 'B' : ''} textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))`,
    );

    const want = typed.get(chat.id).join('');

    await ctx.waitFor(
      `(async () => { const r = await window.fetch('api/sessions/${chat.id}/messages', { headers: { 'x-peix-key': window.PEIX_KEY } }); const j = await r.json(); return JSON.stringify(j).includes(${JSON.stringify(want)}); })()`,
      { timeout: 6000, what: `what was typed in ${chat.id.slice(0, 8)} (${want}), seed ${seed}` },
    );

    words[chat.id.slice(0, 8)] = typed.get(chat.id).length;
  }

  ctx.log(
    `seed ${seed}: ${ops} steps quiet; frames ${recorded.frames.length}, stale ${bad.stale.length}, torn ${bad.torn.length}, blank ${bad.blank.length}; keys ${JSON.stringify(words)}`,
  );

  return {
    seed,
    ops,
    frames: recorded.frames.length,
    stale: bad.stale.length,
    torn: bad.torn.length,
    blank: bad.blank.length,
    keys: words,
    trail: trail.join(' '),
  };
}
