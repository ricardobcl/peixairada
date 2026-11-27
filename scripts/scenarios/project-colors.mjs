// A project's colour (2026-10-01 as the simple colours' scenario; the switch went on 2026-10-14; the setup's alone since
// 2026-10-15, Peacock's before). A project with a colour in the setup and three chats in it: one clauding, one asking,
// one on an open PR with a face and a block of code. What this checks: the cards and the open chat's header wear the
// project's colour, the list ALL's black, a PR chip its state's green (white on the open row, solid in the project's
// colour), the code its syntax colours; the setup shows the
// colour; the chat header's square writes it there, and ⌥-click takes it off. Black still stands out: an open black
// card's lit colour is a grey on the dark (the sidebar's rows since 2026-11-01: the tag, the open row's tint — the
// tiles' card ground and the header's black beside the project went with them).
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture, toolLines } from '../fixture.mjs';
import { tmpDir, waitFor } from '../../lib/testserver.mjs';

const dir = tmpDir('peix-colors-');
const prs = join(dir, 'prs.json');
const cwd = join(dir, 'calm-repo');

const COLOR = '#2f7fd8';

mkdirSync(cwd, { recursive: true });
const ago = min => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');

const face = (login, fill) => ({
  login,
  __typename: 'User',
  avatarUrl: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${fill}"/></svg>`,
  )}`,
});

writeFileSync(
  prs,
  JSON.stringify({
    'acme/calm#5': {
      state: 'OPEN',
      title: 'Quiet the board',
      createdAt: ago(300),
      headRefOid: 'A',
      author: face('ana', '#2f9e5b'),
      reviews: { nodes: [] },
      comments: { nodes: [] },
      pushes: { nodes: [] },
      asks: { nodes: [] },
      reviewRequests: { nodes: [] },
    },
  }),
);

export const meta = {
  server: true,
  fixture: 'auto',
  env: { GH_BIN: fileURLToPath(new URL('../fakes/fakegh.mjs', import.meta.url)), FAKEGH_PRS: prs, FAKEGH_VIEWER: 'me' },
};

/** The largest spread between a colour's channels, over every colour in a computed value — 0 to 255, -1 for none.
 *  A grey is a few units of spread (--nocolor's warm grey is 6); the folder's blue mixed into a card is far more. */
function chroma(value) {
  const hex = digits =>
    (digits.length < 6 ? [...digits].map(digit => digit + digit).join('') : digits)
      .match(/../g)
      .slice(0, 3)
      .map(pair => parseInt(pair, 16));

  // oklch() as Chrome computes a relative colour (the open row's, 2026-11-01), to sRGB's 0–255
  const ok = text => {
    const [lightness, chromaAmount, hueDegrees] = text
      .split(/[\s/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(parseFloat);

    const hueRadians = (hueDegrees * Math.PI) / 180;
    const labA = chromaAmount * Math.cos(hueRadians);
    const labB = chromaAmount * Math.sin(hueRadians);

    const coneLong = (lightness + 0.3963377774 * labA + 0.2158037573 * labB) ** 3;
    const coneMedium = (lightness - 0.1055613458 * labA - 0.0638541728 * labB) ** 3;
    const coneShort = (lightness - 0.0894841775 * labA - 1.291485548 * labB) ** 3;

    return [
      4.0767416621 * coneLong - 3.3077115913 * coneMedium + 0.2309699292 * coneShort,
      -1.2684380046 * coneLong + 2.6097574011 * coneMedium - 0.3413193965 * coneShort,
      -0.0041960863 * coneLong - 0.7034186147 * coneMedium + 1.707614701 * coneShort,
    ].map(
      channel => 255 * (channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.min(1, channel) ** (1 / 2.4) - 0.055),
    );
  };

  const cs = [
    ...String(value).matchAll(
      /rgba?\(([^)]*)\)|color\(srgb ([^)]*)\)|#([0-9a-f]{3,8})\b|oklch\(([\d.]+\s+[\d.]+\s+[\d.]+)[^)]*\)/gi,
    ),
  ].map(match =>
    match[1]
      ? match[1]
          .split(/[\s,/]+/)
          .filter(Boolean)
          .slice(0, 3)
          .map(Number)
      : match[2]
        ? match[2]
            .split(/[\s/]+/)
            .filter(Boolean)
            .slice(0, 3)
            .map(channel => Number(channel) * 255)
        : match[4]
          ? ok(match[4])
          : hex(match[3]),
  );

  return cs.length ? Math.round(Math.max(...cs.map(color => Math.max(...color) - Math.min(...color)))) : -1;
}

export default async function (ctx) {
  const out = {};
  const now = Date.now();

  const sleeps = [0, 1].map(() => spawn('sleep', ['120'], { stdio: 'ignore' }));
  const live = index => ({ pid: sleeps[index].pid, startedAt: now - 3600_000 });

  const paint = projects =>
    ctx.server.api('api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projects }),
    });

  const setupColor = async () => (await ctx.server.api('api/config')).body.projects?.['calm-repo']?.color;

  try {
    await paint({ 'calm-repo': { color: COLOR } });

    const { chats } = makeFixture(ctx.fixture.dir, [
      {
        cwd,
        title: 'Clauding',
        prompt: 'run the tests',
        reply: 'on it',
        at: new Date(now - 60_000),
        live: live(0),
        lines: id =>
          toolLines({
            id,
            cwd,
            name: 'Bash',
            input: { command: 'npm test', description: 'test' },
            at: new Date(now - 5_000),
          }),
      },
      {
        cwd,
        title: 'Asking',
        prompt: 'move the webhooks',
        reply: 'one question first',
        at: new Date(now - 120_000),
        live: live(1),
        lines: id =>
          toolLines({
            id,
            cwd,
            name: 'AskUserQuestion',
            at: new Date(now - 10_000),
            input: {
              questions: [
                { question: 'Which queue?', header: 'Queue', options: [{ label: 'SQS' }, { label: 'Redis' }] },
              ],
            },
          }),
      },
      {
        cwd,
        title: 'On a PR',
        prompt: 'open https://github.com/acme/calm/pull/5',
        at: new Date(now - 180_000),
        reply: 'Opened https://github.com/acme/calm/pull/5:\n\n```js\nconst quiet = "yes"; // fewer colours\n```',
      },
    ]);

    const [busy, asking, onPr] = chats;

    await ctx.evaluate(`window.__chroma = ${chroma.toString()}`);

    await ctx.waitFor(
      `document.querySelector('#slist > .card[data-id="${busy.id}"]')?.style.getPropertyValue('--repo') === '${COLOR}'`,
      { what: "the project's colour, from the setup", timeout: 10000 },
    );

    await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${onPr.id}"] .mxs[data-state="open"]')`, {
      what: 'the PR answered',
      timeout: 20000,
    });

    await ctx.waitFor(
      `document.querySelector('#slist > .card[data-id="${asking.id}"]')?.classList.contains('asking')`,
      { what: 'the question on its card' },
    );

    await ctx.openChat(onPr.id);
    await ctx.waitFor(`document.querySelector('#log .hljs-keyword')`, { what: 'the code, highlighted' });
    await ctx.settle();

    const look = () =>
      ctx
        .evaluate(
          `JSON.stringify((() => {
      const cs = (el, p) => el ? getComputedStyle(el).getPropertyValue(p) : null;
      const card = id => document.querySelector('#slist > .card[data-id="' + id + '"]'), plain = card(${JSON.stringify(onPr.id)});
      return {
        repo: [${JSON.stringify(busy.id)}, ${JSON.stringify(onPr.id)}].map(id => card(id).style.getPropertyValue('--repo')),
        list: document.querySelector('#sessions').style.getPropertyValue('--repo'),
        tinted: document.querySelector('#chat').classList.contains('tinted'),
        card: __chroma(cs(card(${JSON.stringify(asking.id)}).querySelector('.top .repo'), 'background-color')),   // a row's project tag
        open: __chroma(cs(plain, 'background-color')), head: __chroma(cs(document.querySelector('.shead'), '--hbg-eased')),   // the header's own eased copy (2026-10-13)
        lit: __chroma(cs(card(${JSON.stringify(busy.id)}), '--lit')),
        pr: __chroma(cs(plain.querySelector('.mxs[data-state="open"]'), 'background-color')), num: __chroma(cs(plain.querySelector('.mxn'), 'color')), hpr: __chroma(cs(document.querySelector('.shead .tmx .mxs[data-state="open"]'), 'background-color')),
        dots: [...document.querySelectorAll('#slist > .gsep.lane.working > i')].map(i => __chroma(cs(i, 'border-top-color'))).concat([...document.querySelectorAll('#slist > .gsep.lane.ready > i')].map(i => __chroma(cs(i, 'border-top-color')))),   // the lanes' (the state chips' until 2026-10-11, later)
        code: ['.hljs-keyword', '.hljs-string'].map(q => __chroma(cs(document.querySelector('#log ' + q), 'color'))),
        you: __chroma(cs(plain.querySelector('.snip.you b'), 'color')),
      };
    })())`,
        )
        .then(JSON.parse);

    // 1 · the folder's colour on its cards, the list and the header; ALL's black; a green PR chip
    out.full = await look();
    ctx.assert.deepEqual(out.full.repo, [COLOR, COLOR], "the cards wear the folder's colour");
    ctx.assert.equal(out.full.list, '#000000', 'ALL is black');
    ctx.assert.equal(out.full.tinted, true, 'the chat header is tinted');

    for (const part of ['card', 'open', 'head', 'lit', 'hpr']) {
      ctx.assert.ok(out.full[part] > 40, `${part} in a colour: ${JSON.stringify(out.full)}`);
    }

    ctx.assert.ok(
      out.full.dots.some(spread => spread > 40) && out.full.code.every(spread => spread > 40),
      `the lanes' marks and the code in colour: ${JSON.stringify(out.full)}`,
    );

    ctx.assert.deepEqual(
      [out.full.num, out.full.you],
      [0, 0],
      'on the open row, its project’s colour solid, the number and your mark white (2026-11-01)',
    );

    ctx.assert.ok(out.full.pr > 40, "its square its state's colour there too");
    await ctx.shot('full');
    // …and on the row when another chat is open: the square its state's green, your mark its colour
    await ctx.openChat(busy.id);
    await ctx.settle();
    out.rest = await look();

    ctx.assert.ok(
      out.rest.pr > 40 && out.rest.you > 40,
      `the PR's square and your mark in their colours off the open row: ${JSON.stringify(out.rest)}`,
    );

    await ctx.openChat(onPr.id);
    await ctx.waitFor(`document.querySelector('#log .hljs-keyword')`, { what: 'the code again' });
    await ctx.settle();

    // 2 · the setup is where a colour is set: its square shows it
    await paint({ 'calm-repo': { abbr: 'CR', color: COLOR } });
    await ctx.cmd('Comma');
    await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
    await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="setup"]').click()`);

    await ctx.waitFor(`document.querySelector('#setup .srow.proj[data-name="calm-repo"] .stile')`, {
      what: "the project's row in the setup",
    });

    out.tile = await ctx.evaluate(
      `document.querySelector('#setup .srow.proj[data-name="calm-repo"] .stile').style.background`,
    );

    ctx.assert.ok(chroma(out.tile) > 40, `the setup's square in the project's colour: ${out.tile}`);
    await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="general"]').click()`);
    await ctx.cmd('Comma');
    await ctx.waitFor(`!document.querySelector('#settings').open`, { what: 'the settings closed' });

    // 3 · black, picked at the chat header's square: written into the setup, and what was black beside it is grey, in
    // both themes
    const scheme = dark =>
      ctx.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }],
      });

    const frame = () =>
      ctx
        .evaluate(
          `JSON.stringify({ dark: document.querySelector('#main').classList.contains('darkchat'),
      lift: (c => { const p = document.createElement('i'); p.style.color = 'var(--lift)'; c.append(p); const v = getComputedStyle(p).color; p.remove(); return v; })(document.querySelector('#slist > .card.active')),
      wash: getComputedStyle(document.querySelector('#slist > .card.active')).getPropertyValue('--wash') })`,
        )
        .then(JSON.parse);

    out.mid = await frame();

    ctx.assert.equal(
      out.mid.dark,
      false,
      `a colour that is not black is not the black chat: ${JSON.stringify(out.mid)}`,
    );

    await ctx.evaluate(`document.querySelector('#shead .sq.pick').click()`);

    await ctx.evaluate(
      `(i => { i.value = '#000000'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); })(document.querySelector('#colorInput'))`,
    );

    await ctx.waitFor(`document.querySelector('#main').classList.contains('darkchat')`, {
      what: 'the open chat in black',
    });

    await waitFor(async () => (await setupColor()) === '#000000', {
      what: "the square's black written into the setup",
    });

    await ctx.settle();

    for (const dark of [true, false]) {
      await scheme(dark);

      await ctx.waitFor(`document.documentElement.dataset.theme === '${dark ? 'dark' : 'light'}'`, {
        what: 'the board in that appearance',
      });

      await ctx.sleep(100);
      out[dark ? 'blackDark' : 'blackLight'] = await frame();
    }

    // the card's edge, glow and border wear the colour as it reads on the panel (2026-10-09, late night): in the dark a
    // black is a grey there, its lightness held at .62; on the light panel it is black as set
    ctx.assert.deepEqual(
      [out.blackDark.lift, out.blackLight.lift],
      ['oklch(0.62 0 0)', 'oklch(0 0 0)'],
      `the black card's lit colour: ${JSON.stringify([out.blackDark, out.blackLight])}`,
    );

    // …its ground black all the same (towards morning), but under the pointer, which lights it in that grey
    ctx.assert.equal(out.blackDark.wash, 'rgb(0, 0, 0)', "the open black card's glow is its black");
    await scheme(true);

    const open = await ctx
      .evaluate(
        `JSON.stringify((b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }))(document.querySelector('#slist > .card.active').getBoundingClientRect()))`,
      )
      .then(JSON.parse);

    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: open.x, y: open.y });

    await ctx.waitFor(
      `getComputedStyle(document.querySelector('#slist > .card.active')).getPropertyValue('--wash') === 'oklch(0.62 0 0)'`,
      { what: 'the black card lit in grey under the pointer' },
    );

    await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1000, y: 500 });
    await ctx.shot('black');

    // 4 · ⌥-click on the square takes the colour off: the project has none, its short name stays
    await ctx.evaluate(
      `document.querySelector('#shead .sq.pick').dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true, cancelable: true }))`,
    );

    await waitFor(async () => (await setupColor()) === undefined, { what: 'the colour taken off' });

    ctx.assert.deepEqual(
      (await ctx.server.api('api/config')).body.projects,
      { 'calm-repo': { abbr: 'CR' } },
      'the short name kept',
    );

    await ctx.waitFor(`!document.querySelector('#main').classList.contains('darkchat')`, { what: 'no black any more' });

    out.none = await ctx.evaluate(
      `document.querySelector('#slist > .card[data-id="${busy.id}"]').style.getPropertyValue('--repo')`,
    );

    ctx.assert.equal(out.none, '', 'the cards wear no colour of their own');
    return out;
  } finally {
    for (const child of sleeps) child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}
