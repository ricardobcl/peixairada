#!/usr/bin/env node
// A ~/.claude look-alike for tests: projects/<slug>/<id>.jsonl per chat, an empty sessions/ (nothing alive).
//   node scripts/fixture.mjs <dir>        # the default fixture (a two-PR chat, a plain one), prints its chats as JSON
// Or from a script: makeFixture(dir, [{ id?, cwd, prompt, reply, title?, at? }]) → { dir, chats: [{ id, cwd, file }] }.
// The lines carry what server.mjs reads (fold()): user/assistant messages with text blocks, ai-title, pr-link.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const slugOf = cwd => cwd.replace(/[/.]/g, '-');

/** The JSONL lines of one chat: prompt, reply (end_turn), optionally an ai-title. `at` is the reply's time. */
export function chatLines({ id, cwd, prompt, reply, title = null, at = new Date(Date.now() - 86_400_000), entrypoint = 'cli' }) {
  const ts = ms => new Date(at.getTime() + ms).toISOString();
  const u = randomUUID(), a = randomUUID();
  const base = { isSidechain: false, userType: 'external', entrypoint, cwd, sessionId: id, version: 'fixture', gitBranch: 'main' };
  const lines = [
    { ...base, parentUuid: null, type: 'user', message: { role: 'user', content: [{ type: 'text', text: prompt }] }, uuid: u, timestamp: ts(-60_000) },
    { ...base, parentUuid: u, type: 'assistant', message: { model: 'fixture-1', id: 'msg_' + a.slice(0, 8), type: 'message', role: 'assistant', content: [{ type: 'text', text: reply }], stop_reason: 'end_turn' }, uuid: a, timestamp: ts(0) },
  ];
  if (title) lines.push({ type: 'ai-title', sessionId: id, aiTitle: title });
  return lines;
}

export function makeFixture(dir, chats) {
  mkdirSync(join(dir, 'sessions'), { recursive: true });
  const made = [];
  for (const c of chats) {
    const id = c.id || randomUUID();
    const projDir = join(dir, 'projects', slugOf(c.cwd)); mkdirSync(projDir, { recursive: true });
    const file = join(projDir, `${id}.jsonl`);
    writeFileSync(file, chatLines({ ...c, id }).map(l => JSON.stringify(l)).join('\n') + '\n');
    made.push({ id, cwd: c.cwd, file, title: c.title || null });
  }
  return { dir, chats: made };
}

/** What most scenarios want: two stale chats in two folders — one mentioning two PRs, one plain. */
export function defaultFixture(dir, { cwdA = '/Users/test/repo-a', cwdB = '/Users/test/repo-b' } = {}) {
  return makeFixture(dir, [
    { cwd: cwdA, title: 'Two PRs mentioned', prompt: 'Look at https://github.com/acme/repo-a/pull/12 and its follow-up https://github.com/acme/repo-a/pull/13', reply: 'Both reviewed. #12 is the base, #13 (https://github.com/acme/repo-a/pull/13) depends on it.' },
    { cwd: cwdB, title: 'Plain chat', prompt: 'what day is it?', reply: 'It is a fixture. No PRs here.' },
  ]);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const dir = process.argv[2]; if (!dir) { console.error('usage: node scripts/fixture.mjs <dir>'); process.exit(2); }
  console.log(JSON.stringify(defaultFixture(dir), null, 1));
}
