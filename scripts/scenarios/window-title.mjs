// The window is named after the open chat (2026-09-27, night): the page tells the shell the chat's project, title and
// folder whenever the chat header is drawn anew, and an empty column, so the app's window title (⌘Tab, Mission
// Control, the Window menu) and its represented folder (the title bar's proxy icon) follow. What this checks is the
// page's side of the bridge, faked as pane-tabs fakes it: one `chat` post per header, with the right words, and none
// for a render that leaves the header as it was.
export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.evaluate(`location.reload()`);
  await ctx.waitFor(`window.__posts && document.querySelectorAll('#slist > .card').length === 2`, { what: 'the board again, with the bridge' });
  const chats = () => ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'chat'))`).then(JSON.parse);
  const [a, b] = ctx.fixture.chats;
  ctx.assert.deepEqual(await chats(), [], 'nothing said with no chat open');

  await ctx.openChat(a.id);
  await ctx.waitFor(`window.__posts.some(m => m.type === 'chat')`, { what: 'the chat told to the shell' });
  out.first = await chats();
  ctx.assert.equal(out.first.length, 1, 'once');
  ctx.assert.deepEqual(out.first[0], { type: 'chat', project: 'peixairada', title: 'Two PRs mentioned', cwd: a.cwd }, 'its project, title and folder');

  // a render that leaves the header as it was says nothing more
  await ctx.evaluate(`window.peix && document.dispatchEvent(new Event('visibilitychange'))`);
  await ctx.sleep(300);
  ctx.assert.equal((await chats()).length, 1, 'still once after a render with the same header');

  await ctx.openChat(b.id);
  await ctx.waitFor(`window.__posts.filter(m => m.type === 'chat').length === 2`, { what: 'the second chat told' });
  out.second = (await chats())[1];
  ctx.assert.deepEqual([out.second.title, out.second.cwd], ['Plain chat', b.cwd], 'the second chat, its title and folder');
  return out;
}
