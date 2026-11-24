#!/usr/bin/env node
// What Claude Code wrote about a chat's teammates (2026-11-18): the board reads a teammate's category from the lead's
// spawn call (mateType), and when Space shows the wrong one this says what is there to read. Read-only, and keys and
// short names only — never a prompt or a reply. `node scripts/team-probe.mjs [minutes]`: chats written to within that
// many minutes (60 by default). CLAUDE_DIR as the server reads it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CLAUDE_DIR = process.env.CLAUDE_DIR || join(homedir(), '.claude'), root = join(CLAUDE_DIR, 'projects');
const since = Date.now() - Number(process.argv[2] || 60) * 60_000, ls = d => { try { return readdirSync(d); } catch { return []; } };
const short = v => typeof v === 'string' ? v.slice(0, 60) : v === undefined ? undefined : typeof v;
for (const slug of ls(root)) for (const f of ls(join(root, slug)).filter(f => f.endsWith('.jsonl'))) {
  const file = join(root, slug, f); if (statSync(file).mtimeMs < since) continue;
  const id = f.slice(0, -6), spawns = [];
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (!raw.includes('"tool_use"')) continue;
    let l; try { l = JSON.parse(raw); } catch { continue; }
    for (const b of Array.isArray(l.message?.content) ? l.message.content : []) {
      const i = b?.type === 'tool_use' && b.input; if (!i || !(i.name || i.team_name || i.subagent_type)) continue;
      spawns.push({ tool: b.name, name: short(i.name), subagent_type: short(i.subagent_type), team_name: short(i.team_name), keys: Object.keys(i) });
    }
  }
  const sub = join(root, slug, id, 'subagents'), metas = ls(sub).filter(n => n.endsWith('.meta.json')).map(n => {
    let m = {}; try { m = JSON.parse(readFileSync(join(sub, n), 'utf8')); } catch {}
    return { file: n, name: short(m.name), agentType: short(m.agentType), spawnedAgentType: short(m.spawnedAgentType), customAgentType: short(m.customAgentType), taskKind: short(m.taskKind), keys: Object.keys(m) };
  });
  if (!spawns.length && !metas.length) continue;
  console.log(`\n== chat ${id} (${slug})`);
  for (const s of spawns) console.log('  spawn', JSON.stringify(s));
  for (const m of metas) console.log('  meta ', JSON.stringify(m));
}
