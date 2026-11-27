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

export const jsonSeen = new Map(); // a meta or a team's config → { mtimeMs, size, v }: read once per change

export function jsonOnce(file, shape) {
  let st;

  try {
    st = statSync(file);
  } catch {
    jsonSeen.delete(file);
    return null;
  }

  const hit = jsonSeen.get(file);

  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.v;
  let value = null;

  try {
    value = shape(JSON.parse(readFileSync(file, 'utf8')));
  } catch {}

  if (jsonSeen.size > 4000) jsonSeen.clear();
  jsonSeen.set(file, { mtimeMs: st.mtimeMs, size: st.size, v: value });
  return value;
}

/** A teammate's category (2026-11-18, v6): the `subagent_type` the lead spawned it with — its metadata names none, its
 *  roster entry its own name. By name, the newest spawn winning; `general-purpose`, the Agent tool's own default, when none. */
export const SPAWN_TOOLS = new Set(['Agent', 'Task']); // the spawning tool by either of its names (Task, before Agent; 2026-11-18, v8)

export function noteMateType(session, input) {
  const types = (session.mateTypes ||= new Map());

  types.delete(input.name);

  types.set(
    input.name,
    pstr(input.subagent_type) || pstr(input.agent_type) || pstr(input.agentType) || 'general-purpose',
  );

  while (types.size > 64) types.delete(types.keys().next().value);
}

// first what its own metadata says it was spawned as (`spawnedAgentType`, `customAgentType`; its `agentType` is its name — 2026-11-18, v9)
const typeSaid = (type, name) => (type && type !== name && type !== 'team-lead' ? type : null);

export const mateType = (session, name, spawned, kind) =>
  typeSaid(spawned, name) || session.mateTypes?.get(name) || typeSaid(kind, name) || 'general-purpose';

const isLead = member =>
  member.agentType === 'team-lead' ||
  member.name === 'team-lead' ||
  String(member.agentId || '').startsWith('team-lead@');

/** The roster beyond its lead, as Claude Code keeps it while the chat runs: what a teammate with no file yet is known by. */
export const rosterOf = session =>
  jsonOnce(join(TEAMS_DIR, `session-${session.id.slice(0, 8)}`, 'config.json'), config =>
    (config?.leadSessionId && config.leadSessionId !== session.id) || !Array.isArray(config?.members)
      ? []
      : config.members
          .filter(member => member && typeof member === 'object' && pstr(member.name) && !isLead(member))
          .map(member => ({ name: member.name, kind: pstr(member.agentType) })),
  ) || [];
const TM_SUMMARY = /^\s*<teammate-message\b[^>]*\bsummary="([^"]*)"/;

export const mateSeen = new Map();
export const SEEN_MAX = 2000; // a teammate's transcript → { mtimeMs, size, last }; in the order used

/** A teammate's last line: the last thing it said or called, else what the lead last asked of it. */
export function mateLast(file, st) {
  const hit = mateSeen.get(file);

  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    mateSeen.delete(file);
    mateSeen.set(file, hit);
    return hit.last;
  } // the newest last

  const len = Math.min(st.size, 65536);
  const buf = Buffer.alloc(len);

  try {
    const fd = openSync(file, 'r');

    try {
      readSync(fd, buf, 0, len, st.size - len);
    } finally {
      closeSync(fd);
    }
  } catch {
    return hit?.last ?? null;
  }

  let last = null;

  for (const raw of buf.toString('utf8').split('\n').reverse()) {
    let line;

    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }

    const content = line?.message?.content;

    if (line?.type === 'assistant') {
      const block = (Array.isArray(content) ? content : []).findLast(
        part => (part?.type === 'text' && part.text?.trim()) || part?.type === 'tool_use',
      );

      if (!block) continue;

      last =
        block.type === 'text'
          ? { kind: 'text', text: plainSnippet(block.text, 140) }
          : block.name === 'SubagentHandback'
            ? {
                kind: 'report',
                text: plainSnippet(
                  String(block.input?.message || '')
                    .trim()
                    .split('\n')[0],
                  140,
                ),
              } // its report's first line: what it found
            : {
                kind: 'tool',
                name: pstr(block.name) || 'tool',
                text: snippet(summarizeToolInput(block.name, block.input), 120),
              };

      break;
    }

    const match = line?.type === 'user' && TM_SUMMARY.exec(textOf(content));

    if (match) {
      last = { kind: 'asked', text: snippet(unXml(match[1]), 140) };
      break;
    }
  }

  last ??= hit?.last ?? null; // a tail that is one long tool result, cut: nothing to read in it (2026-11-02)
  mateSeen.delete(file);
  if (mateSeen.size >= SEEN_MAX) mateSeen.delete(mateSeen.keys().next().value); // the one used longest ago goes, never all (2026-11-24)
  mateSeen.set(file, { mtimeMs: st.mtimeMs, size: st.size, last });
  return last;
}
