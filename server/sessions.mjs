// A chat as the board holds it: made (newSession), its status, its project, and its summary — what every page
// is sent of it.
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { driftOf } from './drift.mjs';
import { cloneFor, folderBack } from './folders.mjs';
import { shownTickets } from './jira.mjs';
import { forkTitle, linksShown } from './links.mjs';
import { peerInOf, peerQueueOf } from './peers.mjs';
import { prTitle, shownPr } from './prs/refs.mjs';
import { expandHome } from './setup.mjs';
import {
  doneMarks,
  envs,
  favChats,
  forgotten,
  isDone,
  isRemoved,
  mutedChats,
  projects,
  seen,
  seenSince,
  sessions,
  snoozed,
  titles,
  woke,
  worktreesMade,
} from './state.mjs';
import { runningTasks } from './tasks.mjs';
import { agentColor } from './terminals/chat-agents.mjs';
import { NO_TERMS, shellOf, shellsOf, termIndex, termOf, termSummary } from './terminals/terms.mjs';
import { doingOf } from './transcript/fold.mjs';
import { cut } from './transcript/text.mjs';
import { nextWake } from './wakes.mjs';

export const projectList = () =>
  Object.values(projects).sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));

// name: non-empty, one line; cwds: absolute paths, deduplicated. Nothing checks they exist — a project
// can name a folder before its first chat runs there.
export function projectInput(body, prev = {}) {
  const name = typeof body.name === 'string' ? cut(body.name.trim().replace(/\s+/g, ' '), 80) : prev.name;

  if (!name) return { error: 'a project needs a name' };

  // `~/…` is a folder under the home, as the editor's own placeholder writes it (2026-10-03: dropped in silence before)
  const list =
    body.cwds === undefined
      ? null
      : Array.isArray(body.cwds)
        ? body.cwds.filter(cwd => typeof cwd === 'string' && cwd.trim()).map(expandHome)
        : false;

  if (list === false || list?.some(cwd => !cwd.startsWith('/'))) {
    return {
      error: `cwds must be a list of absolute paths${list ? ` — not ${list.find(cwd => !cwd.startsWith('/'))}` : ''}`,
    };
  }

  const cwds = list ? [...new Set(list.map(cwd => cwd.replace(/\/+$/, '') || '/'))] : prev.cwds;

  return { name, cwds };
}

// Every session object a number of its own: a re-read replaces the object and counts its entries afresh, so the page
// knows the numbers it holds are another reading's (the `entries` events and /messages carry it, with `upto`).
let sessionGen = 0;

export function newSession(id, file) {
  return {
    id,
    file,
    gen: ++sessionGen,
    slug: file ? basename(dirname(file)) : null,
    cwd: null,
    gitBranch: null,
    model: null,
    agent: null, // agent: what its transcript says it runs as (2026-11-06)
    title: null,
    customTitle: null,
    lastPrompt: null,
    lastReply: null,
    prs: [],
    tickets: [],
    ticketBranch: null,
    prSeq: 0,
    prsGone: null,
    prsHeard: new Map(), // notePr: the order PRs were heard in, those MAX_PRS put aside, those a listing named (notePrs)
    status: 'unknown',
    statusSince: null,
    lastActivity: null,
    lastUserAt: null,
    lastReplyAt: null,
    turnStart: null,
    compacting: false, // the turn is a /compact you typed: its compact_boundary ends it (fold)
    clearedAt: null, // the time of the /clear this transcript begins with, if it does (tickCleared)
    firstPrompt: null,
    replyText: null,
    away: null, // a handoff's (2026-10-31): your first words, Claude's last reply whole, Claude Code's recap ({text, at})
    startedAt: null, // when a chat with no transcript yet came to be (loadRegistry) — the card's time and place until a first word lands
    openedAt: null, // when a page last opened the chat (ms): its PRs are polled as if it had just been touched (prEvery)
    live: null,
    alive: false,
    entrypoint: null,
    entrypointAt: null, // last 'entrypoint' a user/assistant line carried ('claude-vscode' | 'cli'), and when
    rivals: [], // other live processes on this chat (registry entries beyond `live`) — the page's hasRival
    entries: [],
    entryCount: 0,
    loaded: false,
    offset: 0,
    partial: '',
    dec: null,
    reading: false,
    truncatedHead: false, // where the tail reads from, its unfinished line and character (indexFile)
    agentsRunning: 0,
    ask: null,
    tasks: null,
    taskCalls: null,
    tasksGone: null, // sub-agents at work (scanAgents); the question a tool asked; background tasks, the calls that started them, and the ids the poll let go (letTaskGo)
    woke: null,
    wakes: null,
    wakeCalls: null,
    stopped: null, // a turn its own task's notice woke; the wake-ups it set itself and their calls (startWake); how its last turn stopped short (stopOf)
    branches: [],
    branchBase: null,
    gitCmds: [],
    drift: null,
    driftDue: null, // the branch under the chat as its lines tell it, and a move no git of its own explains (noteBranch)
    prActs: [],
    actsWait: new Map(), // what its Bash did to a PR — a push, a review, a reply — and the calls still waiting on their result (prActs)
    opening: new Map(), // its Bash calls with a `gh pr create` in them, waiting on their result (noteOpening)
    headNow: null,
    diskDrift: null,
    diskSeen: null,
    headOk: null,
    peers: [], // its checkout's HEAD as read on the poll, and what that says (noteHead)
    linesIn: 0, // its own lines come in since the read (noteBranch): a disk move under a chat at work waits for one (noteHead)
    pendingNotify: null,
    notifyTimer: null,
    pushTimer: null,
    newEntries: [], // the kinds of alert owed (queueNotify), a Set
    backOwed: null, // a snooze's end, its `back` alert owed to the next push (wakeCheck, 2026-11-24)
  };
}

// Whether the chat is blocked on you, in Claude Code's own words: every interactive claude writes `status`
// (busy · idle · waiting · shell) to its registry file on each change, and `waitingFor` while it is waiting —
// "input needed" for an AskUserQuestion (measured), "permission prompt" for a tool's approval, "sandbox request"…
// The transcript cannot say it: the assistant line that asks is written *with the answer*, not when the question
// goes up (2026-09-22 — the needs-input alerts in the app's log were a second after each answer, and the card never
// blinked while it mattered). A permission prompt never reaches the transcript at all. So: the waitingFor of any
// live process on the chat that is waiting, null when they report and none is, undefined when none reports (a
// claude from before the field) — and then the transcript's word stands. "dialog open" is left out: it is mostly a
// slash command's dialog you opened yourself (/model, /config), at that terminal already (2026-09-23).
const NOT_ASKING = new Set(['dialog open']);

export function waitingOn(session) {
  if (!session.alive) return undefined;
  const procs = [session.live, ...session.rivals].filter(entry => entry?.status);

  if (!procs.length) return undefined;
  const waiting = procs.find(entry => entry.status === 'waiting' && !NOT_ASKING.has(entry.waitingFor));

  return waiting ? waiting.waitingFor || 'a prompt' : null;
}

export function statusOf(session) {
  if (!session.alive) return session.status === 'unknown' ? 'unknown' : 'stale';
  const waiting = waitingOn(session);

  if (waiting || (waiting === undefined && session.status === 'needs-input')) return 'needs-input'; // a question beats the agents' work
  if (session.agentsRunning) return 'working';
  if (session.status === 'unknown' && !session.lastActivity) return 'idle'; // live and empty — a new chat, or a cleared one (whose file holds only the /clear)
  if (session.status === 'needs-input') return session.live?.status === 'busy' ? 'working' : 'idle'; // the registry has it answered already

  // A turn the transcript never closes (2026-09-29): Claude Code writes the typed /compact as a plain prompt line and,
  // compacted, no assistant line — no end_turn. A process that went idle after your last word is not clauding, whatever
  // the last line reads. Only after: a prompt lands in the transcript a beat before the registry says busy, and the
  // idle before it is the last turn's.
  if (
    session.status === 'working' &&
    session.live?.status === 'idle' &&
    session.live.statusAt >= Date.parse(session.lastUserAt || session.statusSince)
  ) {
    return 'idle';
  }

  return session.status;
}
// A VS Code chat can be taken over like a CLI one (2026-09-20 — refused from 2026-09-19 on a misread of the
// extension). Measured on 2.1.278: the extension launches a claude when a *tab mounts* a chat — the sessions
// list, the /open URI for a chat that has no tab yet, a window restore — and can do so twice for one chat;
// it never respawns one that died. SIGTERM on the process behind the tab in front, hands off: the extension
// logs "Closing Claude on channel" and nothing comes back in 60 s; the same for a chat in the background.
// The 10–30 s "respawns" seen on 2026-09-19 were the user reopening the chat in its panel, per its log.
// What a take-over costs: the tab in VS Code goes dead and does not follow the chat, and opening the chat
// there again starts another claude on it — a second process on the transcript, idle until someone types
// in it, and a turn typed there forks the chat. The registry shows every process, so `rivals` on the summary
// carries the others and the page warns and offers to end them (the take-over route, when the chat is here).

// A chat in a worktree inside a repo — `<repo>/.claude/worktrees/<name>`, where the board and Claude Code's --worktree
// make them — is the repo's (2026-10-13): its project is the repo's name, and the page keys its folder project by the
// repo (projDir there). `worktree` says which tree and branch: its HEAD as the registry poll read it while the chat runs
// (`headNow`, the drift's), else the branch Claude Code last wrote, else the one the board made it on.
export const WT_IN = /\/\.claude\/worktrees\/([^/]+)(?:\/.*)?$/;
export const projectDir = cwd => (cwd ? cwd.replace(WT_IN, '') : cwd);

function worktreeOf(session, cwd) {
  const match = WT_IN.exec(cwd || '');

  if (!match) return null;
  let made = null;

  try {
    made = worktreesMade[realpathSync(`${cwd.slice(0, match.index)}/.claude/worktrees/${match[1]}`)];
  } catch {}

  const now = session.alive && session.headNow !== 'HEAD' ? session.headNow : null;

  return { name: match[1], branch: now || session.gitBranch || made?.branch || null };
}

export function summary(session, ti = null) {
  // `ti`: termIndex(), when the whole board is summarized at once
  const prT = prTitle(session);
  const status = statusOf(session);

  const mine = ti
    ? ti.get(session.id) || NO_TERMS
    : { term: termOf(session), shell: shellOf(session), shells: shellsOf(session) };

  const cwd = session.live?.cwd || session.cwd;

  return {
    // Prefer the registry cwd: transcript lines record the shell's *current* directory, which moves with `cd`.
    id: session.id,
    slug: session.slug,
    cwd,
    project: basename(projectDir(cwd) || '') || session.slug,
    worktree: worktreeOf(session, cwd),
    gitBranch: session.gitBranch,
    model: session.model,
    // the agent it runs as (2026-11-06): its transcript's word, else its claude's flag while it runs; and its colour
    ...(agent => agent && { agent, agentColor: agentColor(cwd, agent) })(session.agent || session.live?.agent),
    // The PR title beats Claude's own: it is what the work is called everywhere else — the PR page, the
    // branch, standup. A title the user typed still wins over both.
    title:
      titles[session.id] ||
      session.customTitle ||
      prT ||
      session.title ||
      session.lastPrompt ||
      forkTitle(session) ||
      (!session.lastActivity && session.alive ? '(no messages yet)' : '(untitled)'),
    aiTitle: session.title,
    customTitle: session.customTitle,
    prTitle: prT,
    boardTitle: titles[session.id] || null,
    lastPrompt: session.lastPrompt,
    lastReply: session.lastReply,
    prs: session.prs.filter(shownPr),
    tickets: shownTickets(session),
    // A live process with no transcript yet is an empty, idle panel (e.g. restored by VS Code, never prompted).
    // Not alive = the Claude process is gone: 'stale'. Resuming the chat registers a new pid and it comes back.
    status,
    agents: session.agentsRunning || 0, // sub-agents at work — what keeps the status 'working' past the main turn's end
    tasks: runningTasks(session), // monitors and background commands still running behind the turn
    peerIn: peerInOf(session),
    peerQueue: peerQueueOf(session), // another chat's newest message to it, and those waiting for its turn's end (2026-10-31)
    agentRows: session.alive ? session.agentRows || null : null, // a row per sub-agent of its last round, while its claude runs (noteAgents, 2026-11-02)
    // every agent of its claude's when the rows are its last round only, a resume's past too (Space's pods, 2026-11-18);
    // a chat with no claude, its past alone (pastAgents, 2026-11-24)
    agentAll: session.agentAll || null,
    // the Watching lane's (2026-10-31): the turn at work was woken by the chat's own task notice, not by you; the next
    // wake-up it set itself; and how its last turn stopped short, while nothing runs
    woken: status === 'working' && !!session.woke,
    wake: nextWake(session),
    stopped: status === 'working' || status === 'needs-input' ? null : session.stopped,
    doing: status === 'working' ? doingOf(session) : null, // the turn's newest tool call: the card's live line (2026-10-11)
    // the question it is waiting on and which tool asked, when the transcript has it; else only what the registry
    // says it is waiting for — the question itself is written with its answer (see waitingOn)
    ask:
      status !== 'needs-input'
        ? null
        : session.status === 'needs-input' && session.ask
          ? session.ask
          : { tool: null, text: null, options: 0, waitingFor: waitingOn(session) || null },
    rawStatus: session.status,
    statusSince: session.statusSince,
    lastActivity: session.lastActivity,
    startedAt: session.startedAt,
    lastUserAt: session.lastUserAt,
    lastReplyAt: session.lastReplyAt,
    // where it lives (the page's inVsCode): the registry's entry point while it runs, else the last its transcript
    // recorded — every line carries it, so a chat continued in VS Code says so at its tail, and one resumed elsewhere stops
    alive: session.alive,
    live: session.live,
    entrypoint: session.live?.entrypoint || session.entrypoint,
    terminal: termSummary(mine.term),
    shell: termSummary(mine.shell),
    shells: mine.shells.map(termSummary),
    entryCount: session.entryCount,
    loaded: session.loaded,
    file: session.file,
    env: envs[session.id] || mine.term?.task || null, // the launcher it was started with (⌥⌘O groups oracle's chats by it)
    // the other live processes on this chat, and who wrote its last turn — the page's "VS Code too" warning
    rivals: session.rivals,
    tailEntrypoint: session.entrypoint,
    tailEntrypointAt: session.entrypointAt,
    done: isDone(session),
    doneAt: doneMarks[session.id] || null,
    forGood: forgotten(session),
    removed: isRemoved(session),
    muted: !!mutedChats[session.id], // no banner, sound or count from it, till you unmute it (2026-11-02)
    fav: !!favChats[session.id], // starred in Space (2026-11-18, v11)
    // put away till a time or an event (2026-11-24, round XXX), and the last time a snooze ended by itself, and why
    snooze: snoozed[session.id] || null,
    wokeAt: woke[session.id]?.at || null,
    wokeWhy: woke[session.id]?.why || null,
    seenAt: seen[session.id] || seenSince, // the board last showed it: a reply after is a new one (2026-10-12)
    ...(linksShown(session.id) && { links: linksShown(session.id) }), // merged, folded, branched — by your hand (2026-10-31)
    // the branch moved under it (2026-10-13): what its checkout is on now and what the chat was on, and who else runs in
    // that checkout — while its claude runs, and not once you said you know
    drift: (drift => drift && { from: drift.from, to: drift.to, at: drift.at, peers: session.peers || [] })(
      driftOf(session),
    ),
    headNow: session.alive ? session.headNow : null,
    // its folder not there, and the repo a clone would bring it back from (2026-10-09; the resume bar says so before
    // the resume clones it), or the worktree a resume makes again, the folder it starts in (2026-10-19, `back`) — asked
    // of a chat with no claude only: one running has its folder
    ...(!session.alive && session.cwd && !existsSync(session.cwd)
      ? { folderMissing: true, cloneRef: cloneFor(session.cwd)?.ref || null, back: folderBack(session.cwd) }
      : {}),
  };
}

/** Newest first by the chat's last word — yours or Claude's reply, whichever came later, or a PR come round to you (its
 *  turn's movedAt; not on a chat done for good) — the board's own order (`byWord` in index.html). Over summaries. */
const wordAt = chat => {
  const userAt = String(chat.lastUserAt || '');
  const replyAt = String(chat.lastReplyAt || '');

  const movedAt = chat.forGood
    ? ''
    : chat.prs.reduce((latest, pr) => (pr.turn?.you && pr.turn.movedAt > latest ? pr.turn.movedAt : latest), '');

  const said = (userAt > replyAt ? userAt : replyAt) || String(chat.lastActivity || '') || String(chat.startedAt || ''); // an empty chat: its start (the page's copy agrees)
  const wokeAt = String(chat.wokeAt || ''); // a snooze that ended by itself is a word too: back at the top of its lane (2026-11-24, round XXX)

  return [movedAt, wokeAt].reduce((latest, time) => (time > latest ? time : latest), said);
};

export function sortedSummaries() {
  const ti = termIndex();

  return [...sessions.values()]
    .map(session => summary(session, ti))
    .sort((left, right) => wordAt(right).localeCompare(wordAt(left)));
}
