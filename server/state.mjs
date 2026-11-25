// The board's own state: every chat it knows (`sessions`), and what it decides — ticks, titles, pins, Pinned,
// snoozes, … — kept in STATE_FILE (loadState, saveState).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { LEGACY_STATE_FILE, STATE_FILE } from './env.mjs';
import { LINK_KINDS, setLinkIdx } from './links.mjs';
import { cleanSetup, setSetup, setup } from './setup.mjs';
import { broadcast, schedulePush } from './sse.mjs';

/** @type {Map<string, Session>} keyed by session id */
export const sessions = new Map();
/** @type {Map<string, string>} transcript path -> session id */
export const fileToSession = new Map();
export let indexing = true; // suppress notifications while doing the initial scan
export function setIndexing(v) {
  indexing = v;
} // for the modules that write it: an import is read-only

// "Done" marks: sessionId -> ISO time it was marked. A mark only counts while nothing newer has
// happened in the session, so a new prompt/reply automatically pulls the card back onto the board.
export let doneMarks = {};
// Done for good (2026-10-11): sessionId -> the done mark it came with. While that tick stands the chat's PRs are
// forgotten — a move on one neither un-ticks it, ranks it, alerts on it nor has it asked about (`forgotten`). A tick of
// any other kind, a word in the chat or ↩ ends it.
export let forGoodMarks = {};
// Off the board (2026-11-04): sessionId -> the done mark it came with, a tick for good that also hides the chat, while it
// stands and no claude runs in it (isRemoved). The transcript stays: nothing under ~/.claude is ever written.
export let removedMarks = {};
// PRs taken off a chat (2026-10-11): sessionId -> { PR url: when }. ⌥-click on its chip in the header, or its row: a PR
// the chat only mentioned in passing — a review's other PR, the one it follows — leaves the chat, and its lines do not
// bring it back, a re-read included (notePr); a word of yours naming it after does.
export let unlinked = {};
// When the board last showed a chat (2026-10-12): sessionId -> ISO time — the page says so when it opens one, and when a
// reply lands on the chat it shows (POST /api/sessions/:id/seen). A reply after it is a new one: the list's New replies
// filter. A chat never shown counts from `seenSince`, the moment the board first kept this, so nothing from before it is
// new.
export let seen = {},
  seenSince = null;
export function setSeenSince(v) {
  seenSince = v;
}
// The branch moved under a chat, and you said you know (2026-10-13): sessionId -> the move (`from→to`) — the header's chip
// clicked. It lasts until that move is gone (driftNews): the next one shows again.
export let driftAcks = {};
// Chats you muted (2026-11-02): sessionId -> when. An alert of one still reaches every page, for its card's own count, but
// `quiet` and `muted`: no banner, no sound, and nothing that calls you counts it. Questions too, till you unmute it. By
// the chat's id, so a /clear or a branch starts loud: that is another chat.
export let mutedChats = {};
export let favChats = {}; // starred in Space, first in its grid (2026-11-18, v11): id → when starred
// Top priority (2026-11-24, round XXX): the chats lifted to the head of the list, in the order you put them — one order
// for the whole board, kept as the project pins are. By the chat's id: a /clear or /resume in the same claude carries the
// slot to the chat it went on in (carryPriority), a chat deleted from the board leaves it.
export let priority = [];
export function setPriority(v) {
  priority = v;
}
// Snoozed chats (2026-11-24, round XXX): sessionId -> { at, until?, on?, pr? } — put away until a time, or an event of its
// own (`on`: `pr` that PR come round to you, `ci` its checks done, `reply` Claude's reply, `mon` its monitors ended),
// whichever comes first. A snoozed chat calls you on nothing (hushOf); your word, a tick, a question or its deletion ends
// it with no mark (wakeWhy).
export let snoozed = {};
// Snoozes that ended by themselves (2026-11-24, round XXX): sessionId -> { at, why }. The chat comes back marked, its
// `at` a word for the list's order (wordAt), with one alert (`back`) — the reply's own when it was Claude's reply.
export let woke = {};
export const PRIORITY_MAX = 200,
  SNOOZE_MAX_MS = 366 * 86_400_000,
  SNOOZE_ON = new Set(['pr', 'ci', 'reply', 'mon']);
// Custom projects: id -> { id, name, cwds, createdAt }. A name over one or more folders — multi-repo
// work, an investigation. Folders themselves need no record: they come from the sessions' cwds.
export let projects = {};
// Titles typed on the board: sessionId -> string. Kept here because the board never writes under
// ~/.claude; they beat every title the transcript carries (PR, custom-title, ai-title).
export let titles = {};
// Pinned projects, in the order they sit at the top of the column: folder cwds and `c:<id>` keys. A
// `colors` key (board-set project colours, 2026-09-20 only) is ignored and dropped on the next save.
export let pinned = [];
export function setPinned(v) {
  pinned = v;
}
// Projects taken off the board: the same keys the pins use — a folder cwd, or `c:<id>` for a named project.
// The board lists the org's folders as well as its own projects now, so the ⌥⌘N step grew a tail of repos
// nobody works in; ✕ on a row puts its key here and every list the board draws skips it (2026-09-22). Nothing
// is deleted and no chat is touched: the cog hands the row back.
export let hiddenProjects = [];
export function setHiddenProjects(v) {
  hiddenProjects = v;
}
// The environment a chat was started in: sessionId -> the launcher's name (`task production-workload`…). The
// terminal carries it, but only while it runs, and the env outlives the drawer — it is what the chat *is* about
// (2026-09-21, so ⌥⌘O can list oracle's open chats under the environment they belong to). Recorded when the pid
// ties the terminal to its session, kept here because the board never writes under ~/.claude.
export let envs = {};
// System notifications on or off — the cog's switch (2026-09-23). Off, an alert still reaches every page (the unread
// badges, the Dock's count) but goes out `quiet`: nothing posts a banner for it, the app, a browser or osascript here.
export let notificationsOn = true;
export function setNotificationsOn(v) {
  notificationsOn = v;
}
// Whose move each PR you wrote or reviewed was at, and since when the board has known it: url -> { key, at }
// (2026-09-28). A PR come round to you un-ticks the chats that mention it (isDone), weighed by `at` — kept here so a
// restart does not hand a move the board had already shown back to GitHub's own clock (moveTurn).
export let prTurns = {};
// Each PR's history, its rounds and events (2026-10-15; every PR a chat shows since 2026-10-17 — see prEvents and
// noteRounds): url -> { ev, r, v, older?, seen? }.
export let prLogs = {}; // url -> { ev: [{ id, k, w, a, n?, s?, f?, x?, c? }], r: [{ from, why, let?, end?, how?, them? }], v: changes, older: 1?, seen: a day }
// Keep the Mac awake — the chat header menu's switch (2026-10-08): a `caffeinate -i` of the server's own while it is
// on, and on again after a restart. The lid's setting is the system's and is read from it, never kept here (keepAwake).
export let awakeOn = false;
export function setAwakeOn(v) {
  awakeOn = v;
}
// The board's own code, kept up to date from its checkout (2026-10-12; see checkUpdate): the switch (off: the new commits
// are said, not taken — 2026-10-13), the last update made (`updated`: {at, from, to, count, parts}), a commit held back
// because it did not start here ({to, why, at}) and the app's last rebuild by the board (`appBuild`: {pid, at, source,
// done, ok, why} — 2026-10-14, the update's own `build` before).
export let autoUpdate = false,
  updateLast = null,
  updateHeld = null,
  appBuild = null;
export function setAutoUpdate(v) {
  autoUpdate = v;
}
export function setUpdateLast(v) {
  updateLast = v;
}
export function setUpdateHeld(v) {
  updateHeld = v;
}
export function setAppBuild(v) {
  appBuild = v;
}
// The working trees the board made for a branch (2026-10-13; ensureWorktree): path -> { repo (its main tree), branch
// (null: detached), pr, prState (its PR's state as it was made, then as the sweep last saw it open — 2026-10-14), head
// (the commit it was made at), linked (node_modules a link of ours), at }. Only these are ever removed, and only by
// sweepWorktrees.
export let worktreesMade = {};
export let keyEnforced = false; // the board's key required of every ask (2026-10-16; see keyWant): once on, for good
export function setKeyEnforced(v) {
  keyEnforced = v;
}
export let jiraTokenSite = null; // the Jira site the kept token was saved for (2026-11-06; jiraToken)
export function setJiraTokenSite(v) {
  jiraTokenSite = v;
}
export let peacockMoved = null; // when Peacock's colours went into the setup (2026-10-15; movePeacock): once
export function setPeacockMoved(v) {
  peacockMoved = v;
}
// The chat (2026-10-17; see chatTick): `owner/repo#room` -> the newest message shown there — after it, someone else's are
// unread; and the chat repos whose GitHub mails were turned off (chatBoot), once each.
export let chatSeen = {},
  chatQuiet = [];
// Chats tied by a hand of yours (2026-10-31; see addLink): [{ k, from, to, at }] — `merge`, a chat merged into a new one;
// `fold`, one folded into another; `branch`, a chat's copy (from the chat, to its copy). Claude Code keeps no such record
// (a fork's transcript names no origin), and the board never writes under ~/.claude, so the board keeps it.
export let chatLinks = [];
export function setChatLinks(v) {
  chatLinks = v;
}
// Lunch (2026-10-18; see lunchTick): the day's menus and what you did about lunch — Going, In 15 min, back.
export let lunchDay = {
  day: null,
  menus: {},
  went: 0,
  snooze: 0,
  back: 0,
  alerted: 0,
  looked: [],
  slacked: [],
  readAt: 0,
};
export function setLunchDay(v) {
  lunchDay = v;
}

// The state file is read once the port is ours (2026-10-14; at import before): a server that waited behind another for
// the port — the agent behind the app's own, an `npm start` beside the agent — booted on the copy it had read at its
// start and saved it over everything the live one had kept meanwhile. Imported (the tests), the module reads nothing and
// saves nothing: six test files import it with no STATE_FILE of their own, and ran the legacy move and the read against
// this Mac's real files.
let stateRead = false;
export function loadState() {
  // One-time move from the old ~/.peixairada location. Same filesystem, so the rename is atomic; the
  // empty directory is left behind rather than removing something we did not create.
  if (!process.env.STATE_FILE && !existsSync(STATE_FILE) && existsSync(LEGACY_STATE_FILE)) {
    try {
      mkdirSync(dirname(STATE_FILE), { recursive: true });
      renameSync(LEGACY_STATE_FILE, STATE_FILE);
      console.log(`[peixairada] moved state to ${STATE_FILE}`);
    } catch (e) {
      console.error('[peixairada] could not move state, still reading the old path:', e.message);
    }
  }
  // A state file that does not parse is kept beside itself (2026-10-03): it was dropped in silence, the board started
  // from nothing — ticks, projects, titles, pins — and the first save wrote over the evidence. STATE_FILE set (a test
  // server) never reads the legacy one, or a fresh test state would start from the user's.
  const stateFrom = existsSync(STATE_FILE) || process.env.STATE_FILE ? STATE_FILE : LEGACY_STATE_FILE;
  try {
    const st = JSON.parse(readFileSync(stateFrom, 'utf8'));
    doneMarks = st.done || {}; // files from before 2026-09-19 also carry a `pins` key — ignored, gone on the next save
    forGoodMarks = st.forGood && typeof st.forGood === 'object' ? st.forGood : {};
    removedMarks = st.removed && typeof st.removed === 'object' ? st.removed : {};
    unlinked = st.unlinked && typeof st.unlinked === 'object' ? st.unlinked : {};
    seen = st.seen && typeof st.seen === 'object' ? st.seen : {};
    seenSince = typeof st.seenSince === 'string' ? st.seenSince : null;
    driftAcks = st.driftAcks && typeof st.driftAcks === 'object' ? st.driftAcks : {};
    mutedChats = st.mutedChats && typeof st.mutedChats === 'object' ? st.mutedChats : {};
    favChats = st.favChats && typeof st.favChats === 'object' ? st.favChats : {};
    priority = Array.isArray(st.priority)
      ? [...new Set(st.priority.filter(k => typeof k === 'string' && /^[\w-]+$/.test(k)))].slice(0, PRIORITY_MAX)
      : [];
    snoozed = Object.fromEntries(
      Object.entries(st.snoozed && typeof st.snoozed === 'object' ? st.snoozed : {}).filter(
        ([, z]) => typeof z?.at === 'string',
      ),
    );
    woke = Object.fromEntries(
      Object.entries(st.woke && typeof st.woke === 'object' ? st.woke : {}).filter(
        ([, w]) => typeof w?.at === 'string',
      ),
    );
    projects = st.projects || {};
    titles = st.titles || {};
    pinned = Array.isArray(st.pinned) ? st.pinned.filter(k => typeof k === 'string') : [];
    hiddenProjects = Array.isArray(st.hidden) ? st.hidden.filter(k => typeof k === 'string') : [];
    envs = st.envs || {};
    notificationsOn = st.notifications !== false;
    setSetup(st.config); // from before CONFIG_FILE — cleaned here, moved there by loadConfig
    prTurns = st.prTurns && typeof st.prTurns === 'object' ? st.prTurns : {};
    prLogs = st.prLogs && typeof st.prLogs === 'object' ? st.prLogs : {};
    awakeOn = st.awake === true;
    autoUpdate = st.selfUpdate === true; // files from 2026-10-12 carry `autoUpdate`, the old default's true written on every save — ignored, gone on the next one
    updateLast = st.updated && typeof st.updated === 'object' ? st.updated : null;
    updateHeld = st.updateHeld && typeof st.updateHeld === 'object' ? st.updateHeld : null;
    appBuild = st.appBuild && typeof st.appBuild === 'object' ? st.appBuild : null;
    worktreesMade = st.worktrees && typeof st.worktrees === 'object' ? st.worktrees : {};
    peacockMoved = typeof st.peacockMoved === 'string' ? st.peacockMoved : null;
    keyEnforced = st.keyEnforced === true;
    jiraTokenSite = typeof st.jiraTokenSite === 'string' ? st.jiraTokenSite : null;
    chatSeen = st.chatSeen && typeof st.chatSeen === 'object' ? st.chatSeen : {};
    chatQuiet = Array.isArray(st.chatQuiet) ? st.chatQuiet.filter(r => typeof r === 'string') : [];
    chatLinks = Array.isArray(st.links)
      ? st.links.filter(l => LINK_KINDS.has(l?.k) && typeof l.from === 'string' && typeof l.to === 'string')
      : [];
    setLinkIdx(null);
    if (st.lunch && typeof st.lunch === 'object' && typeof st.lunch.day === 'string')
      lunchDay = {
        ...lunchDay,
        ...st.lunch,
        menus: st.lunch.menus && typeof st.lunch.menus === 'object' ? st.lunch.menus : {},
      };
  } catch (e) {
    if (e.code !== 'ENOENT') {
      const bad = `${stateFrom}.bad-${Date.now()}`;
      console.error(`[peixairada] the state file does not read (${e.message}) — kept as ${bad}, starting afresh`);
      try {
        renameSync(stateFrom, bad);
      } catch {}
    }
  }
  setSetup(cleanSetup(setup).setup); // the state file's, from before CONFIG_FILE — loadConfig moves it there
  stateRead = true;
}
/** Written beside itself and renamed over (2026-10-03; in place before): a full disk or a kill mid-write left a
 *  truncated file, which the next boot read as no state at all. */
export function saveState() {
  if (!stateRead) return; // never over a file this process has not read: an import, a boot still waiting for the port
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    const body = JSON.stringify(
      {
        done: doneMarks,
        forGood: forGoodMarks,
        removed: removedMarks,
        unlinked,
        seen,
        seenSince,
        driftAcks,
        mutedChats,
        favChats,
        priority,
        snoozed,
        woke,
        projects,
        titles,
        pinned,
        hidden: hiddenProjects,
        envs,
        notifications: notificationsOn,
        prTurns,
        prLogs: {},
        awake: awakeOn,
        selfUpdate: autoUpdate,
        updated: updateLast,
        updateHeld,
        appBuild,
        worktrees: worktreesMade,
        peacockMoved,
        keyEnforced,
        jiraTokenSite,
        chatSeen,
        chatQuiet,
        links: chatLinks,
        lunch: lunchDay,
      },
      null,
      1,
    );
    // a PR's ledger on one line (2026-10-17): up to LOG_EV_MAX events each, a quarter fewer bytes than laid out
    const logs = Object.entries(prLogs).map(([url, log]) => `  ${JSON.stringify(url)}: ${JSON.stringify(log)}`);
    writeFileSync(
      tmp,
      logs.length ? body.replace('\n "prLogs": {},', () => `\n "prLogs": {\n${logs.join(',\n')}\n },`) : body,
      { mode: 0o600 },
    );
    renameSync(tmp, STATE_FILE);
  } catch (e) {
    console.error('[peixairada] could not save state', e.message);
  }
}
// A tick lasts until something newer happens in the chat — or on one of its PRs, once that PR has come round to you
// (a push since your review, a reply, a review on yours: prTurn), which is what a tick after a review waits for. Not
// a tick for good: its PRs are forgotten.
const forGood = s => !!doneMarks[s.id] && forGoodMarks[s.id] === doneMarks[s.id];
export const isDone = s => {
  const at = doneMarks[s.id];
  return !!at && at >= (s.lastActivity || '') && (forGood(s) || s.prs.every(p => !p.turn?.you || at >= p.turn.movedAt));
};
/** Done for good, and still done: its PRs move nothing of the chat's. */
export const forgotten = s => forGood(s) && isDone(s);
/** Deleted from the board, and it stands: a word in it ends that, as any tick's, and so does a claude started on it. */
export const removing = new Set(); // the chats whose claudes are being ended
export const isRemoved = s =>
  !!removedMarks[s.id] && removedMarks[s.id] === doneMarks[s.id] && isDone(s) && (!s.alive || removing.has(s.id));
export const markRemoved = s => {
  doneMarks[s.id] = forGoodMarks[s.id] = removedMarks[s.id] = new Date().toISOString();
};
export function putBackOnBoard(s) {
  delete doneMarks[s.id];
  delete forGoodMarks[s.id];
  delete removedMarks[s.id];
  saveState();
  schedulePush(s);
}
/** The top-priority slot, and snoozes and marks, of chats the board no longer has; true when any went. */
export function pruneChatMarks() {
  const n = priority.length + Object.keys(snoozed).length + Object.keys(woke).length;
  priority = priority.filter(id => sessions.has(id));
  for (const m of [snoozed, woke]) for (const id of Object.keys(m)) if (!sessions.has(id)) delete m[id];
  return n !== priority.length + Object.keys(snoozed).length + Object.keys(woke).length;
}
/** A /clear or /resume in the same claude: the chat it left had a top-priority slot, the chat it went on in takes it. */
export function carryPriority(from, to) {
  const i = priority.indexOf(from.id);
  if (i < 0 || priority.includes(to.id)) return;
  priority = priority.with(i, to.id);
  saveState();
  broadcast('priority', { priority });
}
