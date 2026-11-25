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
  carryPriority, doneMarks, indexing, isDone, putBackOnBoard, removedMarks, removing, saveState, sessions
} from './state.mjs';
import { linkTermToRegistry, parentPids, untied } from './terminals/spawn.mjs';
import { terms } from './terminals/terms.mjs';
import { indexFile } from './transcript/read.mjs';

export function scanProjects() {
  if (!existsSync(PROJECTS_DIR)) return;
  for (const slug of readdirSync(PROJECTS_DIR)) {
    const dir = join(PROJECTS_DIR, slug);
    let names;
    try { names = readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      try { indexFile(join(dir, name)); } catch (e) { console.error(`[peixairada] ${join(dir, name)} could not be read — ${e?.message || e}`); }   // one chat, never the boot (2026-10-14)
    }
  }
}


export function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** When each of `pids` started, as Claude Code writes an entry's procStart: `ps -o lstart=` with LC_ALL=C and TZ=UTC
 *  (2026-10-14 — in the server's own locale an en_GB Mac read "Wed 14 Oct" against "Wed Oct 14": Take over answered
 *  409 and Done left the claude running). One ps for all of them; a pid gone is not in the map. */
const PS_ENV = { ...process.env, LC_ALL: 'C', TZ: 'UTC' };
export const squash = t => String(t || '').replace(/\s+/g, ' ').trim();
export function procStarts(pids) {
  let out = '';
  try { out = execFileSync('/bin/ps', ['-o', 'pid=', '-o', 'lstart=', '-p', pids.join(',')], { encoding: 'utf8', env: PS_ENV, timeout: 5000 }); } catch (e) { out = String(e.stdout || ''); }   // a pid not there is ps's exit 1, the rest still printed
  return new Map(out.split('\n').map(l => /^\s*(\d+)\s+(\S.*)$/.exec(l)).filter(Boolean).map(m => [Number(m[1]), squash(m[2])]));
}
/** Whether a registry entry's process still runs (2026-10-14): its pid answers and, when the entry says when it
 *  started, that pid started then. A claude killed, crashed or gone with a reboot leaves its file, and in time its pid
 *  is another process's: the chat read live — clauding for good, or asking you. A verdict per pid and start, asked of
 *  ps once (`learnStarts`, every new entry of a registry read in one); an entry with no procStart (an older claude, the
 *  fake) is taken at its pid. */
const startsSeen = new Map();   // `${pid}:${procStart}` -> whether that pid is still the process that wrote it
const startKey = l => `${l.pid}:${l.procStart}`;
function learnStarts(ls) {
  const want = ls.filter(l => l?.procStart && !startsSeen.has(startKey(l)) && pidAlive(l.pid));
  if (!want.length) return;
  const at = procStarts([...new Set(want.map(l => l.pid))]);
  for (const l of want) startsSeen.set(startKey(l), at.get(Number(l.pid)) === squash(l.procStart));
}
function procAlive(l) {
  if (!l) return false;
  if (!pidAlive(l.pid)) { startsSeen.delete(startKey(l)); return false; }   // gone: a pid handed on later is asked about anew
  if (!l.procStart) return true;
  learnStarts([l]);
  return startsSeen.get(startKey(l));
}

export function applyLiveness(s) {
  const wasAlive = s.alive;
  s.alive = procAlive(s.live);
  return wasAlive !== s.alive;
}

// /clear is the chat finished (2026-10-10): the same claude goes on under a new id, in a transcript of its own, and the
// chat it left is ticked done as a ✓ would — nothing is ended, the process is the new chat's now. Known by two things,
// which can come in either order: the process (pid and start) turning up under another chat (loadRegistry), and that
// chat's transcript beginning with the command (`clearedAt`, fold) at or after the old chat's last word — so a /resume
// into another chat, even one a /clear once began, and a fork leave the chat they left as it was.
const clearedFrom = new Map();   // a chat a process moved to -> the chat it left, until the move is judged
export function tickCleared(s) {
  const was = sessions.get(clearedFrom.get(s.id));
  if (!was || !s.clearedAt) return;   // not moved to, or its transcript not read yet: the other half calls again
  clearedFrom.delete(s.id);
  if (isDone(was) || (was.lastActivity && s.clearedAt < was.lastActivity)) return;
  doneMarks[was.id] = new Date().toISOString();
  console.log(`[peixairada] chat ${was.id}: cleared into ${s.id} — done`);
  saveState(); schedulePush(was);
}

export function loadRegistry() {
  if (!existsSync(SESSIONS_DIR)) return;
  // which chat each process was on at the last look, to see one move (/clear, /resume)
  const held = new Map();
  for (const s of sessions.values()) if (s.live) for (const l of [s.live, ...s.rivals]) held.set(`${l.pid}:${l.procStart}`, s);
  const found = new Map();   // sessionId -> its registry entries, one per pid
  const regPids = new Set();   // every pid with a file, by its name: one being rewritten still says the process is claude
  for (const name of readdirSync(SESSIONS_DIR)) {
    if (!name.endsWith('.json')) continue;   // the registry's own files only: never the `<pid>.<hash>.key` beside each (2026-10-31, see inClaudeDir's section)
    regPids.add(Number(name.slice(0, -5)));
    let reg;
    try { reg = JSON.parse(readFileSync(join(SESSIONS_DIR, name), 'utf8')); } catch { continue; }
    if (!reg.sessionId || reg.spare || ownReader(reg)) continue;   // a lunch menu's reader (2026-10-18): the board's own claude, no chat; a spare (2026-11-04): the daemon's, waiting to be given one
    if (!found.has(reg.sessionId)) found.set(reg.sessionId, []);
    found.get(reg.sessionId).push({ pid: reg.pid, procStart: reg.procStart, name: reg.name, entrypoint: reg.entrypoint, kind: reg.kind, jobId: reg.jobId, cwd: reg.cwd, startedAt: reg.startedAt, version: reg.version,
      status: reg.status, statusAt: reg.statusUpdatedAt, waitingFor: reg.status === 'waiting' ? reg.waitingFor : undefined, agent: typeof reg.agent === 'string' && reg.agent ? reg.agent : undefined });   // what it is doing, since when, and what it waits on (waitingOn)
  }
  const entries = [...found.values()].flat(), keys = new Set(entries.map(startKey));
  for (const k of startsSeen.keys()) if (!keys.has(k)) startsSeen.delete(k);   // a file gone takes its verdict with it
  learnStarts(entries);   // one ps for every entry new to the board
  const ppids = [...terms.values()].some(t => untied(t, regPids)) ? parentPids([...found.values()].flat().map(l => l.pid).filter(pidAlive)) : null;   // a launcher's or a wrapper's claude is below the PTY's pid
  for (const [id, lives] of found) {
    let s = sessions.get(id);
    if (!s) { s = newSession(id, null); sessions.set(id, s); }
    for (const l of lives) {
      if (pstr(l.name) && procAlive(l)) peerNames.set(l.name, id);   // the name another chat's SendMessage reaches it by (2026-10-31)
      linkTermToRegistry(l.pid, s, ppids, regPids);   // a new chat's terminal learns its session id here
      const was = held.get(`${l.pid}:${l.procStart}`);
      if (was && was !== s && procAlive(l)) { clearedFrom.set(s.id, was.id); tickCleared(s); carryPriority(was, s); }
    }
    // Several processes can hold one chat: VS Code mounts a chat twice on its own, or reopens one that was
    // taken over here. The chat's process is the drawer's own when there is one, else the newest live one
    // that is neither VS Code's nor in the background (the one you are driving), else the newest that is not VS Code's,
    // else the newest live one, else whatever is left (a dead pid's file lingers until claude's housekeeping). The rest,
    // live only, are its rivals.
    const mine = [...terms.values()].filter(t => t.sessionId === id && !t.shell && t.exited === null).map(t => t.claudePid || t.pid)[0];
    const alive = lives.filter(procAlive).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    const live = alive.find(l => l.pid === mine) || alive.find(l => l.entrypoint !== 'claude-vscode' && l.kind !== 'bg') || alive.find(l => l.entrypoint !== 'claude-vscode') || alive[0] || lives[0];
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
  // a claude started on a chat deleted from the board (2026-11-04): it is at work again, and shown
  for (const id of Object.keys(removedMarks)) { const s = sessions.get(id); if (s?.alive && !removing.has(id)) putBackOnBoard(s); }
}
