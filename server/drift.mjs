// The branch moved under a chat (2026-10-13): from its lines and from the checkout's HEAD on disk, judged after a
// slack.
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { agentsDir } from './agents/subagents.mjs';
import { findBin } from './bins.mjs';
import { queueNotify } from './notify.mjs';
import { statusOf } from './sessions.mjs';
import { schedulePush } from './sse.mjs';
import { driftAcks, indexing, saveState, sessions } from './state.mjs';
import { cut } from './transcript/text.mjs';

// ---- the branch moved under a chat (2026-10-13) -----------------------------------------------------------------------
// Claude Code writes the checkout's branch on every line (`gitBranch`, `HEAD` while detached). In the 422 newest
// transcripts it changed mid-chat 334 times with the folder unchanged, and 61 of those followed no git command of the
// chat's own within the hour: another chat, or you, moved the branch under it — and Claude went on editing whatever was
// checked out. Two signals say so. The transcript: a change between lines that the chat's own git does not explain
// (`noteBranch` → `s.drift`). The disk, for a chat writing nothing: its checkout's HEAD file read on the registry poll
// (`sweepHeads` → `s.headNow`, `s.diskDrift`). A move through `HEAD` and back (a rebase) is none; a word of yours clears
// it, as does the chat moving back or on by its own hand; a click on the header's chip says you know (`driftAcks`).
// Shown only while the chat's claude runs: an ended chat's next word is yours, which clears it anyway.
// The commands that can change which branch is checked out — checkout, switch, rebase, worktree, gh pr checkout, a branch
// renamed, a bisect, `git stash branch` —, the subcommand whole and right after git and its own options: a commit
// message that says "switch" is no move, nor is `merge-base`. Not stash, reset, pull or merge (2026-10-13): they never
// change the branch, and within the hour of one an outside move went unsaid — `merge` matched merge-base and merge-tree.
// Each option one way only (2026-10-14): `--?[\w-]+` read `--a` as `-`+`-a` or `--`+`a`, and a command of thirty options
// held the server's thread for seconds on every fold — no dash after the dashes, no quote or dash opening -C's bare value.
const GIT_MOVE_RE =
  /\bgit(?:\s+-[Cc]\s+(?:"[^"]*"|'[^']*'|(?!["'-])\S+)|\s+--?(?!-)[\w-]+(?:=\S+)?)*\s+(?:checkout|switch|rebase|worktree|bisect|branch\s+(?:-[mM]|--move)|stash\s+branch)(?![\w-])|\bgh\s+pr\s+checkout(?![\w-])/;
const DRIFT_WINDOW_MS = 60 * 60_000;
// The chat's own move can come after the line that first shows its branch (2026-10-13): Claude Code writes a message's
// lines once the call in it has run, so its thinking or text line carries the branch a `git switch -c` on a later line
// of the same message made — in 71 of the 1500 newest transcripts, 63 of them in that message, 40 within 2 s of it and
// the rest up to 16 s, by the lines' own times. So a command of the same message that names the branch counts whatever
// its time, any other one up to MOVE_SLACK_MS after; and a move is judged MOVE_SLACK_MS after it is seen, a HEAD file
// seen moved on a second look as long after the first — before anything is shown or alerted (settleDrift, noteHead).
const MOVE_SLACK_MS = 2000;
const BRANCHES_MAX = 6,
  GIT_CMDS_MAX = 40,
  AGENT_GIT_BYTES = 4 << 20;
export const driftKey = d => `${d.from}→${d.to}`;
/** A Bash command of the chat's — its own, a sub-agent's, a `!` one of yours — that can move the branch. */
export function noteGitCmd(cmds, cmd, ts, msg = null) {
  // msg: the assistant message it was called in
  if (!cmd || !GIT_MOVE_RE.test(cmd)) return;
  cmds.push({ at: Date.parse(ts) || 0, cmd: cut(String(cmd), 400), msg });
  if (cmds.length > GIT_CMDS_MAX) cmds.shift();
}
export const bashCmds = line =>
  (Array.isArray(line.message?.content) ? line.message.content : [])
    .filter(b => b?.type === 'tool_use' && b.name === 'Bash')
    .map(b => b.input?.command);
const namesBranch = (cmd, b) =>
  new RegExp(`(?:^|[\\s'"/:=])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s'";&|)])`).test(cmd);
/** Whether the chat's own git explains a move to `to` seen at `at` on a line of message `msg`: any of those commands in
 *  the hour before (the study's rule), or one since the chat was on the branch it left (`since`) that names the new one,
 *  or one later in that same message that names it. Claude Code's gitBranch lags its own checkout — of 185 checkouts
 *  that moved it, the result's line still carried the old branch in 166, and the new one came lines, minutes and once
 *  hours later — so the line before the change says nothing. */
const ownMove = (cmds, at, to, since, msg = null) =>
  (cmds || []).some(
    c =>
      (c.at <= at + MOVE_SLACK_MS &&
        (c.at >= at - DRIFT_WINDOW_MS || (c.at >= since - MOVE_SLACK_MS && namesBranch(c.cmd, to)))) ||
      (msg && c.msg === msg && namesBranch(c.cmd, to)),
  );
/** The same asked of the chat's sub-agents' transcripts — read only when a move is not otherwise explained. */
function agentsMoved(s, at, to, since) {
  const dir = agentsDir(s);
  let names = [];
  if (dir)
    try {
      names = readdirSync(dir);
    } catch {}
  const from = Math.min(at - DRIFT_WINDOW_MS, Math.max(since, at - 24 * 3600_000)),
    cmds = [];
  for (const n of names) {
    if (!n.endsWith('.jsonl')) continue;
    const f = join(dir, n);
    let st;
    try {
      st = statSync(f);
    } catch {
      continue;
    }
    if (st.mtimeMs < from - 2000 || !st.size) continue; // done before the window: nothing of it is in it
    const len = Math.min(st.size, AGENT_GIT_BYTES),
      buf = Buffer.alloc(len);
    try {
      const fd = openSync(f, 'r');
      try {
        readSync(fd, buf, 0, len, st.size - len);
      } finally {
        closeSync(fd);
      }
    } catch {
      continue;
    }
    for (const raw of buf.toString('utf8').split('\n')) {
      if (!raw.includes('"Bash"')) continue;
      let l;
      try {
        l = JSON.parse(raw);
      } catch {
        continue;
      }
      if (l.type === 'assistant') for (const c of bashCmds(l)) noteGitCmd(cmds, c, l.timestamp, l.message?.id);
    }
  }
  return ownMove(cmds, at, to, since);
}
/** Whether two folders are one checkout (2026-10-14): Claude's `cd src` is no other branch. Each folder's work tree is
 *  looked up a minute at most (`topSeen`) — every line asks; a folder in none is only itself. */
const topSeen = new Map(); // folder -> { top, at }
function treeTop(cwd) {
  const hit = topSeen.get(cwd),
    now = Date.now();
  if (hit && now - hit.at < 60_000) return hit.top;
  const top = gitTopOf(cwd);
  topSeen.set(cwd, { top, at: now });
  return top;
}
const sameTree = (a, b) => a === b || (!!a && !!b && (treeTop(a) || a) === (treeTop(b) || b));
/** A line's branch. `s.branchBase` is the branch the chat is on as its lines tell it — `{name, cwd, from, at}`, the
 *  first and last line of the run —, `s.branches` the last few it was on. A change in the same checkout that the chat's
 *  own git does not explain so far is a drift held for judgement (`s.driftDue`), from the branch the chat was on before
 *  anything moved under it; back there is none. The lines still to come and its sub-agents may explain it (settleDrift);
 *  until then the drift shown is the one before (`shown`). */
export function noteBranch(s, line, ts) {
  const b = line.gitBranch,
    cwd = line.cwd || s.cwd,
    at = Date.parse(ts) || 0,
    msg = (line.type === 'assistant' && line.message?.id) || null;
  if (!s.reading) s.linesIn++;
  if (!b) return;
  if (s.branches.at(-1)?.name !== b) {
    s.branches.push({ name: b, at: ts });
    if (s.branches.length > BRANCHES_MAX) s.branches.shift();
  }
  if (b === 'HEAD') return; // detached, mostly mid-rebase: where it lands is what counts
  const base = s.branchBase;
  if (!base || !sameTree(base.cwd, cwd)) {
    s.branchBase = { name: b, cwd, from: at, at };
    s.drift = null;
    return;
  } // the first line, or another checkout
  if (base.name === b) {
    base.at = at;
    return;
  }
  const ok = s.headOk === b;
  s.headOk = null;
  s.branchBase = { name: b, cwd, from: at, at };
  if (ok || s.drift?.from === b || ownMove(s.gitCmds, at, b, base.from, msg)) {
    s.drift = null;
    s.driftDue = null;
    return;
  }
  const shown = shownDrift(s);
  s.drift = { from: s.drift?.from || base.name, to: b, at: ts, since: base.from, msg };
  s.driftDue = {
    at,
    to: b,
    working: statusOf(s) === 'working',
    shown,
    base,
    until: s.reading ? 0 : Date.now() + MOVE_SLACK_MS,
  }; // a whole read has the lines after it in hand
}
/** The transcript's drift as shown: one held for judgement shows the one before it. */
const shownDrift = s => (s.driftDue ? s.driftDue.shown : s.drift);
/** A word of yours: whatever moved before it, you have had your say — the drift goes, and the branch the folder was on
 *  as you spoke is taken as the chat's (`headOk`), for the lines that are still to catch up with it. */
export function branchHeard(s) {
  s.drift = null;
  s.driftDue = null;
  s.diskDrift = null;
  s.diskSeen = null;
  if (!s.reading) s.headOk = s.headNow && s.headNow !== 'HEAD' && s.headNow !== s.branchBase?.name ? s.headNow : null; // a re-read's prompts are old: the head now is not what they saw
  s.pendingNotify?.delete('drift');
}
/** The drift as it stands: the disk's (newer) or the transcript's, while the claude runs, unless the folder is back on
 *  the chat's branch. `driftOf` leaves out one you said you know. */
export function rawDrift(s) {
  const d = s.alive ? s.diskDrift || shownDrift(s) : null;
  return d && !(s.headNow && s.headNow === d.from) ? d : null;
}
export const driftOf = s => {
  const d = rawDrift(s);
  return d && driftAcks[s.id] !== driftKey(d) ? d : null;
};
/** After a batch of lines (indexFile, tailFile), and on its own timer: a drift held is judged once MOVE_SLACK_MS has
 *  passed since it was seen — the chat's own command on a line written after it, or a sub-agent's, explains it —, and
 *  only then shown and alerted: the alert's debounce starts after the judgement, so nothing is said and taken back. A
 *  drift shown goes too when a command within its slack turns up late. True when what is shown may have changed. */
export function settleDrift(s, now = Date.now()) {
  const due = s.driftDue;
  if (due?.until > now) {
    clearTimeout(s.driftTimer);
    s.driftTimer = setTimeout(
      () => {
        s.driftTimer = null;
        if (sessions.get(s.id) === s) {
          settleDrift(s);
          schedulePush(s);
        }
      },
      due.until - now + 20,
    );
    s.driftTimer.unref?.();
    return false;
  }
  s.driftDue = null;
  const d = s.drift,
    at = d && Date.parse(d.at);
  const gone = !!(d && (ownMove(s.gitCmds, at, d.to, d.since, d.msg) || (due && agentsMoved(s, at, d.to, d.since))));
  if (gone) s.drift = null;
  driftNews(s, !!due?.working && !gone);
  return gone || !!due;
}
/** An acknowledgement lasts until the move it was for is gone — not while a move seen on disk awaits its judgement, which
 *  shows none meanwhile (2026-10-14: a line in that while dropped it); an alert goes out once per move, and only for a
 *  chat at work — Claude editing the wrong branch is the case that matters. */
function driftNews(s, working) {
  const raw = rawDrift(s),
    k = raw && driftKey(raw),
    judging = !!s.diskSeen && s.diskSeen.drift === undefined;
  if (!indexing && !judging && driftAcks[s.id] && driftAcks[s.id] !== k) {
    delete driftAcks[s.id];
    saveState();
  }
  const d = driftOf(s),
    said = d ? driftKey(d) : null;
  if (said === (s.driftSaid ?? null)) return;
  s.driftSaid = said;
  if (said && working) queueNotify(s, 'drift');
}
/** The work tree a folder is in: the nearest folder at or above it with a `.git` — a directory, or a worktree's file.
 *  Not checkoutOf, which climbs from a worktree to its repo; a worktree has a HEAD of its own. */
export function gitTopOf(cwd) {
  if (!cwd?.startsWith('/')) return null;
  for (let d = cwd; d && d !== '/' && d !== homedir(); d = dirname(d)) if (existsSync(join(d, '.git'))) return d;
  return null;
}
/** The branch checked out there, as Claude Code writes it: the name, `HEAD` when detached, null for no checkout. A
 *  read of the HEAD file, no git spawned but for a reftable one; a worktree's `.git` names its own git dir, as ghRepoOf
 *  reads it. */
export function headAt(top) {
  if (!top) return null;
  try {
    let git = join(top, '.git');
    if (!statSync(git).isDirectory()) git = resolve(top, /^gitdir:\s*(.+)$/m.exec(readFileSync(git, 'utf8'))[1].trim());
    const h = readFileSync(join(git, 'HEAD'), 'utf8').trim(),
      m = /^ref:\s*refs\/heads\/(.+)$/.exec(h);
    if (m?.[1] === '.invalid') return reftableHead(top, git); // no branch is named so
    return m ? m[1] : /^[0-9a-f]{40,64}$/.test(h) ? 'HEAD' : null;
  } catch {
    return null;
  }
}
/** A reftable repository's (git 2.45's, git 3's default) HEAD file is a stub on `.invalid`, every chat in one a drift
 *  to it (2026-10-14): its HEAD is in the tables, so git says it — asked again only when their list has changed. */
const reftableHeads = new Map(); // git dir -> { stamp: its reftable/tables.list, head }
function reftableHead(top, git) {
  const stamp = readFileSync(join(git, 'reftable', 'tables.list'), 'utf8'),
    hit = reftableHeads.get(git);
  if (hit?.stamp === stamp) return hit.head;
  const bin = findBin('git', "a reftable checkout's branch goes unread");
  if (!bin) return null;
  let head = null;
  try {
    head =
      execFileSync(bin, ['-C', top, 'symbolic-ref', '-q', '--short', 'HEAD'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || null;
  } catch (e) {
    if (e.status === 1) head = 'HEAD';
  } // 1: no symbolic ref — detached
  if (head) reftableHeads.set(git, { stamp, head });
  return head;
}
export const headOf = cwd => headAt(gitTopOf(cwd));
/** The disk's half: the folder's head against the branch the chat's lines last said. A move is judged on a look
 *  MOVE_SLACK_MS after the first (the chat's own switch is in its transcript only once the message that made it is
 *  written), and once per pair — the chat's own stays its own however long its lines take to catch up. True when the
 *  summary's part changed.
 *  A chat at work writes the message that moved it only once its call has run — `git switch -c x && npm ci` a minute
 *  on (2026-10-14) —, so a move its own git does not explain yet waits for a line of the chat's come in after it was
 *  seen, or DISK_HOLD_MS; and a move judged is its own after all when such a line names it late. `boot`: the restart's
 *  look, judged at once — a move from before it was judged then. */
const DISK_HOLD_MS = 5 * 60_000;
export function noteHead(s, head, now = Date.now(), boot = false) {
  const before = JSON.stringify([s.headNow, s.diskDrift]),
    base = s.driftDue?.base || s.branchBase; // a move held is not the chat's branch yet
  s.headNow = head;
  let d = null;
  if (head && head !== 'HEAD' && base && head !== base.name && head !== s.headOk && head !== s.drift?.from) {
    const key = `${base.name}→${head}`;
    if (s.diskSeen?.key !== key) s.diskSeen = { key, at: now, lines: s.linesIn, drift: undefined }; // seen: judged on a later look
    const seen = s.diskSeen;
    if (seen.drift === undefined && (boot || now - seen.at >= MOVE_SLACK_MS)) {
      if (ownMove(s.gitCmds, now, head, base.from)) seen.drift = null;
      else if (boot || statusOf(s) !== 'working' || s.linesIn > seen.lines || now - seen.at >= DISK_HOLD_MS)
        seen.drift = agentsMoved(s, now, head, base.from)
          ? null
          : { from: s.drift?.from || base.name, to: head, at: new Date(now).toISOString() };
    } else if (seen.drift && ownMove(s.gitCmds, Date.parse(seen.drift.at), head, base.from)) seen.drift = null;
    d = seen.drift || null;
  } else s.diskSeen = null;
  s.diskDrift = d;
  return JSON.stringify([s.headNow, s.diskDrift]) !== before;
}
/** On the registry poll: every live chat's checkout's HEAD, each read once, and who else runs in it — the chip's
 *  tooltip names them. `boot`: the restart's, judged at once and in silence (2026-10-14) — a move said before it is not
 *  said again on the next look. */
export function sweepHeads(now = Date.now(), boot = false) {
  const tops = new Map(),
    heads = new Map(),
    live = [];
  for (const s of sessions.values()) {
    if (!s.alive) {
      if (s.headNow || s.diskDrift) {
        s.headNow = null;
        s.diskDrift = null;
        s.diskSeen = null;
        schedulePush(s);
      }
      continue;
    }
    const cwd = s.branchBase?.cwd || s.cwd || s.live?.cwd;
    if (!cwd) continue;
    if (!tops.has(cwd)) tops.set(cwd, gitTopOf(cwd));
    const top = tops.get(cwd);
    if (!top) continue;
    if (!heads.has(top)) heads.set(top, headAt(top));
    live.push([s, top]);
  }
  for (const [s, top] of live) {
    const peers = live.filter(([o, t]) => t === top && o !== s).map(([o]) => o.id),
      was = driftOf(s);
    const moved = noteHead(s, heads.get(top), now, boot),
      peersMoved = JSON.stringify(peers) !== JSON.stringify(s.peers || []);
    s.peers = peers;
    if (moved || (peersMoved && driftOf(s)) || was !== driftOf(s)) schedulePush(s);
    driftNews(s, statusOf(s) === 'working');
  }
}
