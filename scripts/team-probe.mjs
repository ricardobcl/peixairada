#!/usr/bin/env node
// What Claude Code wrote about a chat's teammates (2026-11-18): the board reads a teammate's category from the lead's
// spawn call (mateType), and when Space shows the wrong one this says what is there to read. Read-only, and keys and
// short names only — never a prompt or a reply. `node scripts/team-probe.mjs [minutes]`: chats written to within that
// many minutes (60 by default). CLAUDE_DIR as the server reads it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CLAUDE_DIR = process.env.CLAUDE_DIR || join(homedir(), '.claude');
const root = join(CLAUDE_DIR, 'projects');

const since = Date.now() - Number(process.argv[2] || 60) * 60_000;

const ls = dir => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

const short = value =>
  typeof value === 'string' ? value.slice(0, 60) : value === undefined ? undefined : typeof value;

for (const slug of ls(root)) {
  for (const fileName of ls(join(root, slug)).filter(fileName => fileName.endsWith('.jsonl'))) {
    const file = join(root, slug, fileName);

    if (statSync(file).mtimeMs < since) continue;

    const id = fileName.slice(0, -6);
    const spawns = [];

    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      if (!raw.includes('"tool_use"')) continue;
      let entry;

      try {
        entry = JSON.parse(raw);
      } catch {
        continue;
      }

      for (const block of Array.isArray(entry.message?.content) ? entry.message.content : []) {
        const input = block?.type === 'tool_use' && block.input;

        if (!input || !(input.name || input.team_name || input.subagent_type)) continue;

        spawns.push({
          tool: block.name,
          name: short(input.name),
          subagent_type: short(input.subagent_type),
          team_name: short(input.team_name),
          keys: Object.keys(input),
        });
      }
    }

    const sub = join(root, slug, id, 'subagents');

    const metas = ls(sub)
      .filter(metaFile => metaFile.endsWith('.meta.json'))
      .map(metaFile => {
        let meta = {};

        try {
          meta = JSON.parse(readFileSync(join(sub, metaFile), 'utf8'));
        } catch {}

        return {
          file: metaFile,
          name: short(meta.name),
          agentType: short(meta.agentType),
          spawnedAgentType: short(meta.spawnedAgentType),
          customAgentType: short(meta.customAgentType),
          taskKind: short(meta.taskKind),
          keys: Object.keys(meta),
        };
      });

    if (!spawns.length && !metas.length) continue;
    console.log(`\n== chat ${id} (${slug})`);
    for (const spawn of spawns) console.log('  spawn', JSON.stringify(spawn));
    for (const meta of metas) console.log('  meta ', JSON.stringify(meta));
  }
}
