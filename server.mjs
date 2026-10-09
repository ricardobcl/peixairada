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
//      · the board's setup: CONFIG_FILE, the settings' Setup
//      · Peacock: the colour VS Code paints a folder with, from its .vscode/settings.json
//      · attachments: a file dropped on the board from a browser
//  Transcript parsing
//      · PRs mentioned in the chat
//      · …and the short ways of naming one (2026-10-06)
//      · …and whether they are open, merged or closed
//      · …and whose move it is
//      · Jira tickets named in the chat (2026-10-08)
//  Sub-agents: <slug>/<id>/subagents/agent-*.jsonl — one at work keeps the chat clauding
//      · background tasks: a monitor, or a command left running
//  Live-session registry (~/.claude/sessions/<pid>.json)
//  Notifications + SSE fan-out
//  Replying into a session
//      · Claude plan usage, for the chat list's footer: the numbers `/usage` shows in the CLI
//      · keeping the Mac awake: an idle-sleep assertion, and the lid's own setting (2026-10-08)
//  VS Code Web: the editor UI served by `code serve-web`, for the pane beside the board
//  Terminals: a real `claude` in a PTY, attached to from the page over a WebSocket
//      · the holder protocol: newline-delimited JSON over the holder's socket (see lib/termhold.mjs)
//      · launchers: a folder's own way to start claude
//      · the roots' folders: where the repos live, and cloning one that is not there yet
//      · the first run: where the repos live, guessed
//      · idle drawers: ended after DRAWER_IDLE_MS with no page on them
//      · who may ask: the board's own pages, and nothing a browser lets another site send
//  HTTP
//  Boot — only when run as the program. Imported (the tests), the module exposes its pure parts and does nothing.
// Map ▴


import { createServer } from 'node:http';
import {
  accessSync, chmodSync, closeSync, constants as fsc, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, watch, writeFileSync
} from 'node:fs';
import { connect as netConnect } from 'node:net';
import { basename, dirname, join, resolve } from 'node:path';
import { cpus, freemem, homedir, totalmem, userInfo } from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileP = promisify(execFile);
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
// The About box's facts (2026-09-27): the package's version, this process, and where the board reads and writes.
const PKG = (() => { try { return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')); } catch { return {}; } })();
const aboutInfo = () => ({ version: PKG.version || 'dev', node: process.version, pid: process.pid, port: PORT, claudeDir: CLAUDE_DIR, stateFile: STATE_FILE, configFile: CONFIG_FILE, since: SINCE, shell: basename(LOGIN_SHELL) });
const SINCE = Date.now();
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
// The setup — where the repos live, ⌥⌘O's project, the projects' short names and colours — is the user's, in a file of
// its own under ~/.config (2026-10-01): what someone sets once and may keep with their dotfiles, while the state file
// churns with every tick. $XDG_CONFIG_HOME moves it, CONFIG_FILE names it; a STATE_FILE of its own (every test server)
// takes it along beside it, so a server run on the side never reads or writes the real one.
const CONFIG_FILE = process.env.CONFIG_FILE
  || (process.env.STATE_FILE ? join(dirname(STATE_FILE), 'config.json') : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'peixairada', 'config.json'));

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
// The board's setup — the settings' Setup (2026-09-28), see cleanSetup below. What was set and nothing else: a key never
// set is the default, worked out when asked (boardConfig). Kept in CONFIG_FILE since 2026-10-01; the state file's
// `config` is read once more, to move it there.
let setup = {};
// Whose move each PR you wrote or reviewed was at, and since when the board has known it: url -> { key, at }
// (2026-09-28). A PR come round to you un-ticks the chats that mention it (isDone), weighed by `at` — kept here so a
// restart does not hand a move the board had already shown back to GitHub's own clock (moveTurn).
let prTurns = {};
// Keep the Mac awake — the chat header menu's switch (2026-10-08): a `caffeinate -i` of the server's own while it is
// on, and on again after a restart. The lid's setting is the system's and is read from it, never kept here (keepAwake).
let awakeOn = false;

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
  doneMarks = st.done || {};   // files from before 2026-09-19 also carry a `pins` key — ignored, gone on the next save
  projects = st.projects || {};
  titles = st.titles || {};
  pinned = Array.isArray(st.pinned) ? st.pinned.filter(k => typeof k === 'string') : [];
  hiddenProjects = Array.isArray(st.hidden) ? st.hidden.filter(k => typeof k === 'string') : [];
  envs = st.envs || {};
  notificationsOn = st.notifications !== false;
  setup = st.config;   // from before CONFIG_FILE — cleaned and moved there below, once what does it is defined
  prTurns = st.prTurns && typeof st.prTurns === 'object' ? st.prTurns : {};
  awakeOn = st.awake === true;
} catch (e) {
  if (e.code !== 'ENOENT') {
    const bad = `${stateFrom}.bad-${Date.now()}`;
    console.error(`[peixairada] the state file does not read (${e.message}) — kept as ${bad}, starting afresh`);
    try { renameSync(stateFrom, bad); } catch {}
  }
}
/** Written beside itself and renamed over (2026-10-03; in place before): a full disk or a kill mid-write left a
 *  truncated file, which the next boot read as no state at all. */
function saveState() {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ done: doneMarks, projects, titles, pinned, hidden: hiddenProjects, envs, notifications: notificationsOn, prTurns, awake: awakeOn }, null, 1));
    renameSync(tmp, STATE_FILE);
  } catch (e) { console.error('[peixairada] could not save state', e.message); }
}
// A tick lasts until something newer happens in the chat — or on one of its PRs, once that PR has come round to you
// (a push since your review, a reply, a review on yours: prTurn), which is what a tick after a review waits for.
const isDone = s => {
  const at = doneMarks[s.id];
  return !!at && at >= (s.lastActivity || '') && s.prs.every(p => !p.turn?.you || at >= p.turn.movedAt);
};

// ---- the board's setup: CONFIG_FILE, the settings' Setup ------------------------------------------------------------
// What had been written into this file and the page for one Mac — the directory the repos live in and the GitHub org
// they come from, ⌥⌘O's folder, the short names and colours given by hand — is the settings' since the board went to
// colleagues (2026-09-28), and the server's, so the app
// and every browser agree: in the state file's `config` at first, in CONFIG_FILE of its own since 2026-10-01. A key
// never set is the default: the roots are ORG_DIR / ORG's when either is in the environment (the tests', a server run
// by hand), else none — and the page asks, once (`ask`); no ⌥⌘O folder; no names or colours of the board's own. A
// root's org is what ＋ clone asks GitHub for — a root without one lists its folders and clones nothing.
const ORG_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;   // GitHub's rule for an account's name
const expandHome = p => p.trim().replace(/^~(?=\/|$)/, homedir());
/**
 * The setup as the state file or a PUT hands it over, down to what the board uses. `strict` (a PUT) says what is wrong
 * instead of dropping it, and asks whether each root is a folder here; the state file's are only shaped, so a folder
 * gone for a while (an unplugged disk) is not forgotten. Only the keys given come back: a PUT replaces those alone.
 */
function cleanSetup(c, strict = false) {
  const out = {}, fail = error => ({ setup: null, error });
  if (!c || typeof c !== 'object') return strict ? fail('expected {roots?, quick?, projects?, jira?}') : { setup: out };
  if ('roots' in c) {
    if (!Array.isArray(c.roots)) { if (strict) return fail('roots: expected a list of {dir, org}'); }
    else {
      out.roots = [];
      for (const r of c.roots.slice(0, 20)) {
        const dir = typeof r?.dir === 'string' ? expandHome(r.dir) : '', org = typeof r?.org === 'string' ? r.org.trim() : '';
        const bad = !dir.startsWith('/') ? `"${r?.dir ?? ''}" is not a path — /… or ~/…` : org && !ORG_NAME.test(org) ? `"${org}" is not a GitHub org` : strict && !isDir(dir) ? `${dir} is not a folder here` : '';
        if (bad) { if (strict) return fail(bad); continue; }
        const at = resolve(dir);
        if (!out.roots.some(x => x.dir === at)) out.roots.push({ dir: at, org });
      }
    }
  }
  if ('quick' in c) {
    const q = typeof c.quick === 'string' ? c.quick.trim() : '';
    if (q.length > 200 || q.includes('/')) { if (strict) return fail('quick: a project\'s name, not a path'); }
    else out.quick = q || null;
  }
  if ('projects' in c) {
    if (!c.projects || typeof c.projects !== 'object' || Array.isArray(c.projects)) { if (strict) return fail('projects: expected {name: {abbr?, color?}}'); }
    else {
      out.projects = {};
      for (const [name, v] of Object.entries(c.projects).slice(0, 200)) {
        const abbr = typeof v?.abbr === 'string' ? v.abbr.trim() : '', color = typeof v?.color === 'string' ? v.color.trim().toLowerCase() : '';
        const bad = !name.trim() || name.length > 200 ? 'a project needs a name' : abbr.length > 6 ? `${name}: a short name is 6 letters at most` : color && !/^#[0-9a-f]{6}$/.test(color) ? `${name}: a colour is #rrggbb` : '';
        if (bad) { if (strict) return fail(bad); continue; }
        if (abbr || color) out.projects[name] = { ...abbr && { abbr }, ...color && { color } };
      }
    }
  }
  if ('jira' in c) {   // the Jira Cloud site and your login there (2026-10-08) — the token is kept apart, never in this file
    const j = c.jira, site = jiraSite(j?.site), email = typeof j?.email === 'string' ? j.email.trim() : '';
    if (j === null || (!site && !email && (!j || typeof j === 'object'))) out.jira = null;
    else if (!site) { if (strict) return fail(`"${j?.site ?? ''}" is not a Jira site — https://acme.atlassian.net`); }
    else if (!/^[^\s"\\@]+@[^\s"\\@]+$/.test(email)) { if (strict) return fail(`"${email}" is not an email — the one you sign in to Jira with`); }
    else out.jira = { site, email };
  }
  return { setup: out };
}
/** A Jira site as its origin — https://acme.atlassian.net — or null; http only on this Mac (a test's fake). */
function jiraSite(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  let u; try { u = new URL(/^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`); } catch { return null; }
  return u.protocol === 'https:' || (u.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(u.hostname)) ? u.origin : null;
}
const envRoots = () => process.env.ORG_DIR || process.env.ORG ? [{ dir: resolve(expandHome(process.env.ORG_DIR || join(homedir(), process.env.ORG))), org: process.env.ORG || '' }] : [];
/** The setup the board runs on: what was set, the defaults for the rest — and, for the page, the file it lives in,
 *  why that file cannot be read (while it cannot), and whether the repos' folder was never answered (`ask`: the
 *  welcome). The three ride along on every answer and event; a PUT that hands them back is not read for them. */
const boardConfig = () => ({ roots: setup.roots ?? envRoots(), quick: setup.quick ?? null, projects: setup.projects ?? {}, jira: setup.jira ?? null,
  file: CONFIG_FILE, error: configError, ask: !configError && setup.roots === undefined && !envRoots().length });
const tildePath = p => p === homedir() || p.startsWith(homedir() + '/') ? '~' + p.slice(homedir().length) : p;
// The file is the user's as much as the board's: written with two spaces and `~/…` for a folder under the home, so it
// reads by hand and travels with dotfiles; in place, never by a rename, so a symlink into a dotfiles repo stays one. A
// file that does not parse is said in the Setup and never written over — the board keeps what it had until it reads.
let configError = null;
let configStamp = 0;   // its mtime as last read or written: the poll's news is a change of it
const CONFIG_POLL_MS = Number(process.env.CONFIG_POLL_MS || 2000);   // a test server's is 200 ms
function readConfigFile() {
  let txt;
  try { txt = readFileSync(CONFIG_FILE, 'utf8'); } catch (e) { return e.code === 'ENOENT' ? { missing: true } : { error: `${tildePath(CONFIG_FILE)}: ${e.message}` }; }
  try { const c = JSON.parse(txt); if (c && typeof c === 'object' && !Array.isArray(c)) return { setup: c }; } catch (e) { return { error: `${tildePath(CONFIG_FILE)} does not parse — ${e.message}` }; }
  return { error: `${tildePath(CONFIG_FILE)} is not a JSON object` };
}
function saveConfig() {
  const out = {};
  if (setup.roots) out.roots = setup.roots.map(r => ({ dir: tildePath(r.dir), org: r.org }));
  if ('quick' in setup) out.quick = setup.quick;
  if (setup.projects) out.projects = setup.projects;
  if ('jira' in setup) out.jira = setup.jira;
  try { mkdirSync(dirname(CONFIG_FILE), { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(out, null, 2) + '\n'); configStamp = statSync(CONFIG_FILE).mtimeMs; return null; }
  catch (e) { console.error('[peixairada] could not save the setup', e.message); return e.message; }
}
setup = cleanSetup(setup).setup;   // the state file's, from before CONFIG_FILE — all an import of this module (a test) sees
/** At boot, and only then: the setup from CONFIG_FILE — moved there from the state file the first time. Never on an
 *  import: test/agents.test.mjs imports this module with no STATE_FILE of its own, and ran the move against this
 *  Mac's real files the first time it was written at the top level. */
function loadConfig() {
  const r = readConfigFile();
  if (r.setup) setup = cleanSetup(r.setup).setup;
  else if (r.error) { setup = {}; configError = r.error; console.error(`[peixairada] ${r.error} — the setup waits for it to read`); }
  else if (Object.keys(setup).length && !saveConfig()) { console.log(`[peixairada] moved the setup to ${CONFIG_FILE}`); saveState(); }   // out of the state file, for good
  try { configStamp = statSync(CONFIG_FILE).mtimeMs; } catch {}
}
/** CONFIG_FILE changed under the board — a hand edit, a dotfiles checkout, a delete to start over: every page follows
 *  within seconds (a `config` event); a file that stopped parsing leaves the board as it was and says why. */
function reloadConfig() {
  let at = 0; try { at = statSync(CONFIG_FILE).mtimeMs; } catch {}
  if (at === configStamp) return;
  configStamp = at;
  const before = JSON.stringify(boardConfig()), r = readConfigFile();
  if (r.error) { if (r.error !== configError) console.error(`[peixairada] ${r.error}`); configError = r.error; }
  else { setup = r.setup ? cleanSetup(r.setup).setup : {}; configError = null; }
  if (JSON.stringify(boardConfig()) !== before) { folderCache.clear(); broadcast('config', boardConfig()); jiraReset(); }
}

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
/** The text with its comments blanked to spaces, every offset kept (newlines too): what the regexes below read, so a
 *  key or a brace inside a comment is neither read nor written into (2026-10-03: a `{` in a comment above the object
 *  took the inserted key, and a commented-out colour won over the live one). */
const bareJsonc = txt => txt.replace(/("(?:[^"\\\n]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? m.replace(/[^\n]/g, ' '));
function readPeacock(cwd, prev) {
  const file = peacockFile(cwd);
  if (!file) return prev && !prev.file ? prev : { file: null, mtime: 0, color: null };
  let mtime = 0;
  try { mtime = statSync(file).mtimeMs; } catch { return { file: null, mtime: 0, color: null }; }
  if (prev && prev.file === file && prev.mtime === mtime) return prev;
  let color = null;
  try {
    const txt = bareJsonc(readFileSync(file, 'utf8'));
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
// `git@github.com-work:` too — an SSH host alias, the usual way to keep two GitHub accounts apart
const GH_REMOTE = /github\.com(?:-[\w.-]+)?[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?\s*$/;
const ghRepoUrl = remote => { const m = GH_REMOTE.exec(String(remote)); return m ? `https://github.com/${m[1]}/${m[2]}` : null; };
/** The same repository as `{owner, name}`, read from the checkout's git config rather than asked of git — a chat's `#12`
 *  is resolved as its line is read, the boot's included (2026-10-06). A worktree's `.git` is a file naming its own git
 *  dir, whose `commondir` is the repo's. Kept an hour, as `repos` is; null for no checkout or an origin not on GitHub. */
const checkouts = new Map();   // cwd -> { at, repo }
function ghRepoOf(cwd, now = Date.now()) {
  if (!cwd) return null;
  const hit = checkouts.get(cwd); if (hit && now - hit.at < REPO_TTL_MS) return hit.repo;
  let repo = null;
  const top = checkoutOf(cwd);
  if (top) try {
    let git = join(top, '.git');
    if (!statSync(git).isDirectory()) {
      git = resolve(top, /^gitdir:\s*(.+)$/m.exec(readFileSync(git, 'utf8'))[1].trim());
      try { git = resolve(git, readFileSync(join(git, 'commondir'), 'utf8').trim()); } catch {}
    }
    const m = GH_REMOTE.exec(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(readFileSync(join(git, 'config'), 'utf8'))?.[1] || '');
    if (m) repo = { owner: m[1], name: m[2] };
  } catch {}
  checkouts.set(cwd, { at: now, repo });
  return repo;
}
const repoUrls = () => Object.fromEntries([...repos].filter(([, v]) => v.url).map(([c, v]) => [c, v.url]));
function pollRepos() {
  const want = peacockCwds(); let changed = false;
  for (const c of [...repos.keys()]) if (!want.has(c)) { repos.delete(c); changed = true; }
  // Six a poll (every 3 s), not every folder at once (2026-10-03: forty gits at boot and again each hour, all on one
  // poll); and an answer that is no answer — git timed out, or is not there — keeps the URL known before. Only "no
  // origin" (2) and "not a repo" (128) say there is none.
  const due = [...want].filter(c => !repos.has(c) || Date.now() - repos.get(c).at > REPO_TTL_MS).slice(0, 6);
  const git = due.length && findBin('git', '⌥⌘G opens no repo');
  if (!git) { if (changed) broadcast('repos', { repos: repoUrls() }); return; }
  let left = due.length;
  for (const cwd of due) {
    const prev = repos.get(cwd); repos.set(cwd, { url: prev?.url || null, at: Date.now() });   // claimed: not asked twice while git answers
    execFile(git, ['-C', cwd, 'remote', 'get-url', 'origin'], { timeout: 5000 }, (err, out) => {
      const url = !err ? ghRepoUrl(out) : err.code === 2 || err.code === 128 ? null : prev?.url || null;
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
  // Every match is made on the comment-blanked copy, and the edit made at its offsets in the text itself.
  const splice = (a, b, put = '') => { txt = txt.slice(0, a) + put + txt.slice(b); };
  /** Take one key out: its line when it has one to itself, else the key alone — and the comma before it when it was
   *  the object's last property. */
  const drop = key => {
    const t = bareJsonc(txt);
    const m = new RegExp(`^[ \\t]*"${key}"\\s*:\\s*"[^"]*"\\s*,?[ \\t]*(?:\\r?\\n|$)`, 'm').exec(t) || new RegExp(`"${key}"\\s*:\\s*"[^"]*"\\s*,?\\s*`).exec(t);
    if (!m) return false;
    splice(m.index, m.index + m[0].length);
    const t2 = bareJsonc(txt), before = t2.slice(0, m.index).trimEnd();
    if (/^\s*}/.test(t2.slice(m.index)) && before.endsWith(',')) splice(before.length - 1, before.length);
    return true;
  };
  if (color) {
    const t = bareJsonc(txt), m = /("peacock\.color"\s*:\s*")([^"]*)"/.exec(t);
    if (m) splice(m.index + m[1].length, m.index + m[1].length + m[2].length, color);
    else if (!t.trim()) txt = `{\n  "peacock.color": "${color}"\n}\n`;
    else {
      const i = t.indexOf('{');
      if (i < 0) throw new Error(`${file} does not look like a JSON object`);
      const empty = /^\s*}/.test(t.slice(i + 1));
      splice(i + 1, i + 1, `\n  "peacock.color": "${color}"` + (empty ? (/^\s*\n/.test(txt.slice(i + 1)) ? '' : '\n') : ','));
    }
  } else {
    const was = readPeacock(cwd)?.color;
    if (!drop('peacock\\.color')) return { file, changed: false };
    // Peacock's own activity-bar colour is the reading's fallback, and it is the colour just taken out: it goes too,
    // or the colour let go of came straight back (2026-10-03). Only when it is that colour — one set by hand stays.
    const bar = /"activityBar\.background"\s*:\s*"(#[0-9a-fA-F]{6})"/.exec(bareJsonc(txt));
    if (was && bar && bar[1].toLowerCase() === was) drop('activityBar\\.background');
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
/** The body's bytes, up to `max`. Past it the rest is drained, not read, and the promise rejects — the request is
 *  left alive, so the refusal reaches the page (2026-10-03: a destroyed request took its socket with it, and the 413
 *  was written nowhere). A route that refuses this way closes the connection after its answer. */
function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    if (Number(req.headers['content-length']) > max) { req.resume(); return reject(new Error('too large')); }
    req.on('data', c => { n += c.length; if (n <= max) chunks.push(c); else chunks.length = 0; });
    req.on('end', () => n <= max ? resolve(Buffer.concat(chunks)) : reject(new Error('too large')));
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
const gitTracked = file => new Promise(resolve => { const git = findBin('git', 'whether a settings file is tracked goes unsaid'); if (!git) return resolve(false); execFile(git, ['-C', dirname(file), 'ls-files', '--error-unmatch', file], { timeout: 5000 }, err => resolve(!err)); });

const projectList = () => Object.values(projects).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
// name: non-empty, one line; cwds: absolute paths, deduplicated. Nothing checks they exist — a project
// can name a folder before its first chat runs there.
function projectInput(body, prev = {}) {
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
function newSession(id, file) {
  return {
    id, file, gen: ++sessionGen,
    slug: file ? basename(dirname(file)) : null,
    cwd: null, gitBranch: null, model: null,
    title: null, customTitle: null, lastPrompt: null, lastReply: null, prs: [], tickets: [], ticketBranch: null,
    status: 'unknown', statusSince: null, lastActivity: null, lastUserAt: null, lastReplyAt: null, turnStart: null,
    startedAt: null,   // when a chat with no transcript yet came to be (loadRegistry) — the card's time and place until a first word lands
    openedAt: null,    // when a page last opened the chat (ms): its PRs are polled as if it had just been touched (prEvery)
    live: null, alive: false, entrypoint: null, entrypointAt: null,   // last 'entrypoint' a user/assistant line carried ('claude-vscode' | 'cli'), and when
    rivals: [],   // other live processes on this chat (registry entries beyond `live`) — see inVsCode()
    entries: [], entryCount: 0, loaded: false,
    offset: 0, partial: '', dec: null, reading: false, truncatedHead: false,   // where the tail reads from, its unfinished line and character (indexFile)
    agentsRunning: 0, ask: null, tasks: null, taskCalls: null,   // sub-agents at work (scanAgents); the question a tool asked; background tasks and the calls that started them
    pendingNotify: null, notifyTimer: null, pushTimer: null, newEntries: []
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
// slash command's dialog you opened yourself (/model, /config), at that terminal already (2026-09-23).
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

function summary(s, ti = null) {   // `ti`: termIndex(), when the whole board is summarized at once
  const prT = prTitle(s), status = statusOf(s), mine = ti ? ti.get(s.id) || NO_TERMS : { term: termOf(s), shell: shellOf(s) };
  return {
    // Prefer the registry cwd: transcript lines record the shell's *current* directory, which moves with `cd`.
    id: s.id, slug: s.slug, cwd: s.live?.cwd || s.cwd, project: basename(s.live?.cwd || s.cwd || '') || s.slug,
    gitBranch: s.gitBranch, model: s.model,
    // The PR title beats Claude's own: it is what the work is called everywhere else — the PR page, the
    // branch, standup. A title the user typed still wins over both.
    title: titles[s.id] || s.customTitle || prT || s.title || s.lastPrompt || (!s.lastActivity && s.alive ? '(no messages yet)' : '(untitled)'),
    aiTitle: s.title, customTitle: s.customTitle, prTitle: prT, boardTitle: titles[s.id] || null,
    lastPrompt: s.lastPrompt, lastReply: s.lastReply, prs: s.prs.filter(shownPr), tickets: shownTickets(s),
    // A live process with no transcript yet is an empty, idle panel (e.g. restored by VS Code, never prompted).
    // Not alive = the Claude process is gone: 'stale'. Resuming the chat registers a new pid and it comes back.
    status,
    agents: s.agentsRunning || 0,   // sub-agents at work — what keeps the status 'working' past the main turn's end
    tasks: runningTasks(s),         // monitors and background commands still running behind the turn
    // the question it is waiting on and which tool asked, when the transcript has it; else only what the registry
    // says it is waiting for — the question itself is written with its answer (see waitingOn)
    ask: status !== 'needs-input' ? null : s.status === 'needs-input' && s.ask ? s.ask : { tool: null, text: null, options: 0, waitingFor: waitingOn(s) || null },
    rawStatus: s.status, statusSince: s.statusSince, lastActivity: s.lastActivity, startedAt: s.startedAt,
    lastUserAt: s.lastUserAt, lastReplyAt: s.lastReplyAt,
    alive: s.alive, live: s.live, entrypoint: s.live?.entrypoint || s.entrypoint, terminal: termSummary(mine.term), shell: termSummary(mine.shell), entryCount: s.entryCount, loaded: s.loaded, file: s.file,
    env: envs[s.id] || mine.term?.task || null,   // the launcher it was started with (⌥⌘O groups oracle's chats by it)
    // the other live processes on this chat, and who wrote its last turn — the page's "VS Code too" warning
    rivals: s.rivals, tailEntrypoint: s.entrypoint, tailEntrypointAt: s.entrypointAt,
    done: isDone(s), doneAt: doneMarks[s.id] || null
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

/** At most `n` UTF-16 units, never half an emoji: a cut between a surrogate pair left a lone one, a U+FFFD on the page. */
const cut = (t, n) => t.length > n ? t.slice(0, n).replace(/[\uD800-\uDBFF]$/, '') : t;
function snippet(text, n = 240) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? cut(t, n - 1) + '…' : t;
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
 * Most recently mentioned first, so the header leads with the PR in play now. `ref` is how a short reference named it
 * (`bare`, a `#12`; `repo`, with its repo — see below); a URL or a pr-link line has none, and makes the PR the chat's
 * whatever GitHub says.
 */
/** A PR's one spelling: GitHub's owner and repo names are any case, so `Acme/Widgets` and `acme/widgets` were two PRs —
 *  two chips, two turns, two alerts for one move (2026-10-03). The label keeps the case first seen. */
const prKey = (owner, repo, n) => `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}/pull/${n}`;
function notePr(s, url, ts, by, ref = null) {
  const m = PR_ONE.exec(url);
  if (!m && (ref || !/^https?:\/\//i.test(url))) return;   // a pr-link that is no web address is nothing to put in an href
  const clean = m ? prKey(m[1], m[2], m[3]) : url;
  if (ref && noPr.has(clean)) return;
  const at = s.prs.findIndex(p => p.url === clean);
  const pr = at >= 0 ? s.prs.splice(at, 1)[0] : {
    url: clean, repo: m ? m[2] : null, number: m ? Number(m[3]) : null,
    // The owner rarely disambiguates and eats half the width of the chip; the URL is in the tooltip.
    label: m ? `${m[2]}#${m[3]}` : clean.replace(/^https?:\/\/(www\.)?github\.com\//, ''),
    count: 0, by: null, firstAt: ts, ref,
    state: prStatus.get(clean)?.state ?? null, title: prStatus.get(clean)?.title ?? null, turn: prStatus.get(clean)?.turn ?? null, people: prStatus.get(clean)?.people ?? null, checks: prStatus.get(clean)?.checks ?? null
  };
  if (!ref) pr.ref = null; else if (ref === 'repo' && pr.ref) pr.ref = 'repo';
  if (by) { pr.count++; pr.by = by; }
  pr.lastAt = ts || pr.lastAt || null;
  s.prs.unshift(pr);
  if (s.prs.length > MAX_PRS) s.prs.length = MAX_PRS;
  if (!indexing) queuePr(clean);   // at boot this would ask GitHub about every PR in every transcript
}

/** Scan one message, in the order it says things. A PR said twice in it counts once, where first said, and as the
 *  fullest of the ways it was said: a URL, then a short reference with its repo, then a bare `#12`. */
const SAID_AS = { bare: 1, repo: 2 };
function notePrs(s, text, ts, by) {
  if (!text) return;
  text = String(text);
  const said = new Map();
  const urls = text.includes('/pull/') ? [...text.matchAll(PR_RE)].map(m => ({ at: m.index, url: m[0], key: prKey(m[1], m[2], m[3]), ref: null })) : [];
  for (const r of [...urls, ...text.includes('#') ? refsIn(s, text) : []].sort((a, b) => a.at - b.at)) {
    const f = said.get(r.key);
    if (!f) said.set(r.key, r); else if ((SAID_AS[r.ref] ?? 3) > (SAID_AS[f.ref] ?? 3)) Object.assign(f, { url: r.url, ref: r.ref });
  }
  for (const r of said.values()) notePr(s, r.url, ts, by, r.ref);
}

// ---- …and the short ways of naming one (2026-10-06) ----------------------------------------------------------------
// `#12` is the chat's own repo's PR; `widgets#12` the setup's org's — the root's holding a checkout of that name, else
// the root's the chat's folder is under, else the one root's with an org — or the chat's own repo, by its name;
// `acme/widgets#12` as written. So is `widgets #12`, Claude's own way of writing it, when `widgets` is the chat's repo
// or a checkout under a root; and a list after any of them (`widgets #12, #14 and #15`) is that repo's too. A short
// reference is no PR until GitHub says so: it stays off the chat (`shownPr`) until the call that asks for its state
// finds a PR there, and is let go when GitHub has none (`forgetRef`: an issue's number, a repo that is not there). A
// bare `#12` names something current as well: one that comes to a PR merged or closed long before it was said is a
// review's numbered point, not the chat's PR — its own repo's #3 is years old (REF_AGE_MS) —, and no short reference
// to such a PR titles the card (`pastRef`). Code is not prose — GitHub links no `#12` in it, and `#333` is a colour
// there — and neither is a link's text, whose URL says which PR.
const REF_RE = /(?:(?<![\w/.&#-])(?:([A-Za-z0-9][\w-]*)\/)?([A-Za-z0-9][\w.-]*)|(?<![\w&#]))#([1-9]\d{0,5})(?![\w-])/g;
const NOT_PROSE = /```[\s\S]*?(?:```|$)|`[^`\n]*`|\[[^\]\n]*\]\([^)\s]*\)|https?:\/\/\S+/g;
const NOT_REPO = /^(?:prs?|pulls?|issues?)$/i;                        // `PR#12` is the chat's own #12
const NAME_BEFORE = /([A-Za-z0-9][\w.-]*)[*_]*[ \t]+(?:PRs?[ \t]+)?$/i;   // `widgets #12`, `**widgets** PR #12`
const LIST_GAP = /^(?:[ \t*_,/&]|\band\b|\bor\b)*$/;               // `#12, #14 and #15`, `#12/#14` — on one line
const REF_AGE_MS = 90 * 24 * 60 * 60_000;
const noPr = new Set();   // where GitHub had no PR: not taken up again from a short reference until a restart
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

/** The org a repo named alone is under, from a chat in `cwd`: the root's the folder is in, else the one root's with an org. */
function orgFor(cwd) {
  const roots = boardConfig().roots.filter(r => r.org);
  return (roots.find(r => cwd && (cwd === r.dir || cwd.startsWith(r.dir + '/'))) || (roots.length === 1 ? roots[0] : null))?.org || null;
}
/** A checkout under a root by its name, any case: `{name, org}`, the name as the folder spells it. */
const rootNames = new WeakMap();   // foldersIn's list (kept while the root's mtime is) -> its checkouts by lower-case name
function checkoutNamed(name) {
  for (const r of boardConfig().roots) {
    const list = foldersIn(r.dir);
    let by = rootNames.get(list);
    if (!by) rootNames.set(list, by = new Map(list.filter(f => f.git).map(f => [f.name.toLowerCase(), f.name])));
    const hit = by.get(name.toLowerCase()); if (hit) return { name: hit, org: r.org };
  }
  return null;
}

/** Every short reference in one message, each as the PR it comes to from this chat and where it stands in the text. */
function refsIn(s, text) {
  // what is not prose blanked out, every character where it was: a newline breaks a list and parts a name from its #
  const prose = text.replace(NOT_PROSE, c => c[0] !== '`' || c[1] === '`' ? '\n'.repeat(c.length) : ` ${c.slice(1, -1).replace(/#/g, ' ')} `);
  const cwd = s.live?.cwd || s.cwd, own = ghRepoOf(cwd), out = [];
  const repoOf = (owner, name) => {
    if (owner) return { owner, name };
    if (!name || (own && sameName(own.name, name))) return own;
    const c = checkoutNamed(name), org = c?.org || orgFor(cwd) || own?.owner;
    return org ? { owner: org, name: c?.name || name } : null;
  };
  let prev = null;   // the reference before, and where it ended
  for (const m of prose.matchAll(REF_RE)) {
    let [, owner, name] = m, kind = 'repo';
    if (!owner && name && NOT_REPO.test(name)) name = undefined;
    if (!name) {
      const w = NAME_BEFORE.exec(prose.slice(Math.max(0, m.index - 80), m.index))?.[1];
      if (w && ((own && sameName(own.name, w)) || checkoutNamed(w))) name = w;
      else if (prev && LIST_GAP.test(prose.slice(prev.end, m.index))) ({ owner, name, kind } = prev);
      else kind = 'bare';
    }
    prev = { owner, name, kind, end: m.index + m[0].length };
    const r = repoOf(owner, name);
    if (r) out.push({ at: m.index, url: `https://github.com/${r.owner}/${r.name}/pull/${m[3]}`, key: prKey(r.owner, r.name, m[3]), ref: kind });
  }
  return out;
}

/** A short reference to a PR merged or closed, and opened over REF_AGE_MS before it was said: a reference to the past,
 *  never the chat's own work — a bare one is not shown, and none titles the card. */
function pastRef(p) {
  if (!p.ref || p.state === 'open' || p.state === 'draft') return false;
  const made = Date.parse(prStatus.get(p.url)?.created);
  return !!made && made < (Date.parse(p.firstAt) || Date.now()) - REF_AGE_MS;
}
/** Whether the chat shows a PR: one said in full always; a short reference once GitHub has found a PR there. */
const shownPr = p => !p.ref || (!!p.state && (p.ref === 'repo' || !pastRef(p)));

/** GitHub has no PR there: every chat that had it only from a short reference lets it go, and none takes it up again. */
function forgetRef(url) {
  noPr.add(url);
  for (const s of sessions.values()) {
    const at = s.prs.findIndex(p => p.url === url && p.ref);
    if (at >= 0) { s.prs.splice(at, 1); schedulePush(s); }
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
  const titled = s.prs.filter(p => p.title && shownPr(p) && !pastRef(p));
  if (!titled.length) return null;
  const open = titled.filter(p => p.state === 'open' || p.state === 'draft');
  return (open.length ? open : titled)
    .reduce((a, b) => (String(a.firstAt || '') <= String(b.firstAt || '') ? a : b)).title;
}

// ---- …and whether they are open, merged or closed --------------------------------------------
// The transcript never says, so the colour comes from GitHub through `gh` — the user's own
// authenticated CLI, which reads its token from its config and so works from the app's bare
// launchd environment too. One GraphQL call covers a whole batch. Every PR is asked about once per
// run — titles head every card — and then **polled by how recently its chat was touched** (2026-09-28;
// nothing polled before, so a PR merged on GitHub stayed open on the card until its chat was opened):
// touched is a word in the chat, or a page opening it. A chat past the last row of PR_POLL is not
// polled at all; opening it asks at once and makes it recent again. A PR said again live, or on the
// chat being opened, is asked about unless it was within PR_TTL_MS.
const PR_POLL = [                       // [touched within, asked every]
  [60 * 60_000, 60_000],                // the last hour: every minute
  [24 * 60 * 60_000, 5 * 60_000],       // the last day: every five minutes
  [3 * 24 * 60 * 60_000, 30 * 60_000]   // the last three days: every half hour
];
// A PR you wrote or reviewed is also watched by its own clock (2026-09-28): a chat goes quiet exactly while you wait on
// someone, and the push or the reply that answers you is the news. By the newest thing on the PR (prTurn's `last`).
const PR_WATCH_MS = Number(process.env.PR_WATCH_MS || 2 * 60_000);
const PR_WATCH = [                      // [the PR's last event within, asked every]
  [2 * 24 * 60 * 60_000, PR_WATCH_MS],       // the last two days: every two minutes
  [14 * 24 * 60 * 60_000, 5 * PR_WATCH_MS]   // the last two weeks: every ten
];
const PR_TTL_MS = Number(process.env.PR_TTL_MS || 30_000);
const PR_TTL_ERROR_MS = 60 * 60_000;   // a PR we cannot see (private, deleted, no access): back off
const PR_BATCH = 40;
const prStatus = new Map();            // url -> { state, title, turn, people, checkedAt }
const prQueue = new Set();
let prTimer = null, prBusy = false;
let prAsking = new Set();              // the batch gh is being asked about now: a sweep or a mention meanwhile waits for it
let prPause = 0, prPauseUntil = 0;     // gh failing as a whole (offline, rate-limited): the polls back off, 1 min doubling to 30

/** Asked about within `ttl`. Merged and closed are terminal — never asked about twice. */
function prFresh(url, ttl = PR_TTL_MS, now = Date.now()) {
  const e = prStatus.get(url);
  if (!e) return false;
  if (!e.missing && (e.state === 'merged' || e.state === 'closed')) return true;
  return now - e.checkedAt < (e.state && !e.missing ? ttl : Math.max(ttl, PR_TTL_ERROR_MS));
}

const touchedAt = s => Math.max(Date.parse(s.lastActivity) || 0, s.openedAt || 0);
/** How often a chat's PRs are polled, by how long ago it was touched; Infinity past PR_POLL's last row. */
function prEvery(s, now = Date.now()) {
  const age = now - touchedAt(s);
  return PR_POLL.find(([within]) => age < within)?.[1] ?? Infinity;
}
/** How often a PR with a turn is polled for its own sake, by its newest event; Infinity without one, or past PR_WATCH. */
function prWatch(url, now = Date.now()) {
  const last = Date.parse(prStatus.get(url)?.turn?.last);
  return last ? PR_WATCH.find(([within]) => now - last < within)?.[1] ?? Infinity : Infinity;
}

/**
 * The PRs due a look, the most recently touched chat's first: never asked about, or not since the most
 * eager chat mentioning it — or the PR's own watch — asks for. At boot that is every PR, the chats in play first.
 */
function duePrs(list, now = Date.now()) {
  const every = new Map();   // url -> the shortest interval a chat mentioning it asks for
  for (const s of [...list].sort((a, b) => touchedAt(b) - touchedAt(a))) {
    const ms = prEvery(s, now);
    for (const pr of s.prs) if (!(every.get(pr.url) <= ms)) every.set(pr.url, ms);
  }
  return [...every].filter(([url, ms]) => !prFresh(url, Math.min(ms, prWatch(url, now)), now)).map(([url]) => url);
}

/** On the registry poll, and once at boot. */
function sweepPrs() {
  if (Date.now() < prPauseUntil) return;
  for (const url of duePrs(sessions.values())) queuePr(url, 0);   // 0: duePrs has judged it already
}

function queuePr(url, ttl = PR_TTL_MS) {
  if (prQueue.has(url) || prAsking.has(url) || prFresh(url, ttl)) return;
  prQueue.add(url);
  prTimer ??= setTimeout(() => { prTimer = null; drainPrQueue(); }, 250);
}

/** Whatever a chat's header and card will show, refreshed if it has aged out. */
function queueSessionPrs(s) { for (const pr of s.prs) queuePr(pr.url); }

/** What GitHub said of one PR: `found` is prTurn's answer, undefined for a PR it would not show us — `missing`, whose
 *  state and title are what was known before (2026-10-03: they were wiped, and the card's title fell back to Claude's
 *  over an SSO prompt or one field GitHub would not resolve), asked again an hour later. */
function setPrInfo(url, state, title, found, now = Date.now(), people, missing = false, created = null, checks = null) {
  const chats = [...sessions.values()].filter(s => s.prs.some(p => p.url === url));
  const ticked = chats.filter(isDone);
  const { turn, moved, from } = moveTurn(url, found, now);
  const known = prStatus.get(url);
  if (people === undefined) people = known?.people ?? null;   // a PR we could not see: who we knew of stands
  if (missing) { state = known?.state ?? null; title = known?.title ?? null; checks = known?.checks ?? null; }
  prStatus.set(url, { state, title, turn, people, checks, checkedAt: now, missing, created: created ?? known?.created ?? null });   // created: shownPr's
  const same = JSON.stringify(turn), faces = JSON.stringify(people);
  for (const s of chats) {
    const pr = s.prs.find(p => p.url === url);
    if (pr.state !== state || pr.title !== title || pr.checks !== checks || JSON.stringify(pr.turn ?? null) !== same || JSON.stringify(pr.people ?? null) !== faces) { pr.state = state; pr.title = title; pr.turn = turn; pr.people = people; pr.checks = checks; schedulePush(s); }
  }
  // Said once, as the ball comes back to you — or when a chat you had ticked comes back with it.
  if (moved && (from === 'them' || ticked.some(s => !isDone(s)))) notifyPr(url, turn, chats);
}

function drainPrQueue() {
  if (prBusy || !prQueue.size) return;
  const bin = ghBin();
  if (!bin) { prQueue.clear(); return; }   // no gh (yet: findBin looks again in a minute)
  const take = [...prQueue].slice(0, PR_BATCH);
  const batch = [], parts = [];
  for (const url of take) {
    prQueue.delete(url);
    const m = PR_ONE.exec(url);
    if (!m) continue;
    // owner/repo/number came out of PR_RE, so they cannot break out of the query string
    parts.push(`p${batch.length}: repository(owner: "${m[1]}", name: "${m[2]}") { pullRequest(number: ${m[3]}) { ${PR_FIELDS} } }`);
    batch.push(url);
  }
  if (!batch.length) return drainPrQueue();
  prBusy = true; prAsking = new Set(batch);
  execFile(bin, ['api', 'graphql', '-f', `query={viewer { login } ${parts.join(' ')}}`], { timeout: 30_000, maxBuffer: 8e6 }, (err, stdout, stderr) => {
    prBusy = false; prAsking = new Set();
    // A PR we cannot resolve fails its own alias only: gh exits non-zero but still prints the rest. NOT_FOUND is
    // GitHub having nothing there for us (no such PR — an issue's number —, no such repo, or none we may see).
    let data = null, none = new Set();
    try { const body = JSON.parse(stdout || '{}'); data = body.data; none = new Set((body.errors || []).filter(e => e.type === 'NOT_FOUND').map(e => e.path?.[0])); } catch {}
    if (!data) {
      // Nothing learned — offline, rate-limited, a timeout. What the cards show stands (until 2026-09-28 every PR in
      // the batch lost its state and title), the rest of the queue is dropped, and the polls back off.
      console.error('[peixairada] pr status:', String(stderr || err?.message || 'no data').trim().split('\n')[0].slice(0, 200));
      prQueue.clear();
      prPause = Math.min(prPause ? prPause * 2 : 60_000, 30 * 60_000);
      prPauseUntil = Date.now() + prPause;
      return;
    }
    prPause = 0; prPauseUntil = 0;   // back: the sweeps poll again at once, not when a pause of up to 30 min would have run out
    const me = data.viewer?.login || null;
    batch.forEach((url, i) => {
      const pr = data?.[`p${i}`]?.pullRequest;
      const state = !pr ? null
        : pr.state === 'MERGED' ? 'merged'
        : pr.state === 'CLOSED' ? 'closed'
        : pr.isDraft ? 'draft' : 'open';
      if (!pr && none.has(`p${i}`)) forgetRef(url);
      setPrInfo(url, state, pr?.title || null, pr && me ? prTurn(pr, me) : undefined, Date.now(), pr ? prPeople(pr, me) : undefined, !pr, pr?.createdAt, prChecks(pr));
    });
    if (turnsDirty) { turnsDirty = false; pruneTurns(); saveState(); }
    if (prQueue.size) drainPrQueue();
  });
}

// ---- …and whose move it is ------------------------------------------------------------------------------------------
// (2026-09-28 — Slack and GitHub's app were the only way to know.) The
// same call asks what it takes to say whose move a PR is at; forty PRs cost GitHub's GraphQL budget two points.
// `pushes` are the newest commits and force-pushes, `asks` the review requests, both off the PR's timeline.
// Every person comes with a face since 2026-09-29 (`avatarUrl`, a scalar: no cost) — prPeople, the cards' faces.
const WHO = 'login __typename avatarUrl(size: 48)';
const PR_FIELDS = `title state isDraft createdAt headRefOid author { ${WHO} }`
  + ' viewerLatestReview { submittedAt commit { oid } }'
  + ' reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }'
  + ` reviews(last: 20) { nodes { author { ${WHO} } state submittedAt } }`
  + ` comments(last: 20) { nodes { author { ${WHO} } createdAt } }`
  + ' pushes: timelineItems(last: 5, itemTypes: [PULL_REQUEST_COMMIT, HEAD_REF_FORCE_PUSHED_EVENT]) { nodes { __typename'
  + ` ... on HeadRefForcePushedEvent { createdAt actor { ${WHO} } } ... on PullRequestCommit { commit { committedDate author { user { login avatarUrl(size: 48) } } } } } }`
  + ' asks: timelineItems(last: 10, itemTypes: [REVIEW_REQUESTED_EVENT]) { nodes { ... on ReviewRequestedEvent { createdAt requestedReviewer { ... on User { login } } } } }'
  + ' commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }';   // CI on the head (2026-10-09): the rollup alone, a point's worth
/** The head commit's checks as the chat header says them: pass · fail · pending, or null for none (2026-10-09). */
const CHECKS = { SUCCESS: 'pass', FAILURE: 'fail', ERROR: 'fail', PENDING: 'pending', EXPECTED: 'pending' };
const prChecks = pr => CHECKS[pr?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state] ?? null;
let turnsDirty = false;

const isBot = a => !a?.login || a.__typename === 'Bot' || /\[bot\]$/.test(a.login);
const newest = times => times.reduce((a, t) => (t && t > a ? t : a), '');
const names = ws => [...new Set(ws.map(w => w.by.login))].join(', ');

/**
 * Whose move a PR is at, from what PR_FIELDS brings back and who `me` is; null when nobody waits on you — merged or
 * closed, or a PR you neither wrote nor reviewed nor commented on. Pure.
 *  · Someone else's PR comes round to you when its head is no longer the commit your latest review was on (a push, a
 *    force-push — anyone's but yours, and not after you approved), when someone else writes after your last word (a
 *    comment, a review, a reply in a thread: every reply is a review), or when your review is asked for again.
 *  · Your own, when someone else writes, or pushes to it, after your last word — your comments, reviews and pushes.
 * Bots are nobody. `key` names what came round, so another push or reply is a new move; `at` is GitHub's time for the
 * newest of it; `last` the newest thing on the PR at all, whoever did it (what PR_WATCH goes by).
 */
function prTurn(pr, me) {
  if (!pr || !me || pr.state !== 'OPEN') return null;
  const mine = pr.author?.login === me;
  const words = [
    ...(pr.reviews?.nodes || []).filter(r => r?.submittedAt && r.state !== 'PENDING').map(r => ({ at: r.submittedAt, by: r.author, state: r.state })),
    ...(pr.comments?.nodes || []).filter(c => c?.createdAt).map(c => ({ at: c.createdAt, by: c.author }))
  ];
  // a commit GitHub cannot tie to an account (an unlinked email, a bot) is the PR's author's
  // and a force-push by a bot is nobody's (its actor's __typename says so; it was a move on your own PR)
  const pushes = (pr.pushes?.nodes || []).map(n => n?.__typename === 'HeadRefForcePushedEvent'
    ? { at: n.createdAt, by: n.actor?.login, bot: isBot(n.actor) } : { at: n?.commit?.committedDate, by: n?.commit?.author?.user?.login })
    .filter(p => p.at && !p.bot).map(p => ({ at: p.at, by: p.by || pr.author?.login }));
  const push = pushes.reduce((a, p) => (!a || p.at > a.at ? p : a), null);
  const review = pr.viewerLatestReview?.submittedAt ? pr.viewerLatestReview : null;
  const said = newest([review?.submittedAt, ...words.filter(w => w.by?.login === me).map(w => w.at), ...pushes.filter(p => p.by === me).map(p => p.at), mine && pr.createdAt]);
  const asks = (pr.asks?.nodes || []).filter(a => a?.requestedReviewer?.login === me).map(a => a.createdAt);
  const last = newest([said, pr.createdAt, ...words.map(w => w.at), ...pushes.map(p => p.at), ...asks]) || null;
  if (!said) return null;
  const theirs = words.filter(w => !isBot(w.by) && w.by.login !== me && w.at > said);
  // a push after you approved is the author getting on with it — unless GitHub dismissed the approval for it
  const verdict = words.filter(w => w.by?.login === me && /^(APPROVED|CHANGES_REQUESTED|DISMISSED)$/.test(w.state)).reduce((a, w) => (!a || w.at > a.at ? w : a), null);
  // Any word of yours answers everything before it (the same night): a comment after your review is past a push
  // committed before it, and past a re-request.
  const since = review && said > review.submittedAt ? said : '';
  // On someone else's PR a push is a move only against a review of yours (2026-10-03: a comment alone made every push
  // after it "pushed since your review", and un-ticked every chat that named the PR).
  const pushed = !!push && push.by !== me && (mine ? push.at > said : !!review && review.commit?.oid !== pr.headRefOid && verdict?.state !== 'APPROVED' && !(since >= push.at));
  const askedAt = newest(asks);
  const again = !mine && !!review && (pr.reviewRequests?.nodes || []).some(n => n?.requestedReviewer?.login === me) && !(askedAt && said > askedAt);
  const you = pushed || theirs.length > 0 || again;
  if (!you) return { you, mine, why: mine ? 'waiting on reviews' : `waiting on ${pr.author?.login || 'the author'}`, at: null, last, key: 'them' };
  const why = [];
  if (pushed) why.push(mine ? `${push.by} pushed` : 'pushed since your review');
  const approved = theirs.filter(w => w.state === 'APPROVED'), asked = theirs.filter(w => w.state === 'CHANGES_REQUESTED');
  const talk = theirs.filter(w => w.state !== 'APPROVED' && w.state !== 'CHANGES_REQUESTED');
  if (approved.length) why.push(`approved by ${names(approved)}`);
  if (asked.length) why.push(`changes asked by ${names(asked)}`);
  if (talk.length) why.push(`${talk.length} comment${talk.length === 1 ? '' : 's'} from ${names(talk)}`);
  if (again) why.push('your review asked for again');
  const heard = newest(theirs.map(w => w.at));
  return {
    you, mine, why: why.join(' · '), at: newest([pushed && push.at, heard, again && askedAt]) || null, last,
    key: [pushed ? pr.headRefOid : '', heard, again ? askedAt || 'asked' : ''].join('|')
  };
}

/**
 * Who has had a hand in a PR, for the faces on its chats' cards (2026-09-29): the author, and whoever reviewed,
 * commented or pushed — each once, with what they did and when they last did it, the newest first, at most PEOPLE_MAX.
 * You and the bots are left out: the faces say who else is in it. Pure, from what PR_FIELDS brings back.
 */
const PEOPLE_MAX = 8;
function prPeople(pr, me) {
  if (!pr) return [];
  const by = new Map();
  const add = (a, at, did) => {
    if (!a?.login || isBot(a) || a.login === me) return;
    const p = by.get(a.login) || { login: a.login, avatar: null, at: '', did: [] };
    p.avatar ||= a.avatarUrl || null;
    if (at && at > p.at) p.at = at;
    if (!p.did.includes(did)) p.did.push(did);
    by.set(a.login, p);
  };
  add(pr.author, pr.createdAt, 'opened it');
  for (const r of pr.reviews?.nodes || []) if (r?.submittedAt && r.state !== 'PENDING') add(r.author, r.submittedAt, r.state === 'APPROVED' ? 'approved' : r.state === 'CHANGES_REQUESTED' ? 'asked for changes' : 'reviewed');
  for (const c of pr.comments?.nodes || []) add(c?.author, c?.createdAt, 'commented');
  for (const n of pr.pushes?.nodes || []) {
    if (n?.__typename === 'HeadRefForcePushedEvent') add(n.actor, n.createdAt, 'pushed');
    else add(n?.commit?.author?.user, n?.commit?.committedDate, 'pushed');
  }
  return [...by.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, PEOPLE_MAX);
}

/**
 * Note the turn GitHub gave (`t`: prTurn's answer; undefined, a PR we could not see — what the board knew stands) and
 * hand back the one to show. `movedAt` is when the move became news: GitHub's time for it the first time the board
 * sees the PR, the board's own clock for every change after — a push committed before you ticked and pushed after
 * is news all the same, and so is one the board only learnt of after the tick. Only something that *came* is a move:
 * a new head, a newer word of theirs, a new request; a reason gone (answered by a word of yours) keeps the time.
 */
const newsIn = (was, now) => {
  const [h0, w0, a0] = was === 'them' ? ['', '', ''] : was.split('|'), [h1, w1, a1] = now.split('|');
  return (!!h1 && h1 !== h0) || w1 > w0 || (!!a1 && a1 !== a0);
};
/** A PR no chat mentions any more and whose turn has not moved in a month leaves the state file — it grew by every PR
 *  ever reviewed (2026-10-03). A month, not at once: the boot reads only a transcript's tail, and a PR named before it
 *  is still the chat's. */
const TURN_KEEP_MS = 30 * 24 * 60 * 60_000;
function pruneTurns(now = Date.now()) {
  if (indexing) return;
  const named = new Set(); for (const s of sessions.values()) for (const p of s.prs) named.add(p.url);
  for (const [url, t] of Object.entries(prTurns)) if (!named.has(url) && now - (Date.parse(t.at) || 0) > TURN_KEEP_MS) delete prTurns[url];
}
function moveTurn(url, t, now = Date.now()) {
  const prev = prTurns[url];
  if (t === undefined) return { turn: null, moved: false, from: prev?.key };
  if (!t) { if (prev) { delete prTurns[url]; turnsDirty = true; } return { turn: null, moved: false, from: prev?.key }; }
  const moved = !!prev && prev.key !== t.key && t.you && newsIn(prev.key, t.key);
  if (!prev || moved) { prTurns[url] = { key: t.key, at: new Date(prev ? now : Date.parse(t.at) || now).toISOString() }; turnsDirty = true; }
  else if (prev.key !== t.key) { prTurns[url] = { ...prev, key: t.key }; turnsDirty = true; }
  const { key, ...turn } = t;
  return { turn: { ...turn, movedAt: prTurns[url].at }, moved, from: prev?.key };   // moved is only ever a move to you
}

/** A PR come round to you: one alert, on the chat touched last of those that mention it. */
function notifyPr(url, turn, chats) {
  const s = chats.reduce((a, b) => (!a || touchedAt(b) > touchedAt(a) ? b : a), null);
  if (!s || indexing) return;
  const sum = summary(s), heading = `Your move · ${s.prs.find(p => p.url === url)?.label || url}`;
  const evt = { kind: 'pr', sessionId: s.id, project: sum.project, title: sum.title, heading, snippet: turn.why, url, ts: new Date().toISOString(), quiet: !notificationsOn };
  broadcast('alert', evt);
  if (notificationsOn) nativeNotify(heading, sum.title, turn.why);
}

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
const JIRA_ITEM = 'peixAIrada Jira';   // the keychain item: service, with your Jira email as its account
/** The tickets one message names, in order: `{at, key, url}` — a link's key with its URL, a bare key's with none. Keys in
 *  fenced code are not counted (a log, a stack trace); in inline code they are — Claude writes `KEY-12` so. */
function ticketsIn(text) {
  const out = [], t = String(text || '').replace(FENCED, c => ' '.repeat(c.length));
  const links = [...t.matchAll(TICKET_URL_RE)];
  for (const m of links) out.push({ at: m.index, key: m[1], url: m[0] });
  const inLink = i => links.some(m => i >= m.index && i < m.index + m[0].length);
  for (const m of t.matchAll(TICKET_RE)) if (!inLink(m.index)) out.push({ at: m.index, key: `${m[1]}-${m[2]}`, url: null });
  return out.sort((a, b) => a.at - b.at);
}
const ticketStatus = new Map();   // key -> { found, summary, status, cat, type, assignee: {name, avatar, me}, checkedAt }
const noTicket = new Set();       // keys Jira had no issue for: not taken up again until a restart
let jiraProjects = null;          // the site's project keys, once asked (null: not yet — a bare key waits)
/** Whether a key is worth a question: a site set up, and — once the site's projects are known — one of them. */
const ticketWanted = key => !!setup.jira && !noTicket.has(key) && (!jiraProjects || jiraProjects.has(key.split('-')[0]));
function noteTicket(s, key, ts, by, url = null) {
  const at = s.tickets.findIndex(t => t.key === key);
  const t = at >= 0 ? s.tickets.splice(at, 1)[0] : { key, url: null, count: 0, by: null, firstAt: ts, lastAt: ts };
  if (url && !t.url) t.url = url;
  if (by === 'branch') t.branch = true; else { t.count++; t.by = by; }
  t.lastAt = ts || t.lastAt || null;
  s.tickets.unshift(t);
  if (s.tickets.length > MAX_TICKETS) s.tickets.length = MAX_TICKETS;
  if (!indexing && ticketWanted(key)) queueTicket(key);
}
function noteTickets(s, text, ts, by) {
  if (!text || !/[A-Z]-[1-9]/.test(text)) return;
  const said = new Map();
  for (const r of ticketsIn(text)) { const f = said.get(r.key); if (!f) said.set(r.key, r); else if (r.url && !f.url) f.url = r.url; }
  for (const r of [...said.values()].reverse()) noteTicket(s, r.key, ts, by, r.url);   // the first said ends up first
}
function noteBranchTicket(s, branch, ts) {
  s.ticketBranch = branch;
  const m = BRANCH_TICKET_RE.exec(branch); if (!m) return;
  noteTicket(s, m[1].toUpperCase(), ts, 'branch');
}
/** The chat's tickets as the page draws them — those Jira answered for: the branch's first, then the latest said. */
function shownTickets(s) {
  if (!setup.jira) return [];
  const site = setup.jira.site;
  return s.tickets.filter(t => ticketStatus.get(t.key)?.found).sort((a, b) => (b.branch ? 1 : 0) - (a.branch ? 1 : 0))
    .map(t => { const i = ticketStatus.get(t.key); return { key: t.key, url: `${site}/browse/${t.key}`, summary: i.summary, status: i.status, cat: i.cat, type: i.type, assignee: i.assignee, branch: !!t.branch, count: t.count, lastAt: t.lastAt }; });
}
// Asked about as PRs are: never-asked first, then by the most recently touched chat naming it (prEvery's rows); a
// ticket done is asked an hour apart at most (it can be reopened, a PR merged cannot).
const TICKET_TTL_MS = Number(process.env.TICKET_TTL_MS || 30_000);
const ticketQueue = new Set();
let ticketTimer = null, ticketBusy = false, jiraPauseUntil = 0, jiraPause = 0, jiraError = null, jiraMe = null, jiraProjectsAt = 0;
function ticketFresh(key, ttl = TICKET_TTL_MS, now = Date.now()) {
  const e = ticketStatus.get(key); if (!e) return false;
  return now - e.checkedAt < Math.max(ttl, e.cat === 'done' ? 60 * 60_000 : 0);
}
function dueTickets(list, now = Date.now()) {
  const every = new Map();
  for (const s of list) { const ms = prEvery(s, now); for (const t of s.tickets) if (ticketWanted(t.key) && !(every.get(t.key) <= ms)) every.set(t.key, ms); }
  return [...every].filter(([key, ms]) => !ticketFresh(key, ms, now)).map(([key]) => key);
}
function queueTicket(key, ttl = TICKET_TTL_MS) {
  if (ticketQueue.has(key) || ticketFresh(key, ttl)) return;
  ticketQueue.add(key);
  ticketTimer ??= setTimeout(() => { ticketTimer = null; drainTickets(); }, 250);
}
/** On the registry poll and at boot: the site's projects (hourly), then the tickets due a look. */
async function sweepTickets() {
  if (!setup.jira || Date.now() < jiraPauseUntil) return;
  if (Date.now() - jiraProjectsAt > 60 * 60_000) {
    jiraProjectsAt = Date.now();
    try { jiraProjects = await jiraProjectKeys(); } catch (e) { jiraProjectsAt = Date.now() - 55 * 60_000; return jiraFailed(e); }   // again in five minutes
  }
  for (const key of dueTickets(sessions.values())) queueTicket(key, 0);
}
async function jiraToken() {
  if (process.env.JIRA_API_TOKEN) return { token: process.env.JIRA_API_TOKEN, from: 'env' };
  if (jiraToken.cache && (jiraToken.cache.token || Date.now() - jiraToken.cache.at < 5 * 60_000)) return jiraToken.cache;
  const email = setup.jira?.email; let token = null, why = 'no API token yet — paste one in the settings\' Setup';
  if (process.env.JIRA_TOKEN_FILE) { try { token = readFileSync(process.env.JIRA_TOKEN_FILE, 'utf8').trim() || null; } catch {} }
  else if (process.platform === 'darwin' && email) {
    try { token = (await execFileP('/usr/bin/security', ['find-generic-password', '-s', JIRA_ITEM, '-a', email, '-w'], { timeout: 60_000 })).stdout.trim() || null; }
    catch (e) { if (!/could not be found/i.test(String(e.stderr || e.message))) why = 'keychain access refused (allow `security` when asked)'; }
  }
  return jiraToken.cache = { token, from: token ? (process.env.JIRA_TOKEN_FILE ? 'file' : 'keychain') : null, why, at: Date.now() };
}
/** Into the keychain — by `security -i` reading its command from stdin, so the token is in no process's arguments. */
async function saveJiraToken(token) {
  const email = setup.jira?.email; if (!email) throw new Error('set the site and your email first');
  if (process.env.JIRA_TOKEN_FILE) { if (token) writeFileSync(process.env.JIRA_TOKEN_FILE, token, { mode: 0o600 }); else rmSync(process.env.JIRA_TOKEN_FILE, { force: true }); }
  else {
    const q = t => `"${t.replace(/[\\"]/g, '\\$&')}"`;
    const cmd = token ? `add-generic-password -U -s ${q(JIRA_ITEM)} -a ${q(email)} -l ${q(JIRA_ITEM)} -w ${q(token)}\n` : `delete-generic-password -s ${q(JIRA_ITEM)} -a ${q(email)}\n`;
    const out = await new Promise((res, rej) => { const p = execFile('/usr/bin/security', ['-i'], { timeout: 30_000 }, (err, so, se) => err ? rej(new Error(String(se || err.message).trim())) : res(String(se || '') + String(so || ''))); p.stdin.end(cmd); });
    if (token && /error|could not/i.test(out)) throw new Error(out.trim().split('\n')[0]);
  }
  jiraReset();
}
/** One request to the site, as you: JSON in, JSON out, a throw with Jira's own words. */
async function jiraAsk(path, body) {
  const j = setup.jira; if (!j) throw new Error('no Jira site in the setup');
  const { token, why } = await jiraToken(); if (!token) throw Object.assign(new Error(why), { quiet: true });
  const r = await fetch(new URL(path, j.site), { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Basic ${Buffer.from(`${j.email}:${token}`).toString('base64')}`, accept: 'application/json', ...body && { 'content-type': 'application/json' } } });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(d?.errorMessages?.[0] || d?.message || (r.status === 401 ? 'Jira refused the email and token' : `Jira: HTTP ${r.status}`)), { status: r.status });
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
  const was = jiraError; jiraError = e.message;
  if (!e.quiet && was !== jiraError) console.error('[peixairada] jira:', e.message);
  jiraPause = Math.min(jiraPause ? jiraPause * 2 : 60_000, 30 * 60_000); jiraPauseUntil = Date.now() + jiraPause;
  ticketQueue.clear();
}
const TICKET_CAT = { new: 'todo', indeterminate: 'doing', done: 'done' };
async function drainTickets() {
  if (ticketBusy || !ticketQueue.size) return;
  const batch = [...ticketQueue].slice(0, 100); for (const k of batch) ticketQueue.delete(k);
  ticketBusy = true;
  try {
    jiraMe ??= await jiraAsk('/rest/api/3/myself').then(m => ({ id: m?.accountId || null, name: m?.displayName || null }));
    const d = await jiraAsk('/rest/api/3/issue/bulkfetch', { issueIdsOrKeys: batch, fields: ['summary', 'status', 'issuetype', 'assignee'] });
    jiraError = null; jiraPause = 0; jiraPauseUntil = 0;
    const now = Date.now(), got = new Map((d?.issues || []).map(i => [String(i.key), i]));
    for (const key of batch) {
      const i = got.get(key), f = i?.fields || {}, who = f.assignee;
      const info = i ? { found: true, summary: f.summary || '', status: f.status?.name || '', cat: TICKET_CAT[f.status?.statusCategory?.key] || 'todo', type: f.issuetype?.name || '',
        assignee: who ? { name: who.displayName || '', avatar: who.avatarUrls?.['24x24'] || null, me: !!jiraMe?.id && who.accountId === jiraMe.id } : null } : { found: false };
      if (!i) noTicket.add(key);
      setTicketInfo(key, { ...info, checkedAt: now });
    }
  } catch (e) { jiraFailed(e); }
  finally { ticketBusy = false; }
  if (ticketQueue.size) drainTickets();
}
function setTicketInfo(key, info) {
  const before = JSON.stringify({ ...ticketStatus.get(key), checkedAt: 0 });
  ticketStatus.set(key, info);
  if (JSON.stringify({ ...info, checkedAt: 0 }) !== before) for (const s of sessions.values()) if (s.tickets.some(t => t.key === key)) schedulePush(s);
}
/** The site, the login or the token changed: what was learnt under the old ones is forgotten, and asked again. */
function jiraReset() {
  jiraToken.cache = null; jiraMe = null; jiraProjects = null; jiraProjectsAt = 0; jiraError = null; jiraPause = 0; jiraPauseUntil = 0;
  ticketStatus.clear(); noTicket.clear(); ticketQueue.clear();
  for (const s of sessions.values()) if (s.tickets.length) schedulePush(s);
  if (!indexing) sweepTickets();
}
/** What the settings' Setup says of it: the site, where the token is, who you are there, what went wrong. */
async function jiraInfo() {
  const j = setup.jira, tok = j ? await jiraToken() : null;
  if (j && tok?.token && !jiraMe && !jiraError) try { const m = await jiraAsk('/rest/api/3/myself'); jiraMe = { id: m?.accountId || null, name: m?.displayName || null }; } catch (e) { jiraError = e.message; }
  return { site: j?.site || null, email: j?.email || null, token: tok?.from || null, me: jiraMe?.name || null, error: j ? (tok && !tok.token ? tok.why : jiraError) : null,
    tickets: [...ticketStatus.values()].filter(t => t.found).length, suggest: j ? null : jiraCliConfig() };
}
/** jira-cli's own config, when there is one: its server and login, offered in the Setup's empty boxes. */
function jiraCliConfig() {
  const file = process.env.JIRA_CONFIG_FILE || join(homedir(), '.config', '.jira', '.config.yml');
  try { const t = readFileSync(file, 'utf8'); const v = k => new RegExp(`^${k}:\\s*"?([^"\\n]+?)"?\\s*$`, 'm').exec(t)?.[1] || null; const site = jiraSite(v('server')); return site ? { site, email: v('login') } : null; } catch { return null; }
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
  if (!s.reading) s.newEntries.push(entry);   // a whole read is nothing new — every entry of it was kept twice until its end
}

const NEEDS_INPUT_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']);
const TURN_ENDS = new Set(['end_turn', 'stop_sequence', 'max_tokens', 'refusal']);

/** Fold one JSONL line into the session. Returns true if the session summary changed. */
function fold(s, line) {
  const ts = line.timestamp || null;
  switch (line.type) {
    case 'ai-title': if (line.aiTitle) s.title = line.aiTitle; return true;
    case 'custom-title': s.customTitle = line.customTitle || line.title || null; return true;
    case 'last-prompt': if (!s.lastPrompt && line.lastPrompt) s.lastPrompt = snippet(line.lastPrompt, 200); return true;   // whole, it was a card's and a search's to carry
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
      if (line.gitBranch) { s.gitBranch = line.gitBranch; if (line.gitBranch !== s.ticketBranch) noteBranchTicket(s, line.gitBranch, ts); }
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
        s.turnStart = null;
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
      notePrs(s, text, ts, 'user'); noteTickets(s, text, ts, 'user');
      s.lastPrompt = snippet(text, 200);
      if (!s.turnStart || s.status !== 'working') s.turnStart = ts;   // a prompt starts the turn; one typed mid-turn is part of it
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
      if (m.model && m.model !== '<synthetic>') s.model = m.model;   // an API error's line, not what the chat runs on
      let needsInput = false, said = null;
      s.turnStart ??= ts;   // a turn no word of yours began — a task's notice woke it — starts at its first line
      for (const b of blocks) {
        if (b.type === 'text' && b.text?.trim()) { pushEntry(s, said = { role: 'assistant', kind: 'text', text: b.text, ts, msgId: m.id }); notePrs(s, b.text, ts, 'claude'); noteTickets(s, b.text, ts, 'claude'); }
        else if (b.type === 'tool_use') {
          pushEntry(s, { role: 'assistant', kind: 'tool_use', name: b.name, text: summarizeToolInput(b.name, b.input), toolUseId: b.id, ts });
          if (NEEDS_INPUT_TOOLS.has(b.name)) { needsInput = true; s.ask = { tool: b.name, text: summarizeToolInput(b.name, b.input), options: b.input?.questions?.[0]?.options?.length || 0 }; }
          if (b.name === 'Monitor' || (b.name === 'Bash' && b.input?.run_in_background)) noteTaskCall(s, b);
          if (b.name === 'TaskStop' && s.tasks?.size) { const j = JSON.stringify(b.input || ''); for (const id of [...s.tasks.keys()]) if (j.includes(id)) s.tasks.delete(id); }
        }
      }
      s.lastActivity = ts;
      // A turn ends at end_turn — or at max_tokens or a refusal (2026-10-03: a turn that ran out of tokens stayed
      // working and its reply was never alerted), unless what ran out was a tool call Claude Code goes on with.
      if (TURN_ENDS.has(m.stop_reason) && !(m.stop_reason === 'max_tokens' && blocks.some(b => b.type === 'tool_use'))) {
        const text = textOf(blocks).trim();
        if (text) { s.lastReply = snippet(text, 300); s.lastReplyAt = ts; }
        // the reply that ends the turn, and how long since your last word it took — the transcript's footer under it
        // (2026-10-08); pushed in this same tick, so the page gets it marked
        if (said) { said.turnEnd = true; const ms = Date.parse(ts) - Date.parse(s.turnStart); if (ms > 0) said.worked = ms; }
        s.turnStart = null;
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

function parseLine(raw, onLine) {
  if (!raw) return;
  let line;
  try { line = JSON.parse(raw); } catch { return; }
  onLine(line);
}
function parseLines(text, onLine) { for (const raw of text.split('\n')) parseLine(raw, onLine); }

const READ_CHUNK = 1 << 20;
/**
 * Every complete line of the file between `start` and `end`, to `onLine`, a chunk at a time; returns the unterminated
 * tail. A transcript is read whole when a chat is opened (indexFile), and reading it as one buffer, one string and
 * one array of lines cost three times its size while it lasted — 300 MB of RSS for a 91 MB chat, to keep 800
 * entries (2026-09-27). This costs a chunk and the longest line.
 */
function readLines(fd, start, end, onLine, dec = new StringDecoder('utf8')) {
  const buf = Buffer.allocUnsafe(Math.max(1, Math.min(READ_CHUNK, end - start)));
  let pos = start, rest = '';
  while (pos < end) {
    const n = readSync(fd, buf, 0, Math.min(buf.length, end - pos), pos);
    if (!n) break;
    pos += n;
    rest += dec.write(buf.subarray(0, n));
    let i; while ((i = rest.indexOf('\n')) >= 0) { onLine(rest.slice(0, i)); rest = rest.slice(i + 1); }
  }
  return rest;   // the decoder keeps the bytes of a character cut at `end`: the next read (tailFile, s.dec) completes it
}

/**
 * Read the tail (or all) of a transcript and rebuild the session from it. A chat the board already holds keeps what
 * the transcript cannot say — its process, its sub-agents — and its timers are stopped, so
 * nothing fires later for the object that was replaced (a push 80 ms old carried a stale summary). It is re-read
 * *in silence*: every reply in it was alerted about once already (2026-09-27 — opening any chat longer than
 * TAIL_BYTES fired "Claude replied" for its last, old reply, since the full re-read folds every line with `indexing`
 * long over). A chat the registry made a placeholder for has had no transcript read yet: its first lines are news.
 */
function indexFile(file, { full = false } = {}) {
  let st;
  try { st = statSync(file); } catch { return null; }
  const id = basename(file, '.jsonl');
  const prev = sessions.get(id);
  const s = newSession(id, file);
  if (prev) {
    for (const k of ['live', 'rivals', 'alive', 'startedAt', 'openedAt', 'agentsRunning']) s[k] = prev[k];
    clearTimeout(prev.pushTimer); clearTimeout(prev.notifyTimer);
    s.silent = !!prev.file;
  }
  const start = full || st.size <= TAIL_BYTES ? 0 : st.size - TAIL_BYTES;
  s.loaded = start === 0 || full;
  s.truncatedHead = start > 0;
  const fd = openSync(file, 'r');
  s.dec = new StringDecoder('utf8'); s.reading = true;
  try {
    let skip = start > 0;   // a tail starts mid-line: the first "line" is the end of one
    s.partial = readLines(fd, start, st.size, raw => { if (skip) skip = false; else parseLine(raw, line => fold(s, line)); }, s.dec);
  } finally { closeSync(fd); s.reading = false; }
  s.offset = st.size;
  s.newEntries = []; // initial load: nothing is "new"
  if (!s.cwd && prev?.cwd) s.cwd = prev.cwd;
  if (!s.tasks?.size && prev?.tasks?.size) s.tasks = prev.tasks;   // a tail re-read has not seen the calls that started them
  delete s.silent;
  sessions.set(id, s);
  fileToSession.set(file, id);
  if (prev) { if (prev.pendingNotify) queueNotify(s, prev.pendingNotify); schedulePush(s); }   // an alert still owed, and the fresh summary
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
    // one decoder for the file's whole life (2026-10-03): an append read while a character was half written decoded
    // each half alone — "não" came out "n��o", and stayed so
    text = s.partial + s.dec.write(buf);
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
// (2026-09-20). An agent's last lines say whether it is done: an assistant end_turn; or, since agents hand their
// report back through a tool (2026-10-03), the result of its SubagentHandback call — no end_turn ever follows it, and
// such an agent counted for AGENT_STALE_MS more, the card clauding and the chat's own reply never alerted; or an
// interrupt (Esc). One that went quiet AGENT_STALE_MS ago is not counted (a killed agent never writes its end).
// Only the status is touched — not the order, not the transcript, not the alerts beyond holding the 'reply' one back
// until the agents are done.
const AGENT_STALE_MS = Number(process.env.AGENT_STALE_MS || 15 * 60_000);
const AGENT_ENDS = new Set(['end_turn', 'stop_sequence']);
const isHandback = (line, id) => line?.type === 'assistant' && Array.isArray(line.message?.content) && line.message.content.some(b => b?.type === 'tool_use' && b.name === 'SubagentHandback' && b.id === id);
function agentRunning(file, now = Date.now()) {
  let st; try { st = statSync(file); } catch { return false; }
  if (now - st.mtimeMs > AGENT_STALE_MS || !st.size) return false;
  const len = Math.min(st.size, 65536), buf = Buffer.alloc(len);
  const fd = openSync(file, 'r'); try { readSync(fd, buf, 0, len, st.size - len); } finally { closeSync(fd); }
  const tail = buf.toString('utf8').trim().split('\n').slice(-8).map(l => { try { return JSON.parse(l); } catch { return null; } });
  const last = tail.at(-1);
  if (!last) return true;   // a line still being written: at work
  if (last.type === 'assistant') return !AGENT_ENDS.has(last.message?.stop_reason);
  if (last.type !== 'user') return true;   // an attachment (a token reminder) is an agent mid-way
  const c = last.message?.content;
  if (textOf(c).startsWith('[Request interrupted')) return false;
  const res = Array.isArray(c) && c.find(b => b?.type === 'tool_result');
  return !(res && tail.some(l => isHandback(l, res.tool_use_id)));
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
// (2026-09-21). The transcript says all of it: the tool_result of the call
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
 * Whether the background commands are still running, asked of the machine rather than of the transcript: the harness
 * spawns each with its output redirected to `tasks/<id>.output` and holds that file open until it exits, so `lsof`
 * on the file answers plainly (measured: two holders while it runs, none the moment it ends). This is what the
 * transcript cannot do — a completion notice delivered to a chat that is *mid-turn* never becomes a line in the
 * file, and the task would otherwise sit on the card until TASK_MAX_MS (the board's own chat wore one for half an
 * hour, 2026-09-21). Only for the first seconds is it unasked: the file exists before the process has opened it.
 * One `lsof` for every file the board is watching, per poll (2026-09-27): it reads every process on the Mac, 0.9 s of
 * wall here, and one run per task per poll timed out eight times in the log. `-F n` names each file someone holds;
 * a file it does not name is held by nobody. Names are compared resolved — a task's file under /var is /private/var
 * to lsof.
 */
const TASK_GRACE_MS = Number(process.env.TASK_GRACE_MS || 20_000);
const realPath = f => { try { return realpathSync(f); } catch { return f; } };
function heldFiles(files) {
  return new Promise(resolve => {
    const bin = findBin('lsof', 'a background command is only let go by its notification or its age');
    if (!bin) return resolve(null);
    execFile(bin, ['-w', '-F', 'n', '--', ...files], { timeout: 15_000, maxBuffer: 4e6 }, (err, stdout) => {
      if (err && err.code !== 1) {   // 1 is lsof's "some file is held by nobody"; anything else is our problem
        // A run killed by the timeout is not an answer, it just looks like "still running": say so, or the chips sit
        // on the cards with nothing in the log to explain it.
        console.log(`[peixairada] lsof did not answer${err.killed || err.signal ? ' in time' : ` (${String(err.message).split('\n')[0]})`} — leaving every background command running`);
        return resolve(null);
      }
      resolve(new Set(String(stdout).split('\n').filter(l => l[0] === 'n').map(l => realPath(l.slice(1)))));
    });
  });
}
/** The poll's half of the pruning, for every chat at once: the commands whose output file nobody holds are let go.
 *  One lsof at a time — it can outlast the poll — and a command asked about less often the longer it has run, up to
 *  once a minute (2026-10-03: a dev server left running cost an lsof every ten seconds, 0.4 s of CPU each, for hours). */
let sweeping = false;
async function sweepTasks() {
  if (sweeping) return;
  const due = [], now = Date.now();
  for (const s of sessions.values()) {
    if (!s.alive || !s.tasks?.size) continue;
    for (const [id, t] of s.tasks) {
      const age = now - (Date.parse(t.at) || 0);
      if (!t.out || age < TASK_GRACE_MS || now - (t.askedAt || 0) < Math.min(60_000, age / 10) || !existsSync(t.out)) continue;   // not written yet, or cleaned up: no verdict
      t.askedAt = now; due.push({ s, id, t });
    }
  }
  if (!due.length) return;
  sweeping = true;
  let held; try { held = await heldFiles([...new Set(due.map(d => d.t.out))]); } finally { sweeping = false; }
  if (!held) return;
  for (const { s, id, t } of due) {
    if (held.has(realPath(t.out)) || s.tasks?.get(id) !== t) continue;
    s.tasks.delete(id); console.log(`[peixairada] task ${id} (${t.what}) is no longer running`); schedulePush(s);
  }
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
/** A task from before this claude started (it died with the last one), past TASK_MAX_MS, or past its own expiry. */
const taskExpired = (s, t, now = Date.now()) => { const at = Date.parse(t.at) || 0; return at < (Number(s.live?.startedAt) || 0) || now - at > TASK_MAX_MS || (t.until && now > t.until); };
/** What is still running, for the summary — nothing on a chat whose claude is gone. Reads only: the pruning is
 *  pruneTasks, on the poll (2026-09-27; the summary used to delete on the way, twelve times a minute from the app's
 *  watchdog alone). */
function runningTasks(s) {
  if (!s.alive || !s.tasks?.size) return [];
  const now = Date.now(), out = [];
  for (const [id, t] of s.tasks) if (!taskExpired(s, t, now)) out.push({ id, kind: t.kind, what: t.what, at: t.at, until: t.until ? new Date(t.until).toISOString() : null, events: t.events, lastEventAt: t.lastEventAt || null });
  return out;
}
/** The pruning: a dead claude takes its tasks with it, an expired one goes. True when any went. */
function pruneTasks(s) {
  if (!s.tasks?.size) return false;
  const n = s.tasks.size, now = Date.now();
  if (!s.alive) s.tasks.clear(); else for (const [id, t] of s.tasks) if (taskExpired(s, t, now)) s.tasks.delete(id);
  return s.tasks.size !== n;
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
    found.get(reg.sessionId).push({ pid: reg.pid, procStart: reg.procStart, name: reg.name, entrypoint: reg.entrypoint, kind: reg.kind, cwd: reg.cwd, startedAt: reg.startedAt, version: reg.version,
      status: reg.status, statusAt: reg.statusUpdatedAt, waitingFor: reg.status === 'waiting' ? reg.waitingFor : undefined });   // what it is doing, since when, and what it waits on (waitingOn)
  }
  const ppids = [...terms.values()].some(t => t.task && !t.sessionId && t.exited === null) ? parentPids([...found.values()].flat().map(l => l.pid).filter(pidAlive)) : null;   // a launcher's claude is below the PTY's pid
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
    // A chat with no transcript yet still gets a card (2026-09-27), and the card needs a time: the moment the board
    // first saw the id. Not the registry's startedAt — /clear keeps the process, and its start, and gives it a new id;
    // the new chat is *now*. Only at boot, where every id is new to the board, does the process's start stand in. No
    // word yet, not no file: /clear writes its own lines into the new transcript at once — a caveat, the command, its
    // output, none of them a word — and a chat with a file had no start, so its card sank to the bottom of the list
    // (2026-09-28).
    if (!s.startedAt && !s.lastActivity) s.startedAt = new Date(indexing && Number(live.startedAt) > 0 ? Number(live.startedAt) : Date.now()).toISOString();
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
  if (indexing || s.silent) return;   // the boot's scan, or a chat being re-read (indexFile): nothing in it is news
  s.pendingNotify = kind;
  clearTimeout(s.notifyTimer);
  // Debounce: the thinking block and the text block of one reply land as separate lines.
  s.notifyTimer = setTimeout(() => fireNotify(s), 400);
}

function fireNotify(s) {
  const kind = s.pendingNotify; s.pendingNotify = null;
  if (!kind) return;
  if (kind === 'needs-input' && statusOf(s) !== 'needs-input') return;   // answered within the debounce: nothing to say
  const sum = summary(s);
  const asked = sum.ask?.text || (sum.ask?.waitingFor ? `Waiting on you: ${sum.ask.waitingFor}` : 'Waiting for your input');
  const evt = { kind, sessionId: s.id, project: sum.project, title: sum.title, name: s.live?.name || null, cwd: s.cwd, snippet: kind === 'reply' ? sum.lastReply : asked, ts: new Date().toISOString(), quiet: !notificationsOn };
  broadcast('alert', evt);
  if (notificationsOn) nativeNotify(kind === 'reply' ? `Claude replied · ${sum.project}` : `Claude needs input · ${sum.project}`, sum.title, evt.snippet || '');
}

function schedulePush(s) {
  clearTimeout(s.pushTimer);
  s.pushTimer = setTimeout(() => {
    broadcast('session', summary(s));
    // `upto`: the entries folded so far — these are the last of them, so the page can tell what it already has
    if (s.newEntries.length) { broadcast('entries', { sessionId: s.id, gen: s.gen, upto: s.entryCount, entries: s.newEntries }); s.newEntries = []; }
  }, 80);
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(payload);
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
  // brew's or the Command Line Tools' — /usr/bin/git is only a shim that asks to install them when they are not there
  git: ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/Library/Developer/CommandLineTools/usr/bin/git', '/usr/bin/git'],
  // go-task, for the folders whose Taskfile launches claude (see launchersFor): mise's shim first, then brew and go
  task: [join(homedir(), '.local', 'share', 'mise', 'shims', 'task'), '/opt/homebrew/bin/task', '/usr/local/bin/task', join(homedir(), 'go', 'bin', 'task')],
  // "Shell Command: Install 'code' command in PATH" symlinks /usr/local/bin/code; the last two
  // entries are the binaries inside the app bundles, for when it was never run.
  code: ['/usr/local/bin/code', '/opt/homebrew/bin/code',
    '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    '/Applications/Cursor.app/Contents/Resources/app/bin/code']
};
const binCache = new Map();

/** `<NAME>_BIN` in the environment (CLAUDE_BIN, GH_BIN) overrides the search. A file that can be run, not just a path
 *  that exists (a directory, a file without the bit: a spawn of it is an 'error' event); and none found is asked again
 *  a minute later rather than never — a gh installed while the board runs is found (2026-10-03). */
const BIN_RETRY_MS = 60_000;
const canRun = f => { try { accessSync(f, fsc.X_OK); return statSync(f).isFile(); } catch { return false; } };
function findBin(name, missingNote) {
  const hit = binCache.get(name);
  if (hit && (hit.path || Date.now() - hit.at < BIN_RETRY_MS)) return hit.path;
  const env = process.env[`${name.toUpperCase()}_BIN`];
  const path = [...(env ? [env] : []), ...(process.env.PATH || '').split(':').filter(Boolean).map(d => join(d, name)), ...(BIN_FALLBACKS[name] || [])].find(canRun) || null;
  if (!path && !hit) console.error(`[peixairada] ${name} not found — ${missingNote}`);
  binCache.set(name, { path, at: Date.now() });
  return path;
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
/** The OAuth token, or why there is none: { token } | { why }. */
async function oauthToken() {
  const parse = raw => { try { const t = JSON.parse(raw)?.claudeAiOauth?.accessToken; return typeof t === 'string' && t ? t : null; } catch { return null; } };
  const file = join(CLAUDE_DIR, '.credentials.json');
  if (existsSync(file)) { try { const token = parse(readFileSync(file, 'utf8')); return token ? { token } : { why: 'no OAuth token in .credentials.json' }; } catch (e) { return { why: String(e.message || e) }; } }
  if (process.platform !== 'darwin') return { why: 'no ~/.claude/.credentials.json' };
  try {
    const { stdout } = await execFileP('/usr/bin/security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 60000 });
    const token = parse(stdout.trim());
    return token ? { token } : { why: 'the keychain item holds no OAuth token — API-key logins have no plan usage' };
  } catch (err) { return { why: /could not be found/i.test(String(err.message || err)) ? 'no Claude Code login in the keychain' : 'keychain access refused (allow `security` when asked)' }; }
}
// What the usage endpoint answers, as far as the 2.1.278 binary shows: top-level windows — five_hour,
// seven_day, seven_day_sonnet/opus ({utilization: 0–100, resets_at}) — plus codename buckets of the same
// shape (cinder_cove is the CLI's "Claude Code and Cowork credit", a one-time grant; nimbus_quill turned up
// at 0 % on 2026-09-20 and this CLI has no label for it, so it never shows there) and limits[]: the server's
// own rows, {kind: session | weekly_all | weekly_scoped, percent, resets_at, scope: {model: {display_name}}}.
// The CLI draws the known windows and adds "Current week (<model>)" from the weekly_scoped rows behind an
// allowlist; here every scoped row shows — a per-model allowance (Fable's) is exactly what you want apart.
// Codename buckets show only once they are non-zero; the zero ones come back under `other`.
// A plan capped in money (2026-10-08, read off the 2.1.295 binary — an enterprise seat with a monthly $ cap had no
// rolling windows at all, and the bar said nothing): `extra_usage` {is_enabled, monthly_limit, used_credits — cents of
// `currency` —, utilization 0–100} and one limits[] row per cap, {kind: 'spend', group: 'monthly' | …, percent,
// resets_at, is_active}, the dollars belonging to the row `is_active`; `wattle_ember` is a grant counted in dollars
// ({label, limit_dollars, used_dollars, utilization, resets_at}). A window with money carries `used`, `limit` (whole
// units) and `currency`.
const SPEND_PERIOD = { daily: 'today', weekly: 'this week', monthly: 'this month' };   // the CLI's own words
function usageWindows(d) {
  const windows = [], other = [];
  const add = (key, label, percent, resetsAt, more) => { if (typeof percent === 'number' && !windows.some(x => x.key === key)) windows.push({ key, label, percent: Math.round(percent), resetsAt: resetsAt || null, ...more }); };
  const named = { five_hour: 'session · 5 h', seven_day: 'week · all models', seven_day_opus: 'week · Opus', seven_day_sonnet: 'week · Sonnet' };
  const buckets = { cinder_cove: 'Claude Code & Cowork credit' };
  const ex = d.extra_usage && typeof d.extra_usage === 'object' ? d.extra_usage : null;
  const cents = n => typeof n === 'number' && Number.isFinite(n) ? n / 100 : null;
  const money = ex && typeof ex.monthly_limit === 'number' ? { used: cents(ex.used_credits) ?? 0, limit: cents(ex.monthly_limit), currency: String(ex.currency || 'USD').toUpperCase() } : null;
  let spent = false;   // the dollars are on a spend row already
  for (const [k, label] of Object.entries(named)) if (d[k] && typeof d[k] === 'object') add(k, label, d[k].utilization, d[k].resets_at);
  for (const row of Array.isArray(d.limits) ? d.limits : []) {
    if (!row || typeof row !== 'object' || typeof row.percent !== 'number') continue;
    if (row.kind === 'spend') {
      const group = String(row.group || 'monthly'), mine = money && (row.is_active || d.limits.filter(r => r?.kind === 'spend').length === 1);
      add(`spend:${group}`, `spend · ${SPEND_PERIOD[group] || group.replace(/_/g, ' ')}`, row.percent, row.resets_at, { period: group, ...mine && money });
      if (mine) spent = true;
      continue;
    }
    const who = row.scope?.model?.display_name || row.scope?.surface?.display_name || row.scope?.display_name || row.label;
    if (!who || row.kind === 'session' || row.kind === 'weekly_all') continue;   // those are the windows above
    add(`limits:${row.kind}:${who}`, `${row.kind === 'weekly_scoped' ? 'week' : String(row.kind).replace(/_/g, ' ')} · ${who}`, row.percent, row.resets_at);
  }
  // Extra usage switched on, and no spend row to hang it on: its own window, the month's (the field's name; no reset given)
  if (money && !spent && ex.is_enabled !== false && money.limit > 0) add('extra_usage', 'extra usage · this month', typeof ex.utilization === 'number' ? ex.utilization : money.used / money.limit * 100, null, { period: 'monthly', ...money });
  const we = d.wattle_ember;
  if (we && typeof we === 'object' && typeof we.utilization === 'number' && (we.utilization > 0 || typeof we.limit_dollars === 'number'))
    add('wattle_ember', typeof we.label === 'string' && we.label.trim() ? we.label.trim() : 'credit', we.utilization, we.resets_at,
      typeof we.limit_dollars === 'number' ? { used: typeof we.used_dollars === 'number' ? we.used_dollars : null, limit: we.limit_dollars, currency: 'USD' } : {});
  for (const [k, w] of Object.entries(d)) {
    if (k in named || k === 'limits' || k === 'extra_usage' || k === 'wattle_ember' || !w || typeof w !== 'object' || typeof w.utilization !== 'number') continue;
    if (w.utilization > 0) add(k, buckets[k] || k.replace(/_/g, ' '), w.utilization, w.resets_at); else other.push(k);
  }
  return { windows, other };
}
/** { code, body } for the route. One question at a time, and its answer kept: a minute when it is the numbers, half
 *  a minute when it is a failure (2026-10-03: every page and every reload asked on its own — a keychain refused, or
 *  its prompt still up, was a `security` and a prompt per ask). */
const usageCache = { at: 0, code: 0, body: null };
let usageAsk = null;
function planUsage() {
  if (process.env.USAGE === 'off') return Promise.resolve({ code: 503, body: { error: 'usage disabled (USAGE=off)', off: true } });   // off: the page hides its bar
  if (usageCache.body && Date.now() - usageCache.at < (usageCache.code === 200 ? 60_000 : 30_000)) return Promise.resolve(usageCache);
  return usageAsk ??= askUsage().then(r => Object.assign(usageCache, r, { at: Date.now() })).finally(() => { usageAsk = null; });
}
async function askUsage() {
  const { token, why } = await oauthToken();
  if (!token) return { code: 503, body: { error: why } };
  try {
    const r = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { code: r.status === 401 ? 503 : 502, body: { error: d?.error?.message || `usage API: HTTP ${r.status}` } };
    return { code: 200, body: { ...usageWindows(d), fetchedAt: new Date().toISOString() } };
  } catch (e) { return { code: 502, body: { error: `usage API: ${e.message || e}` } }; }
}
function codeBin() { return findBin('code', 'VS Code Web is disabled'); }

// ---- the machine, for the status bar: CPU, memory, and what the claudes hold (2026-10-09) ---------------------------
// Each optional in the page's status bar, each asked only while shown. CPU is the share of every core's time spent busy
// since the last ask (the first sample is taken at boot); memory is used of total — on macOS what Activity Monitor calls
// Memory Used (app memory, wired, compressed: vm_stat's anonymous less purgeable, wired, occupied by the compressor), not
// total less free, which counts the file cache as used; the claudes' is the resident size of every live claude process
// the registry names (`ps`), their children aside.
let cpuLast = null;
function cpuBusy() {
  const t = cpus().reduce((a, c) => { const x = c.times; a.idle += x.idle; a.all += x.user + x.nice + x.sys + x.idle + x.irq; return a; }, { idle: 0, all: 0 });
  const last = cpuLast; cpuLast = t;
  return last && t.all > last.all ? Math.max(0, Math.min(100, Math.round(100 * (1 - (t.idle - last.idle) / (t.all - last.all))))) : null;
}
async function memUsed() {
  const total = totalmem();
  if (process.platform === 'darwin') try {
    const out = (await execFileP('/usr/bin/vm_stat', [], { timeout: 3000 })).stdout;
    const page = Number(/page size of (\d+)/.exec(out)?.[1]) || 16384, n = k => Number(new RegExp(`${k}:\\s+(\\d+)`).exec(out)?.[1]) || 0;
    const used = (n('Anonymous pages') - n('Pages purgeable') + n('Pages wired down') + n('Pages occupied by compressor')) * page;
    if (used > 0 && used <= total) return { used, total };
  } catch {}
  return { used: total - freemem(), total };
}
async function claudeMem() {
  const pids = [...new Set([...sessions.values()].filter(s => s.alive).flatMap(s => [s.live, ...s.rivals]).map(p => p?.pid).filter(Number.isInteger))];
  const ps = pids.length && findBin('ps', 'the claudes\' memory goes unsaid');
  if (!ps) return { rss: 0, n: 0 };
  try {
    const out = (await execFileP(ps, ['-o', 'rss=', '-p', pids.join(',')], { timeout: 3000 })).stdout.trim().split(/\s+/).map(Number).filter(Number.isFinite);
    return { rss: out.reduce((a, b) => a + b, 0) * 1024, n: out.length };
  } catch (e) { return e.code === 1 ? { rss: 0, n: 0 } : { rss: null, n: pids.length }; }   // 1: none of them alive any more
}
/** What the status bar asks for: `want` is a set of cpu · mem · claude. */
async function machineStats(want) {
  const out = {};
  if (want.has('cpu')) out.cpu = cpuBusy();
  if (want.has('mem')) out.mem = await memUsed();
  if (want.has('claude')) out.claude = await claudeMem();
  return out;
}

// ---- keeping the Mac awake: an idle-sleep assertion, and the lid's own setting (2026-10-08) -------------------------
// Two buttons of the status bar (2026-10-09; the chat header's and its menu's when the bar is off). *Awake* is a
// `caffeinate -i -w <this pid>` the server keeps running while the switch is on: idle sleep held off, the display free
// to sleep, and caffeinate gone by itself when the server goes (-w) — the switch is in the state file, so a restart
// starts it again. Closing the lid still sleeps the Mac; *lid closed* is `pmset -a disablesleep 1`, which root alone may
// set: each turn goes through sudo — Touch ID where it takes it — else osascript's administrator dialog (a password).
// The setting is the system's — it outlives the server and a reboot — so it is read back (`pmset -g`: SleepDisabled) on
// every poll rather than remembered, and shown whoever set it. So are the idle sleep the Mac is set to on the power it
// draws from now (`sleep`, in minutes, 0 for never) and that power (`pmset -g ps`) (2026-10-09): on a charger set never
// to sleep, the cup has nothing to hold off, and the page says so. Tests: CAFFEINATE_BIN and PMSET_BIN are the fakes,
// and AWAKE_ADMIN=none runs pmset as it is.
let caffeinate = null;      // the child holding the assertion
let lidOff = false;         // SleepDisabled, as pmset last said
let idleSleep = null;       // the minutes idle before the Mac sleeps on the power it draws from now, 0 never; null unread
let powerSrc = null;        // 'ac' · 'battery' · 'ups', as pmset last said; null unread
let lidAsking = null;       // Touch ID or a password dialog up: the next turn waits for it
const awakeState = () => ({ awake: awakeOn && !!caffeinate, lid: lidOff, idleSleep, power: powerSrc });
const sayAwake = () => broadcast('awake', awakeState());
/** The switch: on starts caffeinate (once), off ends it. Answers the state, or throws when caffeinate cannot run. */
function keepAwake(on) {
  awakeOn = on; saveState();
  if (on && !caffeinate) {
    const bin = findBin('caffeinate', 'the Mac cannot be kept awake');
    if (!bin) { awakeOn = false; saveState(); throw new Error('caffeinate not found'); }
    const p = spawn(bin, ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
    caffeinate = p;
    p.once('error', e => console.error('[peixairada] caffeinate:', e.message));
    // ended by someone else, or failed to start: the switch is off — the mark goes rather than claim what is not so
    p.once('exit', () => { if (caffeinate !== p) return; caffeinate = null; awakeOn = false; saveState(); console.error('[peixairada] caffeinate ended on its own — the Mac may sleep again'); sayAwake(); });
    console.log('[peixairada] keeping the Mac awake (caffeinate -i)');
  } else if (!on && caffeinate) {
    const p = caffeinate; caffeinate = null; p.kill();
    console.log('[peixairada] the Mac may sleep again');
  }
  sayAwake();
  return awakeState();
}
/** pmset's word on sleep: SleepDisabled 1 is no sleep at all, lid shut or not; `sleep` under *Currently in use* the
 *  idle minutes on the power drawn from now (the setting — the assertions holding it off follow it in brackets); and
 *  `-g ps` that power. A failure to ask leaves each as it was. */
async function readPower() {
  const bin = findBin('pmset', 'the Mac\'s sleep settings go unread'); if (!bin) return;
  const ask = args => execFileP(bin, args, { timeout: 5000 }).then(r => r.stdout, e => { console.error(`[peixairada] pmset ${args.join(' ')}:`, String(e.message || e).split('\n')[0]); return null; });
  const [g, ps] = await Promise.all([ask(['-g']), ask(['-g', 'ps'])]);
  const was = JSON.stringify([lidOff, idleSleep, powerSrc]);
  if (g != null) {
    lidOff = /^\s*SleepDisabled\s+1\b/m.test(g);
    const m = /^\s*sleep\s+(\d+)/m.exec(g.slice(g.indexOf('Currently in use')));
    idleSleep = m ? Number(m[1]) : null;
  }
  if (ps != null) powerSrc = ({ AC: 'ac', Battery: 'battery', UPS: 'ups' })[/Now drawing from '(\w+) Power'/.exec(ps)?.[1]] ?? null;
  if (JSON.stringify([lidOff, idleSleep, powerSrc]) !== was) sayAwake();
}
/** Sleep with the lid shut, or not, as root: through `sudo` first — Touch ID where sudo takes it (pam_tid in
 *  /etc/pam.d/sudo_local), or a sudoers rule that asks nothing — and, when sudo cannot do it without a terminal to type a
 *  password in, through osascript's administrator dialog (2026-10-09; the dialog alone the day before). Then pmset read back. */
async function setLid(on) {
  if (lidAsking) await lidAsking.catch(() => {});
  const bin = findBin('pmset', 'the lid\'s setting cannot be changed'); if (!bin) throw new Error('pmset not found');
  const args = ['-a', 'disablesleep', on ? '1' : '0'];
  const q = t => `"${t.replace(/[\\"]/g, '\\$&')}"`;
  const viaDialog = () => execFileP('/usr/bin/osascript', ['-e', `do shell script quoted form of ${q(bin)} & ${q(' ' + args.join(' '))} with prompt ${q(on ? 'peixAIrada wants to keep this Mac awake with its lid closed.' : 'peixAIrada wants to let this Mac sleep again when its lid closes.')} with administrator privileges`], { timeout: 5 * 60_000 });
  // no terminal: sudo's stdin is nothing, so a password it cannot get is a quick failure, not a wait
  const viaSudo = () => new Promise((res, rej) => execFile('/usr/bin/sudo', [bin, ...args], { timeout: 90_000, env: { ...process.env, SUDO_ASKPASS: '' } }, (err, so, se) => err ? rej(Object.assign(err, { stderr: se })) : res()).stdin?.end());
  const mode = process.env.AWAKE_ADMIN || 'sudo';
  lidAsking = mode === 'none' ? execFileP(bin, args, { timeout: 10_000 }) : mode === 'osascript' ? viaDialog()
    : viaSudo().catch(e => { console.log(`[peixairada] sudo pmset did not go through (${String(e.stderr || e.message).trim().split('\n')[0]}) — asking with the dialog`); return viaDialog(); });
  try { await lidAsking; }
  catch (e) { throw new Error(/-128|cancel/i.test(String(e.stderr || e.message)) ? 'cancelled' : String(e.stderr || e.message).trim().split('\n')[0]); }
  finally { lidAsking = null; await readPower(); }
  console.log(`[peixairada] sleep with the lid closed: ${lidOff ? 'off — the Mac stays awake' : 'on again'}`);
  return awakeState();
}

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
// editor server on the port for the next run to adopt without knowing whose it is (the hooks are main()'s: an
// import — the tests — installs nothing).
// `code` is a wrapper script around the real binary, so the child runs in its own process group and
// the whole group is signalled — killing the wrapper alone left the server behind on the port.
function endVsWebWithUs() {
  process.on('exit', () => { if (vsweb) { try { process.kill(-vsweb.pid, 'SIGTERM'); } catch { try { vsweb.kill(); } catch {} } } });
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => process.exit(0));
}
const vswebAnswers = () => fetch(VSWEB_URL, { signal: AbortSignal.timeout(1500) }).then(r => { r.body?.cancel(); return true; }, () => false);
async function ensureVsWeb() {
  if (await vswebAnswers()) return { ok: true, url: VSWEB_URL, started: false };
  const code = codeBin();
  if (!code) return { code: 501, error: 'code CLI not found — run "Shell Command: Install \'code\' command in PATH" in VS Code, or set CODE_BIN' };
  if (!vsweb) {
    try {
      vsweb = spawn(code, ['serve-web', '--host', '127.0.0.1', '--port', String(VSWEB_PORT), '--without-connection-token', '--accept-server-license-terms'], { stdio: 'ignore', env: termEnv(), detached: true });
      vsweb.on('exit', c => { console.log(`[peixairada] code serve-web exited (${c})`); vsweb = null; });
      // a spawn that fails is an 'error' and no 'exit' — and an 'error' nobody listens for ends the server
      vsweb.on('error', e => { console.error(`[peixairada] code serve-web: ${e.message}`); vsweb = null; binCache.delete('code'); });
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

/** The chat's drawer (`shell` false) or its zsh (true) — a live one over an exited one still lingering in `terms`. The
 *  same rule as termIndex, for one chat. */
function drawerOf(s, shell) { let hit = null; for (const t of terms.values()) if (t.sessionId === s.id && !!t.shell === shell && (!hit || (hit.exited !== null && t.exited === null))) hit = t; return hit; }
const termOf = s => drawerOf(s, false), shellOf = s => drawerOf(s, true);
const NO_TERMS = Object.freeze({ term: null, shell: null });
/** Every chat's drawer and zsh in one pass, by the same rule — for the summaries of the whole board, which asked
 *  termOf and shellOf per chat, each a walk over every terminal (322 chats × 75 terminals × 2 per snapshot, 2026-09-27). */
function termIndex() {
  const m = new Map();
  for (const t of terms.values()) {
    if (!t.sessionId) continue;
    let e = m.get(t.sessionId); if (!e) m.set(t.sessionId, e = { term: null, shell: null });
    const k = t.shell ? 'shell' : 'term';
    if (!e[k] || (e[k].exited !== null && t.exited === null)) e[k] = t;
  }
  return m;
}
function termSummary(t) {
  return t ? {
    id: t.id, sessionId: t.sessionId, cwd: t.cwd, pid: t.pid, holderPid: t.holderPid, resume: t.resume, shell: !!t.shell, task: t.task || null, startedAt: t.startedAt, exited: t.exited,
    cols: t.cols, rows: t.rows, clients: t.clients.size, connected: !!(t.sock && !t.sock.destroyed), lastSnapshotChars: t.lastSnap,
  } : null;
}

// The server's own environment minus anything that says "you are inside a Claude session" — under
// `npm start` from a Claude shell that is exactly what it says, and the CLI refuses to nest. Only the nesting markers
// go: CLAUDECODE and CLAUDE_CODE_*. CLAUDE_DIR is this project's own (a fixture in tests — the fake claude reads it)
// and CLAUDE_BIN the override the server already resolved; neither means anything to the CLI.
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDECODE$|^CLAUDE_CODE_/.test(k)));
function termEnv() {
  const env = cleanEnv();
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
/** Whether `pid` is still the process the registry entry was written by: the entry's procStart is the process's start
 *  as `ps` gives it in UTC. A dead claude's file lingers until claude's housekeeping, and its pid can be handed to any
 *  other process of yours meanwhile — Done and Take over signalled it, an editor say (2026-10-03). An entry without a
 *  procStart (an older claude) is taken at its word. */
function sameProcess({ pid, procStart }) {
  if (!procStart) return true;
  try { return execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } }).replace(/\s+/g, ' ').trim() === procStart.replace(/\s+/g, ' ').trim(); }
  catch { return false; }
}
function endClaude(entry) {
  const { pid } = entry;
  return new Promise(resolve => {
    if (!sameProcess(entry)) return resolve({ code: 409, error: `pid ${pid} is no longer that claude — its registry file outlived it` });
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
const HELLO_MS = 5000;
/** The holder's socket, once it has said hello — which a stopped or wedged holder never does, though the kernel still
 *  accepts the connection: no hello in HELLO_MS is a failure (2026-10-03: one such holder held the boot, and the port
 *  with it, for good). Until the hello the socket is not the drawer's, and its close is no exit. */
function connectHolder(t) {
  return new Promise((resolve, reject) => {
    const sock = netConnect(join(TERMS_DIR, `${t.id}.sock`));
    sock.setEncoding('utf8');   // a glyph split across two chunks decodes whole; `buf += chunk` on a Buffer decoded each alone
    let buf = '', helloed = false;
    sock.setTimeout(HELLO_MS, () => sock.destroy(new Error(`no hello in ${HELLO_MS / 1000} s`)));
    sock.on('data', chunk => {
      buf += chunk;
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (!helloed && m.t === 'hello') { helloed = true; sock.setTimeout(0); t.sock = sock; Object.assign(t, { pid: m.pid, holderPid: m.holderPid, exited: m.exited, cols: m.cols, rows: m.rows, cwd: m.cwd, resume: !!m.resume, startedAt: m.startedAt, sessionId: t.sessionId ?? m.sessionId ?? null }); resolve(m); }
        else if (helloed) onHolderMsg(t, m);
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
// `task development-<cluster>`… — each sets a cluster's environment (its credentials and dashboards) and then runs
// claude. A new chat there has to go through one of them, and which is a choice (2026-09-20).
// Nothing is named here: a folder with a Taskfile whose tasks mention Claude in their description has launchers, and
// the page asks (`GET /api/launchers?cwd=`) before starting a chat. `task --list --json` lists them; cached by the
// Taskfile's mtime, so it runs once per edit. A resume (`claude --resume`) never goes through task: its command line is
// the Taskfile's.
const TASKFILES = ['Taskfile.yml', 'Taskfile.yaml', 'taskfile.yml', 'taskfile.yaml', 'Taskfile.dist.yml', 'Taskfile.dist.yaml'];
const launcherCache = new Map();   // cwd → { mtime, launchers } — or { mtime, asking }, the run under way
const TASK_NAME = /^[\w:.-]+$/;
function taskfileOf(cwd) { for (const f of TASKFILES) { const p = join(cwd, f); if (existsSync(p)) return p; } return null; }
/** Only an answer is kept (2026-10-03): a `task` that failed — a timeout, a broken include, a shim's hiccup — was
 *  cached as "no launchers" until the Taskfile itself changed, and a new chat there quietly started a bare claude.
 *  Asks at the same time share one run. */
function launchersFor(cwd) {
  const file = cwd && taskfileOf(cwd); if (!file) return Promise.resolve([]);
  let mtime; try { mtime = statSync(file).mtimeMs; } catch { return Promise.resolve([]); }
  const hit = launcherCache.get(cwd);
  if (hit?.mtime === mtime) return hit.asking || Promise.resolve(hit.launchers);
  const bin = findBin('task', 'Taskfile launchers are disabled'); if (!bin) return Promise.resolve([]);
  const asking = execFileP(bin, ['--list', '--json'], { cwd, env: termEnv(), timeout: 15_000, maxBuffer: 4e6 }).then(({ stdout }) => {
    const launchers = (JSON.parse(stdout).tasks || []).filter(t => /\bclaude\b/i.test(t.desc || '')).map(t => ({ name: t.name, desc: t.desc || '' }));
    launcherCache.set(cwd, { mtime, launchers });
    return launchers;
  }, e => {
    console.error(`[peixairada] task --list in ${cwd}: ${String(e.message).split('\n')[0]}`);
    if (launcherCache.get(cwd)?.asking === asking) launcherCache.delete(cwd);
    return [];
  });
  launcherCache.set(cwd, { mtime, asking });
  return asking;
}

// ---- the roots' folders: where the repos live, and cloning one that is not there yet --------------------------------
// A project on the board is a folder some chat ran in, so a repo you have not opened a chat in is nowhere to be seen,
// and one you have not cloned is nowhere at all — which made starting work on a repo the longest thing the board
// asked of you (2026-09-21). A root is a directory the repos live
// in and the GitHub org they come from (boardConfig — one of each, from the environment, until 2026-09-28, when the
// settings took them over); nothing under one is written to except by the one clone below.
const REPO_NAME = /^[A-Za-z0-9][\w.-]*$/;          // a name for a folder and a repo, and nothing that walks out of its root
const CLONE_MS = Number(process.env.CLONE_MS || 10 * 60_000);   // a big repo over a slow line; the page waits on it
const isDir = p => { try { return statSync(p).isDirectory(); } catch { return false; } };
const folderCache = new Map();   // root dir -> { mtime, folders }

/** Every folder directly under a root, by name. Cached by the directory's own mtime — a clone or a `git clone` by
 *  hand moves it, and the picker asks on every opening. */
function foldersIn(root) {
  let mtime; try { mtime = statSync(root).mtimeMs; } catch { return []; }
  const hit = folderCache.get(root); if (hit?.mtime === mtime) return hit.folders;
  let folders = [];
  try {
    folders = readdirSync(root, { withFileTypes: true })
      .filter(d => !d.name.startsWith('.') && (d.isDirectory() || (d.isSymbolicLink() && isDir(join(root, d.name)))))
      .map(d => ({ name: d.name, cwd: join(root, d.name) }))
      .map(f => ({ ...f, git: existsSync(join(f.cwd, '.git')) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) { console.error(`[peixairada] ${root}: ${e.message}`); }
  folderCache.set(root, { mtime, folders });
  return folders;
}
// ---- the first run: where the repos live, guessed -------------------------------------------------------------------
// A board never told where the repos live asks, once (2026-10-01: the page's welcome, while `ask`). It offers what the
// chats already say — the folders holding the checkouts they ran in, by how many — then the usual names that hold a
// checkout, each with the GitHub account most of its checkouts' `origin` names, so the answer is mostly one ⏎.
const ROOT_NAMES = ['code', 'src', 'dev', 'Developer', 'projects', 'repos', 'git', 'github', 'workspace', 'work', 'Documents/GitHub'];
/** The checkout a folder is in: the nearest folder at or above it whose .git is a directory — a worktree's or a
 *  submodule's .git is a file, and the repo holding it is the one meant — else the nearest with a .git at all. */
function checkoutOf(cwd) {
  let any = null;
  if (!cwd?.startsWith('/')) return null;   // dirname('.') is '.': a relative cwd climbed forever
  for (let d = cwd; d && d !== '/' && d !== homedir(); d = dirname(d)) {
    let st; try { st = statSync(join(d, '.git')); } catch { continue; }
    if (st.isDirectory()) return d;
    any ||= d;
  }
  return any;
}
/** The GitHub account most of a root's checkouts come from, by their `origin` — an ssh alias (github.com-work) too. */
function orgOf(root) {
  const n = new Map();
  for (const f of foldersIn(root).slice(0, 400)) {
    let txt; try { txt = readFileSync(join(f.cwd, '.git', 'config'), 'utf8'); } catch { continue; }
    const m = /\[remote "origin"\][^[]*?url\s*=\s*\S*?github[\w.-]*[:/]([A-Za-z0-9][A-Za-z0-9-]{0,38})\//.exec(txt);
    if (m) n.set(m[1], (n.get(m[1]) || 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
/** Up to four folders of repos, likeliest first: `{dir, org, repos, chats}` — `chats`, how many of its checkouts a
 *  chat ran in; `repos`, how many it holds. */
function suggestRoots() {
  const used = new Map(), seen = new Set();   // root -> the checkouts under it a chat ran in
  for (const s of sessions.values()) {
    const cwd = s.live?.cwd || s.cwd; if (!cwd || seen.has(cwd)) continue; seen.add(cwd);
    const top = checkoutOf(cwd), root = top && dirname(top);
    if (!root || root === '/' || root === homedir()) continue;
    if (!used.has(root)) used.set(root, new Set());
    used.get(root).add(top);
  }
  for (const n of ROOT_NAMES) { const d = join(homedir(), n); if (!used.has(d)) used.set(d, new Set()); }
  const all = [...used].map(([dir, tops]) => ({ dir, chats: tops.size, repos: foldersIn(dir).filter(f => f.git).length }))
    .filter(r => r.repos).sort((a, b) => b.chats - a.chats || b.repos - a.repos);
  const likely = all.filter(r => r.chats > 1 || r.repos > 1);   // one chat in one checkout is a download unzipped, not where the repos live
  return (likely.length ? likely : all).slice(0, 4).map(r => ({ ...r, org: orgOf(r.dir) }));
}
/** Every root's folders, a root at a time, each saying which root and org it is of. */
const rootFolders = () => boardConfig().roots.flatMap(r => foldersIn(r.dir).map(f => ({ ...f, root: r.dir, org: r.org })));

/** `gh repo clone <org>/<name>` into a root — gh because it is already how the board asks GitHub about PRs, it knows
 *  the account's protocol, and it says plainly when there is no such repo. `rootDir` names the root; without it, the
 *  one root with an org, if there is only one. A folder that is already there is handed back as it is (the page
 *  carries straight on into the new-chat flow with it); a clone that failed leaves nothing behind, so the next try is
 *  not told the folder exists. */
function cloneRepo(name, rootDir, done) {
  if (!REPO_NAME.test(name || '')) return done({ code: 400, error: `"${name}" is not a repository name` });
  const roots = boardConfig().roots.filter(r => r.org);
  const root = rootDir ? roots.find(r => r.dir === rootDir) : roots.length === 1 ? roots[0] : null;
  if (!root) return done({ code: 400, error: rootDir ? `${rootDir} is not a folder of repos with an org — Settings › Setup sets them` : roots.length ? 'which folder of repos? more than one has an org' : 'no folder of repos has an org to clone from — Settings › Setup sets them' });
  const cwd = join(root.dir, name), ref = `${root.org}/${name}`;
  if (existsSync(cwd)) return done({ code: 200, cwd, cloned: false });
  const bin = findBin('gh', 'cloning from the board is disabled');
  if (!bin) return done({ code: 503, error: 'gh not found — set GH_BIN to its path, or clone it by hand' });
  try { mkdirSync(root.dir, { recursive: true }); } catch (e) { return done({ code: 500, error: `${root.dir}: ${e.message}` }); }
  console.log(`[peixairada] clone ${ref} → ${cwd}`);
  execFile(bin, ['repo', 'clone', ref, cwd], { cwd: root.dir, env: termEnv(), timeout: CLONE_MS, maxBuffer: 4e6 }, (err, _out, stderr) => {
    folderCache.delete(root.dir);
    if (!err) { console.log(`[peixairada] cloned ${ref}`); return done({ code: 200, cwd, cloned: true }); }
    try { if (existsSync(cwd) && !readdirSync(cwd).length) rmSync(cwd, { recursive: true }); } catch {}
    // execFile's callback error carries no output of its own: gh says why on stderr ("could not find any repository…").
    const why = String(stderr || err.message).trim().split('\n').filter(Boolean).pop() || 'clone failed';
    console.error(`[peixairada] clone ${ref}: ${why}`);
    done({ code: 502, error: why });
  });
}

// The shell a drawer runs claude through, and the one a shell tab (⌥⌘T) is (2026-09-28; /bin/zsh for both before): the
// login shell, which is where the PATH the tools want gets built (.zshrc, .bash_profile — mise activates there).
// claude goes through `-l -i -c 'exec "$0" "$@"'`, which zsh and bash read alike; with any other login shell (fish) the
// tab is still that shell and claude goes through zsh, as it always did.
const LOGIN_SHELL = (() => { try { const sh = userInfo().shell; return sh && existsSync(sh) ? sh : '/bin/zsh'; } catch { return '/bin/zsh'; } })();
const RUN_SHELL = /\/(zsh|bash)$/.test(LOGIN_SHELL) ? LOGIN_SHELL : '/bin/zsh';

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
  const bin = shell ? LOGIN_SHELL : task ? findBin('task', 'Taskfile launchers are disabled') : claudeBin();   // a shell holder runs the shell itself (see termhold.mjs); the chat's is claude, or its launcher
  if (!bin) return { code: 503, error: task ? 'task binary not found — set TASK_BIN to its path' : 'claude binary not found — set CLAUDE_BIN to its path' };
  if (!cwd) return { code: 400, error: 'no cwd known for this chat' };
  if (!existsSync(cwd)) return { code: 409, error: `cwd no longer exists: ${cwd}` };
  const args = task ? [task] : shell || !sessionId ? [] : ['--resume', sessionId];
  const id = `t${++termSeq}-${Date.now().toString(36)}`;
  try { mkdirSync(TERMS_DIR, { recursive: true }); } catch {}
  const spec = { id, sessionId, cwd, bin, args, shell, sh: shell ? LOGIN_SHELL : RUN_SHELL, task, cols: Math.min(500, Math.max(20, cols | 0)), rows: Math.min(200, Math.max(5, rows | 0)), resume: !shell && !!sessionId, startedAt: new Date().toISOString() };
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
      if (Date.now() - t0 > HOLDER_START_MS) {
        // given up on, it is ended — or it comes up late with a claude in it that nothing tracks until the next boot
        try { process.kill(child.pid, 'SIGTERM'); } catch {}
        return { code: 500, error: `the terminal holder did not answer in ${HOLDER_START_MS / 1000} s (${e.message}) — see ${logFile}` };
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }
  terms.set(id, t);
  console.log(`[peixairada] terminal ${id}: ${shell ? basename(LOGIN_SHELL) : task ? 'task ' + task : 'claude' + (args.length ? ' ' + args.join(' ') : '')} in ${cwd} (pid ${t.pid}, holder ${t.holderPid})`);
  broadcast('terminal', termSummary(t));
  const s = sessionId && sessions.get(sessionId); if (s) schedulePush(s);
  return { code: 201, terminal: termSummary(t) };
}

/** On boot: the holders from before this server — adopt the ones that answer, clean up after the dead. All at once:
 *  one after another, every holder that does not answer cost its whole wait before the board could start. */
async function adoptHolders() {
  if (!existsSync(TERMS_DIR)) return;
  await Promise.allSettled(readdirSync(TERMS_DIR).filter(f => f.endsWith('.json')).map(adoptHolder));
}
async function adoptHolder(f) {
  let meta; try { meta = JSON.parse(readFileSync(join(TERMS_DIR, f), 'utf8')); } catch { return; }
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
    if (meta.holderPid && pidAlive(meta.holderPid)) { console.log(`[peixairada] terminal ${id}: holder ${meta.holderPid} is alive but not answering (${e.message}) — left alone`); return; }
    for (const ext of ['.json', '.sock', '.log']) try { unlinkSync(join(TERMS_DIR, id + ext)); } catch {}
    console.log(`[peixairada] terminal ${id}: its holder is gone — cleaned up`);
  }
}

/** pid → parent pid for every process, from one `ps`. Asked for only while a launcher's drawer has no session yet —
 *  and only when a process in the registry is not in the last table (2026-10-03: a `ps` blocked the server ~20 ms on
 *  every registry write by any claude, for as long as a launcher sat at an SSO prompt). Parents do not change. */
let ppidTable = null;
function parentPids(need = []) {
  if (ppidTable && need.every(p => ppidTable.has(p))) return ppidTable;
  const m = new Map();
  try { for (const l of execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).split('\n')) { const [p, pp] = l.trim().split(/\s+/).map(Number); if (p) m.set(p, pp); } }
  catch (e) { console.error(`[peixairada] ps: ${e.message}`); }
  return ppidTable = m;
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
    // the PTY's own process; the claude it was tied to (behind a launcher that is not the PTY's — /clear there gives
    // that claude a new id, and the drawer has to follow it as it does any other, 2026-10-03); or, not yet tied, a
    // claude below a launcher's task
    if (t.pid !== pid && !(t.exited === null && t.claudePid === pid) && !(t.task && t.exited === null && descends(pid, t.pid, ppids))) continue;
    const was = sessions.get(t.sessionId);   // the chat it is leaving — /clear gave this pid a new id
    t.sessionId = s.id; t.claudePid = pid; holderSend(t, { t: 'meta', sessionId: s.id, claudePid: pid });
    noteEnv(s.id, t.task);
    broadcast('terminal', termSummary(t)); schedulePush(s);
    // The chat it left has to be told too, or its card keeps a drawer that is somewhere else now and only
    // something unrelated happening to it ever clears that (2026-09-22, found through drawer-clear's flake).
    if (was && was !== s) schedulePush(was);
  }
}
/** One spawn per chat and kind at a time: a drawer is in `terms` only once its holder has answered, a few hundred ms
 *  in, and a second ⌥⌘C meanwhile started a second `claude --resume` on the same transcript (2026-10-03). The second
 *  ask gets the first one's answer. */
const spawning = new Map();   // `<chat>:claude` | `<chat>:shell` -> the spawn under way
const spawnOnce = (key, run) => { let p = spawning.get(key); if (!p) spawning.set(key, p = run().finally(() => spawning.delete(key))); return p; };
/** End the process in a drawer; an exited one is let go at once instead of lingering. */
function killTerm(t) {
  if (t.exited === null) holderSend(t, { t: 'kill' });
  else { holderSend(t, { t: 'quit' }); terms.delete(t.id); }
}

// ---- idle drawers: ended after DRAWER_IDLE_MS with no page on them -------------------------------------------------
// Nothing ended a drawer but Done or its ×, and a week of chats had left 72 claudes idle at 13 GB, one of them with a
// page on it (2026-09-27). A drawer whose claude has been idle — the registry's word: not busy, not
// waiting — with no sub-agent or background task at work, no page attached, and no word in the chat nor the drawer's
// own start within DRAWER_IDLE_MS, is ended as Done ends it. The chat loses nothing: the transcript is on disk, the
// card goes stale, and its >_ resumes it. A chat waiting on a question is left standing, and so is every zsh. 0 disables.
const DRAWER_IDLE_MS = Number(process.env.DRAWER_IDLE_MS ?? 24 * 60 * 60_000);
function sweepDrawers() {
  if (!(DRAWER_IDLE_MS > 0)) return;
  const now = Date.now();
  for (const t of terms.values()) {
    if (t.shell || t.exited !== null || t.clients.size) continue;
    const s = t.sessionId ? sessions.get(t.sessionId) : null;
    if (s) {
      const st = statusOf(s);
      if (s.agentsRunning || s.tasks?.size || (s.live?.status ? s.live.status !== 'idle' : st === 'working' || st === 'needs-input')) continue;
    }
    const last = Math.max(Date.parse(t.startedAt) || 0, Date.parse(s?.lastActivity) || 0, Date.parse(s?.startedAt) || 0);
    if (now - last < DRAWER_IDLE_MS) continue;
    console.log(`[peixairada] terminal ${t.id}: idle ${Math.round((now - last) / 3600_000)} h with no page on it — ending it${s ? ` (chat ${s.id})` : ''}`);
    killTerm(t);
  }
}

// ---- who may ask: the board's own pages, and nothing a browser lets another site send ----------------------------
// Loopback is no trust boundary a browser keeps: any page open in one can POST here — start a claude in a folder the
// board knows, write a Peacock colour — and open a WebSocket to a drawer and type into it, since WebSockets have no
// same-origin rule at all (2026-09-27). So a request has to be the board's own page (its Origin is this server) or
// come from no browser at all (curl, the app's fetches and the tests send no Origin), and its Host has to be a
// loopback name: a DNS name pointed at 127.0.0.1 (rebinding) would be the same page from an origin that is not ours.
// A `null` Origin — a file:// page, a sandboxed frame — is nobody's. And a browser sends no Origin at all on a GET it
// makes for an <img>, a <script> or a navigation, so its Sec-Fetch-Site says whose page asked (2026-10-03): only this
// server's own, or the user typing the address; another site may at most navigate to the board itself.
// Bound to every interface (HOST 0.0.0.0), the Host is whichever address was used: the Origin must then name that
// same host, and no Origin is only for a client on this Mac — the LAN reached every route before.
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1', HOST]);
const ANY_HOST = HOST === '0.0.0.0' || HOST === '::';
const LOCAL_ADDR = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function foreign(req) {
  const hostPort = String(req.headers.host || ''), host = hostPort.replace(/:\d+$/, '');
  if (host && !ANY_HOST && !LOOPBACK.has(host)) return `host ${host}`;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none' && !(req.headers['sec-fetch-mode'] === 'navigate' && /^\/(index\.html)?(\?|#|$)/.test(req.url || ''))) return `site ${site}`;
  const origin = req.headers.origin;
  if (origin === undefined) return ANY_HOST && !LOCAL_ADDR.has(req.socket?.remoteAddress) ? `no origin, from ${req.socket?.remoteAddress}` : null;
  let o; try { o = new URL(origin); } catch { return `origin ${origin}`; }
  const port = o.port || (o.protocol === 'https:' ? '443' : '80');
  if ((ANY_HOST ? o.host !== hostPort : !LOOPBACK.has(o.hostname)) || port !== String(PORT)) return `origin ${origin}`;
  return null;
}

// One WebSocket per attached page. Binary frames carry output — first the screen as it stands (the holder's
// headless terminal serialized: scrollback, cells, cursor, modes), then the PTY's bytes as they come; text frames
// are JSON in both directions: {t:'in', d}, {t:'resize', cols, rows} and {t:'clear'} up, {t:'clear'} and
// {t:'exit', code} down. Output that arrives while the snapshot is on its way waits in `ws.hold` and follows it,
// minus what the snapshot already contains (`upto`), so the page sees the screen and then, in order, only what
// came after it. A clear rides in that same queue — it is numbered like output, and wipes the page in its place.
const wss = new WebSocketServer({ noServer: true, maxPayload: 8 << 20 });   // a page sends keys, a paste at most
function attachTermSocket(req, socket, head) {
  const why = foreign(req);
  if (why) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
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
    // a bad frame (unmasked, not UTF-8, over maxPayload) is an 'error' on the socket — and an 'error' nobody listens
    // for ends the server, every drawer's page and the board's stream with it (2026-10-03)
    ws.on('error', e => console.error(`[peixairada] terminal ${t.id}: a page's socket: ${e.message}`));
  });
}

// ---------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

const BODY_MAX = 1e6;
/** The JSON object in the body, or {} — none, unparseable, not an object, or too large all read as empty. Decoded
 *  whole (2026-10-03: a chunk at a time before, so a character split across two chunks came out as two U+FFFD). */
const jsonBody = req => readRaw(req, BODY_MAX).then(b => { const v = JSON.parse(b.toString('utf8') || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }).catch(() => ({}));

/** Newest first by the chat's last word — yours or Claude's reply, whichever came later, or a PR come round to you (its
 *  turn's movedAt) — the board's own order (`byWord` in index.html). Over summaries. */
const wordAt = s => {
  const u = String(s.lastUserAt || ''), r = String(s.lastReplyAt || ''), m = s.prs.reduce((a, p) => (p.turn?.you && p.turn.movedAt > a ? p.turn.movedAt : a), '');
  const w = (u > r ? u : r) || String(s.lastActivity || '') || String(s.startedAt || '');   // an empty chat: its start (the page's copy agrees)
  return m > w ? m : w;
};
function sortedSummaries() {
  const ti = termIndex();
  return [...sessions.values()].map(s => summary(s, ti)).sort((a, b) => wordAt(b).localeCompare(wordAt(a)));
}

// Requests wait for the boot, which starts once the port is ours (main()). Everything a route does is inside the try,
// and every answer's head is written only once its body is in hand: a throw after a writeHead used to throw again in
// the catch's own writeHead, and the rejection nobody handled ended the server (2026-10-03).
const booted = Promise.withResolvers();
const server = createServer(async (req, res) => {
  try {
    await booted.promise;
    const why = foreign(req);
    if (why) return json(res, 403, { error: `not the board's own page (${why})` });
    const url = new URL(req.url, 'http://localhost');   // the path and the query: the Host was foreign()'s to judge
    const p = url.pathname;
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      const html = readFileSync(join(__dirname, 'public', 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(html);
    }
    let m;
    if (req.method === 'GET' && (m = p.match(/^\/vendor\/([\w.-]+\.(js|css))$/))) {
      const f = join(__dirname, 'public', 'vendor', m[1]);
      if (!existsSync(f)) return json(res, 404, { error: 'not found' });
      const body = readFileSync(f);
      res.writeHead(200, { 'content-type': m[2] === 'css' ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=86400' });
      return res.end(body);
    }
    if (req.method === 'GET' && p === '/api/sessions') return json(res, 200, { sessions: sortedSummaries(), projects: projectList(), pins: pinned, hidden: hiddenProjects, peacock: peacockColors(), repos: repoUrls(), claudeDir: CLAUDE_DIR, notify: NOTIFY, notifications: notificationsOn });
    if (req.method === 'GET' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/messages$/))) {
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      if (!s.loaded && s.file) { indexFile(s.file, { full: true }); applyLiveness(sessions.get(m[1])); }
      const cur = sessions.get(m[1]);
      cur.openedAt = Date.now();
      queueSessionPrs(cur);   // opening a chat refreshes its PR statuses and keeps them polled; the SSE push carries them in
      for (const t of cur.tickets) if (ticketWanted(t.key) && Date.now() >= jiraPauseUntil) queueTicket(t.key);   // …and its tickets
      return json(res, 200, { session: summary(cur), entries: cur.entries, gen: cur.gen, upto: cur.entryCount });   // the entries end at upto
    }
    // ⌥⌘T: a zsh in the chat's folder, in the pane's zsh tab — a holder like the claude one (`zsh -l -i` in the PTY),
    // one per chat, alive until `exit` or a DELETE. The inline "new tab in iTerm" (2026-09-20).
    if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/shell$/))) {
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      const have = shellOf(s);
      if (have && have.exited === null) return json(res, 200, { terminal: termSummary(have) });
      const r = await spawnOnce(`${s.id}:shell`, async () => { const body = await jsonBody(req); return spawnTerm({ cwd: s.live?.cwd || s.cwd, sessionId: s.id, cols: body.cols, rows: body.rows, shell: true }); });
      return json(res, r.code, r);
    }
    if (req.method === 'PUT' && p === '/api/pins') {   // the pinned projects, in order — the whole list each time; folder cwds and c:<id>
      const body = await jsonBody(req);
      if (!Array.isArray(body.pins)) return json(res, 400, { error: 'expected {pins: [key]}' });
      pinned = [...new Set(body.pins.filter(k => typeof k === 'string' && /^(\/|c:\w+$)/.test(k)).map(k => k.slice(0, 1000)))].slice(0, 200);
      saveState(); broadcast('pins', { pins: pinned }); pollPeacock();
      return json(res, 200, { ok: true, pins: pinned });
    }
    if (req.method === 'PUT' && p === '/api/hidden') {   // the projects taken off the board, the whole list each time — same keys as the pins
      const body = await jsonBody(req);
      if (!Array.isArray(body.hidden)) return json(res, 400, { error: 'expected {hidden: [key]}' });
      hiddenProjects = [...new Set(body.hidden.filter(k => typeof k === 'string' && /^(\/|c:\w+$)/.test(k)).map(k => k.slice(0, 1000)))].slice(0, 500);
      saveState(); broadcast('hidden', { hidden: hiddenProjects });
      return json(res, 200, { ok: true, hidden: hiddenProjects });
    }
    if (req.method === 'PUT' && p === '/api/notifications') {   // the cog's switch: system notifications on or off, for every page and the app
      const body = await jsonBody(req);
      if (typeof body.on !== 'boolean') return json(res, 400, { error: 'expected {on: true|false}' });
      notificationsOn = body.on;
      saveState(); broadcast('notifications', { on: notificationsOn });
      return json(res, 200, { ok: true, on: notificationsOn });
    }
    if (req.method === 'GET' && p === '/api/stats') return json(res, 200, await machineStats(new Set((url.searchParams.get('want') || '').split(',').filter(Boolean))));
    if (req.method === 'GET' && p === '/api/awake') { await readPower(); return json(res, 200, awakeState()); }
    if (req.method === 'PUT' && p === '/api/awake') {   // the menu's two switches: {awake} holds idle sleep off, {lid} sleep with the lid shut (a password)
      const body = await jsonBody(req);
      if (typeof body.awake !== 'boolean' && typeof body.lid !== 'boolean') return json(res, 400, { error: 'expected {awake: true|false} or {lid: true|false}' });
      try {
        if (typeof body.awake === 'boolean') keepAwake(body.awake);
        if (typeof body.lid === 'boolean') await setLid(body.lid);
      } catch (e) { return json(res, e.message === 'cancelled' ? 409 : 500, { error: e.message, ...awakeState() }); }
      return json(res, 200, { ok: true, ...awakeState() });
    }
    if ((req.method === 'PUT' || req.method === 'DELETE') && p === '/api/peacock') {   // the board sets a folder's Peacock colour
      const body = await jsonBody(req);
      const cwd = typeof body.cwd === 'string' ? body.cwd.replace(/\/+$/, '') : '';
      if (!peacockCwds().has(cwd)) return json(res, 400, { error: 'not a folder the board knows' });
      if (cwd === HOME || cwd === '/') return json(res, 400, { error: 'the home folder has no Peacock colour — it is read from a folder below it' });   // peacockFile stops short of it
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
      let buf; try { buf = await readRaw(req, ATTACH_MAX); } catch (e) { res.setHeader('connection', 'close'); return json(res, 413, { error: e.message === 'too large' ? `larger than ${ATTACH_MAX / 1048576} MB` : String(e.message || e) }); }
      try { return json(res, 200, { ok: true, path: saveAttachment(sid, name, buf), bytes: buf.length }); }
      catch (e) { return json(res, 500, { error: `could not save: ${e.message || e}` }); }
    }
    if (req.method === 'PUT' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/title$/))) {   // a title typed on the board; empty clears it
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      const body = await jsonBody(req);
      const title = cut(String(body.title ?? '').replace(/\s+/g, ' ').trim(), 120);
      if (title) titles[s.id] = title; else delete titles[s.id];
      for (const id of Object.keys(titles)) if (!sessions.has(id)) delete titles[id];
      saveState(); schedulePush(s);
      return json(res, 200, { ok: true, title: summary(s).title, boardTitle: titles[s.id] || null });
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/done$/))) {
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      const body = await jsonBody(req);
      const done = body.done !== false;
      if (done) {
        doneMarks[s.id] = new Date().toISOString();
        // Done means done: the claude behind it stops too (2026-09-20) — the drawer's, and one live elsewhere (SIGTERM,
        // as closing that terminal would; a VS Code tab goes dead). Not awaited: the registry notices on its own.
        for (const t of terms.values()) if (t.sessionId === s.id && t.exited === null) killTerm(t);
        if (s.alive && s.live?.pid) for (const p of [s.live, ...(s.rivals || [])]) endClaude(p).then(() => loadRegistry());
      } else delete doneMarks[s.id];
      for (const id of Object.keys(doneMarks)) if (!sessions.has(id)) delete doneMarks[id]; // prune forgotten sessions
      saveState(); schedulePush(s);
      return json(res, 200, { ok: true, done: isDone(s) });
    }
    if (req.method === 'GET' && p === '/api/projects') return json(res, 200, { projects: projectList() });
    if (req.method === 'POST' && p === '/api/projects') {
      const body = await jsonBody(req);
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
      const body = await jsonBody(req);
      const v = projectInput(body, prev);
      if (v.error) return json(res, 400, { error: v.error });
      projects[m[1]] = { ...prev, ...v };
      saveState(); broadcast('projects', { projects: projectList() }); pollPeacock();
      return json(res, 200, { project: projects[m[1]] });
    }
    if (req.method === 'GET' && p === '/api/usage') { const { code, body } = await planUsage(); return json(res, code, body); }
    if (req.method === 'GET' && p === '/api/terminals') return json(res, 200, { terminals: [...terms.values()].map(termSummary), available: termsAvailable(), dir: TERMS_DIR });
    if (req.method === 'GET' && p === '/api/launchers') {   // the folder's Taskfile tasks that launch claude, if any (see launchersFor)
      const cwd = url.searchParams.get('cwd') || '';
      if (!cwd.startsWith('/')) return json(res, 400, { error: 'cwd must be an absolute path' });
      return json(res, 200, { cwd, launchers: await launchersFor(cwd) });
    }
    if (req.method === 'GET' && p === '/api/folders') return json(res, 200, { roots: boardConfig().roots, folders: rootFolders() });
    if (req.method === 'POST' && p === '/api/clone') {   // a repo of a root's org, cloned into that root — then the page starts a chat in it
      const body = await jsonBody(req);
      return cloneRepo(typeof body.name === 'string' ? body.name.trim() : '', typeof body.root === 'string' ? body.root : null, r => r.error ? json(res, r.code, { error: r.error }) : json(res, r.code, { cwd: r.cwd, cloned: r.cloned }));
    }
    if (req.method === 'GET' && p === '/api/config') return json(res, 200, boardConfig());
    if (req.method === 'GET' && p === '/api/config/suggest') return json(res, 200, { roots: suggestRoots() });
    if (req.method === 'GET' && p === '/api/jira') return json(res, 200, await jiraInfo());
    if ((req.method === 'PUT' || req.method === 'DELETE') && p === '/api/jira/token') {   // the Setup's token box: into the keychain, or out of it
      const body = req.method === 'PUT' ? await jsonBody(req) : {};
      const token = req.method === 'PUT' ? (typeof body.token === 'string' ? body.token.trim() : '') : '';
      if (req.method === 'PUT' && !/^[\x21-\x7e]{8,1024}$/.test(token)) return json(res, 400, { error: 'expected {token} — the API token, one line' });
      try { await saveJiraToken(token); } catch (e) { return json(res, 400, { error: e.message }); }
      return json(res, 200, await jiraInfo());
    }
    if (req.method === 'PUT' && p === '/api/config') {   // the settings' Setup: the keys given replace theirs, the rest stand
      reloadConfig();   // a hand edit since the last poll first: merged into, not saved over — nor a broken one written over
      if (configError) return json(res, 409, { error: `${configError} — fix it by hand, or delete it to start over` });
      const body = await jsonBody(req);
      // `create`: the welcome's "make it" — a root under the home that is not there yet is made first, so a new Mac's
      // ~/code can be the answer before anything is cloned into it. Nowhere else: a typo in the Setup stays a refusal.
      if (body.create === true && Array.isArray(body.roots)) for (const r of body.roots) {
        const dir = typeof r?.dir === 'string' && r.dir.trim() ? resolve(expandHome(r.dir)) : '';
        if (dir.startsWith(homedir() + '/') && !existsSync(dir)) try { mkdirSync(dir, { recursive: true }); } catch (e) { return json(res, 400, { error: `${tildePath(dir)}: ${e.message}` }); }
      }
      const r = cleanSetup(body, true);
      if (r.error) return json(res, 400, { error: r.error });
      const jiraWas = JSON.stringify(setup.jira ?? null);
      setup = { ...setup, ...r.setup };
      folderCache.clear();
      if (JSON.stringify(setup.jira ?? null) !== jiraWas) jiraReset();
      const failed = saveConfig();
      broadcast('config', boardConfig());
      return failed ? json(res, 500, { error: `not saved to ${tildePath(CONFIG_FILE)}: ${failed}` }) : json(res, 200, { ok: true, config: boardConfig() });
    }
    if (req.method === 'POST' && p === '/api/terminals') {   // a new chat in a folder — `claude`, or `task <name>` when the folder launches it so
      const body = await jsonBody(req);
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
      const r = await spawnOnce(`${s.id}:claude`, async () => { const body = await jsonBody(req); return spawnTerm({ cwd: s.live?.cwd || s.cwd, sessionId: s.id, cols: body.cols, rows: body.rows }); });
      return json(res, r.code, r);
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/takeover$/))) {   // end every claude it is live in elsewhere, resume it here
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      const body = await jsonBody(req);
      const have = termOf(s);
      if (have && have.exited === null) {
        // Already here: this ends the others — VS Code's, when the chat was opened there again after a take-over.
        const others = s.rivals;
        for (const p of others) { const r = await endClaude(p); if (!r.ok) return json(res, r.code, { error: r.error }); }
        loadRegistry();
        return json(res, 200, { terminal: termSummary(have), ended: others.map(p => p.pid) });
      }
      if (!s.alive || !s.live?.pid) return json(res, 409, { error: 'not live anywhere — open a terminal on it instead' });
      const cwd = s.live.cwd || s.cwd;   // before the registry entry goes
      for (const p of [s.live, ...s.rivals]) { const r = await endClaude(p); if (!r.ok) return json(res, r.code, { error: r.error }); }
      loadRegistry();
      const t = await spawnOnce(`${s.id}:claude`, () => spawnTerm({ cwd, sessionId: s.id, cols: body.cols, rows: body.rows }));
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
      const snap = JSON.stringify({ sessions: sortedSummaries(), projects: projectList(), pins: pinned, hidden: hiddenProjects, peacock: peacockColors(), repos: repoUrls(), notify: NOTIFY, notifications: notificationsOn, config: boardConfig(), about: aboutInfo(), awake: awakeState() });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`event: snapshot\ndata: ${snap}\n\n`);
      sseClients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
      return;
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(`[peixairada] ${req.method} ${req.url}:`, e);
    if (res.headersSent) res.destroy(); else json(res, 500, { error: String(e?.stack || e) });
  }
});

server.on('upgrade', (req, socket, head) => { booted.promise.then(() => attachTermSocket(req, socket, head)).catch(e => { console.error('[peixairada] upgrade:', e); socket.destroy(); }); });

// ---------------------------------------------------------------------------------------------
// Boot — only when run as the program. Imported (the tests), the module exposes its pure parts and does nothing.
// ---------------------------------------------------------------------------------------------
export { fold, newSession, summary, agentRunning, usageWindows, prChecks, ticketsIn, noteTickets, cleanSetup, notePr, notePrs, forgetRef, ghRepoOf, prTitle, duePrs, prStatus, prTurn, prPeople, setPrInfo, doneMarks, cleanPrompt, textOf, snippet, summarizeToolInput, toolResultSnippet, projectInput, writePeacock, readPeacock, termSummary, isDone, sessions, terms };
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main().catch(e => { console.error('[peixairada] boot failed:', e); process.exit(1); });
async function main() {
endVsWebWithUs();
// The port first, and nothing else until it is ours (2026-10-03): a server waiting on a busy port — the agent behind
// the app's own, an `npm start` beside the agent — adopted every holder, polled GitHub, posted alerts and wrote its
// boot-time copy of the state file over the live server's ticks, all while serving nobody. A busy port is waited
// for, not died on: the launchd agent starts while the app's own server still holds 7331, and the handoff is the app
// quitting a moment later — a crash here would only make launchd throttle and retry with noise in the log.
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`[peixairada] port ${PORT} is busy — trying again in 3 s`);
  setTimeout(() => server.listen(PORT, HOST), 3000);
});
await new Promise(res => server.listen(PORT, HOST, res));
console.log(`[peixairada] listening on http://${HOST}:${PORT}  (notify=${NOTIFY}, terminals in ${TERMS_DIR})`);
const t0 = Date.now();
loadConfig();
scanProjects();
await adoptHolders();   // before the registry: a drawer's own process is what makes a chat's live process "mine"
loadRegistry();
indexing = false;
// Statuses alone could wait for a chat to be opened; titles cannot — they head every card, so the whole
// board needs them up front. Batched 40 to a GraphQL call, in the background, the recent chats' first.
sweepPrs();
sweepTickets();
if (awakeOn) try { keepAwake(true); } catch (e) { console.error(`[peixairada] could not keep the Mac awake: ${e.message}`); }   // the switch outlives a restart
readPower();
cpuBusy();   // the first sample: the status bar's first ask has a share to give
pollPeacock();
setInterval(pollPeacock, PEACOCK_POLL_MS);
pollRepos();
setInterval(pollRepos, PEACOCK_POLL_MS);
setInterval(reloadConfig, CONFIG_POLL_MS);   // a stat against the board's own record of it: a save-by-rename, a file not there yet, one made and gone between two looks
for (const s of sessions.values()) if (s.alive) scanAgents(s);
// An agent gone quiet stops counting; a task past its expiry stops running. Both are only visible on a push, and
// a chat whose last word was "monitor started" has nothing else to push.
setInterval(() => {
  for (const s of sessions.values()) {
    if (pruneTasks(s)) schedulePush(s);
    if (s.alive) scanAgents(s);
    else if (s.agentsRunning) { s.agentsRunning = 0; schedulePush(s); }   // its claude is gone, and its agents with it — a stale card read "2 agents" until a restart
  }
  sweepTasks();
  sweepDrawers();
  sweepPrs();
  sweepTickets();
  readPower();   // the lid's setting and idle sleep are the system's: whoever changes them, or the charger, the marks follow
}, REGISTRY_POLL_MS);
console.log(`[peixairada] indexed ${sessions.size} sessions (${[...sessions.values()].filter(s => s.alive).length} alive) from ${CLAUDE_DIR} in ${Date.now() - t0}ms`);

const pendingFiles = new Map(), pendingAgents = new Map();
function onFsEvent(_ev, rel) {
  if (!rel) return;
  const parts = String(rel).split('/');
  if (parts.length === 4 && parts[2] === 'subagents' && parts[3].endsWith('.jsonl')) {   // <slug>/<id>/subagents/agent-*.jsonl
    const s = sessions.get(parts[1]); if (!s) return;
    clearTimeout(pendingAgents.get(s.id));
    pendingAgents.set(s.id, setTimeout(() => { pendingAgents.delete(s.id); scanAgents(sessions.get(s.id) ?? s); }, 200));   // the chat as it is then: a re-read (indexFile) replaces the object
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
booted.resolve();
}
