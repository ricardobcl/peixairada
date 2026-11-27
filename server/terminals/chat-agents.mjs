// Who runs a new chat (2026-11-06): the agents Claude Code knows for a folder, and their
// colours.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { CLAUDE_DIR } from '../env.mjs';
import { snippet } from '../transcript/text.mjs';

// ---- agents: who runs a new chat (2026-11-06, round XXVIII) -------------------------------------------------------
// `claude --agent <name>` makes the whole chat that agent: its prompt, its tools, its model. ⌥⌘N's ＋ asks which
// (GET /api/agents?cwd=), read from the files as Claude Code 2.1.319 finds them: `.claude/agents/*.md` in the folder and
// each above it, to its git root and never the home (whose is the user's), `<CLAUDE_DIR>/agents`, each enabled plugin's
// `agents/` as `<plugin>:<name>`, and four of its own. Never by running claude, which writes its config. Its fifth,
// `claude`, is left out: as the chat itself it is the background job's prompt, not Claude as it starts. A folder's
// settings may name one (`agent`) for every chat there; `--agent ''` turns that off (measured in a lab config).
export const AGENT_NAME = /^\w[\w.-]{0,79}(?::[\w.-]{1,80})?$/; // a word's character first (2026-11-27): never one CLI parsing away from an option
const AGENT_COLORS = new Set(['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink']);
const AGENTS_OWN = [
  { name: 'Plan', description: 'Software architect: plans the change step by step, edits nothing' },
  { name: 'Explore', description: 'Read-only search across many files, the conclusion back' },
  { name: 'general-purpose', description: 'Researches, searches code and runs multi-step tasks' },
  { name: 'statusline-setup', description: 'Sets up Claude Code’s status line' },
];
const jsonAt = p => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
/** An agent file's frontmatter: `key: value` lines, a `|` or `>` block's indented lines, quotes dropped. */
export function agentFront(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return null;
  const out = {},
    lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    let v = kv[2];
    if (/^[|>][+-]?\s*$/.test(v)) {
      const body = [];
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || !lines[i + 1].trim())) body.push(lines[++i].trim());
      v = body.join(v[0] === '>' ? ' ' : '\n');
    } else v = v.trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
    out[kv[1]] = v.trim();
  }
  return out;
}
/** What a list row says of an agent: its description's first paragraph, before any examples. */
const agentWords = d =>
  snippet(
    String(d || '')
      .split(/\n\s*\n|\bExamples?:|<example>/i)[0]
      .replace(/\\n/g, ' '),
    200,
  );
function agentsIn(dir, source, more = {}) {
  let names;
  try {
    names = readdirSync(dir)
      .filter(n => n.endsWith('.md'))
      .sort();
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    let f;
    try {
      f = agentFront(readFileSync(join(dir, n), 'utf8').slice(0, 65536));
    } catch {
      continue;
    }
    const name = f?.name || n.slice(0, -3);
    if (!f || name.includes(':') || !AGENT_NAME.test(name)) continue;
    out.push({
      name: more.plugin ? `${more.plugin}:${name}` : name,
      description: agentWords(f.description),
      model: f.model || '',
      color: AGENT_COLORS.has(f.color) ? f.color : null,
      source,
      ...more,
    });
  }
  return out;
}
/** The folders a chat in `cwd` reads `.claude/agents` in: its own and each above, to the one with `.git`, not the home. */
function agentDirs(cwd) {
  const home = homedir(),
    dirs = [];
  for (let d = resolve(cwd); d !== home;) {
    dirs.push(d);
    if (existsSync(join(d, '.git'))) break;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return dirs;
}
/** Every agent a chat in `cwd` can be, nearest first — a name taken once —, and the agent its settings start it as. */
export function agentsFor(cwd) {
  const settings = [
    join(CLAUDE_DIR, 'settings.json'),
    join(cwd, '.claude', 'settings.json'),
    join(cwd, '.claude', 'settings.local.json'),
  ].map(jsonAt);
  const list = [],
    seen = new Set(),
    add = a => {
      if (!seen.has(a.name)) {
        seen.add(a.name);
        list.push(a);
      }
    };
  for (const d of agentDirs(cwd)) agentsIn(join(d, '.claude', 'agents'), 'folder', { at: d }).forEach(add);
  agentsIn(join(CLAUDE_DIR, 'agents'), 'user').forEach(add);
  const installed = jsonAt(join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'))?.plugins || {};
  for (const [key, on] of Object.entries(Object.assign({}, ...settings.map(s => s?.enabledPlugins || {})))) {
    const at = on === true && (installed[key] || []).find(e => typeof e?.installPath === 'string')?.installPath;
    if (at) agentsIn(join(at, 'agents'), 'plugin', { plugin: key.split('@')[0] }).forEach(add);
  }
  for (const a of AGENTS_OWN) add({ ...a, model: '', color: null, source: 'builtin' });
  const k = [2, 1, 0].find(i => typeof settings[i]?.agent === 'string' && settings[i].agent); // local over the folder's over yours
  return {
    agents: list,
    setting: k === undefined ? null : { name: settings[k].agent, from: ['user', 'folder', 'local'][k] },
  };
}
/** The colour Claude Code draws a chat's agent in, for its card (looked up again a minute on). */
const agentLook = new Map();
export function agentColor(cwd, name) {
  if (!cwd || !name) return null;
  const k = `${cwd}\0${name}`,
    hit = agentLook.get(k);
  if (hit && Date.now() - hit.at < 60_000) return hit.color;
  let color = null;
  try {
    color = agentsFor(cwd).agents.find(a => a.name === name)?.color || null;
  } catch {}
  if (agentLook.size > 500) agentLook.clear();
  agentLook.set(k, { at: Date.now(), color });
  return color;
}
