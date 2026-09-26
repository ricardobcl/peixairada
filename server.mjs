#!/usr/bin/env node
// peixAIrada — zero-dependency local board for every Claude Code session on this machine
// (VS Code extension and CLI alike). Tails ~/.claude/projects/**/*.jsonl, tracks which sessions
// are alive via ~/.claude/sessions/*.json, serves a live web UI over SSE and fires native macOS
// notifications when Claude finishes a reply or needs your input.
//
//   node server.mjs                # http://127.0.0.1:7331
//   npm start                       # same thing
//   PORT=8000 NOTIFY=off node server.mjs
//   CLAUDE_DIR=/path/to/fixture node server.mjs   # point at a different ~/.claude (tests)
// Map ▾ — the sections, from the file's own banners (node scripts/map.mjs rewrites this; grep a name to jump)
//  State
//      · Peacock: the colour VS Code paints a folder with, from its .vscode/settings.json
//      · attachments: a file dropped on the board from a browser
//  Transcript parsing
//      · PRs mentioned in the chat
//      · …and whether they are open, merged or closed
//  Sub-agents: <slug>/<id>/subagents/agent-*.jsonl — one at work keeps the chat clauding
//      · background tasks: a monitor, or a command left running
//  Live-session registry (~/.claude/sessions/<pid>.json)
//  Notifications + SSE fan-out
//  Hooks (optional precision): POST /hook receives Claude Code hook payloads (see hooks/hook.sh)
//  Replying into a session
//      · Claude plan usage, for the chat list's footer: the numbers `/usage` shows in the CLI
//  VS Code Web: the editor UI served by `code serve-web`, for the pane beside the board
//  Terminals: a real `claude` in a PTY, attached to from the page over a WebSocket
//      · the holder protocol: newline-delimited JSON over the holder's socket (see lib/termhold.mjs)
//      · launchers: a folder's own way to start claude
//      · the org's folders: where the repos live, and cloning one that is not there yet
//  HTTP
//  Boot — only when run as the program. Imported (the tests), the module exposes its pure parts and does nothing.
// Map ▴


import { createServer, get as httpGet } from 'node:http';
import {
  chmodSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync, unlinkSync, watch, writeFileSync
} from 'node:fs';
import { connect as netConnect } from 'node:net';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
// node-pty is the one native module here. Its prebuilt spawn-helper arrives from npm without the
// executable bit, which surfaces as "posix_spawnp failed" on the first terminal — fix it before the
// import rather than documenting it. Without the module the server still runs; terminals answer 501.
// Only when the bit is missing: a chmod to the same mode is still a write, and from the app in
// /Applications every start tripped App Management ("prevented from modifying apps on your Mac").
try { const h = join(__dirname, 'node_modules', 'node-pty', 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'); if (existsSync(h) && (statSync(h).mode & 0o111) !== 0o111) chmodSync(h, 0o755); } catch {}
const nodePty = await import('node-pty').then(m => m.default ?? m).catch(e => { console.error('[peixairada] node-pty unavailable — terminals are disabled:', e.message); return null; });
const CLAUDE_DIR = process.env.CLAUDE_DIR || join(homedir(), '.claude');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');
const SESSIONS_DIR = join(CLAUDE_DIR, 'sessions');
const PORT = Number(process.env.PORT || 7331);
const HOST = process.env.HOST || '127.0.0.1';
const NOTIFY = process.env.NOTIFY || 'native'; // native | off
const TAIL_BYTES = Number(process.env.TAIL_BYTES || 512 * 1024);
const MAX_ENTRIES = Number(process.env.MAX_ENTRIES || 800);
const REGISTRY_POLL_MS = Number(process.env.REGISTRY_POLL_MS || 10_000);   // pids die silently; so do background commands (sweepTasks)
// Where the done ticks live. macOS keeps app data in Application Support (same place the
// logs already go); elsewhere follow the XDG state dir. STATE_FILE overrides both — tests use it.
function defaultStateFile() {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'peixAIrada', 'state.json');
  }
  return join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'peixairada', 'state.json');
}
const STATE_FILE = process.env.STATE_FILE || defaultStateFile();
const LEGACY_STATE_FILE = join(homedir(), '.peixairada', 'state.json');

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

/** @type {Map<string, Session>} keyed by session id */
const sessions = new Map();
/** @type {Map<string, string>} transcript path -> session id */
const fileToSession = new Map();
const sseClients = new Set();
let indexing = true; // suppress notifications while doing the initial scan

// "Done" marks: sessionId -> ISO time it was marked. A mark only counts while nothing newer has
// happened in the session, so a new prompt/reply automatically pulls the card back onto the board.
let doneMarks = {};
// Custom projects: id -> { id, name, cwds, createdAt }. A name over one or more folders — multi-repo
// work, an investigation. Folders themselves need no record: they come from the sessions' cwds.
let projects = {};
// Titles typed on the board: sessionId -> string. Kept here because the board never writes under
// ~/.claude; they beat every title the transcript carries (PR, custom-title, ai-title).
let titles = {};
// Pinned projects, in the order they sit at the top of the column: folder cwds and `c:<id>` keys. A
// `colors` key (board-set project colours, 2026-09-20 only) is ignored and dropped on the next save.
let pinned = [];
// Projects taken off the board: the same keys the pins use — a folder cwd, or `c:<id>` for a named project.
// The board lists the org's folders as well as its own projects now, so the ⌥⌘N step grew a tail of repos
// nobody works in; ✕ on a row puts its key here and every list the board draws skips it (2026-09-22). Nothing
// is deleted and no chat is touched: the cog hands the row back.
let hiddenProjects = [];
// The environment a chat was started in: sessionId -> the launcher's name (`task production-workload`…). The
// terminal carries it, but only while it runs, and the env outlives the drawer — it is what the chat *is* about
// (2026-09-21, so ⌥⌘O can list oracle's open chats under the environment they belong to). Recorded when the pid
// ties the terminal to its session, kept here because the board never writes under ~/.claude.
let envs = {};
// System notifications on or off — the cog's switch (2026-09-23). Off, an alert still reaches every page (the unread
// badges, the Dock's count) but goes out `quiet`: nothing posts a banner for it, the app, a browser or osascript here.
let notificationsOn = true;

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
try {
  const st = JSON.parse(readFileSync(existsSync(STATE_FILE) ? STATE_FILE : LEGACY_STATE_FILE, 'utf8'));
  doneMarks = st.done || {};   // files from before 2026-09-19 also carry a `pins` key — ignored, gone on the next save
  projects = st.projects || {};
  titles = st.titles || {};
  pinned = Array.isArray(st.pinned) ? st.pinned.filter(k => typeof k === 'string') : [];
  hiddenProjects = Array.isArray(st.hidden) ? st.hidden.filter(k => typeof k === 'string') : [];
  envs = st.envs || {};
  notificationsOn = st.notifications !== false;
} catch {}
function saveState() {
  try { mkdirSync(dirname(STATE_FILE), { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify({ done: doneMarks, projects, titles, pinned, hidden: hiddenProjects, envs, notifications: notificationsOn }, null, 1)); }
  catch (e) { console.error('[peixairada] could not save state', e.message); }
}
const isDone = s => !!doneMarks[s.id] && doneMarks[s.id] >= (s.lastActivity || '');

// ---- Peacock: the colour VS Code paints a folder with, from its .vscode/settings.json ----------------
// A project's colour is Peacock's and nothing else (2026-09-20): a folder without one is black on the page.
// "peacock.color" is what the user picked; the activity-bar colour Peacock derives from it is the fallback
// for a settings file that only carries the derived customizations. A regex, not JSON.parse: settings.json
// allows comments and trailing commas. The nearest settings file at or above the folder counts, stopping
// short of the home directory, so a chat in apps/x of a repo wears the repo's window colour. Every folder
// the board knows — a session's cwd, a named project's, a pinned one — is stat'ed every PEACOCK_POLL_MS
// and re-read on mtime; a change reaches every page as a `peacock` event within seconds.
const PEACOCK_POLL_MS = 3000;
const peacock = new Map();   // cwd -> { file, mtime, color }
const HOME = homedir();
function peacockFile(cwd) {
  for (let dir = cwd; dir && dir !== HOME && dir !== '/' && dir !== '.'; dir = dirname(dir)) {
    const f = join(dir, '.vscode', 'settings.json');
    if (existsSync(f)) return f;
  }
  return null;
}
function readPeacock(cwd, prev) {
  const file = peacockFile(cwd);
  if (!file) return prev && !prev.file ? prev : { file: null, mtime: 0, color: null };
  let mtime = 0;
  try { mtime = statSync(file).mtimeMs; } catch { return { file: null, mtime: 0, color: null }; }
  if (prev && prev.file === file && prev.mtime === mtime) return prev;
  let color = null;
  try {
    const txt = readFileSync(file, 'utf8');
    const m = txt.match(/"peacock\.color"\s*:\s*"(#[0-9a-fA-F]{6})/) || txt.match(/"activityBar\.background"\s*:\s*"(#[0-9a-fA-F]{6})/);
    color = m ? m[1].toLowerCase() : null;
  } catch {}
  return { file, mtime, color };
}
function peacockCwds() {
  const out = new Set();
  for (const s of sessions.values()) { const c = s.live?.cwd || s.cwd; if (c) out.add(c); }
  for (const p of Object.values(projects)) for (const c of p.cwds || []) out.add(c);
  for (const k of pinned) if (k.startsWith('/')) out.add(k);
  return out;
}
const peacockColors = () => Object.fromEntries([...peacock].map(([c, v]) => [c, v.color]));
// The folder's repository on GitHub, from `git remote get-url origin` — ⌥⌘G opens it when the chat mentions no PR
// (2026-09-20). Asked once per folder the board knows, again after an hour; a change reaches every page as a `repos`
// event. A folder that is no git checkout, or whose origin is not GitHub, has none.
const repos = new Map();   // cwd -> { url, at }
const REPO_TTL_MS = 60 * 60_000;
const ghRepoUrl = remote => { const m = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?\s*$/.exec(String(remote)); return m ? `https://github.com/${m[1]}/${m[2]}` : null; };
const repoUrls = () => Object.fromEntries([...repos].filter(([, v]) => v.url).map(([c, v]) => [c, v.url]));
function pollRepos() {
  const want = peacockCwds(); let changed = false;
  for (const c of [...repos.keys()]) if (!want.has(c)) { repos.delete(c); changed = true; }
  const due = [...want].filter(c => !repos.has(c) || Date.now() - repos.get(c).at > REPO_TTL_MS);
  if (!due.length) { if (changed) broadcast('repos', { repos: repoUrls() }); return; }
  let left = due.length;
  for (const cwd of due) {
    const prev = repos.get(cwd); repos.set(cwd, { url: prev?.url || null, at: Date.now() });   // claimed: not asked twice while git answers
    execFile('git', ['-C', cwd, 'remote', 'get-url', 'origin'], { timeout: 5000 }, (err, out) => {
      const url = err ? null : ghRepoUrl(out);
      if ((prev?.url || null) !== url) changed = true;
      repos.set(cwd, { url, at: Date.now() });
      if (--left === 0 && changed) broadcast('repos', { repos: repoUrls() });
    });
  }
}
function pollPeacock() {
  const want = peacockCwds();
  let changed = false;
  for (const c of [...peacock.keys()]) if (!want.has(c)) { peacock.delete(c); changed = true; }
  for (const c of want) {
    const prev = peacock.get(c), next = readPeacock(c, prev);
    if (next === prev) continue;
    peacock.set(c, next);
    if ((prev?.color ?? null) !== next.color) changed = true;
  }
  if (changed) broadcast('peacock', { colors: peacockColors() });
}
// ---- Setting Peacock's colour from the board: the file pollPeacock() reads — the nearest .vscode/settings.json
// at or above the folder — or a new one in the folder itself. A text edit, never a JSON rewrite: settings.json
// is JSONC, and its other keys, comments and formatting must come out as they went in. Peacock re-applies the
// workbench colours when peacock.color changes (its configuration watcher), so the VS Code window follows;
// the board follows through the poll, forced right after the write.
function writePeacock(cwd, color) {   // color '#rrggbb', or null to take the key out
  const file = peacockFile(cwd) || join(cwd, '.vscode', 'settings.json');
  let txt = '';
  try { txt = readFileSync(file, 'utf8'); } catch {}
  const keyLine = /^[ \t]*"peacock\.color"\s*:\s*"[^"]*"\s*,?[ \t]*(?:\r?\n|$)/m;
  const keyInline = /"peacock\.color"\s*:\s*"[^"]*"\s*,?\s*/;
  if (color) {
    if (keyInline.test(txt)) txt = txt.replace(/("peacock\.color"\s*:\s*")[^"]*(")/, `$1${color}$2`);
    else if (!txt.trim()) txt = `{\n  "peacock.color": "${color}"\n}\n`;
    else {
      const i = txt.indexOf('{');
      if (i < 0) throw new Error(`${file} does not look like a JSON object`);
      const rest = txt.slice(i + 1), empty = /^\s*}/.test(rest);
      txt = txt.slice(0, i + 1) + `\n  "peacock.color": "${color}"` + (empty ? (/^\s*\n/.test(rest) ? '' : '\n') : ',') + rest;
    }
  } else {
    if (!keyInline.test(txt)) return { file, changed: false };
    txt = keyLine.test(txt) ? txt.replace(keyLine, '') : txt.replace(keyInline, '');
    txt = txt.replace(/,(\s*)}/, '$1}');   // the comma the key used to follow, if it was the last property
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, txt);
  return { file, changed: true };
}
// ---- attachments: a file dropped on the board from a browser ---------------------------------
// The Mac app hands a dropped file's *path* to the page (the shell sees the pasteboard); a plain browser
// only ever gets the bytes, so the page uploads them here and gets a path back to hand to claude as an
// @-mention. Saved beside the state file, per chat, the name kept (deduplicated); never cleaned up.
const ATTACH_DIR = join(dirname(STATE_FILE), 'attachments');
const ATTACH_MAX = 50 * 1024 * 1024;
function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > max) { req.destroy(); reject(new Error('too large')); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function saveAttachment(sid, name, buf) {
  const dir = join(ATTACH_DIR, /^[\w-]{1,80}$/.test(sid) ? sid : 'inbox');
  mkdirSync(dir, { recursive: true });
  const clean = (basename(name || 'file').replace(/[^\w.() -]+/g, '_').replace(/^\.+/, '') || 'file').slice(0, 120);
  const dot = clean.lastIndexOf('.'), stem = dot > 0 ? clean.slice(0, dot) : clean, ext = dot > 0 ? clean.slice(dot) : '';
  let file = join(dir, clean);
  for (let i = 2; existsSync(file); i++) file = join(dir, `${stem}-${i}${ext}`);
  writeFileSync(file, buf);
  return file;
}
const gitTracked = file => new Promise(resolve => execFile('git', ['-C', dirname(file), 'ls-files', '--error-unmatch', file], { timeout: 5000 }, err => resolve(!err)));

const projectList = () => Object.values(projects).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
// name: non-empty, one line; cwds: absolute paths, deduplicated. Nothing checks they exist — a project
// can name a folder before its first chat runs there.
function projectInput(body, prev = {}) {
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 80) : prev.name;
  if (!name) return { error: 'a project needs a name' };
  const cwds = body.cwds === undefined ? prev.cwds : Array.isArray(body.cwds) ? [...new Set(body.cwds.filter(c => typeof c === 'string' && c.startsWith('/')).map(c => c.replace(/\/+$/, '') || '/'))] : null;
  if (!cwds) return { error: 'cwds must be a list of absolute paths' };
  return { name, cwds };
}

function newSession(id, file) {
  return {
    id, file,
    slug: file ? basename(dirname(file)) : null,
    cwd: null, gitBranch: null, model: null,
    title: null, customTitle: null, lastPrompt: null, lastReply: null, prs: [],
    status: 'unknown', statusSince: null, lastActivity: null, lastUserAt: null, lastReplyAt: null,
    live: null, alive: false, entrypoint: null, entrypointAt: null,   // last 'entrypoint' a user/assistant line carried ('claude-vscode' | 'cli'), and when
    rivals: [],   // other live processes on this chat (registry entries beyond `live`) — see inVsCode()
    entries: [], entryCount: 0, loaded: false,
    offset: 0, partial: '', truncatedHead: false,
    pendingNotify: null, notifyTimer: null, pushTimer: null, newEntries: [],
    lastHook: null,
    replying: null, replyError: null
  };
}

// Where a chat lives: the registry's entry point while it runs, else the last one its transcript
// recorded. Every line the CLI writes carries it, so a chat that was ever continued in VS Code says so
// at its tail, and one taken to a terminal with `claude --resume` stops saying so.
function inVsCode(s) { return (s.live?.entrypoint || s.entrypoint) === 'claude-vscode'; }

// Whether the chat is blocked on you, in Claude Code's own words: every interactive claude writes `status`
// (busy · idle · waiting · shell) to its registry file on each change, and `waitingFor` while it is waiting —
// "input needed" for an AskUserQuestion (measured), "permission prompt" for a tool's approval, "sandbox request"…
// The transcript cannot say it: the assistant line that asks is written *with the answer*, not when the question
// goes up (2026-09-22 — the needs-input alerts in the app's log were a second after each answer, and the card never
// blinked while it mattered). A permission prompt never reaches the transcript at all. So: the waitingFor of any
// live process on the chat that is waiting, null when they report and none is, undefined when none reports (a
// claude from before the field) — and then the transcript's word stands. "dialog open" is left out: it is mostly a
// slash command's dialog you opened yourself (/model, /config), at that terminal already (Ricardo, 2026-09-23).
const NOT_ASKING = new Set(['dialog open']);
function waitingOn(s) {
  if (!s.alive) return undefined;
  const procs = [s.live, ...s.rivals].filter(p => p?.status);
  if (!procs.length) return undefined;
  const w = procs.find(p => p.status === 'waiting' && !NOT_ASKING.has(p.waitingFor));
  return w ? w.waitingFor || 'a prompt' : null;
}

function statusOf(s) {
  if (!s.alive) return s.status === 'unknown' ? 'unknown' : 'stale';
  const waiting = waitingOn(s);
  if (waiting || (waiting === undefined && s.status === 'needs-input')) return 'needs-input';   // a question beats the agents' work
  if (s.agentsRunning) return 'working';
  if (s.status === 'unknown' && !s.file) return 'idle';
  if (s.status === 'needs-input') return s.live?.status === 'busy' ? 'working' : 'idle';   // the registry has it answered already
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

function summary(s) {
  const prT = prTitle(s), status = statusOf(s);
  return {
    // Prefer the registry cwd: transcript lines record the shell's *current* directory, which moves with `cd`.
    id: s.id, slug: s.slug, cwd: s.live?.cwd || s.cwd, project: basename(s.live?.cwd || s.cwd || '') || s.slug,
    gitBranch: s.gitBranch, model: s.model,
    // The PR title beats Claude's own: it is what the work is called everywhere else — the PR page, the
    // branch, standup. A title the user typed still wins over both.
    title: titles[s.id] || s.customTitle || prT || s.title || s.lastPrompt || (!s.file && s.alive ? '(no messages yet)' : '(untitled)'),
    aiTitle: s.title, customTitle: s.customTitle, prTitle: prT, boardTitle: titles[s.id] || null,
    lastPrompt: s.lastPrompt, lastReply: s.lastReply, prs: s.prs,
    // A live process with no transcript yet is an empty, idle panel (e.g. restored by VS Code, never prompted).
    // Not alive = the Claude process is gone: 'stale'. Resuming the chat registers a new pid and it comes back.
    status,
    agents: s.agentsRunning || 0,   // sub-agents at work — what keeps the status 'working' past the main turn's end
    tasks: runningTasks(s),         // monitors and background commands still running behind the turn
    // the question it is waiting on and which tool asked, when the transcript has it; else only what the registry
    // says it is waiting for — the question itself is written with its answer (see waitingOn)
    ask: status !== 'needs-input' ? null : s.status === 'needs-input' && s.ask ? s.ask : { tool: null, text: null, options: 0, waitingFor: waitingOn(s) || null },
    rawStatus: s.status, statusSince: s.statusSince, lastActivity: s.lastActivity,
    lastUserAt: s.lastUserAt, lastReplyAt: s.lastReplyAt,
    alive: s.alive, live: s.live, entrypoint: s.live?.entrypoint || s.entrypoint, terminal: termSummary(termOf(s)), shell: termSummary(shellOf(s)), entryCount: s.entryCount, loaded: s.loaded, file: s.file, lastHook: s.lastHook,
    env: envs[s.id] || termOf(s)?.task || null,   // the launcher it was started with (⌥⌘O groups oracle's chats by it)
    // the other live processes on this chat, and who wrote its last turn — the page's "VS Code too" warning
    rivals: s.rivals, tailEntrypoint: s.entrypoint, tailEntrypointAt: s.entrypointAt,
    done: isDone(s), doneAt: doneMarks[s.id] || null,
    replying: s.replying, replyError: s.replyError
  };
}

// ---------------------------------------------------------------------------------------------
// Transcript parsing
// ---------------------------------------------------------------------------------------------

const SYNTHETIC_RE = /^\s*<(local-command|command-name|command-message|command-args|bash-input|bash-stdout|bash-stderr|user-memory-input|system-reminder|task-notification)\b/;
const STRIP_RE = /<(system-reminder|ide_selection|ide_opened_file)>[\s\S]*?<\/\1>/g;

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(b => b?.type === 'text').map(b => b.text || '').join('\n');
}

function cleanPrompt(text) {
  return text.replace(STRIP_RE, '').trim();
}

function snippet(text, n = 240) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function summarizeToolInput(name, input = {}) {
  try {
    switch (name) {
      case 'Bash': return input.description || (input.command || '').split('\n')[0];
      case 'Read': case 'Edit': case 'Write': case 'NotebookEdit': return input.file_path || '';
      case 'Grep': case 'Glob': return `${input.pattern || ''}${input.path ? '  in ' + input.path : ''}`;
      case 'Agent': return input.description || snippet(input.prompt, 100);
      case 'WebFetch': return input.url || '';
      case 'WebSearch': return input.query || '';
      case 'AskUserQuestion': return input.questions?.[0]?.question || '';
      case 'Skill': return input.skill || '';
      case 'SendMessage': return `to ${input.to || '?'}: ${snippet(input.message, 80)}`;
      default: return snippet(JSON.stringify(input), 140);
    }
  } catch { return ''; }
}

function resultText(block) {
  const c = block.content;
  return typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join('\n') : '';
}
function toolResultSnippet(block) { return snippet(resultText(block), 200); }

// ---- PRs mentioned in the chat ------------------------------------------------------------
// Claude Code writes a `pr-link` line when it opens one, but most PRs are just URLs someone typed
// or Claude wrote, so message text is scanned too. Only message text: tool results are snipped to
// 200 chars and half a URL would name the wrong PR.
const PR_RE = /https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/g;
const PR_ONE = new RegExp(PR_RE.source);   // same pattern, no /g — safe to reuse for a single match
const MAX_PRS = 40;

/**
 * Record one sighting: `by` is who said it ('user' / 'claude'), or null for a `pr-link` line — Claude
 * Code writes several of those per PR, so they order the list and date it but do not count as mentions.
 * Most recently mentioned first, so the header leads with the PR in play now.
 */
function notePr(s, url, ts, by) {
  const m = PR_ONE.exec(url);
  const clean = m ? `https://github.com/${m[1]}/${m[2]}/pull/${m[3]}` : url;
  const at = s.prs.findIndex(p => p.url === clean);
  const pr = at >= 0 ? s.prs.splice(at, 1)[0] : {
    url: clean, repo: m ? m[2] : null, number: m ? Number(m[3]) : null,
    // The owner rarely disambiguates and eats half the width of the chip; the URL is in the tooltip.
    label: m ? `${m[2]}#${m[3]}` : clean.replace(/^https?:\/\/(www\.)?github\.com\//, ''),
    count: 0, by: null, firstAt: ts,
    state: prStatus.get(clean)?.state ?? null, title: prStatus.get(clean)?.title ?? null
  };
  if (by) { pr.count++; pr.by = by; }
  pr.lastAt = ts || pr.lastAt || null;
  s.prs.unshift(pr);
  if (s.prs.length > MAX_PRS) s.prs.length = MAX_PRS;
  if (!indexing) queuePr(clean);   // at boot this would ask GitHub about every PR in every transcript
}

/** Scan one message. Repeats inside the same message count once. */
function notePrs(s, text, ts, by) {
  if (!text || !text.includes('/pull/')) return;
  const seen = new Set();
  for (const m of String(text).matchAll(PR_RE)) {
    const url = `https://github.com/${m[1]}/${m[2]}/pull/${m[3]}`;
    if (!seen.has(url)) { seen.add(url); notePr(s, url, ts, by); }
  }
}

/**
 * Which PR names the chat. Several can come up in one conversation, and the oldest one still open is
 * the one being worked on: the later ones are usually references — the PR this one follows, the one it
 * conflicts with — while merged and closed are finished business. When none is open the oldest wins
 * anyway, so a card keeps its title through the merge instead of flipping back to Claude's. Titles
 * arrive from `gh` with the state, so this is null until that lands.
 */
function prTitle(s) {
  const titled = s.prs.filter(p => p.title);
  if (!titled.length) return null;
  const open = titled.filter(p => p.state === 'open' || p.state === 'draft');
  return (open.length ? open : titled)
    .reduce((a, b) => (String(a.firstAt || '') <= String(b.firstAt || '') ? a : b)).title;
}

// ---- …and whether they are open, merged or closed --------------------------------------------
// The transcript never says, so the colour comes from GitHub through `gh` — the user's own
// authenticated CLI, which reads its token from its config and so works from the app's bare
// launchd environment too. Lazy: statuses are fetched when a chat is opened and when a PR comes up
// live, never for the whole history at boot. One GraphQL call covers a whole batch.
const PR_TTL_MS = Number(process.env.PR_TTL_MS || 10 * 60_000);
const PR_TTL_ERROR_MS = 60 * 60_000;   // a PR we cannot see (private, deleted, no access): back off
const PR_BATCH = 40;
const prStatus = new Map();            // url -> { state, title, checkedAt }
const prQueue = new Set();
let prTimer = null, prBusy = false, ghGone = false;

/** Merged and closed are terminal — never asked about twice. */
function prFresh(url) {
  const e = prStatus.get(url);
  if (!e) return false;
  if (e.state === 'merged' || e.state === 'closed') return true;
  return Date.now() - e.checkedAt < (e.state ? PR_TTL_MS : PR_TTL_ERROR_MS);
}

function queuePr(url) {
  if (ghGone || prQueue.has(url) || prFresh(url)) return;
  prQueue.add(url);
  prTimer ??= setTimeout(() => { prTimer = null; drainPrQueue(); }, 250);
}

/** Whatever a chat's header and card will show, refreshed if it has aged out. */
function queueSessionPrs(s) { for (const pr of s.prs) queuePr(pr.url); }

function setPrInfo(url, state, title) {
  prStatus.set(url, { state, title, checkedAt: Date.now() });
  for (const s of sessions.values()) {
    const pr = s.prs.find(p => p.url === url);
    if (pr && (pr.state !== state || pr.title !== title)) { pr.state = state; pr.title = title; schedulePush(s); }
  }
}

function drainPrQueue() {
  if (prBusy || !prQueue.size) return;
  const bin = ghBin();
  if (!bin) { ghGone = true; prQueue.clear(); return; }
  const take = [...prQueue].slice(0, PR_BATCH);
  const batch = [], parts = [];
  for (const url of take) {
    prQueue.delete(url);
    const m = PR_ONE.exec(url);
    if (!m) continue;
    // owner/repo/number came out of PR_RE, so they cannot break out of the query string
    parts.push(`p${batch.length}: repository(owner: "${m[1]}", name: "${m[2]}") { pullRequest(number: ${m[3]}) { title state isDraft } }`);
    batch.push(url);
  }
  if (!batch.length) return drainPrQueue();
  prBusy = true;
  execFile(bin, ['api', 'graphql', '-f', `query={${parts.join(' ')}}`], { timeout: 30_000, maxBuffer: 8e6 }, (err, stdout, stderr) => {
    prBusy = false;
    // A PR we cannot resolve fails its own alias only: gh exits non-zero but still prints the rest.
    let data = null;
    try { data = JSON.parse(stdout || '{}').data; } catch {}
    if (!data && err) console.error('[peixairada] pr status:', String(stderr || err.message).trim().split('\n')[0].slice(0, 200));
    batch.forEach((url, i) => {
      const pr = data?.[`p${i}`]?.pullRequest;
      const state = !pr ? null
        : pr.state === 'MERGED' ? 'merged'
        : pr.state === 'CLOSED' ? 'closed'
        : pr.isDraft ? 'draft' : 'open';
      setPrInfo(url, state, pr?.title || null);
    });
    if (prQueue.size) drainPrQueue();
  });
}

function setStatus(s, status, ts) {
  if (s.status !== status) {
    s.status = status;
    s.statusSince = ts || new Date().toISOString();
  }
}

function pushEntry(s, entry) {
  s.entryCount++;
  if (!s.loaded) return;
  s.entries.push(entry);
  if (s.entries.length > MAX_ENTRIES) s.entries.splice(0, s.entries.length - MAX_ENTRIES);
  s.newEntries.push(entry);
}

const NEEDS_INPUT_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']);

/** Fold one JSONL line into the session. Returns true if the session summary changed. */
function fold(s, line) {
  const ts = line.timestamp || null;
  switch (line.type) {
    case 'ai-title': if (line.aiTitle) s.title = line.aiTitle; return true;
    case 'custom-title': s.customTitle = line.customTitle || line.title || null; return true;
    case 'last-prompt': if (!s.lastPrompt && line.lastPrompt) s.lastPrompt = line.lastPrompt; return true;
    case 'pr-link': {
      const url = line.prUrl || line.url;
      if (url) notePr(s, url, ts, null);
      return true;
    }
    case 'system':
      if (line.subtype === 'compact_boundary') pushEntry(s, { role: 'system', kind: 'compact', text: 'Conversation compacted', ts });
      return false;
    case 'user': {
      if (line.isSidechain) return false;
      if (line.cwd) s.cwd = line.cwd;
      if (line.entrypoint) { s.entrypoint = line.entrypoint; s.entrypointAt = ts; }
      if (line.gitBranch) s.gitBranch = line.gitBranch;
      if (line.isMeta || line.isCompactSummary) return false;
      const content = line.message?.content;
      const blocks = Array.isArray(content) ? content : null;
      const toolResults = blocks ? blocks.filter(b => b?.type === 'tool_result') : [];
      if (toolResults.length) {
        for (const b of toolResults) { startTask(s, b, ts); pushEntry(s, { role: 'user', kind: 'tool_result', toolUseId: b.tool_use_id, isError: !!b.is_error, text: toolResultSnippet(b), ts }); }
        s.lastActivity = ts;
        if (s.status === 'needs-input') {   // question answered — that was you
          s.lastUserAt = ts; setStatus(s, 'working', ts);
          // …and the question's line arrived with its answer (see waitingOn): an alert for it now would be after the fact
          if (s.pendingNotify === 'needs-input') s.pendingNotify = null;
        }
        return true;
      }
      const raw = textOf(content);
      if (raw.startsWith('[Request interrupted')) {
        pushEntry(s, { role: 'user', kind: 'interrupt', text: raw, ts });
        s.lastActivity = ts; s.lastUserAt = ts;   // Escape is you acting on the chat too
        setStatus(s, 'idle', ts);
        return true;
      }
      // The reminder blocks go first: Claude Code puts them at the head of the user's own text, and a prompt that
      // follows one is a prompt (the test that caught it: 2026-09-20). Only what remains is judged synthetic.
      const text = cleanPrompt(raw);
      if (!text) return false;
      if (TASK_NOTE_RE.test(text)) return noteTaskEvent(s, text, ts);   // a monitor's event, or the end of one
      if (SYNTHETIC_RE.test(text)) return false;
      pushEntry(s, { role: 'user', kind: 'text', text, ts, uuid: line.uuid });
      notePrs(s, text, ts, 'user');
      s.lastPrompt = snippet(text, 200);
      s.lastActivity = ts; s.lastUserAt = ts;
      setStatus(s, 'working', ts);
      return true;
    }
    case 'assistant': {
      if (line.isSidechain) return false;
      if (line.cwd) s.cwd = line.cwd;
      if (line.entrypoint) { s.entrypoint = line.entrypoint; s.entrypointAt = ts; }
      const m = line.message || {};
      const blocks = Array.isArray(m.content) ? m.content : [];
      if (m.model) s.model = m.model;
      let needsInput = false;
      for (const b of blocks) {
        if (b.type === 'text' && b.text?.trim()) { pushEntry(s, { role: 'assistant', kind: 'text', text: b.text, ts, msgId: m.id }); notePrs(s, b.text, ts, 'claude'); }
        else if (b.type === 'tool_use') {
          pushEntry(s, { role: 'assistant', kind: 'tool_use', name: b.name, text: summarizeToolInput(b.name, b.input), toolUseId: b.id, ts });
          if (NEEDS_INPUT_TOOLS.has(b.name)) { needsInput = true; s.ask = { tool: b.name, text: summarizeToolInput(b.name, b.input), options: b.input?.questions?.[0]?.options?.length || 0 }; }
          if (b.name === 'Monitor' || (b.name === 'Bash' && b.input?.run_in_background)) noteTaskCall(s, b);
          if (b.name === 'TaskStop' && s.tasks?.size) { const j = JSON.stringify(b.input || ''); for (const id of [...s.tasks.keys()]) if (j.includes(id)) s.tasks.delete(id); }
        }
      }
      s.lastActivity = ts;
      if (m.stop_reason === 'end_turn' || m.stop_reason === 'stop_sequence') {
        const text = textOf(blocks).trim();
        if (text) { s.lastReply = snippet(text, 300); s.lastReplyAt = ts; }
        setStatus(s, 'idle', ts);
        if (!s.agentsRunning) queueNotify(s, 'reply');   // a turn that ends with agents still at work is not the reply yet
      } else if (needsInput) {
        setStatus(s, 'needs-input', ts);
        queueNotify(s, 'needs-input');
      } else if (m.stop_reason === 'tool_use') {
        setStatus(s, 'working', ts);
      }
      return true;
    }
    default:
      return false;
  }
}

function parseLines(text, onLine) {
  for (const raw of text.split('\n')) {
    if (!raw) continue;
    let line;
    try { line = JSON.parse(raw); } catch { continue; }
    onLine(line);
  }
}

/** Read the tail (or all) of a transcript and rebuild the session from it. */
function indexFile(file, { full = false } = {}) {
  let st;
  try { st = statSync(file); } catch { return null; }
  const id = basename(file, '.jsonl');
  const prev = sessions.get(id);
  const s = newSession(id, file);
  if (prev) { s.live = prev.live; s.rivals = prev.rivals; s.alive = prev.alive; s.lastHook = prev.lastHook; }
  const start = full || st.size <= TAIL_BYTES ? 0 : st.size - TAIL_BYTES;
  s.loaded = start === 0 || full;
  s.truncatedHead = start > 0;
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(st.size - start);
    readSync(fd, buf, 0, buf.length, start);
    let text = buf.toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1); // drop partial first line
    const nl = text.lastIndexOf('\n');
    s.partial = text.slice(nl + 1);
    parseLines(text.slice(0, nl + 1), line => fold(s, line));
  } finally { closeSync(fd); }
  s.offset = st.size;
  s.newEntries = []; // initial load: nothing is "new"
  if (!s.cwd && prev?.cwd) s.cwd = prev.cwd;
  sessions.set(id, s);
  fileToSession.set(file, id);
  return s;
}

/** Called on fs events: read what was appended since the last offset. */
function tailFile(file) {
  const id = fileToSession.get(file);
  const s = id && sessions.get(id);
  if (!s) { const ns = indexFile(file); if (ns) { applyLiveness(ns); schedulePush(ns); } return; }
  let st;
  try { st = statSync(file); } catch { return; }
  if (st.size < s.offset) { const ns = indexFile(file, { full: s.loaded }); if (ns) { applyLiveness(ns); schedulePush(ns); } return; }
  if (st.size === s.offset) return;
  const fd = openSync(file, 'r');
  let text;
  try {
    const buf = Buffer.alloc(st.size - s.offset);
    readSync(fd, buf, 0, buf.length, s.offset);
    text = s.partial + buf.toString('utf8');
  } finally { closeSync(fd); }
  s.offset = st.size;
  const nl = text.lastIndexOf('\n');
  s.partial = text.slice(nl + 1);
  let changed = false;
  parseLines(text.slice(0, nl + 1), line => { if (fold(s, line)) changed = true; });
  if (changed || s.newEntries.length) schedulePush(s);
}

// ---------------------------------------------------------------------------------------------
// Sub-agents: <slug>/<id>/subagents/agent-*.jsonl — one at work keeps the chat clauding
// ---------------------------------------------------------------------------------------------
// Claude Code writes each sub-agent's transcript beside the session's (every line isSidechain, a .meta.json with
// requestShape 'background' or not). A foreground agent holds the main transcript at a tool_use, so the chat stays
// working; a background one answers at once and the main turn ends — the card went ready while agents worked
// (Ricardo, 2026-09-20: "sub-agents don't make the animation for the card work"). An agent's last line says
// whether it is done: an assistant end_turn. One that went quiet AGENT_STALE_MS ago is not counted (a killed agent
// never writes its end_turn). Only the status is touched — not the order, not the transcript, not the alerts
// beyond holding the 'reply' one back until the agents are done.
const AGENT_STALE_MS = Number(process.env.AGENT_STALE_MS || 15 * 60_000);
function agentRunning(file, now = Date.now()) {
  let st; try { st = statSync(file); } catch { return false; }
  if (now - st.mtimeMs > AGENT_STALE_MS || !st.size) return false;
  const len = Math.min(st.size, 65536), buf = Buffer.alloc(len);
  const fd = openSync(file, 'r'); try { readSync(fd, buf, 0, len, st.size - len); } finally { closeSync(fd); }
  const lines = buf.toString('utf8').trim().split('\n');
  let last; try { last = JSON.parse(lines[lines.length - 1]); } catch { return true; }   // a line still being written: at work
  return !(last.type === 'assistant' && (last.message?.stop_reason === 'end_turn' || last.message?.stop_reason === 'stop_sequence'));
}
const agentsDir = s => s.file ? join(dirname(s.file), s.id, 'subagents') : null;
function scanAgents(s) {
  const dir = agentsDir(s); let names = [];
  if (dir) try { names = readdirSync(dir); } catch {}
  const running = names.filter(n => n.endsWith('.jsonl') && agentRunning(join(dir, n))).length;
  if (running !== (s.agentsRunning || 0)) { s.agentsRunning = running; schedulePush(s); }
}

// ---- background tasks: a monitor, or a command left running -------------------------------------------------
// Claude Code can leave work running behind the turn: `Monitor` watches something and wakes the chat on each event,
// and a Bash with `run_in_background` runs on and reports when it exits. Both were invisible here — the turn ends,
// the card goes ready — and both are the difference between a chat that is finished and one that is *waiting*
// (2026-09-21, Ricardo: "a monitor is still running"). The transcript says all of it: the tool_result of the call
// carries the task's id ("Monitor started (task bs6h9ok2c, expires in 30m…", "Command running in background with
// ID: b3b928ii6"), and every event and the end arrive as `<task-notification>` user lines — synthetic for the
// transcript, read here for their `<task-id>` and the `<status>` that ends one. Nothing is polled: a task that
// outlives the claude that started it (`live.startedAt`) or its own expiry is simply not running any more.
const TASK_ID_RE = [[/Monitor started \(task ([a-z0-9]+)/i, 'monitor'], [/Command running in background with ID: ([a-z0-9]+)/i, 'bash']];
const TASK_NOTE_RE = /^<task-notification>/;
const MONITOR_MS = Number(process.env.MONITOR_MS || 30 * 60_000);      // what a Monitor gives itself when it says nothing else
const TASK_MAX_MS = Number(process.env.TASK_MAX_MS || 6 * 60 * 60_000); // a background command whose end never reached the transcript

/** The call: remembered by tool_use id until its result comes back with the task id the harness gave it. */
function noteTaskCall(s, b) {
  s.taskCalls ||= new Map();
  const ms = Number(b.input?.timeout_ms) || (b.name === 'Monitor' ? MONITOR_MS : 0);
  s.taskCalls.set(b.id, { kind: b.name === 'Monitor' ? 'monitor' : 'bash', what: snippet(b.input?.description || b.input?.command || '', 90), ms });
  while (s.taskCalls.size > 40) s.taskCalls.delete(s.taskCalls.keys().next().value);
}
/** Its result: "…(task <id>" / "…ID: <id>" — from here on that id is something running in this chat. A background
 *  command also says where its output goes, and that file is what `sweepTasks` asks about. */
function startTask(s, res, ts) {
  const hint = s.taskCalls?.get(res.tool_use_id); if (!hint) return;
  s.taskCalls.delete(res.tool_use_id);
  const body = resultText(res);
  for (const [re, kind] of TASK_ID_RE) {
    const m = re.exec(body); if (!m) continue;
    const at = Date.parse(ts) || Date.now();
    const out = /Output is being written to:\s*(\S+?)\.?(?:\s|$)/.exec(body)?.[1] || null;
    (s.tasks ||= new Map()).set(m[1], { kind: hint.kind || kind, what: hint.what, at: ts, until: hint.ms ? at + hint.ms : null, events: 0, out });
    return;
  }
}

/**
 * Whether a background command is still running, asked of the machine rather than of the transcript: the harness
 * spawns it with its output redirected to `tasks/<id>.output` and holds that file open until it exits, so `lsof`
 * on the file answers plainly (measured: two holders while it runs, none the moment it ends). This is what the
 * transcript cannot do — a completion notice delivered to a chat that is *mid-turn* never becomes a line in the
 * file, and the task would otherwise sit on the card until TASK_MAX_MS (the board's own chat wore one for half an
 * hour, 2026-09-21). Only for the first seconds is it unasked: the file exists before the process has opened it.
 */
const TASK_GRACE_MS = Number(process.env.TASK_GRACE_MS || 20_000);
function taskGone(t) {
  return new Promise(resolve => {
    if (!t.out || Date.now() - (Date.parse(t.at) || 0) < TASK_GRACE_MS) return resolve(false);
    if (!existsSync(t.out)) return resolve(false);          // not written yet, or cleaned up: no verdict from here
    const bin = findBin('lsof', 'a background command is only let go by its notification or its age');
    if (!bin) return resolve(false);
    execFile(bin, ['-t', '-w', '--', t.out], { timeout: 15_000 }, (err, stdout) => {
      if (err && err.code !== 1) {                           // 1 is lsof's "nobody has it"; anything else is our problem
        // lsof reads every process on the Mac, so on a loaded one it takes seconds — and a run killed by the
        // timeout is not an answer, it just looks like "still running". Say so, or the chip sits on the card
        // with nothing in the log to explain it.
        if (err.killed || err.signal) console.log(`[peixairada] task ${t.what || '?'}: lsof did not answer in time — leaving it running`);
        return resolve(false);
      }
      resolve(!String(stdout).trim());
    });
  });
}
/** The poll's half of the pruning: the dead let go, and a push if any were. */
async function sweepTasks(s) {
  if (!s.tasks?.size) return;
  for (const [id, t] of [...s.tasks]) if (await taskGone(t) && s.tasks.get(id) === t) { s.tasks.delete(id); console.log(`[peixairada] task ${id} (${t.what}) is no longer running`); schedulePush(s); }
}
/** A `<task-notification>`: an event while it runs, and with a `<status>` (completed, failed, stopped) its end. */
function noteTaskEvent(s, text, ts) {
  const id = /<task-id>([^<]+)<\/task-id>/.exec(text)?.[1];
  const t = id && s.tasks?.get(id);
  if (!t) return false;
  if (/<status>/.test(text)) { s.tasks.delete(id); return true; }
  t.events++; t.lastEventAt = ts;
  return true;
}
/** What is still running, and the pruning of what is not: a dead claude takes its tasks with it. */
function runningTasks(s) {
  if (!s.tasks?.size) return [];
  if (!s.alive) { s.tasks.clear(); return []; }
  const now = Date.now(), since = Number(s.live?.startedAt) || 0;
  const out = [];
  for (const [id, t] of s.tasks) {
    const at = Date.parse(t.at) || 0;
    if (at < since || now - at > TASK_MAX_MS || (t.until && now > t.until)) { s.tasks.delete(id); continue; }
    out.push({ id, kind: t.kind, what: t.what, at: t.at, until: t.until ? new Date(t.until).toISOString() : null, events: t.events, lastEventAt: t.lastEventAt || null });
  }
  return out;
}

function scanProjects() {
  if (!existsSync(PROJECTS_DIR)) return;
  for (const slug of readdirSync(PROJECTS_DIR)) {
    const dir = join(PROJECTS_DIR, slug);
    let names;
    try { names = readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      indexFile(join(dir, name));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Live-session registry (~/.claude/sessions/<pid>.json)
// ---------------------------------------------------------------------------------------------

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function applyLiveness(s) {
  const wasAlive = s.alive;
  s.alive = !!(s.live && pidAlive(s.live.pid));
  return wasAlive !== s.alive;
}

function loadRegistry() {
  if (!existsSync(SESSIONS_DIR)) return;
  const found = new Map();   // sessionId -> its registry entries, one per pid
  for (const name of readdirSync(SESSIONS_DIR)) {
    if (!name.endsWith('.json')) continue;
    let reg;
    try { reg = JSON.parse(readFileSync(join(SESSIONS_DIR, name), 'utf8')); } catch { continue; }
    if (!reg.sessionId) continue;
    if (!found.has(reg.sessionId)) found.set(reg.sessionId, []);
    found.get(reg.sessionId).push({ pid: reg.pid, name: reg.name, entrypoint: reg.entrypoint, kind: reg.kind, cwd: reg.cwd, startedAt: reg.startedAt, version: reg.version,
      status: reg.status, waitingFor: reg.status === 'waiting' ? reg.waitingFor : undefined });   // what it is doing, and what it waits on (waitingOn)
  }
  const ppids = [...terms.values()].some(t => t.task && !t.sessionId && t.exited === null) ? parentPids() : null;   // a launcher's claude is below the PTY's pid
  for (const [id, lives] of found) {
    let s = sessions.get(id);
    if (!s) { s = newSession(id, null); sessions.set(id, s); }
    for (const l of lives) linkTermToRegistry(l.pid, s, ppids);   // a new chat's terminal learns its session id here
    // Several processes can hold one chat: VS Code mounts a chat twice on its own, or reopens one that was
    // taken over here. The chat's process is the drawer's own when there is one, else the newest live one
    // that is not VS Code's (the one you are driving), else the newest live one, else whatever is left (a
    // dead pid's file lingers until claude's housekeeping). The rest, live only, are its rivals.
    const mine = [...terms.values()].filter(t => t.sessionId === id && t.exited === null).map(t => t.claudePid || t.pid)[0];
    const alive = lives.filter(l => pidAlive(l.pid)).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    const live = alive.find(l => l.pid === mine) || alive.find(l => l.entrypoint !== 'claude-vscode') || alive[0] || lives[0];
    const rivals = alive.filter(l => l !== live);
    const changed = JSON.stringify(live) !== JSON.stringify(s.live) || JSON.stringify(rivals) !== JSON.stringify(s.rivals);
    const wasWaiting = waitingOn(s);
    s.live = live; s.rivals = rivals;
    if (!s.cwd && live.cwd) s.cwd = live.cwd;
    if (applyLiveness(s) || changed) schedulePush(s);
    if (waitingOn(s) && !wasWaiting) queueNotify(s, 'needs-input');   // the moment a prompt goes up — the transcript hears of it only with the answer
  }
  for (const s of sessions.values()) {
    if (s.live && !found.has(s.id)) { s.live = null; s.rivals = []; if (applyLiveness(s)) schedulePush(s); }
    else if (s.live && applyLiveness(s)) schedulePush(s);
  }
}

// ---------------------------------------------------------------------------------------------
// Notifications + SSE fan-out
// ---------------------------------------------------------------------------------------------

function nativeNotify(title, subtitle, body) {
  if (NOTIFY !== 'native' || process.platform !== 'darwin') return;
  execFile('osascript', [
    '-e', 'on run argv',
    '-e', 'display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv) sound name "Glass"',
    '-e', 'end run',
    title, subtitle, body
  ], () => {});
}

function queueNotify(s, kind) {
  if (indexing) return;
  s.pendingNotify = kind;
  clearTimeout(s.notifyTimer);
  // Debounce: the thinking block and the text block of one reply land as separate lines.
  s.notifyTimer = setTimeout(() => fireNotify(s), 400);
}

function fireNotify(s) {
  const kind = s.pendingNotify; s.pendingNotify = null;
  if (!kind) return;
  const sum = summary(s);
  if (!sum.alive && sum.live === null && s.file && !process.env.NOTIFY_DEAD) {
    // No registry entry: most likely a non-interactive/headless run. Still surface it in the UI.
  }
  const asked = sum.ask?.text || (sum.ask?.waitingFor ? `Waiting on you: ${sum.ask.waitingFor}` : 'Waiting for your input');
  const evt = { kind, sessionId: s.id, project: sum.project, title: sum.title, name: s.live?.name || null, cwd: s.cwd, snippet: kind === 'reply' ? sum.lastReply : asked, ts: new Date().toISOString(), quiet: !notificationsOn };
  broadcast('alert', evt);
  if (notificationsOn) nativeNotify(kind === 'reply' ? `Claude replied · ${sum.project}` : `Claude needs input · ${sum.project}`, sum.title, evt.snippet || '');
}

function schedulePush(s) {
  clearTimeout(s.pushTimer);
  s.pushTimer = setTimeout(() => {
    broadcast('session', summary(s));
    if (s.newEntries.length) { broadcast('entries', { sessionId: s.id, entries: s.newEntries }); s.newEntries = []; }
  }, 80);
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(payload);
}

// ---------------------------------------------------------------------------------------------
// Hooks (optional precision): POST /hook receives Claude Code hook payloads (see hooks/hook.sh)
// ---------------------------------------------------------------------------------------------

function handleHook(h) {
  const id = h.session_id;
  if (!id) return;
  let s = sessions.get(id);
  if (!s) {
    if (h.transcript_path && existsSync(h.transcript_path)) s = indexFile(h.transcript_path);
    if (!s) { s = newSession(id, h.transcript_path || null); sessions.set(id, s); }
  }
  if (h.cwd && !s.cwd) s.cwd = h.cwd;
  const ts = new Date().toISOString();
  s.lastHook = { event: h.hook_event_name, type: h.notification_type || null, ts };
  switch (h.hook_event_name) {
    case 'UserPromptSubmit': setStatus(s, 'working', ts); break;
    case 'Stop':
      if (h.last_assistant_message) { s.lastReply = snippet(h.last_assistant_message, 300); s.lastReplyAt = ts; }
      setStatus(s, 'idle', ts); queueNotify(s, 'reply'); break;
    case 'StopFailure': setStatus(s, 'idle', ts); queueNotify(s, 'needs-input'); break;
    case 'PermissionRequest': s.ask = { tool: 'PermissionRequest', text: 'a permission prompt', options: 0 }; setStatus(s, 'needs-input', ts); queueNotify(s, 'needs-input'); break;
    case 'Notification': {
      const type = h.notification_type || '';
      const text = h.notification_text || h.message || '';
      if (type === 'permission_prompt' || type === 'agent_needs_input' || type.startsWith('elicitation') || /permission/i.test(text)) { setStatus(s, 'needs-input', ts); queueNotify(s, 'needs-input'); }
      else if (type === 'idle_prompt') setStatus(s, 'idle', ts);
      break;
    }
    case 'SessionEnd': s.alive = false; setStatus(s, 'stale', ts); break;
    case 'SessionStart': loadRegistry(); break;
  }
  schedulePush(s);
}

// ---------------------------------------------------------------------------------------------
// Replying into a session
// ---------------------------------------------------------------------------------------------

// launchd and the Mac app hand the server almost no PATH, so the CLIs we shell out to are resolved
// the way the app resolves node: PATH first, then the layouts the installers actually use.
const BIN_FALLBACKS = {
  claude: [join(homedir(), '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'],
  gh: ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', join(homedir(), '.local', 'bin', 'gh')],
  // who still holds a background command's output file open — the one honest answer to "is it still running"
  lsof: ['/usr/sbin/lsof', '/usr/bin/lsof'],
  // go-task, for the folders whose Taskfile launches claude (see launchersFor): mise's shim first, then brew and go
  task: [join(homedir(), '.local', 'share', 'mise', 'shims', 'task'), '/opt/homebrew/bin/task', '/usr/local/bin/task', join(homedir(), 'go', 'bin', 'task')],
  // "Shell Command: Install 'code' command in PATH" symlinks /usr/local/bin/code; the last two
  // entries are the binaries inside the app bundles, for when it was never run.
  code: ['/usr/local/bin/code', '/opt/homebrew/bin/code',
    '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    '/Applications/Cursor.app/Contents/Resources/app/bin/code']
};
const REPLY_TIMEOUT_MS = Number(process.env.REPLY_TIMEOUT_MS || 10 * 60_000);
const binCache = new Map();

/** `<NAME>_BIN` in the environment (CLAUDE_BIN, GH_BIN) overrides the search. */
function findBin(name, missingNote) {
  if (binCache.has(name)) return binCache.get(name);
  const found = [
    ...(process.env[`${name.toUpperCase()}_BIN`] ? [process.env[`${name.toUpperCase()}_BIN`]] : []),
    ...(process.env.PATH || '').split(':').filter(Boolean).map(d => join(d, name)),
    ...BIN_FALLBACKS[name]
  ].find(f => existsSync(f)) || null;
  binCache.set(name, found);
  if (!found) console.error(`[peixairada] ${name} not found — ${missingNote}`);
  return found;
}

// Declarations, not arrows: the PR-status code above calls ghBin().
function claudeBin() { return findBin('claude', 'replies to stale chats are disabled'); }
function ghBin() { return findBin('gh', 'PR status colours are disabled'); }

// ---- Claude plan usage, for the chat list's footer: the numbers `/usage` shows in the CLI --------------
// GET https://api.anthropic.com/api/oauth/usage with Claude Code's own OAuth token (the CLI's endpoint and
// beta header, read off the 2.1.278 binary). The token is where Claude Code keeps it — the macOS Keychain
// item "Claude Code-credentials" (the first read asks you to allow `security`; *Always Allow* ends that),
// or ~/.claude/.credentials.json elsewhere. It is used for that one request and never leaves this process:
// the browser gets percentages and reset times. The second thing here that talks to the network, after gh.
// USAGE=off disables the route (no keychain prompt, no call); answers are cached for a minute.
const usageCache = { at: 0, code: 0, body: null };
function oauthToken(cb) {
  const parse = raw => { try { const t = JSON.parse(raw)?.claudeAiOauth?.accessToken; return typeof t === 'string' && t ? t : null; } catch { return null; } };
  const file = join(CLAUDE_DIR, '.credentials.json');
  if (existsSync(file)) { try { return cb(parse(readFileSync(file, 'utf8')), 'no OAuth token in .credentials.json'); } catch (e) { return cb(null, String(e.message || e)); } }
  if (process.platform !== 'darwin') return cb(null, 'no ~/.claude/.credentials.json');
  execFile('/usr/bin/security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 60000 }, (err, out) => {
    if (err) return cb(null, /could not be found/i.test(String(err.message || err)) ? 'no Claude Code login in the keychain' : 'keychain access refused (allow `security` when asked)');
    cb(parse(out.trim()), 'the keychain item holds no OAuth token — API-key logins have no plan usage');
  });
}
// What the usage endpoint answers, as far as the 2.1.278 binary shows: top-level windows — five_hour,
// seven_day, seven_day_sonnet/opus ({utilization: 0–100, resets_at}) — plus codename buckets of the same
// shape (cinder_cove is the CLI's "Claude Code and Cowork credit", a one-time grant; nimbus_quill turned up
// at 0 % on 2026-09-20 and this CLI has no label for it, so it never shows there) and limits[]: the server's
// own rows, {kind: session | weekly_all | weekly_scoped, percent, resets_at, scope: {model: {display_name}}}.
// The CLI draws the known windows and adds "Current week (<model>)" from the weekly_scoped rows behind an
// allowlist; here every scoped row shows — a per-model allowance (Fable's) is exactly what you want apart.
// Codename buckets show only once they are non-zero; the zero ones come back under `other`.
function usageWindows(d) {
  const windows = [], other = [];
  const add = (key, label, percent, resetsAt) => { if (typeof percent === 'number' && !windows.some(x => x.key === key)) windows.push({ key, label, percent: Math.round(percent), resetsAt: resetsAt || null }); };
  const named = { five_hour: 'session · 5 h', seven_day: 'week · all models', seven_day_opus: 'week · Opus', seven_day_sonnet: 'week · Sonnet' };
  const buckets = { cinder_cove: 'Claude Code & Cowork credit' };
  for (const [k, label] of Object.entries(named)) if (d[k] && typeof d[k] === 'object') add(k, label, d[k].utilization, d[k].resets_at);
  for (const row of Array.isArray(d.limits) ? d.limits : []) {
    if (!row || typeof row !== 'object' || typeof row.percent !== 'number') continue;
    const who = row.scope?.model?.display_name || row.scope?.surface?.display_name || row.scope?.display_name || row.label;
    if (!who || row.kind === 'session' || row.kind === 'weekly_all') continue;   // those are the windows above
    add(`limits:${row.kind}:${who}`, `${row.kind === 'weekly_scoped' ? 'week' : String(row.kind).replace(/_/g, ' ')} · ${who}`, row.percent, row.resets_at);
  }
  for (const [k, w] of Object.entries(d)) {
    if (k in named || k === 'limits' || !w || typeof w !== 'object' || typeof w.utilization !== 'number') continue;
    if (w.utilization > 0) add(k, buckets[k] || k.replace(/_/g, ' '), w.utilization, w.resets_at); else other.push(k);
  }
  return { windows, other };
}
function planUsage(cb) {
  if (process.env.USAGE === 'off') return cb(503, { error: 'usage disabled (USAGE=off)', off: true });   // off: the page hides its bar
  if (usageCache.body && Date.now() - usageCache.at < 60000) return cb(usageCache.code, usageCache.body);
  oauthToken(async (token, why) => {
    if (!token) return cb(503, { error: why });
    try {
      const r = await fetch('https://api.anthropic.com/api/oauth/usage', {
        headers: { authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return cb(r.status === 401 ? 503 : 502, { error: d?.error?.message || `usage API: HTTP ${r.status}` });
      Object.assign(usageCache, { at: Date.now(), code: 200, body: { ...usageWindows(d), fetchedAt: new Date().toISOString() } });
      cb(200, usageCache.body);
    } catch (e) { cb(502, { error: `usage API: ${e.message || e}` }); }
  });
}
function codeBin() { return findBin('code', '"Focus in VS Code" is disabled'); }

// ---------------------------------------------------------------------------------------------
// VS Code Web: the editor UI served by `code serve-web`, for the pane beside the board
// ---------------------------------------------------------------------------------------------
// The desktop app cannot be embedded, but the VS Code CLI can serve the same editor as a web page,
// with a server-side extension host on this Mac: real files, real terminal, real git, and the Claude
// Code extension (a workspace-side extension) running against the same ~/.claude. It is a separate
// VS Code instance: its own settings and extensions (`~/.vscode-server/extensions`, installed once
// with the server's own CLI — see README), and the folder must be trusted once per browser profile.
// Started on first use and adopted if something already answers on the port; the child belongs to
// this server, so it goes when the server goes. Loopback only, no connection token: the same trust
// boundary as the board itself.
const VSWEB_PORT = Number(process.env.VSWEB_PORT || 7332);
const VSWEB_URL = `http://127.0.0.1:${VSWEB_PORT}/`;
let vsweb = null;   // the child, while it is ours
// …and goes with it: a signal that ends this server ends the child too, instead of orphaning an
// editor server on the port for the next run to adopt without knowing whose it is.
// `code` is a wrapper script around the real binary, so the child runs in its own process group and
// the whole group is signalled — killing the wrapper alone left the server behind on the port.
process.on('exit', () => { if (vsweb) { try { process.kill(-vsweb.pid, 'SIGTERM'); } catch { try { vsweb.kill(); } catch {} } } });
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => process.exit(0));
function vswebAnswers() {
  return new Promise(resolve => {
    const req = httpGet(VSWEB_URL, r => { r.resume(); resolve(r.statusCode > 0); });
    req.on('error', () => resolve(false)); req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}
async function ensureVsWeb() {
  if (await vswebAnswers()) return { ok: true, url: VSWEB_URL, started: false };
  const code = codeBin();
  if (!code) return { code: 501, error: 'code CLI not found — run "Shell Command: Install \'code\' command in PATH" in VS Code, or set CODE_BIN' };
  if (!vsweb) {
    try {
      vsweb = spawn(code, ['serve-web', '--host', '127.0.0.1', '--port', String(VSWEB_PORT), '--without-connection-token', '--accept-server-license-terms'], { stdio: 'ignore', env: termEnv(), detached: true });
      vsweb.on('exit', c => { console.log(`[peixairada] code serve-web exited (${c})`); vsweb = null; });
    } catch (e) { vsweb = null; return { code: 500, error: `could not start code serve-web: ${e.message}` }; }
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {   // the first run downloads the server build
    await new Promise(r => setTimeout(r, 500));
    if (await vswebAnswers()) return { ok: true, url: VSWEB_URL, started: true };
    if (!vsweb) return { code: 500, error: 'code serve-web exited before it answered' };
  }
  return { code: 504, error: `code serve-web did not answer on ${VSWEB_PORT} within 60 s` };
}

// `claude --resume <id> -p <text>` reuses the session id, so Claude appends to the *same* transcript
// and the reply arrives through the watcher like any other line — nothing downstream special-cases it.
// Resuming also registers a new pid, so the card walks Stale → Clauding → Ready on its own.
//
// Stale only, and deliberately: a live session already has a process writing that file, and a second
// writer racing it is how a transcript gets mangled.
//
// The text is passed as an argv element to execFile — no shell — so quotes, newlines and $(…) in a
// reply are inert.
function replyToStale(s, text) {
  const bin = claudeBin();
  if (!bin) return { code: 503, error: 'claude binary not found — set CLAUDE_BIN to its path' };
  const cwd = s.live?.cwd || s.cwd;
  if (!cwd) return { code: 400, error: 'no cwd known for this session' };
  if (!existsSync(cwd)) return { code: 409, error: `cwd no longer exists: ${cwd}` };
  if (s.replying) return { code: 409, error: 'a reply is already running for this chat' };

  s.replying = { snippet: snippet(text, 140), startedAt: new Date().toISOString() };
  s.replyError = null;
  schedulePush(s);

  // Not awaited: a resumed turn runs for as long as it needs. The board already tails the transcript,
  // so the prompt and the answer show up on their own. This only tracks the process, so the UI can
  // say "sending" and surface a failure that never reaches the transcript at all.
  execFile(bin, ['--resume', s.id, '-p', text], { cwd, timeout: REPLY_TIMEOUT_MS, maxBuffer: 16e6 }, (err, _stdout, stderr) => {
    s.replying = null;
    s.replyError = err ? (String(stderr || err.message).trim().split('\n').pop() || String(err)).slice(0, 300) : null;
    if (s.replyError) console.error(`[peixairada] reply to ${s.id} failed:`, s.replyError);
    schedulePush(s);
  });
  return { code: 202, ok: true };
}

// ---------------------------------------------------------------------------------------------
// Terminals: a real `claude` in a PTY, attached to from the page over a WebSocket
// ---------------------------------------------------------------------------------------------
// Chatting from the board means running Claude Code itself, not re-implementing its UI: the process
// is the CLI in a pseudo-terminal, the page shows it through xterm.js, and every feature the TUI has
// comes along — permission prompts, questions, plan mode, slash commands. It registers in
// ~/.claude/sessions like any Terminal.app run (entrypoint "cli") and writes the same transcript,
// so the watcher tracks it with no special casing; the rendered chat above the drawer is the reading
// view and the terminal is where you type.
//
// The PTY does not live here. Each drawer is a holder (lib/termhold.mjs), a small process spawned detached
// that owns the PTY and the exact screen (a headless xterm) and listens on a Unix socket under TERMS_DIR;
// this server connects to it and proxies pages to it. So a server restart — `scripts/launchd.sh restart`,
// a crash — leaves every chat running, and on boot the server adopts the holders it finds. Until
// 2026-09-20 the PTY was in-process and every restart ended every drawer, this project's own included.
// A resumed chat keeps its session id; a new one is matched to its session by pid when it registers —
// the holder reports the PTY's pid, and is told the id back so an adoption after a restart knows it too.
const TERMS_DIR = process.env.TERMS_DIR || join(dirname(STATE_FILE), 'terms');
const HOLDER = join(__dirname, 'lib', 'termhold.mjs');
const TERM_LINGER_MS = Number(process.env.TERM_LINGER_MS || 5 * 60_000);   // an exited holder keeps its last screen this long (the holder's own timer; this one forgets it here)
const HOLDER_START_MS = 15_000;
const terms = new Map();              // id -> { id, sessionId, cwd, pid, holderPid, resume, startedAt, exited, cols, rows, sock, clients, snapQ, lastSnap }
let termSeq = 0;
const termsAvailable = () => !!nodePty && existsSync(HOLDER);

/** The chat's terminal — a live one over an exited one still lingering in `terms`. */
function termOf(s) { let hit = null; for (const t of terms.values()) if (t.sessionId === s.id && !t.shell && (!hit || (hit.exited !== null && t.exited === null))) hit = t; return hit; }
/** The chat's zsh (⌥⌘T), the same way. */
function shellOf(s) { let hit = null; for (const t of terms.values()) if (t.sessionId === s.id && t.shell && (!hit || (hit.exited !== null && t.exited === null))) hit = t; return hit; }
function termSummary(t) {
  return t ? {
    id: t.id, sessionId: t.sessionId, cwd: t.cwd, pid: t.pid, holderPid: t.holderPid, resume: t.resume, shell: !!t.shell, task: t.task || null, startedAt: t.startedAt, exited: t.exited,
    cols: t.cols, rows: t.rows, clients: t.clients.size, connected: !!(t.sock && !t.sock.destroyed), lastSnapshotChars: t.lastSnap,
  } : null;
}

// The server's own environment minus anything that says "you are inside a Claude session" — under
// `npm start` from a Claude shell that is exactly what it says, and the CLI refuses to nest.
function termEnv() {
  const env = {};
  // Only the nesting markers go: CLAUDECODE and CLAUDE_CODE_*. CLAUDE_DIR is this project's own (a fixture in tests —
  // the fake claude reads it) and CLAUDE_BIN the override the server already resolved; neither means anything to the CLI.
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDECODE$|^CLAUDE_CODE_/.test(k)) env[k] = v;
  // PEIXAIRADA_DRAWER tells a script that its shell is a drawer (launchd.sh and build.sh check it).
  return { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor', LANG: env.LANG || 'en_US.UTF-8', PEIXAIRADA_DRAWER: '1' };
}

// Take a chat over from wherever it runs — iTerm, VS Code: end that claude, then resume the chat here.
// Nothing respawns a CLI process, and VS Code's extension does not respawn its own either (see inVsCode),
// so the transcript has one writer again the moment it is gone. SIGTERM first, which is what closing the
// terminal amounts to (claude exits and drops its registry entry); SIGKILL if it is still there after
// 5 s. Whatever Claude was mid-way through is lost, and the page says so before the click. The caller
// re-reads the registry afterwards; this only ends the process.
const TAKEOVER_WAIT_MS = 10_000;
function endClaude(pid) {
  return new Promise(resolve => {
    try { process.kill(pid, 'SIGTERM'); } catch (e) { return resolve({ code: 500, error: `could not signal pid ${pid}: ${e.message}` }); }
    const t0 = Date.now(); let hard = false;
    const tick = () => {
      if (!pidAlive(pid)) return resolve({ ok: true });
      if (Date.now() - t0 > TAKEOVER_WAIT_MS) return resolve({ code: 504, error: `pid ${pid} is still running` });
      if (!hard && Date.now() - t0 > 5000) { hard = true; try { process.kill(pid, 'SIGKILL'); } catch {} }
      setTimeout(tick, 200);
    };
    setTimeout(tick, 200);
  });
}

// ---- the holder protocol: newline-delimited JSON over the holder's socket (see lib/termhold.mjs) ----
const holderSend = (t, m) => { if (t.sock && !t.sock.destroyed) { t.sock.write(JSON.stringify(m) + '\n'); return true; } return false; };
/** The screen as it stands, with `upto`: the seq of the last output message it already contains. Null when the holder is gone. */
const requestSnap = t => new Promise(res => { if (!holderSend(t, { t: 'snap' })) return res(null); t.snapQ.push(res); });
function connectHolder(t) {
  return new Promise((resolve, reject) => {
    const sock = netConnect(join(TERMS_DIR, `${t.id}.sock`));
    let buf = '', helloed = false;
    sock.on('connect', () => { t.sock = sock; });
    sock.on('data', chunk => {
      buf += chunk;
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (!helloed && m.t === 'hello') { helloed = true; Object.assign(t, { pid: m.pid, holderPid: m.holderPid, exited: m.exited, cols: m.cols, rows: m.rows, cwd: m.cwd, resume: !!m.resume, startedAt: m.startedAt, sessionId: t.sessionId ?? m.sessionId ?? null }); resolve(m); }
        else onHolderMsg(t, m);
      }
    });
    sock.on('error', e => { if (!helloed) reject(e); });
    sock.on('close', () => { if (t.sock === sock) { t.sock = null; onHolderGone(t); } if (!helloed) reject(new Error('the holder closed before saying hello')); });
  });
}
function onHolderMsg(t, m) {
  if (m.t === 'out') {
    const buf = Buffer.from(m.d, 'utf8');
    // A page still waiting for its snapshot gets what arrives meanwhile afterwards, in order and only what the
    // snapshot does not already contain (see attachTermSocket).
    for (const ws of t.clients) { if (ws.readyState !== 1) continue; if (ws.hold) ws.hold.push({ seq: m.seq, buf }); else ws.send(buf); }
  } else if (m.t === 'clear') {
    // The holder cleared its screen: every page on this drawer drops its own, in the same place in the stream.
    const msg = JSON.stringify({ t: 'clear' });
    for (const ws of t.clients) { if (ws.readyState !== 1) continue; if (ws.hold) ws.hold.push({ seq: m.seq, buf: msg }); else ws.send(msg); }
  } else if (m.t === 'snap') { const w = t.snapQ.shift(); t.lastSnap = m.d.length; if (w) w(m); }
  else if (m.t === 'exit') termExited(t, m.code);
}
function termExited(t, code) {
  if (t.exited !== null) return;
  t.exited = code ?? 0;
  const msg = JSON.stringify({ t: 'exit', code: t.exited });
  for (const ws of t.clients) if (ws.readyState === 1) ws.send(msg);
  broadcast('terminal', termSummary(t));
  const s = t.sessionId && sessions.get(t.sessionId); if (s) schedulePush(s);
  setTimeout(() => { if (terms.get(t.id) === t) { terms.delete(t.id); t.sock?.destroy(); } }, TERM_LINGER_MS).unref();
}
/** The socket closed: the holder ended (after its linger, or killed). A live PTY dies with its holder — its master closed — so 129. */
function onHolderGone(t) {
  for (const w of t.snapQ.splice(0)) w(null);
  if (t.exited === null) termExited(t, 129); else terms.delete(t.id);
}

// ---- launchers: a folder's own way to start claude ---------------------------------------------------------------
// Some folders do not start claude bare: oracle's Taskfile has `task production-workload`, `task sandbox-workload`,
// `task development-<cluster>`… — each sets a cluster's environment (its credentials and
// dashboards) and then runs claude. A new chat there has to go through one of them, and which is a choice (2026-09-20,
// Ricardo: "if it's oracle … we should run `task <env>` instead of claude, and we should ask what env"). Nothing is
// named here: a folder with a Taskfile whose tasks mention Claude in their description has launchers, and the page asks
// (`GET /api/launchers?cwd=`) before starting a chat. `task --list --json` lists them; cached by the Taskfile's mtime,
// so it runs once per edit. A resume (`claude --resume`) never goes through task: its command line is the Taskfile's.
const TASKFILES = ['Taskfile.yml', 'Taskfile.yaml', 'taskfile.yml', 'taskfile.yaml', 'Taskfile.dist.yml', 'Taskfile.dist.yaml'];
const launcherCache = new Map();   // cwd → { mtime, launchers }
const TASK_NAME = /^[\w:.-]+$/;
function taskfileOf(cwd) { for (const f of TASKFILES) { const p = join(cwd, f); if (existsSync(p)) return p; } return null; }
function launchersFor(cwd) {
  return new Promise(resolve => {
    const file = cwd && taskfileOf(cwd); if (!file) return resolve([]);
    let mtime; try { mtime = statSync(file).mtimeMs; } catch { return resolve([]); }
    const hit = launcherCache.get(cwd); if (hit && hit.mtime === mtime) return resolve(hit.launchers);
    const bin = findBin('task', 'Taskfile launchers are disabled'); if (!bin) return resolve([]);
    execFile(bin, ['--list', '--json'], { cwd, env: termEnv(), timeout: 15_000, maxBuffer: 4e6 }, (err, stdout) => {
      let launchers = [];
      if (err) console.error(`[peixairada] task --list in ${cwd}: ${err.message}`);
      else try { launchers = (JSON.parse(stdout).tasks || []).filter(t => /\bclaude\b/i.test(t.desc || '')).map(t => ({ name: t.name, desc: t.desc || '' })); } catch (e) { console.error(`[peixairada] task --list in ${cwd}: ${e.message}`); }
      launcherCache.set(cwd, { mtime, launchers }); resolve(launchers);
    });
  });
}

// ---- the org's folders: where the repos live, and cloning one that is not there yet -------------------------------
// A project on the board is a folder some chat ran in, so a repo you have not opened a chat in is nowhere to be seen,
// and one you have not cloned is nowhere at all — which made starting work on a repo the longest thing the board
// asked of you (2026-09-21, Ricardo: "adding a new project is a bit cumbersome"). `ORG_DIR` is the directory the
// repos live in (~/acme) and `ORG` the GitHub organisation they come from — one name for both, since that is how
// it is laid out here; both are env overrides, and neither is written to except by the one clone below.
const ORG = process.env.ORG || 'acme';
const ORG_DIR = process.env.ORG_DIR || join(homedir(), ORG);
const REPO_NAME = /^[A-Za-z0-9][\w.-]*$/;          // a name for a folder and a repo, and nothing that walks out of ORG_DIR
const CLONE_MS = Number(process.env.CLONE_MS || 10 * 60_000);   // a big repo over a slow line; the page waits on it
const isDir = p => { try { return statSync(p).isDirectory(); } catch { return false; } };
let folderCache = { mtime: -1, folders: [] };

/** Every folder directly under ORG_DIR, by name. Cached by the directory's own mtime — a clone or a `git clone` by
 *  hand moves it, and the picker asks on every opening. */
function orgFolders() {
  let mtime; try { mtime = statSync(ORG_DIR).mtimeMs; } catch { return []; }
  if (folderCache.mtime === mtime) return folderCache.folders;
  let folders = [];
  try {
    folders = readdirSync(ORG_DIR, { withFileTypes: true })
      .filter(d => !d.name.startsWith('.') && (d.isDirectory() || (d.isSymbolicLink() && isDir(join(ORG_DIR, d.name)))))
      .map(d => ({ name: d.name, cwd: join(ORG_DIR, d.name) }))
      .map(f => ({ ...f, git: existsSync(join(f.cwd, '.git')) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) { console.error(`[peixairada] ${ORG_DIR}: ${e.message}`); }
  folderCache = { mtime, folders };
  return folders;
}

/** `gh repo clone <org>/<name>` into ORG_DIR — gh because it is already how the board asks GitHub about PRs, it knows
 *  the account's protocol, and it says plainly when there is no such repo. A folder that is already there is handed
 *  back as it is (the page carries straight on into the new-chat flow with it); a clone that failed leaves nothing
 *  behind, so the next try is not told the folder exists. */
function cloneRepo(name, done) {
  if (!REPO_NAME.test(name || '')) return done({ code: 400, error: `"${name}" is not a repository name` });
  const cwd = join(ORG_DIR, name);
  if (existsSync(cwd)) return done({ code: 200, cwd, cloned: false });
  const bin = findBin('gh', 'cloning from the board is disabled');
  if (!bin) return done({ code: 503, error: 'gh not found — set GH_BIN to its path, or clone it by hand' });
  try { mkdirSync(ORG_DIR, { recursive: true }); } catch (e) { return done({ code: 500, error: `${ORG_DIR}: ${e.message}` }); }
  console.log(`[peixairada] clone ${ORG}/${name} → ${cwd}`);
  execFile(bin, ['repo', 'clone', `${ORG}/${name}`, cwd], { cwd: ORG_DIR, env: termEnv(), timeout: CLONE_MS, maxBuffer: 4e6 }, (err, _out, stderr) => {
    folderCache = { mtime: -1, folders: [] };
    if (!err) { console.log(`[peixairada] cloned ${ORG}/${name}`); return done({ code: 200, cwd, cloned: true }); }
    try { if (existsSync(cwd) && !readdirSync(cwd).length) rmSync(cwd, { recursive: true }); } catch {}
    // execFile's callback error carries no output of its own: gh says why on stderr ("could not find any repository…").
    const why = String(stderr || err.message).trim().split('\n').filter(Boolean).pop() || 'clone failed';
    console.error(`[peixairada] clone ${ORG}/${name}: ${why}`);
    done({ code: 502, error: why });
  });
}

/**
 * Start `claude` (or `claude --resume <id>`, or `task <name>` — a launcher, see above) in `cwd`: write the spec, spawn
 * the holder detached (its own session, so a signal to this server never reaches it), wait for its socket. The holder
 * runs the CLI through an interactive login zsh, because the app's server has a bare PATH and the tools Claude will
 * call — git, gh, node — are on the PATH that .zshrc builds (mise activates there); `exec` makes claude take over the
 * shell's pid, which is the pid the registry will report — with a launcher, task takes the pid and claude is a
 * descendant, which linkTermToRegistry knows.
 */
async function spawnTerm({ cwd, sessionId = null, cols = 120, rows = 30, shell = false, task = null }) {
  if (!termsAvailable()) return { code: 501, error: 'node-pty is not available — run npm install and restart the server' };
  const bin = shell ? '/bin/zsh' : task ? findBin('task', 'Taskfile launchers are disabled') : claudeBin();   // a shell holder runs zsh itself (see termhold.mjs); the chat's is claude, or its launcher
  if (!bin) return { code: 503, error: task ? 'task binary not found — set TASK_BIN to its path' : 'claude binary not found — set CLAUDE_BIN to its path' };
  if (!cwd) return { code: 400, error: 'no cwd known for this chat' };
  if (!existsSync(cwd)) return { code: 409, error: `cwd no longer exists: ${cwd}` };
  const args = task ? [task] : shell || !sessionId ? [] : ['--resume', sessionId];
  const id = `t${++termSeq}-${Date.now().toString(36)}`;
  try { mkdirSync(TERMS_DIR, { recursive: true }); } catch {}
  const spec = { id, sessionId, cwd, bin, args, shell, task, cols: Math.min(500, Math.max(20, cols | 0)), rows: Math.min(200, Math.max(5, rows | 0)), resume: !shell && !!sessionId, startedAt: new Date().toISOString() };
  const logFile = join(TERMS_DIR, `${id}.log`);
  let child;
  try {
    writeFileSync(join(TERMS_DIR, `${id}.json`), JSON.stringify(spec));
    const log = openSync(logFile, 'a');
    child = spawn(process.execPath, [HOLDER, TERMS_DIR, id], { cwd, env: termEnv(), detached: true, stdio: ['ignore', log, log] });
    child.unref(); closeSync(log);
  } catch (e) { return { code: 500, error: `could not start a terminal holder: ${e.message}` }; }
  const t = { ...spec, pid: null, holderPid: child.pid, exited: null, sock: null, clients: new Set(), snapQ: [], lastSnap: null };
  const t0 = Date.now();
  for (;;) {
    try { await connectHolder(t); break; }
    catch (e) {
      if (child.exitCode !== null) {
        let why = ''; try { why = JSON.parse(readFileSync(join(TERMS_DIR, `${id}.json`), 'utf8')).error || ''; } catch {}
        return { code: 500, error: why || `the terminal holder exited (${child.exitCode}) — see ${logFile}` };
      }
      if (Date.now() - t0 > HOLDER_START_MS) return { code: 500, error: `the terminal holder did not answer in ${HOLDER_START_MS / 1000} s (${e.message}) — see ${logFile}` };
      await new Promise(r => setTimeout(r, 100));
    }
  }
  terms.set(id, t);
  console.log(`[peixairada] terminal ${id}: ${shell ? 'zsh' : task ? 'task ' + task : 'claude' + (args.length ? ' ' + args.join(' ') : '')} in ${cwd} (pid ${t.pid}, holder ${t.holderPid})`);
  broadcast('terminal', termSummary(t));
  const s = sessionId && sessions.get(sessionId); if (s) schedulePush(s);
  return { code: 201, terminal: termSummary(t) };
}

/** On boot: the holders from before this server — adopt the ones that answer, clean up after the dead. */
async function adoptHolders() {
  if (!existsSync(TERMS_DIR)) return;
  for (const f of readdirSync(TERMS_DIR)) {
    if (!f.endsWith('.json')) continue;
    let meta; try { meta = JSON.parse(readFileSync(join(TERMS_DIR, f), 'utf8')); } catch { continue; }
    const id = meta.id || f.slice(0, -5);
    const n = Number((id.match(/^t(\d+)-/) || [])[1]); if (n > termSeq) termSeq = n;
    const t = { id, sessionId: meta.sessionId ?? null, cwd: meta.cwd, bin: meta.bin, args: meta.args, shell: !!meta.shell, task: meta.task ?? null, claudePid: meta.claudePid ?? null, cols: meta.cols, rows: meta.rows, resume: !!meta.resume, startedAt: meta.startedAt, pid: meta.pid, holderPid: meta.holderPid, exited: meta.exited ?? null, sock: null, clients: new Set(), snapQ: [], lastSnap: null };
    try {
      await connectHolder(t);
      terms.set(id, t);
      noteEnv(t.sessionId, t.task);   // a launcher's drawer from before the record existed, or from before a restart
      if (t.exited !== null) setTimeout(() => { if (terms.get(id) === t) terms.delete(id); }, TERM_LINGER_MS).unref();
      console.log(`[peixairada] terminal ${id}: adopted — pid ${t.pid}, holder ${t.holderPid}${t.exited !== null ? ', exited ' + t.exited : ''}${t.sessionId ? ', chat ' + t.sessionId : ''}`);
    } catch (e) {
      if (meta.holderPid && pidAlive(meta.holderPid)) { console.log(`[peixairada] terminal ${id}: holder ${meta.holderPid} is alive but not answering (${e.message}) — left alone`); continue; }
      for (const ext of ['.json', '.sock', '.log']) try { unlinkSync(join(TERMS_DIR, id + ext)); } catch {}
      console.log(`[peixairada] terminal ${id}: its holder is gone — cleaned up`);
    }
  }
}

/** pid → parent pid for every process, from one `ps`. Asked for only while a launcher's drawer has no session yet. */
function parentPids() {
  const m = new Map();
  try { for (const l of execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).split('\n')) { const [p, pp] = l.trim().split(/\s+/).map(Number); if (p) m.set(p, pp); } }
  catch (e) { console.error(`[peixairada] ps: ${e.message}`); }
  return m;
}
const descends = (pid, from, ppids) => { if (!ppids) return false; for (let p = ppids.get(pid), i = 0; p > 1 && i < 64; p = ppids.get(p), i++) if (p === from) return true; return false; };
/**
 * A new chat has no session id until claude registers; the pid ties the two together, and the holder is told. The PTY's
 * process *is* claude (`exec`) — except behind a launcher, where it is `task` and claude a descendant (task → sh →
 * mise → claude), found through `ps`: `ppids` when such a drawer is waiting. The registry pid is kept as claudePid, so
 * the drawer's own process is known when the chat gets a rival.
 */
/**
 * Remember which environment a chat was started in (`task production-workload`…), so ⌥⌘O can list oracle's open
 * chats under it long after the drawer has gone. Forgotten sessions are pruned on the way, but never while the
 * initial scan is still running — an adopted holder records its env before the registry is read, and `sessions`
 * is not yet the whole truth then.
 */
function noteEnv(sessionId, task) {
  if (!sessionId || !task || envs[sessionId] === task) return;
  envs[sessionId] = task;
  if (!indexing) for (const id of Object.keys(envs)) if (!sessions.has(id)) delete envs[id];
  saveState();
}
function linkTermToRegistry(pid, s, ppids = null) {
  for (const t of terms.values()) {
    if (t.shell || t.sessionId === s.id) continue;
    if (t.pid !== pid && !(t.task && t.exited === null && descends(pid, t.pid, ppids))) continue;
    const was = sessions.get(t.sessionId);   // the chat it is leaving — /clear gave this pid a new id
    t.sessionId = s.id; t.claudePid = pid; holderSend(t, { t: 'meta', sessionId: s.id, claudePid: pid });
    noteEnv(s.id, t.task);
    broadcast('terminal', termSummary(t)); schedulePush(s);
    // The chat it left has to be told too, or its card keeps a drawer that is somewhere else now and only
    // something unrelated happening to it ever clears that (2026-09-22, found through drawer-clear's flake).
    if (was && was !== s) schedulePush(was);
  }
}
/** End the process in a drawer; an exited one is let go at once instead of lingering. */
function killTerm(t) {
  if (t.exited === null) holderSend(t, { t: 'kill' });
  else { holderSend(t, { t: 'quit' }); terms.delete(t.id); }
}

// One WebSocket per attached page. Binary frames carry output — first the screen as it stands (the holder's
// headless terminal serialized: scrollback, cells, cursor, modes), then the PTY's bytes as they come; text frames
// are JSON in both directions: {t:'in', d}, {t:'resize', cols, rows} and {t:'clear'} up, {t:'clear'} and
// {t:'exit', code} down. Output that arrives while the snapshot is on its way waits in `ws.hold` and follows it,
// minus what the snapshot already contains (`upto`), so the page sees the screen and then, in order, only what
// came after it. A clear rides in that same queue — it is numbered like output, and wipes the page in its place.
const wss = new WebSocketServer({ noServer: true });
function attachTermSocket(req, socket, head) {
  const m = (req.url || '').match(/^\/api\/terminals\/([\w-]+)\/ws$/);
  const t = m && terms.get(m[1]);
  if (!t) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => {
    t.clients.add(ws);
    ws.hold = [];
    requestSnap(t).then(snap => {
      if (ws.readyState !== 1) return;
      if (snap?.d) ws.send(Buffer.from(snap.d, 'utf8'));
      for (const h of ws.hold) if (!snap || h.seq > snap.upto) ws.send(h.buf);
      ws.hold = null;
      if (t.exited !== null) ws.send(JSON.stringify({ t: 'exit', code: t.exited }));
      if (snap) console.log(`[peixairada] terminal ${t.id}: a page attached — screen snapshot ${snap.d.length} chars, ${snap.cols}×${snap.rows}`);
    });
    ws.on('message', data => {
      if (t.exited !== null) return;
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.t === 'in' && typeof msg.d === 'string') holderSend(t, { t: 'in', d: msg.d });
      else if (msg.t === 'resize' && msg.cols > 0 && msg.rows > 0) {
        const cols = Math.min(500, msg.cols | 0), rows = Math.min(200, msg.rows | 0);
        t.cols = cols; t.rows = rows; holderSend(t, { t: 'resize', cols, rows });
      }
      else if (msg.t === 'clear') holderSend(t, { t: 'clear' });
    });
    ws.on('close', () => t.clients.delete(ws));
  });
}

// ---------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Newest first by the chat's last word — yours or Claude's reply, whichever came later — the board's own order (`byWord` in index.html). */
const wordAt = s => { const u = String(s.lastUserAt || ''), r = String(s.lastReplyAt || ''); return (u > r ? u : r) || String(s.lastActivity || ''); };
function sortedSummaries() {
  return [...sessions.values()].map(summary).sort((a, b) => wordAt(b).localeCompare(wordAt(a)));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(readFileSync(join(__dirname, 'public', 'index.html')));
    }
    let m;
    if (req.method === 'GET' && (m = p.match(/^\/vendor\/([\w.-]+\.(js|css))$/))) {
      const f = join(__dirname, 'public', 'vendor', m[1]);
      if (!existsSync(f)) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': m[2] === 'css' ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=86400' });
      return res.end(readFileSync(f));
    }
    if (req.method === 'GET' && p === '/api/sessions') return json(res, 200, { sessions: sortedSummaries(), projects: projectList(), pins: pinned, hidden: hiddenProjects, peacock: peacockColors(), repos: repoUrls(), claudeDir: CLAUDE_DIR, notify: NOTIFY, notifications: notificationsOn });
    if (req.method === 'GET' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/messages$/))) {
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      if (!s.loaded && s.file) { indexFile(s.file, { full: true }); applyLiveness(sessions.get(m[1])); }
      const cur = sessions.get(m[1]);
      queueSessionPrs(cur);   // opening a chat is what refreshes its PR statuses; the SSE push carries them in
      return json(res, 200, { session: summary(cur), entries: cur.entries });
    }
    // ⌥⌘T: a zsh in the chat's folder, in the pane's zsh tab — a holder like the claude one (`zsh -l -i` in the PTY),
    // one per chat, alive until `exit` or a DELETE. The inline "new tab in iTerm" (2026-09-20).
    if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/shell$/))) {
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      const have = shellOf(s);
      if (have && have.exited === null) return json(res, 200, { terminal: termSummary(have) });
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      const r = await spawnTerm({ cwd: s.live?.cwd || s.cwd, sessionId: s.id, cols: body.cols, rows: body.rows, shell: true });
      return json(res, r.code, r);
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/focus$/))) {
      const s = sessions.get(m[1]);
      const cwd = s?.cwd || s?.live?.cwd;
      if (!cwd) return json(res, 400, { error: 'no cwd known' });
      // Resolved, not spawned by name: the app hands the server PATH=/usr/bin:/bin:/usr/sbin:/sbin,
      // which does not contain /usr/local/bin, so a bare `code` was ENOENT in the packaged app.
      const code = codeBin();
      if (!code) return json(res, 501, { error: 'code CLI not found — run "Shell Command: Install \'code\' command in PATH" in VS Code, or set CODE_BIN' });
      // `code <folder>` re-focuses the VS Code window that already has that folder open. Then the
      // chat itself: the extension's URI handler takes a session id on its /open route and hands it
      // to its own open-session command, so the right tab comes up in the Claude panel, not just the
      // right window. Undocumented (the docs list q/cwd/repo, the code reads session/prompt), so it
      // may stop working on an extension update — then the window still comes up, as before.
      // The URI lands in whichever window is focused, hence after `code` and a beat later.
      // A chat live in a terminal is left alone: opening it in VS Code would put a second writer
      // on its transcript.
      const deepLink = s && process.platform === 'darwin' && !(s.alive && s.live?.entrypoint !== 'claude-vscode');
      execFile(code, [cwd], err => {
        if (err) return json(res, 500, { error: String(err.message || err) });
        if (!deepLink) return json(res, 200, { ok: true, cwd, chat: false });
        setTimeout(() => execFile('/usr/bin/open', [`vscode://anthropic.claude-code/open?session=${s.id}`], e2 =>
          e2 ? json(res, 200, { ok: true, cwd, chat: false, warning: String(e2.message || e2) }) : json(res, 200, { ok: true, cwd, chat: true })), 400);
      });
      return;
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/reply$/))) {
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) return json(res, 400, { error: 'expected {text}' });
      if (s.alive) return json(res, 409, { error: 'chat is live — resuming it would put a second writer on its transcript' });
      const r = replyToStale(s, text);
      return json(res, r.code, r.ok ? { ok: true, status: 'running' } : { error: r.error });
    }
    if (req.method === 'PUT' && p === '/api/pins') {   // the pinned projects, in order — the whole list each time; folder cwds and c:<id>
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      if (!Array.isArray(body.pins)) return json(res, 400, { error: 'expected {pins: [key]}' });
      pinned = [...new Set(body.pins.filter(k => typeof k === 'string' && /^(\/|c:\w+$)/.test(k)).map(k => k.slice(0, 1000)))].slice(0, 200);
      saveState(); broadcast('pins', { pins: pinned }); pollPeacock();
      return json(res, 200, { ok: true, pins: pinned });
    }
    if (req.method === 'PUT' && p === '/api/hidden') {   // the projects taken off the board, the whole list each time — same keys as the pins
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      if (!Array.isArray(body.hidden)) return json(res, 400, { error: 'expected {hidden: [key]}' });
      hiddenProjects = [...new Set(body.hidden.filter(k => typeof k === 'string' && /^(\/|c:\w+$)/.test(k)).map(k => k.slice(0, 1000)))].slice(0, 500);
      saveState(); broadcast('hidden', { hidden: hiddenProjects });
      return json(res, 200, { ok: true, hidden: hiddenProjects });
    }
    if (req.method === 'PUT' && p === '/api/notifications') {   // the cog's switch: system notifications on or off, for every page and the app
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      if (typeof body.on !== 'boolean') return json(res, 400, { error: 'expected {on: true|false}' });
      notificationsOn = body.on;
      saveState(); broadcast('notifications', { on: notificationsOn });
      return json(res, 200, { ok: true, on: notificationsOn });
    }
    if ((req.method === 'PUT' || req.method === 'DELETE') && p === '/api/peacock') {   // the board sets a folder's Peacock colour
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      const cwd = typeof body.cwd === 'string' ? body.cwd.replace(/\/+$/, '') : '';
      if (!peacockCwds().has(cwd)) return json(res, 400, { error: 'not a folder the board knows' });
      const color = req.method === 'DELETE' ? null : String(body.color || '').toLowerCase();
      if (color && !/^#[0-9a-f]{6}$/.test(color)) return json(res, 400, { error: 'color must be #rrggbb' });
      try {
        const r = writePeacock(cwd, color);
        pollPeacock();
        return json(res, 200, { ok: true, file: r.file, changed: r.changed, tracked: await gitTracked(r.file), color });
      } catch (e) { return json(res, 500, { error: `could not write ${e.message || e}` }); }
    }
    if (req.method === 'PUT' && p === '/api/attach') {   // a dropped file's bytes (browsers only — the app knows the path); ?session=<id>&name=<file>
      const sid = url.searchParams.get('session') || '', name = url.searchParams.get('name') || 'file';
      let buf; try { buf = await readRaw(req, ATTACH_MAX); } catch (e) { return json(res, 413, { error: e.message === 'too large' ? `larger than ${ATTACH_MAX / 1048576} MB` : String(e.message || e) }); }
      try { return json(res, 200, { ok: true, path: saveAttachment(sid, name, buf), bytes: buf.length }); }
      catch (e) { return json(res, 500, { error: `could not save: ${e.message || e}` }); }
    }
    if (req.method === 'PUT' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/title$/))) {   // a title typed on the board; empty clears it
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      const title = String(body.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (title) titles[s.id] = title; else delete titles[s.id];
      for (const id of Object.keys(titles)) if (!sessions.has(id)) delete titles[id];
      saveState(); schedulePush(s);
      return json(res, 200, { ok: true, title: summary(s).title, boardTitle: titles[s.id] || null });
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/done$/))) {
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      const done = body.done !== false;
      if (done) {
        doneMarks[s.id] = new Date().toISOString();
        // Done means done: the claude behind it stops too (2026-09-20, Ricardo: "marking a card as Done should
        // kill/archive the claude session to not waste resources") — the drawer's, and one live elsewhere (SIGTERM,
        // as closing that terminal would; a VS Code tab goes dead). Not awaited: the registry notices on its own.
        for (const t of terms.values()) if (t.sessionId === s.id && t.exited === null) killTerm(t);
        if (s.alive && s.live?.pid) for (const pid of [s.live.pid, ...(s.rivals || []).map(r => r.pid)]) endClaude(pid).then(() => loadRegistry());
      } else delete doneMarks[s.id];
      for (const id of Object.keys(doneMarks)) if (!sessions.has(id)) delete doneMarks[id]; // prune forgotten sessions
      saveState(); schedulePush(s);
      return json(res, 200, { ok: true, done: isDone(s) });
    }
    if (req.method === 'POST' && p === '/hook') {
      const body = await readBody(req);
      let h; try { h = JSON.parse(body || '{}'); } catch { return json(res, 400, { error: 'bad json' }); }
      handleHook(h);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && p === '/api/projects') return json(res, 200, { projects: projectList() });
    if (req.method === 'POST' && p === '/api/projects') {
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      const v = projectInput(body, { cwds: [] });
      if (v.error) return json(res, 400, { error: v.error });
      const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      projects[id] = { id, ...v, createdAt: new Date().toISOString() };
      saveState(); broadcast('projects', { projects: projectList() }); pollPeacock();
      return json(res, 201, { project: projects[id] });
    }
    if ((req.method === 'PUT' || req.method === 'DELETE') && (m = p.match(/^\/api\/projects\/(\w+)$/))) {
      const prev = projects[m[1]];
      if (!prev) return json(res, 404, { error: 'unknown project' });
      if (req.method === 'DELETE') {
        delete projects[m[1]];
        if (pinned.includes('c:' + m[1])) { pinned = pinned.filter(k => k !== 'c:' + m[1]); broadcast('pins', { pins: pinned }); }
        saveState(); broadcast('projects', { projects: projectList() }); pollPeacock();
        return json(res, 200, { ok: true });
      }
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      const v = projectInput(body, prev);
      if (v.error) return json(res, 400, { error: v.error });
      projects[m[1]] = { ...prev, ...v };
      saveState(); broadcast('projects', { projects: projectList() }); pollPeacock();
      return json(res, 200, { project: projects[m[1]] });
    }
    if (req.method === 'GET' && p === '/api/usage') { planUsage((code, body) => json(res, code, body)); return; }
    if (req.method === 'GET' && p === '/api/terminals') return json(res, 200, { terminals: [...terms.values()].map(termSummary), available: termsAvailable(), dir: TERMS_DIR });
    if (req.method === 'GET' && p === '/api/launchers') {   // the folder's Taskfile tasks that launch claude, if any (see launchersFor)
      const cwd = url.searchParams.get('cwd') || '';
      if (!cwd.startsWith('/')) return json(res, 400, { error: 'cwd must be an absolute path' });
      return json(res, 200, { cwd, launchers: await launchersFor(cwd) });
    }
    if (req.method === 'GET' && p === '/api/folders') return json(res, 200, { root: ORG_DIR, org: ORG, folders: orgFolders() });
    if (req.method === 'POST' && p === '/api/clone') {   // a repo of the org, cloned into ORG_DIR — then the page starts a chat in it
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      return cloneRepo(typeof body.name === 'string' ? body.name.trim() : '', r => r.error ? json(res, r.code, { error: r.error }) : json(res, r.code, { cwd: r.cwd, cloned: r.cloned }));
    }
    if (req.method === 'POST' && p === '/api/terminals') {   // a new chat in a folder — `claude`, or `task <name>` when the folder launches it so
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      const cwd = typeof body.cwd === 'string' ? body.cwd : null, task = typeof body.task === 'string' && body.task ? body.task : null;
      if (task && !(TASK_NAME.test(task) && (await launchersFor(cwd)).some(l => l.name === task))) return json(res, 400, { error: `no launcher named ${task} in ${cwd || '(no folder)'} — its Taskfile has ${(await launchersFor(cwd)).map(l => l.name).join(', ') || 'none'}` });
      const r = await spawnTerm({ cwd, cols: body.cols, rows: body.rows, task });
      return json(res, r.code, r);
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/terminal$/))) {   // attach to, or resume, this chat
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      const have = termOf(s);
      if (have && have.exited === null) return json(res, 200, { terminal: termSummary(have) });
      // Live elsewhere: same rule as replies — a second claude on one transcript is how it gets mangled.
      if (s.alive) return json(res, 409, { error: `this chat is live in ${s.live?.entrypoint === 'claude-vscode' ? 'VS Code' : 'another terminal'} — take it over, or continue it there` });
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      const r = await spawnTerm({ cwd: s.live?.cwd || s.cwd, sessionId: s.id, cols: body.cols, rows: body.rows });
      return json(res, r.code, r);
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/takeover$/))) {   // end every claude it is live in elsewhere, resume it here
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      const have = termOf(s);
      if (have && have.exited === null) {
        // Already here: this ends the others — VS Code's, when the chat was opened there again after a take-over.
        const others = s.rivals.map(r => r.pid);
        for (const pid of others) { const r = await endClaude(pid); if (!r.ok) return json(res, r.code, { error: r.error }); }
        loadRegistry();
        return json(res, 200, { terminal: termSummary(have), ended: others });
      }
      if (!s.alive || !s.live?.pid) return json(res, 409, { error: 'not live anywhere — open a terminal on it instead' });
      const cwd = s.live.cwd || s.cwd;   // before the registry entry goes
      for (const pid of [s.live.pid, ...s.rivals.map(r => r.pid)]) { const r = await endClaude(pid); if (!r.ok) return json(res, r.code, { error: r.error }); }
      loadRegistry();
      const t = await spawnTerm({ cwd, sessionId: s.id, cols: body.cols, rows: body.rows });
      return json(res, t.code, t);
    }
    if (req.method === 'DELETE' && (m = p.match(/^\/api\/terminals\/([\w-]+)$/))) {
      const t = terms.get(m[1]);
      if (!t) return json(res, 404, { error: 'unknown terminal' });
      killTerm(t);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/vscode-web') {   // VS Code Web for the pane: start it if need be, say where it is
      const r = await ensureVsWeb();
      return json(res, r.ok ? 200 : r.code, r.ok ? { url: r.url, started: r.started } : { error: r.error });
    }
    if (req.method === 'POST' && p === '/api/test-notify') {
      if (notificationsOn) nativeNotify('peixAIrada', 'test', 'Native notifications are working.');
      broadcast('alert', { kind: 'reply', sessionId: null, project: 'peixAIrada', title: 'Test notification', snippet: 'If you can read this, alerts work.', ts: new Date().toISOString(), quiet: !notificationsOn });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && p === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`event: snapshot\ndata: ${JSON.stringify({ sessions: sortedSummaries(), projects: projectList(), pins: pinned, hidden: hiddenProjects, peacock: peacockColors(), repos: repoUrls(), notify: NOTIFY, notifications: notificationsOn })}\n\n`);
      sseClients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
      return;
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: String(e?.stack || e) });
  }
});

server.on('upgrade', attachTermSocket);

// ---------------------------------------------------------------------------------------------
// Boot — only when run as the program. Imported (the tests), the module exposes its pure parts and does nothing.
// ---------------------------------------------------------------------------------------------
export { fold, newSession, summary, agentRunning, notePr, notePrs, prTitle, cleanPrompt, textOf, snippet, summarizeToolInput, toolResultSnippet, projectInput, writePeacock, readPeacock, termSummary, isDone, sessions, terms };
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main().catch(e => { console.error('[peixairada] boot failed:', e); process.exit(1); });
async function main() {
const t0 = Date.now();
scanProjects();
await adoptHolders();   // before the registry: a drawer's own process is what makes a chat's live process "mine"
loadRegistry();
indexing = false;
// Statuses alone could wait for a chat to be opened; titles cannot — they head every card, so the whole
// board needs them up front. Batched 40 to a GraphQL call, in the background, once per run.
for (const s of sessions.values()) queueSessionPrs(s);
pollPeacock();
setInterval(pollPeacock, PEACOCK_POLL_MS);
pollRepos();
setInterval(pollRepos, PEACOCK_POLL_MS);
for (const s of sessions.values()) if (s.alive) scanAgents(s);
// An agent gone quiet stops counting; a task past its expiry stops running. Both are only visible on a push, and
// a chat whose last word was "monitor started" has nothing else to push.
setInterval(() => {
  for (const s of sessions.values()) {
    if (!s.alive) continue;
    scanAgents(s);
    if (s.tasks?.size) { const n = s.tasks.size; runningTasks(s); if (s.tasks.size !== n) schedulePush(s); sweepTasks(s); }
  }
}, REGISTRY_POLL_MS);
console.log(`[peixairada] indexed ${sessions.size} sessions (${[...sessions.values()].filter(s => s.alive).length} alive) from ${CLAUDE_DIR} in ${Date.now() - t0}ms`);

const pendingFiles = new Map(), pendingAgents = new Map();
function onFsEvent(_ev, rel) {
  if (!rel) return;
  const parts = String(rel).split('/');
  if (parts.length === 4 && parts[2] === 'subagents' && parts[3].endsWith('.jsonl')) {   // <slug>/<id>/subagents/agent-*.jsonl
    const s = sessions.get(parts[1]); if (!s) return;
    clearTimeout(pendingAgents.get(s.id));
    pendingAgents.set(s.id, setTimeout(() => { pendingAgents.delete(s.id); scanAgents(s); }, 200));
    return;
  }
  if (parts.length !== 2 || !parts[1].endsWith('.jsonl')) return; // ignore memory/, <id>/subagents/*.meta.json, etc.
  const file = join(PROJECTS_DIR, rel);
  clearTimeout(pendingFiles.get(file));
  pendingFiles.set(file, setTimeout(() => { pendingFiles.delete(file); try { tailFile(file); } catch (e) { console.error('[peixairada] tail error', file, e); } }, 40));
}
if (existsSync(PROJECTS_DIR)) watch(PROJECTS_DIR, { recursive: true }, onFsEvent);
if (existsSync(SESSIONS_DIR)) {
  let regTimer;
  watch(SESSIONS_DIR, () => { clearTimeout(regTimer); regTimer = setTimeout(loadRegistry, 100); });
}
setInterval(loadRegistry, REGISTRY_POLL_MS);

// A busy port is waited for, not died on: the launchd agent starts while the app's own server still
// holds 7331, and the handoff is the app quitting a moment later — a crash here would only make
// launchd throttle and retry with noise in the log.
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`[peixairada] port ${PORT} is busy — trying again in 3 s`);
  setTimeout(() => server.listen(PORT, HOST), 3000);
});
server.listen(PORT, HOST, () => console.log(`[peixairada] listening on http://${HOST}:${PORT}  (notify=${NOTIFY}, terminals in ${TERMS_DIR})`));
}
