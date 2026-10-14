// Themes (2026-10-10). A folder with a Peacock blue and a chat in it. What this checks: ⌥⌘Y opens the grid on the theme
// worn (the board's own); an arrow previews the next — the root wears its data-skin, the tokens follow, the card's blue
// moves to the theme's own blue, the header's black and the status bar's ground are the theme's darkest — and Esc puts
// the board's own back. ⏎ wears one whatever the system shows (2026-10-12): a dark theme stays dark when the system
// turns light, a light one is light in a dark system, a reload keeps it, and the first paint is it (the head's script).
// Following macOS (the switch) wears each appearance's slot, which a pick fills; a theme of the other appearance still
// previews.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

const dir = tmpDir('peix-themes-'), cwd = join(dir, 'blue-repo');
const BLUE = '#3b7ddd';
mkdirSync(join(cwd, '.vscode'), { recursive: true });
writeFileSync(join(cwd, '.vscode', 'settings.json'), JSON.stringify({ 'peacock.color': BLUE }));

export const meta = { server: true, fixture: 'auto', prefs: { skinFollow: false } };   // the board's own: the harness follows the system

export default async function (ctx) {
  const out = {}, now = Date.now();
  const { chats } = makeFixture(ctx.fixture.dir, [{ cwd, title: 'A blue chat', prompt: 'paint it', reply: 'Painted.\n\n```js\nconst blue = 1;\n```', at: new Date(now - 60_000) }]);
  const [chat] = chats;
  const media = dark => ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  const root = v => ctx.evaluate(`getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(v)}).trim()`);
  const skin = () => ctx.evaluate(`document.documentElement.dataset.skin || null`);
  const repo = () => ctx.evaluate(`document.querySelector('#slist > .card[data-id="${chat.id}"]')?.style.getPropertyValue('--repo') || null`);
  const keyIn = k => ctx.evaluate(`document.querySelector('#themeq').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }))`);
  const escape = () => ctx.evaluate(`document.querySelector('#themeq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))`);
  const look = () => ctx.evaluate(`document.documentElement.dataset.theme`);
  const pick = async (q, k) => {
    await ctx.key('KeyY');
    await ctx.waitFor(`document.querySelector('#themes').open`, { what: `the grid, for ${q}` });
    await ctx.fill('#themeq', q);
    await ctx.waitFor(`document.documentElement.dataset.skin === ${JSON.stringify(k)}`, { what: `${q} previewed` });
  };
  const follow = async on => { await ctx.evaluate(`(b => b.checked === ${on} || b.click())(document.querySelector('#skinFollow'))`); await ctx.waitFor(`window.peix.prefs().skinFollow === ${on}`, { what: `follow macOS ${on ? 'on' : 'off'}` }); };

  await media(true);
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${chat.id}"]')?.style.getPropertyValue('--repo') === '${BLUE}'`, { what: "the folder's Peacock blue", timeout: 10000 });
  await ctx.openChat(chat.id);
  ctx.assert.equal(await skin(), null, 'no theme to begin with');
  out.ownBg = await root('--bg');

  // ⌥⌘Y: the grid, on the board's own; → previews Tokyo Night, the board behind wears it
  await ctx.key('KeyY');
  await ctx.waitFor(`document.querySelector('#themes').open && document.querySelectorAll('#themegrid .tt').length === 14`, { what: 'the grid of themes' });
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#themegrid .tt.sel .nm').textContent`), /peixAIrada.*worn.*dark/, 'the board’s own dark, worn, is selected');
  await keyIn('ArrowRight');
  await ctx.waitFor(`document.documentElement.dataset.skin === 'tokyo-night'`, { what: 'the preview' });
  ctx.assert.equal(await root('--bg'), '#1a1b26', "Tokyo Night's ground");
  ctx.assert.equal(await repo(), '#7aa2f7', 'the blue project in the theme’s blue');
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#shead'), '::after').backgroundColor`), 'rgb(22, 22, 30)', "the header's black is the theme's crust");
  await ctx.settle(); await ctx.shot('preview');
  await escape();
  await ctx.waitFor(`!document.querySelector('#themes').open && !document.documentElement.dataset.skin`, { what: 'Esc puts the board’s own back' });
  ctx.assert.equal(await repo(), BLUE, 'the blue back as set');

  // ⏎ wears Gruvbox
  await pick('gruv', 'gruvbox');
  await keyIn('Enter');
  await ctx.waitFor(`!document.querySelector('#themes').open && document.documentElement.dataset.skin === 'gruvbox'`, { what: 'Gruvbox kept' });
  ctx.assert.deepEqual((({ skin, skinDark, look }) => ({ skin, skinDark, look }))(await ctx.peix('prefs()')), { skin: 'gruvbox', skinDark: 'gruvbox', look: 'dark' });
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#sbar')).backgroundColor`), 'rgb(29, 32, 33)', "the status bar on the theme's crust");
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#themeNames').textContent`), /^Gruvbox$/);
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${chat.id}"]')?.style.getPropertyValue('--repo') === '#83a598'`, { what: "the blue in Gruvbox's blue" });
  await ctx.settle(); out.shot = await ctx.shot('gruvbox');

  // the system turns light: the board stays in Gruvbox, dark; a dark theme previews in the light
  await media(false); await ctx.sleep(300);
  ctx.assert.deepEqual([await skin(), await look(), await root('--bg')], ['gruvbox', 'dark', '#282828'], 'Gruvbox, dark, in a light system');
  await pick('nord', 'nord');
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#themenote').textContent`), /^Nord — ⏎ wears it$/);
  await escape();
  await ctx.waitFor(`!document.querySelector('#themes').open && document.documentElement.dataset.skin === 'gruvbox'`, { what: 'Gruvbox back' });

  // the system dark again, a light theme picked: the board light in a dark system — its tokens and its native controls
  await media(true);
  await pick('latte', 'catppuccin-latte');
  await keyIn('Enter');
  await ctx.waitFor(`!document.querySelector('#themes').open && document.documentElement.dataset.skin === 'catppuccin-latte'`, { what: 'Latte kept' });
  ctx.assert.deepEqual([await look(), await root('--bg'), await ctx.evaluate(`getComputedStyle(document.documentElement).colorScheme`)], ['light', '#eff1f5', 'light'], "Latte's ground, light, in a dark system");
  ctx.assert.deepEqual((({ skin, skinDark, skinLight, look }) => ({ skin, skinDark, skinLight, look }))(await ctx.peix('prefs()')), { skin: 'catppuccin-latte', skinDark: 'gruvbox', skinLight: 'catppuccin-latte', look: 'light' }, 'worn, and kept in the light slot');
  await ctx.settle(); await ctx.shot('latte');

  // a reload keeps it; the head's script paints the first frame in it — or in the system's, following it or with no prefs
  await ctx.reload();
  await ctx.waitFor(`document.documentElement.dataset.skin === 'catppuccin-latte'`, { what: 'Latte after a reload' });
  ctx.assert.equal(await look(), 'light', 'light after a reload, in a dark system');
  out.head = JSON.parse(await ctx.evaluate(`JSON.stringify((src => [[{ look: 'light' }, true], [{ look: 'light', skinFollow: true }, true], [{ look: 'dark' }, false], [null, false], ['{', true]].map(([p, dark]) => {
    const doc = { documentElement: { dataset: {} } };
    new Function('localStorage', 'matchMedia', 'document', src)({ getItem: () => p === null ? null : typeof p === 'string' ? p : JSON.stringify(p) }, () => ({ matches: dark }), doc);
    return doc.documentElement.dataset.theme;
  }))(document.head.querySelector('script').textContent))`));
  ctx.assert.deepEqual(out.head, ['light', 'dark', 'dark', 'light', 'dark'], 'the first paint: the look kept, else the system');

  // following macOS: each appearance its slot — Gruvbox in the dark, Latte in the light
  await follow(true);
  await ctx.waitFor(`document.documentElement.dataset.skin === 'gruvbox'`, { what: 'the dark slot in a dark system' });
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#themeNames').textContent`), /Gruvbox while macOS is dark · Catppuccin Latte while light/);
  await media(false);
  await ctx.waitFor(`document.documentElement.dataset.skin === 'catppuccin-latte' && document.documentElement.dataset.theme === 'light'`, { what: 'the light slot in a light system' });
  // a dark theme picked in the light shows while previewed, and is kept for the dark
  await pick('nord', 'nord');
  ctx.assert.equal(await look(), 'dark', 'Nord previewed, dark, in a light system');
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#themenote').textContent`), /keeps it for when macOS is dark/);
  await keyIn('Enter');
  await ctx.waitFor(`!document.querySelector('#themes').open && document.documentElement.dataset.skin === 'catppuccin-latte'`, { what: 'Latte still worn in the light' });
  ctx.assert.equal((await ctx.peix('prefs()')).skinDark, 'nord', 'Nord kept for the dark');
  await media(true);
  await ctx.waitFor(`document.documentElement.dataset.skin === 'nord'`, { what: 'Nord in the dark' });

  // following off: what is worn stays, whatever the system does next
  await follow(false);
  await media(false); await ctx.sleep(300);
  ctx.assert.deepEqual([await skin(), await look()], ['nord', 'dark'], 'Nord kept, dark, in a light system');

  // a tile clicked spreads its theme in a circle from where it was (2026-10-11): a view transition, the new page clipped
  await ctx.key('KeyY');
  await ctx.waitFor(`document.querySelector('#themes').open`, { what: 'the grid, to click in' });
  await ctx.settle();
  const tp = await ctx.evaluate(`(b => (r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }))(b.getBoundingClientRect()))([...document.querySelectorAll('#themegrid .tt')].find(b => /Tokyo Night/.test(b.textContent)))`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: tp.x, y: tp.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await ctx.waitFor(`!document.querySelector('#themes').open && document.documentElement.dataset.skin === 'tokyo-night'`, { what: 'Tokyo Night kept by a click' });
  await ctx.waitFor(`window.peix.motion().some(m => m.kind === 'look')`, { what: 'spread from the tile (the transition is ready a frame after its change)', timeout: 3000 });
  return out;
}
