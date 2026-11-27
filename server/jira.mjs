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
  const prose = String(text || '').replace(FENCED, fence => ' '.repeat(fence.length));

  const links = [...prose.matchAll(TICKET_URL_RE)];

  for (const match of links) out.push({ at: match.index, key: match[1], url: match[0] });
  const inLink = index => links.some(link => index >= link.index && index < link.index + link[0].length);

  for (const match of prose.matchAll(TICKET_RE)) {
    if (!inLink(match.index)) out.push({ at: match.index, key: `${match[1]}-${match[2]}`, url: null });
  }

  return out.sort((left, right) => left.at - right.at);
}

const ticketStatus = new Map(); // key -> { found, summary, status, cat, type, assignee: {name, avatar, me}, checkedAt }
const noTicket = new Set(); // keys Jira had no issue for: not taken up again until a restart
let jiraProjects = null; // the site's project keys, once asked (null: not yet — a bare key waits)

/** Whether a key is worth a question: a site set up, and one of its projects' — none until they are known (2026-10-14:
 *  unknown asked about every key, UTF-8 and SHA-256 with them, after a reset or a failed project search). */
export const ticketWanted = key => !!setup.jira && !noTicket.has(key) && !!jiraProjects?.has(key.split('-')[0]);

function noteTicket(session, key, ts, by, url = null) {
  const at = session.tickets.findIndex(noted => noted.key === key);

  const ticket =
    at >= 0 ? session.tickets.splice(at, 1)[0] : { key, url: null, count: 0, by: null, firstAt: ts, lastAt: ts };

  if (url && !ticket.url) ticket.url = url;

  if (by === 'branch') ticket.branch = true;
  else {
    ticket.count++;
    ticket.by = by;
  }

  ticket.lastAt = ts || ticket.lastAt || null;
  session.tickets.unshift(ticket);
  if (session.tickets.length > MAX_TICKETS) session.tickets.length = MAX_TICKETS;
  if (!indexing && ticketWanted(key)) queueTicket(key);
}

export function noteTickets(session, text, ts, by) {
  if (!text || !/[A-Z]-[1-9]/.test(text)) return;
  const said = new Map();

  for (const mention of ticketsIn(text)) {
    const first = said.get(mention.key);

    if (!first) said.set(mention.key, mention);
    else if (mention.url && !first.url) first.url = mention.url;
  }

  for (const mention of [...said.values()].reverse()) noteTicket(session, mention.key, ts, by, mention.url); // the first said ends up first
}

export function noteBranchTicket(session, branch, ts) {
  session.ticketBranch = branch;
  const match = BRANCH_TICKET_RE.exec(branch);

  if (!match) return;
  noteTicket(session, match[1].toUpperCase(), ts, 'branch');
}

/** The chat's tickets as the page draws them — those Jira answered for: the branch's first, then the latest said. */
export function shownTickets(session) {
  if (!setup.jira) return [];
  const site = setup.jira.site;

  return session.tickets
    .filter(ticket => ticketStatus.get(ticket.key)?.found)
    .sort((left, right) => (right.branch ? 1 : 0) - (left.branch ? 1 : 0))
    .map(ticket => {
      const info = ticketStatus.get(ticket.key);

      return {
        key: ticket.key,
        url: `${site}/browse/${ticket.key}`,
        summary: info.summary,
        status: info.status,
        cat: info.cat,
        type: info.type,
        assignee: info.assignee,
        branch: !!ticket.branch,
        count: ticket.count,
        lastAt: ticket.lastAt,
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
  const entry = ticketStatus.get(key);

  if (!entry) return false;
  return now - entry.checkedAt < Math.max(ttl, entry.cat === 'done' ? 60 * 60_000 : 0);
}

function dueTickets(list, now = Date.now()) {
  const every = new Map();

  for (const session of list) {
    const ms = prEvery(session, now);

    for (const ticket of session.tickets) {
      if (ticketWanted(ticket.key) && !(every.get(ticket.key) <= ms)) every.set(ticket.key, ms);
    }
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
    } catch (error) {
      if (gen !== jiraGen) return;
      jiraProjectsAt = Date.now() - 55 * 60_000;
      return jiraFailed(error);
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

  const kept = await jiraKept();
  const site = setup.jira?.site || null;

  if (!kept.token || !site) return kept;

  if (!jiraTokenSite) {
    setJiraTokenSite(site);
    saveState();
  }

  return jiraTokenSite === site
    ? kept
    : { token: null, from: null, why: `the token kept is for ${jiraTokenSite} — paste one for ${site}`, at: kept.at };
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
    } catch (error) {
      if (!/could not be found/i.test(String(error.stderr || error.message))) {
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
    const quote = text => `"${text.replace(/[\\"]/g, '\\$&')}"`;

    const cmd = token
      ? `add-generic-password -U -s ${quote(JIRA_ITEM)} -a ${quote(email)} -l ${quote(JIRA_ITEM)} -w ${quote(token)}\n`
      : `delete-generic-password -s ${quote(JIRA_ITEM)} -a ${quote(email)}\n`;

    const out = await new Promise((res, rej) => {
      const child = execFile('/usr/bin/security', ['-i'], { timeout: 30_000 }, (err, so, se) =>
        err ? rej(new Error(String(se || err.message).trim())) : res(String(se || '') + String(so || '')),
      );

      child.stdin.end(cmd);
    });

    if (token && /error|could not/i.test(out)) throw new Error(out.trim().split('\n')[0]);
  }

  setJiraTokenSite(token ? setup.jira?.site || null : null);
  saveState();
  jiraReset();
}

/** One request to the site, as you: JSON in, JSON out, a throw with Jira's own words. */
async function jiraAsk(path, body) {
  const jira = setup.jira;

  if (!jira) throw new Error('no Jira site in the setup');
  const { token, why } = await jiraToken();

  if (!token) throw Object.assign(new Error(why), { quiet: true });

  const response = await fetch(new URL(path, jira.site), {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
    headers: {
      authorization: `Basic ${Buffer.from(`${jira.email}:${token}`).toString('base64')}`,
      accept: 'application/json',
      ...(body && { 'content-type': 'application/json' }),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw Object.assign(
      new Error(
        data?.errorMessages?.[0] ||
          data?.message ||
          (response.status === 401 ? 'Jira refused the email and token' : `Jira: HTTP ${response.status}`),
      ),
      { status: response.status },
    );
  }

  return data;
}

async function jiraProjectKeys() {
  const keys = new Set();

  for (let at = 0, page = 0; page < 20; page++) {
    const data = await jiraAsk(`/rest/api/3/project/search?maxResults=100&startAt=${at}`);

    for (const project of data?.values || []) if (project?.key) keys.add(String(project.key));
    if (data?.isLast !== false || !(data?.values || []).length) break;
    at += data.values.length;
  }

  return keys;
}

function jiraFailed(error) {
  const was = jiraError;

  jiraError = error.message;
  if (!error.quiet && was !== jiraError) console.error('[peixairada] jira:', error.message);
  jiraPause = Math.min(jiraPause ? jiraPause * 2 : 60_000, 30 * 60_000);
  jiraPauseUntil = Date.now() + jiraPause;
  ticketQueue.clear();
}

const TICKET_CAT = { new: 'todo', indeterminate: 'doing', done: 'done' };

async function drainTickets() {
  if (ticketBusy || !ticketQueue.size) return;
  const batch = [...ticketQueue].slice(0, 100);

  for (const key of batch) ticketQueue.delete(key);
  ticketBusy = true;
  const gen = jiraGen;

  try {
    if (!jiraMe) {
      const myself = await jiraAsk('/rest/api/3/myself');

      if (gen === jiraGen) jiraMe ??= { id: myself?.accountId || null, name: myself?.displayName || null };
    }

    const data = await jiraAsk('/rest/api/3/issue/bulkfetch', {
      issueIdsOrKeys: batch,
      fields: ['summary', 'status', 'issuetype', 'assignee'],
    });

    if (gen !== jiraGen) return; // the site or login changed while it was asked: its answers are another's (finally drains on)
    jiraError = null;
    jiraPause = 0;
    jiraPauseUntil = 0;

    const now = Date.now();
    const got = new Map((data?.issues || []).map(issue => [String(issue.key), issue]));

    for (const key of batch) {
      const issue = got.get(key);
      const fields = issue?.fields || {};
      const who = fields.assignee;

      const info = issue
        ? {
            found: true,
            summary: fields.summary || '',
            status: fields.status?.name || '',
            cat: TICKET_CAT[fields.status?.statusCategory?.key] || 'todo',
            type: fields.issuetype?.name || '',
            assignee: who
              ? {
                  name: who.displayName || '',
                  avatar: who.avatarUrls?.['24x24'] || null,
                  me: !!jiraMe?.id && who.accountId === jiraMe.id,
                }
              : null,
          }
        : { found: false };

      if (!issue) noTicket.add(key);
      setTicketInfo(key, { ...info, checkedAt: now });
    }
  } catch (error) {
    if (gen === jiraGen) jiraFailed(error);
  } finally {
    ticketBusy = false;
    if (ticketQueue.size) drainTickets();
  }
}

function setTicketInfo(key, info) {
  const before = JSON.stringify({ ...ticketStatus.get(key), checkedAt: 0 });

  ticketStatus.set(key, info);

  if (JSON.stringify({ ...info, checkedAt: 0 }) !== before) {
    for (const session of sessions.values()) {
      if (session.tickets.some(ticket => ticket.key === key)) schedulePush(session);
    }
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
  for (const session of sessions.values()) if (session.tickets.length) schedulePush(session);
  if (!indexing) sweepTickets();
}

/** What the settings' Setup says of it: the site, where the token is, who you are there, what went wrong. */
export async function jiraInfo() {
  const jira = setup.jira;
  const tok = jira ? await jiraToken() : null;

  const gen = jiraGen;

  if (jira && tok?.token && !jiraMe && !jiraError) {
    try {
      const myself = await jiraAsk('/rest/api/3/myself');

      if (gen === jiraGen) jiraMe = { id: myself?.accountId || null, name: myself?.displayName || null };
    } catch (error) {
      if (gen === jiraGen) jiraError = error.message;
    }
  }

  return {
    site: jira?.site || null,
    email: jira?.email || null,
    token: tok?.from || null,
    me: jiraMe?.name || null,
    error: jira ? (tok && !tok.token ? tok.why : jiraError) : null,
    tickets: [...ticketStatus.values()].filter(info => info.found).length,
    suggest: jira ? null : jiraCliConfig(),
  };
}

/** jira-cli's own config, when there is one: its server and login, offered in the Setup's empty boxes. */
function jiraCliConfig() {
  const file = process.env.JIRA_CONFIG_FILE || join(homedir(), '.config', '.jira', '.config.yml');

  try {
    const text = readFileSync(file, 'utf8');
    const setting = key => new RegExp(`^${key}:\\s*"?([^"\\n]+?)"?\\s*$`, 'm').exec(text)?.[1] || null;
    const site = jiraSite(setting('server'));

    return site ? { site, email: setting('login') } : null;
  } catch {
    return null;
  }
}
