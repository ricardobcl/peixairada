// Round XV's themes (2026-11-01): the board's own lay the chat in a frame (T3), the frame of the other appearance a
// setting (Settings › Appearance › Frame: Matching · Ink, T5 · Stage, T6), Softened a light theme of the picker (T9),
// and every theme's small inks fitted to 4.5:1. A project painted blue and a chat in it. What this checks: in light the
// window's ground, the wallpaper, the list and the status bar are the frame, the chat a sheet in it a step lighter — 8 px
// in, rounded. Ink turns the frame graphite round the light chat:
// the list, the status bar and the wallpaper in the frame's own tokens, the cards reading the frame's appearance (their
// colour lifted as on dark), the chat and its header light; a reload paints it at once (the head's script); in dark Ink
// is Matching. Stage turns the frame paper round the dark chat. Under a theme of the picker the row is off and says why,
// and the board is flat — Softened, second in the light row, the whites gone and no frame. The inks hold 4.5:1 in
// every look, measured in the page (lib/inkcheck.mjs, as test/inks.test.mjs does).
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
  /** The grounds as drawn: the window's, the wallpaper's, the list's, the chat's, the status bar's; the sheet's shape. */
  const look = () => ctx.evaluate(`(() => { const cs = s => getComputedStyle(document.querySelector(s));
    return { body: cs('body').backgroundColor, wall: cs('#wall').getPropertyValue('--bg').trim(), list: cs('#sessions').backgroundColor, chat: cs('#chat').backgroundColor,
      bar: cs('#sbar').backgroundColor, sheet: [cs('#chat').marginTop, cs('#chat').marginRight, cs('#chat').borderTopLeftRadius].join(' '),
      lift: getComputedStyle(document.querySelector('${card}')).getPropertyValue('--lift').includes('max(l') ? 'dark' : 'light',
      say: document.querySelector('#frameSay').textContent, off: document.querySelector('#frameRow').classList.contains('off'),
      picked: document.querySelector('#framePick [aria-checked="true"]')?.dataset.fr }; })()`);
  const frame = async f => { await click(`#framePick [data-fr="${f}"]`); await ctx.waitFor(`window.peix.prefs().frame === '${f}'`, { what: `Frame › ${f}` }); await ctx.settle(); };
  const appearance = async m => { await click(`#lookPick [data-look="${m}"]`); await ctx.waitFor(`document.documentElement.dataset.theme === '${m}'`, { what: `Appearance › ${m}` }); await ctx.settle(); };

  // light, Ring (flat: Glass's list is the frame at 60 % over the wallpaper): the frame is the window's ground, the
  // wallpaper's, the list's and the status bar's; the chat a sheet in it, a step lighter
  await appearance('light');
  await click('#sideStylePick [data-sbs="ring"]');
  await ctx.waitFor(`document.documentElement.dataset.sidebar === 'ring'`, { what: 'Ring' });
  await ctx.settle();
  ctx.assert.deepEqual(await attrs(), { theme: 'light', frame: 'light', skin: null, layout: 'sidebar' }, 'the board’s own light');
  let l = await look();
  ctx.assert.deepEqual([l.body, l.wall, l.list, l.bar], ['rgb(222, 220, 214)', '#dedcd6', 'rgb(222, 220, 214)', 'rgb(222, 220, 214)'], 'the frame round the chat');
  ctx.assert.deepEqual([l.chat, l.sheet], ['rgb(241, 240, 236)', '8px 8px 12px'], 'the chat a sheet 8 px in, rounded, a step lighter');
  ctx.assert.deepEqual([l.picked, l.off, l.say], ['matching', false, 'Frame and chat in one appearance, the chat a step lighter'], 'Settings › Frame: Matching');
  out.matching = await ctx.shot('matching-light');

  // Ink: a graphite frame round the light chat — the list and the status bar in the frame's tokens, the cards on dark
  await frame('ink');
  ctx.assert.deepEqual(await attrs(), { theme: 'light', frame: 'dark', skin: null, layout: 'sidebar' }, 'Ink: the frame dark, the chat light');
  l = await look();
  ctx.assert.deepEqual([l.body, l.list, l.bar, l.chat, l.lift], ['rgb(30, 30, 28)', 'rgb(30, 30, 28)', 'rgb(30, 30, 28)', 'rgb(241, 240, 236)', 'dark'], 'Ink: graphite round the light chat, the card lifted as on dark');
  ctx.assert.match(l.say, /graphite frame round the light chat/);
  ctx.assert.equal(await ctx.evaluate(`getComputedStyle(document.querySelector('#sessions')).colorScheme`), 'dark', 'the list’s own controls dark');
  out.ink = await ctx.shot('ink-light');
  // the row as Settings shows it, among the theme's
  await ctx.cmd('Comma');
  await ctx.waitFor(`document.querySelector('#settings').open`, { what: 'the settings' });
  await click('#stLook');
  await ctx.waitFor(`!document.querySelector('#spLook').hidden`, { what: 'Appearance' });
  await ctx.settle();
  out.settings = await ctx.shot('ink-settings');
  await ctx.evaluate(`document.querySelector('#settings').close()`);
  await ctx.reload();
  ctx.assert.equal((await attrs()).frame, 'dark', 'Ink after a reload');
  // the head's script paints the first frame in it, the board's own only
  out.head = JSON.parse(await ctx.evaluate(`JSON.stringify((src => [[{ look: 'light', frame: 'ink' }, false], [{ look: 'dark', frame: 'ink' }, false], [{ look: 'dark', frame: 'stage' }, false],
    [{ look: 'light', frame: 'ink', skin: 'softened' }, false], [{ skinFollow: true, frame: 'stage', skinDark: 'nord' }, true], [{ skinFollow: true, frame: 'stage' }, true]].map(([p, dark]) => {
    const doc = { documentElement: { dataset: {} } };
    new Function('localStorage', 'matchMedia', 'document', src)({ getItem: () => JSON.stringify(p) }, () => ({ matches: dark }), doc);
    return doc.documentElement.dataset.theme + ' ' + doc.documentElement.dataset.frame;
  }))(document.head.querySelector('script').textContent))`));
  ctx.assert.deepEqual(out.head, ['light dark', 'dark dark', 'dark light', 'light light', 'dark dark', 'dark light'], 'the first paint: the frame of the board’s own');

  // in dark, Ink is Matching: a near-black frame, the chat a step up
  await appearance('dark');
  ctx.assert.deepEqual(await attrs(), { theme: 'dark', frame: 'dark', skin: null, layout: 'sidebar' });
  l = await look();
  ctx.assert.deepEqual([l.body, l.list, l.chat], ['rgb(14, 14, 13)', 'rgb(14, 14, 13)', 'rgb(28, 28, 26)'], 'dark: the frame near-black, the chat a step up');

  // Stage: a paper frame round the dark chat, the cards on light
  await frame('stage');
  ctx.assert.deepEqual(await attrs(), { theme: 'dark', frame: 'light', skin: null, layout: 'sidebar' }, 'Stage: the frame light, the chat dark');
  l = await look();
  ctx.assert.deepEqual([l.body, l.list, l.bar, l.chat, l.lift], ['rgb(233, 228, 217)', 'rgb(233, 228, 217)', 'rgb(233, 228, 217)', 'rgb(28, 28, 26)', 'light'], 'Stage: paper round the dark chat, the card as on light');
  ctx.assert.equal(l.wall, '#e9e4d9', 'the wallpaper paper too');
  out.stage = await ctx.shot('stage-dark');

  // a theme of the picker: the row off and why; the board flat — Softened, second in the light row
  await appearance('light');
  ctx.assert.deepEqual(await ctx.evaluate(`[...document.querySelectorAll('#lightPick [data-skin]')].slice(0, 2).map(b => b.dataset.skin + ' ' + b.title)`), ['own-light peixAIrada', 'softened Softened'], 'Softened beside the board’s own');
  await click('#lightPick [data-skin="softened"]');
  await ctx.waitFor(`document.documentElement.dataset.skin === 'softened'`, { what: 'Softened worn' });
  await ctx.settle();
  ctx.assert.deepEqual(await attrs(), { theme: 'light', frame: 'light', skin: 'softened', layout: 'sidebar' }, 'Softened: no frame of the other appearance');
  l = await look();
  ctx.assert.deepEqual([l.off, l.say, l.body, l.list, l.chat, l.sheet], [true, 'Only with the board’s own themes: a theme draws the board flat', 'rgb(239, 238, 233)', 'rgb(227, 226, 220)', 'rgb(239, 238, 233)', '0px 0px 0px'],
    'Softened: the row off with why; flat — the whites gone, the grounds two steps apart, no sheet');
  ctx.assert.equal(await ctx.evaluate(`[...document.querySelectorAll('#framePick [data-fr]')].every(b => b.disabled)`), true, 'its choices not to be picked');
  out.softened = await ctx.shot('softened-light');

  // the inks: every look, each small ink against its grounds in the page
  const inks = JSON.parse(await ctx.evaluate(INK_CHECK));
  ctx.assert.ok(inks.worst[0].ratio >= 4.5, `inks under 4.5: ${inks.worst.filter(w => w.ratio < 4.5).map(w => `${w.look} · ${w.ink} on ${w.on} ${w.ratio}`).join('; ')}`);
  ctx.assert.equal((await attrs()).skin, 'softened', 'the check puts back what was worn');
  out.inks = `${inks.checked} pairs in ${inks.looks.length} looks, the lowest ${inks.worst[0].ratio} (${inks.worst[0].look} · ${inks.worst[0].ink} on ${inks.worst[0].on})`;
  return out;
}
