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
  doneMarks, envs, favChats, forgotten, isDone, isRemoved, mutedChats, projects, seen, seenSince, sessions, snoozed,
  titles, woke, worktreesMade
} from './state.mjs';
import { runningTasks } from './tasks.mjs';
import { agentColor } from './terminals/chat-agents.mjs';
import { NO_TERMS, shellOf, shellsOf, termIndex, termOf, termSummary } from './terminals/terms.mjs';
import { doingOf } from './transcript/fold.mjs';
import { cut } from './transcript/text.mjs';
import { nextWake } from './wakes.mjs';

export const projectList = () => Object.values(projects).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
// name: non-empty, one line; cwds: absolute paths, deduplicated. Nothing checks they exist — a project
// can name a folder before its first chat runs there.
export function projectInput(body, prev = {}) {
  const name = typeof body.name === 'string' ? cut(body.name.trim().replace(/\s+/g, ' '), 80) : prev.name;
  if (!name) return { error: 'a project needs a name' };
  // `~/…` is a folder under the home, as the editor's own placeholder writes it (2026-10-03: dropped in silence before)
  const list = body.cwds === undefined ? null : Array.isArray(body.cwds) ? body.cwds.filter(c => typeof c === 'string' && c.trim()).map(expandHome) : false;
  if (list === false || list?.some(c => !c.startsWith('/'))) return { error: `cwds must be a list of absolute paths${list ? ` — not ${list.find(c => !c.startsWith('/'))}` : ''}` };
  const cwds = list ? [...new Set(list.map(c => c.replace(/\/+$/, '') || '/'))] : prev.cwds;
  return { name, cwds };
}

// Every session object a number of its own: a re-read replaces the object and counts its entries afresh, so the page
// knows the numbers it holds are another reading's (the `entries` events and /messages carry it, with `upto`).
let sessionGen = 0;
export function newSession(id, file) {
  return {
    id, file, gen: ++sessionGen,
    slug: file ? basename(dirname(file)) : null,
    cwd: null, gitBranch: null, model: null, agent: null,   // agent: what its transcript says it runs as (2026-11-06)
    title: null, customTitle: null, lastPrompt: null, lastReply: null, prs: [], tickets: [], ticketBranch: null,
    prSeq: 0, prsGone: null, prsHeard: new Map(),   // notePr: the order PRs were heard in, those MAX_PRS put aside, those a listing named (notePrs)
    status: 'unknown', statusSince: null, lastActivity: null, lastUserAt: null, lastReplyAt: null, turnStart: null,
    compacting: false,   // the turn is a /compact you typed: its compact_boundary ends it (fold)
    clearedAt: null,   // the time of the /clear this transcript begins with, if it does (tickCleared)
    firstPrompt: null, replyText: null, away: null,   // a handoff's (2026-10-31): your first words, Claude's last reply whole, Claude Code's recap ({text, at})
    startedAt: null,   // when a chat with no transcript yet came to be (loadRegistry) — the card's time and place until a first word lands
    openedAt: null,    // when a page last opened the chat (ms): its PRs are polled as if it had just been touched (prEvery)
    live: null, alive: false, entrypoint: null, entrypointAt: null,   // last 'entrypoint' a user/assistant line carried ('claude-vscode' | 'cli'), and when
    rivals: [],   // other live processes on this chat (registry entries beyond `live`) — the page's hasRival
    entries: [], entryCount: 0, loaded: false,
    offset: 0, partial: '', dec: null, reading: false, truncatedHead: false,   // where the tail reads from, its unfinished line and character (indexFile)
    agentsRunning: 0, ask: null, tasks: null, taskCalls: null, tasksGone: null,   // sub-agents at work (scanAgents); the question a tool asked; background tasks, the calls that started them, and the ids the poll let go (letTaskGo)
    woke: null, wakes: null, wakeCalls: null, stopped: null,   // a turn its own task's notice woke; the wake-ups it set itself and their calls (startWake); how its last turn stopped short (stopOf)
    branches: [], branchBase: null, gitCmds: [], drift: null, driftDue: null,   // the branch under the chat as its lines tell it, and a move no git of its own explains (noteBranch)
    prActs: [], actsWait: new Map(),   // what its Bash did to a PR — a push, a review, a reply — and the calls still waiting on their result (prActs)
    opening: new Map(),   // its Bash calls with a `gh pr create` in them, waiting on their result (noteOpening)
    headNow: null, diskDrift: null, diskSeen: null, headOk: null, peers: [],      // its checkout's HEAD as read on the poll, and what that says (noteHead)
    linesIn: 0,   // its own lines come in since the read (noteBranch): a disk move under a chat at work waits for one (noteHead)
    pendingNotify: null, notifyTimer: null, pushTimer: null, newEntries: [],   // the kinds of alert owed (queueNotify), a Set
    backOwed: null   // a snooze's end, its `back` alert owed to the next push (wakeCheck, 2026-11-24)
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
export function waitingOn(s) {
  if (!s.alive) return undefined;
  const procs = [s.live, ...s.rivals].filter(p => p?.status);
  if (!procs.length) return undefined;
  const w = procs.find(p => p.status === 'waiting' && !NOT_ASKING.has(p.waitingFor));
  return w ? w.waitingFor || 'a prompt' : null;
}

export function statusOf(s) {
  if (!s.alive) return s.status === 'unknown' ? 'unknown' : 'stale';
  const waiting = waitingOn(s);
  if (waiting || (waiting === undefined && s.status === 'needs-input')) return 'needs-input';   // a question beats the agents' work
  if (s.agentsRunning) return 'working';
  if (s.status === 'unknown' && !s.lastActivity) return 'idle';   // live and empty — a new chat, or a cleared one (whose file holds only the /clear)
  if (s.status === 'needs-input') return s.live?.status === 'busy' ? 'working' : 'idle';   // the registry has it answered already
  // A turn the transcript never closes (2026-09-29): Claude Code writes the typed /compact as a plain prompt line and,
  // compacted, no assistant line — no end_turn. A process that went idle after your last word is not clauding, whatever
  // the last line reads. Only after: a prompt lands in the transcript a beat before the registry says busy, and the
  // idle before it is the last turn's.
  if (s.status === 'working' && s.live?.status === 'idle' && s.live.statusAt >= Date.parse(s.lastUserAt || s.statusSince)) return 'idle';
  return s.status;
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
export const projectDir = cwd => cwd ? cwd.replace(WT_IN, '') : cwd;
function worktreeOf(s, cwd) {
  const m = WT_IN.exec(cwd || ''); if (!m) return null;
  let made = null; try { made = worktreesMade[realpathSync(cwd.slice(0, m.index) + `/.claude/worktrees/${m[1]}`)]; } catch {}
  const now = s.alive && s.headNow !== 'HEAD' ? s.headNow : null;
  return { name: m[1], branch: now || s.gitBranch || made?.branch || null };
}
export function summary(s, ti = null) {   // `ti`: termIndex(), when the whole board is summarized at once
  const prT = prTitle(s), status = statusOf(s), mine = ti ? ti.get(s.id) || NO_TERMS : { term: termOf(s), shell: shellOf(s), shells: shellsOf(s) };
  const cwd = s.live?.cwd || s.cwd;
  return {
    // Prefer the registry cwd: transcript lines record the shell's *current* directory, which moves with `cd`.
    id: s.id, slug: s.slug, cwd, project: basename(projectDir(cwd) || '') || s.slug, worktree: worktreeOf(s, cwd),
    gitBranch: s.gitBranch, model: s.model,
    // the agent it runs as (2026-11-06): its transcript's word, else its claude's flag while it runs; and its colour
    ...(a => a && { agent: a, agentColor: agentColor(cwd, a) })(s.agent || s.live?.agent),
    // The PR title beats Claude's own: it is what the work is called everywhere else — the PR page, the
    // branch, standup. A title the user typed still wins over both.
    title: titles[s.id] || s.customTitle || prT || s.title || s.lastPrompt || forkTitle(s) || (!s.lastActivity && s.alive ? '(no messages yet)' : '(untitled)'),
    aiTitle: s.title, customTitle: s.customTitle, prTitle: prT, boardTitle: titles[s.id] || null,
    lastPrompt: s.lastPrompt, lastReply: s.lastReply, prs: s.prs.filter(shownPr), tickets: shownTickets(s),
    // A live process with no transcript yet is an empty, idle panel (e.g. restored by VS Code, never prompted).
    // Not alive = the Claude process is gone: 'stale'. Resuming the chat registers a new pid and it comes back.
    status,
    agents: s.agentsRunning || 0,   // sub-agents at work — what keeps the status 'working' past the main turn's end
    tasks: runningTasks(s),         // monitors and background commands still running behind the turn
    peerIn: peerInOf(s), peerQueue: peerQueueOf(s),   // another chat's newest message to it, and those waiting for its turn's end (2026-10-31)
    agentRows: s.alive ? s.agentRows || null : null,   // a row per sub-agent of its last round, while its claude runs (noteAgents, 2026-11-02)
    // every agent of its claude's when the rows are its last round only, a resume's past too (Space's pods, 2026-11-18);
    // a chat with no claude, its past alone (pastAgents, 2026-11-24)
    agentAll: s.agentAll || null,
    // the Watching lane's (2026-10-31): the turn at work was woken by the chat's own task notice, not by you; the next
    // wake-up it set itself; and how its last turn stopped short, while nothing runs
    woken: status === 'working' && !!s.woke, wake: nextWake(s), stopped: status === 'working' || status === 'needs-input' ? null : s.stopped,
    doing: status === 'working' ? doingOf(s) : null,   // the turn's newest tool call: the card's live line (2026-10-11)
    // the question it is waiting on and which tool asked, when the transcript has it; else only what the registry
    // says it is waiting for — the question itself is written with its answer (see waitingOn)
    ask: status !== 'needs-input' ? null : s.status === 'needs-input' && s.ask ? s.ask : { tool: null, text: null, options: 0, waitingFor: waitingOn(s) || null },
    rawStatus: s.status, statusSince: s.statusSince, lastActivity: s.lastActivity, startedAt: s.startedAt,
    lastUserAt: s.lastUserAt, lastReplyAt: s.lastReplyAt,
    // where it lives (the page's inVsCode): the registry's entry point while it runs, else the last its transcript
    // recorded — every line carries it, so a chat continued in VS Code says so at its tail, and one resumed elsewhere stops
    alive: s.alive, live: s.live, entrypoint: s.live?.entrypoint || s.entrypoint, terminal: termSummary(mine.term), shell: termSummary(mine.shell), shells: mine.shells.map(termSummary), entryCount: s.entryCount, loaded: s.loaded, file: s.file,
    env: envs[s.id] || mine.term?.task || null,   // the launcher it was started with (⌥⌘O groups oracle's chats by it)
    // the other live processes on this chat, and who wrote its last turn — the page's "VS Code too" warning
    rivals: s.rivals, tailEntrypoint: s.entrypoint, tailEntrypointAt: s.entrypointAt,
    done: isDone(s), doneAt: doneMarks[s.id] || null, forGood: forgotten(s), removed: isRemoved(s),
    muted: !!mutedChats[s.id],   // no banner, sound or count from it, till you unmute it (2026-11-02)
    fav: !!favChats[s.id],   // starred in Space (2026-11-18, v11)
    // put away till a time or an event (2026-11-24, round XXX), and the last time a snooze ended by itself, and why
    snooze: snoozed[s.id] || null, wokeAt: woke[s.id]?.at || null, wokeWhy: woke[s.id]?.why || null,
    seenAt: seen[s.id] || seenSince,   // the board last showed it: a reply after is a new one (2026-10-12)
    ...linksShown(s.id) && { links: linksShown(s.id) },   // merged, folded, branched — by your hand (2026-10-31)
    // the branch moved under it (2026-10-13): what its checkout is on now and what the chat was on, and who else runs in
    // that checkout — while its claude runs, and not once you said you know
    drift: (d => d && { from: d.from, to: d.to, at: d.at, peers: s.peers || [] })(driftOf(s)), headNow: s.alive ? s.headNow : null,
    // its folder not there, and the repo a clone would bring it back from (2026-10-09; the resume bar says so before
    // the resume clones it), or the worktree a resume makes again, the folder it starts in (2026-10-19, `back`) — asked
    // of a chat with no claude only: one running has its folder
    ...(!s.alive && s.cwd && !existsSync(s.cwd) ? { folderMissing: true, cloneRef: cloneFor(s.cwd)?.ref || null, back: folderBack(s.cwd) } : {})
  };
}

/** Newest first by the chat's last word — yours or Claude's reply, whichever came later, or a PR come round to you (its
 *  turn's movedAt; not on a chat done for good) — the board's own order (`byWord` in index.html). Over summaries. */
const wordAt = s => {
  const u = String(s.lastUserAt || ''), r = String(s.lastReplyAt || ''), m = s.forGood ? '' : s.prs.reduce((a, p) => (p.turn?.you && p.turn.movedAt > a ? p.turn.movedAt : a), '');
  const w = (u > r ? u : r) || String(s.lastActivity || '') || String(s.startedAt || '');   // an empty chat: its start (the page's copy agrees)
  const k = String(s.wokeAt || '');   // a snooze that ended by itself is a word too: back at the top of its lane (2026-11-24, round XXX)
  return [m, k].reduce((a, b) => (b > a ? b : a), w);
};
export function sortedSummaries() {
  const ti = termIndex();
  return [...sessions.values()].map(s => summary(s, ti)).sort((a, b) => wordAt(b).localeCompare(wordAt(a)));
}
