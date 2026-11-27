// A notification answered where it shows (2026-10-12; the app's banners, through the page's bridge): Reply… types
// into the chat's Claude in its drawer here — over a socket of its own when the chat is not the one open, which sends
// no size, so the drawer keeps its own — and Done is the card's ✓. The app's half (the categories, the actions, the
// snooze) is the system's to draw; this is the page's: window.peixReply and window.peixDone.
export const meta = { server: true, fake: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {};
  const [one, two] = ctx.fixture.chats;

  await ctx.openChat(two.id);
  await ctx.key('KeyC'); // ⌥⌘C: Claude on it, in a drawer here
  await ctx.waitPrompt();

  const size = () =>
    ctx.server
      .terminals()
      .then(ts => ts.filter(t => t.sessionId === two.id && t.exited === null).map(t => `${t.cols}x${t.rows}`)[0]);

  out.sizeBefore = await size();
  await ctx.openChat(one.id); // another chat in front: the drawer's chat is not the page's
  await ctx.sleep(400);

  ctx.assert.equal(
    await ctx.evaluate(`window.peixReply(${JSON.stringify(two.id)}, 'hello from a banner')`),
    true,
    'the reply went',
  );

  await ctx.waitFor(`window.peix.session(${JSON.stringify(two.id)})?.lastPrompt === 'hello from a banner'`, {
    timeout: 10_000,
    what: 'the reply, a prompt of the chat',
  });

  ctx.assert.equal(await size(), out.sizeBefore, "the drawer keeps its size: the reply's socket sent none");
  ctx.assert.equal(await ctx.evaluate(`window.peix.state().current`), one.id, '…and the page stayed where it was');

  // a chat with no drawer here: nothing sent, and said so
  ctx.assert.equal(
    await ctx.evaluate(`window.peixReply(${JSON.stringify(one.id)}, 'nowhere to go')`),
    false,
    'no drawer, no reply',
  );

  await ctx.waitFor(`window.peix.session(${JSON.stringify(two.id)})?.status === 'idle'`, {
    timeout: 10_000,
    what: 'the fake done replying',
  });

  // A banner is for its turn alone (2026-11-27, the external audit's lead 5): one from before the chat moved on — your
  // reply above is a word after it — sends nothing
  const said = () => ctx.evaluate(`document.querySelector('.note')?.textContent || ''`);

  ctx.assert.equal(
    await ctx.evaluate(`window.peixReply(${JSON.stringify(two.id)}, 'a stale banner', '2000-01-01T00:00:00.000Z')`),
    false,
    'a stale banner sends nothing',
  );

  out.stale = await said();
  ctx.assert.match(out.stale, /moved on/);
  // …nor one while the chat asks: a permission dialog takes ⏎ as its Yes
  const tid = (await ctx.server.terminals()).find(t => t.sessionId === two.id && t.exited === null).id;

  const keys = d =>
    ctx.evaluate(`new Promise(res => {
      const ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/api/terminals/${tid}/ws?key=' + encodeURIComponent(window.PEIX_KEY));
      ws.onopen = () => { ws.send(JSON.stringify({ t: 'in', d: ${JSON.stringify(d)} })); setTimeout(() => { ws.close(); res(true); }, 300); };
    })`); // your own keys, in its drawer

  await keys('/permission\r');

  await ctx.waitFor(`window.peix.session(${JSON.stringify(two.id)})?.status === 'needs-input'`, {
    timeout: 10_000,
    what: 'its permission dialog',
  });

  ctx.assert.equal(
    await ctx.evaluate(`window.peixReply(${JSON.stringify(two.id)}, 'thanks', new Date().toISOString())`),
    false,
    'a reply into a dialog sends nothing',
  );

  out.asking = await said();
  ctx.assert.match(out.asking, /asking you/);
  await ctx.sleep(800);

  ctx.assert.equal(
    await ctx.evaluate(`window.peix.session(${JSON.stringify(two.id)})?.status`),
    'needs-input',
    'the dialog still up: nothing answered it',
  );

  await keys('2'); // you answer it

  // Done: the card's ✓, once Claude is done with the reply
  await ctx.waitFor(`window.peix.session(${JSON.stringify(two.id)})?.status === 'idle'`, {
    timeout: 10_000,
    what: 'the fake done replying',
  });

  await ctx.evaluate(`window.peixDone(${JSON.stringify(two.id)})`);

  await ctx.waitFor(`window.peix.session(${JSON.stringify(two.id)})?.done === true`, {
    timeout: 10_000,
    what: 'ticked done from the banner',
  });

  return out;
}
