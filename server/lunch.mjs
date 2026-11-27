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
const LUNCH_WORK = join(LUNCH_DIR, 'work'),
  LUNCH_READS = join(LUNCH_DIR, 'reads.json');
export const LUNCH_TICK_MS = Number(process.env.LUNCH_TICK_MS || 30_000);
const LUNCH_SPAN_MS = 90 * 60_000; // lunch time: from `at`, this long — the sign, the dishes in the lane
const LUNCH_SNOOZE_MS = 15 * 60_000;
const LUNCH_LOOKS = [-75, -40, -10, 5]; // minutes from `at`: Instagram looked at for the places still without a menu
const LUNCH_SLACKS = [-10, 10]; // …and the channel read
const LUNCH_RECENT_MS = 35 * 86_400_000; // a post older than this is no menu of today's
const LUNCH_READ_MAX = 6,
  LUNCH_AGAIN_MS = 6 * 3_600_000; // posts read per place a look; a failed read asked again after
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// a post worth reading though not posted today: a menu's words, a closure's, or a picture Instagram says is text
const MENU_WORDS =
  /menu|ementa|almo[cç]o|prato|sugest|semana|di[aá]ria|executiv|buffet|encerrad|fechad|f[eé]rias|closed/i;
const lunch = { busy: null, again: null, error: null, said: '', workReal: null, readers: new Set(), reads: null };
const IG_HANDLE = /^[A-Za-z0-9._]{1,30}$/;
/** The setup's lunch, shaped: {on, at 'HH:MM', days [0–6], places [{name, instagram?, color?}], slack '#name'?, model?}
 *  — or why not. */
export function cleanLunch(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'expected {at, days, places}' };
  const at = typeof v.at === 'string' ? v.at.trim() : '12:00',
    hm = at.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!hm) return { error: `"${at}" is not a time — 12:30` };
  const days = Array.isArray(v.days)
    ? [...new Set(v.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [1, 2, 3, 4, 5];
  const places = [];
  for (const p of Array.isArray(v.places) ? v.places.slice(0, 20) : []) {
    const name = typeof p?.name === 'string' ? p.name.trim() : '';
    const ig =
      typeof p?.instagram === 'string'
        ? p.instagram
            .trim()
            .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '')
            .replace(/^@/, '')
            .replace(/[/?#].*$/, '')
        : '';
    const color = typeof p?.color === 'string' ? p.color.trim().toLowerCase() : '';
    if (!name || name.length > 60) return { error: 'a place needs a name, 60 letters at most' };
    if (ig && !IG_HANDLE.test(ig))
      return { error: `"${p.instagram}" is not an Instagram account — its name, as in instagram.com/name` };
    if (color && !/^#[0-9a-f]{6}$/.test(color)) return { error: `${name}: a colour is #rrggbb` };
    if (places.some(x => x.name.toLowerCase() === name.toLowerCase())) continue;
    places.push({ name, ...(ig && { instagram: ig }), ...(color && { color }) });
  }
  const slack = typeof v.slack === 'string' && v.slack.trim() ? v.slack.trim().replace(/^#?/, '#') : null;
  if (slack && !/^#[\w.-]{1,80}$/.test(slack)) return { error: `"${v.slack}" is not a Slack channel — #lunch` };
  const model = typeof v.model === 'string' && v.model.trim() ? v.model.trim() : null;
  if (model && !/^[\w.[\]-]{1,60}$/.test(model)) return { error: `"${model}" is not a model — haiku, sonnet` };
  return { lunch: { on: v.on !== false, at: `${hm[1].padStart(2, '0')}:${hm[2]}`, days, places, slack, model } };
}
const lunchCfg = () => setup.lunch || null;
export const dayKey = t => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const lunchAt = (cfg, t) => {
  const [h, m] = cfg.at.split(':').map(Number);
  return new Date(t).setHours(h, m, 0, 0);
};
/** Where the day stands: off (no lunch today), before, lunch (from `at` for LUNCH_SPAN_MS), snoozed (In 15 min), went
 *  (Going), back (from lunch, or from a lock that spanned it), over. Pure. */
export function lunchPhase(cfg, st, t = Date.now()) {
  if (!cfg?.on || !cfg.days.includes(new Date(t).getDay())) return 'off';
  const at = lunchAt(cfg, t);
  if (t < at) return 'before';
  if (t >= at + LUNCH_SPAN_MS) return 'over';
  if (st?.day === dayKey(t)) {
    if (st.back) return 'back';
    if (st.went) return 'went';
    if (st.snooze > t) return 'snoozed';
  }
  return 'lunch';
}
/** What a read of a picture says of the day `today`: its dishes (and price), a month's dishes when no day is named, or
 *  null. `at` is when the picture was posted: a card for one day with no date on it is the day it went up. Pure. */
export function dishesOn(read, today, at, now = Date.now()) {
  if (!read?.isMenu) return null;
  const days = Array.isArray(read.days) ? read.days.filter(d => Array.isArray(d?.dishes) && d.dishes.length) : [],
    wd = WEEKDAYS[new Date(`${today}T12:00`).getDay()];
  const hit =
    days.find(d => d.date === today) ||
    (read.kind === 'day' && dayKey(at) === today && days.length === 1 && !days[0].date ? days[0] : null) ||
    (read.kind === 'week' && !days.some(d => d.date) && now - at < 7 * 86_400_000
      ? days.find(d => d.weekday === wd)
      : null);
  if (hit) return { dishes: hit.dishes.map(String), price: read.price || null };
  if (read.kind === 'month' && now - at < LUNCH_RECENT_MS && !days.some(d => d.date)) {
    const all = [...new Set(days.flatMap(d => d.dishes.map(String)))];
    if (all.length) return { dishes: all, price: read.price || null, month: true };
  }
  return null;
}
/** A closure the read names that covers `today` — "closed 19 to 31 October" — or null. Pure. */
export const closedOn = (read, today) =>
  read?.closed?.from && read.closed.from <= today && today <= (read.closed.to || read.closed.from) ? read.closed : null;
/** The day's record, a new one at midnight. */
function lunchToday(t = Date.now()) {
  const day = dayKey(t);
  if (lunchDay.day !== day) {
    setLunchDay({ day, menus: {}, went: 0, snooze: 0, back: 0, alerted: 0, looked: [], slacked: [], readAt: 0 });
    saveState();
  }
  return lunchDay;
}
const menuOf = p => (lunchToday().menus[p.name] ||= {});
/** A place a round need not look for any more: today's dishes, or closed. A month's dishes, with no day to each, are
 *  not — a story, a post or the channel may still say which is today's (2026-10-20). */
const settled = p => {
  const m = lunchToday().menus[p.name];
  return !!(m?.closed || (m?.dishes?.length && !m.month));
};
/** A place's menu for today, in place of what it had (its story's time kept) — but a month's never takes a day's. */
function setMenu(p, m) {
  if (m.month && settled(p)) return;
  const day = lunchToday();
  day.menus[p.name] = { storyAt: day.menus[p.name]?.storyAt, ...m, error: null };
  saveState();
  lunchSay();
}
/** What every page knows: the setup, where the day stands, and each place's menu — its dishes, where and when they came
 *  from, or why there are none yet. In the snapshot and every `lunch` event. */
export function lunchSummary(t = Date.now()) {
  const cfg = lunchCfg();
  if (!cfg) return { on: false, set: false };
  const st = lunchToday(t);
  return {
    on: cfg.on,
    set: true,
    at: cfg.at,
    days: cfg.days,
    phase: lunchPhase(cfg, st, t),
    day: st.day,
    went: st.went || null,
    snooze: st.snooze || null,
    back: st.back || null,
    readAt: st.readAt || null,
    busy: lunch.busy,
    error: lunch.error,
    slack: cfg.slack,
    model: cfg.model || 'haiku',
    places: cfg.places.map(p => {
      const m = st.menus[p.name] || {};
      const state = m.dishes?.length
        ? 'menu'
        : m.closed
          ? 'closed'
          : m.storyAt
            ? 'story'
            : !p.instagram && !cfg.slack
              ? 'none'
              : 'waiting';
      return {
        name: p.name,
        instagram: p.instagram || null,
        color: p.color || null,
        state,
        dishes: m.dishes || [],
        price: m.price || null,
        month: !!m.month,
        src: m.src || null,
        at: m.at || null,
        url: m.url || (p.instagram ? `https://www.instagram.com/${p.instagram}/` : null),
        storyAt: m.storyAt || null,
        closed: m.closed || null,
        error: m.error || null,
      };
    }),
  };
}
function lunchSay() {
  const s = JSON.stringify(lunchSummary());
  if (s !== lunch.said) {
    lunch.said = s;
    broadcast('lunch', JSON.parse(s));
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
].map(t => `mcp__claude_ai_Slack__${t}`);
const whenSaid = (t, time = true) =>
  new Date(t).toLocaleString('en-GB', {
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
].map(t => `mcp__claude_ai_Slack__${t}`);
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
    const a = JSON.parse(readFileSync(file, 'utf8'))?.permissions?.allow;
    return Array.isArray(a) ? a.filter(r => typeof r === 'string') : [];
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
      .filter(f => f.endsWith('.json'))
      .map(f => join(managed, 'managed-settings.d', f));
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
  for (const r of files.flatMap(allowRules)) {
    const rule = r.trim(),
      m = /^mcp__(.+?)(?:__(.*))?$/.exec(rule);
    if (rule === '*' || m?.[1].includes('*'))
      throw new Error(
        `an allow rule of yours names MCP servers by a pattern (${rule}) — the Slack reader would have them all`,
      );
    if (!m) continue; // a built-in's: --tools '' has none
    const [, server, tool] = m;
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
    } catch (e) {
      return reject(e);
    }
    let args;
    try {
      args = readerArgs({ schema, tools, model: lunchCfg()?.model || 'haiku', deny: tools ? readerDenies() : [] });
    } catch (e) {
      return reject(e);
    }
    let child;
    try {
      child = spawn(bin, args, { cwd: LUNCH_WORK, env: drawerEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return reject(e);
    }
    lunch.readers.add(child.pid);
    let out = '',
      err = '',
      done = false;
    const end = (e, v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      lunch.readers.delete(child.pid);
      e ? reject(e) : resolve(v);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      end(new Error(`claude gave no answer in ${Math.round(timeout / 1000)} s`));
    }, timeout);
    child.on('error', e => end(e));
    child.stdout.on('data', d => {
      out += d;
    });
    child.stderr.on('data', d => {
      err += d;
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n');
    child.on('close', code => {
      const res = out
        .split('\n')
        .map(l => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .find(l => l?.type === 'result');
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
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(LUNCH_READS, 'utf8'))))
      if (Date.now() - (v?.at || 0) < 40 * 86_400_000) lunch.reads.set(k, v);
  } catch {}
  return lunch.reads;
}
function saveReads() {
  try {
    mkdirSync(LUNCH_DIR, { recursive: true });
    const tmp = `${LUNCH_READS}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(lunchReads())));
    renameSync(tmp, LUNCH_READS);
  } catch (e) {
    console.error('[peixairada] lunch: could not keep the reads', e.message);
  }
}
/** A picture, as a reader takes it: base64 and its type. Instagram's are on its CDN, signed for a while. */
async function pictureOf(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`the picture: HTTP ${r.status}`);
  const type = (r.headers.get('content-type') || '').split(';')[0].trim(),
    buf = Buffer.from(await r.arrayBuffer());
  if (!/^image\/(jpeg|png|gif|webp)$/.test(type)) throw new Error(`the picture is ${type || 'of no type'}`);
  if (buf.length > 8 << 20) throw new Error('the picture is too large');
  return { type, data: buf.toString('base64') };
}
/** A post's or a story's picture read — once: what came back is kept by its id, with whose it is and when it went up,
 *  a failure asked again LUNCH_AGAIN_MS on. */
async function readPicture({ id, image, caption = '', place, at, kind, url }) {
  const reads = lunchReads(),
    hit = reads.get(id);
  if (hit && (hit.r || Date.now() - hit.at < LUNCH_AGAIN_MS)) return hit.r;
  let r = null,
    err = null;
  try {
    const pic = await pictureOf(image);
    const text = `${place.name}${place.instagram ? ` (Instagram @${place.instagram})` : ''}, a restaurant, put this ${kind} on Instagram on ${whenSaid(at)}${caption ? `, captioned:\n«${caption.slice(0, 1500)}»` : '.'}\nToday is ${whenSaid(Date.now(), false)}.\n${READ_ASK}`;
    r = await runReader({
      content: [
        { type: 'image', source: { type: 'base64', media_type: pic.type, data: pic.data } },
        { type: 'text', text },
      ],
      schema: READ_SCHEMA,
    });
  } catch (e) {
    err = e.message;
    console.error(`[peixairada] lunch: ${place.name}'s ${kind} ${id} not read — ${err}`);
  }
  reads.set(id, {
    at: Date.now(),
    r,
    ...(err && { err }),
    place: (place.instagram || place.name).toLowerCase(),
    kind,
    posted: at,
    url,
  });
  saveReads();
  if (err) throw new Error(err);
  return r;
}
/** lib/instagram.mjs, or the tests' stand-in (INSTAGRAM_BIN): one command, its JSON. */
function igRun(args, timeout) {
  return new Promise(resolve => {
    const bin = process.env.INSTAGRAM_BIN,
      cmd = bin || process.execPath,
      argv = bin ? args : [join(ROOT, 'lib', 'instagram.mjs'), ...args];
    let out = '',
      child;
    try {
      child = spawn(cmd, argv, { env: cleanEnv(), stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) {
      return resolve({ error: e.message });
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
    }, timeout);
    child.on('error', e => {
      clearTimeout(timer);
      resolve({ error: e.message });
    });
    child.stdout.on('data', d => {
      out += d;
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
/** Each item through `fn`, `n` at a time. */
async function pool(items, n, fn) {
  const q = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, q.length) }, async () => {
      while (q.length) await fn(q.shift());
    }),
  );
}

/** The profiles (logged out): a post that is today's menu, a week's or a month's — read newest first, a few at most —, a
 *  closure, and when the newest story went up. */
async function lunchLook(places, today) {
  const want = places.filter(p => p.instagram);
  if (!want.length) return;
  lunch.busy = 'Instagram';
  lunchSay();
  const r = await igRun(['look', ...want.map(p => p.instagram)], 4 * 60_000);
  lunch.busy = 'reading';
  lunchSay();
  await pool(want, 3, async p => {
    const got = Object.entries(r.places || {}).find(([h]) => h.toLowerCase() === p.instagram.toLowerCase())?.[1];
    if (!got || got.error) {
      menuOf(p).error = got?.error || r.error || 'Instagram did not answer';
      return;
    }
    const m = menuOf(p);
    m.error = null;
    if (got.storyAt && dayKey(got.storyAt) === today) m.storyAt = got.storyAt;
    const posts = (got.posts || []).filter(
      x =>
        x.image &&
        Date.now() - x.at < LUNCH_RECENT_MS &&
        (dayKey(x.at) === today || MENU_WORDS.test(x.caption) || /image of text|imagem de texto/i.test(x.alt)),
    );
    for (const x of posts.slice(0, LUNCH_READ_MAX)) {
      let read;
      try {
        read = await readPicture({
          id: `p${x.pk}`,
          image: x.image,
          caption: x.caption,
          place: p,
          at: x.at,
          kind: 'post',
          url: x.url,
        });
      } catch (e) {
        m.error = e.message;
        continue;
      }
      const closed = closedOn(read, today);
      if (closed) {
        setMenu(p, { closed, src: 'post', at: x.at, url: x.url, dishes: [] });
        return;
      }
      const d = dishesOn(read, today, x.at);
      if (d) {
        setMenu(p, { ...d, src: 'post', at: x.at, url: x.url });
        return;
      }
    }
    saveState();
    lunchSay();
  });
}
/** The setup's Slack channel: the day's screenshots, read for the places still without a menu. */
async function lunchSlack(places, today) {
  const ch = lunchCfg()?.slack,
    want = places.filter(p => !settled(p));
  if (!ch || !want.length) return;
  lunch.busy = 'Slack';
  lunchSay();
  const text = `You collect restaurants' lunch menus for a dashboard. Read only: never post, react, upload or change anything in Slack.
In Slack, find the channel ${ch} and read the messages posted on ${today} (the Mac's own time zone), threads included. People post screenshots of the restaurants' Instagram stories or posts with that day's lunch menu, often several images in one message. Open every image in those messages with slack_read_file and read it.
For each of these restaurants, give the lunch menu for ${today} when an image shows it:
${places.map(p => `- ${p.name}${p.instagram ? ` (Instagram @${p.instagram})` : ''}`).join('\n')}
Copy each dish as written, one item per dish, in the order shown — starters, soups and desserts too. From a card covering a whole week, only ${today}'s row. price as written, or null. postedAt: the time the Slack message was posted, HH:MM. Leave out the restaurants no image shows a menu for.`;
  let r;
  try {
    r = await runReader({
      content: [{ type: 'text', text }],
      schema: SLACK_SCHEMA,
      tools: SLACK_READ,
      timeout: 6 * 60_000,
    });
  } catch (e) {
    lunch.error = `${ch}: ${e.message}`;
    return;
  }
  const norm = s =>
    String(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  for (const x of r.places || []) {
    const p =
      want.find(q => norm(q.name) === norm(x.name)) ||
      want.find(q => norm(x.name).includes(norm(q.name)) || norm(q.name).includes(norm(x.name)));
    const hm = String(x.postedAt || '').match(/^(\d{1,2}):(\d{2})/);
    if (p && Array.isArray(x.dishes) && x.dishes.length)
      setMenu(p, {
        dishes: x.dishes.map(String),
        price: x.price || null,
        src: 'slack',
        at: hm ? new Date().setHours(+hm[1], +hm[2], 0, 0) : Date.now(),
        url: null,
      });
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
  const places = all ? cfg.places : cfg.places.filter(p => !settled(p));
  if (all)
    for (const p of places) {
      const m = menuOf(p);
      if (!m.dishes?.length) delete m.error;
    }
  lunch.error = null;
  lunch.busy = 'starting';
  lunchSay();
  try {
    await lunchLook(places, today);
    if (slack) await lunchSlack(places, today);
  } catch (e) {
    lunch.error = e.message;
    console.error('[peixairada] lunch:', e);
  } finally {
    lunch.busy = null;
    lunchToday().readAt = Date.now();
    saveState();
    lunchSay();
  }
  if (lunch.again) {
    const a = lunch.again;
    lunch.again = null;
    return lunchRun(a);
  }
}
/** The setup's lunch changed: every page told, and a place new to it looked at — on a lunch day, before lunch is over. */
export function lunchSetupChanged(was) {
  const cfg = lunchCfg(),
    old = new Set((JSON.parse(was || 'null')?.places || []).map(p => `${p.name}@${p.instagram || ''}`)),
    t = Date.now();
  lunchSay();
  if (
    cfg?.on &&
    cfg.days.includes(new Date(t).getDay()) &&
    t < lunchAt(cfg, t) + LUNCH_SPAN_MS &&
    cfg.places.some(p => !old.has(`${p.name}@${p.instagram || ''}`))
  )
    lunchRun();
}
/** The clock, every LUNCH_TICK_MS: the looks of the morning, the channel's, the reminder at `at` (again at the end of
 *  an In 15 min), and every page told when the day moves on. */
export function lunchTick(t = Date.now()) {
  const cfg = lunchCfg();
  if (cfg?.on && cfg.days.includes(new Date(t).getDay())) {
    const st = lunchToday(t),
      at = lunchAt(cfg, t),
      span = t < at + LUNCH_SPAN_MS;
    const due = (offs, done) => {
      let any = false;
      offs.forEach((m, i) => {
        if (t >= at + m * 60_000 && !done.includes(i)) {
          done.push(i);
          any = span;
        }
      });
      return any;
    };
    const look = due(LUNCH_LOOKS, st.looked),
      slack = due(LUNCH_SLACKS, st.slacked);
    if (look || slack) {
      saveState();
      lunchRun({ slack });
    }
    if (lunchPhase(cfg, st, t) === 'lunch' && st.alerted < (st.snooze || at)) {
      st.alerted = t;
      saveState();
      lunchAlert(cfg);
    }
  }
  lunchSay();
}
/** Lunch time: an alert — the app's carries Menus · Going · In 15 minutes, a click opens the chalkboard. */
function lunchAlert(cfg) {
  const s = lunchSummary(),
    have = s.places.filter(p => p.dishes.length);
  const main = p => p.dishes.find(d => !/^(sopa|creme|caldo|entrada|p[aã]o\b)/i.test(d)) || p.dishes[0];
  const title = have.length ? `${have.length} menu${have.length === 1 ? '' : 's'} in` : 'No menu read yet';
  const snippet =
    have
      .slice(0, 3)
      .map(p => `${p.name}: ${main(p)}`)
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
  const body = await jsonBody(req),
    cfg = lunchCfg(),
    act = body.act,
    t = Date.now();
  if (!cfg) return json(res, 409, { error: 'lunch is not set up — Settings › Lunch' });
  const st = lunchToday(t);
  if (act === 'going') {
    st.went = t;
    st.snooze = 0;
  } else if (act === 'snooze') {
    st.snooze = t + LUNCH_SNOOZE_MS;
    st.went = 0;
  } else if (act === 'back') {
    st.back = t;
  } else if (act === 'read') lunchRun({ slack: !!cfg.slack, all: true });
  else return json(res, 400, { error: 'expected {act: going | snooze | back | read}' });
  saveState();
  lunchSay();
  return json(res, 200, lunchSummary());
}
