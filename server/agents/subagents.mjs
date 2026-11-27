// Sub-agents at work: <slug>/<id>/subagents/agent-*.jsonl — one at work keeps the chat clauding.
import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { agentFinished, noteAgents } from './rows.mjs';
import { schedulePush } from '../sse.mjs';
import { indexing, sessions } from '../state.mjs';
import { endsTurn } from '../transcript/fold.mjs';
import { textOf } from '../transcript/text.mjs';

// Claude Code writes each sub-agent's transcript beside the session's (every line isSidechain, a .meta.json with
// requestShape 'background' or not). A foreground agent holds the main transcript at a tool_use, so the chat stays
// working; a background one answers at once and the main turn ends — the card went ready while agents worked
// (2026-09-20). An agent's last lines say whether it is done: an assistant end_turn; or, since agents hand their
// report back through a tool (2026-10-03), the result of its SubagentHandback call — no end_turn ever follows it, and
// such an agent counted for AGENT_STALE_MS more, the card clauding and the chat's own reply never alerted; or an
// interrupt (Esc). One that went quiet AGENT_STALE_MS ago is not counted (a killed agent never writes its end), nor one
// last written before the chat's claude started (2026-10-14: `since` — a take-over or a resume while agents ran left
// the dead claude's agents clauding the card, its reply unalerted, for AGENT_STALE_MS). An agent's turn ends as the
// chat's does (endsTurn). Only the status is touched — not the order, not the transcript, not the alerts beyond
// holding the 'reply' one back until the agents are done.
const AGENT_STALE_MS = Number(process.env.AGENT_STALE_MS || 15 * 60_000);

const isHandback = (line, id) =>
  line?.type === 'assistant' &&
  Array.isArray(line.message?.content) &&
  line.message.content.some(b => b?.type === 'tool_use' && b.name === 'SubagentHandback' && b.id === id);

/** A chat with no claude, its agents as they were (2026-11-24): Space's pods, a resume's. Read again only when its folder of
 *  agents changed, and only for a chat with a word in the last AGENT_PAST_DAYS — the rest wait for a look of their own. On
 *  the poll alone, PAST_PER_POLL chats a poll (2026-11-24, review): a boot with a hundred such chats read them all before
 *  it answered, and a backlog is spread out; the newest first (pastSweep). */
const AGENT_PAST_DAYS = Number(process.env.AGENT_PAST_DAYS ?? 14);
const PAST_PER_POLL = Number(process.env.PAST_PER_POLL || 20);

function pastAgents(s) {
  if (s.alive || !s.file || !(Date.now() - Date.parse(s.lastActivity || 0) < AGENT_PAST_DAYS * 86_400_000)) {
    return false;
  }

  let at;

  try {
    at = statSync(agentsDir(s)).mtimeMs;
  } catch {
    at = 0;
  }

  if (at === s.agentDirAt) return false;
  s.agentDirAt = at;
  if (!at && !s.agentAll && !s.agentRows) return false; // none, and none before: nothing read
  scanAgents(s);
  return true;
}

export function pastSweep() {
  let left = PAST_PER_POLL;

  const todo = [...sessions.values()]
    .filter(s => !s.alive && s.file)
    .sort((a, b) => String(b.lastActivity || '').localeCompare(String(a.lastActivity || '')));

  for (const s of todo) {
    if (left <= 0) break;
    if (pastAgents(s)) left--;
  }
}

export function agentRunning(file, now = Date.now(), since = 0) {
  let st;

  try {
    st = statSync(file);
  } catch {
    return false;
  }

  if (now - st.mtimeMs > AGENT_STALE_MS || st.mtimeMs < since || !st.size) return false;

  const len = Math.min(st.size, 65536);
  const buf = Buffer.alloc(len);

  const fd = openSync(file, 'r');

  try {
    readSync(fd, buf, 0, len, st.size - len);
  } finally {
    closeSync(fd);
  }

  const tail = buf
    .toString('utf8')
    .trim()
    .split('\n')
    .slice(-8)
    .map(l => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    });

  const last = tail.at(-1);

  if (!last) return true; // a line still being written: at work
  if (last.type === 'assistant') return !endsTurn(last.message);
  if (last.type !== 'user') return true; // an attachment (a token reminder) is an agent mid-way
  const c = last.message?.content;

  if (textOf(c).startsWith('[Request interrupted')) return false;
  const res = Array.isArray(c) && c.find(b => b?.type === 'tool_result');

  return !(res && tail.some(l => isHandback(l, res.tool_use_id)));
}

export const agentsDir = s => (s.file ? join(dirname(s.file), s.id, 'subagents') : null);
/** A scan soon, for a chat whose agents moved: from the transcripts' watcher and from a notice folded (noteAgentNotices), so
 *  it lives out here (2026-11-04: inside main(), a notice threw and its line was skipped). */
const pendingAgents = new Map();

export function agentsSoon(s) {
  if (indexing || s.silent) return; // the boot's scan, a re-read: its own scan follows
  clearTimeout(pendingAgents.get(s.id));

  pendingAgents.set(
    s.id,
    setTimeout(() => {
      pendingAgents.delete(s.id);
      scanAgents(sessions.get(s.id) ?? s);
    }, 200),
  ); // the chat as it is then: a re-read (indexFile) replaces the object
}

export function scanAgents(s) {
  const dir = agentsDir(s);
  let names = [];

  if (dir) {
    try {
      names = readdirSync(dir);
    } catch {}
  }

  // the oldest claude on the chat: an agent from before it died with the one before — the rows' and the count's; one with no
  // claude, all of them before (its past alone: Space's pods, 2026-11-24)
  const since = s.alive ? Math.min(...[s.live, ...(s.rivals || [])].map(l => Number(l?.startedAt) || 0)) : Infinity;
  const now = Date.now();

  const work = new Map(
    names
      .filter(n => n.endsWith('.jsonl'))
      .map(n => [n, agentRunning(join(dir, n), now, since) && !agentFinished(dir, n)]),
  );

  const running = [...work.values()].filter(Boolean).length;

  if (running !== (s.agentsRunning || 0)) {
    s.agentsRunning = running;
    schedulePush(s);
  }

  if (noteAgents(s, dir, work, since, now)) schedulePush(s); // a row each (2026-11-02)
}
