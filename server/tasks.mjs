// Work behind a turn: a monitor, or a command left running — started, heard from, ended, swept by lsof.
import { existsSync, realpathSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { findBin } from './bins.mjs';
import { applyLiveness } from './registry.mjs';
import { schedulePush } from './sse.mjs';
import { sessions } from './state.mjs';
import { noteSpan } from './today.mjs';
import { indexFile } from './transcript/read.mjs';
import { resultText, snippet } from './transcript/text.mjs';

// ---- background tasks: a monitor, or a command left running -------------------------------------------------
// Claude Code can leave work running behind the turn: `Monitor` watches something and wakes the chat on each event,
// and a Bash with `run_in_background` runs on and reports when it exits. Both were invisible here — the turn ends,
// the card goes ready — and both are the difference between a chat that is finished and one that is *waiting*
// (2026-09-21). The transcript says all of it: the tool_result of the call
// carries the task's id ("Monitor started (task bs6h9ok2c, expires in 30m…", "Command running in background with
// ID: b3b928ii6"), and every event and the end arrive as `<task-notification>` user lines — synthetic for the
// transcript, read here for their `<task-id>` and the `<status>` that ends one. Nothing is polled: a task that
// outlives the claude that started it (`live.startedAt`) or its own expiry is simply not running any more.
const TASK_ID_RE = [
  [/Monitor started \(task ([a-z0-9]+)/i, 'monitor'],
  [/Command running in background with ID: ([a-z0-9]+)/i, 'bash'],
];

export const TASK_NOTE_RE = /^<task-notification>/;
const MONITOR_MS = Number(process.env.MONITOR_MS || 30 * 60_000); // what a Monitor gives itself when it says nothing else

export const TASK_MAX_MS = Number(process.env.TASK_MAX_MS || 6 * 60 * 60_000); // a background command whose end never reached the transcript and the machine cannot speak for (taskOverdue)

/** The call: remembered by tool_use id until its result comes back with the task id the harness gave it. */
export function noteTaskCall(s, b) {
  s.taskCalls ||= new Map();
  const ms = Number(b.input?.timeout_ms) || (b.name === 'Monitor' ? MONITOR_MS : 0);

  s.taskCalls.set(b.id, {
    kind: b.name === 'Monitor' ? 'monitor' : 'bash',
    what: snippet(b.input?.description || b.input?.command || '', 90),
    ms,
  });

  while (s.taskCalls.size > 40) s.taskCalls.delete(s.taskCalls.keys().next().value);
}

/** Its result: "…(task <id>" / "…ID: <id>" — from here on that id is something running in this chat. A background
 *  command also says where its output goes, and that file is what `sweepTasks` asks about. */
export function startTask(s, res, ts) {
  const hint = s.taskCalls?.get(res.tool_use_id);

  if (!hint) return;
  s.taskCalls.delete(res.tool_use_id);
  const body = resultText(res);

  for (const [re, kind] of TASK_ID_RE) {
    const m = re.exec(body);

    if (!m) continue;
    if (s.tasksGone?.has(m[1])) return; // let go by the poll: a re-read's line is not it running again
    const at = Date.parse(ts) || Date.now();
    const out = /Output is being written to:\s*(\S+?)\.?(?:\s|$)/.exec(body)?.[1] || null;

    (s.tasks ||= new Map()).set(m[1], {
      kind: hint.kind || kind,
      what: hint.what,
      at: ts,
      until: hint.ms ? at + hint.ms : null,
      events: 0,
      out,
    });

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

const realPath = f => {
  try {
    return realpathSync(f);
  } catch {
    return f;
  }
};

function heldFiles(files) {
  return new Promise(resolve => {
    const bin = findBin('lsof', 'a background command is only let go by its notification or its age');

    if (!bin) return resolve(null);

    execFile(bin, ['-w', '-F', 'n', '--', ...files], { timeout: 15_000, maxBuffer: 4e6 }, (err, stdout) => {
      if (err && err.code !== 1) {
        // 1 is lsof's "some file is held by nobody"; anything else is our problem
        // A run killed by the timeout is not an answer, it just looks like "still running": say so, or the chips sit
        // on the cards with nothing in the log to explain it.
        console.log(
          `[peixairada] lsof did not answer${err.killed || err.signal ? ' in time' : ` (${String(err.message).split('\n')[0]})`} — leaving every background command running`,
        );

        return resolve(null);
      }

      resolve(
        new Set(
          String(stdout)
            .split('\n')
            .filter(l => l[0] === 'n')
            .map(l => realPath(l.slice(1))),
        ),
      );
    });
  });
}

/** The poll's half of the pruning, for every chat at once: the commands whose output file nobody holds are let go.
 *  One lsof at a time — it can outlast the poll — and a command asked about less often the longer it has run, up to
 *  once a minute (2026-10-03: a dev server left running cost an lsof every ten seconds, 0.4 s of CPU each, for hours). */
let sweeping = false;

export async function sweepTasks() {
  if (sweeping) return;

  const due = [];
  const now = Date.now();

  for (const s of sessions.values()) {
    if (!s.alive || !s.tasks?.size) continue;

    for (const [id, t] of s.tasks) {
      const age = now - (Date.parse(t.at) || 0);

      if (!t.out || age < TASK_GRACE_MS || now - (t.askedAt || 0) < Math.min(60_000, age / 10)) continue;
      t.askedAt = now;
      if (existsSync(t.out)) due.push({ s, id, t }); // not written yet, or cleaned up: no verdict
    }
  }

  if (!due.length) return;
  sweeping = true;
  let held;

  try {
    held = await heldFiles([...new Set(due.map(d => d.t.out))]);
  } finally {
    sweeping = false;
  }

  if (!held) {
    for (const d of due) d.t.askedAt = 0;
    return;
  } // no answer is no look: pruneTasks goes by whether one was had

  for (const { s: was, id, t } of due) {
    // the chat as it is now, by its id (2026-10-14): a re-read while lsof ran replaced the object, and the old one's push
    // was a stale summary
    const s = sessions.get(was.id);
    const cur = s?.tasks?.get(id);

    if (!cur) continue;
    const shown = !taskOverdue(cur);

    if (held.has(realPath(t.out))) {
      cur.heldAt = Date.now();
      if (!shown) schedulePush(s);
      continue;
    }

    letTaskGo(s, id);

    if (shown) {
      console.log(`[peixairada] task ${id} (${t.what}) is no longer running`);
      schedulePush(s);
    } // a chat read whole asks about every command it ever ran: those never shown go in silence
  }
}

/** A `<task-notification>`: an event while it runs, and with a `<status>` (completed, failed, stopped) its end. */
export function noteTaskEvent(s, text, ts) {
  const id = /<task-id>([^<]+)<\/task-id>/.exec(text)?.[1];
  const t = id && s.tasks?.get(id);

  if (!t) return false;

  if (/<status>/.test(text)) {
    noteSpan(s, 'm', t.at, ts);
    s.tasks.delete(id);
    return true;
  }

  t.events++;
  t.lastEventAt = ts;

  t.last = snippet(
    /<event>([\s\S]*?)<\/event>/.exec(text)?.[1] || /<summary>([\s\S]*?)<\/summary>/.exec(text)?.[1] || '',
    100,
  ); // what it said last — the overview's tile

  return true;
}

/** A task from before this claude started (it died with the last one), or past its own expiry: nothing to ask. */
const taskDead = (s, t, now) =>
  (Date.parse(t.at) || 0) < (Number(s.live?.startedAt) || 0) || (t.until && now > t.until);

/** Past TASK_MAX_MS, counted from lsof's last "still held" (2026-11-04): the cap is for a command the machine cannot
 *  speak for — no output file, or none left — never for one it says runs. A watch loop ten hours in fell off the
 *  Watching lane at six. */
const taskOverdue = (t, now = Date.now()) => now - Math.max(Date.parse(t.at) || 0, t.heldAt || 0) > TASK_MAX_MS;
const taskExpired = (s, t, now = Date.now()) => taskDead(s, t, now) || taskOverdue(t, now);

/** What is still running, for the summary — nothing on a chat whose claude is gone. Reads only: the pruning is
 *  pruneTasks, on the poll (2026-09-27; the summary used to delete on the way, twelve times a minute from the app's
 *  watchdog alone). */
export function runningTasks(s) {
  if (!s.alive || !s.tasks?.size) return [];

  const now = Date.now();
  const out = [];

  for (const [id, t] of s.tasks) {
    if (!taskExpired(s, t, now)) {
      out.push({
        id,
        kind: t.kind,
        what: t.what,
        at: t.at,
        until: t.until ? new Date(t.until).toISOString() : null,
        events: t.events,
        lastEventAt: t.lastEventAt || null,
        last: t.last || null,
      });
    }
  }

  return out;
}

/** The pruning: a dead claude takes its tasks with it, an expired one goes — one overdue only once lsof has had its look,
 *  which a line read anew (the boot, a chat read whole) has not: till then it is kept, and not shown (runningTasks). True
 *  when any went. */
export function pruneTasks(s) {
  if (!s.tasks?.size) return false;

  const n = s.tasks.size;
  const now = Date.now();

  for (const [id, t] of s.tasks) {
    if (!s.alive || taskDead(s, t, now) || (taskOverdue(t, now) && (!t.out || t.askedAt))) letTaskGo(s, id);
  }

  return s.tasks.size !== n;
}

/** The registry says `shell` — idle with a background Bash running, the CLI's own word (a `local_bash` task not ended,
 *  read off 2.1.318) — and the tail names none: it started further back, and one compaction writes a few hundred KB
 *  (2026-11-04). The chat is read whole, as opening it does: one a poll, once (`loaded`). */
export function findTasks() {
  for (const s of sessions.values()) {
    if (!s.alive || !s.file || s.loaded || s.live?.status !== 'shell' || runningTasks(s).length) continue;
    indexFile(s.file, { full: true });
    applyLiveness(sessions.get(s.id));
    return;
  }
}

/** A task the poll let go stays gone (2026-10-14): its end never reached the transcript, and a whole re-read — opening a
 *  long chat — started it again from its first line, a chip until lsof was asked again, or, its output file cleaned up
 *  meanwhile, until TASK_MAX_MS. The ids go over a re-read with the chat (indexFile). */
function letTaskGo(s, id) {
  s.tasks?.delete(id);
  const g = (s.tasksGone ||= new Set());

  g.add(id);
  if (g.size > 200) g.delete(g.values().next().value);
}
