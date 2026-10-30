// Zé's game and the board (2026-10-30, the next round, the ideas sheet's T picks). Today's lunch, read by the board from
// the fakes, falls in a round: its soup as a green, its fish as fish, its roast as a golden special under its real
// name and its place. A chat that lands while you play is kept for the K.O. A chat that starts asking stops the game with
// a card — esc plays on (the round's music back), and a second ask's ⏎ closes the game and opens that chat. The K.O. says
// what landed and asked, and posts a new best to the board's chat room (a fake GitHub), and on a Friday asks the week's
// poll from the scores posted there. With nothing waiting, Zé walks across All caught up, and a click on him opens
// his game.
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { waitFor } from '../../lib/testserver.mjs';
import { startFakeGitHub } from '../fakegithub.mjs';
import { makeFixture, replyLines, toolLines } from '../fixture.mjs';

const gh = await startFakeGitHub({ since: Date.now() - 3600_000, users: ['me', 'ana', 'rui'], orgs: { 'acme-chat': ['me'] }, repos: {
  'acme-chat/room': { perms: { ana: 'pull', rui: 'pull' }, rooms: [{ title: 'General', comments: [
    ['ana', "Zé's game: 900 on HARD, level 5 — a new best 🥋"], ['rui', "Zé's game: 300 on EASY, level 3 — today's best 🥋"], ['ana', 'lunch?']] }] } } });

export const meta = { server: true, fixture: 'auto', env: { GITHUB_API: gh.url, FAKEGH_VIEWER: 'me', CHAT_FAST_MS: '250', CHAT_SLOW_MS: '250', CHAT_GAP_MS: '30', REGISTRY_POLL_MS: '1200' } };

const hm = t => `${String(new Date(t).getHours()).padStart(2, '0')}:${String(new Date(t).getMinutes()).padStart(2, '0')}`;

export default async function (ctx) {
  const out = {}, env = ctx.server.env, sleeps = [0, 1].map(() => spawn('sleep', ['300'], { stdio: 'ignore' }));
  const press = async (code, key, vk) => {
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk });
    await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
  };
  const g = body => ctx.evaluate(`(() => { const g = window.peix.ze().g; ${body} })()`);
  const canvas = () => ctx.evaluate(`(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }))(document.querySelector('#zeCanvas').getBoundingClientRect())`);
  const json = { method: 'PUT', headers: { 'content-type': 'application/json' } };
  try {
    // the setup: the chat's room, and a lunch read from Slack's channel
    await ctx.server.api('api/config', { ...json, body: JSON.stringify({ chat: { repo: 'acme-chat/room' } }) });
    writeFileSync(env.FAKEIG_FILE, JSON.stringify({ loggedIn: true, user: '4242', profiles: {}, stories: {} }));
    writeFileSync(env.FAKEREADER_FILE, JSON.stringify({ reads: {}, slack: { places: [{ name: 'Trotas', dishes: ['Sopa de penca', 'Rojões à minhota', 'Bacalhau com natas', 'Pudim'], price: '11 €', postedAt: '11:40' }] } }));
    ctx.assert.equal((await ctx.server.api('api/config', { ...json, body: JSON.stringify({ lunch: { at: hm(Date.now() + 45 * 60_000), days: [0, 1, 2, 3, 4, 5, 6], places: [{ name: 'Trotas' }], stories: false, slack: '#lunch' } }) })).status, 200);
    await ctx.server.post('api/lunch', { act: 'read' });
    await waitFor(async () => (await ctx.server.api('api/lunch')).body.places.every(p => p.dishes?.length), { what: 'the menu read' });
    await waitFor(async () => (await ctx.server.api('api/chat')).body.room != null, { what: 'the room found' });
    // two chats at work: acme-api will ask, acme-web will land
    const at = new Date(Date.now() - 60_000), api = join(tmpdir(), 'peix-ze', 'acme-api'), web = join(tmpdir(), 'peix-ze', 'acme-web');
    const { chats: [A, W] } = makeFixture(ctx.fixture.dir, [
      { cwd: api, title: 'Run the migration on staging', prompt: 'migrate staging', reply: 'on it', at, live: { pid: sleeps[0].pid, status: 'busy' }, lines: id => toolLines({ id, cwd: api, name: 'Bash', input: { command: 'npm run migrate' }, at }) },
      { cwd: web, title: 'Fix the login page', prompt: 'fix it', reply: 'on it', at, live: { pid: sleeps[1].pid, status: 'busy' }, lines: id => toolLines({ id, cwd: web, name: 'Bash', input: { command: 'npm test' }, at }) }]);
    const reg = c => join(ctx.fixture.dir, 'sessions', `${c.pid}.json`), status = (c, s, more = {}) => writeFileSync(reg(c), JSON.stringify({ ...JSON.parse(readFileSync(reg(c), 'utf8')), status: s, statusUpdatedAt: Date.now() + 1000, ...more }));
    await ctx.waitFor(`window.peix.sessions().filter(s => s.status === 'working').length === 2`, { what: 'both at work' });

    // a round: today's lunch in it
    await ctx.key('KeyZ');
    await ctx.waitFor(`document.querySelector('#zeGame').open && window.peix.ze().frames > 2`, { what: 'the game' });
    await press('Space', ' ', 32);
    await ctx.waitFor(`window.peix.ze().g.phase === 'play'`, { what: 'a round' });
    await g(`g.spawn = 1e9; g.items.length = 0;`);
    out.lunch = await g(`return g.lunch.map(d => [d.kind, d.e, d.say, d.place])`);
    ctx.assert.deepEqual(out.lunch, [['veg', '🥣', 'SOPA DE PENCA!', 'Trotas'], ['meat', '🍖', 'Rojões à minhota', 'Trotas'], ['fish', '🐟', 'Bacalhau com natas', 'Trotas']], 'the soup a green, the roast a special, the fish a fish, no pudding');
    await g(`g.lunch.forEach((d, i) => g.items.push({ ...d, x: 330 + i * 130, y: 340 + i * 30, vx: 0, vy: 0, g: 0, rot: 0, spin: 0 })); g.x = 150;`);
    await ctx.sleep(200); await ctx.shot('1-lunch', await canvas());
    const s0 = await g(`return g.score`);
    await g(`const it = g.items.find(i => i.kind === 'meat'); it.x = g.x; it.y = g.y - 150;`);
    await ctx.waitFor(`window.peix.ze().g.score === ${s0 + 30}`, { what: 'the special eaten' });
    ctx.assert.deepEqual(await g(`return g.words.map(w => w.s).slice(-2)`), ['+30 Rojões à minhota', 'Trotas']);
    await g(`g.items.length = 0`);

    // acme-web lands; acme-api asks — the game stops on a card
    appendFileSync(W.file, replyLines({ id: W.id, cwd: web, text: 'Fixed.' }).map(l => JSON.stringify(l)).join('\n') + '\n');
    status(W, 'idle');
    await ctx.waitFor(`window.peix.ze().g.news.some(n => n.title === 'Fix the login page' && !n.asks)`, { what: 'the landing kept' });
    status(A, 'waiting', { waitingFor: 'permission prompt' });
    await ctx.waitFor(`window.peix.ze().g.phase === 'call' && window.peix.ze().music?.ac.state === 'suspended' && !window.peix.ze().raf`, { what: 'the call, the round held' });
    out.call = await g(`return { who: g.call.s.project, title: g.call.s.title }`);
    ctx.assert.deepEqual(out.call, { who: 'acme-api', title: 'Run the migration on staging' });
    await ctx.shot('2-call', await canvas());
    await press('Escape', 'Escape', 27);
    await ctx.waitFor(`window.peix.ze().g.phase === 'play' && window.peix.ze().music?.ac.state === 'running' && !!window.peix.ze().raf`, { what: 'esc: playing on' });
    ctx.assert.equal(await ctx.evaluate(`document.querySelector('#zeGame').open`), true, 'esc let the call go, not the game');

    // the K.O.: what landed and asked; a new best posted to the room; on a Friday, the week's poll
    await g(`g.mass = 1; g.score = 420; g.items.push({ kind: 'veg', e: '🥦', say: 'BLEH!', x: g.x, y: g.y - 100, vx: 0, vy: 0, g: 0, rot: 0, spin: 0 })`);
    await ctx.waitFor(`window.peix.ze().g.phase === 'over'`, { what: 'the K.O.' }); await ctx.waitFor(`window.peix.ze().g.overT > .8`, { what: 'the K.O.\'s buttons' });
    ctx.assert.equal(await g(`return g.best`), true, 'a new best');
    ctx.assert.deepEqual(await g(`return g.news.map(n => [n.project, n.asks])`), [['acme-web', false], ['acme-api', true]]);
    await press('ArrowRight', 'ArrowRight', 39); await press('ArrowRight', 'ArrowRight', 39); await press('Space', ' ', 32);
    await ctx.waitFor(`window.peix.ze().g.posted === 'sent'`, { what: 'the best posted' });
    out.posted = (await ctx.server.api('api/chat/messages')).body.msgs.at(-1);
    ctx.assert.equal(out.posted.who, 'me'); ctx.assert.match(out.posted.body, /^Zé's game: 420 on NORMAL, level 1 — a new best 🥋/);
    out.friday = await ctx.evaluate(`new Date().getDay() === 5`);
    if (out.friday) {
      await press('ArrowRight', 'ArrowRight', 39); await press('Space', ' ', 32);
      await ctx.waitFor(`window.peix.ze().g.polled === 'sent'`, { what: 'the Friday poll' });
      out.poll = (await ctx.server.api('api/chat/messages')).body.msgs.at(-1).poll;
      ctx.assert.deepEqual(out.poll.opts.map(o => o.label), ['ana — 900 on HARD', 'me — 420 on NORMAL', 'rui — 300 on EASY'], 'each one\'s best, best first');
    } else ctx.assert.equal(await ctx.evaluate(`window.peix.ze().g.polled`), undefined);
    await ctx.shot('3-ko', await canvas());

    // a second ask: ⏎ goes to it — the game closed, the chat open
    await g(`g.sel = 0`); await press('Space', ' ', 32);
    await ctx.waitFor(`window.peix.ze().g.phase === 'play'`, { what: 'another round' });
    status(A, 'busy');
    await ctx.waitFor(`window.peix.sessions().find(s => s.id === ${JSON.stringify(A.id)})?.status === 'working'`, { what: 'acme-api answered elsewhere' });
    status(A, 'waiting', { waitingFor: 'permission prompt' });
    await ctx.waitFor(`window.peix.ze().g.phase === 'call'`, { what: 'the second call' });
    await press('Enter', 'Enter', 13);
    await ctx.waitFor(`!document.querySelector('#zeGame').open && window.peix.state().current === ${JSON.stringify(A.id)} && !window.peix.ze().music`, { what: '⏎: the chat open, the game and its sound closed' });

    // nothing waiting: Zé walks across All caught up, and a click on him is his game
    for (const p of sleeps) p.kill();
    await ctx.waitFor(`window.peix.sessions().every(s => !s.alive)`, { what: 'the two ended' });
    for (const id of await ctx.evaluate(`window.peix.sessions().map(s => s.id)`)) await ctx.server.post(`api/sessions/${id}/done`, {});
    await ctx.waitFor(`!!document.querySelector('#slist > .gsep.lane.zero .zewalk i')`, { what: 'All caught up, and Zé on it' });
    out.walk = await ctx.evaluate(`document.querySelector('#slist > .gsep.lane.zero').getAnimations({ subtree: true }).map(a => a.animationName).sort()`);
    ctx.assert.deepEqual(out.walk, ['zestep', 'zestep', 'zewalk'], 'walking, two frames');
    await ctx.evaluate(`document.querySelector('#slist > .gsep.lane.zero .zewalk i').click()`);
    await ctx.waitFor(`document.querySelector('#zeGame').open`, { what: 'his game, from a click on him' });
    await press('Escape', 'Escape', 27);
    await ctx.waitFor(`!document.querySelector('#zeGame').open`, { what: 'closed' });
    return out;
  } finally {
    for (const p of sleeps) p.kill();
    await gh.close();
  }
}
