#!/usr/bin/env node
// A ~/.claude look-alike for tests: projects/<slug>/<id>.jsonl per chat, an empty sessions/ (nothing alive).
//   node scripts/fixture.mjs <dir>        # the default fixture (a two-PR chat, a plain one), prints its chats as JSON
// Or from a script: makeFixture(dir, [{ id?, cwd, prompt, reply, title?, at?, lines?, live? }]) → { dir, chats: […] }.
// The lines carry what server.mjs reads (fold()): user/assistant messages with text blocks, ai-title, pr-link —
// and, through `lines` (toolLines / taskNoteLine below), the tool calls and task notifications a chat mid-work has.
// `live: { pid, startedAt }` writes the registry file that makes a chat *alive*: the states that only exist while a
// claude is running — a pending question, a monitor, sub-agents — need one, and any live pid will do (the server
// only asks whether it is there).
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

/** The base every line of a chat carries — the fields fold() reads off any of them. */
const lineBase = (id, cwd, entrypoint = 'cli') => ({ isSidechain: false, userType: 'external', entrypoint, cwd, sessionId: id, version: 'fixture', gitBranch: 'main' });

/** A turn that calls a tool and stops there (stop_reason 'tool_use' — the chat is working), and its result if the
 *  tool answered. A call with no result is what a chat waiting on you looks like: AskUserQuestion, ExitPlanMode. */
export function toolLines({ id, cwd, name, input, result = null, at = new Date() }) {
  const base = lineBase(id, cwd);
  const useId = 'toolu_' + randomUUID().replace(/-/g, '').slice(0, 20);
  const lines = [{ ...base, parentUuid: null, type: 'assistant', uuid: randomUUID(), timestamp: at.toISOString(),
    message: { model: 'fixture-1', id: 'msg_' + useId.slice(6, 14), type: 'message', role: 'assistant', content: [{ type: 'tool_use', id: useId, name, input }], stop_reason: 'tool_use' } }];
  if (result !== null) lines.push({ ...base, parentUuid: null, type: 'user', uuid: randomUUID(), timestamp: new Date(at.getTime() + 1000).toISOString(),
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: useId, content: result }] } });
  return lines;
}

/** A `<task-notification>` line: an event of a running task, or — with a status — the end of one. */
export function taskNoteLine({ id, cwd, taskId, summary = '', event = '', status = null, at = new Date() }) {
  const body = `<task-notification>\n<task-id>${taskId}</task-id>\n${status ? `<status>${status}</status>\n` : ''}<summary>${summary}</summary>\n${event ? `<event>${event}</event>\n` : ''}</task-notification>`;
  return { ...lineBase(id, cwd), parentUuid: null, type: 'user', uuid: randomUUID(), timestamp: at.toISOString(), message: { role: 'user', content: [{ type: 'text', text: body }] } };
}

/** A turn of plain words that ends (stop_reason 'end_turn') — the chat goes ready. */
export function replyLines({ id, cwd, text, at = new Date() }) {
  return [{ ...lineBase(id, cwd), parentUuid: null, type: 'assistant', uuid: randomUUID(), timestamp: at.toISOString(),
    message: { model: 'fixture-1', id: 'msg_' + randomUUID().slice(0, 8), type: 'message', role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn' } }];
}

export function makeFixture(dir, chats) {
  const sessDir = join(dir, 'sessions');
  mkdirSync(sessDir, { recursive: true });
  const made = [];
  for (const c of chats) {
    const id = c.id || randomUUID();
    const projDir = join(dir, 'projects', slugOf(c.cwd)); mkdirSync(projDir, { recursive: true });
    const file = join(projDir, `${id}.jsonl`);
    const lines = [...chatLines({ ...c, id }), ...(typeof c.lines === 'function' ? c.lines(id) : c.lines || [])];
    writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
    // The registry, for a chat that has to look alive: one file per pid, as Claude Code writes it.
    if (c.live) writeFileSync(join(sessDir, `${c.live.pid}.json`), JSON.stringify({
      pid: c.live.pid, sessionId: id, cwd: c.cwd, startedAt: c.live.startedAt ?? Date.now() - 3600_000,
      version: 'fixture', kind: 'interactive', entrypoint: c.live.entrypoint || 'cli', pidDomain: process.platform,
    }));
    made.push({ id, cwd: c.cwd, file, title: c.title || null, pid: c.live?.pid || null });
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
