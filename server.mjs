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

import { createServer } from 'node:http';
import {
  chmodSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, watch, writeFileSync
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
// node-pty is the one native module here. Its prebuilt spawn-helper arrives from npm without the
// executable bit, which surfaces as "posix_spawnp failed" on the first terminal — fix it before the
// import rather than documenting it. Without the module the server still runs; terminals answer 501.
try { const h = join(__dirname, 'node_modules', 'node-pty', 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'); if (existsSync(h)) chmodSync(h, 0o755); } catch {}
const nodePty = await import('node-pty').then(m => m.default ?? m).catch(e => { console.error('[peixairada] node-pty unavailable — terminals are disabled:', e.message); return null; });
const CLAUDE_DIR = process.env.CLAUDE_DIR || join(homedir(), '.claude');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');
const SESSIONS_DIR = join(CLAUDE_DIR, 'sessions');
const PORT = Number(process.env.PORT || 7331);
const HOST = process.env.HOST || '127.0.0.1';
const NOTIFY = process.env.NOTIFY || 'native'; // native | off
const TAIL_BYTES = Number(process.env.TAIL_BYTES || 512 * 1024);
const MAX_ENTRIES = Number(process.env.MAX_ENTRIES || 800);
const REGISTRY_POLL_MS = 10_000;
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
} catch {}
function saveState() {
  try { mkdirSync(dirname(STATE_FILE), { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify({ done: doneMarks }, null, 1)); }
  catch (e) { console.error('[peixairada] could not save state', e.message); }
}
const isDone = s => !!doneMarks[s.id] && doneMarks[s.id] >= (s.lastActivity || '');

function newSession(id, file) {
  return {
    id, file,
    slug: file ? basename(dirname(file)) : null,
    cwd: null, gitBranch: null, model: null,
    title: null, customTitle: null, lastPrompt: null, lastReply: null, prs: [],
    status: 'unknown', statusSince: null, lastActivity: null, lastUserAt: null, lastReplyAt: null,
    live: null, alive: false,
    entries: [], entryCount: 0, loaded: false,
    offset: 0, partial: '', truncatedHead: false,
    pendingNotify: null, notifyTimer: null, pushTimer: null, newEntries: [],
    lastHook: null,
    replying: null, replyError: null
  };
}

function summary(s) {
  const prT = prTitle(s);
  return {
    // Prefer the registry cwd: transcript lines record the shell's *current* directory, which moves with `cd`.
    id: s.id, slug: s.slug, cwd: s.live?.cwd || s.cwd, project: basename(s.live?.cwd || s.cwd || '') || s.slug,
    gitBranch: s.gitBranch, model: s.model,
    // The PR title beats Claude's own: it is what the work is called everywhere else — the PR page, the
    // branch, standup. A title the user typed still wins over both.
    title: s.customTitle || prT || s.title || s.lastPrompt || (!s.file && s.alive ? '(no messages yet)' : '(untitled)'),
    aiTitle: s.title, customTitle: s.customTitle, prTitle: prT,
    lastPrompt: s.lastPrompt, lastReply: s.lastReply, prs: s.prs,
    // A live process with no transcript yet is an empty, idle panel (e.g. restored by VS Code, never prompted).
    // Not alive = the Claude process is gone: 'stale'. Resuming the chat registers a new pid and it comes back.
    status: s.alive ? (s.status === 'unknown' && !s.file ? 'idle' : s.status) : (s.status === 'unknown' ? 'unknown' : 'stale'),
    rawStatus: s.status, statusSince: s.statusSince, lastActivity: s.lastActivity,
    lastUserAt: s.lastUserAt, lastReplyAt: s.lastReplyAt,
    alive: s.alive, live: s.live, terminal: termSummary(termOf(s)), entryCount: s.entryCount, loaded: s.loaded, file: s.file, lastHook: s.lastHook,
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

function toolResultSnippet(block) {
  const c = block.content;
  const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join('\n') : '';
  return snippet(text, 200);
}

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
      if (line.gitBranch) s.gitBranch = line.gitBranch;
      if (line.isMeta || line.isCompactSummary) return false;
      const content = line.message?.content;
      const blocks = Array.isArray(content) ? content : null;
      const toolResults = blocks ? blocks.filter(b => b?.type === 'tool_result') : [];
      if (toolResults.length) {
        for (const b of toolResults) pushEntry(s, { role: 'user', kind: 'tool_result', toolUseId: b.tool_use_id, isError: !!b.is_error, text: toolResultSnippet(b), ts });
        s.lastActivity = ts;
        if (s.status === 'needs-input') { s.lastUserAt = ts; setStatus(s, 'working', ts); } // question answered — that was you
        return true;
      }
      const raw = textOf(content);
      if (raw.startsWith('[Request interrupted')) {
        pushEntry(s, { role: 'user', kind: 'interrupt', text: raw, ts });
        s.lastActivity = ts; s.lastUserAt = ts;   // Escape is you acting on the chat too
        setStatus(s, 'idle', ts);
        return true;
      }
      if (SYNTHETIC_RE.test(raw)) return false;
      const text = cleanPrompt(raw);
      if (!text) return false;
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
      const m = line.message || {};
      const blocks = Array.isArray(m.content) ? m.content : [];
      if (m.model) s.model = m.model;
      let needsInput = false;
      for (const b of blocks) {
        if (b.type === 'text' && b.text?.trim()) { pushEntry(s, { role: 'assistant', kind: 'text', text: b.text, ts, msgId: m.id }); notePrs(s, b.text, ts, 'claude'); }
        else if (b.type === 'tool_use') {
          pushEntry(s, { role: 'assistant', kind: 'tool_use', name: b.name, text: summarizeToolInput(b.name, b.input), toolUseId: b.id, ts });
          if (NEEDS_INPUT_TOOLS.has(b.name)) needsInput = true;
        }
      }
      s.lastActivity = ts;
      if (m.stop_reason === 'end_turn' || m.stop_reason === 'stop_sequence') {
        const text = textOf(blocks).trim();
        if (text) { s.lastReply = snippet(text, 300); s.lastReplyAt = ts; }
        setStatus(s, 'idle', ts);
        queueNotify(s, 'reply');
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
  if (prev) { s.live = prev.live; s.alive = prev.alive; s.lastHook = prev.lastHook; }
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
  const seen = new Set();
  for (const name of readdirSync(SESSIONS_DIR)) {
    if (!name.endsWith('.json')) continue;
    let reg;
    try { reg = JSON.parse(readFileSync(join(SESSIONS_DIR, name), 'utf8')); } catch { continue; }
    if (!reg.sessionId) continue;
    seen.add(reg.sessionId);
    let s = sessions.get(reg.sessionId);
    if (!s) { s = newSession(reg.sessionId, null); sessions.set(reg.sessionId, s); }
    const live = { pid: reg.pid, name: reg.name, entrypoint: reg.entrypoint, kind: reg.kind, cwd: reg.cwd, startedAt: reg.startedAt, version: reg.version };
    const changed = JSON.stringify(live) !== JSON.stringify(s.live);
    s.live = live;
    if (!s.cwd && reg.cwd) s.cwd = reg.cwd;
    linkTermToRegistry(reg, s);
    if (applyLiveness(s) || changed) schedulePush(s);
  }
  for (const s of sessions.values()) {
    if (s.live && !seen.has(s.id)) { s.live = null; if (applyLiveness(s)) schedulePush(s); }
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
  const evt = { kind, sessionId: s.id, project: sum.project, title: sum.title, name: s.live?.name || null, cwd: s.cwd, snippet: kind === 'reply' ? sum.lastReply : (s.entries.findLast?.(e => e.kind === 'tool_use' && NEEDS_INPUT_TOOLS.has(e.name))?.text || 'Waiting for your input'), ts: new Date().toISOString() };
  broadcast('alert', evt);
  nativeNotify(kind === 'reply' ? `Claude replied · ${sum.project}` : `Claude needs input · ${sum.project}`, sum.title, evt.snippet || '');
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
    case 'PermissionRequest': setStatus(s, 'needs-input', ts); queueNotify(s, 'needs-input'); break;
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
function codeBin() { return findBin('code', '"Focus in VS Code" is disabled'); }

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
// The PTY lives here, so the process survives a page reload or a switch to another chat; it does
// not survive this server. Output is kept in a bounded scrollback and replayed on every attach.
// A resumed chat keeps its session id; a new one is matched to its session by pid when it registers.
const TERM_SCROLLBACK = Number(process.env.TERM_SCROLLBACK || 256 * 1024);
const TERM_LINGER_MS = 5 * 60_000;    // keep an exited terminal's output around this long
const terms = new Map();              // id -> { id, sessionId, cwd, pid, proc, resume, startedAt, exited, chunks, bytes, clients }
let termSeq = 0;

function termOf(s) { for (const t of terms.values()) if (t.sessionId === s.id) return t; return null; }
function termSummary(t) {
  return t ? { id: t.id, sessionId: t.sessionId, cwd: t.cwd, pid: t.pid, resume: t.resume, startedAt: t.startedAt, exited: t.exited } : null;
}

// The server's own environment minus anything that says "you are inside a Claude session" — under
// `npm start` from a Claude shell that is exactly what it says, and the CLI refuses to nest.
function termEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE(CODE|_)/.test(k)) env[k] = v;
  return { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor', LANG: env.LANG || 'en_US.UTF-8' };
}

/**
 * Start `claude` (or `claude --resume <id>`) in a PTY in `cwd`. Through an interactive login zsh,
 * because the app's server has a bare PATH and the tools Claude will call — git, gh, node — are on
 * the PATH that .zshrc builds (mise activates there). `exec` makes claude take over the shell's
 * pid, which is the pid the registry will report.
 */
function spawnTerm({ cwd, sessionId = null, cols = 120, rows = 30 }) {
  if (!nodePty) return { code: 501, error: 'node-pty is not available — run npm install and restart the server' };
  const bin = claudeBin();
  if (!bin) return { code: 503, error: 'claude binary not found — set CLAUDE_BIN to its path' };
  if (!cwd) return { code: 400, error: 'no cwd known for this chat' };
  if (!existsSync(cwd)) return { code: 409, error: `cwd no longer exists: ${cwd}` };
  const args = sessionId ? ['--resume', sessionId] : [];
  const id = `t${++termSeq}-${Date.now().toString(36)}`;
  let proc;
  try {
    proc = nodePty.spawn('/bin/zsh', ['-l', '-i', '-c', 'exec "$0" "$@"', bin, ...args],
      { name: 'xterm-256color', cols: Math.min(500, Math.max(20, cols | 0)), rows: Math.min(200, Math.max(5, rows | 0)), cwd, env: termEnv() });
  } catch (e) { return { code: 500, error: `could not start a terminal: ${e.message}` }; }
  const t = { id, sessionId, cwd, pid: proc.pid, proc, resume: !!sessionId, startedAt: new Date().toISOString(), exited: null, chunks: [], bytes: 0, clients: new Set() };
  proc.onData(d => {
    const buf = Buffer.from(d, 'utf8');
    t.chunks.push(buf); t.bytes += buf.length;
    while (t.bytes > TERM_SCROLLBACK && t.chunks.length > 1) t.bytes -= t.chunks.shift().length;
    for (const ws of t.clients) if (ws.readyState === 1) ws.send(buf);
  });
  proc.onExit(({ exitCode }) => {
    t.exited = exitCode ?? 0;
    const msg = JSON.stringify({ t: 'exit', code: t.exited });
    for (const ws of t.clients) if (ws.readyState === 1) ws.send(msg);
    broadcast('terminal', termSummary(t));
    const s = t.sessionId && sessions.get(t.sessionId); if (s) schedulePush(s);
    setTimeout(() => { if (terms.get(id) === t) terms.delete(id); }, TERM_LINGER_MS).unref();
  });
  terms.set(id, t);
  console.log(`[peixairada] terminal ${id}: claude${args.length ? ' ' + args.join(' ') : ''} in ${cwd} (pid ${proc.pid})`);
  broadcast('terminal', termSummary(t));
  const s = sessionId && sessions.get(sessionId); if (s) schedulePush(s);
  return { code: 201, terminal: termSummary(t) };
}

/** A new chat has no session id until claude registers; the pid ties the two together. */
function linkTermToRegistry(reg, s) {
  for (const t of terms.values()) {
    if (t.pid !== reg.pid || t.sessionId === reg.sessionId) continue;
    t.sessionId = reg.sessionId;
    broadcast('terminal', termSummary(t)); schedulePush(s);
  }
}

// One WebSocket per attached page. Binary frames carry output (raw PTY bytes, replayed from the
// scrollback first); text frames are JSON in both directions: {t:'in', d} and {t:'resize', cols, rows}
// up, {t:'exit', code} down.
const wss = new WebSocketServer({ noServer: true });
function attachTermSocket(req, socket, head) {
  const m = (req.url || '').match(/^\/api\/terminals\/([\w-]+)\/ws$/);
  const t = m && terms.get(m[1]);
  if (!t) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => {
    t.clients.add(ws);
    if (t.bytes) ws.send(Buffer.concat(t.chunks));
    if (t.exited !== null) ws.send(JSON.stringify({ t: 'exit', code: t.exited }));
    ws.on('message', data => {
      if (t.exited !== null) return;
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.t === 'in' && typeof msg.d === 'string') t.proc.write(msg.d);
      else if (msg.t === 'resize' && msg.cols > 0 && msg.rows > 0) { try { t.proc.resize(Math.min(500, msg.cols | 0), Math.min(200, msg.rows | 0)); } catch {} }
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

/** Newest first by when *you* last acted on the chat — the board's own order (`byUser` in index.html). */
const userAt = s => String(s.lastUserAt || s.lastActivity || '');
function sortedSummaries() {
  return [...sessions.values()].map(summary).sort((a, b) => userAt(b).localeCompare(userAt(a)));
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
    if (req.method === 'GET' && p === '/api/sessions') return json(res, 200, { sessions: sortedSummaries(), claudeDir: CLAUDE_DIR, notify: NOTIFY });
    if (req.method === 'GET' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/messages$/))) {
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      if (!s.loaded && s.file) { indexFile(s.file, { full: true }); applyLiveness(sessions.get(m[1])); }
      const cur = sessions.get(m[1]);
      queueSessionPrs(cur);   // opening a chat is what refreshes its PR statuses; the SSE push carries them in
      return json(res, 200, { session: summary(cur), entries: cur.entries });
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
    if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/done$/))) {
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      const done = body.done !== false;
      if (done) doneMarks[s.id] = new Date().toISOString(); else delete doneMarks[s.id];
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
    if (req.method === 'GET' && p === '/api/terminals') return json(res, 200, { terminals: [...terms.values()].map(termSummary), available: !!nodePty });
    if (req.method === 'POST' && p === '/api/terminals') {   // a new chat in a folder
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      const r = spawnTerm({ cwd: typeof body.cwd === 'string' ? body.cwd : null, cols: body.cols, rows: body.rows });
      return json(res, r.code, r);
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/sessions\/([\w-]+)\/terminal$/))) {   // attach to, or resume, this chat
      const s = sessions.get(m[1]);
      if (!s) return json(res, 404, { error: 'unknown session' });
      const have = termOf(s);
      if (have && have.exited === null) return json(res, 200, { terminal: termSummary(have) });
      // Live elsewhere: same rule as replies — a second claude on one transcript is how it gets mangled.
      if (s.alive) return json(res, 409, { error: `this chat is live in ${s.live?.entrypoint === 'claude-vscode' ? 'VS Code' : 'another terminal'} — open it there` });
      let body = {}; try { body = JSON.parse((await readBody(req)) || '{}'); } catch {}
      const r = spawnTerm({ cwd: s.live?.cwd || s.cwd, sessionId: s.id, cols: body.cols, rows: body.rows });
      return json(res, r.code, r);
    }
    if (req.method === 'DELETE' && (m = p.match(/^\/api\/terminals\/([\w-]+)$/))) {
      const t = terms.get(m[1]);
      if (!t) return json(res, 404, { error: 'unknown terminal' });
      if (t.exited === null) { try { t.proc.kill(); } catch {} }
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/test-notify') {
      nativeNotify('peixAIrada', 'test', 'Native notifications are working.');
      broadcast('alert', { kind: 'reply', sessionId: null, project: 'peixAIrada', title: 'Test notification', snippet: 'If you can read this, alerts work.', ts: new Date().toISOString() });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && p === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`event: snapshot\ndata: ${JSON.stringify({ sessions: sortedSummaries(), notify: NOTIFY })}\n\n`);
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
// Boot
// ---------------------------------------------------------------------------------------------

const t0 = Date.now();
scanProjects();
loadRegistry();
indexing = false;
// Statuses alone could wait for a chat to be opened; titles cannot — they head every card, so the whole
// board needs them up front. Batched 40 to a GraphQL call, in the background, once per run.
for (const s of sessions.values()) queueSessionPrs(s);
console.log(`[peixairada] indexed ${sessions.size} sessions (${[...sessions.values()].filter(s => s.alive).length} alive) from ${CLAUDE_DIR} in ${Date.now() - t0}ms`);

const pendingFiles = new Map();
function onFsEvent(_ev, rel) {
  if (!rel) return;
  const parts = String(rel).split('/');
  if (parts.length !== 2 || !parts[1].endsWith('.jsonl')) return; // ignore memory/, <id>/subagents/, etc.
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

server.listen(PORT, HOST, () => console.log(`[peixairada] listening on http://${HOST}:${PORT}  (notify=${NOTIFY})`));
