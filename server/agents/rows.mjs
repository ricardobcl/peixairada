// A chat's agents, a row each (2026-11-02): what each was asked, what it does, how it ended — and its
// transcript, read when asked.
import { closeSync, fstatSync, openSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { agentsDir, agentsSoon } from './subagents.mjs';
import { jsonOnce, jsonSeen, mateLast, mateType, rosterOf, SEEN_MAX } from './team.mjs';
import { queueNotify } from '../notify.mjs';
import { pstr } from '../peers.mjs';
import { TASK_MAX_MS, TASK_NOTE_RE } from '../tasks.mjs';
import { agentColor } from '../terminals/chat-agents.mjs';
import { readLines } from '../transcript/read.mjs';
import {
  cleanPrompt,
  snippet,
  summarizeToolInput,
  SYNTHETIC_RE,
  textOf,
  toolResultSnippet,
} from '../transcript/text.mjs';

// ---- its agents: a row each (2026-11-02, round XX) ------------------------------------------------------------------
// What a card says of a chat's sub-agents, teammates among them: what each was asked, what it does now, how it ended. Read
// from what Claude Code writes beside the chat: the .meta.json (`description`, `name`, `agentType`, `toolUseId`, `finished`,
// `stoppedByUser`, `worktreeBranch`, `worktreePath`, `model`), the transcript's last lines (mateLast) and first (agentBorn),
// and, for how one ended, the `<task-notification>` it sends the chat (noteAgentNotices): its `status`, and in its summary
// the reason a `failed` one gives, or that it `is waiting on its own background work`. One delivered mid-turn never becomes a
// line (as a task's, sweepTasks), so `finished` in the meta is what ends it then, and a row says done.
// Only the last round shows: the agents out at one time, a new round being one that starts after all before it ended. A failure
// from a round before stays with it (`old`), for the page to keep until the chat is opened (seenAt). Words hold AGENT_WORDS_MS:
// a tool call every 6.6 s here (the median over 247 agents) would flicker, and a new one must not push for each step.
const typeOf = (s, type) => ({ type, color: agentColor(s.live?.cwd || s.cwd, type) });

const AGENT_WORDS_MS = Number(process.env.AGENT_WORDS_MS ?? 15_000);
const AGENT_FILES = 40;

/** The agent a tool's result names (2026-11-02): an Agent call's, a forked Skill's. How the transcript gets back to it, whatever became of its row. */
export const agentNamed = t =>
  typeof t?.agentId === 'string' && /^[\w-]+$/.test(t.agentId)
    ? { agent: { id: t.agentId, name: pstr(t.name) || pstr(t.commandName), asked: pstr(t.description) } }
    : null;

const agentMetaOf = m =>
  !m || typeof m !== 'object'
    ? {}
    : {
        name: pstr(m.name),
        asked: pstr(m.description),
        kind: pstr(m.agentType),
        spawned: pstr(m.spawnedAgentType) || pstr(m.customAgentType),
        mate: m.taskKind === 'in_process_teammate' || !!pstr(m.teamName),
        model: pstr(m.model),
        branch: pstr(m.worktreeBranch),
        tree: pstr(m.worktreePath),
        tool: pstr(m.toolUseId),
        finished: m.finished === true,
        stopped: m.stoppedByUser === true,
      };

const metaFile = (dir, n) => join(dir, `${n.slice(0, -'.jsonl'.length)}.meta.json`);

/** Its meta says it finished, and nothing was written since: an agent ended by an API error writes no end of its own, and
 *  counted as at work for AGENT_STALE_MS. A resumed one writes on, and is at work again. */
export function agentFinished(dir, n) {
  const mf = metaFile(dir, n);

  if (!jsonOnce(mf, agentMetaOf)?.finished) return false;

  try {
    return jsonSeen.get(mf).mtimeMs >= statSync(join(dir, n)).mtimeMs - 1500;
  } catch {
    return false;
  }
}

const TM_BODY = /<teammate-message\b[^>]*>\s*([\s\S]*?)\s*<\/teammate-message>/;

const agentPrompt = text => {
  const t = cleanPrompt(String(text || ''));

  return TM_BODY.exec(t)?.[1] ?? t;
};

const bornSeen = new Map(); // an agent's transcript → { at, prompt }: its first line, read once

/** When it began and what it was asked: its first line's. Past the first 64 KB, its file's birth. */
function agentBorn(file, st) {
  const hit = bornSeen.get(file);

  if (hit) {
    bornSeen.delete(file);
    bornSeen.set(file, hit);
    return hit;
  }

  let at = null;
  let prompt = null;

  try {
    const fd = openSync(file, 'r');
    const buf = Buffer.alloc(Math.min(st.size, 65536));

    try {
      readSync(fd, buf, 0, buf.length, 0);
    } finally {
      closeSync(fd);
    }

    const l = JSON.parse(buf.toString('utf8').split('\n')[0]);

    at = pstr(l.timestamp);
    prompt = agentPrompt(textOf(l.message?.content));
  } catch {}

  const v = { at: at || new Date(st.birthtimeMs || st.mtimeMs).toISOString(), prompt };

  if (bornSeen.size >= SEEN_MAX) bornSeen.delete(bornSeen.keys().next().value);
  bornSeen.set(file, v);
  return v;
}

/** How an agent's notices in the chat's own transcript say it ended, by the call that started it. A notice comes each time it
 *  stops with nothing of its own running, so the last one speaks. */
const AGENT_NOTE = /<summary>Agent "([^"]*)"\s*([\s\S]*?)<\/summary>/;

export function noteAgentNotices(s, text, ts) {
  let any = false;

  for (const [, b] of text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
    const tool = /<tool-use-id>([^<]+)</.exec(b)?.[1];
    const sum = AGENT_NOTE.exec(b);

    if (!tool || !sum) continue;

    const status = /<status>([^<]+)</.exec(b)?.[1] || null;
    const said = sum[2].trim();
    const why = status === 'failed' ? snippet(said.replace(/^failed:\s*/i, ''), 120) : null;

    const was = s.agentEnds?.get(tool);

    (s.agentEnds ||= new Map()).set(tool, { status, waiting: /waiting on its own/i.test(said), why, ts });

    if (status === 'failed' && was?.status !== 'failed') {
      s.agentFail = { what: sum[1], why };
      queueNotify(s, 'agent-failed');
    } // the one word of an agent's that is news: one done is not, the chat's reply is

    any = true;
  }

  if (any) agentsSoon(s);
  return any;
}

/** The chat's rows as they stand; true when they changed. */
export function noteAgents(s, dir, work, since, now) {
  const files = [];
  const before = [];

  for (const [n, on] of work) {
    let st;

    try {
      st = statSync(join(dir, n));
    } catch {
      continue;
    }

    if (st.size) (st.mtimeMs >= since ? files : before).push({ n, on, st });
  }

  files.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  before.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);

  const had = new Map((s.agentRows || []).map(r => [r.id, r]));
  const said = (s.agentSaid ||= new Map());
  const names = new Set();
  const rows = [];

  const row = ({ n, on, st }, names, past) => {
    const m = jsonOnce(metaFile(dir, n), agentMetaOf) || {};
    const file = join(dir, n);
    const id = n.slice(0, -'.jsonl'.length).replace(/^agent-/, '');

    if (m.mate && m.name) {
      if (names.has(m.name)) return null;
      names.add(m.name);
    } // one name twice: the newest

    const end = m.tool ? s.agentEnds?.get(m.tool) : null;
    const born = agentBorn(file, st);

    const state = on
      ? 'run'
      : end?.status === 'failed'
        ? 'fail'
        : m.stopped || end?.status === 'stopped' || end?.status === 'killed'
          ? 'stop'
          : !past && end?.waiting && now - st.mtimeMs < TASK_MAX_MS
            ? 'wait'
            : 'done'; // one from a claude before this one waits on nothing

    let last = mateLast(file, st);
    const was = past ? null : had.get(id);

    if (state === 'run' && was?.st === 'run' && was.last && now - (said.get(id) || 0) < AGENT_WORDS_MS) {
      last = was.last;
    } // it holds its words
    else if (JSON.stringify(last) !== JSON.stringify(was?.last ?? null)) said.set(id, now);
    return {
      id,
      name: m.name,
      asked: m.asked || snippet(born.prompt, 80) || null,
      kind: m.kind && m.kind !== 'general-purpose' ? m.kind : null,
      mate: !!m.mate,
      st: state,
      last,
      // its type as Claude Code named it — a teammate's, the category it was spawned as (mateType, 2026-11-18, v6) — and the
      // colour that type's definition gives (Space's pods): none for a built-in
      ...typeOf(s, m.mate ? mateType(s, m.name, m.spawned, m.kind) : m.spawned || m.kind || null),
      // when it ended: not its last line alone — an API error writes none, and you may have opened the chat since that line (the page keeps a failure until then)
      at: born.at,
      end:
        state === 'run' || state === 'wait'
          ? null
          : new Date(
              Math.max(
                st.mtimeMs,
                Date.parse(end?.ts) || 0,
                m.finished ? jsonSeen.get(metaFile(dir, n))?.mtimeMs || 0 : 0,
              ),
            ).toISOString(),
      lastAt: new Date(st.mtimeMs).toISOString(),
      why: state === 'fail' ? end?.why || null : null,
      branch: m.branch,
      tree: m.tree,
      tool: m.tool,
      ...(past ? { past: true } : {}),
    };
  };

  for (const f of files.slice(0, AGENT_FILES)) {
    const r = row(f, names, false);

    if (r) rows.push(r);
  }

  // the agents of the claudes before this one (2026-11-24): a resume is a new claude, and its rows start over, but Space's pods
  // are every agent the chat has run — ended, a step back; the newest, up to AGENT_FILES in all
  const pastNames = new Set();
  const past = [];

  for (const f of before.slice(0, Math.max(0, AGENT_FILES - rows.length))) {
    const r = row(f, pastNames, true);

    if (r) past.push(r);
  }

  past.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  let cut = 0;
  let far = -Infinity; // the last round: where one starts after every one before it had ended

  rows.forEach((r, i) => {
    const from = Date.parse(r.at);

    if (i && from > far) cut = i;
    far = Math.max(far, r.end ? Date.parse(r.lastAt) : Infinity);
  });

  const kept = [
    ...rows
      .slice(0, cut)
      .filter(r => r.st === 'fail')
      .slice(-3)
      .map(r => ({ ...r, old: true })),
    ...rows.slice(cut),
  ];

  const joined = [];

  for (const m of rosterOf(s)) {
    if (!names.has(m.name)) {
      joined.push({
        id: `mate-${m.name}`,
        name: m.name,
        asked: null,
        kind: null,
        mate: true,
        ...typeOf(s, mateType(s, m.name, null, m.kind)),
        st: 'joined',
        last: null,
        at: null,
        end: null,
        lastAt: null,
        why: null,
        branch: null,
        tree: null,
        tool: null,
      });
    }
  } // named, no file of its own yet

  kept.push(...joined);
  // every agent its claude has run, rounds before the last too (2026-11-18, v9): Space's pods, which gather them by type
  // round the chat; only when there were rounds before, else the same as the rows
  const all = cut || past.length ? [...past, ...rows, ...joined] : null;

  // what changed: `lastAt` only by the minute, or every line of every agent would push the card
  const sig = JSON.stringify([
    kept.map(({ lastAt, ...r }) => [r, Math.floor(Date.parse(lastAt) / 60_000)]),
    all && [...past, ...rows.slice(0, cut)].map(r => [r.id, r.st, r.type]),
  ]);

  if (sig === (s.agentSig ?? null) || (!kept.length && !s.agentRows && !all && !s.agentAll)) return false;
  s.agentRows = kept.length ? kept : null;
  s.agentAll = all;
  s.agentSig = sig;
  return true;
}

// What the page asks of one agent, on demand (2026-11-02): the hover card's totals and the tab's transcript, read a piece at a
// time from where the last read stopped. A file is 2 MB at the median and 28 MB at most here (API requests in it), so only what
// is looked at is read, and six at most are held.
const agentLogs = new Map();
const AGENT_LOGS = 6;

function agentFold(log, raw) {
  if (!raw.includes('"type":"assistant"') && !raw.includes('"type":"user"')) return; // an API request's lines: the bulk of the file
  let l;

  try {
    l = JSON.parse(raw);
  } catch {
    return;
  }

  const ts = l.timestamp || null;
  const c = l.message?.content;
  const blocks = Array.isArray(c) ? c : [];

  if (l.type === 'assistant') {
    const m = l.message || {};

    if (m.model && m.model !== '<synthetic>') log.model = m.model;
    const u = m.usage;

    if (u) {
      log.tokens =
        (u.input_tokens || 0) +
        (u.cache_read_input_tokens || 0) +
        (u.cache_creation_input_tokens || 0) +
        (u.output_tokens || 0);
    } // as its notice counts them: the context at its last call

    for (const b of blocks) {
      if (b?.type === 'text' && b.text?.trim()) {
        log.entries.push({ role: 'assistant', kind: 'text', text: b.text, ts, msgId: m.id });
      } else if (b?.type === 'tool_use') {
        log.tools++;

        if (b.name === 'SubagentHandback') {
          (log.handed ||= new Set()).add(b.id);
          const t = String(b.input?.message || '').trim();

          if (t) log.entries.push({ role: 'assistant', kind: 'text', text: t, ts, msgId: m.id });
        } // its report: words, not a call, and its result nothing
        else {
          log.entries.push({
            role: 'assistant',
            kind: 'tool_use',
            name: b.name,
            text: summarizeToolInput(b.name, b.input),
            toolUseId: b.id,
            ts,
          });
        }
      }
    }
  } else if (l.type === 'user' && !l.isMeta && !l.isCompactSummary) {
    const results = blocks.filter(b => b?.type === 'tool_result');

    if (results.length) {
      for (const b of results) {
        if (!log.handed?.has(b.tool_use_id)) {
          log.entries.push({
            role: 'user',
            kind: 'tool_result',
            toolUseId: b.tool_use_id,
            isError: !!b.is_error,
            text: toolResultSnippet(b),
            ts,
          });
        }
      }

      return;
    }

    const text = agentPrompt(textOf(c));

    if (!text || TASK_NOTE_RE.test(text) || SYNTHETIC_RE.test(text)) return;
    log.prompt ??= text;
    log.entries.push({ role: 'user', kind: 'text', text, ts });
  }
}

export function agentLog(s, id) {
  const dir = agentsDir(s);

  if (!dir || !/^[\w-]+$/.test(id)) return null;
  const file = join(dir, `agent-${id}.jsonl`);
  let st;
  let fd;

  try {
    fd = openSync(file, 'r');
    st = fstatSync(fd);
  } catch {
    if (fd != null) closeSync(fd);
    return null;
  }

  let log = agentLogs.get(file);

  if (!log || st.size < log.offset) {
    log = {
      offset: 0,
      rest: '',
      dec: new StringDecoder('utf8'),
      entries: [],
      tools: 0,
      tokens: 0,
      model: null,
      prompt: null,
    };
  }

  try {
    if (st.size > log.offset) {
      let lead = log.rest; // a line the last read cut: what came of it now

      log.rest = readLines(
        fd,
        log.offset,
        st.size,
        raw => {
          agentFold(log, lead + raw);
          lead = '';
        },
        log.dec,
      );

      if (lead) log.rest = lead + log.rest; // no newline since
      log.offset = st.size;
    }
  } finally {
    closeSync(fd);
  }

  agentLogs.delete(file);
  agentLogs.set(file, log);
  if (agentLogs.size > AGENT_LOGS) agentLogs.delete(agentLogs.keys().next().value);
  return log;
}
