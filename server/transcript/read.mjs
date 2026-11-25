// Reading a transcript: whole by chunks, its tail at boot and its head for PRs, a line as it is
// appended.
import { closeSync, fstatSync, openSync, readSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { HEAD_BYTES, TAIL_BYTES } from '../env.mjs';
import { settleDrift } from '../drift.mjs';
import { noteFirstLine } from '../links.mjs';
import { queueNotify } from '../notify.mjs';
import { noteOpened, noteOpening, notePr, notePrs } from '../prs/mentions.mjs';
import { applyLiveness } from '../registry.mjs';
import { newSession } from '../sessions.mjs';
import { schedulePush } from '../sse.mjs';
import { fileToSession, sessions } from '../state.mjs';
import { fold } from './fold.mjs';
import { cleanPrompt, SYNTHETIC_RE, textOf } from './text.mjs';

/** A line that throws in the folding is that line lost, never the file (2026-10-14): one malformed tool call threw
 *  out of the boot's scan and ended the server for good, out of a tail and lost the rest of its chunk, out of a whole
 *  read and the chat's /messages answered 500. Said once per file. */
const badFiles = new Set();
function parseLine(raw, onLine, file) {
  if (!raw) return;
  let line;
  try { line = JSON.parse(raw); } catch { return; }
  try { onLine(line); }
  catch (e) { if (!badFiles.has(file)) { badFiles.add(file); console.error(`[peixairada] ${file}: a line could not be folded, skipped — ${e?.message || e}`); } }
}
function parseLines(text, onLine, file) { for (const raw of text.split('\n')) parseLine(raw, onLine, file); }

const READ_CHUNK = 1 << 20;
/**
 * Every complete line of the file between `start` and `end`, to `onLine`, a chunk at a time; returns the unterminated
 * tail. A transcript is read whole when a chat is opened (indexFile), and reading it as one buffer, one string and
 * one array of lines cost three times its size while it lasted — 300 MB of RSS for a 91 MB chat, to keep 800
 * entries (2026-09-27). This costs a chunk and the longest line.
 */
export function readLines(fd, start, end, onLine, dec = new StringDecoder('utf8')) {
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
export function indexFile(file, { full = false } = {}) {
  let st, fd;
  try { fd = openSync(file, 'r'); st = fstatSync(fd); } catch { if (fd != null) closeSync(fd); return null; }   // gone since the readdir or the event: a file deleted mid-scan ended the boot (2026-10-14)
  const id = basename(file, '.jsonl');
  const prev = sessions.get(id);
  const s = newSession(id, file);
  s.bornAt = st.birthtimeMs;
  if (prev) {
    for (const k of ['live', 'rivals', 'alive', 'startedAt', 'openedAt', 'agentsRunning', 'agentRows', 'agentAll', 'agentSig', 'agentSaid', 'headNow', 'headOk', 'peers', 'tasksGone', 'forkAt', 'backOwed']) s[k] = prev[k];
    clearTimeout(prev.pushTimer); clearTimeout(prev.notifyTimer); clearTimeout(prev.driftTimer);
    s.silent = !!prev.file;
  }
  const start = full || st.size <= TAIL_BYTES ? 0 : st.size - TAIL_BYTES;
  s.loaded = start === 0 || full;
  s.truncatedHead = start > 0;
  s.dec = new StringDecoder('utf8'); s.reading = true;
  try {
    if (start > 0) readLines(fd, 0, Math.min(HEAD_BYTES, start), raw => parseLine(raw, line => headPrs(s, line), file));   // its last line, cut, is dropped
    let skip = start > 0;   // a tail starts mid-line: the first "line" is the end of one
    s.partial = readLines(fd, start, st.size, raw => { if (skip) skip = false; else parseLine(raw, line => fold(s, line), file); }, s.dec);
  } finally { closeSync(fd); s.reading = false; }
  s.offset = st.size;
  s.newEntries = []; // initial load: nothing is "new"
  if (!s.cwd && prev?.cwd) s.cwd = prev.cwd;
  if (!s.tasks?.size && prev?.tasks?.size) s.tasks = prev.tasks;   // a tail re-read has not seen the calls that started them
  if (prev?.mateTypes?.size) s.mateTypes = new Map([...prev.mateTypes, ...(s.mateTypes || [])]);   // nor the spawns that named its teammates' categories
  for (const [id, t] of s.tasks || []) { const p = prev?.tasks?.get(id); if (p) { t.heldAt = p.heldAt; t.askedAt = p.askedAt; } }   // …and lsof's word is the machine's, not the lines' (2026-11-04)
  if (!s.wakes && prev?.wakes?.size) s.wakes = prev.wakes;   // …nor the wake-ups it set (2026-10-31)
  if (prev?.agentEnds?.size) s.agentEnds = new Map([...prev.agentEnds, ...(s.agentEnds || [])]);   // …nor how its agents ended, past the tail (2026-11-02)
  if (prev) { s.diskDrift = prev.diskDrift; s.diskSeen = prev.diskSeen; s.linesIn = prev.linesIn; }   // the disk's word, not the transcript's: a re-read's old prompts do not clear it
  settleDrift(s);
  delete s.silent;
  sessions.set(id, s);
  fileToSession.set(file, id);
  if (prev) { for (const k of prev.pendingNotify || []) queueNotify(s, k); schedulePush(s); }   // the alerts still owed, and the fresh summary
  return s;
}

/** The PRs at the head of a transcript the boot reads only the tail of (2026-10-27): the chat's own is most often named
 *  in its first prompt — "review <url>" — and the card went without it, titled by another, until the chat was opened.
 *  Only what names a PR, read as fold reads it: the rest of the head is the past, and the tail's to tell. */
function headPrs(s, line) {
  noteFirstLine(s, line);
  const ts = line.timestamp || null, c = line.message?.content, blocks = Array.isArray(c) ? c : [];
  if (line.type === 'pr-link') { const url = line.prUrl || line.url; if (url) notePr(s, url, ts, null); return; }
  if (line.type === 'agent-setting') { fold(s, line); return; }   // the chat's first line: the tail has it again only after a resume
  if ((line.type !== 'user' && line.type !== 'assistant') || line.isSidechain) return;
  if (line.cwd) s.cwd = line.cwd;   // a short reference is the folder's repo's; the tail's lines have the last word
  if (line.type === 'assistant') {
    for (const b of blocks) {
      if (b?.type === 'text' && b.text?.trim()) notePrs(s, b.text, ts, 'claude');
      else if (b?.type === 'tool_use' && b.name === 'Bash') noteOpening(s, b, ts);
    }
  } else if (!line.isMeta && !line.isCompactSummary) {
    const results = blocks.filter(b => b?.type === 'tool_result');
    if (results.length) { for (const b of results) if (s.opening.size) noteOpened(s, b); return; }
    const raw = textOf(c), text = cleanPrompt(raw);
    if (text && !raw.startsWith('[Request interrupted') && !SYNTHETIC_RE.test(text)) notePrs(s, text, ts, 'user');
  }
}

/** Called on fs events: read what was appended since the last offset. */
export function tailFile(file) {
  const id = fileToSession.get(file);
  const s = id && sessions.get(id);
  if (!s) { const ns = indexFile(file); if (ns) { applyLiveness(ns); schedulePush(ns); } return; }
  let st;
  try { st = statSync(file); } catch { return; }
  if (st.size < s.offset) { const ns = indexFile(file, { full: s.loaded }); if (ns) { applyLiveness(ns); schedulePush(ns); } return; }
  if (st.size === s.offset) return;
  let fd; try { fd = openSync(file, 'r'); } catch { return; }
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
  parseLines(text.slice(0, nl + 1), line => { if (fold(s, line)) changed = true; }, file);
  if (settleDrift(s)) changed = true;
  if (changed || s.newEntries.length) schedulePush(s);
}
