// Lunch (2026-10-18): the morning's menus read by the server (the fakes: a week's post, a story through the login, the
// Slack channel for a place with no Instagram), and what the page does with them — ⌥⌘M's chalkboard and again closing
// it, home's chalkboard before lunch time, Settings › Lunch (the places, the login, a place added), and at lunch time
// the sign in the fish's lane with the day's dishes scrolling under it, the sign opening the chalkboard, Going (ENJOY,
// the fish off the bar), a lock (BACK SOON), and back an hour later (FED, the fish swimming in, the server told).
import { writeFileSync } from 'node:fs';
import { waitFor } from '../../lib/testserver.mjs';

export const meta = { server: true, fixture: 'auto' };

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DAY = 86_400_000;
const hm = t => `${String(new Date(t).getHours()).padStart(2, '0')}:${String(new Date(t).getMinutes()).padStart(2, '0')}`;
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default async function (ctx) {
  const out = {}, now = Date.now(), env = ctx.server.env;
  writeFileSync(env.FAKEIG_FILE, JSON.stringify({ loggedIn: true, user: '4242', profiles: {
    'casa.place': { id: '11', storyAt: 0, posts: [{ code: 'C1', pk: '7001', at: now - 2 * DAY, caption: 'Partilhamos a ementa desta semana', alt: 'May be an image of text', image: PNG, url: 'https://www.instagram.com/p/C1/' }] },
    'ramen.place': { id: '22', storyAt: now - 3600_000, posts: [] },
  }, stories: { 'ramen.place': [{ pk: '9001', at: now - 3600_000, image: PNG, url: 'https://www.instagram.com/stories/ramen.place/9001/' }] } }));
  writeFileSync(env.FAKEREADER_FILE, JSON.stringify({
    reads: { 'ementa desta semana': { isMenu: true, kind: 'week', days: [{ date: dayKey(now), dishes: ['Sopa de penca', 'Salmão grelhado, batata e legumes', 'Pá de porco no forno com laranja'] }], price: '14,00 €', closed: null },
      'put this story': { isMenu: true, kind: 'day', days: [{ date: null, weekday: null, dishes: ['Creme de legumes', 'Tofu tikka masala', 'Brownie'] }], price: '12 €', closed: null } },
    slack: { places: [{ name: 'Trotas', dishes: ['Arroz de pato'], price: '11 €', postedAt: '11:40' }] } }));
  const places = [{ name: 'Casa', instagram: 'casa.place' }, { name: 'Ramen', instagram: 'ramen.place' }, { name: 'Trotas' }];
  const lunchCfg = { at: hm(now + 45 * 60_000), days: [0, 1, 2, 3, 4, 5, 6], places, stories: true, slack: '#lunch' };
  const put = lunch => ctx.server.api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lunch }) });
  ctx.assert.equal((await put(lunchCfg)).status, 200);
  await ctx.server.post('api/lunch', { act: 'read' });
  const lunch = async () => (await ctx.server.api('api/lunch')).body;
  await waitFor(async () => (await lunch()).places.every(p => p.state === 'menu'), { what: 'the three menus read' }).catch(async () => {
    const l = await lunch(); throw new Error(`not read: ${JSON.stringify(l.places.map(p => [p.name, p.state, p.error]))} ${l.error || ''}`);
  });
  await ctx.waitFor(`window.peix.state().snapshots > 0`, { what: 'the board' });

  // ⌥⌘M: the chalkboard, every place with its dishes and where they came from; again closes it
  await ctx.key('KeyM');
  await ctx.waitFor(`document.querySelector('#lunchd')?.open`, { what: 'the chalkboard' });
  out.board = await ctx.evaluate(`JSON.stringify([...document.querySelectorAll('#lunchBoard .lp')].map(p => [p.querySelector('h4').textContent, [...p.querySelectorAll('p.cdish > span:first-child')].map(x => x.textContent), p.querySelector('.cfrom')?.textContent]))`).then(JSON.parse);
  ctx.assert.deepEqual(out.board.map(p => p[0]), ['Casa', 'Ramen', 'Trotas']);
  ctx.assert.deepEqual(out.board[0][1], ['Sopa de penca', 'Salmão grelhado, batata e legumes', 'Pá de porco no forno com laranja']);
  ctx.assert.match(out.board[1][2], /^from its story · \d\d:\d\d$/);
  ctx.assert.match(out.board[2][2], /^from #lunch/);
  ctx.assert.match(await ctx.evaluate(`document.querySelector('#lunchFoot').textContent`), /Read at \d\d:\d\d, from Instagram, stories, #lunch.*Going/, 'the foot: when and where, and Going before lunch time');
  await ctx.settle(); await ctx.shot('1-chalkboard');
  await ctx.key('KeyM');
  await ctx.waitFor(`!document.querySelector('#lunchd').open`, { what: '⌥⌘M again closing it' });

  // home, before lunch time: the morning's menus on a chalkboard of its own
  await ctx.key('Digit0');
  await ctx.waitFor(`document.querySelector('#log .home .hlunch .chalk .lp')`, { what: 'home\'s chalkboard' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelectorAll('#log .home .hlunch .lp').length`), 3);
  await ctx.settle(); await ctx.shot('2-home');

  // Settings › Lunch: the places as rows, the stories on and logged in; a place added from the empty row
  await ctx.cmd('Comma');
  await ctx.evaluate(`document.querySelector('#settings .stabs [data-tab="lunch"]').click()`);
  await ctx.waitFor(`document.querySelectorAll('#lunchSet .srow.lplace:not(.add)').length === 3 && /Logged in/.test(document.querySelector('#lunchLoginRow')?.textContent)`, { what: 'the pane, logged in' });
  ctx.assert.equal(await ctx.evaluate(`document.querySelector('#lunchStories').checked && document.querySelector('#lunchAt').value`), lunchCfg.at);
  await ctx.evaluate(`(r => { r.querySelector('.lname').value = 'Semente'; r.querySelector('.lig').value = '@semente.place'; r.querySelector('.lig').dispatchEvent(new Event('change', { bubbles: true })); })(document.querySelector('#lunchSet .srow.lplace.add'))`);
  await waitFor(async () => (await ctx.server.api('api/config')).body.lunch?.places?.length === 4, { what: 'the place added' });
  const cfg = (await ctx.server.api('api/config')).body.lunch;
  ctx.assert.deepEqual(cfg.places.at(-1), { name: 'Semente', instagram: 'semente.place' }, 'its @ taken off');
  await ctx.settle(); await ctx.shot('3-settings');
  await ctx.evaluate(`document.querySelector('#settingsClose').click()`);
  await ctx.waitFor(`!document.querySelector('#settings').open`, { what: 'settings closed' });
  ctx.assert.equal((await put({ ...lunchCfg })).status, 200);   // back to the three

  // lunch time: the sign drops into the fish's lane, the dishes scroll under it, the sign opens the chalkboard
  ctx.assert.equal((await put({ ...lunchCfg, at: hm(Date.now() - 60_000) })).status, 200);
  await ctx.waitFor(`window.peix.lunch().sign === 'LUNCH' && window.peix.lunch().dishes === 3`, { what: 'the sign and three dishes in the lane' });
  out.tick = await ctx.evaluate(`document.querySelector('#sbSwim .ltick').textContent`);
  ctx.assert.match(out.tick, /Casa\s*Salmão grelhado, batata e legumes · 14,00 €/, 'a main, not the soup, and its price');
  await ctx.settle();
  const bar = await ctx.evaluate(`JSON.stringify(document.querySelector('#sbar').getBoundingClientRect())`).then(JSON.parse);
  await ctx.shot('4-lunch-bar', { x: 0, y: Math.round(bar.y) - 30, width: Math.round(bar.width), height: Math.round(bar.height) + 30 });
  await ctx.evaluate(`document.querySelector('#sbSwim .lsign').click()`);
  await ctx.waitFor(`document.querySelector('#lunchd').open && /lunch time/.test(document.querySelector('#lunchBoard .chsub').textContent)`, { what: 'the sign opening the chalkboard' });

  // Going: ENJOY, and the fish swims off the bar; the server knows
  await ctx.evaluate(`document.querySelector('#lunchFoot [data-lunch="going"]').click()`);
  await ctx.waitFor(`window.peix.lunch().sign === 'ENJOY' && window.peix.lunch().out`, { what: 'ENJOY, the fish off' });
  ctx.assert.equal((await lunch()).phase, 'went');
  ctx.assert.equal(await ctx.evaluate(`window.peix.lunch().dishes`), 0, 'no dishes scroll for nobody');
  await ctx.evaluate(`document.querySelector('#lunchd').close()`);
  await ctx.waitFor(`document.querySelector('#sbSwim').classList.contains('out')`, { what: 'the fish gone from the lane' });

  // locked, then back an hour on: BACK SOON while away, FED as the fish swims back in, the server told
  await ctx.evaluate(`window.peix.lunchAway(true, 60 * 60_000)`);
  ctx.assert.equal(await ctx.evaluate(`window.peix.lunch().sign`), 'BACK SOON');
  await ctx.evaluate(`window.peix.lunchAway(false)`);
  await ctx.waitFor(`/^FED · \\d+ MIN$/.test(window.peix.lunch().sign) && !window.peix.lunch().out`, { what: 'FED, the fish back' });
  out.fed = await ctx.evaluate(`window.peix.lunch().sign`);
  await waitFor(async () => (await lunch()).phase === 'back', { what: 'the server told' });
  ctx.assert.ok(await ctx.evaluate(`window.peix.motion().some(m => m.kind === 'lunch:fed')`), 'it swam in fed');
  await ctx.sleep(1200); await ctx.shot('5-fed', { x: 0, y: Math.round(bar.y) - 30, width: Math.round(bar.width), height: Math.round(bar.height) + 30 });
  await ctx.waitFor(`window.peix.lunch().sign === null`, { timeout: 12_000, what: 'the sign lifted' });
  return out;
}
