// The chat (2026-10-17): the people the board is shared with, in a GitHub repo's issue — messages, polls, people.
import { CONFIG_FILE, execFileP } from './env.mjs';
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
// What comes in is someone else's words: the page draws it in a module of its own, and nothing here or there hands it
// to a drawer, a claude or a notification's Reply… (test/chat.test.mjs holds the page to that).
const GITHUB_API = (process.env.GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
const CHAT_FAST_MS = Number(process.env.CHAT_FAST_MS || 3000), CHAT_SLOW_MS = Number(process.env.CHAT_SLOW_MS || 20_000);
const CHAT_GAP_MS = Number(process.env.CHAT_GAP_MS || 1000), CHAT_INVITES_MS = Number(process.env.CHAT_INVITES_MS || 10 * 60_000);
const CHAT_FIND_MS = 60_000, CHAT_PLACES_MS = 60_000, CHAT_WATCH_MS = 30_000, CHAT_WINDOW = 100, CHAT_KEEP = 300, CHAT_BODY_MAX = 10_000, CHAT_SUGGEST = 12;
const ROOM_LABEL = 'room', ROOM_MARK = 'peixAIrada chat';   // the label the chat's issue wears; the words a chat repo's description starts with
// the files repo's description: never ROOM_MARK's words first, or it would be listed as a chat and offered as one
const FILES_MARK = 'Pictures for the peixAIrada chat in', CHAT_PICS_AGAIN_MS = Number(process.env.CHAT_PICS_AGAIN_MS || 15_000);
/** The repo a chat's members put their pictures against: beside it, by its name. */
export const filesOf = repo => `${repo}-files`;
export const chat = { gen: 0, live: false, repo: null, repoId: null, me: null, role: null, org: false, room: null, msgs: [], tags: new Map(), ready: false, error: null, missing: false,
  pics: null, picsAt: 0, invites: [], invitesAt: 0, askedAt: 0, foundAt: 0, watchUntil: 0, pause: 0, pauseUntil: 0, busy: false, timer: null, writes: Promise.resolve(), lastWrite: 0, said: '' };
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
    const r = await fetch(GITHUB_API + path, { method, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'peixAIrada', ...etag && { 'if-none-match': etag }, ...body !== undefined && { 'content-type': 'application/json' } } });
    if (r.status === 401 && !again) continue;
    const data = r.status === 204 || r.status === 304 ? null : text && r.ok ? await r.text() : await r.json().catch(() => null);
    if (r.status >= 400) throw chatErr(r.status, `GitHub: ${data?.errors?.[0]?.message || data?.message || `HTTP ${r.status}`}`);
    return { status: r.status, data, etag: r.headers.get('etag') };
  }
}
export async function ghToken(fresh = false) {
  const c = ghToken.cache;
  if (!fresh && c && (c.token || Date.now() - c.at < 60_000)) return c.token;
  const bin = ghBin(); let token = null;
  if (bin) try { token = (await execFileP(bin, ['auth', 'token'], { timeout: 15_000 })).stdout.trim() || null; } catch {}
  ghToken.cache = { token, at: Date.now() };
  return token;
}
/** A comment as the page gets it: whose (login, face), the room's number, the words (capped, the unsaid characters out);
 *  a poll's question and answers (`poll`), and its counts as the list has them (`rx`). */
function chatMsg(c) {
  const body = String(c.body || '').replace(UNSAID, '').slice(0, CHAT_BODY_MAX), poll = pollOf(body);
  return { id: c.id, n: Number(String(c.issue_url || '').split('/').pop()) || 0, who: c.user?.login || 'ghost', face: c.user?.avatar_url || null,
    body, at: c.created_at, edited: c.updated_at && c.updated_at !== c.created_at ? c.updated_at : null, url: c.html_url || null,
    ...poll && { poll, rx: poll.opts.map(o => c.reactions?.[o.r] ?? 0).join(' ') } };
}
// A poll's body, as GitHub shows it too: a mark it hides, the question, a line per answer — the reaction that votes for
// it, then its words —, and how to vote there. The reactions in the order answers take them; an answer that says no
// wears 👎. Markdown alone, no raw HTML (2026-10-20): a board from before polls draws it as words and escapes HTML, so
// the mark is a link's definition, which it hides too — the first poll's HTML comment is read still.
const POLL_RX = { '+1': '👍', hooray: '🎉', rocket: '🚀', heart: '❤️', eyes: '👀', laugh: '😄', confused: '😕', '-1': '👎' };
const POLL_MARK = /^(?:\[\/\/\]: # \(|<!-- )peixAIrada poll(: several)?(?:\)| -->)/, POLL_NO = /^(no|n[aã]o|nope|nah|not\b|skip|pass)/i, POLL_MAX = 8, POLL_Q_MAX = 200, POLL_A_MAX = 80;
const pollLine = (v, max) => String(v ?? '').replace(UNSAID, '').replace(/\s+/g, ' ').trim().slice(0, max);
export function pollBody(q, answers, many) {
  const free = Object.keys(POLL_RX).filter(r => r !== '-1'), no = answers.findIndex(a => POLL_NO.test(a));
  const lines = answers.map((a, i) => `${POLL_RX[i === no ? '-1' : free.shift() ?? '-1']} ${a}`);
  return `[//]: # (peixAIrada poll${many ? ': several' : ''})\n📊 **${q}**\n\n${lines.join('\n')}\n\n*A poll: vote with the reaction beside your answer — ${many ? 'as many as you like' : 'one each'}.*`;
}
/** A poll from a message's words: {q, opts: [{r, label}], many} — or null, for a message that is none. */
export function pollOf(body) {
  const head = POLL_MARK.exec(body); if (!head) return null;
  let q = null; const opts = [];
  for (const raw of body.slice(head[0].length).split('\n')) {
    const l = raw.trim();
    if (q === null) { if (l.startsWith('📊')) q = l.slice(2).trim().replace(/^\*\*(.*)\*\*$/, '$1').trim(); continue; }
    const r = Object.keys(POLL_RX).find(k => l.startsWith(POLL_RX[k].replace('\ufe0f', '')));
    if (r && !opts.some(o => o.r === r) && opts.length < POLL_MAX) opts.push({ r, label: l.slice(POLL_RX[r].replace('\ufe0f', '').length).replace(/^\ufe0f/, '').trim() });
  }
  return q && opts.length >= 2 ? { q, opts, many: !!head[1] } : null;
}
const seenKey = () => `${chat.repo}#${chat.room?.n}`;
const chatUnread = () => { const seen = chatSeen[seenKey()] ?? Infinity; return chat.msgs.filter(m => m.id > seen && m.who !== chat.me?.login).length; };
/** What every page knows of the chat: the repo, who you are in it, its issue with what you have not read and who said
 *  the last word, the invitations waiting for you, what went wrong. In the snapshot and every `chat` event. */
export function chatSummary() {
  const last = chat.msgs.at(-1);
  return { on: !!setup.chat, repo: chat.repo || setup.chat?.repo || null, me: chat.me, role: chat.role, ready: chat.ready, error: chat.error, missing: chat.missing, invites: chat.invites,
    room: chat.room?.n ?? null, unread: chat.room ? chatUnread() : 0, last: last ? { who: last.who, at: last.at } : null,
    pics: chat.ready && chat.pics ? { can: !!chat.pics.id, why: chat.pics.id ? null : chat.pics.why || null } : null };
}
function chatSay() { const s = JSON.stringify(chatSummary()); if (s !== chat.said) { chat.said = s; broadcast('chat', JSON.parse(s)); } }
/** Messages into the chat: a new one in place by its id, an edit over the one held; and with a window — the newest
 *  comments of the repo, `floor` to `top` — one held in that span the window has not got is gone (deleted). Messages
 *  newer than the window are not its to judge (one sent while it was asked); another issue's are not the chat's. What
 *  changed: {add, gone, fresh}. */
function chatTake(list, span = null) {
  const c = { add: [], gone: [], fresh: [] }; if (!chat.room) return c;
  const held = chat.msgs, got = list.filter(m => m.n === chat.room.n), at = new Map(held.map((m, i) => [m.id, i]));
  for (const m of got) {
    const i = at.get(m.id);
    if (i === undefined) { held.push(m); c.add.push(m); c.fresh.push(m); }
    else if (held[i].body !== m.body || held[i].edited !== m.edited || held[i].rx !== m.rx) { const { votes, votesRx, votesAt } = held[i]; held[i] = { ...m, votes, votesRx, votesAt }; c.add.push(held[i]); }
  }
  if (span) {
    const keep = new Set(got.map(m => m.id));
    for (let i = held.length - 1; i >= 0; i--) if (held[i].id >= span.floor && held[i].id <= span.top && !keep.has(held[i].id)) { c.gone.push(held[i].id); held.splice(i, 1); }
  }
  held.sort((a, b) => a.id - b.id);
  if (held.length > CHAT_KEEP) held.splice(0, held.length - CHAT_KEEP);
  return c;
}
/** What changed, to every page — and, unless `silent` (the first read), an alert for what someone else said since you
 *  last saw it: never the words of a message you sent, never a Reply…. */
function chatTell(c, silent) {
  if (!chat.room) return;
  if (c.add.length || c.gone.length) broadcast('chatmsgs', { n: chat.room.n, add: c.add, gone: c.gone });
  const news = silent ? [] : c.fresh.filter(m => m.who !== chat.me?.login && m.id > (chatSeen[seenKey()] ?? Infinity));
  if (!news.length) return;
  const last = news.at(-1), who = [...new Set(news.map(m => m.who))];
  const evt = { kind: 'chat', sessionId: null, heading: 'Chat', title: who.length > 1 ? `${who.at(-1)} and ${who.length - 1} more` : last.who, snippet: last.poll ? `📊 ${last.poll.q}` : picSnippet(last.body) || plainSnippet(last.body, 140), ts: last.at, quiet: !notificationsOn };
  broadcast('alert', evt);
  if (notificationsOn && Date.now() > chat.watchUntil) nativeNotify(evt.heading, evt.title, evt.snippet);
}
/** A message that is pictures alone, in words for an alert: *a picture*, *3 pictures* — else null (said as it is). */
export function picSnippet(body) {
  const pics = String(body).match(/!\[[^\]\n]*\]\([^)\s]+\)|<img\b[^>]*>/gi) || [];
  if (!pics.length || String(body).replace(/!\[[^\]\n]*\]\([^)\s]+\)|<img\b[^>]*>/gi, '').trim()) return null;
  return pics.length === 1 ? '📷 a picture' : `📷 ${pics.length} pictures`;
}
/** The chat's issue: the oldest open one labelled `room` — the first, made with the repo; any other the board leaves
 *  be. Its last messages are read as it is first seen; another since (that one closed on GitHub) starts over. */
async function chatFind(gen) {
  const url = `/repos/${chat.repo}/issues?labels=${ROOM_LABEL}&state=open&sort=created&direction=asc&per_page=1`;
  const r = await ghRest('GET', url, undefined, chat.tags.get(url));
  chat.foundAt = Date.now();
  if (gen !== chat.gen || r.status === 304) return;
  chat.tags.set(url, r.etag);
  const i = (r.data || []).find(x => !x.pull_request), was = chat.room?.n;
  chat.room = i ? { n: i.number, count: i.comments || 0 } : null;
  if (chat.room?.n !== was) { chat.msgs = []; if (chat.room) await chatBackfill(gen); }
}
/** The chat's last messages, as it is first seen: its last page or two of comments (an issue's list runs oldest first).
 *  A chat this board never showed counts nothing before now as unread. */
async function chatBackfill(gen) {
  const room = chat.room, per = 50, last = Math.max(1, Math.ceil(room.count / per));
  let got = [];
  for (const page of room.count > per && room.count % per < 20 ? [last - 1, last] : [last]) {
    const r = await ghRest('GET', `/repos/${chat.repo}/issues/${room.n}/comments?per_page=${per}&page=${page}`);
    if (gen !== chat.gen || chat.room !== room) return;
    got = got.concat((r.data || []).map(chatMsg).map(m => ({ ...m, n: room.n })));
  }
  await chatVotes(gen, chatTake(got)); if (gen !== chat.gen) return;
  if (!(seenKey() in chatSeen)) { chatSeen[seenKey()] = got.reduce((a, m) => Math.max(a, m.id), 0); saveState(); }
}
async function chatLook(gen, silent = false) {
  const url = `/repos/${chat.repo}/issues/comments?sort=created&direction=desc&per_page=${CHAT_WINDOW}`;
  const r = await ghRest('GET', url, undefined, chat.tags.get(url));
  if (gen !== chat.gen || r.status === 304) return;
  chat.tags.set(url, r.etag);
  const got = (r.data || []).map(chatMsg), ids = got.map(m => m.id);
  const c = chatTake(got, ids.length ? { floor: got.length >= CHAT_WINDOW ? Math.min(...ids) : 0, top: Math.max(...ids) } : null);
  await chatVotes(gen, c); if (gen !== chat.gen) return;
  chatTell(c, silent);
}
/** The votes of each poll whose counts moved since its votes were asked (`rx`, the comments' list's) — and of one a day
 *  old at most once a minute, a 304 when nothing moved: two people trading answers leave the counts as they were. Who
 *  gave which of its answers; on a poll of one answer each, a person's newest. A poll changed joins what changed. */
async function chatVotes(gen, c) {
  const now = Date.now();
  for (const m of chat.msgs) {
    if (!m.poll || (m.votesRx === m.rx && (now - (m.votesAt || 0) < CHAT_FIND_MS || now - Date.parse(m.at) > 86_400_000))) continue;
    const url = `/repos/${chat.repo}/issues/comments/${m.id}/reactions?per_page=100`, rx = m.rx;
    const r = await ghRest('GET', url, undefined, chat.tags.get(url)).catch(e => { if (e.status === 404) return null; throw e; });   // 404: deleted since
    if (gen !== chat.gen) return;
    m.votesRx = rx; m.votesAt = Date.now();
    if (!r || r.status === 304) continue;
    chat.tags.set(url, r.etag); m.votes = votesOf(m.poll, r.data);
    if (!c.add.includes(m)) c.add.push(m);
  }
}
function votesOf(poll, list) {
  const ok = new Set(poll.opts.map(o => o.r)), newest = new Map();
  const all = (list || []).filter(x => ok.has(x.content) && x.user?.login).map(x => ({ id: x.id, r: x.content, who: x.user.login, face: x.user.avatar_url || null, at: x.created_at || '' }));
  if (poll.many) return all;
  for (const v of all) { const was = newest.get(v.who); if (!was || v.at > was.at || (v.at === was.at && v.id > was.id)) newest.set(v.who, v); }
  return all.filter(v => newest.get(v.who) === v);
}
/** The chat's issue, made and labelled: with the repo, and on its admin's board when none is open (a repo made by hand,
 *  or its issue closed on GitHub). */
async function chatStart(repo) {
  await chatLabel(repo);
  return ghRest('POST', `/repos/${repo}/issues`, { title: 'Chat', body: 'The peixAIrada chat: each comment here is a message.', labels: [ROOM_LABEL] });
}
/** The repo, as GitHub has it: who you are, and what you may do there. */
async function chatBoot(gen) {
  const want = setup.chat.repo, me = (await ghRest('GET', '/user')).data;
  let r;
  try { r = (await ghRest('GET', `/repos/${want}`)).data; }
  catch (e) {
    if (e.status !== 404) throw e;
    await chatInvites(gen).catch(() => {});
    if (gen === chat.gen) chat.missing = true;   // Settings › Chat offers what it does with none (2026-10-18)
    throw Object.assign(chatNotThere(want), { quiet: true });
  }
  if (gen !== chat.gen) return;
  Object.assign(chat, { repo: r.full_name, repoId: r.id ?? null, me: { login: me.login, face: me.avatar_url || null }, role: r.permissions?.admin ? 'admin' : r.permissions?.push ? 'write' : 'read', org: r.owner?.type === 'Organization' });
  if (!chatQuiet.includes(chat.repo)) { await ghRest('PUT', `/repos/${chat.repo}/subscription`, { subscribed: false, ignored: true }); chatQuiet.push(chat.repo); saveState(); }
  await chatFind(gen); if (gen !== chat.gen) return;
  if (!chat.room && chat.role === 'admin') { await chatStart(chat.repo); await chatFind(gen); if (gen !== chat.gen) return; }
  await chatLook(gen, true); if (gen !== chat.gen) return;
  await chatPicsFind(gen); if (gen !== chat.gen) return;
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
      if (chat.role === 'admin' && chat.org) await filesKeep(gen).catch(e => console.error(`[peixairada] chat: the files repo, ${filesOf(chat.repo)}:`, e.message));   // the members' pictures' place: their own go on without it
      return;
    }
    const files = filesOf(chat.repo), look = () => ghRest('GET', `/repos/${files}`).then(r => r.data, e => { if (e.status === 404) return null; throw e; });
    let r = await look();
    if (!r?.permissions?.push && chat.org) {
      const inv = ((await ghRest('GET', '/user/repository_invitations?per_page=100')).data || []).find(i => i.repository?.full_name?.toLowerCase() === files.toLowerCase() && !i.expired);
      if (inv) { await ghRest('PATCH', `/user/repository_invitations/${inv.id}`); r = await look(); }
    }
    if (gen !== chat.gen) return;
    chat.pics = r?.permissions?.push ? { repo: r.full_name, id: r.id } : { repo: files, id: null, why: chat.org ? `your pictures go to ${files}, which the chat's admin has not shared with you yet — their board does it once it runs` : `you can only read ${chat.repo}: GitHub takes pictures from those who can write there` };
  } catch (e) { if (gen === chat.gen) chat.pics = { repo: null, id: null, why: e.message }; }
}
/** This board's pictures' place asked again, when it had none (a picture about to go): at most every CHAT_PICS_AGAIN_MS. */
export async function chatPicsAgain() {
  if (!chat.ready || chat.pics?.id || Date.now() - chat.picsAt < CHAT_PICS_AGAIN_MS) return;
  await chatPicsFind(chat.gen); chatSay();
}
/** The admin's: the chat's files repo made if it is not there (private, empty, its mails off), and its people the chat's
 *  — each member and each one invited to the chat a writer there (invited), anyone else let go. */
async function filesKeep(gen) {
  const files = filesOf(chat.repo), [owner, name] = files.split('/');
  const there = await ghRest('GET', `/repos/${files}`).then(() => true, e => { if (e.status === 404) return false; throw e; });
  if (gen !== chat.gen) return;
  if (!there) {
    await chatWrite(() => ghRest('POST', `/orgs/${owner}/repos`, { name, private: true, description: `${FILES_MARK} ${chat.repo} — GitHub keeps them against this repo, where every member can write`, has_issues: false, has_wiki: false, has_projects: false, has_discussions: false }));
    await ghRest('PUT', `/repos/${files}/subscription`, { subscribed: false, ignored: true }).catch(() => {});
    console.log(`[peixairada] chat: made ${files} for the chat's pictures`);
  }
  await filesPeople(gen);
}
/** The files repo's people put back to the chat's: a writer there for each member and invitation here, nobody else — an
 *  invitation there that expired (a week unanswered: a board not updated yet) made again. */
async function filesPeople(gen) {
  const files = filesOf(chat.repo), me = chat.me?.login?.toLowerCase(), lc = l => String(l || '').toLowerCase();
  const [cm, ci, fm, fi] = await Promise.all([`/repos/${chat.repo}/collaborators?affiliation=direct&per_page=100`, `/repos/${chat.repo}/invitations?per_page=100`,
    `/repos/${files}/collaborators?affiliation=direct&per_page=100`, `/repos/${files}/invitations?per_page=100`].map(u => ghRest('GET', u).then(r => r.data || [])));
  if (gen !== chat.gen) return;
  const want = new Set([...cm.map(c => lc(c.login)), ...ci.map(i => lc(i.invitee?.login))].filter(l => l && l !== me));
  const have = new Set([...fm.map(c => lc(c.login)), ...fi.filter(i => !i.expired).map(i => lc(i.invitee?.login))]);
  for (const i of fi) if (i.expired || !want.has(lc(i.invitee?.login))) await chatWrite(() => ghRest('DELETE', `/repos/${files}/invitations/${i.id}`));
  for (const l of want) if (!have.has(l)) await chatWrite(() => ghRest('PUT', `/repos/${files}/collaborators/${l}`, { permission: 'push' }));
  for (const c of fm) if (lc(c.login) !== me && !want.has(lc(c.login))) await chatWrite(() => ghRest('DELETE', `/repos/${files}/collaborators/${c.login}`));
}
/** After the admin's change to the people: the files repo's put back to them, never failing the change itself. */
const filesFollow = () => chat.role === 'admin' && chat.org ? filesPeople(chat.gen).catch(e => console.error('[peixairada] chat: the files repo\'s people:', e.message)) : null;
const chatNotThere = want => chatErr(404, chat.invites.some(i => i.repo.toLowerCase() === want.toLowerCase()) ? `you are invited to ${want} — join it in Settings › Chat` : `${want} is not a repo you can read — not made yet, or not shared with you`);
/** The invitations waiting for you to a chat's repo — one whose description says it is one, or the setup's. */
async function chatInvites(gen) {
  chat.invitesAt = chat.askedAt = Date.now();
  const url = '/user/repository_invitations?per_page=100';
  const r = await ghRest('GET', url, undefined, chat.tags.get(url));
  if (gen !== chat.gen || r.status === 304) return;
  chat.tags.set(url, r.etag);
  const want = setup.chat?.repo?.toLowerCase();
  chat.invites = (r.data || []).filter(i => i.repository && (String(i.repository.description || '').startsWith(ROOM_MARK) || i.repository.full_name?.toLowerCase() === want))
    .map(i => ({ id: i.id, repo: i.repository.full_name, by: i.inviter?.login || null, face: i.inviter?.avatar_url || null, at: i.created_at || null, expired: !!i.expired }));
}
function chatFailed(e) {
  const was = chat.error;
  if (setup.chat) chat.error = e.message;
  if (!e.quiet && was !== e.message && setup.chat) console.error('[peixairada] chat:', e.message);
  chat.pause = Math.min(chat.pause ? chat.pause * 2 : e.status === 403 || e.status === 429 ? 60_000 : 15_000, 10 * 60_000);
  chat.pauseUntil = Date.now() + chat.pause;
}
async function chatTick() {
  clearTimeout(chat.timer); chat.timer = null;
  if (chat.busy) return;
  const gen = chat.gen; chat.busy = true;
  try {
    if (!setup.chat) { if (Date.now() - chat.invitesAt >= CHAT_INVITES_MS) await chatInvites(gen); }
    else if (!chat.ready) await chatBoot(gen);
    else {
      if (Date.now() - chat.foundAt >= CHAT_FIND_MS) await chatFind(gen);
      await chatLook(gen);
      if (!chat.pics?.id && Date.now() - chat.picsAt >= CHAT_INVITES_MS) await chatPicsFind(gen);   // the files repo shared since
    }
    if (gen === chat.gen) { chat.pause = 0; chat.pauseUntil = 0; chat.error = null; }
  } catch (e) { if (gen === chat.gen) chatFailed(e); }
  finally { chat.busy = false; chatSay(); chatNext(gen !== chat.gen ? 0 : null); }
}
function chatNext(ms = null) {
  if (!chat.live) return;
  clearTimeout(chat.timer);
  const now = Date.now();
  ms ??= now < chat.pauseUntil ? chat.pauseUntil - now : !setup.chat ? CHAT_INVITES_MS : now < chat.watchUntil ? CHAT_FAST_MS : CHAT_SLOW_MS;
  chat.timer = setTimeout(chatTick, ms);
}
/** The repo changed (the setup, a join, a leave): everything learnt of the old one is forgotten and the new one read. */
export function chatReset() {
  chat.gen++;
  Object.assign(chat, { repo: setup.chat?.repo || null, repoId: null, me: null, role: null, org: false, room: null, msgs: [], ready: false, error: null, missing: false, pics: null, picsAt: 0, foundAt: 0, pause: 0, pauseUntil: 0 });
  chat.tags.clear();
  chatSay(); chatNext(0);
}
function setChatRepo(repo) {
  setSetup({ ...setup, chat: repo ? { repo } : null });
  const failed = saveConfig();
  broadcast('config', boardConfig()); chatReset();
  return failed;
}
/** One write at a time, CHAT_GAP_MS after the last: GitHub's secondary limits are on content made in a burst. */
function chatWrite(fn) {
  const run = chat.writes.then(async () => {
    const wait = chat.lastWrite + CHAT_GAP_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    try { return await fn(); } finally { chat.lastWrite = Date.now(); }
  });
  chat.writes = run.catch(() => {});
  return run;
}
const chatLabel = repo => ghRest('POST', `/repos/${repo}/labels`, { name: ROOM_LABEL, color: '1f6feb', description: 'The issue that is the peixAIrada chat' }).catch(e => { if (e.status !== 422) throw e; });   // 422: it is there
/** The people of your chats' PRs — prPeople's: authors, reviewers, commenters, pushers, no bots —, whom you might
 *  invite: by how many of those PRs each had a hand in, then by when they last did; the ones in `skip` left out. */
function chatSuggest(skip) {
  const by = new Map();
  for (const s of sessions.values()) for (const pr of s.prs) for (const p of prStatus.get(pr.url)?.people || []) {
    if (!p?.login || skip.has(p.login.toLowerCase())) continue;
    const e = by.get(p.login) || { login: p.login, face: p.avatar || null, prs: new Set(), at: '' };
    e.prs.add(pr.url); if ((p.at || '') > e.at) e.at = p.at; e.face ||= p.avatar || null;
    by.set(p.login, e);
  }
  return [...by.values()].sort((a, b) => b.prs.size - a.prs.size || b.at.localeCompare(a.at)).slice(0, CHAT_SUGGEST).map(e => ({ login: e.login, face: e.face, prs: e.prs.size, at: e.at || null }));
}
async function chatPeople() {
  const [mem, inv] = await Promise.all([ghRest('GET', `/repos/${chat.repo}/collaborators?affiliation=direct&per_page=100`), ghRest('GET', `/repos/${chat.repo}/invitations?per_page=100`)]);
  const members = (mem.data || []).filter(c => c.login !== chat.me?.login).map(c => ({ login: c.login, face: c.avatar_url || null, role: c.role_name || null }));
  const invites = (inv.data || []).filter(i => i.invitee?.login).map(i => ({ id: i.id, login: i.invitee.login, face: i.invitee.avatar_url || null, at: i.created_at || null, expired: !!i.expired }));
  const skip = new Set([chat.me?.login, ...members.map(m => m.login), ...invites.map(i => i.login)].filter(Boolean).map(l => l.toLowerCase()));
  return { members, invites, suggest: chatSuggest(skip) };
}
/** Where a chat could be, for Settings › Chat with none set (2026-10-18): the organizations you own, newest first (the
 *  one made for the chat, most likely), your account, and the chats you can read already — a repo whose description
 *  says it is one, in an organization you own, your account, or one you were let into. Not the organizations you are
 *  only a member of: an employer's repos are no chat's, and listing them is pages of calls. Kept CHAT_PLACES_MS; a make,
 *  a join or a leave forgets it. */
async function chatPlaces() {
  const c = chatPlaces.cache; if (c && Date.now() - c.at < CHAT_PLACES_MS) return c.data;
  const [me, mine] = await Promise.all([ghRest('GET', '/user'), ghRest('GET', '/user/memberships/orgs?state=active&per_page=100')]);
  const owned = (mine.data || []).filter(m => m.role === 'admin' && m.organization?.login).map(m => m.organization.login);
  const orgs = (await Promise.all(owned.map(o => ghRest('GET', `/orgs/${o}`).then(r => r.data, () => null)))).filter(Boolean)   // one SSO keeps from the token: left out
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).map(o => ({ login: o.login, face: o.avatar_url || null }));
  const lists = await Promise.all([...orgs.map(o => `/orgs/${o.login}/repos?type=all&per_page=100`), '/user/repos?affiliation=owner,collaborator&sort=created&direction=desc&per_page=100']
    .map(u => ghRest('GET', u).then(r => r.data || [], () => [])));
  const chats = new Map();
  for (const r of lists.flat()) if (String(r.description || '').startsWith(ROOM_MARK) && r.full_name) chats.set(r.full_name.toLowerCase(), { repo: r.full_name, admin: !!r.permissions?.admin });
  const data = { me: { login: me.data.login, face: me.data.avatar_url || null }, orgs, chats: [...chats.values()] };
  chatPlaces.cache = { at: Date.now(), data };
  return data;
}
/** /api/chat and what is under it — every route keyed as the board's others. The admin's are GitHub's to refuse too. */
export async function chatRoute(req, res, what, url) {
  const M = req.method, body = M === 'GET' ? {} : await jsonBody(req);
  const ready = () => { if (!setup.chat) throw chatErr(409, 'no chat repo in the setup'); if (!chat.ready) throw chatErr(409, chat.error || 'the chat is still being read'); };
  const admin = () => { ready(); if (chat.role !== 'admin') throw chatErr(403, `only ${chat.repo}'s admin does that`); };
  const there = () => { if (!chat.room) throw chatErr(409, `no chat in ${chat.repo} yet — its admin's board starts it`); return chat.room.n; };
  const login = v => { const l = String(v ?? '').trim().replace(/^@/, ''); if (!ORG_NAME.test(l)) throw chatErr(400, `"${l}" is not a GitHub login`); return l; };
  const sent = async (n, r) => {   // a message of yours, sent: held, said to every page, read
    const m = { ...chatMsg(r.data), n };
    if (m.poll) Object.assign(m, { votes: [], votesRx: m.rx, votesAt: Date.now() });   // new: nobody has voted
    const c = chatTake([m]); await chatVotes(chat.gen, c); chatTell(c, true);
    if (m.id > (chatSeen[seenKey()] ?? 0)) { chatSeen[seenKey()] = m.id; saveState(); }
    chatSay(); return chat.msgs.find(x => x.id === m.id) || m;
  };
  try {
    if (M === 'GET' && !what) {
      if (url.searchParams.has('invites') && Date.now() - chat.askedAt > 1000) await chatInvites(chat.gen).catch(e => chatFailed(e));   // Settings › Chat open: asked now (a 304 when nothing changed), not in ten minutes — at boot too: invitesAt is the timer's, put off then
      if (url.searchParams.has('pics')) await chatPicsAgain();   // the panel open with no place for your pictures: asked again (CHAT_PICS_AGAIN_MS)
      return json(res, 200, chatSummary());
    }
    if (M === 'GET' && what === 'messages') return json(res, 200, { room: chat.room?.n ?? null, msgs: chat.msgs, seen: chatSeen[seenKey()] ?? 0 });
    if (M === 'POST' && what === 'watch') {   // a page shows the chat: looked at often while it does
      const was = Date.now() < chat.watchUntil; chat.watchUntil = Date.now() + CHAT_WATCH_MS;
      if (!was && chat.ready && !chat.busy) chatNext(0);
      return json(res, 200, { ok: true });
    }
    if (M === 'POST' && what === 'seen') {
      there(); const id = Number(body.id) || 0;
      if (id > (chatSeen[seenKey()] ?? 0)) { chatSeen[seenKey()] = id; saveState(); chatSay(); }
      return json(res, 200, { ok: true });
    }
    if (M === 'POST' && what === 'send') {
      ready(); const n = there(), text = String(body.body ?? '').replace(/\r\n?/g, '\n').replace(UNSAID, '').trim();
      if (!text) throw chatErr(400, 'nothing to send');
      if (text.length > CHAT_BODY_MAX) throw chatErr(400, `a message is ${CHAT_BODY_MAX} characters at most`);
      return json(res, 200, { msg: await sent(n, await chatWrite(() => ghRest('POST', `/repos/${chat.repo}/issues/${n}/comments`, { body: text }))) });
    }
    if (M === 'POST' && what === 'poll') {   // a question and its answers, as a message (2026-10-20)
      ready(); const n = there(), q = pollLine(body.q, POLL_Q_MAX), answers = (Array.isArray(body.answers) ? body.answers : []).map(a => pollLine(a, POLL_A_MAX)).filter(Boolean);
      if (!q) throw chatErr(400, 'a poll asks something');
      if (answers.length < 2) throw chatErr(400, 'a poll has two answers at least');
      if (answers.length > POLL_MAX) throw chatErr(400, `${POLL_MAX} answers at most — one for each reaction GitHub has`);
      if (new Set(answers.map(a => a.toLowerCase())).size < answers.length) throw chatErr(400, 'two answers say the same');
      return json(res, 200, { msg: await sent(n, await chatWrite(() => ghRest('POST', `/repos/${chat.repo}/issues/${n}/comments`, { body: pollBody(q, answers, !!body.many) }))) });
    }
    if (M === 'POST' && what === 'vote') {   // your answer to a poll, given or taken back; on a poll of one answer each, the one before taken back
      ready(); const id = Number(body.id), m = chat.msgs.find(x => x.id === id), r = String(body.r ?? '');
      if (!m?.poll) throw chatErr(404, 'no such poll');
      if (!m.poll.opts.some(o => o.r === r)) throw chatErr(400, 'not one of its answers');
      const url = `/repos/${chat.repo}/issues/comments/${id}/reactions`;
      let list = (await ghRest('GET', `${url}?per_page=100`)).data || [];
      const had = list.filter(x => x.user?.login === chat.me.login && m.poll.opts.some(o => o.r === x.content)), again = had.find(x => x.content === r);
      const drop = async x => { await chatWrite(() => ghRest('DELETE', `${url}/${x.id}`)); list = list.filter(y => y.id !== x.id); };
      if (again) await drop(again);
      else {
        const made = (await chatWrite(() => ghRest('POST', url, { content: r }))).data;
        if (made?.id && !list.some(y => y.id === made.id)) list.push(made);
        if (!m.poll.many) for (const x of had) await drop(x);
      }
      // the votes as written, not asked again (GitHub's list may lag its writes), and the counts they make: a look that
      // finds others' votes making the same counts as yours did would see nothing moved
      const held = chat.msgs.find(x => x.id === id) || m;
      held.votes = votesOf(held.poll, list); held.rx = held.votesRx = held.poll.opts.map(o => list.filter(x => x.content === o.r).length).join(' ');
      broadcast('chatmsgs', { n: held.n, add: [held], gone: [] });
      return json(res, 200, { msg: held });
    }
    if (M === 'POST' && what === 'delete') {   // yours, or anyone's for the admin
      ready(); const id = Number(body.id), m = chat.msgs.find(x => x.id === id);
      if (!m) throw chatErr(404, 'no such message');
      if (m.who !== chat.me?.login && chat.role !== 'admin') throw chatErr(403, 'not your message');
      await chatWrite(() => ghRest('DELETE', `/repos/${chat.repo}/issues/comments/${id}`));
      chat.msgs = chat.msgs.filter(x => x.id !== id); broadcast('chatmsgs', { n: m.n, add: [], gone: [id] }); chatSay();
      return json(res, 200, { ok: true });
    }
    if (M === 'GET' && what === 'people') { admin(); return json(res, 200, await chatPeople()); }
    if (M === 'GET' && what === 'places') return json(res, 200, await chatPlaces());
    if (M === 'POST' && what === 'invite') {   // Read on an organization's repo; a personal account's collaborators are all writers
      admin(); const u = (await ghRest('GET', `/users/${login(body.login)}`).catch(e => { throw e.status === 404 ? chatErr(404, `no GitHub user ${body.login}`) : e; })).data;
      if (u.type !== 'User') throw chatErr(400, `${u.login} is not a person's account`);
      const r = await chatWrite(() => ghRest('PUT', `/repos/${chat.repo}/collaborators/${u.login}`, chat.org ? { permission: 'pull' } : {}));
      await filesFollow();   // a writer on the files repo too, for their pictures
      return json(res, 200, { login: u.login, invited: r.status === 201, ...await chatPeople() });
    }
    if (M === 'POST' && what === 'remove') { admin(); const l = login(body.login); await chatWrite(() => ghRest('DELETE', `/repos/${chat.repo}/collaborators/${l}`)); await filesFollow(); return json(res, 200, await chatPeople()); }
    if (M === 'POST' && what === 'cancel') { admin(); await chatWrite(() => ghRest('DELETE', `/repos/${chat.repo}/invitations/${Number(body.id)}`)); await filesFollow(); return json(res, 200, await chatPeople()); }
    if (M === 'POST' && what === 'join') {
      const inv = chat.invites.find(i => i.id === Number(body.id)); if (!inv) throw chatErr(404, 'no such invitation — it may have expired');
      await ghRest('PATCH', `/user/repository_invitations/${inv.id}`);
      chatPlaces.cache = null;
      const failed = setChatRepo(inv.repo);
      return failed ? json(res, 500, { error: `joined, but not saved to ${tildePath(CONFIG_FILE)}: ${failed}` }) : json(res, 200, chatSummary());
    }
    if (M === 'POST' && what === 'leave') {   // a member leaves the repo; its admin only stops using it here
      if (setup.chat && chat.ready && chat.role !== 'admin') {
        await ghRest('DELETE', `/repos/${chat.repo}/collaborators/${chat.me.login}`).catch(e => { if (e.status !== 404) throw e; });
        if (chat.org) await ghRest('DELETE', `/repos/${filesOf(chat.repo)}/collaborators/${chat.me.login}`).catch(() => {});   // its files repo too: nothing left of the chat
      }
      chatPlaces.cache = null;
      const failed = setChatRepo(null);
      return failed ? json(res, 500, { error: `not saved to ${tildePath(CONFIG_FILE)}: ${failed}` }) : json(res, 200, chatSummary());
    }
    if (M === 'POST' && what === 'use') {   // a chat by its repo — one GitHub lets you read, never a name it does not know (2026-10-18)
      const { setup: s, error } = cleanSetup({ chat: { repo: body.repo } }, true); if (error || !s?.chat) throw chatErr(400, error || 'which repo?');
      const r = await ghRest('GET', `/repos/${s.chat.repo}`).catch(async e => { if (e.status !== 404) throw e; await chatInvites(chat.gen).catch(() => {}); throw chatNotThere(s.chat.repo); });
      const failed = setChatRepo(r.data.full_name);
      return failed ? json(res, 500, { error: `not saved to ${tildePath(CONFIG_FILE)}: ${failed}` }) : json(res, 200, chatSummary());
    }
    if (M === 'POST' && what === 'make') {   // a new private repo for the chat, its first room, and the setup naming it
      const full = String(body.repo ?? '').trim(); if (!REPO_RE.test(full)) throw chatErr(400, `"${full}" is not owner/name`);
      const [owner, name] = full.split('/'), me = (await ghRest('GET', '/user')).data;
      const r = await ghRest('POST', owner.toLowerCase() === me.login.toLowerCase() ? '/user/repos' : `/orgs/${owner}/repos`,
        { name, private: true, description: `${ROOM_MARK} — the issue labelled room is the chat`, has_issues: true, has_wiki: false, has_projects: false, has_discussions: false });
      const repo = r.data.full_name;
      chatPlaces.cache = null;
      await ghRest('PUT', `/repos/${repo}/subscription`, { subscribed: false, ignored: true }); if (!chatQuiet.includes(repo)) chatQuiet.push(repo);
      await chatStart(repo);
      const failed = setChatRepo(repo);
      return failed ? json(res, 500, { error: `made ${repo}, but not saved to ${tildePath(CONFIG_FILE)}: ${failed}` }) : json(res, 200, chatSummary());
    }
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, [400, 403, 404, 409, 422].includes(e.status) ? (e.status === 422 ? 400 : e.status) : e.status === 401 ? 401 : 502, { error: e.message });
  }
}
