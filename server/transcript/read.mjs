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

  try {
    line = JSON.parse(raw);
  } catch {
    return;
  }

  try {
    onLine(line);
  } catch (error) {
    if (!badFiles.has(file)) {
      badFiles.add(file);
      console.error(`[peixairada] ${file}: a line could not be folded, skipped — ${error?.message || error}`);
    }
  }
}

function parseLines(text, onLine, file) {
  for (const raw of text.split('\n')) parseLine(raw, onLine, file);
}

const READ_CHUNK = 1 << 20;

/**
 * Every complete line of the file between `start` and `end`, to `onLine`, a chunk at a time; returns the unterminated
 * tail. A transcript is read whole when a chat is opened (indexFile), and reading it as one buffer, one string and
 * one array of lines cost three times its size while it lasted — 300 MB of RSS for a 91 MB chat, to keep 800
 * entries (2026-09-27). This costs a chunk and the longest line.
 */
export function readLines(fd, start, end, onLine, dec = new StringDecoder('utf8')) {
  const buf = Buffer.allocUnsafe(Math.max(1, Math.min(READ_CHUNK, end - start)));

  let pos = start;
  let rest = '';

  while (pos < end) {
    const bytesRead = readSync(fd, buf, 0, Math.min(buf.length, end - pos), pos);

    if (!bytesRead) break;
    pos += bytesRead;
    rest += dec.write(buf.subarray(0, bytesRead));
    let index;

    while ((index = rest.indexOf('\n')) >= 0) {
      onLine(rest.slice(0, index));
      rest = rest.slice(index + 1);
    }
  }

  return rest; // the decoder keeps the bytes of a character cut at `end`: the next read (tailFile, s.dec) completes it
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
  let st;
  let fd;

  try {
    fd = openSync(file, 'r');
    st = fstatSync(fd);
  } catch {
    if (fd != null) closeSync(fd);
    return null;
  } // gone since the readdir or the event: a file deleted mid-scan ended the boot (2026-10-14)

  const id = basename(file, '.jsonl');
  const prev = sessions.get(id);
  const session = newSession(id, file);

  session.bornAt = st.birthtimeMs;

  if (prev) {
    for (const key of [
      'live',
      'rivals',
      'alive',
      'startedAt',
      'openedAt',
      'agentsRunning',
      'agentRows',
      'agentAll',
      'agentSig',
      'agentSaid',
      'headNow',
      'headOk',
      'peers',
      'tasksGone',
      'forkAt',
      'backOwed',
    ]) {
      session[key] = prev[key];
    }

    clearTimeout(prev.pushTimer);
    clearTimeout(prev.notifyTimer);
    clearTimeout(prev.driftTimer);
    session.silent = !!prev.file;
  }

  const start = full || st.size <= TAIL_BYTES ? 0 : st.size - TAIL_BYTES;

  session.loaded = start === 0 || full;
  session.truncatedHead = start > 0;
  session.dec = new StringDecoder('utf8');
  session.reading = true;

  try {
    if (start > 0) {
      readLines(fd, 0, Math.min(HEAD_BYTES, start), raw => parseLine(raw, line => headPrs(session, line), file));
    } // its last line, cut, is dropped

    let skip = start > 0; // a tail starts mid-line: the first "line" is the end of one

    session.partial = readLines(
      fd,
      start,
      st.size,
      raw => {
        if (skip) skip = false;
        else parseLine(raw, line => fold(session, line), file);
      },
      session.dec,
    );
  } finally {
    closeSync(fd);
    session.reading = false;
  }

  session.offset = st.size;
  session.newEntries = []; // initial load: nothing is "new"
  if (!session.cwd && prev?.cwd) session.cwd = prev.cwd;
  if (!session.tasks?.size && prev?.tasks?.size) session.tasks = prev.tasks; // a tail re-read has not seen the calls that started them
  if (prev?.mateTypes?.size) session.mateTypes = new Map([...prev.mateTypes, ...(session.mateTypes || [])]); // nor the spawns that named its teammates' categories

  for (const [id, task] of session.tasks || []) {
    const prevTask = prev?.tasks?.get(id);

    if (prevTask) {
      task.heldAt = prevTask.heldAt;
      task.askedAt = prevTask.askedAt;
    }
  } // …and lsof's word is the machine's, not the lines' (2026-11-04)

  if (!session.wakes && prev?.wakes?.size) session.wakes = prev.wakes; // …nor the wake-ups it set (2026-10-31)
  if (prev?.agentEnds?.size) session.agentEnds = new Map([...prev.agentEnds, ...(session.agentEnds || [])]); // …nor how its agents ended, past the tail (2026-11-02)

  if (prev) {
    session.diskDrift = prev.diskDrift;
    session.diskSeen = prev.diskSeen;
    session.linesIn = prev.linesIn;
  } // the disk's word, not the transcript's: a re-read's old prompts do not clear it

  settleDrift(session);
  delete session.silent;
  sessions.set(id, session);
  fileToSession.set(file, id);

  if (prev) {
    for (const kind of prev.pendingNotify || []) queueNotify(session, kind);
    schedulePush(session);
  } // the alerts still owed, and the fresh summary

  return session;
}

/** The PRs at the head of a transcript the boot reads only the tail of (2026-10-27): the chat's own is most often named
 *  in its first prompt — "review <url>" — and the card went without it, titled by another, until the chat was opened.
 *  Only what names a PR, read as fold reads it: the rest of the head is the past, and the tail's to tell. */
function headPrs(session, line) {
  noteFirstLine(session, line);

  const ts = line.timestamp || null;
  const content = line.message?.content;
  const blocks = Array.isArray(content) ? content : [];

  if (line.type === 'pr-link') {
    const url = line.prUrl || line.url;

    if (url) notePr(session, url, ts, null);
    return;
  }

  if (line.type === 'agent-setting') {
    fold(session, line);
    return;
  } // the chat's first line: the tail has it again only after a resume

  if ((line.type !== 'user' && line.type !== 'assistant') || line.isSidechain) return;
  if (line.cwd) session.cwd = line.cwd; // a short reference is the folder's repo's; the tail's lines have the last word

  if (line.type === 'assistant') {
    for (const block of blocks) {
      if (block?.type === 'text' && block.text?.trim()) notePrs(session, block.text, ts, 'claude');
      else if (block?.type === 'tool_use' && block.name === 'Bash') noteOpening(session, block, ts);
    }
  } else if (!line.isMeta && !line.isCompactSummary) {
    const results = blocks.filter(block => block?.type === 'tool_result');

    if (results.length) {
      for (const result of results) if (session.opening.size) noteOpened(session, result);
      return;
    }

    const raw = textOf(content);
    const text = cleanPrompt(raw);

    if (text && !raw.startsWith('[Request interrupted') && !SYNTHETIC_RE.test(text)) notePrs(session, text, ts, 'user');
  }
}

/** Called on fs events: read what was appended since the last offset. */
export function tailFile(file) {
  const id = fileToSession.get(file);
  const session = id && sessions.get(id);

  if (!session) {
    const ns = indexFile(file);

    if (ns) {
      applyLiveness(ns);
      schedulePush(ns);
    }

    return;
  }

  let st;

  try {
    st = statSync(file);
  } catch {
    return;
  }

  if (st.size < session.offset) {
    const ns = indexFile(file, { full: session.loaded });

    if (ns) {
      applyLiveness(ns);
      schedulePush(ns);
    }

    return;
  }

  if (st.size === session.offset) return;
  let fd;

  try {
    fd = openSync(file, 'r');
  } catch {
    return;
  }

  let text;

  try {
    const buf = Buffer.alloc(st.size - session.offset);

    readSync(fd, buf, 0, buf.length, session.offset);
    // one decoder for the file's whole life (2026-10-03): an append read while a character was half written decoded
    // each half alone — "não" came out "n��o", and stayed so
    text = session.partial + session.dec.write(buf);
  } finally {
    closeSync(fd);
  }

  session.offset = st.size;
  const nl = text.lastIndexOf('\n');

  session.partial = text.slice(nl + 1);
  let changed = false;

  parseLines(
    text.slice(0, nl + 1),
    line => {
      if (fold(session, line)) changed = true;
    },
    file,
  );

  if (settleDrift(session)) changed = true;
  if (changed || session.newEntries.length) schedulePush(session);
}
