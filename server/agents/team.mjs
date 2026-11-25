// An agent team (2026-10-31): its teammates, under their lead.
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUDE_DIR } from '../env.mjs';
import { pstr, unXml } from '../peers.mjs';
import { plainSnippet, snippet, summarizeToolInput, textOf } from '../transcript/text.mjs';

// ---- an agent team: its teammates, under their lead (2026-10-31) --------------------------------------------------------
// Claude Code's agent teams (experimental): a lead and teammates, each a context of its own. Every interactive chat has its
// team here — `teams/session-<id8>/config.json`, gone when the chat ends, its `members` the lead alone (`team-lead`) until
// it names one —; an in-process teammate is a sub-agent file of the lead's whose .meta.json says `taskKind:
// "in_process_teammate"` and `teamName`, with its `name`, and whose first prompt is the lead's `<teammate-message
// teammate_id="team-lead" summary="…">`. Read, never written (its mailboxes are files under ~/.claude, Claude Code's). A
// teammate is a row like any sub-agent (noteAgents), with its name; one only the roster names yet is `joined`. It dies with
// the lead's claude (`since`), and a team that is only the lead is none.
const TEAMS_DIR = join(CLAUDE_DIR, 'teams');
export const jsonSeen = new Map();   // a meta or a team's config → { mtimeMs, size, v }: read once per change
export function jsonOnce(file, shape) {
  let st; try { st = statSync(file); } catch { jsonSeen.delete(file); return null; }
  const hit = jsonSeen.get(file); if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.v;
  let v = null; try { v = shape(JSON.parse(readFileSync(file, 'utf8'))); } catch {}
  if (jsonSeen.size > 4000) jsonSeen.clear();
  jsonSeen.set(file, { mtimeMs: st.mtimeMs, size: st.size, v });
  return v;
}
/** A teammate's category (2026-11-18, v6): the `subagent_type` the lead spawned it with — its metadata names none, its
 *  roster entry its own name. By name, the newest spawn winning; `general-purpose`, the Agent tool's own default, when none. */
export const SPAWN_TOOLS = new Set(['Agent', 'Task']);   // the spawning tool by either of its names (Task, before Agent; 2026-11-18, v8)
export function noteMateType(s, input) {
  const t = s.mateTypes ||= new Map(); t.delete(input.name); t.set(input.name, pstr(input.subagent_type) || pstr(input.agent_type) || pstr(input.agentType) || 'general-purpose');
  while (t.size > 64) t.delete(t.keys().next().value);
}
// first what its own metadata says it was spawned as (`spawnedAgentType`, `customAgentType`; its `agentType` is its name — 2026-11-18, v9)
const typeSaid = (k, name) => k && k !== name && k !== 'team-lead' ? k : null;
export const mateType = (s, name, spawned, kind) => typeSaid(spawned, name) || s.mateTypes?.get(name) || typeSaid(kind, name) || 'general-purpose';
const isLead = m => m.agentType === 'team-lead' || m.name === 'team-lead' || String(m.agentId || '').startsWith('team-lead@');
/** The roster beyond its lead, as Claude Code keeps it while the chat runs: what a teammate with no file yet is known by. */
export const rosterOf = s => jsonOnce(join(TEAMS_DIR, `session-${s.id.slice(0, 8)}`, 'config.json'), c => (c?.leadSessionId && c.leadSessionId !== s.id) || !Array.isArray(c?.members) ? []
  : c.members.filter(m => m && typeof m === 'object' && pstr(m.name) && !isLead(m)).map(m => ({ name: m.name, kind: pstr(m.agentType) }))) || [];
const TM_SUMMARY = /^\s*<teammate-message\b[^>]*\bsummary="([^"]*)"/;
export const mateSeen = new Map(), SEEN_MAX = 2000;   // a teammate's transcript → { mtimeMs, size, last }; in the order used
/** A teammate's last line: the last thing it said or called, else what the lead last asked of it. */
export function mateLast(file, st) {
  const hit = mateSeen.get(file); if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) { mateSeen.delete(file); mateSeen.set(file, hit); return hit.last; }   // the newest last
  const len = Math.min(st.size, 65536), buf = Buffer.alloc(len);
  try { const fd = openSync(file, 'r'); try { readSync(fd, buf, 0, len, st.size - len); } finally { closeSync(fd); } } catch { return hit?.last ?? null; }
  let last = null;
  for (const raw of buf.toString('utf8').split('\n').reverse()) {
    let l; try { l = JSON.parse(raw); } catch { continue; }
    const c = l?.message?.content;
    if (l?.type === 'assistant') {
      const b = (Array.isArray(c) ? c : []).findLast(x => (x?.type === 'text' && x.text?.trim()) || x?.type === 'tool_use'); if (!b) continue;
      last = b.type === 'text' ? { kind: 'text', text: plainSnippet(b.text, 140) }
        : b.name === 'SubagentHandback' ? { kind: 'report', text: plainSnippet(String(b.input?.message || '').trim().split('\n')[0], 140) }   // its report's first line: what it found
        : { kind: 'tool', name: pstr(b.name) || 'tool', text: snippet(summarizeToolInput(b.name, b.input), 120) };
      break;
    }
    const m = l?.type === 'user' && TM_SUMMARY.exec(textOf(c));
    if (m) { last = { kind: 'asked', text: snippet(unXml(m[1]), 140) }; break; }
  }
  last ??= hit?.last ?? null;   // a tail that is one long tool result, cut: nothing to read in it (2026-11-02)
  mateSeen.delete(file); if (mateSeen.size >= SEEN_MAX) mateSeen.delete(mateSeen.keys().next().value);   // the one used longest ago goes, never all (2026-11-24)
  mateSeen.set(file, { mtimeMs: st.mtimeMs, size: st.size, last });
  return last;
}
