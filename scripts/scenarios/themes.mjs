// Themes (2026-10-10). A folder with a Peacock blue and a chat in it. What this checks: ⌥⌘Y opens the grid on the theme
// worn (the board's own); an arrow previews the next — the root wears its data-skin, the tokens follow, the card's blue
// moves to the theme's own blue, the header's black and the status bar's ground are the theme's darkest — and Esc puts
// the board's own back. ⏎ keeps one in its appearance's slot: a dark theme is worn while the system is dark and not
// while it is light, where the light slot's is; a reload keeps both. "Exact project colours" leaves Peacock's blue as set.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFixture } from '../fixture.mjs';

const dir = mkdtempSync(join(tmpdir(), 'peix-themes-')), cwd = join(dir, 'blue-repo');
const BLUE = '#3b7ddd';
mkdirSync(join(cwd, '.vscode'), { recursive: true });
writeFileSync(join(cwd, '.vscode', 'settings.json'), JSON.stringify({ 'peacock.color': BLUE }));

export const meta = { server: true, fixture: 'auto' };

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

  // ⏎ keeps Gruvbox for the dark slot
  await ctx.key('KeyY');
  await ctx.waitFor(`document.querySelector('#themes').open`, { what: 'the grid again' });
  await ctx.fill('#themeq', 'gruv');
  await ctx.waitFor(`document.documentElement.dataset.skin === 'gruvbox'`, { what: 'the filtered preview' });
  await keyIn('Enter');
  await ctx.waitFor(`!document.querySelector('#themes').open && document.documentElement.dataset.skin === 'gruvbox'`, { what: 'Gruvbox kept' });
  ctx.assert.equal((await ctx.peix('prefs()')).skinDark, 'gruvbox');
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#sbar')).backgroundColor`), 'rgb(29, 32, 33)', "the status bar on the theme's crust");
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#themeNames').textContent`), /Gruvbox while dark/);

  // light: the dark theme is not worn; the light slot's is, once picked
  await media(false);
  await ctx.waitFor(`!document.documentElement.dataset.skin`, { what: 'no dark theme in the light' });
  await ctx.key('KeyY');
  await ctx.waitFor(`document.querySelector('#themes').open`, { what: 'the grid in the light' });
  await ctx.fill('#themeq', 'latte');
  await ctx.waitFor(`document.documentElement.dataset.skin === 'catppuccin-latte'`, { what: 'Latte previewed' });
  await keyIn('Enter');
  await ctx.waitFor(`!document.querySelector('#themes').open`, { what: 'Latte kept' });
  ctx.assert.equal(await root('--bg'), '#eff1f5', "Latte's ground");
  await ctx.settle(); await ctx.shot('latte');

  // a dark theme picked in the light says it cannot show, and is kept for the dark
  await ctx.key('KeyY');
  await ctx.waitFor(`document.querySelector('#themes').open`, { what: 'the grid once more' });
  await ctx.fill('#themeq', 'nord');
  await ctx.waitFor(`/cannot show now/.test(document.querySelector('#themenote').textContent)`, { what: 'the note for the other appearance' });
  ctx.assert.equal(await skin(), null, 'a dark theme does not show in the light');
  await escape();
  await ctx.waitFor(`document.documentElement.dataset.skin === 'catppuccin-latte'`, { what: 'Latte back' });

  // a reload keeps both; dark again is Gruvbox; exact colours leave the blue as set
  await ctx.reload();
  await ctx.waitFor(`document.documentElement.dataset.skin === 'catppuccin-latte'`, { what: 'Latte after a reload' });
  await media(true);
  await ctx.waitFor(`document.documentElement.dataset.skin === 'gruvbox'`, { what: 'Gruvbox in the dark' });
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${chat.id}"]')?.style.getPropertyValue('--repo') === '#83a598'`, { what: "the blue in Gruvbox's blue" });
  await ctx.evaluate(`document.querySelector('#skinExact').click()`);
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${chat.id}"]')?.style.getPropertyValue('--repo') === '${BLUE}'`, { what: 'the exact blue' });
  await ctx.evaluate(`document.querySelector('#skinExact').click()`);
  await ctx.settle(); out.shot = await ctx.shot('gruvbox');
  return out;
}
