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

const jsonAt = path => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

/** An agent file's frontmatter: `key: value` lines, a `|` or `>` block's indented lines, quotes dropped. */
export function agentFront(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);

  if (!match) return null;

  const out = {};
  const lines = match[1].split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const kv = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(lines[index]);

    if (!kv) continue;
    let value = kv[2];

    if (/^[|>][+-]?\s*$/.test(value)) {
      const body = [];

      while (index + 1 < lines.length && (/^\s/.test(lines[index + 1]) || !lines[index + 1].trim())) {
        body.push(lines[++index].trim());
      }

      value = body.join(value[0] === '>' ? ' ' : '\n');
    } else value = value.trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
    out[kv[1]] = value.trim();
  }

  return out;
}

/** What a list row says of an agent: its description's first paragraph, before any examples. */
const agentWords = description =>
  snippet(
    String(description || '')
      .split(/\n\s*\n|\bExamples?:|<example>/i)[0]
      .replace(/\\n/g, ' '),
    200,
  );

function agentsIn(dir, source, more = {}) {
  let names;

  try {
    names = readdirSync(dir)
      .filter(fileName => fileName.endsWith('.md'))
      .sort();
  } catch {
    return [];
  }

  const out = [];

  for (const fileName of names) {
    let front;

    try {
      front = agentFront(readFileSync(join(dir, fileName), 'utf8').slice(0, 65536));
    } catch {
      continue;
    }

    const name = front?.name || fileName.slice(0, -3);

    if (!front || name.includes(':') || !AGENT_NAME.test(name)) continue;

    out.push({
      name: more.plugin ? `${more.plugin}:${name}` : name,
      description: agentWords(front.description),
      model: front.model || '',
      color: AGENT_COLORS.has(front.color) ? front.color : null,
      source,
      ...more,
    });
  }

  return out;
}

/** The folders a chat in `cwd` reads `.claude/agents` in: its own and each above, to the one with `.git`, not the home. */
function agentDirs(cwd) {
  const home = homedir();
  const dirs = [];

  for (let dir = resolve(cwd); dir !== home;) {
    dirs.push(dir);
    if (existsSync(join(dir, '.git'))) break;
    const up = dirname(dir);

    if (up === dir) break;
    dir = up;
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

  const list = [];
  const seen = new Set();

  const add = agent => {
    if (!seen.has(agent.name)) {
      seen.add(agent.name);
      list.push(agent);
    }
  };

  for (const dir of agentDirs(cwd)) agentsIn(join(dir, '.claude', 'agents'), 'folder', { at: dir }).forEach(add);
  agentsIn(join(CLAUDE_DIR, 'agents'), 'user').forEach(add);
  const installed = jsonAt(join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'))?.plugins || {};

  for (const [key, on] of Object.entries(Object.assign({}, ...settings.map(config => config?.enabledPlugins || {})))) {
    const at =
      on === true && (installed[key] || []).find(install => typeof install?.installPath === 'string')?.installPath;

    if (at) agentsIn(join(at, 'agents'), 'plugin', { plugin: key.split('@')[0] }).forEach(add);
  }

  for (const agent of AGENTS_OWN) add({ ...agent, model: '', color: null, source: 'builtin' });
  const scope = [2, 1, 0].find(index => typeof settings[index]?.agent === 'string' && settings[index].agent); // local over the folder's over yours

  return {
    agents: list,
    setting: scope === undefined ? null : { name: settings[scope].agent, from: ['user', 'folder', 'local'][scope] },
  };
}

/** The colour Claude Code draws a chat's agent in, for its card (looked up again a minute on). */
const agentLook = new Map();

export function agentColor(cwd, name) {
  if (!cwd || !name) return null;

  const key = `${cwd}\0${name}`;
  const hit = agentLook.get(key);

  if (hit && Date.now() - hit.at < 60_000) return hit.color;
  let color = null;

  try {
    color = agentsFor(cwd).agents.find(agent => agent.name === name)?.color || null;
  } catch {}

  if (agentLook.size > 500) agentLook.clear();
  agentLook.set(key, { at: Date.now(), color });
  return color;
}
