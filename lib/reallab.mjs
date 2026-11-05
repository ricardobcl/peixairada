// The real Claude Code in a drawer, at no cost and touching nothing (2026-11-05): a HOME and a config dir of its own, a
// dummy key, an API address nobody answers, chats written by hand. For what the fake can only imitate: a scenario's
// `meta.env` is `lab.env`, `lab.bin` null where none is installed (say so and pass). Nothing is asked of the API: a turn
// typed here would only retry. A run's temp folders go as the process exits (tmpDir).
import { chmodSync, existsSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { tmpDir } from './testserver.mjs';

/** The newest Claude Code the installer left on this Mac, or null. REAL_CLAUDE names another. */
export function realClaude() {
  if (process.env.REAL_CLAUDE) return process.env.REAL_CLAUDE;
  const d = join(homedir(), '.local', 'share', 'claude', 'versions');
  if (!existsSync(d)) return null;
  const v = readdirSync(d).filter(f => /^\d+\.\d+\.\d+$/.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);
  return v ? join(d, v) : null;
}

/** A chat of `turns` questions and long answers, as lines the CLI resumes. Its id. */
export function labChat(lab, turns) {
  const id = randomUUID(), t0 = Date.now() - 3_600_000 + turns; let parent = null; const lines = [];
  for (let i = 0; i < turns; i++) {
    const u = randomUUID(), a = randomUUID(), base = { sessionId: id, cwd: lab.proj, version: 'lab' };
    lines.push(JSON.stringify({ ...base, type: 'user', uuid: u, parentUuid: parent, timestamp: new Date(t0 + i * 1000).toISOString(), message: { role: 'user', content: `question ${i}: why does the sea look the way it does at this time of day?` } }));
    lines.push(JSON.stringify({ ...base, type: 'assistant', uuid: a, parentUuid: u, timestamp: new Date(t0 + i * 1000 + 500).toISOString(), message: { id: `msg_${i}`, role: 'assistant', model: 'lab-1', type: 'message', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: `Answer ${i}. ${'The light comes in low and the water holds it for a while before letting it go. '.repeat(5)}` }] } }));
    parent = a;
  }
  writeFileSync(join(lab.cfg, 'projects', lab.proj.replace(/[^a-zA-Z0-9]/g, '-'), `${id}.jsonl`), `${lines.join('\n')}\n`);
  return id;
}

/** `tui`, the setting the chats run under: 'fullscreen' (the alternate screen), or null for the transcript in the scrollback. */
export function realLab({ tui = 'fullscreen' } = {}) {
  const bin = realClaude(), dir = realpathSync(tmpDir()), home = join(dir, 'home'), cfg = join(dir, 'cfg'), proj = join(dir, 'proj');
  for (const d of [home, cfg, proj]) mkdirSync(d, { recursive: true });
  const key = `sk-ant-api03-${'x'.repeat(40)}`;
  writeFileSync(join(cfg, '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true, customApiKeyResponses: { approved: [key.slice(-20)], rejected: [] }, projects: { [proj]: { hasTrustDialogAccepted: true } } }));
  writeFileSync(join(cfg, 'settings.json'), JSON.stringify(tui ? { tui } : {}));
  mkdirSync(join(cfg, 'projects', proj.replace(/[^a-zA-Z0-9]/g, '-')), { recursive: true });
  const wrapper = join(dir, 'claude.sh');
  writeFileSync(wrapper, `#!/bin/sh\nexport HOME='${home}' CLAUDE_CONFIG_DIR='${cfg}' ANTHROPIC_API_KEY='${key}' ANTHROPIC_BASE_URL=http://127.0.0.1:9 DISABLE_TELEMETRY=1 DISABLE_AUTOUPDATER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1\nexec '${bin}' "$@"\n`);
  chmodSync(wrapper, 0o755);
  return { bin, dir, cfg, proj, env: { CLAUDE_BIN: wrapper, CLAUDE_DIR: cfg } };
}
