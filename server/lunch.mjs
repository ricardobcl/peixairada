// Lunch (2026-10-18): the reminder, and the menus of the places you go — each picture read by claude -p.
import { mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { CLAUDE_DIR, ROOT, STATE_FILE } from './env.mjs';
import { claudeBin } from './bins.mjs';
import { json, jsonBody } from './http.mjs';
import { nativeNotify } from './notify.mjs';
import { setup } from './setup.mjs';
import { broadcast } from './sse.mjs';
import { lunchDay, notificationsOn, saveState, setLunchDay } from './state.mjs';
import { cleanEnv, drawerEnv } from './terminals/terms.mjs';

// Off until the setup names it (setup.lunch: {on, at, days, places: [{name, instagram, color}], slack, model}).
// On a lunch day the board reads each place's menu through the morning and says when it is lunch time — the status
// bar's sign, the dishes in the fish's lane, a notification with Menus · Going · In 15 minutes, ⌥⌘M's chalkboard. Where
// a menu comes from (docs/DECISIONS.md, 2026-10-18, and the study behind it):
//   · the place's Instagram profile, logged out (lib/instagram.mjs look, headless Chrome): its newest posts — a week's
//     card, a month's dishes in a caption, a menu posted today, a closure — and when its newest story went up;
//   · the setup's Slack channel (`slack`), where colleagues post the places' stories as screenshots, read by claude -p
//     with Claude's Slack connector and its read tools alone.
// No Instagram login (2026-11-23): most places post the day's menu only as a story, which Instagram shows to no one
// logged out, and a login wants a browser window of the board's own — gone, its stories with it; the channel has them.
// Every picture is read by claude -p (`model`, haiku unless the setup says) into the days and dishes it shows, once:
// LUNCH_DIR/reads.json keeps each read by the post's id. A month's dishes are a place's until something says which is
// today's: a post, the channel (2026-10-20). A reader is a claude of its own in
// LUNCH_DIR/work, with no transcript (--no-session-persistence); the registry lists it while it runs, and
// loadRegistry passes over it (ownReader). The day — its menus, Going, In 15 min, back — is the state file's.
export const LUNCH_DIR = join(dirname(STATE_FILE), 'lunch');

const LUNCH_WORK = join(LUNCH_DIR, 'work');
const LUNCH_READS = join(LUNCH_DIR, 'reads.json');

export const LUNCH_TICK_MS = Number(process.env.LUNCH_TICK_MS || 30_000);
const LUNCH_SPAN_MS = 90 * 60_000; // lunch time: from `at`, this long — the sign, the dishes in the lane
const LUNCH_SNOOZE_MS = 15 * 60_000;
const LUNCH_LOOKS = [-75, -40, -10, 5]; // minutes from `at`: Instagram looked at for the places still without a menu
const LUNCH_SLACKS = [-10, 10]; // …and the channel read
const LUNCH_RECENT_MS = 35 * 86_400_000; // a post older than this is no menu of today's

const LUNCH_READ_MAX = 6;
const LUNCH_AGAIN_MS = 6 * 3_600_000; // posts read per place a look; a failed read asked again after

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// a post worth reading though not posted today: a menu's words, a closure's, or a picture Instagram says is text
const MENU_WORDS =
  /menu|ementa|almo[cç]o|prato|sugest|semana|di[aá]ria|executiv|buffet|encerrad|fechad|f[eé]rias|closed/i;

const lunch = { busy: null, again: null, error: null, said: '', workReal: null, readers: new Set(), reads: null };
const IG_HANDLE = /^[A-Za-z0-9._]{1,30}$/;

/** The setup's lunch, shaped: {on, at 'HH:MM', days [0–6], places [{name, instagram?, color?}], slack '#name'?, model?}
 *  — or why not. */
export function cleanLunch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'expected {at, days, places}' };

  const at = typeof input.at === 'string' ? input.at.trim() : '12:00';
  const hm = at.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);

  if (!hm) return { error: `"${at}" is not a time — 12:30` };

  const days = Array.isArray(input.days)
    ? [...new Set(input.days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : [1, 2, 3, 4, 5];

  const places = [];

  for (const place of Array.isArray(input.places) ? input.places.slice(0, 20) : []) {
    const name = typeof place?.name === 'string' ? place.name.trim() : '';

    const ig =
      typeof place?.instagram === 'string'
        ? place.instagram
            .trim()
            .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '')
            .replace(/^@/, '')
            .replace(/[/?#].*$/, '')
        : '';

    const color = typeof place?.color === 'string' ? place.color.trim().toLowerCase() : '';

    if (!name || name.length > 60) return { error: 'a place needs a name, 60 letters at most' };

    if (ig && !IG_HANDLE.test(ig)) {
      return { error: `"${place.instagram}" is not an Instagram account — its name, as in instagram.com/name` };
    }

    if (color && !/^#[0-9a-f]{6}$/.test(color)) return { error: `${name}: a colour is #rrggbb` };
    if (places.some(other => other.name.toLowerCase() === name.toLowerCase())) continue;
    places.push({ name, ...(ig && { instagram: ig }), ...(color && { color }) });
  }

  const slack = typeof input.slack === 'string' && input.slack.trim() ? input.slack.trim().replace(/^#?/, '#') : null;

  if (slack && !/^#[\w.-]{1,80}$/.test(slack)) return { error: `"${input.slack}" is not a Slack channel — #lunch` };
  const model = typeof input.model === 'string' && input.model.trim() ? input.model.trim() : null;

  if (model && !/^[\w.[\]-]{1,60}$/.test(model)) return { error: `"${model}" is not a model — haiku, sonnet` };
  return { lunch: { on: input.on !== false, at: `${hm[1].padStart(2, '0')}:${hm[2]}`, days, places, slack, model } };
}

const lunchCfg = () => setup.lunch || null;

export const dayKey = time => {
  const date = new Date(time);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const lunchAt = (cfg, time) => {
  const [hours, minutes] = cfg.at.split(':').map(Number);

  return new Date(time).setHours(hours, minutes, 0, 0);
};

/** Where the day stands: off (no lunch today), before, lunch (from `at` for LUNCH_SPAN_MS), snoozed (In 15 min), went
 *  (Going), back (from lunch, or from a lock that spanned it), over. Pure. */
export function lunchPhase(cfg, st, now = Date.now()) {
  if (!cfg?.on || !cfg.days.includes(new Date(now).getDay())) return 'off';
  const at = lunchAt(cfg, now);

  if (now < at) return 'before';
  if (now >= at + LUNCH_SPAN_MS) return 'over';

  if (st?.day === dayKey(now)) {
    if (st.back) return 'back';
    if (st.went) return 'went';
    if (st.snooze > now) return 'snoozed';
  }

  return 'lunch';
}

/** What a read of a picture says of the day `today`: its dishes (and price), a month's dishes when no day is named, or
 *  null. `at` is when the picture was posted: a card for one day with no date on it is the day it went up. Pure. */
export function dishesOn(read, today, at, now = Date.now()) {
  if (!read?.isMenu) return null;

  const days = Array.isArray(read.days) ? read.days.filter(day => Array.isArray(day?.dishes) && day.dishes.length) : [];
  const wd = WEEKDAYS[new Date(`${today}T12:00`).getDay()];

  const hit =
    days.find(day => day.date === today) ||
    (read.kind === 'day' && dayKey(at) === today && days.length === 1 && !days[0].date ? days[0] : null) ||
    (read.kind === 'week' && !days.some(day => day.date) && now - at < 7 * 86_400_000
      ? days.find(day => day.weekday === wd)
      : null);

  if (hit) return { dishes: hit.dishes.map(String), price: read.price || null };

  if (read.kind === 'month' && now - at < LUNCH_RECENT_MS && !days.some(day => day.date)) {
    const all = [...new Set(days.flatMap(day => day.dishes.map(String)))];

    if (all.length) return { dishes: all, price: read.price || null, month: true };
  }

  return null;
}

/** A closure the read names that covers `today` — "closed 19 to 31 October" — or null. Pure. */
export const closedOn = (read, today) =>
  read?.closed?.from && read.closed.from <= today && today <= (read.closed.to || read.closed.from) ? read.closed : null;

/** The day's record, a new one at midnight. */
function lunchToday(now = Date.now()) {
  const day = dayKey(now);

  if (lunchDay.day !== day) {
    setLunchDay({ day, menus: {}, went: 0, snooze: 0, back: 0, alerted: 0, looked: [], slacked: [], readAt: 0 });
    saveState();
  }

  return lunchDay;
}

const menuOf = place => (lunchToday().menus[place.name] ||= {});

/** A place a round need not look for any more: today's dishes, or closed. A month's dishes, with no day to each, are
 *  not — a story, a post or the channel may still say which is today's (2026-10-20). */
const settled = place => {
  const menu = lunchToday().menus[place.name];

  return !!(menu?.closed || (menu?.dishes?.length && !menu.month));
};

/** A place's menu for today, in place of what it had (its story's time kept) — but a month's never takes a day's. */
function setMenu(place, menu) {
  if (menu.month && settled(place)) return;
  const day = lunchToday();

  day.menus[place.name] = { storyAt: day.menus[place.name]?.storyAt, ...menu, error: null };
  saveState();
  lunchSay();
}

/** What every page knows: the setup, where the day stands, and each place's menu — its dishes, where and when they came
 *  from, or why there are none yet. In the snapshot and every `lunch` event. */
export function lunchSummary(now = Date.now()) {
  const cfg = lunchCfg();

  if (!cfg) return { on: false, set: false };
  const st = lunchToday(now);

  return {
    on: cfg.on,
    set: true,
    at: cfg.at,
    days: cfg.days,
    phase: lunchPhase(cfg, st, now),
    day: st.day,
    went: st.went || null,
    snooze: st.snooze || null,
    back: st.back || null,
    readAt: st.readAt || null,
    busy: lunch.busy,
    error: lunch.error,
    slack: cfg.slack,
    model: cfg.model || 'haiku',
    places: cfg.places.map(place => {
      const menu = st.menus[place.name] || {};

      const state = menu.dishes?.length
        ? 'menu'
        : menu.closed
          ? 'closed'
          : menu.storyAt
            ? 'story'
            : !place.instagram && !cfg.slack
              ? 'none'
              : 'waiting';

      return {
        name: place.name,
        instagram: place.instagram || null,
        color: place.color || null,
        state,
        dishes: menu.dishes || [],
        price: menu.price || null,
        month: !!menu.month,
        src: menu.src || null,
        at: menu.at || null,
        url: menu.url || (place.instagram ? `https://www.instagram.com/${place.instagram}/` : null),
        storyAt: menu.storyAt || null,
        closed: menu.closed || null,
        error: menu.error || null,
      };
    }),
  };
}

function lunchSay() {
  const text = JSON.stringify(lunchSummary());

  if (text !== lunch.said) {
    lunch.said = text;
    broadcast('lunch', JSON.parse(text));
  }
}

// ---- reading a picture: claude -p, its answer held to a schema ----------------------------------------------------
const READ_SCHEMA = {
  type: 'object',
  required: ['isMenu', 'kind', 'days'],
  properties: {
    isMenu: { type: 'boolean' },
    kind: { type: 'string', enum: ['day', 'week', 'month', 'other'] },
    days: {
      type: 'array',
      items: {
        type: 'object',
        required: ['dishes'],
        properties: {
          date: { type: ['string', 'null'] },
          weekday: { type: ['string', 'null'], enum: [...WEEKDAYS, null] },
          dishes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    price: { type: ['string', 'null'] },
    closed: {
      type: ['object', 'null'],
      properties: { from: { type: ['string', 'null'] }, to: { type: ['string', 'null'] } },
    },
  },
};

const SLACK_SCHEMA = {
  type: 'object',
  required: ['places'],
  properties: {
    places: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'dishes'],
        properties: {
          name: { type: 'string' },
          dishes: { type: 'array', items: { type: 'string' } },
          price: { type: ['string', 'null'] },
          postedAt: { type: ['string', 'null'] },
        },
      },
    },
  },
};

// the connector's reading tools, and nothing it could write with
const SLACK_READ = [
  'slack_search_channels',
  'slack_read_channel',
  'slack_read_thread',
  'slack_read_file',
  'slack_search_public_and_private',
  'slack_list_user_channels',
].map(tool => `mcp__claude_ai_Slack__${tool}`);

const whenSaid = (at, time = true) =>
  new Date(at).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(time && { hour: '2-digit', minute: '2-digit' }),
  });

const READ_ASK = `Is it this restaurant's lunch menu — a menu of the day, an executive menu, a week's or a month's lunch menu? A dish's advert, an event, a promotion or opening hours are not.
If it is: kind is "day" for one day's menu, "week" for several days, "month" for a month's dishes with no day to each. days lists each day it covers: its date as YYYY-MM-DD (the year is the post's) when one is written or follows from the post's own date, else null; the weekday as written (sun, mon, tue, wed, thu, fri, sat) or null; and that day's dishes exactly as written, one item per dish, starters, soups and desserts included, in the order shown. A "day" card with no date written has date null. price as written, or null.
Whatever it is: closed is a closure it announces — {from, to} as YYYY-MM-DD — or null.`;

// The Slack connector's tools that write — denied by name too, beside dontAsk (2026-11-06; its list comments 2026-11-27).
const SLACK_WRITES = [
  'slack_add_list_comment',
  'slack_update_list_comment',
  'slack_send_message',
  'slack_send_message_draft',
  'slack_schedule_message',
  'slack_add_reaction',
  'slack_create_canvas',
  'slack_update_canvas',
  'slack_create_conversation',
  'slack_create_list',
  'slack_update_list',
  'slack_add_list_record',
  'slack_update_list_record',
  'slack_get_file_upload_url',
  'slack_complete_file_upload',
].map(tool => `mcp__claude_ai_Slack__${tool}`);

/** A reader's argv. Whatever a reader reads is somebody else's words — a story's caption, a coworker's post in the
 *  channel —, so it may do nothing but read (2026-11-06): `--tools ''` drops only the built-in tools, and the Slack
 *  read comes up with the user's settings, every connector with them (Slack's send, Jira's edit…) and the user's
 *  own default mode (`auto` lets a classifier approve what it calls). So every reader is `--permission-mode dontAsk`
 *  — what no allow rule names is denied, never asked — and the Slack one denies that connector's writes by name, and
 *  whatever the user's own allow rules name besides (`deny`, readerDenies). */
export function readerArgs({ schema, tools = null, model = 'haiku', deny = [] }) {
  return [
    '-p',
    '--no-session-persistence',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    model,
    '--json-schema',
    JSON.stringify(schema),
    '--permission-mode',
    'dontAsk',
    ...(tools
      ? ['--allowedTools', tools.join(','), '--disallowedTools', [...new Set([...SLACK_WRITES, ...deny])].join(',')]
      : ['--strict-mcp-config', '--setting-sources', 'project']),
    '--tools',
    '',
  ];
}

// The user's allow rules come with the Slack reader (2026-11-27, the external audit's lead 4): dontAsk runs what a rule
// allows, so `mcp__notion__create_page` in ~/.claude/settings.json was the reader's to call on a coworker's post's say
// (proved in the real-CLI lab: a stand-in server's tool, allowed by the user, was called). `--setting-sources project`
// would drop them, and maybe the claude.ai connectors the reader needs with them. So every server an allow rule names,
// in every scope a reader reads, is denied by name — deny beats allow —, and a rule of Slack's that is not one of its
// reads; a rule naming every server (`mcp__*`, `*`) cannot be undone that way, and no reader runs under it.
const MANAGED_SETTINGS = '/Library/Application Support/ClaudeCode';

const allowRules = file => {
  try {
    const allow = JSON.parse(readFileSync(file, 'utf8'))?.permissions?.allow;

    return Array.isArray(allow) ? allow.filter(rule => typeof rule === 'string') : [];
  } catch {
    return [];
  } // none, or none to read
};

export function readerDenies({
  configDir = process.env.CLAUDE_CONFIG_DIR || CLAUDE_DIR,
  cwd = LUNCH_WORK,
  managed = MANAGED_SETTINGS,
} = {}) {
  let dropIns = [];

  try {
    dropIns = readdirSync(join(managed, 'managed-settings.d'))
      .filter(file => file.endsWith('.json'))
      .map(file => join(managed, 'managed-settings.d', file));
  } catch {}

  const files = [
    join(configDir, 'settings.json'),
    join(configDir, 'settings.local.json'),
    join(cwd, '.claude', 'settings.json'),
    join(cwd, '.claude', 'settings.local.json'),
    join(managed, 'managed-settings.json'),
    ...dropIns,
  ];

  const deny = new Set();

  for (const raw of files.flatMap(allowRules)) {
    const rule = raw.trim();
    const match = /^mcp__(.+?)(?:__(.*))?$/.exec(rule);

    if (rule === '*' || match?.[1].includes('*')) {
      throw new Error(
        `an allow rule of yours names MCP servers by a pattern (${rule}) — the Slack reader would have them all`,
      );
    }

    if (!match) continue; // a built-in's: --tools '' has none
    const [, server, tool] = match;

    if (server !== 'claude_ai_Slack') deny.add(`mcp__${server}`);
    else if (tool && !tool.includes('*') && !SLACK_READ.includes(rule)) deny.add(rule);
  }

  return [...deny];
}

/** One reader: a claude -p in LUNCH_WORK, the content (text, and pictures as base64) on stdin as one stream-json
 *  message, its structured answer back. `tools`: the connector's tools it may use (the Slack read), with the user's
 *  settings — the connectors come up with them —; without, no tool and no MCP at all. */
function runReader({ content, schema, tools = null, timeout = 120_000 }) {
  return new Promise((resolve, reject) => {
    const bin = process.env.READER_BIN || claudeBin();

    if (!bin) return reject(new Error('claude is not installed here'));

    try {
      mkdirSync(LUNCH_WORK, { recursive: true });
      lunch.workReal ||= realpathSync(LUNCH_WORK);
    } catch (error) {
      return reject(error);
    }

    let args;

    try {
      args = readerArgs({ schema, tools, model: lunchCfg()?.model || 'haiku', deny: tools ? readerDenies() : [] });
    } catch (error) {
      return reject(error);
    }

    let child;

    try {
      child = spawn(bin, args, { cwd: LUNCH_WORK, env: drawerEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      return reject(error);
    }

    lunch.readers.add(child.pid);

    let out = '';
    let err = '';
    let done = false;

    const end = (error, answer) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      lunch.readers.delete(child.pid);
      error ? reject(error) : resolve(answer);
    };

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}

      end(new Error(`claude gave no answer in ${Math.round(timeout / 1000)} s`));
    }, timeout);

    child.on('error', error => end(error));

    child.stdout.on('data', chunk => {
      out += chunk;
    });

    child.stderr.on('data', chunk => {
      err += chunk;
    });

    child.stdin.on('error', () => {});
    child.stdin.end(`${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`);

    child.on('close', code => {
      const res = out
        .split('\n')
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .find(message => message?.type === 'result');

      if (res && !res.is_error && res.structured_output) return end(null, res.structured_output);

      end(
        new Error(
          res?.result
            ? `claude: ${String(res.result).slice(0, 200)}`
            : `claude ended (${code}) without an answer${err.trim() ? ` — ${err.trim().split('\n').pop().slice(0, 200)}` : ''}`,
        ),
      );
    });
  });
}

export const ownReader = reg => lunch.readers.has(reg.pid) || (!!lunch.workReal && reg.cwd === lunch.workReal);

function lunchReads() {
  if (lunch.reads) return lunch.reads;
  lunch.reads = new Map();

  try {
    for (const [id, read] of Object.entries(JSON.parse(readFileSync(LUNCH_READS, 'utf8')))) {
      if (Date.now() - (read?.at || 0) < 40 * 86_400_000) lunch.reads.set(id, read);
    }
  } catch {}

  return lunch.reads;
}

function saveReads() {
  try {
    mkdirSync(LUNCH_DIR, { recursive: true });
    const tmp = `${LUNCH_READS}.${process.pid}.tmp`;

    writeFileSync(tmp, JSON.stringify(Object.fromEntries(lunchReads())));
    renameSync(tmp, LUNCH_READS);
  } catch (error) {
    console.error('[peixairada] lunch: could not keep the reads', error.message);
  }
}

/** A picture, as a reader takes it: base64 and its type. Instagram's are on its CDN, signed for a while. */
async function pictureOf(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });

  if (!response.ok) throw new Error(`the picture: HTTP ${response.status}`);

  const type = (response.headers.get('content-type') || '').split(';')[0].trim();
  const buf = Buffer.from(await response.arrayBuffer());

  if (!/^image\/(jpeg|png|gif|webp)$/.test(type)) throw new Error(`the picture is ${type || 'of no type'}`);
  if (buf.length > 8 << 20) throw new Error('the picture is too large');
  return { type, data: buf.toString('base64') };
}

/** A post's or a story's picture read — once: what came back is kept by its id, with whose it is and when it went up,
 *  a failure asked again LUNCH_AGAIN_MS on. */
async function readPicture({ id, image, caption = '', place, at, kind, url }) {
  const reads = lunchReads();
  const hit = reads.get(id);

  if (hit && (hit.r || Date.now() - hit.at < LUNCH_AGAIN_MS)) return hit.r;

  let read = null;
  let err = null;

  try {
    const pic = await pictureOf(image);
    const text = `${place.name}${place.instagram ? ` (Instagram @${place.instagram})` : ''}, a restaurant, put this ${kind} on Instagram on ${whenSaid(at)}${caption ? `, captioned:\n«${caption.slice(0, 1500)}»` : '.'}\nToday is ${whenSaid(Date.now(), false)}.\n${READ_ASK}`;

    read = await runReader({
      content: [
        { type: 'image', source: { type: 'base64', media_type: pic.type, data: pic.data } },
        { type: 'text', text },
      ],
      schema: READ_SCHEMA,
    });
  } catch (error) {
    err = error.message;
    console.error(`[peixairada] lunch: ${place.name}'s ${kind} ${id} not read — ${err}`);
  }

  reads.set(id, {
    at: Date.now(),
    r: read,
    ...(err && { err }),
    place: (place.instagram || place.name).toLowerCase(),
    kind,
    posted: at,
    url,
  });

  saveReads();
  if (err) throw new Error(err);
  return read;
}

/** lib/instagram.mjs, or the tests' stand-in (INSTAGRAM_BIN): one command, its JSON. */
function igRun(args, timeout) {
  return new Promise(resolve => {
    const bin = process.env.INSTAGRAM_BIN;
    const cmd = bin || process.execPath;
    const argv = bin ? args : [join(ROOT, 'lib', 'instagram.mjs'), ...args];

    let out = '';
    let child;

    try {
      child = spawn(cmd, argv, { env: cleanEnv(), stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (error) {
      return resolve({ error: error.message });
    }

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
    }, timeout);

    child.on('error', error => {
      clearTimeout(timer);
      resolve({ error: error.message });
    });

    child.stdout.on('data', chunk => {
      out += chunk;
    });

    child.on('close', () => {
      clearTimeout(timer);

      try {
        resolve(JSON.parse(out.trim().split('\n').pop()));
      } catch {
        resolve({ error: "Instagram's look ended without an answer" });
      }
    });
  });
}

/** Each item through `fn`, `concurrency` at a time. */
async function pool(items, concurrency, fn) {
  const queue = [...items];

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift());
    }),
  );
}

/** The profiles (logged out): a post that is today's menu, a week's or a month's — read newest first, a few at most —, a
 *  closure, and when the newest story went up. */
async function lunchLook(places, today) {
  const want = places.filter(place => place.instagram);

  if (!want.length) return;
  lunch.busy = 'Instagram';
  lunchSay();
  const answer = await igRun(['look', ...want.map(place => place.instagram)], 4 * 60_000);

  lunch.busy = 'reading';
  lunchSay();

  await pool(want, 3, async place => {
    const got = Object.entries(answer.places || {}).find(
      ([handle]) => handle.toLowerCase() === place.instagram.toLowerCase(),
    )?.[1];

    if (!got || got.error) {
      menuOf(place).error = got?.error || answer.error || 'Instagram did not answer';
      return;
    }

    const menu = menuOf(place);

    menu.error = null;
    if (got.storyAt && dayKey(got.storyAt) === today) menu.storyAt = got.storyAt;

    const posts = (got.posts || []).filter(
      post =>
        post.image &&
        Date.now() - post.at < LUNCH_RECENT_MS &&
        (dayKey(post.at) === today || MENU_WORDS.test(post.caption) || /image of text|imagem de texto/i.test(post.alt)),
    );

    for (const post of posts.slice(0, LUNCH_READ_MAX)) {
      let read;

      try {
        read = await readPicture({
          id: `p${post.pk}`,
          image: post.image,
          caption: post.caption,
          place,
          at: post.at,
          kind: 'post',
          url: post.url,
        });
      } catch (error) {
        menu.error = error.message;
        continue;
      }

      const closed = closedOn(read, today);

      if (closed) {
        setMenu(place, { closed, src: 'post', at: post.at, url: post.url, dishes: [] });
        return;
      }

      const found = dishesOn(read, today, post.at);

      if (found) {
        setMenu(place, { ...found, src: 'post', at: post.at, url: post.url });
        return;
      }
    }

    saveState();
    lunchSay();
  });
}

/** The setup's Slack channel: the day's screenshots, read for the places still without a menu. */
async function lunchSlack(places, today) {
  const ch = lunchCfg()?.slack;
  const want = places.filter(place => !settled(place));

  if (!ch || !want.length) return;
  lunch.busy = 'Slack';
  lunchSay();

  const text = `You collect restaurants' lunch menus for a dashboard. Read only: never post, react, upload or change anything in Slack.
In Slack, find the channel ${ch} and read the messages posted on ${today} (the Mac's own time zone), threads included. People post screenshots of the restaurants' Instagram stories or posts with that day's lunch menu, often several images in one message. Open every image in those messages with slack_read_file and read it.
For each of these restaurants, give the lunch menu for ${today} when an image shows it:
${places.map(place => `- ${place.name}${place.instagram ? ` (Instagram @${place.instagram})` : ''}`).join('\n')}
Copy each dish as written, one item per dish, in the order shown — starters, soups and desserts too. From a card covering a whole week, only ${today}'s row. price as written, or null. postedAt: the time the Slack message was posted, HH:MM. Leave out the restaurants no image shows a menu for.`;

  let answer;

  try {
    answer = await runReader({
      content: [{ type: 'text', text }],
      schema: SLACK_SCHEMA,
      tools: SLACK_READ,
      timeout: 6 * 60_000,
    });
  } catch (error) {
    lunch.error = `${ch}: ${error.message}`;
    return;
  }

  const norm = name =>
    String(name)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');

  for (const entry of answer.places || []) {
    const place =
      want.find(candidate => norm(candidate.name) === norm(entry.name)) ||
      want.find(
        candidate => norm(entry.name).includes(norm(candidate.name)) || norm(candidate.name).includes(norm(entry.name)),
      );

    const hm = String(entry.postedAt || '').match(/^(\d{1,2}):(\d{2})/);

    if (place && Array.isArray(entry.dishes) && entry.dishes.length) {
      setMenu(place, {
        dishes: entry.dishes.map(String),
        price: entry.price || null,
        src: 'slack',
        at: hm ? new Date().setHours(+hm[1], +hm[2], 0, 0) : Date.now(),
        url: null,
      });
    }
  }
}

/** One round: the profiles, then the channel (`slack`) — for the places still without today's
 *  menu, or all of them (`all`, Read again). One at a time; asked while one runs, it runs again after. */
async function lunchRun({ slack = false, all = false } = {}) {
  const cfg = lunchCfg();

  if (!cfg?.places.length) return;

  if (lunch.busy) {
    lunch.again = { slack: slack || !!lunch.again?.slack, all: all || !!lunch.again?.all };
    return;
  }

  const today = lunchToday().day;
  const places = all ? cfg.places : cfg.places.filter(place => !settled(place));

  if (all) {
    for (const place of places) {
      const menu = menuOf(place);

      if (!menu.dishes?.length) delete menu.error;
    }
  }

  lunch.error = null;
  lunch.busy = 'starting';
  lunchSay();

  try {
    await lunchLook(places, today);
    if (slack) await lunchSlack(places, today);
  } catch (error) {
    lunch.error = error.message;
    console.error('[peixairada] lunch:', error);
  } finally {
    lunch.busy = null;
    lunchToday().readAt = Date.now();
    saveState();
    lunchSay();
  }

  if (lunch.again) {
    const again = lunch.again;

    lunch.again = null;
    return lunchRun(again);
  }
}

/** The setup's lunch changed: every page told, and a place new to it looked at — on a lunch day, before lunch is over. */
export function lunchSetupChanged(was) {
  const cfg = lunchCfg();
  const old = new Set((JSON.parse(was || 'null')?.places || []).map(place => `${place.name}@${place.instagram || ''}`));
  const now = Date.now();

  lunchSay();

  if (
    cfg?.on &&
    cfg.days.includes(new Date(now).getDay()) &&
    now < lunchAt(cfg, now) + LUNCH_SPAN_MS &&
    cfg.places.some(place => !old.has(`${place.name}@${place.instagram || ''}`))
  ) {
    lunchRun();
  }
}

/** The clock, every LUNCH_TICK_MS: the looks of the morning, the channel's, the reminder at `at` (again at the end of
 *  an In 15 min), and every page told when the day moves on. */
export function lunchTick(now = Date.now()) {
  const cfg = lunchCfg();

  if (cfg?.on && cfg.days.includes(new Date(now).getDay())) {
    const st = lunchToday(now);
    const at = lunchAt(cfg, now);
    const span = now < at + LUNCH_SPAN_MS;

    const due = (offs, done) => {
      let any = false;

      offs.forEach((offset, index) => {
        if (now >= at + offset * 60_000 && !done.includes(index)) {
          done.push(index);
          any = span;
        }
      });

      return any;
    };

    const look = due(LUNCH_LOOKS, st.looked);
    const slack = due(LUNCH_SLACKS, st.slacked);

    if (look || slack) {
      saveState();
      lunchRun({ slack });
    }

    if (lunchPhase(cfg, st, now) === 'lunch' && st.alerted < (st.snooze || at)) {
      st.alerted = now;
      saveState();
      lunchAlert(cfg);
    }
  }

  lunchSay();
}

/** Lunch time: an alert — the app's carries Menus · Going · In 15 minutes, a click opens the chalkboard. */
function lunchAlert(cfg) {
  const summary = lunchSummary();
  const have = summary.places.filter(place => place.dishes.length);

  const main = place =>
    place.dishes.find(dish => !/^(sopa|creme|caldo|entrada|p[aã]o\b)/i.test(dish)) || place.dishes[0];

  const title = have.length ? `${have.length} menu${have.length === 1 ? '' : 's'} in` : 'No menu read yet';

  const snippet =
    have
      .slice(0, 3)
      .map(place => `${place.name}: ${main(place)}`)
      .join(' · ') || 'The places you go, on ⌥⌘M';

  const evt = {
    kind: 'lunch',
    sessionId: null,
    heading: `Lunch · ${cfg.at}`,
    title,
    snippet,
    ts: new Date().toISOString(),
    quiet: !notificationsOn,
  };

  broadcast('alert', evt);
  if (notificationsOn) nativeNotify(evt.heading, title, snippet);
}

export async function lunchRoute(req, res) {
  if (req.method === 'GET') return json(res, 200, lunchSummary());
  if (req.method !== 'POST') return json(res, 405, { error: 'GET or POST' });

  const body = await jsonBody(req);
  const cfg = lunchCfg();
  const act = body.act;
  const now = Date.now();

  if (!cfg) return json(res, 409, { error: 'lunch is not set up — Settings › Lunch' });
  const st = lunchToday(now);

  if (act === 'going') {
    st.went = now;
    st.snooze = 0;
  } else if (act === 'snooze') {
    st.snooze = now + LUNCH_SNOOZE_MS;
    st.went = 0;
  } else if (act === 'back') {
    st.back = now;
  } else if (act === 'read') lunchRun({ slack: !!cfg.slack, all: true });
  else return json(res, 400, { error: 'expected {act: going | snooze | back | read}' });
  saveState();
  lunchSay();
  return json(res, 200, lunchSummary());
}
