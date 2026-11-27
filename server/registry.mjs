// The live-session registry (~/.claude/sessions/<pid>.json): which chats run, where, and what each says it is
// doing.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PROJECTS_DIR, SESSIONS_DIR } from './env.mjs';
import { ownReader } from './lunch.mjs';
import { queueNotify } from './notify.mjs';
import { peerNames, pstr } from './peers.mjs';
import { newSession, waitingOn } from './sessions.mjs';
import { schedulePush } from './sse.mjs';
import {
  carryPriority,
  doneMarks,
  indexing,
  isDone,
  putBackOnBoard,
  removedMarks,
  removing,
  saveState,
  sessions,
} from './state.mjs';
import { linkTermToRegistry, parentPids, untied } from './terminals/spawn.mjs';
import { terms } from './terminals/terms.mjs';
import { indexFile } from './transcript/read.mjs';

export function scanProjects() {
  if (!existsSync(PROJECTS_DIR)) return;

  for (const slug of readdirSync(PROJECTS_DIR)) {
    const dir = join(PROJECTS_DIR, slug);
    let names;

    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }

    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;

      try {
        indexFile(join(dir, name));
      } catch (error) {
        console.error(`[peixairada] ${join(dir, name)} could not be read — ${error?.message || error}`);
      } // one chat, never the boot (2026-10-14)
    }
  }
}

export function pidAlive(pid) {
  if (!pid) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** When each of `pids` started, as Claude Code writes an entry's procStart: `ps -o lstart=` with LC_ALL=C and TZ=UTC
 *  (2026-10-14 — in the server's own locale an en_GB Mac read "Wed 14 Oct" against "Wed Oct 14": Take over answered
 *  409 and Done left the claude running). One ps for all of them; a pid gone is not in the map. */
const PS_ENV = { ...process.env, LC_ALL: 'C', TZ: 'UTC' };

export const squash = text =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

export function procStarts(pids) {
  let out;

  try {
    out = execFileSync('/bin/ps', ['-o', 'pid=', '-o', 'lstart=', '-p', pids.join(',')], {
      encoding: 'utf8',
      env: PS_ENV,
      timeout: 5000,
    });
  } catch (error) {
    out = String(error.stdout || '');
  } // a pid not there is ps's exit 1, the rest still printed

  return new Map(
    out
      .split('\n')
      .map(line => /^\s*(\d+)\s+(\S.*)$/.exec(line))
      .filter(Boolean)
      .map(match => [Number(match[1]), squash(match[2])]),
  );
}

/** Whether a registry entry's process still runs (2026-10-14): its pid answers and, when the entry says when it
 *  started, that pid started then. A claude killed, crashed or gone with a reboot leaves its file, and in time its pid
 *  is another process's: the chat read live — clauding for good, or asking you. A verdict per pid and start, asked of
 *  ps once (`learnStarts`, every new entry of a registry read in one); an entry with no procStart (an older claude, the
 *  fake) is taken at its pid. */
const startsSeen = new Map(); // `${pid}:${procStart}` -> whether that pid is still the process that wrote it
const startKey = entry => `${entry.pid}:${entry.procStart}`;

function learnStarts(ls) {
  const want = ls.filter(entry => entry?.procStart && !startsSeen.has(startKey(entry)) && pidAlive(entry.pid));

  if (!want.length) return;
  const at = procStarts([...new Set(want.map(entry => entry.pid))]);

  for (const entry of want) startsSeen.set(startKey(entry), at.get(Number(entry.pid)) === squash(entry.procStart));
}

function procAlive(entry) {
  if (!entry) return false;

  if (!pidAlive(entry.pid)) {
    startsSeen.delete(startKey(entry));
    return false;
  } // gone: a pid handed on later is asked about anew

  if (!entry.procStart) return true;
  learnStarts([entry]);
  return startsSeen.get(startKey(entry));
}

export function applyLiveness(session) {
  const wasAlive = session.alive;

  session.alive = procAlive(session.live);
  return wasAlive !== session.alive;
}

// /clear is the chat finished (2026-10-10): the same claude goes on under a new id, in a transcript of its own, and the
// chat it left is ticked done as a ✓ would — nothing is ended, the process is the new chat's now. Known by two things,
// which can come in either order: the process (pid and start) turning up under another chat (loadRegistry), and that
// chat's transcript beginning with the command (`clearedAt`, fold) at or after the old chat's last word — so a /resume
// into another chat, even one a /clear once began, and a fork leave the chat they left as it was.
const clearedFrom = new Map(); // a chat a process moved to -> the chat it left, until the move is judged

export function tickCleared(session) {
  const was = sessions.get(clearedFrom.get(session.id));

  if (!was || !session.clearedAt) return; // not moved to, or its transcript not read yet: the other half calls again
  clearedFrom.delete(session.id);
  if (isDone(was) || (was.lastActivity && session.clearedAt < was.lastActivity)) return;
  doneMarks[was.id] = new Date().toISOString();
  console.log(`[peixairada] chat ${was.id}: cleared into ${session.id} — done`);
  saveState();
  schedulePush(was);
}

export function loadRegistry() {
  if (!existsSync(SESSIONS_DIR)) return;
  // which chat each process was on at the last look, to see one move (/clear, /resume)
  const held = new Map();

  for (const session of sessions.values()) {
    if (session.live) {
      for (const entry of [session.live, ...session.rivals]) held.set(`${entry.pid}:${entry.procStart}`, session);
    }
  }

  const found = new Map(); // sessionId -> its registry entries, one per pid
  const regPids = new Set(); // every pid with a file, by its name: one being rewritten still says the process is claude

  for (const name of readdirSync(SESSIONS_DIR)) {
    if (!name.endsWith('.json')) continue; // the registry's own files only: never the `<pid>.<hash>.key` beside each (2026-10-31, see inClaudeDir's section)
    const named = Number(name.slice(0, -5));

    regPids.add(named);
    let reg;

    try {
      reg = JSON.parse(readFileSync(join(SESSIONS_DIR, name), 'utf8'));
    } catch {
      continue;
    }

    // its pid a process's own, and its file's (2026-11-27): a signal may follow it (endClaude), and -1 is every process
    if (!Number.isInteger(reg.pid) || reg.pid <= 1 || (Number.isInteger(named) && reg.pid !== named)) continue;
    if (!reg.sessionId || reg.spare || ownReader(reg)) continue; // a lunch menu's reader (2026-10-18): the board's own claude, no chat; a spare (2026-11-04): the daemon's, waiting to be given one
    if (!found.has(reg.sessionId)) found.set(reg.sessionId, []);

    found.get(reg.sessionId).push({
      pid: reg.pid,
      procStart: reg.procStart,
      name: reg.name,
      entrypoint: reg.entrypoint,
      kind: reg.kind,
      jobId: reg.jobId,
      cwd: reg.cwd,
      startedAt: reg.startedAt,
      version: reg.version,
      status: reg.status,
      statusAt: reg.statusUpdatedAt,
      waitingFor: reg.status === 'waiting' ? reg.waitingFor : undefined,
      agent: typeof reg.agent === 'string' && reg.agent ? reg.agent : undefined,
    }); // what it is doing, since when, and what it waits on (waitingOn)
  }

  const entries = [...found.values()].flat();
  const keys = new Set(entries.map(startKey));

  for (const key of startsSeen.keys()) if (!keys.has(key)) startsSeen.delete(key); // a file gone takes its verdict with it
  learnStarts(entries); // one ps for every entry new to the board

  const ppids = [...terms.values()].some(term => untied(term, regPids))
    ? parentPids(
        [...found.values()]
          .flat()
          .map(entry => entry.pid)
          .filter(pidAlive),
      )
    : null; // a launcher's or a wrapper's claude is below the PTY's pid

  for (const [id, lives] of found) {
    let session = sessions.get(id);

    if (!session) {
      session = newSession(id, null);
      sessions.set(id, session);
    }

    for (const entry of lives) {
      if (pstr(entry.name) && procAlive(entry)) peerNames.set(entry.name, id); // the name another chat's SendMessage reaches it by (2026-10-31)
      linkTermToRegistry(entry.pid, session, ppids, regPids); // a new chat's terminal learns its session id here
      const was = held.get(`${entry.pid}:${entry.procStart}`);

      if (was && was !== session && procAlive(entry)) {
        clearedFrom.set(session.id, was.id);
        tickCleared(session);
        carryPriority(was, session);
      }
    }

    // Several processes can hold one chat: VS Code mounts a chat twice on its own, or reopens one that was
    // taken over here. The chat's process is the drawer's own when there is one, else the newest live one
    // that is neither VS Code's nor in the background (the one you are driving), else the newest that is not VS Code's,
    // else the newest live one, else whatever is left (a dead pid's file lingers until claude's housekeeping). The rest,
    // live only, are its rivals.
    const mine = [...terms.values()]
      .filter(term => term.sessionId === id && !term.shell && term.exited === null)
      .map(term => term.claudePid || term.pid)[0];

    const alive = lives.filter(procAlive).sort((left, right) => (right.startedAt || 0) - (left.startedAt || 0));

    const live =
      alive.find(entry => entry.pid === mine) ||
      alive.find(entry => entry.entrypoint !== 'claude-vscode' && entry.kind !== 'bg') ||
      alive.find(entry => entry.entrypoint !== 'claude-vscode') ||
      alive[0] ||
      lives[0];

    const rivals = alive.filter(entry => entry !== live);

    const changed =
      JSON.stringify(live) !== JSON.stringify(session.live) ||
      JSON.stringify(rivals) !== JSON.stringify(session.rivals);

    const wasWaiting = waitingOn(session);

    session.live = live;
    session.rivals = rivals;
    if (!session.cwd && live.cwd) session.cwd = live.cwd;

    // A chat with no transcript yet still gets a card (2026-09-27), and the card needs a time: the moment the board
    // first saw the id. Not the registry's startedAt — /clear keeps the process, and its start, and gives it a new id;
    // the new chat is *now*. Only at boot, where every id is new to the board, does the process's start stand in. No
    // word yet, not no file: /clear writes its own lines into the new transcript at once — a caveat, the command, its
    // output, none of them a word — and a chat with a file had no start, so its card sank to the bottom of the list
    // (2026-09-28).
    if (!session.startedAt && !session.lastActivity) {
      session.startedAt = new Date(
        indexing && Number(live.startedAt) > 0 ? Number(live.startedAt) : Date.now(),
      ).toISOString();
    }

    if (applyLiveness(session) || changed) schedulePush(session);
    if (waitingOn(session) && !wasWaiting) queueNotify(session, 'needs-input'); // the moment a prompt goes up — the transcript hears of it only with the answer
  }

  for (const session of sessions.values()) {
    if (session.live && !found.has(session.id)) {
      session.live = null;
      session.rivals = [];
      if (applyLiveness(session)) schedulePush(session);
    } else if (session.live && applyLiveness(session)) schedulePush(session);
  }

  // a claude started on a chat deleted from the board (2026-11-04): it is at work again, and shown
  for (const id of Object.keys(removedMarks)) {
    const session = sessions.get(id);

    if (session?.alive && !removing.has(id)) putBackOnBoard(session);
  }
}
