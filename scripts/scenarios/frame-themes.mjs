// Round XV's themes (2026-11-01): the board's own lay the chat in a frame (T3), every theme too since round XVII (C1);
// the frame of the other appearance a switch, Settings › Appearance › Dark frame (T5's Ink, round XVII's D1; Stage, a
// paper frame round a dark chat, gone); Softened a light theme (T9); and every theme's small inks fitted to 4.5:1. A
// project painted blue and a chat in it. What this checks: in light the window's ground, the list and the
// status bar are the frame, the chat a sheet in it a step lighter — 8 px in, rounded. The dark frame turns it graphite
// round the light chat: the list and the status bar in the frame's own tokens, the cards reading the
// frame's appearance (their colour lifted as on dark), the chat and its header light; a reload paints it at once (the
// head's script); in dark the switch is off and says why. A theme is framed in its crust — Gruvbox, Softened —, and its
// light half's dark frame is its family's dark half: Tokyo Night round Tokyo Night Day, its list in Tokyo Night's
// tokens; Softened's, whose dark half is the board's own, the board's graphite. The inks hold 4.5:1 in every look,
// measured in the page (lib/inkcheck.mjs, as test/inks.test.mjs does).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture } from '../fixture.mjs';
import { INK_CHECK } from '../../lib/inkcheck.mjs';
import { tmpDir } from '../../lib/testserver.mjs';

const dir = tmpDir('peix-frame-'), cwd = join(dir, 'blue-repo');
const BLUE = '#3b7ddd';
mkdirSync(cwd, { recursive: true });

export const meta = { server: true, fixture: 'auto' };

export default async function (ctx) {
  const out = {}, now = Date.now();
  await ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projects: { 'blue-repo': { color: BLUE } } }) });
  const { chats } = makeFixture(ctx.fixture.dir, [{ cwd, title: 'A blue chat', prompt: 'paint it', reply: 'Painted.\n\n```js\nconst blue = 1;\n```', at: new Date(now - 60_000) }]);
  const [chat] = chats, card = `#slist > .card[data-id="${chat.id}"]`;
  await ctx.waitFor(`document.querySelector('${card}')?.style.getPropertyValue('--repo') === '${BLUE}'`, { what: "the project's blue", timeout: 10000 });
  await ctx.openChat(chat.id);
  const click = sel => ctx.evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const attrs = () => ctx.evaluate(`(({ theme, frame, skin, layout }) => ({ theme, frame, skin: skin || null, layout }))(document.documentElement.dataset)`);
  /** The grounds as drawn: the window's, the list's, the chat's, the status bar's; the sheet's shape;
   *  the list's ink; the dark frame's row as Settings has it. */
  const look = () => ctx.evaluate(`(() => { const cs = s => getComputedStyle(document.querySelector(s));
    return { body: cs('body').backgroundColor, list: cs('#sessions').backgroundColor, chat: cs('#chat').backgroundColor,
      bar: cs('#sbar').backgroundColor, sheet: [cs('#chat').marginTop, cs('#chat').marginRight, cs('#chat').borderTopLeftRadius].join(' '), ink: cs('#sessions').getPropertyValue('--ink').trim(),
      lift: getComputedStyle(document.querySelector('${card}')).getPropertyValue('--lift').includes('max(l') ? 'dark' : 'light',
      say: document.querySelector('#frameRow small').textContent, off: document.querySelector('#frameRow').classList.contains('off'),
      on: document.querySelector('#darkFrame').checked, can: !document.querySelector('#darkFrame').disabled }; })()`);
  const darkFrame = async on => { await click('#darkFrame'); await ctx.waitFor(`window.peix.prefs().darkFrame === ${on}`, { what: `the dark frame ${on ? 'on' : 'off'}` }); await ctx.settle(); };
  const appearance = async m => { await click(`#lookPick [data-look="${m}"]`); await ctx.waitFor(`document.documentElement.dataset.theme === '${m}'`, { what: `Appearance › ${m}` }); await ctx.settle(); };
  const theme = async (f, skin) => { await click(`#themePick [data-fam="${f}"]`); await ctx.waitFor(`(document.documentElement.dataset.skin || null) === ${JSON.stringify(skin)}`, { what: `${f} worn` }); await ctx.settle(); };

  // light: the frame is the window's ground, the list's and the status bar's; the chat a sheet in it, a step lighter
  await appearance('light');
  ctx.assert.deepEqual(await attrs(), { theme: 'light', frame: 'light', skin: null, layout: 'sidebar' }, 'the board’s own light');
  let l = await look();
  ctx.assert.deepEqual([l.body, l.list, l.bar], ['rgb(222, 220, 214)', 'rgb(222, 220, 214)', 'rgb(222, 220, 214)'], 'the frame round the chat');
  ctx.assert.deepEqual([l.chat, l.sheet], ['rgb(241, 240, 236)', '8px 8px 12px'], 'the chat a sheet 8 px in, rounded, a step lighter');
  ctx.assert.deepEqual([l.on, l.can, l.off, l.say], [false, true, false, 'A graphite frame round the light chat: the list and the status bar in the theme’s dark half'], 'Settings › Dark frame: off, to be switched on');
  out.matching = await ctx.shot('matching-light');

  // the dark frame: graphite round the light chat — the list and the status bar in the frame's tokens, the cards on dark
  await darkFrame(true);
  ctx.assert.deepEqual(await attrs(), { theme: 'light', frame: 'dark', skin: null, layout: 'sidebar' }, 'the frame dark, the chat light');
  l = await look();
  ctx.assert.deepEqual([l.body, l.list, l.bar, l.chat, l.lift], ['rgb(30, 30, 28)', 'rgb(30, 30, 28)', 'rgb(30, 30, 28)', 'rgb(241, 240, 236)', 'dark'], 'graphite round the light chat, the card lifted as on dark');
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#sessions')).colorScheme`), 'dark', 'the list’s own controls dark');
  out.ink = await ctx.shot('dark-frame-light');
  // the row as Settings shows it, among the theme's
  await ctx.cmd('Comma');
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
  await click('#stLook');
  await ctx.waitFor(`!document.querySelector('#spLook').hidden`, { what: 'Appearance' });
  await ctx.settle();
  out.settings = await ctx.shot('dark-frame-settings');
  await ctx.evaluate(`document.querySelector('#settings').close()`);
  await ctx.reload();
  ctx.assert.equal((await attrs()).frame, 'dark', 'the dark frame after a reload');
  // the head's script paints the first frame in it, in light only, whatever the theme
  out.head = JSON.parse(await ctx.evaluate(`JSON.stringify((src => [[{ look: 'light', darkFrame: true }, false], [{ look: 'dark', darkFrame: true }, false], [{ look: 'light', darkFrame: true, theme: 'tokyo-night' }, true],
    [{ skinFollow: true, darkFrame: true }, false], [{ skinFollow: true, darkFrame: true }, true], [{ look: 'light' }, true]].map(([p, dark]) => {
    const doc = { documentElement: { dataset: {} } };
    new Function('localStorage', 'matchMedia', 'document', src)({ getItem: () => JSON.stringify(p) }, () => ({ matches: dark }), doc);
    return doc.documentElement.dataset.theme + ' ' + doc.documentElement.dataset.frame;
  }))(document.head.querySelector('script').textContent))`));
  ctx.assert.deepEqual(out.head, ['light dark', 'dark dark', 'light dark', 'light dark', 'dark dark', 'light light'], 'the first paint: the dark frame in light');

  // in dark the switch is off, and says why: the frame Settings' grey, a step lighter than the chat (round XVIII), the
  // list's inks that fell under 4.5:1 on it lifted
  await appearance('dark');
  ctx.assert.deepEqual(await attrs(), { theme: 'dark', frame: 'dark', skin: null, layout: 'sidebar' });
  l = await look();
  ctx.assert.deepEqual([l.body, l.list, l.bar, l.chat], ['rgb(40, 40, 37)', 'rgb(40, 40, 37)', 'rgb(40, 40, 37)', 'rgb(28, 28, 26)'], 'dark: the frame Settings’ grey, the chat a step darker');
  ctx.assert.deepEqual(await ctx.evaluate(`['#sessions', '#chat'].map(s => getComputedStyle(document.querySelector(s)).getPropertyValue('--needs').trim())`), ['#fc6c6b', '#f36464'], 'the asking red lifted on the list, the chat’s as it was');
  ctx.assert.deepEqual([l.on, l.can, l.off, l.say], [true, false, true, 'Only in light: in dark the frame is dark already'], 'the switch kept, off in dark, with why');

  // a theme framed in its crust: Gruvbox
  await theme('gruvbox', 'gruvbox');
  l = await look();
  ctx.assert.deepEqual([l.body, l.list, l.bar, l.chat, l.sheet], ['rgb(29, 32, 33)', 'rgb(29, 32, 33)', 'rgb(29, 32, 33)', 'rgb(40, 40, 40)', '8px 8px 12px'], 'Gruvbox: its crust the frame, the chat a sheet in it');
  out.gruvbox = await ctx.shot('gruvbox-dark');

  // a light half in the dark frame: its family's dark half — Tokyo Night round Tokyo Night Day
  await theme('tokyo-night', 'tokyo-night');
  await appearance('light');
  await ctx.waitFor(`document.documentElement.dataset.skin === 'tokyo-day'`, { what: 'Tokyo Night Day' });
  ctx.assert.deepEqual(await attrs(), { theme: 'light', frame: 'dark', skin: 'tokyo-day', layout: 'sidebar' }, 'Tokyo Night Day in the dark frame');
  l = await look();
  ctx.assert.deepEqual([l.body, l.list, l.bar, l.chat, l.ink, l.lift], ['rgb(26, 27, 38)', 'rgb(26, 27, 38)', 'rgb(26, 27, 38)', 'rgb(225, 226, 231)', '#c0caf5', 'dark'],
    'the frame Tokyo Night’s ground, the list in its ink, round the Day’s chat');
  out.tokyo = await ctx.shot('tokyo-day-dark-frame');
  await darkFrame(false);
  l = await look();
  ctx.assert.deepEqual([l.body, l.list, l.chat, l.ink], ['rgb(208, 213, 227)', 'rgb(208, 213, 227)', 'rgb(225, 226, 231)', '#3760bf'], 'off: the Day’s own crust round its chat');

  // Softened, framed in its crust; in the dark frame the board's graphite (its dark half the board's own)
  await theme('softened', 'softened');
  ctx.assert.deepEqual(await attrs(), { theme: 'light', frame: 'light', skin: 'softened', layout: 'sidebar' }, 'Softened');
  l = await look();
  ctx.assert.deepEqual([l.body, l.list, l.chat, l.sheet], ['rgb(227, 226, 220)', 'rgb(227, 226, 220)', 'rgb(239, 238, 233)', '8px 8px 12px'], 'Softened: the whites gone, framed in its crust');
  out.softened = await ctx.shot('softened-light');
  await darkFrame(true);
  l = await look();
  ctx.assert.deepEqual([l.body, l.list, l.chat, l.lift], ['rgb(30, 30, 28)', 'rgb(30, 30, 28)', 'rgb(239, 238, 233)', 'dark'], 'Softened in the dark frame: the board’s graphite');

  // the inks: every look, each small ink against its grounds in the page
  const inks = JSON.parse(await ctx.evaluate(INK_CHECK));
  ctx.assert.ok(inks.worst[0].ratio >= 4.5, `inks under 4.5: ${inks.worst.filter(w => w.ratio < 4.5).map(w => `${w.look} · ${w.ink} on ${w.on} ${w.ratio}`).join('; ')}`);
  ctx.assert.equal((await attrs()).skin, 'softened', 'the check puts back what was worn');
  out.inks = `${inks.checked} pairs in ${inks.looks.length} looks, the lowest ${inks.worst[0].ratio} (${inks.worst[0].look} · ${inks.worst[0].ink} on ${inks.worst[0].on})`;
  return out;
}
