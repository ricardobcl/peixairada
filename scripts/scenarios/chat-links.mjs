// Links in the chat (2026-09-26): a file path in a reply — /absolute, ./relative, folder/file.ext, ~/…, name.ext:line,
// one after Claude Code's @ — is an anchor that opens it in VS Code at that line, resolved against the chat's folder; a
// web URL is an anchor to the page (in the app, a tab of the chat). What only looks like a path stays text: and/or, a
// date, a version, a route, a domain. In the drawer the same paths are links, through a provider on the terminal
// (peix.links reads a line's). What this checks is the anchors of one reply, in order, and the link on a line the fake
// claude echoes. With Zed as the editor (2026-10-13, Settings › Board › editor) the same links are zed://file ones — the
// transcript drawn again at the switch —; ⌥⌘E stays VS Code Web (Zed has no web version for the pane), ··· has the folder
// in Zed beside it, and the settings say so under the pick (2026-10-13, later). ⌥⌘V opens the folder in the external
// editor's own window (2026-10-14: VS Code itself whichever was picked; 2026-10-21: Zed's, picked).
import { makeFixture } from '../fixture.mjs';

export const meta = { server: true, fake: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  const cwd = '/Users/me/proj/links-repo';   // a string in the transcript: nothing runs in it
  const reply = [
    'See https://example.com/docs/page?x=1&y=2, then src/app.js:42 and ./lib/x.mjs, /Users/me/proj/notes.md:7:3, ~/notes/todo.txt, plus .github/workflows/ci.yml and @/Users/me/a.txt.',
    'Not links: and/or, km/h, 12/09/2026, v2.1/api, /api/sessions, e.g. this, node 20.11.1, github.com/acme/x.js. A [file:3](src/y.ts#L3) too.',
    '', '```sh', 'cat /tmp/out/report.json', '```',
  ].join('\n');
  const { chats } = makeFixture(ctx.fixture.dir, [{ cwd, title: 'Links', prompt: 'where is it?', reply, at: new Date() }]);
  await ctx.waitFor(`!!document.querySelector('#slist > .card[data-id="${chats[0].id}"]')`, { what: 'the card of the chat just written' });
  await ctx.evaluate(`document.querySelector('#slist > .card[data-id="${chats[0].id}"]').click()`);
  await ctx.waitFor(`document.querySelectorAll('#log .msg').length >= 2`, { what: 'the transcript' });
  out.anchors = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#log a[href]')].map(a => [a.textContent, a.getAttribute('href'), a.target]))`).then(JSON.parse);
  ctx.assert.deepEqual(out.anchors, [
    ['https://example.com/docs/page?x=1&y=2', 'https://example.com/docs/page?x=1&y=2', '_blank'],
    ['src/app.js:42', `vscode://file${cwd}/src/app.js:42`, ''],
    ['./lib/x.mjs', `vscode://file${cwd}/lib/x.mjs`, ''],
    ['/Users/me/proj/notes.md:7:3', 'vscode://file/Users/me/proj/notes.md:7:3', ''],
    ['~/notes/todo.txt', 'vscode://file/Users/me/notes/todo.txt', ''],
    ['.github/workflows/ci.yml', `vscode://file${cwd}/.github/workflows/ci.yml`, ''],
    ['/Users/me/a.txt', 'vscode://file/Users/me/a.txt', ''],
    ['file:3', `vscode://file${cwd}/src/y.ts:3`, ''],
    ['/tmp/out/report.json', 'vscode://file/tmp/out/report.json', ''],
  ], 'every file and page an anchor, in order, and nothing that only looks like one');
  await ctx.shot('transcript');

  // Zed: the radio in the settings, the transcript's links drawn again for it, ··· with a row for Zed's own window
  await ctx.evaluate(`document.querySelector('#edPick [data-ed="zed"]').click()`);
  await ctx.waitFor(`!!window.peix.state().editors?.zed?.app`, { what: 'Zed installed — the test server\'s fake brew, into its own apps folder' });
  out.zed = await ctx.evaluate(`JSON.stringify({
    pref: window.peix.prefs().editor,
    checked: [...document.querySelectorAll('#edPick [data-ed]')].map(b => b.dataset.ed + ':' + b.getAttribute('aria-checked')),
    anchors: [...document.querySelectorAll('#log a[href]')].map(a => [a.textContent, a.getAttribute('href'), a.title]),
    rows: ['#webBtn', '#zedBtn'].map(q => document.querySelector(q + ' .lbl')?.textContent),
    said: document.querySelector('#edSay .edwhy')?.textContent || '',
  })`).then(JSON.parse);
  ctx.assert.equal(out.zed.pref, 'zed'); ctx.assert.deepEqual(out.zed.checked, ['vscode:false', 'zed:true']);
  ctx.assert.deepEqual(out.zed.anchors.map(a => a[1]), out.anchors.map(a => a[1].replace(/^vscode:/, 'zed:')), 'the same links, each a zed://file one');
  ctx.assert.equal(out.zed.anchors[1][2], `Open ${cwd}/src/app.js:42 in Zed`);
  ctx.assert.equal(out.zed.anchors[7][2], `Open ${cwd}/src/y.ts:3 in Zed`, 'the [file:3](…#L3) one too');
  ctx.assert.deepEqual(out.zed.rows, ['VS Code Web', 'its folder in Zed'], '··· keeps VS Code Web and adds the folder in Zed');
  ctx.assert.match(out.zed.said, /^Zed opens in its own window, outside the board .* ⌥⌘E stays VS Code Web/, 'the settings say what Zed is not');
  // what each opens, the browser's ways out caught: the folder in Zed followed as a link (the app hands it to the system),
  // ⌥⌘E still VS Code Web (its server asked, then its page)
  out.zed.opened = await ctx.evaluate(`(async () => {
    const seen = [], click = HTMLAnchorElement.prototype.click, open = window.open, f = window.fetch;
    HTMLAnchorElement.prototype.click = function () { seen.push(this.href); };
    window.open = u => { seen.push('window.open ' + u); };
    window.fetch = (u, o) => String(u).endsWith('/api/vscode-web') ? Promise.resolve(new Response('{"url":"http://127.0.0.1:1/"}', { headers: { 'content-type': 'application/json' } })) : f(u, o);
    try {
      document.querySelector('#zedBtn').click();
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', key: '◊', metaKey: true, altKey: true, bubbles: true, cancelable: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'π', metaKey: true, altKey: true, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 300));
    } finally { HTMLAnchorElement.prototype.click = click; window.open = open; window.fetch = f; }
    return JSON.stringify(seen);
  })()`).then(JSON.parse);
  ctx.assert.deepEqual(out.zed.opened, [`zed://file${cwd}`, `zed://file${cwd}`, `window.open http://127.0.0.1:1/?folder=${encodeURIComponent(cwd)}`], 'the folder in Zed from ··· and from ⌥⌘V, the external editor, and ⌥⌘E VS Code Web as ever');

  // in the drawer: the path on the line the fake echoes is a link with the same href, on the cells it occupies
  const live = ctx.fixture.chats[0];
  await ctx.openChat(live.id);
  await ctx.evaluate(`document.querySelector('#termBtn').click()`);
  await ctx.waitPrompt();
  await ctx.evaluate(`document.querySelector('#termBody textarea').dispatchEvent(new InputEvent('input', { data: 'look at src/app.js:42 please', inputType: 'insertText', bubbles: true }))`);
  await ctx.waitFor(`window.peix.buffer().some(l => l.includes('src/app.js:42'))`, { what: 'the path echoed on the screen' });
  out.drawer = await ctx.evaluate(`(() => {
    const b = window.peix.buffer(), y = b.findIndex(l => l.includes('src/app.js:42')) + 1, x = b[y - 1].indexOf('src/app.js:42') + 1;
    const cwd = window.peix.session(document.querySelector('#slist > .card.active').dataset.id).cwd;
    return JSON.stringify({ y, x, cwd, links: window.peix.links(y), blank: window.peix.links(y + 1) });
  })()`).then(JSON.parse);
  ctx.assert.deepEqual(out.drawer.links, [{ text: 'src/app.js:42', href: `zed://file${out.drawer.cwd}/src/app.js:42`, range: { start: { x: out.drawer.x, y: out.drawer.y }, end: { x: out.drawer.x + 'src/app.js:42'.length - 1, y: out.drawer.y } } }], 'the path on the screen is a link on its own cells, into the chat\'s folder — in Zed while it is the editor');
  ctx.assert.deepEqual(out.drawer.blank, [], 'a line without one has none');
  await ctx.evaluate(`document.querySelector('#edPick [data-ed="vscode"]').click()`);
  out.drawer.back = await ctx.evaluate(`JSON.stringify(window.peix.links(${out.drawer.y}).map(l => l.href))`).then(JSON.parse);
  ctx.assert.deepEqual(out.drawer.back, [`vscode://file${out.drawer.cwd}/src/app.js:42`], 'and VS Code again once it is picked back');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#webBtn .lbl').textContent`), 'VS Code Web');
  return out;
}
