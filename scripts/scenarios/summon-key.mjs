// The fish's menu from anywhere (2026-11-01, round XIX's M2): Settings › General records a key and the app registers it. What
// this checks: no key by default, none but the app shows the row, a key needs two modifiers or to be an F key, the board's
// own are refused, a key is told to the app and told again at each load, Clear takes it back. The hot key itself is
// Carbon's and the menu AppKit's, which the app's own probe and your own hands try.
export const meta = { server: true, fixture: 'auto' };
const HUB = `window.__posts = []; window.webkit = { messageHandlers: { hub: { postMessage: m => window.__posts.push(m) } } };`;

export default async function (ctx) {
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#fishRow').hidden`), true, 'in a browser the row is not shown');
  await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: HUB });
  await ctx.reload();
  const told = () => ctx.evaluate(`JSON.stringify(window.__posts.filter(m => m.type === 'summon').pop())`).then(JSON.parse);
  ctx.assert.deepEqual(await told(), { type: 'summon', code: '', mods: [] }, 'no key by default');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#fishRow').hidden`), false, 'in the app it is');
  await ctx.cmd('Comma'); await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
  const press = (code, key, m) => ctx.evaluate(`dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', key: '${key}', bubbles: true, cancelable: true, ${m} }))`);
  const btn = () => ctx.evaluate(`document.querySelector('#summonSet').textContent`);
  await ctx.evaluate(`document.querySelector('#summonSet').click()`);
  ctx.assert.equal(await btn(), 'Press the keys…');
  await press('KeyC', 'c', 'metaKey: true');
  ctx.assert.equal(await btn(), 'Press the keys…', '⌘C would take it from every other app: refused');
  await press('KeyT', 't', 'metaKey: true, altKey: true');
  ctx.assert.equal(await btn(), 'Press the keys…', "⌥⌘T is the board's: refused");
  await press('Escape', 'Escape', 'metaKey: false');
  ctx.assert.equal(await btn(), 'Set a key…', 'esc lets it go');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#settings').open`), true, 'and the dialog stays up');
  await ctx.evaluate(`document.querySelector('#summonSet').click()`);
  await press('KeyF', 'f', 'ctrlKey: true, altKey: true, metaKey: true');
  ctx.assert.equal(await btn(), '⌃⌥⌘F', 'the key, spelled');
  ctx.assert.deepEqual(await told(), { type: 'summon', code: 'KeyF', mods: ['ctrl', 'alt', 'cmd'] }, 'told to the app');
  await ctx.reload();
  ctx.assert.deepEqual(await told(), { type: 'summon', code: 'KeyF', mods: ['ctrl', 'alt', 'cmd'] }, 'and again at each load');
  await ctx.cmd('Comma'); await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
  await ctx.evaluate(`document.querySelector('#summonSet').click()`);
  await press('F18', 'F18', 'metaKey: false');
  ctx.assert.equal(await btn(), 'F18', 'an F key alone will do');
  await ctx.evaluate(`document.querySelector('#summonClear').click()`);
  ctx.assert.equal(await btn(), 'Set a key…');
  ctx.assert.deepEqual(await told(), { type: 'summon', code: '', mods: [] }, 'Clear takes it back');
  return 'ok';
}
