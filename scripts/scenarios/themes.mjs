// Themes (2026-10-10), in families (2026-11-01, round XVII): a theme is a dark half and a light half, and Settings ›
// Appearance (Auto · Dark · Light) picks the half. A project painted blue in the setup and a chat in it. What this
// checks: ⌥⌘Y opens the grid of families on the one worn (the board's own); typing finds Black — the board's own on
// true black, its projects' colours as set —, an arrow previews the next, Tokyo Night — the root wears its data-skin,
// the tokens follow, the card's blue moves to the theme's own blue, the frame round the chat is the theme's darkest
// (every theme framed, round XVII's C1) — and Esc puts the board's own back. ⏎ wears a family in the appearance picked
// (2026-10-12): Dark stays dark when the system turns light, Light is light in a dark system, a reload keeps it, and
// the first paint is it (the head's script). Following macOS (Auto, the default) wears each appearance's half; a
// family typed for by its light half's name is found. Settings' swatches pick a family too, each split dark | light; a
// family with one half wears the board's own for the other. A board saved with the two slots, a frame or a theme gone
// comes over to a family.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture } from '../fixture.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

const dir = tmpDir('peix-themes-'), cwd = join(dir, 'blue-repo');
const BLUE = '#3b7ddd';
mkdirSync(cwd, { recursive: true });

export const meta = { server: true, fixture: 'auto', prefs: { skinFollow: false, look: 'dark' } };   // the board's own, dark: the harness follows the system

export default async function (ctx) {
  const out = {}, now = Date.now(), projects = { 'blue-repo': { color: BLUE } };
  await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projects }) });
  const { chats } = makeFixture(ctx.fixture.dir, [{ cwd, title: 'A blue chat', prompt: 'paint it', reply: 'Painted.\n\n```js\nconst blue = 1;\n```', at: new Date(now - 60_000) }]);
  const [chat] = chats;
  const media = dark => ctx.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  const root = v => ctx.evaluate(`getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(v)}).trim()`);
  const skin = () => ctx.evaluate(`document.documentElement.dataset.skin || null`);
  const repo = () => ctx.evaluate(`document.querySelector('#slist > .card[data-id="${chat.id}"]')?.style.getPropertyValue('--repo') || null`);
  const keyIn = k => ctx.evaluate(`document.querySelector('#themeq').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }))`);
  const escape = () => ctx.evaluate(`document.querySelector('#themeq').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))`);
  const look = () => ctx.evaluate(`document.documentElement.dataset.theme`);
  const prefs = async (...keys) => { const p = await ctx.peix('prefs()'); return Object.fromEntries(keys.map(k => [k, p[k] ?? null])); };
  const pick = async (q, k) => {
    await ctx.key('KeyY');
    await ctx.waitFor(`document.querySelector('#themes').open`, { what: `the grid, for ${q}` });
    await ctx.fill('#themeq', q);
    await ctx.waitFor(`(document.documentElement.dataset.skin || null) === ${JSON.stringify(k)}`, { what: `${q} previewed` });
  };
  const appearance = async m => { await ctx.evaluate(`document.querySelector('#lookPick [data-look="${m}"]').click()`); await ctx.waitFor(`window.peix.prefs().skinFollow === ${m === 'auto'}${m === 'auto' ? '' : ` && window.peix.prefs().look === '${m}'`}`, { what: `Appearance › ${m}` }); };
  /** Settings › Appearance as it reads: the appearance, the family picked and what its line says. */
  const pane = () => ctx.evaluate(`JSON.stringify({ mode: document.querySelector('#lookPick [aria-checked="true"]')?.dataset.look,
    theme: document.querySelector('#themePick [aria-checked="true"]')?.dataset.fam, say: document.querySelector('#themeSay').textContent })`).then(JSON.parse);
  const grounds = () => ctx.evaluate(`['body', '#sessions', '#sbar', '#chat'].map(s => getComputedStyle(document.querySelector(s)).backgroundColor).concat(getComputedStyle(document.querySelector('#chat')).marginTop)`);

  await media(true);
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${chat.id}"]')?.style.getPropertyValue('--repo') === '${BLUE}'`, { what: "the project's blue", timeout: 10000 });
  await ctx.openChat(chat.id);
  ctx.assert.deepEqual([await skin(), await look()], [null, 'dark'], 'the board’s own, dark, to begin with');
  out.ownBg = await root('--bg');

  // ⌥⌘Y: a tile a family, on the board's own; typed, Black (2026-10-30), the board's own on true black, its projects'
  // colours as set; then Tokyo Night, the board behind wearing its dark half
  await ctx.key('KeyY');
  await ctx.waitFor(`document.querySelector('#themes').open && document.querySelectorAll('#themegrid .tt').length === 12`, { what: 'the grid of families' });
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#themegrid .tt.sel .nm').textContent`), /^peixAIrada.*worn.*dark$/, 'the board’s own, worn, is selected');
  await keyIn('ArrowRight');
  await ctx.waitFor(`document.documentElement.dataset.skin === 'tokyo-night'`, { what: 'the preview' });
  ctx.assert.equal(await root('--bg'), '#1a1b26', "Tokyo Night's ground");
  ctx.assert.equal(await repo(), '#7aa2f7', 'the blue project in the theme’s blue');
  ctx.assert.deepEqual(await grounds(), ['rgb(22, 22, 30)', 'rgb(22, 22, 30)', 'rgb(22, 22, 30)', 'rgb(26, 27, 38)', '8px'], 'the frame its crust — the window, the list, the status bar —, the chat a sheet in it');
  await ctx.settle(); await ctx.shot('preview');
  await ctx.fill('#themeq', 'black');
  await ctx.waitFor(`document.documentElement.dataset.skin === 'black'`, { what: 'Black previewed' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#themegrid .tt').length`), 2, 'Black and Matte Black');
  ctx.assert.deepEqual([await root('--bg'), await root('--term-bg'), await repo()], ['#000000', '#000000', BLUE], 'Black: the ground and the terminal black, the blue project its own blue');
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#chat')).backgroundColor`), 'rgb(0, 0, 0)', 'the chat’s panel black');
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#log')).backgroundImage`), 'none', 'no wash over the transcript');
  await ctx.settle(); await ctx.shot('black');
  await escape();
  await ctx.waitFor(`!document.querySelector('#themes').open && !document.documentElement.dataset.skin`, { what: 'Esc puts the board’s own back' });
  ctx.assert.equal(await repo(), BLUE, 'the blue back as set');

  // ⏎ wears Gruvbox, its dark half under Dark
  await pick('gruv', 'gruvbox');
  await keyIn('Enter');
  await ctx.waitFor(`!document.querySelector('#themes').open && document.documentElement.dataset.skin === 'gruvbox'`, { what: 'Gruvbox kept' });
  ctx.assert.deepEqual(await prefs('theme', 'look', 'skinFollow', 'skin', 'skinDark'), { theme: 'gruvbox', look: 'dark', skinFollow: false, skin: null, skinDark: null });
  ctx.assert.deepEqual(await ctx.evaluate(`['#sbar', '#sessions'].map(s => getComputedStyle(document.querySelector(s)).backgroundColor)`), ['rgb(29, 32, 33)', 'rgb(29, 32, 33)'], 'the list and the status bar on the frame, Gruvbox’s crust');
  ctx.assert.deepEqual(await pane(), { mode: 'dark', theme: 'gruvbox', say: 'Gruvbox' }, 'Settings: Dark, Gruvbox');
  await ctx.waitFor(`document.querySelector('#slist > .card[data-id="${chat.id}"]')?.style.getPropertyValue('--repo') === '#83a598'`, { what: "the blue in Gruvbox's blue" });
  await ctx.settle(); out.shot = await ctx.shot('gruvbox');

  // the system turns light: the board stays in Gruvbox, dark
  await media(false); await ctx.sleep(300);
  ctx.assert.deepEqual([await skin(), await look(), await root('--bg')], ['gruvbox', 'dark', '#282828'], 'Gruvbox, dark, in a light system');

  // the system dark again, Light picked: the family's light half in a dark system — its tokens and its native controls
  await media(true);
  await appearance('light');
  await ctx.waitFor(`document.documentElement.dataset.skin === 'gruvbox-light'`, { what: 'Gruvbox Light' });
  ctx.assert.deepEqual([await look(), await root('--bg'), await ctx.evaluate(`getComputedStyle(document.documentElement).colorScheme`)], ['light', '#fbf1c7', 'light'], "Gruvbox Light's ground, light, in a dark system");
  ctx.assert.deepEqual(await pane(), { mode: 'light', theme: 'gruvbox', say: 'Gruvbox Light' }, 'Settings: Light, the same family');
  await ctx.settle(); await ctx.shot('gruvbox-light');

  // a reload keeps it; the head's script paints the first frame in it — or in the system's, following it or with no prefs
  await ctx.reload();
  await ctx.waitFor(`document.documentElement.dataset.skin === 'gruvbox-light'`, { what: 'Gruvbox Light after a reload' });
  ctx.assert.equal(await look(), 'light', 'light after a reload, in a dark system');
  out.head = JSON.parse(await ctx.evaluate(`JSON.stringify((src => [[{ look: 'light' }, true], [{ look: 'light', skinFollow: true }, true], [{ look: 'dark' }, false], [null, false], ['{', true]].map(([p, dark]) => {
    const doc = { documentElement: { dataset: {} } };
    new Function('localStorage', 'matchMedia', 'document', src)({ getItem: () => p === null ? null : typeof p === 'string' ? p : JSON.stringify(p) }, () => ({ matches: dark }), doc);
    return doc.documentElement.dataset.theme;
  }))(document.head.querySelector('script').textContent))`));
  ctx.assert.deepEqual(out.head, ['light', 'dark', 'dark', 'light', 'dark'], 'the first paint: the appearance picked, else the system');

  // following macOS: each appearance its half
  await appearance('auto');
  await ctx.waitFor(`document.documentElement.dataset.skin === 'gruvbox'`, { what: 'the dark half in a dark system' });
  ctx.assert.deepEqual(await pane(), { mode: 'auto', theme: 'gruvbox', say: 'Gruvbox while macOS is dark, Gruvbox Light while it is light' });
  await media(false);
  await ctx.waitFor(`document.documentElement.dataset.skin === 'gruvbox-light' && document.documentElement.dataset.theme === 'light'`, { what: 'the light half in a light system' });
  // a family found by its light half's name, previewed in the light, worn day and night
  await pick('latte', 'catppuccin-latte');
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#themenote').textContent`), 'Catppuccin — ⏎ wears it');
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#themegrid .tt.sel .nm').textContent`), /^Catppuccin.*Latte$/, 'the tile names the half it shows');
  await keyIn('Enter');
  await ctx.waitFor(`!document.querySelector('#themes').open && document.documentElement.dataset.skin === 'catppuccin-latte'`, { what: 'Latte kept in the light' });
  await media(true);
  await ctx.waitFor(`document.documentElement.dataset.skin === 'catppuccin'`, { what: 'Catppuccin’s dark half in the dark' });

  // a swatch in Settings: the family, its half of the appearance at once
  ctx.assert.deepEqual(await ctx.evaluate(`[...document.querySelectorAll('#themePick [data-fam]')].map(b => b.textContent)`),
    ['peixAIrada', 'Tokyo Night', 'Catppuccin', 'Gruvbox', 'Rosé Pine', 'Everforest', 'Kanagawa', 'Flexoki', 'Nord', 'Black', 'Matte Black', 'Softened'], 'a swatch a family, named');
  await ctx.evaluate(`document.querySelector('#themePick [data-fam="rose-pine"]').click()`);
  await ctx.waitFor(`document.documentElement.dataset.skin === 'rose-pine'`, { what: 'Rosé Pine from its swatch' });
  ctx.assert.equal((await prefs('theme')).theme, 'rose-pine', 'kept');
  await media(false);
  await ctx.waitFor(`document.documentElement.dataset.skin === 'rose-pine-dawn'`, { what: 'Rosé Pine Dawn in the light' });
  // a family of one half: Black's light is the board's own
  await ctx.evaluate(`document.querySelector('#themePick [data-fam="black"]').click()`);
  await ctx.waitFor(`window.peix.prefs().theme === 'black' && !document.documentElement.dataset.skin`, { what: 'Black, in the light the board’s own' });
  ctx.assert.deepEqual(await pane(), { mode: 'auto', theme: 'black', say: 'Black while macOS is dark, peixAIrada light while it is light' });
  await media(true);
  await ctx.waitFor(`document.documentElement.dataset.skin === 'black'`, { what: 'Black in the dark' });

  // a tile clicked spreads its theme in a circle from where it was (2026-10-11): a view transition, the new page clipped
  await ctx.key('KeyY');
  await ctx.waitFor(`document.querySelector('#themes').open`, { what: 'the grid, to click in' });
  await ctx.settle();
  const tp = await ctx.evaluate(`(b => (r => ({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }))(b.getBoundingClientRect()))([...document.querySelectorAll('#themegrid .tt')].find(b => /Tokyo Night/.test(b.textContent)))`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await ctx.send('Input.dispatchMouseEvent', { type, x: tp.x, y: tp.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await ctx.waitFor(`!document.querySelector('#themes').open && document.documentElement.dataset.skin === 'tokyo-night'`, { what: 'Tokyo Night kept by a click' });
  await ctx.waitFor(`window.peix.motion().some(m => m.kind === 'look')`, { what: 'spread from the tile (the transition is ready a frame after its change)', timeout: 3000 });

  // a board from before the families: the family of what it wore, the slots and Frame gone; a theme gone is the board's own
  const saved = async p => {
    await ctx.evaluate(`(p => { const k = 'peixairada-prefs', o = JSON.parse(localStorage.getItem(k) || '{}'); delete o.theme; delete o.darkFrame; localStorage.setItem(k, JSON.stringify({ ...o, ...p })); })(${JSON.stringify(p)})`);
    await ctx.reload();
    return prefs('theme', 'look', 'skinFollow', 'darkFrame', 'skin', 'skinDark', 'skinLight', 'frame');
  };
  const gone = { skin: null, skinDark: null, skinLight: null, frame: null };
  out.moved = [
    await saved({ skinFollow: true, skin: 'own-dark', skinDark: 'nord', skinLight: null, look: 'dark', frame: 'ink' }),
    await saved({ skinFollow: false, skin: 'catppuccin-latte', skinDark: 'gruvbox', skinLight: 'catppuccin-latte', look: 'light', frame: 'stage' }),
    await saved({ skinFollow: false, skin: 'osaka-jade', skinDark: 'osaka-jade', look: 'dark' }),
  ];
  ctx.assert.deepEqual(out.moved, [
    { theme: 'nord', look: 'dark', skinFollow: true, darkFrame: true, ...gone },
    { theme: 'catppuccin', look: 'light', skinFollow: false, darkFrame: false, ...gone },
    { theme: 'own', look: 'dark', skinFollow: false, darkFrame: false, ...gone },
  ], 'Auto with a dark slot: its family; Latte picked: Catppuccin, light; Osaka Jade: the board’s own');
  ctx.assert.equal(await ctx.evaluate(`'skinDark' in JSON.parse(localStorage.getItem('peixairada-prefs'))`), false, 'saved without the slots');
  return out;
}
