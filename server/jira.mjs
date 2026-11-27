// Jira tickets named in a chat (2026-10-08): found in its words and its branch, asked of the site, kept fresh.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { execFileP } from './env.mjs';
import { prEvery } from './prs/status.mjs';
import { jiraSite, setup } from './setup.mjs';
import { schedulePush } from './sse.mjs';
import { indexing, jiraTokenSite, saveState, sessions, setJiraTokenSite } from './state.mjs';

// ---- Jira tickets named in the chat (2026-10-08) -----------------------------------------------------------------------
// What a PR is to the chat (above), a ticket is too: `KEY-123` in its prose, a link to one (…/browse/KEY-123), or its git
// branch (feature/key-123-…), with its status, summary and assignee from Jira Cloud's REST API. A bare key is a ticket
// only when its project is one of the site's (`jiraProjects`, asked once an hour — UTF-8, SHA-256 and GPT-4 are no
// tickets), and the chat shows one only once Jira has answered for it (`shownTickets`); one Jira has not got is let go
// (`noTicket`). Nothing is asked until the setup names a site and your login there (setup.jira) and a token is at hand —
// JIRA_API_TOKEN (jira-cli's own variable), else the keychain item JIRA_ITEM the settings' Setup writes through
// `security`'s stdin (no process ever has it in its arguments); JIRA_TOKEN_FILE stands in for the keychain in a test.
// The token goes into Jira's requests and nowhere else — the page gets keys, statuses and names. The third thing here
// that talks to the network, after gh and the usage endpoint; polled by the chat's recency, as its PRs are (prEvery).
const TICKET_RE = /(?<![\w.-])([A-Z][A-Z0-9_]{1,9})-([1-9]\d{0,6})(?![\w-])/g;
const TICKET_URL_RE = /https?:\/\/[\w.-]+(?::\d+)?\/browse\/([A-Z][A-Z0-9_]{1,9}-[1-9]\d{0,6})(?![\w-])/g;
const BRANCH_TICKET_RE = /(?:^|[/_-])([A-Za-z][A-Za-z0-9]{1,9}-[1-9]\d{0,6})(?=$|[/_.-])/;
const FENCED = /```[\s\S]*?(?:```|$)/g;
const MAX_TICKETS = 20;
const JIRA_ITEM = 'peixAIrada Jira'; // the keychain item: service, with your Jira email as its account

/** The tickets one message names, in order: `{at, key, url}` — a link's key with its URL, a bare key's with none. Keys in
 *  fenced code are not counted (a log, a stack trace); in inline code they are — Claude writes `KEY-12` so. */
export function ticketsIn(text) {
  const out = [];
  const t = String(text || '').replace(FENCED, c => ' '.repeat(c.length));

  const links = [...t.matchAll(TICKET_URL_RE)];

  for (const m of links) out.push({ at: m.index, key: m[1], url: m[0] });
  const inLink = i => links.some(m => i >= m.index && i < m.index + m[0].length);

  for (const m of t.matchAll(TICKET_RE)) {
    if (!inLink(m.index)) out.push({ at: m.index, key: `${m[1]}-${m[2]}`, url: null });
  }

  return out.sort((a, b) => a.at - b.at);
}

const ticketStatus = new Map(); // key -> { found, summary, status, cat, type, assignee: {name, avatar, me}, checkedAt }
const noTicket = new Set(); // keys Jira had no issue for: not taken up again until a restart
let jiraProjects = null; // the site's project keys, once asked (null: not yet — a bare key waits)

/** Whether a key is worth a question: a site set up, and one of its projects' — none until they are known (2026-10-14:
 *  unknown asked about every key, UTF-8 and SHA-256 with them, after a reset or a failed project search). */
export const ticketWanted = key => !!setup.jira && !noTicket.has(key) && !!jiraProjects?.has(key.split('-')[0]);

function noteTicket(s, key, ts, by, url = null) {
  const at = s.tickets.findIndex(t => t.key === key);
  const t = at >= 0 ? s.tickets.splice(at, 1)[0] : { key, url: null, count: 0, by: null, firstAt: ts, lastAt: ts };

  if (url && !t.url) t.url = url;

  if (by === 'branch') t.branch = true;
  else {
    t.count++;
    t.by = by;
  }

  t.lastAt = ts || t.lastAt || null;
  s.tickets.unshift(t);
  if (s.tickets.length > MAX_TICKETS) s.tickets.length = MAX_TICKETS;
  if (!indexing && ticketWanted(key)) queueTicket(key);
}

export function noteTickets(s, text, ts, by) {
  if (!text || !/[A-Z]-[1-9]/.test(text)) return;
  const said = new Map();

  for (const r of ticketsIn(text)) {
    const f = said.get(r.key);

    if (!f) said.set(r.key, r);
    else if (r.url && !f.url) f.url = r.url;
  }

  for (const r of [...said.values()].reverse()) noteTicket(s, r.key, ts, by, r.url); // the first said ends up first
}

export function noteBranchTicket(s, branch, ts) {
  s.ticketBranch = branch;
  const m = BRANCH_TICKET_RE.exec(branch);

  if (!m) return;
  noteTicket(s, m[1].toUpperCase(), ts, 'branch');
}

/** The chat's tickets as the page draws them — those Jira answered for: the branch's first, then the latest said. */
export function shownTickets(s) {
  if (!setup.jira) return [];
  const site = setup.jira.site;

  return s.tickets
    .filter(t => ticketStatus.get(t.key)?.found)
    .sort((a, b) => (b.branch ? 1 : 0) - (a.branch ? 1 : 0))
    .map(t => {
      const i = ticketStatus.get(t.key);

      return {
        key: t.key,
        url: `${site}/browse/${t.key}`,
        summary: i.summary,
        status: i.status,
        cat: i.cat,
        type: i.type,
        assignee: i.assignee,
        branch: !!t.branch,
        count: t.count,
        lastAt: t.lastAt,
      };
    });
}

// Asked about as PRs are: never-asked first, then by the most recently touched chat naming it (prEvery's rows); a
// ticket done is asked an hour apart at most (it can be reopened, a PR merged cannot).
const TICKET_TTL_MS = Number(process.env.TICKET_TTL_MS || 30_000);
const ticketQueue = new Set();

export let ticketTimer = null;
export let ticketBusy = false;
export let jiraPauseUntil = 0;
export let jiraPause = 0;
export let jiraError = null;
export let jiraMe = null;
export let jiraProjectsAt = 0;
let jiraGen = 0; // one per jiraReset (2026-10-14): an answer asked for before one is the old site's or login's, and dropped

function ticketFresh(key, ttl = TICKET_TTL_MS, now = Date.now()) {
  const e = ticketStatus.get(key);

  if (!e) return false;
  return now - e.checkedAt < Math.max(ttl, e.cat === 'done' ? 60 * 60_000 : 0);
}

function dueTickets(list, now = Date.now()) {
  const every = new Map();

  for (const s of list) {
    const ms = prEvery(s, now);

    for (const t of s.tickets) if (ticketWanted(t.key) && !(every.get(t.key) <= ms)) every.set(t.key, ms);
  }

  return [...every].filter(([key, ms]) => !ticketFresh(key, ms, now)).map(([key]) => key);
}

export function queueTicket(key, ttl = TICKET_TTL_MS) {
  if (ticketQueue.has(key) || ticketFresh(key, ttl)) return;
  ticketQueue.add(key);

  ticketTimer ??= setTimeout(() => {
    ticketTimer = null;
    drainTickets();
  }, 250);
}

/** On the registry poll and at boot: the site's projects (hourly), then the tickets due a look. */
export async function sweepTickets() {
  if (!setup.jira || Date.now() < jiraPauseUntil) return;

  if (Date.now() - jiraProjectsAt > 60 * 60_000) {
    jiraProjectsAt = Date.now();
    const gen = jiraGen;

    try {
      const keys = await jiraProjectKeys();

      if (gen !== jiraGen) return;
      jiraProjects = keys;
    } catch (e) {
      if (gen !== jiraGen) return;
      jiraProjectsAt = Date.now() - 55 * 60_000;
      return jiraFailed(e);
    } // again in five minutes
  }

  for (const key of dueTickets(sessions.values())) queueTicket(key, 0);
}

// The token kept is for the site it was saved for (2026-11-06): the setup's site is a line of a file, and changing it
// sent the same Basic token to whatever https host it named. The site it was saved for is kept beside it
// (`jiraTokenSite`; a token from before that, the site at the first read); another site has no token until one is
// pasted for it. JIRA_API_TOKEN is yours to point where you like.
async function jiraToken() {
  if (process.env.JIRA_API_TOKEN) return { token: process.env.JIRA_API_TOKEN, from: 'env' };

  const t = await jiraKept();
  const site = setup.jira?.site || null;

  if (!t.token || !site) return t;

  if (!jiraTokenSite) {
    setJiraTokenSite(site);
    saveState();
  }

  return jiraTokenSite === site
    ? t
    : { token: null, from: null, why: `the token kept is for ${jiraTokenSite} — paste one for ${site}`, at: t.at };
}

async function jiraKept() {
  if (jiraToken.cache && (jiraToken.cache.token || Date.now() - jiraToken.cache.at < 5 * 60_000)) {
    return jiraToken.cache;
  }

  const email = setup.jira?.email;

  let token = null;
  let why = 'no API token yet'; // the page says where to paste one, from where it says it (2026-10-16)

  if (process.env.JIRA_TOKEN_FILE) {
    try {
      token = readFileSync(process.env.JIRA_TOKEN_FILE, 'utf8').trim() || null;
    } catch {}
  } else if (process.platform === 'darwin' && email) {
    try {
      token =
        (
          await execFileP('/usr/bin/security', ['find-generic-password', '-s', JIRA_ITEM, '-a', email, '-w'], {
            timeout: 60_000,
          })
        ).stdout.trim() || null;
    } catch (e) {
      if (!/could not be found/i.test(String(e.stderr || e.message))) {
        why = 'keychain access refused (allow `security` when asked)';
      }
    }
  }

  return (jiraToken.cache = {
    token,
    from: token ? (process.env.JIRA_TOKEN_FILE ? 'file' : 'keychain') : null,
    why,
    at: Date.now(),
  });
}

/** Into the keychain — by `security -i` reading its command from stdin, so the token is in no process's arguments. */
export async function saveJiraToken(token) {
  const email = setup.jira?.email;

  if (!email) throw new Error('set the site and your email first');

  if (process.env.JIRA_TOKEN_FILE) {
    if (token) writeFileSync(process.env.JIRA_TOKEN_FILE, token, { mode: 0o600 });
    else rmSync(process.env.JIRA_TOKEN_FILE, { force: true });
  } else {
    const q = t => `"${t.replace(/[\\"]/g, '\\$&')}"`;

    const cmd = token
      ? `add-generic-password -U -s ${q(JIRA_ITEM)} -a ${q(email)} -l ${q(JIRA_ITEM)} -w ${q(token)}\n`
      : `delete-generic-password -s ${q(JIRA_ITEM)} -a ${q(email)}\n`;

    const out = await new Promise((res, rej) => {
      const p = execFile('/usr/bin/security', ['-i'], { timeout: 30_000 }, (err, so, se) =>
        err ? rej(new Error(String(se || err.message).trim())) : res(String(se || '') + String(so || '')),
      );

      p.stdin.end(cmd);
    });

    if (token && /error|could not/i.test(out)) throw new Error(out.trim().split('\n')[0]);
  }

  setJiraTokenSite(token ? setup.jira?.site || null : null);
  saveState();
  jiraReset();
}

/** One request to the site, as you: JSON in, JSON out, a throw with Jira's own words. */
async function jiraAsk(path, body) {
  const j = setup.jira;

  if (!j) throw new Error('no Jira site in the setup');
  const { token, why } = await jiraToken();

  if (!token) throw Object.assign(new Error(why), { quiet: true });

  const r = await fetch(new URL(path, j.site), {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
    headers: {
      authorization: `Basic ${Buffer.from(`${j.email}:${token}`).toString('base64')}`,
      accept: 'application/json',
      ...(body && { 'content-type': 'application/json' }),
    },
  });

  const d = await r.json().catch(() => null);

  if (!r.ok) {
    throw Object.assign(
      new Error(
        d?.errorMessages?.[0] ||
          d?.message ||
          (r.status === 401 ? 'Jira refused the email and token' : `Jira: HTTP ${r.status}`),
      ),
      { status: r.status },
    );
  }

  return d;
}

async function jiraProjectKeys() {
  const keys = new Set();

  for (let at = 0, i = 0; i < 20; i++) {
    const d = await jiraAsk(`/rest/api/3/project/search?maxResults=100&startAt=${at}`);

    for (const p of d?.values || []) if (p?.key) keys.add(String(p.key));
    if (d?.isLast !== false || !(d?.values || []).length) break;
    at += d.values.length;
  }

  return keys;
}

function jiraFailed(e) {
  const was = jiraError;

  jiraError = e.message;
  if (!e.quiet && was !== jiraError) console.error('[peixairada] jira:', e.message);
  jiraPause = Math.min(jiraPause ? jiraPause * 2 : 60_000, 30 * 60_000);
  jiraPauseUntil = Date.now() + jiraPause;
  ticketQueue.clear();
}

const TICKET_CAT = { new: 'todo', indeterminate: 'doing', done: 'done' };

async function drainTickets() {
  if (ticketBusy || !ticketQueue.size) return;
  const batch = [...ticketQueue].slice(0, 100);

  for (const k of batch) ticketQueue.delete(k);
  ticketBusy = true;
  const gen = jiraGen;

  try {
    if (!jiraMe) {
      const m = await jiraAsk('/rest/api/3/myself');

      if (gen === jiraGen) jiraMe ??= { id: m?.accountId || null, name: m?.displayName || null };
    }

    const d = await jiraAsk('/rest/api/3/issue/bulkfetch', {
      issueIdsOrKeys: batch,
      fields: ['summary', 'status', 'issuetype', 'assignee'],
    });

    if (gen !== jiraGen) return; // the site or login changed while it was asked: its answers are another's (finally drains on)
    jiraError = null;
    jiraPause = 0;
    jiraPauseUntil = 0;

    const now = Date.now();
    const got = new Map((d?.issues || []).map(i => [String(i.key), i]));

    for (const key of batch) {
      const i = got.get(key);
      const f = i?.fields || {};
      const who = f.assignee;

      const info = i
        ? {
            found: true,
            summary: f.summary || '',
            status: f.status?.name || '',
            cat: TICKET_CAT[f.status?.statusCategory?.key] || 'todo',
            type: f.issuetype?.name || '',
            assignee: who
              ? {
                  name: who.displayName || '',
                  avatar: who.avatarUrls?.['24x24'] || null,
                  me: !!jiraMe?.id && who.accountId === jiraMe.id,
                }
              : null,
          }
        : { found: false };

      if (!i) noTicket.add(key);
      setTicketInfo(key, { ...info, checkedAt: now });
    }
  } catch (e) {
    if (gen === jiraGen) jiraFailed(e);
  } finally {
    ticketBusy = false;
    if (ticketQueue.size) drainTickets();
  }
}

function setTicketInfo(key, info) {
  const before = JSON.stringify({ ...ticketStatus.get(key), checkedAt: 0 });

  ticketStatus.set(key, info);

  if (JSON.stringify({ ...info, checkedAt: 0 }) !== before) {
    for (const s of sessions.values()) if (s.tickets.some(t => t.key === key)) schedulePush(s);
  }
}

/** The site, the login or the token changed: what was learnt under the old ones is forgotten, and asked again. */
export function jiraReset() {
  jiraGen++;
  jiraToken.cache = null;
  jiraMe = null;
  jiraProjects = null;
  jiraProjectsAt = 0;
  jiraError = null;
  jiraPause = 0;
  jiraPauseUntil = 0;
  ticketStatus.clear();
  noTicket.clear();
  ticketQueue.clear();
  for (const s of sessions.values()) if (s.tickets.length) schedulePush(s);
  if (!indexing) sweepTickets();
}

/** What the settings' Setup says of it: the site, where the token is, who you are there, what went wrong. */
export async function jiraInfo() {
  const j = setup.jira;
  const tok = j ? await jiraToken() : null;

  const gen = jiraGen;

  if (j && tok?.token && !jiraMe && !jiraError) {
    try {
      const m = await jiraAsk('/rest/api/3/myself');

      if (gen === jiraGen) jiraMe = { id: m?.accountId || null, name: m?.displayName || null };
    } catch (e) {
      if (gen === jiraGen) jiraError = e.message;
    }
  }

  return {
    site: j?.site || null,
    email: j?.email || null,
    token: tok?.from || null,
    me: jiraMe?.name || null,
    error: j ? (tok && !tok.token ? tok.why : jiraError) : null,
    tickets: [...ticketStatus.values()].filter(t => t.found).length,
    suggest: j ? null : jiraCliConfig(),
  };
}

/** jira-cli's own config, when there is one: its server and login, offered in the Setup's empty boxes. */
function jiraCliConfig() {
  const file = process.env.JIRA_CONFIG_FILE || join(homedir(), '.config', '.jira', '.config.yml');

  try {
    const t = readFileSync(file, 'utf8');
    const v = k => new RegExp(`^${k}:\\s*"?([^"\\n]+?)"?\\s*$`, 'm').exec(t)?.[1] || null;
    const site = jiraSite(v('server'));

    return site ? { site, email: v('login') } : null;
  } catch {
    return null;
  }
}
