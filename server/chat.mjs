// The chat (2026-10-17): the people the board is shared with, in a GitHub repo's issue — messages, polls, people.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CONFIG_FILE, execFileP, STATE_FILE } from './env.mjs';
import { ghBin } from './bins.mjs';
import { json, jsonBody } from './http.mjs';
import { nativeNotify } from './notify.mjs';
import { prStatus } from './prs/status.mjs';
import { boardConfig, cleanSetup, ORG_NAME, REPO_RE, saveConfig, setSetup, setup, tildePath } from './setup.mjs';
import { broadcast } from './sse.mjs';
import { chatQuiet, chatSeen, notificationsOn, saveState, sessions } from './state.mjs';
import { plainSnippet } from './transcript/text.mjs';

// One private repo is the chat: one issue, the oldest open one labelled `room`, its comments the messages — one chat,
// with no name and no rooms to pick from (2026-10-18; docs/DECISIONS.md, and the research behind it in docs/studies/). GitHub is its server — who you are (the `gh` login every board has), who
// may read and post (the repo's collaborators; on an organization's repo, Read), who invites and removes (its admin:
// only that board draws it), the history a Mac asleep catches up on, and the moderation. Off until the setup names the
// repo (setup.chat). Asked over REST with gh's own token, read once (`gh auth token`) and sent nowhere but GitHub, rather
// than a `gh api` per look: one fixed URL — the repo's newest CHAT_WINDOW comments — with its ETag, so a look
// that finds nothing new is a 304, which costs nothing of the rate limit (and which `gh api` reads as a failure).
// Every CHAT_FAST_MS while a page shows the chat (it says so, POST /api/chat/watch), CHAT_SLOW_MS otherwise. Writes go
// one at a time, CHAT_GAP_MS apart (GitHub's limits on content made). GitHub's mails about the repo are turned off as
// the board first reads it (its subscription, ignored): each message would mail every member otherwise. With no repo
// set, a board looks for an invitation to one every CHAT_INVITES_MS (one call, a 304 when nothing changed) — not at boot —, and
// whenever Settings › Chat is opened.
// A poll is a message (2026-10-20): a question and up to eight answers, each one of the eight reactions GitHub has — a
// vote is that reaction on the comment, so it says who as well as how many, and one given on GitHub counts. A poll's
// votes are asked of GitHub when its counts on the comments' list moved (POLL_RX, chatVotes).
// A picture is a message too (2026-11-25): GitHub's own attachment, uploaded through its endpoint for them (the one
// behind gh's --attach), which takes one only from someone who can write to the repo it is uploaded against — and a
// member of an organization's chat only reads it, so its moderation holds. Their pictures go against the chat's files
// repo (`<repo>-files`, private, empty), where every member writes: the admin's board makes it and keeps its people the
// chat's (filesKeep), a member's board takes its invitation by itself (chatPicsFind). A picture shows to whoever can
// read the repo it went against: everyone in the chat either way. Fetched and kept by server/chat-pics.mjs.
// A message is edited by its own author alone (2026-11-25, PATCH of the comment; a poll never); any message wears
// GitHub's eight reactions, who as well as how many (chatVotes asks a message's when its counts moved, the newest
// REACT_SPAN), a poll's being its votes. The emoji's names are GitHub's own (GET /emojis, kept a week: chatEmojis), so a
// :shortcode: written on GitHub reads the same here.
// What comes in is someone else's words: the page draws it in a module of its own, and nothing here or there hands it
// to a drawer, a claude or a notification's Reply… (test/chat.test.mjs holds the page to that).
const GITHUB_API = (process.env.GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');

const CHAT_FAST_MS = Number(process.env.CHAT_FAST_MS || 3000);
const CHAT_SLOW_MS = Number(process.env.CHAT_SLOW_MS || 20_000);

const CHAT_GAP_MS = Number(process.env.CHAT_GAP_MS || 1000);
const CHAT_INVITES_MS = Number(process.env.CHAT_INVITES_MS || 10 * 60_000);

const CHAT_FIND_MS = 60_000;
const CHAT_PLACES_MS = 60_000;
const CHAT_WATCH_MS = 30_000;
const CHAT_WINDOW = 100;
const CHAT_KEEP = 300;
const CHAT_BODY_MAX = 10_000;
const CHAT_SUGGEST = 12;

const ROOM_LABEL = 'room';
const ROOM_MARK = 'peixAIrada chat'; // the label the chat's issue wears; the words a chat repo's description starts with

// the files repo's description: never ROOM_MARK's words first, or it would be listed as a chat and offered as one
const FILES_MARK = 'Pictures for the peixAIrada chat in';
const CHAT_PICS_AGAIN_MS = Number(process.env.CHAT_PICS_AGAIN_MS || 15_000);

/** The repo a chat's members put their pictures against: beside it, by its name. */
export const filesOf = repo => `${repo}-files`;
export const chat = {
  gen: 0,
  live: false,
  repo: null,
  repoId: null,
  me: null,
  role: null,
  org: false,
  room: null,
  msgs: [],
  tags: new Map(),
  ready: false,
  error: null,
  missing: false,
  pics: null,
  picsAt: 0,
  invites: [],
  invitesAt: 0,
  askedAt: 0,
  foundAt: 0,
  watchUntil: 0,
  pause: 0,
  pauseUntil: 0,
  busy: false,
  timer: null,
  writes: Promise.resolve(),
  lastWrite: 0,
  said: '',
};
export const chatErr = (status, message) => Object.assign(new Error(message), { status });
// Not the characters that let a line say other than it shows (2026-10-17): C0 controls but the newline and the tab, and
// the bidirectional overrides and isolates.
const UNSAID = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f‪-‮⁦-⁩]/g;

/** One REST call to GitHub as the gh login: {status, data, etag}. A 304 is an answer (nothing new); a 401 reads the
 *  token again, once; any other failure throws with GitHub's own words and its status. `text`: the answer's words, not
 *  JSON (POST /markdown's HTML). */
export async function ghRest(method, path, body, etag, { text = false } = {}) {
  for (let again = 0; ; again++) {
    const token = await ghToken(again > 0);

    if (!token) throw Object.assign(chatErr(401, 'gh is not signed in here — gh auth login'), { quiet: true });

    const response = await fetch(GITHUB_API + path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'peixAIrada',
        ...(etag && { 'if-none-match': etag }),
        ...(body !== undefined && { 'content-type': 'application/json' }),
      },
    });

    if (response.status === 401 && !again) continue;

    const data =
      response.status === 204 || response.status === 304
        ? null
        : text && response.ok
          ? await response.text()
          : await response.json().catch(() => null);

    if (response.status >= 400) {
      throw chatErr(
        response.status,
        `GitHub: ${data?.errors?.[0]?.message || data?.message || `HTTP ${response.status}`}`,
      );
    }

    return { status: response.status, data, etag: response.headers.get('etag') };
  }
}

export async function ghToken(fresh = false) {
  const cached = ghToken.cache;

  if (!fresh && cached && (cached.token || Date.now() - cached.at < 60_000)) return cached.token;
  const bin = ghBin();
  let token = null;

  if (bin) {
    try {
      token = (await execFileP(bin, ['auth', 'token'], { timeout: 15_000 })).stdout.trim() || null;
    } catch {}
  }

  ghToken.cache = { token, at: Date.now() };
  return token;
}

/** A comment as the page gets it: whose (login, face), the room's number, the words (capped, the unsaid characters out);
 *  a poll's question and answers (`poll`), and its counts as the list has them (`rx`) — another message's reactions,
 *  counted (`rc`, those given; `rx` their word, '' for none). */
function chatMsg(comment) {
  const body = String(comment.body || '')
    .replace(UNSAID, '')
    .slice(0, CHAT_BODY_MAX);

  const poll = pollOf(body);

  return {
    id: comment.id,
    n:
      Number(
        String(comment.issue_url || '')
          .split('/')
          .pop(),
      ) || 0,
    who: comment.user?.login || 'ghost',
    face: comment.user?.avatar_url || null,
    body,
    at: comment.created_at,
    edited: comment.updated_at && comment.updated_at !== comment.created_at ? comment.updated_at : null,
    url: comment.html_url || null,
    ...(poll
      ? { poll, rx: poll.opts.map(option => comment.reactions?.[option.r] ?? 0).join(' ') }
      : reactCounts(
          REACTIONS.flatMap(reaction => Array(comment.reactions?.[reaction] ?? 0).fill({ content: reaction })),
        )),
  };
}

// GitHub's eight reactions, in the order its own page lists them; a message's counted from a list of them
export const REACTIONS = ['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes'];
const REACT_SPAN = 100;

function reactCounts(list) {
  const rc = {};

  for (const reaction of list) {
    if (REACTIONS.includes(reaction.content)) rc[reaction.content] = (rc[reaction.content] || 0) + 1;
  }

  return {
    rc,
    rx: REACTIONS.filter(reaction => rc[reaction])
      .map(reaction => `${reaction}:${rc[reaction]}`)
      .join(' '),
  };
}

const reactsOf = list =>
  (list || [])
    .filter(reaction => REACTIONS.includes(reaction.content) && reaction.user?.login)
    .map(reaction => ({
      id: reaction.id,
      r: reaction.content,
      who: reaction.user.login,
      face: reaction.user.avatar_url || null,
    }));

// A poll's body, as GitHub shows it too: a mark it hides, the question, a line per answer — the reaction that votes for
// it, then its words —, and how to vote there. The reactions in the order answers take them; an answer that says no
// wears 👎. Markdown alone, no raw HTML (2026-10-20): a board from before polls draws it as words and escapes HTML, so
// the mark is a link's definition, which it hides too — the first poll's HTML comment is read still.
const POLL_RX = {
  '+1': '👍',
  hooray: '🎉',
  rocket: '🚀',
  heart: '❤️',
  eyes: '👀',
  laugh: '😄',
  confused: '😕',
  '-1': '👎',
};

const POLL_MARK = /^(?:\[\/\/\]: # \(|<!-- )peixAIrada poll(: several)?(?:\)| -->)/;
const POLL_NO = /^(no|n[aã]o|nope|nah|not\b|skip|pass)/i;
const POLL_MAX = 8;
const POLL_Q_MAX = 200;
const POLL_A_MAX = 80;

const pollLine = (text, max) =>
  String(text ?? '')
    .replace(UNSAID, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export function pollBody(question, answers, many) {
  const free = Object.keys(POLL_RX).filter(reaction => reaction !== '-1');
  const no = answers.findIndex(answer => POLL_NO.test(answer));

  const lines = answers.map((answer, index) => `${POLL_RX[index === no ? '-1' : (free.shift() ?? '-1')]} ${answer}`);

  return `[//]: # (peixAIrada poll${many ? ': several' : ''})\n📊 **${question}**\n\n${lines.join('\n')}\n\n*A poll: vote with the reaction beside your answer — ${many ? 'as many as you like' : 'one each'}.*`;
}

/** A poll from a message's words: {q, opts: [{r, label}], many} — or null, for a message that is none. */
export function pollOf(body) {
  const head = POLL_MARK.exec(body);

  if (!head) return null;
  let question = null;
  const opts = [];

  for (const raw of body.slice(head[0].length).split('\n')) {
    const line = raw.trim();

    if (question === null) {
      if (line.startsWith('📊')) {
        question = line
          .slice(2)
          .trim()
          .replace(/^\*\*(.*)\*\*$/, '$1')
          .trim();
      }

      continue;
    }

    const reaction = Object.keys(POLL_RX).find(name => line.startsWith(POLL_RX[name].replace('\ufe0f', '')));

    if (reaction && !opts.some(option => option.r === reaction) && opts.length < POLL_MAX) {
      opts.push({
        r: reaction,
        label: line
          .slice(POLL_RX[reaction].replace('\ufe0f', '').length)
          .replace(/^\ufe0f/, '')
          .trim(),
      });
    }
  }

  return question && opts.length >= 2 ? { q: question, opts, many: !!head[1] } : null;
}

const seenKey = () => `${chat.repo}#${chat.room?.n}`;

const chatUnread = () => {
  const seen = chatSeen[seenKey()] ?? Infinity;

  return chat.msgs.filter(message => message.id > seen && message.who !== chat.me?.login).length;
};

/** What every page knows of the chat: the repo, who you are in it, its issue with what you have not read and who said
 *  the last word, the invitations waiting for you, what went wrong. In the snapshot and every `chat` event. */
export function chatSummary() {
  const last = chat.msgs.at(-1);

  return {
    on: !!setup.chat,
    repo: chat.repo || setup.chat?.repo || null,
    me: chat.me,
    role: chat.role,
    ready: chat.ready,
    error: chat.error,
    missing: chat.missing,
    invites: chat.invites,
    room: chat.room?.n ?? null,
    unread: chat.room ? chatUnread() : 0,
    last: last ? { who: last.who, at: last.at } : null,
    pics: chat.ready && chat.pics ? { can: !!chat.pics.id, why: chat.pics.id ? null : chat.pics.why || null } : null,
  };
}

function chatSay() {
  const summary = JSON.stringify(chatSummary());

  if (summary !== chat.said) {
    chat.said = summary;
    broadcast('chat', JSON.parse(summary));
  }
}

/** Messages into the chat: a new one in place by its id, an edit over the one held; and with a window — the newest
 *  comments of the repo, `floor` to `top` — one held in that span the window has not got is gone (deleted). Messages
 *  newer than the window are not its to judge (one sent while it was asked); another issue's are not the chat's. What
 *  changed: {add, gone, fresh}. */
function chatTake(list, span = null) {
  const changed = { add: [], gone: [], fresh: [] };

  if (!chat.room) return changed;

  const held = chat.msgs;
  const got = list.filter(message => message.n === chat.room.n);
  const at = new Map(held.map((message, index) => [message.id, index]));

  for (const message of got) {
    const index = at.get(message.id);

    if (index === undefined) {
      held.push(message);
      changed.add.push(message);
      changed.fresh.push(message);
    } else if (
      held[index].body !== message.body ||
      held[index].edited !== message.edited ||
      held[index].rx !== message.rx
    ) {
      const { votes, votesRx, votesAt, reacts, reactsRx } = held[index];

      held[index] = { ...message, votes, votesRx, votesAt, reacts, reactsRx };
      changed.add.push(held[index]);
    }
  }

  if (span) {
    const keep = new Set(got.map(message => message.id));

    for (let index = held.length - 1; index >= 0; index--) {
      if (held[index].id >= span.floor && held[index].id <= span.top && !keep.has(held[index].id)) {
        changed.gone.push(held[index].id);
        held.splice(index, 1);
      }
    }
  }

  held.sort((left, right) => left.id - right.id);
  if (held.length > CHAT_KEEP) held.splice(0, held.length - CHAT_KEEP);
  return changed;
}

/** What changed, to every page — and, unless `silent` (the first read), an alert for what someone else said since you
 *  last saw it: never the words of a message you sent, never a Reply…. */
function chatTell(changed, silent) {
  if (!chat.room) return;

  if (changed.add.length || changed.gone.length) {
    broadcast('chatmsgs', { n: chat.room.n, add: changed.add, gone: changed.gone });
  }

  const news = silent
    ? []
    : changed.fresh.filter(message => message.who !== chat.me?.login && message.id > (chatSeen[seenKey()] ?? Infinity));

  if (!news.length) return;

  const last = news.at(-1);
  const who = [...new Set(news.map(message => message.who))];

  const evt = {
    kind: 'chat',
    sessionId: null,
    heading: 'Chat',
    title: who.length > 1 ? `${who.at(-1)} and ${who.length - 1} more` : last.who,
    snippet: last.poll ? `📊 ${last.poll.q}` : picSnippet(last.body) || emojiText(plainSnippet(last.body, 140)),
    ts: last.at,
    quiet: !notificationsOn,
  };

  broadcast('alert', evt);
  if (notificationsOn && Date.now() > chat.watchUntil) nativeNotify(evt.heading, evt.title, evt.snippet);
}

// ---- GitHub's emoji, by name (2026-11-25): GET /emojis, a name and its picture's address, a Unicode one's named by its
// code points (…/unicode/1f44d.png) — those alone kept, as characters (its own, :octocat:, are pictures: left as words).
// Kept in the state folder a week, asked again past it; the page asks GET /api/chat/emojis.
const EMOJI_FILE = join(dirname(STATE_FILE), 'emojis.json');
const EMOJI_MS = 7 * 86_400_000;

const emojis = { map: null, at: 0, asking: null };

/** An emoji's character from GitHub's address for it: its code points, with the presentation selector a lone symbol
 *  of the older planes wants (❤ is text without it) and a keycap's; null for one of GitHub's own pictures. */
export function emojiChar(url) {
  const match = /\/unicode\/([0-9a-f]+(?:-[0-9a-f]+)*)\.png/i.exec(String(url || ''));

  if (!match) return null;
  const cps = match[1].split('-').map(hex => parseInt(hex, 16));

  if (cps.length === 1 && cps[0] < 0x1f000) cps.push(0xfe0f);
  if (cps.length === 2 && cps[1] === 0x20e3) cps.splice(1, 0, 0xfe0f);

  try {
    return String.fromCodePoint(...cps);
  } catch {
    return null;
  }
}

/** GitHub's emoji names, `{name: character}`: kept, or asked of GitHub (once, however many ask at a time). */
export async function chatEmojis() {
  if (!emojis.map) {
    try {
      const saved = JSON.parse(readFileSync(EMOJI_FILE, 'utf8'));

      if (saved?.map && typeof saved.map === 'object') {
        Object.assign(emojis, { map: saved.map, at: Number(saved.at) || 0 });
      }
    } catch {}
  }

  if (emojis.map && Date.now() - emojis.at < EMOJI_MS) return emojis.map;

  emojis.asking ??= ghRest('GET', '/emojis')
    .then(response => {
      const map = {};

      for (const [name, url] of Object.entries(response.data || {})) {
        const ch = emojiChar(url);

        if (ch && /^[\w+-]{1,40}$/.test(name)) map[name] = ch;
      }

      Object.assign(emojis, { map, at: Date.now() });

      try {
        const tmp = `${EMOJI_FILE}.${process.pid}`;

        writeFileSync(tmp, JSON.stringify({ at: emojis.at, map }), { mode: 0o600 });
        renameSync(tmp, EMOJI_FILE);
      } catch {}

      return map;
    })
    .catch(error => {
      if (emojis.map) return emojis.map; // the old names, while GitHub is away
      throw error;
    })
    .finally(() => {
      emojis.asking = null;
    });

  return emojis.asking;
}

/** `:name:` in words, as the emoji GitHub would draw — with the names this board knows, none asked for. */
const emojiText = text =>
  !emojis.map ? text : String(text).replace(/:([\w+-]+):/g, (all, name) => emojis.map[name] ?? all);

/** A message that is pictures alone, in words for an alert: *a picture*, *3 pictures* — else null (said as it is). */
export function picSnippet(body) {
  const pics = String(body).match(/!\[[^\]\n]*\]\([^)\s]+\)|<img\b[^>]*>/gi) || [];

  if (
    !pics.length ||
    String(body)
      .replace(/!\[[^\]\n]*\]\([^)\s]+\)|<img\b[^>]*>/gi, '')
      .trim()
  ) {
    return null;
  }

  return pics.length === 1 ? '📷 a picture' : `📷 ${pics.length} pictures`;
}

/** The chat's issue: the oldest open one labelled `room` — the first, made with the repo; any other the board leaves
 *  be. Its last messages are read as it is first seen; another since (that one closed on GitHub) starts over. */
async function chatFind(gen) {
  const url = `/repos/${chat.repo}/issues?labels=${ROOM_LABEL}&state=open&sort=created&direction=asc&per_page=1`;
  const response = await ghRest('GET', url, undefined, chat.tags.get(url));

  chat.foundAt = Date.now();
  if (gen !== chat.gen || response.status === 304) return;
  chat.tags.set(url, response.etag);

  const issue = (response.data || []).find(entry => !entry.pull_request);
  const was = chat.room?.n;

  chat.room = issue ? { n: issue.number, count: issue.comments || 0 } : null;

  if (chat.room?.n !== was) {
    chat.msgs = [];
    if (chat.room) await chatBackfill(gen);
  }
}

/** The chat's last messages, as it is first seen: its last page or two of comments (an issue's list runs oldest first).
 *  A chat this board never showed counts nothing before now as unread. */
async function chatBackfill(gen) {
  const room = chat.room;
  const per = 50;
  const last = Math.max(1, Math.ceil(room.count / per));

  let got = [];

  for (const page of room.count > per && room.count % per < 20 ? [last - 1, last] : [last]) {
    const response = await ghRest('GET', `/repos/${chat.repo}/issues/${room.n}/comments?per_page=${per}&page=${page}`);

    if (gen !== chat.gen || chat.room !== room) return;
    got = got.concat((response.data || []).map(chatMsg).map(message => ({ ...message, n: room.n })));
  }

  await chatVotes(gen, chatTake(got));
  if (gen !== chat.gen) return;

  if (!(seenKey() in chatSeen)) {
    chatSeen[seenKey()] = got.reduce((highest, message) => Math.max(highest, message.id), 0);
    saveState();
  }
}

// the newest comments, one fixed address and its ETag (a 304 free)
const lookUrl = () => `/repos/${chat.repo}/issues/comments?sort=created&direction=desc&per_page=${CHAT_WINDOW}`;

async function chatLook(gen, silent = false) {
  const url = lookUrl();
  const response = await ghRest('GET', url, undefined, chat.tags.get(url));

  if (gen !== chat.gen || response.status === 304) return;
  chat.tags.set(url, response.etag);

  const got = (response.data || []).map(chatMsg);
  const ids = got.map(message => message.id);

  const changed = chatTake(
    got,
    ids.length ? { floor: got.length >= CHAT_WINDOW ? Math.min(...ids) : 0, top: Math.max(...ids) } : null,
  );

  await chatVotes(gen, changed);
  if (gen !== chat.gen) return;
  chatTell(changed, silent);
}

/** The votes of each poll whose counts moved since its votes were asked (`rx`, the comments' list's) — and of one a day
 *  old at most once a minute, a 304 when nothing moved: two people trading answers leave the counts as they were. Who
 *  gave which of its answers; on a poll of one answer each, a person's newest. A poll changed joins what changed. And
 *  who reacted to the newest REACT_SPAN other messages, asked when their counts moved (2026-11-25): none, nothing asked. */
async function chatVotes(gen, changed) {
  const now = Date.now();

  for (const message of chat.msgs.slice(-REACT_SPAN)) {
    if (message.poll || message.reactsRx === message.rx) continue;
    const rx = message.rx;

    if (!rx) {
      if (message.reacts?.length && !changed.add.includes(message)) changed.add.push(message);
      Object.assign(message, { reacts: [], reactsRx: rx });
      continue;
    }

    const url = `/repos/${chat.repo}/issues/comments/${message.id}/reactions?per_page=100`;

    const response = await ghRest('GET', url, undefined, chat.tags.get(url)).catch(error => {
      if (error.status === 404) return null;
      throw error;
    }); // 404: deleted since

    if (gen !== chat.gen) return;
    message.reactsRx = rx;
    if (!response || response.status === 304) continue;
    chat.tags.set(url, response.etag);
    message.reacts = reactsOf(response.data);
    if (!changed.add.includes(message)) changed.add.push(message);
  }

  for (const message of chat.msgs) {
    if (
      !message.poll ||
      (message.votesRx === message.rx &&
        (now - (message.votesAt || 0) < CHAT_FIND_MS || now - Date.parse(message.at) > 86_400_000))
    ) {
      continue;
    }

    const url = `/repos/${chat.repo}/issues/comments/${message.id}/reactions?per_page=100`;
    const rx = message.rx;

    const response = await ghRest('GET', url, undefined, chat.tags.get(url)).catch(error => {
      if (error.status === 404) return null;
      throw error;
    }); // 404: deleted since

    if (gen !== chat.gen) return;
    message.votesRx = rx;
    message.votesAt = Date.now();
    if (!response || response.status === 304) continue;
    chat.tags.set(url, response.etag);
    message.votes = votesOf(message.poll, response.data);
    if (!changed.add.includes(message)) changed.add.push(message);
  }
}

function votesOf(poll, list) {
  const ok = new Set(poll.opts.map(option => option.r));
  const newest = new Map();

  const all = (list || [])
    .filter(reaction => ok.has(reaction.content) && reaction.user?.login)
    .map(reaction => ({
      id: reaction.id,
      r: reaction.content,
      who: reaction.user.login,
      face: reaction.user.avatar_url || null,
      at: reaction.created_at || '',
    }));

  if (poll.many) return all;

  for (const vote of all) {
    const was = newest.get(vote.who);

    if (!was || vote.at > was.at || (vote.at === was.at && vote.id > was.id)) newest.set(vote.who, vote);
  }

  return all.filter(vote => newest.get(vote.who) === vote);
}

/** The chat's issue, made and labelled: with the repo, and on its admin's board when none is open (a repo made by hand,
 *  or its issue closed on GitHub). */
async function chatStart(repo) {
  await chatLabel(repo);
  return ghRest('POST', `/repos/${repo}/issues`, {
    title: 'Chat',
    body: 'The peixAIrada chat: each comment here is a message.',
    labels: [ROOM_LABEL],
  });
}

/** The repo, as GitHub has it: who you are, and what you may do there. */
async function chatBoot(gen) {
  const want = setup.chat.repo;
  const me = (await ghRest('GET', '/user')).data;

  let repo;

  try {
    repo = (await ghRest('GET', `/repos/${want}`)).data;
  } catch (error) {
    if (error.status !== 404) throw error;
    await chatInvites(gen).catch(() => {});
    if (gen === chat.gen) chat.missing = true; // Settings › Chat offers what it does with none (2026-10-18)
    throw Object.assign(chatNotThere(want), { quiet: true });
  }

  if (gen !== chat.gen) return;

  Object.assign(chat, {
    repo: repo.full_name,
    repoId: repo.id ?? null,
    me: { login: me.login, face: me.avatar_url || null },
    role: repo.permissions?.admin ? 'admin' : repo.permissions?.push ? 'write' : 'read',
    org: repo.owner?.type === 'Organization',
  });

  if (!chatQuiet.includes(chat.repo)) {
    await ghRest('PUT', `/repos/${chat.repo}/subscription`, { subscribed: false, ignored: true });
    chatQuiet.push(chat.repo);
    saveState();
  }

  await chatFind(gen);
  if (gen !== chat.gen) return;

  if (!chat.room && chat.role === 'admin') {
    await chatStart(chat.repo);
    await chatFind(gen);
    if (gen !== chat.gen) return;
  }

  await chatLook(gen, true);
  if (gen !== chat.gen) return;
  await chatPicsFind(gen);
  if (gen !== chat.gen) return;
  chat.ready = true;
}

/** Where this board's pictures go (`chat.pics`: the repo, its id, or why none): against the chat's repo for whoever can
 *  write there; on an organization's chat, a member's against its files repo — its invitation taken here, by itself, as
 *  part of the chat already joined. The admin's board makes that repo and keeps its people the chat's (filesKeep).
 *  Never fails the chat: a picture that cannot go says why. */
async function chatPicsFind(gen) {
  chat.picsAt = Date.now();

  try {
    if (chat.role !== 'read') {
      chat.pics = { repo: chat.repo, id: chat.repoId };

      if (chat.role === 'admin' && chat.org) {
        await filesKeep(gen).catch(error =>
          console.error(`[peixairada] chat: the files repo, ${filesOf(chat.repo)}:`, error.message),
        );
      } // the members' pictures' place: their own go on without it

      return;
    }

    const files = filesOf(chat.repo);

    const look = () =>
      ghRest('GET', `/repos/${files}`).then(
        response => response.data,
        error => {
          if (error.status === 404) return null;
          throw error;
        },
      );

    let repo = await look();

    if (!repo?.permissions?.push && chat.org) {
      const inv = ((await ghRest('GET', '/user/repository_invitations?per_page=100')).data || []).find(
        invitation => invitation.repository?.full_name?.toLowerCase() === files.toLowerCase() && !invitation.expired,
      );

      if (inv) {
        await ghRest('PATCH', `/user/repository_invitations/${inv.id}`);
        repo = await look();
      }
    }

    if (gen !== chat.gen) return;

    chat.pics = repo?.permissions?.push
      ? { repo: repo.full_name, id: repo.id }
      : {
          repo: files,
          id: null,
          why: chat.org
            ? `your pictures go to ${files}, which the chat's admin has not shared with you yet — their board does it once it runs`
            : `you can only read ${chat.repo}: GitHub takes pictures from those who can write there`,
        };
  } catch (error) {
    if (gen === chat.gen) chat.pics = { repo: null, id: null, why: error.message };
  }
}

/** This board's pictures' place asked again, when it had none (a picture about to go): at most every CHAT_PICS_AGAIN_MS. */
export async function chatPicsAgain() {
  if (!chat.ready || chat.pics?.id || Date.now() - chat.picsAt < CHAT_PICS_AGAIN_MS) return;
  await chatPicsFind(chat.gen);
  chatSay();
}

/** The admin's: the chat's files repo made if it is not there (private, empty, its mails off), and its people the chat's
 *  — each member and each one invited to the chat a writer there (invited), anyone else let go. */
async function filesKeep(gen) {
  const files = filesOf(chat.repo);
  const [owner, name] = files.split('/');

  const there = await ghRest('GET', `/repos/${files}`).then(
    () => true,
    error => {
      if (error.status === 404) return false;
      throw error;
    },
  );

  if (gen !== chat.gen) return;

  if (!there) {
    await chatWrite(() =>
      ghRest('POST', `/orgs/${owner}/repos`, {
        name,
        private: true,
        description: `${FILES_MARK} ${chat.repo} — GitHub keeps them against this repo, where every member can write`,
        has_issues: false,
        has_wiki: false,
        has_projects: false,
        has_discussions: false,
      }),
    );

    await ghRest('PUT', `/repos/${files}/subscription`, { subscribed: false, ignored: true }).catch(() => {});
    console.log(`[peixairada] chat: made ${files} for the chat's pictures`);
  }

  await filesPeople(gen);
}

/** The files repo's people put back to the chat's: a writer there for each member and invitation here, nobody else — an
 *  invitation there that expired (a week unanswered: a board not updated yet) made again. */
async function filesPeople(gen) {
  const files = filesOf(chat.repo);
  const me = chat.me?.login?.toLowerCase();
  const lc = login => String(login || '').toLowerCase();

  const [cm, ci, fm, fi] = await Promise.all(
    [
      `/repos/${chat.repo}/collaborators?affiliation=direct&per_page=100`,
      `/repos/${chat.repo}/invitations?per_page=100`,
      `/repos/${files}/collaborators?affiliation=direct&per_page=100`,
      `/repos/${files}/invitations?per_page=100`,
    ].map(path => ghRest('GET', path).then(response => response.data || [])),
  );

  if (gen !== chat.gen) return;

  const want = new Set(
    [...cm.map(collaborator => lc(collaborator.login)), ...ci.map(invitation => lc(invitation.invitee?.login))].filter(
      login => login && login !== me,
    ),
  );

  const have = new Set([
    ...fm.map(collaborator => lc(collaborator.login)),
    ...fi.filter(invitation => !invitation.expired).map(invitation => lc(invitation.invitee?.login)),
  ]);

  for (const invitation of fi) {
    if (invitation.expired || !want.has(lc(invitation.invitee?.login))) {
      await chatWrite(() => ghRest('DELETE', `/repos/${files}/invitations/${invitation.id}`));
    }
  }

  for (const login of want) {
    if (!have.has(login)) {
      await chatWrite(() => ghRest('PUT', `/repos/${files}/collaborators/${login}`, { permission: 'push' }));
    }
  }

  for (const collaborator of fm) {
    if (lc(collaborator.login) !== me && !want.has(lc(collaborator.login))) {
      await chatWrite(() => ghRest('DELETE', `/repos/${files}/collaborators/${collaborator.login}`));
    }
  }
}

/** After the admin's change to the people: the files repo's put back to them, never failing the change itself. */
const filesFollow = () =>
  chat.role === 'admin' && chat.org
    ? filesPeople(chat.gen).catch(error => console.error("[peixairada] chat: the files repo's people:", error.message))
    : null;

const chatNotThere = want =>
  chatErr(
    404,
    chat.invites.some(invitation => invitation.repo.toLowerCase() === want.toLowerCase())
      ? `you are invited to ${want} — join it in Settings › Chat`
      : `${want} is not a repo you can read — not made yet, or not shared with you`,
  );

/** The invitations waiting for you to a chat's repo — one whose description says it is one, or the setup's. */
async function chatInvites(gen) {
  chat.invitesAt = chat.askedAt = Date.now();
  const url = '/user/repository_invitations?per_page=100';
  const response = await ghRest('GET', url, undefined, chat.tags.get(url));

  if (gen !== chat.gen || response.status === 304) return;
  chat.tags.set(url, response.etag);
  const want = setup.chat?.repo?.toLowerCase();

  chat.invites = (response.data || [])
    .filter(
      invitation =>
        invitation.repository &&
        (String(invitation.repository.description || '').startsWith(ROOM_MARK) ||
          invitation.repository.full_name?.toLowerCase() === want),
    )
    .map(invitation => ({
      id: invitation.id,
      repo: invitation.repository.full_name,
      by: invitation.inviter?.login || null,
      face: invitation.inviter?.avatar_url || null,
      at: invitation.created_at || null,
      expired: !!invitation.expired,
    }));
}

function chatFailed(error) {
  const was = chat.error;

  if (setup.chat) chat.error = error.message;
  if (!error.quiet && was !== error.message && setup.chat) console.error('[peixairada] chat:', error.message);

  chat.pause = Math.min(
    chat.pause ? chat.pause * 2 : error.status === 403 || error.status === 429 ? 60_000 : 15_000,
    10 * 60_000,
  );

  chat.pauseUntil = Date.now() + chat.pause;
}

async function chatTick() {
  clearTimeout(chat.timer);
  chat.timer = null;
  if (chat.busy) return;
  const gen = chat.gen;

  chat.busy = true;

  try {
    if (!setup.chat) {
      if (Date.now() - chat.invitesAt >= CHAT_INVITES_MS) await chatInvites(gen);
    } else if (!chat.ready) await chatBoot(gen);
    else {
      if (Date.now() - chat.foundAt >= CHAT_FIND_MS) await chatFind(gen);
      await chatLook(gen);
      if (!chat.pics?.id && Date.now() - chat.picsAt >= CHAT_INVITES_MS) await chatPicsFind(gen); // the files repo shared since
    }

    if (gen === chat.gen) {
      chat.pause = 0;
      chat.pauseUntil = 0;
      chat.error = null;
    }
  } catch (error) {
    if (gen === chat.gen) chatFailed(error);
  } finally {
    chat.busy = false;
    chatSay();
    chatNext(gen !== chat.gen ? 0 : null);
  }
}

function chatNext(ms = null) {
  if (!chat.live) return;
  clearTimeout(chat.timer);
  const now = Date.now();

  ms ??=
    now < chat.pauseUntil
      ? chat.pauseUntil - now
      : !setup.chat
        ? CHAT_INVITES_MS
        : now < chat.watchUntil
          ? CHAT_FAST_MS
          : CHAT_SLOW_MS;

  chat.timer = setTimeout(chatTick, ms);
}

/** The repo changed (the setup, a join, a leave): everything learnt of the old one is forgotten and the new one read. */
export function chatReset() {
  chat.gen++;

  Object.assign(chat, {
    repo: setup.chat?.repo || null,
    repoId: null,
    me: null,
    role: null,
    org: false,
    room: null,
    msgs: [],
    ready: false,
    error: null,
    missing: false,
    pics: null,
    picsAt: 0,
    foundAt: 0,
    pause: 0,
    pauseUntil: 0,
  });

  chat.tags.clear();
  chatSay();
  chatNext(0);
}

function setChatRepo(repo) {
  setSetup({ ...setup, chat: repo ? { repo } : null });
  const failed = saveConfig();

  broadcast('config', boardConfig());
  chatReset();
  return failed;
}

/** One write at a time, CHAT_GAP_MS after the last: GitHub's secondary limits are on content made in a burst. */
function chatWrite(fn) {
  const run = chat.writes.then(async () => {
    const wait = chat.lastWrite + CHAT_GAP_MS - Date.now();

    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));

    try {
      return await fn();
    } finally {
      chat.lastWrite = Date.now();
    }
  });

  chat.writes = run.catch(() => {});
  return run;
}

const chatLabel = repo =>
  ghRest('POST', `/repos/${repo}/labels`, {
    name: ROOM_LABEL,
    color: '1f6feb',
    description: 'The issue that is the peixAIrada chat',
  }).catch(error => {
    if (error.status !== 422) throw error;
  }); // 422: it is there

/** The people of your chats' PRs — prPeople's: authors, reviewers, commenters, pushers, no bots —, whom you might
 *  invite: by how many of those PRs each had a hand in, then by when they last did; the ones in `skip` left out. */
function chatSuggest(skip) {
  const by = new Map();

  for (const session of sessions.values()) {
    for (const pr of session.prs) {
      for (const person of prStatus.get(pr.url)?.people || []) {
        if (!person?.login || skip.has(person.login.toLowerCase())) continue;

        const entry = by.get(person.login) || {
          login: person.login,
          face: person.avatar || null,
          prs: new Set(),
          at: '',
        };

        entry.prs.add(pr.url);
        if ((person.at || '') > entry.at) entry.at = person.at;
        entry.face ||= person.avatar || null;
        by.set(person.login, entry);
      }
    }
  }

  return [...by.values()]
    .sort((left, right) => right.prs.size - left.prs.size || right.at.localeCompare(left.at))
    .slice(0, CHAT_SUGGEST)
    .map(entry => ({ login: entry.login, face: entry.face, prs: entry.prs.size, at: entry.at || null }));
}

async function chatPeople() {
  const [mem, inv] = await Promise.all([
    ghRest('GET', `/repos/${chat.repo}/collaborators?affiliation=direct&per_page=100`),
    ghRest('GET', `/repos/${chat.repo}/invitations?per_page=100`),
  ]);

  const members = (mem.data || [])
    .filter(collaborator => collaborator.login !== chat.me?.login)
    .map(collaborator => ({
      login: collaborator.login,
      face: collaborator.avatar_url || null,
      role: collaborator.role_name || null,
    }));

  const invites = (inv.data || [])
    .filter(invitation => invitation.invitee?.login)
    .map(invitation => ({
      id: invitation.id,
      login: invitation.invitee.login,
      face: invitation.invitee.avatar_url || null,
      at: invitation.created_at || null,
      expired: !!invitation.expired,
    }));

  const skip = new Set(
    [chat.me?.login, ...members.map(member => member.login), ...invites.map(invitation => invitation.login)]
      .filter(Boolean)
      .map(login => login.toLowerCase()),
  );

  return { members, invites, suggest: chatSuggest(skip) };
}

/** Where a chat could be, for Settings › Chat with none set (2026-10-18): the organizations you own, newest first (the
 *  one made for the chat, most likely), your account, and the chats you can read already — a repo whose description
 *  says it is one, in an organization you own, your account, or one you were let into. Not the organizations you are
 *  only a member of: an employer's repos are no chat's, and listing them is pages of calls. Kept CHAT_PLACES_MS; a make,
 *  a join or a leave forgets it. */
async function chatPlaces() {
  const cached = chatPlaces.cache;

  if (cached && Date.now() - cached.at < CHAT_PLACES_MS) return cached.data;

  const [me, mine] = await Promise.all([
    ghRest('GET', '/user'),
    ghRest('GET', '/user/memberships/orgs?state=active&per_page=100'),
  ]);

  const owned = (mine.data || [])
    .filter(membership => membership.role === 'admin' && membership.organization?.login)
    .map(membership => membership.organization.login);

  const orgs = (
    await Promise.all(
      owned.map(org =>
        ghRest('GET', `/orgs/${org}`).then(
          response => response.data,
          () => null,
        ),
      ),
    )
  )
    .filter(Boolean) // one SSO keeps from the token: left out
    .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
    .map(org => ({ login: org.login, face: org.avatar_url || null }));

  const lists = await Promise.all(
    [
      ...orgs.map(org => `/orgs/${org.login}/repos?type=all&per_page=100`),
      '/user/repos?affiliation=owner,collaborator&sort=created&direction=desc&per_page=100',
    ].map(path =>
      ghRest('GET', path).then(
        response => response.data || [],
        () => [],
      ),
    ),
  );

  const chats = new Map();

  for (const repo of lists.flat()) {
    if (String(repo.description || '').startsWith(ROOM_MARK) && repo.full_name) {
      chats.set(repo.full_name.toLowerCase(), { repo: repo.full_name, admin: !!repo.permissions?.admin });
    }
  }

  const data = { me: { login: me.data.login, face: me.data.avatar_url || null }, orgs, chats: [...chats.values()] };

  chatPlaces.cache = { at: Date.now(), data };
  return data;
}

/** /api/chat and what is under it — every route keyed as the board's others. The admin's are GitHub's to refuse too. */
export async function chatRoute(req, res, what, url) {
  const method = req.method;
  const body = method === 'GET' ? {} : await jsonBody(req);

  const ready = () => {
    if (!setup.chat) throw chatErr(409, 'no chat repo in the setup');
    if (!chat.ready) throw chatErr(409, chat.error || 'the chat is still being read');
  };

  const admin = () => {
    ready();
    if (chat.role !== 'admin') throw chatErr(403, `only ${chat.repo}'s admin does that`);
  };

  const there = () => {
    if (!chat.room) throw chatErr(409, `no chat in ${chat.repo} yet — its admin's board starts it`);
    return chat.room.n;
  };

  const login = raw => {
    const handle = String(raw ?? '')
      .trim()
      .replace(/^@/, '');

    if (!ORG_NAME.test(handle)) throw chatErr(400, `"${handle}" is not a GitHub login`);
    return handle;
  };

  const sent = async (roomNumber, response) => {
    // a message of yours, sent: held, said to every page, read
    const message = { ...chatMsg(response.data), n: roomNumber };

    if (message.poll) Object.assign(message, { votes: [], votesRx: message.rx, votesAt: Date.now() }); // new: nobody has voted
    const changed = chatTake([message]);

    await chatVotes(chat.gen, changed);
    chatTell(changed, true);

    if (message.id > (chatSeen[seenKey()] ?? 0)) {
      chatSeen[seenKey()] = message.id;
      saveState();
    }

    chatSay();
    return chat.msgs.find(kept => kept.id === message.id) || message;
  };

  try {
    if (method === 'GET' && !what) {
      if (url.searchParams.has('invites') && Date.now() - chat.askedAt > 1000) {
        await chatInvites(chat.gen).catch(error => chatFailed(error));
      } // Settings › Chat open: asked now (a 304 when nothing changed), not in ten minutes — at boot too: invitesAt is the timer's, put off then

      if (url.searchParams.has('pics')) await chatPicsAgain(); // the panel open with no place for your pictures: asked again (CHAT_PICS_AGAIN_MS)
      return json(res, 200, chatSummary());
    }

    if (method === 'GET' && what === 'messages') {
      return json(res, 200, { room: chat.room?.n ?? null, msgs: chat.msgs, seen: chatSeen[seenKey()] ?? 0 });
    }

    if (method === 'POST' && what === 'watch') {
      // a page shows the chat: looked at often while it does
      const was = Date.now() < chat.watchUntil;

      chat.watchUntil = Date.now() + CHAT_WATCH_MS;
      if (!was && chat.ready && !chat.busy) chatNext(0);
      return json(res, 200, { ok: true });
    }

    if (method === 'POST' && what === 'seen') {
      there();
      const id = Number(body.id) || 0;

      if (id > (chatSeen[seenKey()] ?? 0)) {
        chatSeen[seenKey()] = id;
        saveState();
        chatSay();
      }

      return json(res, 200, { ok: true });
    }

    if (method === 'POST' && what === 'send') {
      ready();

      const roomNumber = there();

      const text = String(body.body ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(UNSAID, '')
        .trim();

      if (!text) throw chatErr(400, 'nothing to send');
      if (text.length > CHAT_BODY_MAX) throw chatErr(400, `a message is ${CHAT_BODY_MAX} characters at most`);
      return json(res, 200, {
        msg: await sent(
          roomNumber,
          await chatWrite(() => ghRest('POST', `/repos/${chat.repo}/issues/${roomNumber}/comments`, { body: text })),
        ),
      });
    }

    if (method === 'POST' && what === 'poll') {
      // a question and its answers, as a message (2026-10-20)
      ready();

      const roomNumber = there();
      const question = pollLine(body.q, POLL_Q_MAX);

      const answers = (Array.isArray(body.answers) ? body.answers : [])
        .map(answer => pollLine(answer, POLL_A_MAX))
        .filter(Boolean);

      if (!question) throw chatErr(400, 'a poll asks something');
      if (answers.length < 2) throw chatErr(400, 'a poll has two answers at least');

      if (answers.length > POLL_MAX) {
        throw chatErr(400, `${POLL_MAX} answers at most — one for each reaction GitHub has`);
      }

      if (new Set(answers.map(answer => answer.toLowerCase())).size < answers.length) {
        throw chatErr(400, 'two answers say the same');
      }

      return json(res, 200, {
        msg: await sent(
          roomNumber,
          await chatWrite(() =>
            ghRest('POST', `/repos/${chat.repo}/issues/${roomNumber}/comments`, {
              body: pollBody(question, answers, !!body.many),
            }),
          ),
        ),
      });
    }

    if (method === 'POST' && what === 'vote') {
      // your answer to a poll, given or taken back; on a poll of one answer each, the one before taken back
      ready();

      const id = Number(body.id);
      const message = chat.msgs.find(kept => kept.id === id);
      const wanted = String(body.r ?? '');

      if (!message?.poll) throw chatErr(404, 'no such poll');
      if (!message.poll.opts.some(option => option.r === wanted)) throw chatErr(400, 'not one of its answers');
      const url = `/repos/${chat.repo}/issues/comments/${id}/reactions`;
      let list = (await ghRest('GET', `${url}?per_page=100`)).data || [];

      const had = list.filter(
        reaction =>
          reaction.user?.login === chat.me.login && message.poll.opts.some(option => option.r === reaction.content),
      );

      const again = had.find(reaction => reaction.content === wanted);

      const drop = async reaction => {
        await chatWrite(() => ghRest('DELETE', `${url}/${reaction.id}`));
        list = list.filter(entry => entry.id !== reaction.id);
      };

      if (again) await drop(again);
      else {
        const made = (await chatWrite(() => ghRest('POST', url, { content: wanted }))).data;

        if (made?.id && !list.some(entry => entry.id === made.id)) list.push(made);
        if (!message.poll.many) for (const reaction of had) await drop(reaction);
      }

      // the votes as written, not asked again (GitHub's list may lag its writes), and the counts they make: a look that
      // finds others' votes making the same counts as yours did would see nothing moved
      const held = chat.msgs.find(kept => kept.id === id) || message;

      held.votes = votesOf(held.poll, list);
      // the list's ETag let go (2026-11-25): a look while this was written kept a list whose counts someone else's vote
      // can bring back exactly, which GitHub then answers with a 304 — and that vote went unseen for a minute
      chat.tags.delete(lookUrl());

      held.rx = held.votesRx = held.poll.opts
        .map(option => list.filter(reaction => reaction.content === option.r).length)
        .join(' ');

      broadcast('chatmsgs', { n: held.n, add: [held], gone: [] });
      return json(res, 200, { msg: held });
    }

    if (method === 'POST' && what === 'edit') {
      // your own message's words, edited (2026-11-25): never someone else's — the admin deletes — nor a poll
      ready();

      const id = Number(body.id);
      const message = chat.msgs.find(kept => kept.id === id);

      const text = String(body.body ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(UNSAID, '')
        .trim();

      if (!message) throw chatErr(404, 'no such message');
      if (message.who !== chat.me?.login) throw chatErr(403, 'only your own messages are yours to edit');
      if (message.poll || pollOf(text)) throw chatErr(400, 'a poll is not edited — ask another');
      if (!text) throw chatErr(400, 'nothing left — delete it instead');
      if (text.length > CHAT_BODY_MAX) throw chatErr(400, `a message is ${CHAT_BODY_MAX} characters at most`);
      if (text === message.body) return json(res, 200, { msg: message });

      const response = await chatWrite(() =>
        ghRest('PATCH', `/repos/${chat.repo}/issues/comments/${id}`, { body: text }),
      );

      const changed = chatTake([{ ...chatMsg(response.data), n: message.n }]);

      chatTell(changed, true);
      return json(res, 200, { msg: chat.msgs.find(kept => kept.id === id) || message });
    }

    if (method === 'POST' && what === 'react') {
      // your reaction on a message, given or taken back (2026-11-25); a poll's are its votes
      ready();

      const id = Number(body.id);
      const message = chat.msgs.find(kept => kept.id === id);
      const wanted = String(body.r ?? '');

      if (!message) throw chatErr(404, 'no such message');
      if (message.poll) throw chatErr(400, "a poll's reactions are its votes");
      if (!REACTIONS.includes(wanted)) throw chatErr(400, `not one of GitHub's reactions: ${REACTIONS.join(' ')}`);
      const url = `/repos/${chat.repo}/issues/comments/${id}/reactions`;
      let list = (await ghRest('GET', `${url}?per_page=100`)).data || [];
      const mine = list.find(reaction => reaction.user?.login === chat.me.login && reaction.content === wanted);

      if (mine) {
        await chatWrite(() => ghRest('DELETE', `${url}/${mine.id}`));
        list = list.filter(reaction => reaction.id !== mine.id);
      } else {
        const made = (await chatWrite(() => ghRest('POST', url, { content: wanted }))).data;

        if (made?.id && !list.some(reaction => reaction.id === made.id)) list.push(made);
      }

      // as written, not asked again (GitHub's list may lag its writes)
      const held = chat.msgs.find(kept => kept.id === id) || message;

      Object.assign(held, reactCounts(list), { reacts: reactsOf(list) });
      chat.tags.delete(lookUrl()); // as a vote's: the next look sees another's that brings the counts back
      held.reactsRx = held.rx;
      broadcast('chatmsgs', { n: held.n, add: [held], gone: [] });
      return json(res, 200, { msg: held });
    }

    if (method === 'GET' && what === 'emojis') return json(res, 200, { emojis: await chatEmojis() });

    if (method === 'POST' && what === 'delete') {
      // yours, or anyone's for the admin
      ready();

      const id = Number(body.id);
      const message = chat.msgs.find(kept => kept.id === id);

      if (!message) throw chatErr(404, 'no such message');
      if (message.who !== chat.me?.login && chat.role !== 'admin') throw chatErr(403, 'not your message');
      await chatWrite(() => ghRest('DELETE', `/repos/${chat.repo}/issues/comments/${id}`));
      chat.msgs = chat.msgs.filter(kept => kept.id !== id);
      broadcast('chatmsgs', { n: message.n, add: [], gone: [id] });
      chatSay();
      return json(res, 200, { ok: true });
    }

    if (method === 'GET' && what === 'people') {
      admin();
      return json(res, 200, await chatPeople());
    }

    if (method === 'GET' && what === 'places') return json(res, 200, await chatPlaces());

    if (method === 'POST' && what === 'invite') {
      // Read on an organization's repo; a personal account's collaborators are all writers
      admin();

      const user = (
        await ghRest('GET', `/users/${login(body.login)}`).catch(error => {
          throw error.status === 404 ? chatErr(404, `no GitHub user ${body.login}`) : error;
        })
      ).data;

      if (user.type !== 'User') throw chatErr(400, `${user.login} is not a person's account`);

      const response = await chatWrite(() =>
        ghRest('PUT', `/repos/${chat.repo}/collaborators/${user.login}`, chat.org ? { permission: 'pull' } : {}),
      );

      await filesFollow(); // a writer on the files repo too, for their pictures
      return json(res, 200, { login: user.login, invited: response.status === 201, ...(await chatPeople()) });
    }

    if (method === 'POST' && what === 'remove') {
      admin();
      const handle = login(body.login);

      await chatWrite(() => ghRest('DELETE', `/repos/${chat.repo}/collaborators/${handle}`));
      await filesFollow();
      return json(res, 200, await chatPeople());
    }

    if (method === 'POST' && what === 'cancel') {
      admin();
      await chatWrite(() => ghRest('DELETE', `/repos/${chat.repo}/invitations/${Number(body.id)}`));
      await filesFollow();
      return json(res, 200, await chatPeople());
    }

    if (method === 'POST' && what === 'join') {
      const inv = chat.invites.find(invitation => invitation.id === Number(body.id));

      if (!inv) throw chatErr(404, 'no such invitation — it may have expired');
      await ghRest('PATCH', `/user/repository_invitations/${inv.id}`);
      chatPlaces.cache = null;
      const failed = setChatRepo(inv.repo);

      return failed
        ? json(res, 500, { error: `joined, but not saved to ${tildePath(CONFIG_FILE)}: ${failed}` })
        : json(res, 200, chatSummary());
    }

    if (method === 'POST' && what === 'leave') {
      // a member leaves the repo; its admin only stops using it here
      if (setup.chat && chat.ready && chat.role !== 'admin') {
        await ghRest('DELETE', `/repos/${chat.repo}/collaborators/${chat.me.login}`).catch(error => {
          if (error.status !== 404) throw error;
        });

        if (chat.org) {
          await ghRest('DELETE', `/repos/${filesOf(chat.repo)}/collaborators/${chat.me.login}`).catch(() => {});
        } // its files repo too: nothing left of the chat
      }

      chatPlaces.cache = null;
      const failed = setChatRepo(null);

      return failed
        ? json(res, 500, { error: `not saved to ${tildePath(CONFIG_FILE)}: ${failed}` })
        : json(res, 200, chatSummary());
    }

    if (method === 'POST' && what === 'use') {
      // a chat by its repo — one GitHub lets you read, never a name it does not know (2026-10-18)
      const { setup: cleaned, error } = cleanSetup({ chat: { repo: body.repo } }, true);

      if (error || !cleaned?.chat) throw chatErr(400, error || 'which repo?');

      const response = await ghRest('GET', `/repos/${cleaned.chat.repo}`).catch(async failure => {
        if (failure.status !== 404) throw failure;
        await chatInvites(chat.gen).catch(() => {});
        throw chatNotThere(cleaned.chat.repo);
      });

      const failed = setChatRepo(response.data.full_name);

      return failed
        ? json(res, 500, { error: `not saved to ${tildePath(CONFIG_FILE)}: ${failed}` })
        : json(res, 200, chatSummary());
    }

    if (method === 'POST' && what === 'make') {
      // a new private repo for the chat, its first room, and the setup naming it
      const full = String(body.repo ?? '').trim();

      if (!REPO_RE.test(full)) throw chatErr(400, `"${full}" is not owner/name`);

      const [owner, name] = full.split('/');
      const me = (await ghRest('GET', '/user')).data;

      const response = await ghRest(
        'POST',
        owner.toLowerCase() === me.login.toLowerCase() ? '/user/repos' : `/orgs/${owner}/repos`,
        {
          name,
          private: true,
          description: `${ROOM_MARK} — the issue labelled room is the chat`,
          has_issues: true,
          has_wiki: false,
          has_projects: false,
          has_discussions: false,
        },
      );

      const repo = response.data.full_name;

      chatPlaces.cache = null;
      await ghRest('PUT', `/repos/${repo}/subscription`, { subscribed: false, ignored: true });
      if (!chatQuiet.includes(repo)) chatQuiet.push(repo);
      await chatStart(repo);
      const failed = setChatRepo(repo);

      return failed
        ? json(res, 500, { error: `made ${repo}, but not saved to ${tildePath(CONFIG_FILE)}: ${failed}` })
        : json(res, 200, chatSummary());
    }

    return json(res, 404, { error: 'not found' });
  } catch (error) {
    return json(
      res,
      [400, 403, 404, 409, 422].includes(error.status)
        ? error.status === 422
          ? 400
          : error.status
        : error.status === 401
          ? 401
          : 502,
      { error: error.message },
    );
  }
}
