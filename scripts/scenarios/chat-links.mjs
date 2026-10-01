// Links in the chat (2026-09-26): a file path in a reply — /absolute, ./relative, folder/file.ext, ~/…, name.ext:line,
// one after Claude Code's @ — is an anchor that opens it in VS Code at that line, resolved against the chat's folder; a
// web URL is an anchor to the page (in the app, a tab of the chat). What only looks like a path stays text: and/or, a
// date, a version, a route, a domain. In the drawer the same paths are links, through a provider on the terminal
// (peix.links reads a line's). What this checks is the anchors of one reply, in order, and the link on a line the fake
// claude echoes.
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
  ctx.assert.deepEqual(out.drawer.links, [{ text: 'src/app.js:42', href: `vscode://file${out.drawer.cwd}/src/app.js:42`, range: { start: { x: out.drawer.x, y: out.drawer.y }, end: { x: out.drawer.x + 'src/app.js:42'.length - 1, y: out.drawer.y } } }], 'the path on the screen is a link on its own cells, into the chat\'s folder');
  ctx.assert.deepEqual(out.drawer.blank, [], 'a line without one has none');
  return out;
}
