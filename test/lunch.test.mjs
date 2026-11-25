// Lunch (2026-10-18): the setup's lunch (cleanLunch through cleanSetup), where the day stands (lunchPhase), what a read
// of a picture says of today (dishesOn, closedOn), a rendered Instagram profile read (lib/instagram.mjs), and end to end
// against the fakes — a week's card from a post, a story's menu from the Slack channel, a place with no Instagram from
// it too, each picture read once, the reminder at lunch time, Going and In 15 min, and the readers' own claudes kept
// off the board. Instagram is only ever looked at logged out: its login went (2026-11-23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { parseProfile, pkOfCode, timeOfPk } from '../lib/instagram.mjs';

const tmp = tmpDir('peix-test-');
process.env.STATE_FILE = join(tmp, 'state.json');
process.env.CLAUDE_DIR = join(tmp, 'claude');
process.env.USAGE = 'off';
process.env.NOTIFY = 'off';
const { cleanSetup, lunchPhase, dishesOn, closedOn, dayKey, readerArgs } = await import('../server.mjs');

const DAY = 86_400_000;
const at = (h, m = 0, from = Date.now()) => new Date(from).setHours(h, m, 0, 0);
const earlier = () => Math.max(at(0, 1), Date.now() - 3600_000); // today, before now — just after midnight too

test("readerArgs: a reader may only read — dontAsk always, the Slack one denies its connector's writes, the picture one has no MCP (2026-11-06)", () => {
  const val = (a, flag) => a[a.indexOf(flag) + 1];
  const pic = readerArgs({ schema: {} }),
    slack = readerArgs({ schema: {}, tools: ['mcp__claude_ai_Slack__slack_read_channel'] });
  for (const a of [pic, slack]) {
    assert.equal(val(a, '--permission-mode'), 'dontAsk');
    assert.equal(val(a, '--tools'), '');
  }
  assert.ok(pic.includes('--strict-mcp-config') && !pic.includes('--allowedTools'));
  assert.equal(val(slack, '--allowedTools'), 'mcp__claude_ai_Slack__slack_read_channel');
  assert.match(val(slack, '--disallowedTools'), /mcp__claude_ai_Slack__slack_send_message(,|$)/);
  assert.ok(!val(slack, '--disallowedTools').includes('read'), 'no read denied');
});

test('cleanSetup: lunch shaped — a time, the days, places with an Instagram account, a Slack channel; null is none; no stories (2026-11-23)', () => {
  const ok = cleanSetup(
    {
      lunch: {
        at: '9:05',
        places: [
          { name: ' Casa ', instagram: 'https://www.instagram.com/restaurante.acasa/' },
          { name: 'Trotas' },
          { name: 'casa', instagram: '@dup' },
        ],
        slack: 'lunch-braga',
        stories: true,
      },
    },
    true,
  );
  assert.deepEqual(
    ok.setup.lunch,
    {
      on: true,
      at: '09:05',
      days: [1, 2, 3, 4, 5],
      places: [{ name: 'Casa', instagram: 'restaurante.acasa' }, { name: 'Trotas' }],
      slack: '#lunch-braga',
      model: null,
    },
    "an old setup's `stories` dropped",
  );
  assert.equal(
    cleanSetup({ lunch: { at: '12:30', days: [6, 0, 9, 1.5, 1], on: false } }, true).setup.lunch.days.join(),
    '0,1,6',
  );
  assert.match(cleanSetup({ lunch: { at: '25:00' } }, true).error, /not a time/);
  assert.match(
    cleanSetup({ lunch: { places: [{ name: 'x', instagram: 'no spaces here' }] } }, true).error,
    /not an Instagram account/,
  );
  assert.match(cleanSetup({ lunch: { places: [{ instagram: 'x' }] } }, true).error, /needs a name/);
  assert.equal(cleanSetup({ lunch: null }, true).setup.lunch, null);
  assert.equal(
    cleanSetup({ lunch: { at: 'soon' } }).setup.lunch,
    undefined,
    "the file's, unreadable, left out rather than refused",
  );
});

test('lunchPhase: before, lunch, snoozed, went, back, over — and off on a day that is not a lunch day', () => {
  const cfg = { on: true, at: '12:30', days: [0, 1, 2, 3, 4, 5, 6] },
    noon = at(12),
    day = dayKey(noon);
  assert.equal(lunchPhase(cfg, {}, noon), 'before');
  assert.equal(lunchPhase(cfg, {}, at(12, 31)), 'lunch');
  assert.equal(lunchPhase(cfg, { day, snooze: at(12, 45) }, at(12, 40)), 'snoozed');
  assert.equal(lunchPhase(cfg, { day, snooze: at(12, 45) }, at(12, 46)), 'lunch', 'In 15 min, then lunch again');
  assert.equal(lunchPhase(cfg, { day, went: at(12, 35) }, at(12, 50)), 'went');
  assert.equal(lunchPhase(cfg, { day, went: at(12, 35), back: at(13, 30) }, at(13, 31)), 'back');
  assert.equal(
    lunchPhase(cfg, { day: 'another day', went: 1 }, at(12, 50)),
    'lunch',
    "yesterday's Going is not today's",
  );
  assert.equal(lunchPhase(cfg, {}, at(14, 1)), 'over');
  assert.equal(lunchPhase({ ...cfg, days: [] }, {}, at(12, 31)), 'off');
  assert.equal(lunchPhase({ ...cfg, on: false }, {}, at(12, 31)), 'off');
});

test('dishesOn: a dated day, an undated card the day it went up, a week by date or weekday, a month; closedOn', () => {
  const today = dayKey(Date.now()),
    yesterday = dayKey(Date.now() - DAY),
    wd = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
  const card = dishes => ({ isMenu: true, kind: 'day', days: [{ date: null, weekday: null, dishes }], price: '13 €' });
  assert.deepEqual(dishesOn(card(['Sopa', 'Bacalhau']), today, earlier()), {
    dishes: ['Sopa', 'Bacalhau'],
    price: '13 €',
  });
  assert.equal(
    dishesOn(card(['Sopa']), today, Date.now() - DAY),
    null,
    "an undated card from yesterday is yesterday's",
  );
  const week = {
    isMenu: true,
    kind: 'week',
    days: [
      { date: yesterday, dishes: ['Ontem'] },
      { date: today, dishes: ['Hoje'] },
    ],
    price: '14,00 €',
  };
  assert.deepEqual(dishesOn(week, today, Date.now() - 2 * DAY).dishes, ['Hoje']);
  assert.deepEqual(
    dishesOn({ isMenu: true, kind: 'week', days: [{ weekday: wd, dishes: ['Pelo dia'] }] }, today, Date.now() - 2 * DAY)
      .dishes,
    ['Pelo dia'],
  );
  assert.deepEqual(
    dishesOn(
      { isMenu: true, kind: 'month', days: [{ dishes: ['A', 'B'] }, { dishes: ['B', 'C'] }], price: '12 €' },
      today,
      Date.now() - 9 * DAY,
    ),
    { dishes: ['A', 'B', 'C'], price: '12 €', month: true },
  );
  assert.equal(dishesOn({ isMenu: false, kind: 'other', days: [] }, today, Date.now()), null);
  assert.equal(
    dishesOn({ isMenu: true, kind: 'month', days: [{ dishes: ['A'] }] }, today, Date.now() - 40 * DAY),
    null,
    "last month's",
  );
  assert.deepEqual(closedOn({ closed: { from: yesterday, to: today } }, today), { from: yesterday, to: today });
  assert.equal(closedOn({ closed: { from: yesterday, to: yesterday } }, today), null);
  assert.equal(closedOn({ closed: null }, today), null);
});

test("lib/instagram.mjs: a post's time from its id, a profile's own posts and its story's time", () => {
  assert.equal(
    new Date(timeOfPk(pkOfCode('DeYx_VNE7fz'))).toISOString().slice(0, 16),
    '2026-10-12T08:15',
    'the time a post went up, from its code',
  );
  const node = (code, user, caption) =>
    JSON.stringify({
      node: {
        __typename: 'XIGPolarisMedia',
        code,
        user: { username: user },
        caption: { text: caption },
        accessibility_caption: 'May be an image of text',
        display_uri: `https://cdn/${code}.jpg`,
        media_type: 1,
      },
    });
  const html =
    `<script>{"x":[${node('DeYx_VNE7fz', 'casa', 'Ementa "da" semana')},${node('DeM2L2oDqEK', 'casa', 'older')},${node('DebMe5ViR23', 'friend', 'a collab')}]}</script>
    <script>{"user":{"username":"someone.else","latest_reel_media":1700000000}}</script>` +
    'x'.repeat(9000) +
    `<script>{"profile_id":"42","user":{"username":"casa","latest_reel_media":1792270415,"biography":"b"}}</script>`;
  const p = parseProfile(html, 'casa');
  assert.equal(p.id, '42');
  assert.equal(p.storyAt, 1792270415_000, "its own story's time, not a suggested account's");
  assert.deepEqual(
    p.posts.map(x => x.code),
    ['DeYx_VNE7fz', 'DeM2L2oDqEK'],
    "its own, newest first — not a collaborator's",
  );
  assert.equal(p.posts[0].caption, 'Ementa "da" semana');
});

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
async function stream(srv) {
  const r = await fetch(`${srv.url}events?key=${srv.key}`),
    dec = new TextDecoder(),
    reader = r.body.getReader();
  const s = { text: '', close: () => reader.cancel().catch(() => {}) };
  (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) return;
      s.text += dec.decode(value, { stream: true });
    }
  })();
  return s;
}
const hm = t =>
  `${String(new Date(t).getHours()).padStart(2, '0')}:${String(new Date(t).getMinutes()).padStart(2, '0')}`;

test(
  "end to end: a week's post, a story through the channel, each picture read once, the reminder and what you say to it",
  { timeout: 60_000 },
  async t => {
    if (new Date().getHours() === 0 && new Date().getMinutes() < 3)
      return t.skip("a minute past midnight: lunch time a minute ago would be yesterday's");
    const srv = await startTestServer(),
      now = Date.now(),
      today = dayKey(now),
      before = earlier();
    const sse = await stream(srv);
    try {
      writeFileSync(
        srv.env.FAKEIG_FILE,
        JSON.stringify({
          profiles: {
            'casa.place': {
              id: '11',
              storyAt: 0,
              posts: [
                {
                  code: 'C1',
                  pk: '7001',
                  at: now - 2 * DAY,
                  caption: 'Partilhamos a ementa desta semana',
                  alt: 'May be an image of text',
                  image: PNG,
                  url: 'https://www.instagram.com/p/C1/',
                },
              ],
            },
            'ramen.place': {
              id: '22',
              storyAt: before,
              posts: [
                {
                  code: 'R1',
                  pk: '7002',
                  at: now - 3 * DAY,
                  caption: 'Vem jantar',
                  alt: 'A bowl',
                  image: PNG,
                  url: 'https://www.instagram.com/p/R1/',
                },
              ],
            },
            'late.place': { id: '33', storyAt: 0, posts: [] },
          },
        }),
      );
      writeFileSync(
        srv.env.FAKEREADER_FILE,
        JSON.stringify({
          reads: {
            'ementa desta semana': {
              isMenu: true,
              kind: 'week',
              days: [
                { date: dayKey(now - DAY), dishes: ['Ontem'] },
                { date: today, dishes: ['Sopa de penca', 'Salmão grelhado'] },
              ],
              price: '14,00 €',
              closed: null,
            },
          },
          slack: {
            places: [
              { name: 'trotas', dishes: ['Bitoque'], price: '11 €', postedAt: '11:40' },
              { name: 'Ramen', dishes: ['Tofu tikka masala'], price: '12 €', postedAt: '11:20' },
            ],
          },
        }),
      );
      const places = [
        { name: 'Casa', instagram: 'casa.place' },
        { name: 'Ramen', instagram: 'ramen.place' },
        { name: 'Late', instagram: 'late.place' },
        { name: 'Trotas' },
      ];
      const put = lunch =>
        srv.api('api/config', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lunch }),
        });
      const cfg = { at: '23:59', days: [0, 1, 2, 3, 4, 5, 6], places };
      assert.equal((await put(cfg)).status, 200);
      const lunch = async () => (await srv.api('api/lunch')).body,
        place = async n => (await lunch()).places.find(p => p.name === n);
      assert.equal((await lunch()).phase, 'before');
      await srv.post('api/lunch', { act: 'read' });
      await waitFor(async () => (await place('Casa')).state === 'menu' && !(await lunch()).busy, {
        what: "Casa's week read from its post",
      });
      const casa = await place('Casa');
      assert.deepEqual(
        [casa.dishes, casa.price, casa.src, casa.url],
        [['Sopa de penca', 'Salmão grelhado'], '14,00 €', 'post', 'https://www.instagram.com/p/C1/'],
        "today's row of the week",
      );
      assert.equal((await place('Ramen')).state, 'story', 'a story is up, unread: there is no login');
      assert.equal((await place('Late')).state, 'waiting');
      assert.equal((await place('Trotas')).state, 'none', 'no Instagram, no channel');
      const reads = () => readFileSync(srv.env.FAKEREADER_LOG, 'utf8').trim().split('\n');
      assert.deepEqual(
        reads(),
        ['ementa desta semana'],
        "the week's post alone — not Ramen's dinner post, days old and no menu's words, nor Late, with nothing posted",
      );

      assert.equal(
        (await srv.post('api/lunch', { act: 'login' })).status,
        400,
        'no Instagram login to ask for (2026-11-23)',
      );

      // the channel: Ramen's story as a colleague posted it, and the place with no Instagram — matched by its name whatever its case
      assert.equal((await put({ ...cfg, slack: '#lunch' })).status, 200);
      await waitFor(async () => !(await lunch()).busy, { what: 'the round done' });
      await srv.post('api/lunch', { act: 'read' });
      await waitFor(async () => (await place('Trotas')).state === 'menu' && (await place('Ramen')).state === 'menu', {
        what: 'Trotas and Ramen from the channel',
      });
      assert.deepEqual([(await place('Trotas')).dishes, (await place('Trotas')).src], [['Bitoque'], 'slack']);
      assert.deepEqual([(await place('Ramen')).dishes, (await place('Ramen')).src], [['Tofu tikka masala'], 'slack']);
      await waitFor(async () => !(await lunch()).busy, { what: 'the round done' });
      assert.equal(
        reads().filter(r => r === 'ementa desta semana').length,
        1,
        'a picture read once, whatever the rounds',
      );
      assert.deepEqual(
        [
          ...new Set(
            readFileSync(srv.env.FAKEIG_LOG, 'utf8')
              .trim()
              .split('\n')
              .map(l => l.split(' ')[0]),
          ),
        ],
        ['look'],
        'Instagram only looked at, logged out',
      );

      // lunch time: the reminder, then what you say to it
      const was = sse.text.length;
      assert.equal((await put({ ...cfg, slack: '#lunch', at: hm(now - 60_000) })).status, 200);
      await waitFor(() => /event: alert\ndata: .*"kind":"lunch"/.test(sse.text.slice(was)), {
        what: 'the lunch alert',
      });
      const alert = JSON.parse(sse.text.slice(was).match(/event: alert\ndata: (.*"kind":"lunch".*)/)[1]);
      assert.equal(alert.title, '3 menus in');
      assert.match(alert.snippet, /Casa: Salmão grelhado/, 'a main, not the soup');
      assert.equal((await lunch()).phase, 'lunch');
      assert.equal((await srv.post('api/lunch', { act: 'snooze' })).body.phase, 'snoozed');
      assert.equal((await srv.post('api/lunch', { act: 'going' })).body.phase, 'went');
      assert.equal((await srv.post('api/lunch', { act: 'back' })).body.phase, 'back');
      assert.equal((await srv.post('api/lunch', { act: 'nap' })).status, 400);
      assert.equal(
        JSON.parse(readFileSync(join(srv.dir, 'state.json'), 'utf8')).lunch.went > 0,
        true,
        'the day kept in the state file',
      );

      // a reader's own claude, as the registry lists it while it runs, is no chat
      const work = realpathSync(join(srv.dir, 'lunch', 'work')),
        sess = join(srv.env.CLAUDE_DIR, 'sessions');
      mkdirSync(sess, { recursive: true });
      writeFileSync(
        join(sess, `${process.pid}.json`),
        JSON.stringify({
          pid: process.pid,
          sessionId: 'reader-0000',
          cwd: work,
          kind: 'interactive',
          entrypoint: 'sdk-cli',
          status: 'busy',
          startedAt: Date.now(),
        }),
      );
      await new Promise(r => setTimeout(r, 2000)); // a registry poll or two
      assert.ok(!(await srv.api('api/sessions')).body.sessions.some(s => s.id === 'reader-0000'), 'not on the board');
    } finally {
      sse.close();
      await srv.stop();
    }
  },
);

test(
  "a month's dishes stand until the channel says which is today's, and Read again keeps the day's",
  { timeout: 60_000 },
  async () => {
    const now = Date.now();
    const month = {
      isMenu: true,
      kind: 'month',
      days: [{ date: null, weekday: null, dishes: ['Tortilha e aioli', 'Hummus e vegetais', 'Okonomiyaki'] }],
      price: '12€',
      closed: null,
    };
    const post = {
      code: 'M1',
      pk: '7101',
      at: now - 3 * DAY,
      caption: 'Almoços de outubro',
      alt: '',
      image: PNG,
      url: 'https://www.instagram.com/p/M1/',
    };
    const lunch = { at: '23:59', days: [0, 1, 2, 3, 4, 5, 6], places: [{ name: 'Ramen', instagram: 'ramen.place' }] };
    const put = (srv, more = {}) =>
      srv.api('api/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lunch: { ...lunch, ...more } }),
      });
    const ramen = async srv => (await srv.api('api/lunch')).body.places[0],
      idle = async srv => !(await srv.api('api/lunch')).body.busy;
    const srv = await startTestServer();
    try {
      writeFileSync(
        srv.env.FAKEIG_FILE,
        JSON.stringify({ profiles: { 'ramen.place': { id: '22', storyAt: earlier(), posts: [post] } } }),
      );
      writeFileSync(
        srv.env.FAKEREADER_FILE,
        JSON.stringify({
          reads: { 'Almoços de outubro': month },
          slack: { places: [{ name: 'ramen', dishes: ['Hummus e vegetais'], price: '12€', postedAt: '11:30' }] },
        }),
      );
      assert.equal((await put(srv)).status, 200);
      await waitFor(async () => (await ramen(srv)).state === 'menu' && (await idle(srv)), {
        what: "the month's dishes",
      });
      assert.deepEqual(
        [(await ramen(srv)).dishes.length, (await ramen(srv)).month, (await ramen(srv)).src],
        [3, true, 'post'],
      );
      assert.equal((await put(srv, { slack: '#lunch' })).status, 200);
      await srv.post('api/lunch', { act: 'read' });
      await waitFor(async () => (await ramen(srv)).src === 'slack' && (await idle(srv)), {
        what: "the channel's over the month's",
      });
      let r = await ramen(srv);
      assert.deepEqual([r.dishes, r.month], [['Hummus e vegetais'], false], "today's, from the channel");
      await srv.post('api/lunch', { act: 'read' });
      await waitFor(() => idle(srv), { what: 'Read again done' });
      r = await ramen(srv);
      assert.deepEqual(
        [r.dishes, r.src],
        [['Hummus e vegetais'], 'slack'],
        "the month's post, looked at again, does not take the day's place",
      );
    } finally {
      await srv.stop();
    }
  },
);

test("the Instagram login's Chrome profile is gone at boot (2026-11-23)", async () => {
  const dir = tmpDir('peix-'),
    profile = join(dir, 'lunch', 'chrome', 'Default');
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, 'Cookies'), 'a session');
  const srv = await startTestServer({ dir });
  try {
    assert.equal(existsSync(join(dir, 'lunch', 'chrome')), false);
  } finally {
    await srv.stop();
  }
});
