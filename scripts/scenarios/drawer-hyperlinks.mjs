// A link Claude Code writes in a drawer, clicked (2026-11-25): it writes every one as an OSC 8 hyperlink — a markdown
// link's words, a bare URL, a PR's —, and xterm asks its own provider for those before the web-links addon. Without a
// `linkHandler` that provider has only confirm() and window.open(), both a no in the app's view: no click on a link in a
// drawer opened anything. The fake claude draws such links (FAKE_SCREEN) with mouse tracking on, as the real one's full
// screen does; the app's bridge is faked as in links-out.mjs. What this checks: a page off the board's sites goes to the
// browser (`external`), a PR opens on its tab, and nothing asks confirm().
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpDir } from '../../lib/testserver.mjs';

const link = (url, words) => `\x1b]8;;${url}\x07${words}\x1b]8;;\x07`;
const screen = join(tmpDir(), 'screen.json');
writeFileSync(
  screen,
  JSON.stringify({
    screen: [
      '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h',
      `⏺ See ${link('https://example.com/docs', 'the docs')} for it.`,
      `⏺ Opened ${link('https://github.com/acme/repo-a/pull/12', 'PR twelve')} on GitHub.`,
      '',
    ],
  }),
);

export const meta = {
  server: true,
  fake: true,
  fixture: 'auto',
  env: { FAKE_SCREEN: screen },
  prefs: { pagesOut: true, linksMoved: true, boardSites: ['github.com'] },
};

export default async function (ctx) {
  const [chat] = ctx.fixture.chats;
  const out = {};
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__posts = []; window.__confirms = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };
      window.confirm = m => (window.__confirms.push(String(m)), false);`,
  });
  await ctx.reload();
  await ctx.openChat(chat.id);
  await ctx.evaluate(`document.querySelector('#termBtn').click()`);
  await ctx.waitFor(`window.peix.screen().some(r => r.includes('twelve'))`, { what: 'the links on the screen' });
  // the drawer at its size, and still: the attach's fit and nudge each draw every row again, which drops the link under
  // the pointer — a click then is on nothing
  for (let last = '', same = 0, t = Date.now(); same < 3; await ctx.sleep(200)) {
    const g = await ctx.evaluate(`JSON.stringify(window.peix.grid())`);
    same = g === last ? same + 1 : 0;
    last = g;
    if (Date.now() - t > 15_000) throw new Error(`the drawer never still: ${g}`);
  }
  await ctx.settle();
  const outs = () =>
    ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'external').map(m => m.url))`).then(JSON.parse);
  // a press and a release on a link's words, the pointer moved there first, as a hand does
  const click = async words => {
    const at = await ctx
      .evaluate(
        `(() => {
      const rows = window.peix.screen(), y = rows.findIndex(r => r.includes(${JSON.stringify(words)}));
      const x = rows[y].indexOf(${JSON.stringify(words)}) + 1, s = document.querySelector('#termBody .xterm-screen').getBoundingClientRect();
      const g = window.peix.grid();
      return JSON.stringify({ x: s.left + (x + 0.5) * s.width / g.cols, y: s.top + (y + 0.5) * s.height / g.rows });
    })()`,
      )
      .then(JSON.parse);
    // xterm drops the link under the pointer when its row is drawn again (the attach's repaint): moved onto it until
    // the pointer says it is on one
    for (let i = 0; ; i++) {
      for (const dx of [-30, 0])
        await ctx.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x + dx, y: at.y });
      await ctx.sleep(100);
      if (await ctx.evaluate(`!!document.querySelector('#termBody .xterm-screen.xterm-cursor-pointer')`)) break;
      if (i === 50) throw new Error(`the pointer never on the link ${words}`);
    }
    await ctx.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: at.x,
      y: at.y,
      button: 'left',
      clickCount: 1,
    });
    await ctx.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: at.x,
      y: at.y,
      button: 'left',
      clickCount: 1,
    });
    await ctx.sleep(150);
  };

  await click('docs'); // one word: the renderer's spaces are no-break ones
  out.docs = await outs();
  ctx.assert.deepEqual(out.docs, ['https://example.com/docs'], "a page off the board's sites goes to the browser");

  await click('twelve');
  await ctx.waitFor(`window.peix.state().tab === 'gh:https://github.com/acme/repo-a/pull/12'`, {
    what: 'the PR on its tab',
  });
  ctx.assert.deepEqual(await outs(), out.docs, 'the PR stayed in the board');
  out.confirms = await ctx.evaluate(`JSON.stringify(window.__confirms)`).then(JSON.parse);
  ctx.assert.deepEqual(out.confirms, [], 'nothing asked first');
  return out;
}
