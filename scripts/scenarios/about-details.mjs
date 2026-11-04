// About's Copy details (2026-11-04): what the page knows, in a browser and over the bridge. The shell's own word is
// shell-checks/details.mjs's; here an app that says nothing, older than the page, says that much.
export const meta = { server: true, fixture: 'auto' };
export default async function (ctx) {
  const [, plain] = ctx.fixture.chats;
  await ctx.openChat(plain.id);
  const clip = `window.__clip = []; navigator.clipboard.writeText = t => { window.__clip.push(t); return Promise.resolve(); }`;
  await ctx.evaluate(clip);
  await ctx.evaluate(`document.querySelector('#sbar .conn').click()`);
  await ctx.waitFor(`document.querySelector('#about').open`, { what: 'About' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#aboutDetails').hidden`), true, 'the details out of the way until asked');
  await ctx.evaluate(`document.querySelector('#aboutCopy').click()`);
  await ctx.waitFor(`document.querySelector('#aboutCopy').textContent === 'Copied'`, { what: 'the button says so' });
  const text = await ctx.evaluate(`document.querySelector('#aboutDetails').textContent`);
  ctx.assert.equal(await ctx.evaluate(`window.__clip[0]`), text, 'what is in sight is what went');
  ctx.assert.match(text, /^peixAIrada /, 'which board');
  ctx.assert.match(text, /^a browser: /m, 'a browser says it is one');
  ctx.assert.match(text, /^column: one half · tabs chat \| none · the keys in half 1$/m, 'the column');
  for (const word of [ctx.url, '/Users', '/private', 'Plain chat', plain.id]) ctx.assert.ok(!text.includes(word), `no address, path or chat: ${word}`);
  await ctx.shot('about');
  await ctx.evaluate(`document.querySelector('#about').close()`);

  // The clipboard saying no: selected, for ⌘C, and the button says that.
  await ctx.evaluate(`navigator.clipboard.writeText = () => Promise.reject(new Error('no')); document.execCommand = () => false; document.querySelector('#sbar .conn').click()`);
  await ctx.waitFor(`document.querySelector('#about').open`, { what: 'About again' });
  await ctx.evaluate(`document.querySelector('#aboutCopy').click()`);
  await ctx.waitFor(`document.querySelector('#aboutCopy').textContent === 'Select it and ⌘C'`, { what: 'the button saying what to do' });
  ctx.assert.equal(await ctx.evaluate(`getSelection().toString().startsWith('peixAIrada ')`), true, 'and it is selected');
  await ctx.evaluate(`document.querySelector('#about').close()`);

  // In the app, an app older than the page: nothing comes back, and that is said; a page tab is its kind alone.
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };` });
  await ctx.reload();
  await ctx.openChat(plain.id);
  await ctx.evaluate(`document.querySelector('#sbar .conn').click()`);
  await ctx.waitFor(`document.querySelector('#about').open && window.__posts.some(m => m.type === 'details')`, { what: 'the shell asked' });
  ctx.assert.match(await ctx.evaluate(`peix.details()`), /^the app: says nothing of its window, so older than this page/m, 'an older app');
  await ctx.evaluate(`window.peixDetails({ macos: 'Version 27.2', app: '0.1.900', mode: 'window', w: 1440, h: 900, inset: 32, zoom: 1, screens: 2, screen: [1728, 1117, 2], housing: true, views: [[700, 122, 521, 691]] })`);
  const told = await ctx.evaluate(`peix.details()`);
  ctx.assert.match(told, /^window: a normal window, 1440×900, the page 32 pt down, zoom 1$/m, 'its word');
  ctx.assert.match(told, /^screen: 1728×1117 @2×, a camera housing, 2 in all$/m, 'its screen');
  await ctx.evaluate(`document.querySelector('#about').close()`);
  return { text };
}
