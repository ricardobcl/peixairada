#!/usr/bin/env node
// A stand-in for `claude` in tests: the shapes of the real thing that the board depends on, none of the cost.
//   fakeclaude.mjs [--resume <id> [--fork-session] | --session-id <uuid>] [--agent <name>] [-- <prompt>]      (what the server passes)
// It registers in $CLAUDE_DIR/sessions/<pid>.json like the CLI, appends user/assistant lines to the chat's
// transcript under $CLAUDE_DIR/projects/<slug>/<id>.jsonl, and draws a TUI the way Claude Code does: the
// transcript scrolls above, a live region sits at the bottom (rule · prompt · rule · three status lines), the
// status timer rewrites only its own cells every second, and a resize (SIGWINCH) repaints the whole region —
// which is exactly the behaviour behind the truncated-replay bug of 2026-09-20, and what the drawer tests need.
// FAKE_TUI=fullscreen draws as `tui: fullscreen` does instead (see paint). It refuses to run without CLAUDE_DIR set to
// something other than ~/.claude: it must never write the real one.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir, userInfo } from 'node:os';
import { randomUUID } from 'node:crypto';

const CLAUDE_DIR = process.env.CLAUDE_DIR;
// The real one by what it is, not how it is spelt (2026-10-03: a string compare let `~/.claude/`, `~/.Claude`, a
// symlink, a folder under it, and any run with $HOME pointed elsewhere — config.test does — write the real registry).
// Every folder from CLAUDE_DIR up is compared by device and inode with ~/.claude, for $HOME's home and the account's.
const inode = p => { try { const s = statSync(p); return `${s.dev}:${s.ino}`; } catch { return null; } };
const realClaude = new Set([homedir(), userInfo().homedir].map(h => inode(join(h, '.claude'))).filter(Boolean));
const underReal = d => { for (let p = resolve(d); ; p = dirname(p)) { if (realClaude.has(inode(p))) return true; if (dirname(p) === p) return false; } };
if (!CLAUDE_DIR || underReal(CLAUDE_DIR)) { console.error('fakeclaude: CLAUDE_DIR must point at a fixture, never the real ~/.claude'); process.exit(2); }
// `--` and a prompt after it (2026-10-31, the board's Send to…): the first prompt, sent once the screen is up, as
// Claude Code does with its positional one
const all = process.argv.slice(2), dd = all.indexOf('--');
const args = dd >= 0 ? all.slice(0, dd) : all, firstPrompt = dd >= 0 ? all.slice(dd + 1).join(' ') : null;
const arg = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
// `stop <job>` (2026-11-04): a background session ended by its id, as Claude Code does; the process is the registry's, whatever it is
const inRegistry = job => { const d = join(CLAUDE_DIR, 'sessions'); for (const n of existsSync(d) ? readdirSync(d) : []) { if (!n.endsWith('.json')) continue; try { const r = JSON.parse(readFileSync(join(d, n), 'utf8')); if (r.jobId === job) return { ...r, file: join(d, n) }; } catch {} } return null; };
if (args[0] === 'stop') {
  const r = inRegistry(args[1]); if (!r) { console.error(`no such session: ${args[1]}`); process.exit(1); }
  try { process.kill(r.pid, 'SIGTERM'); } catch {}
  try { unlinkSync(r.file); } catch {}
  process.exit(0);
}
// `attach <job>` (2026-11-04): a background session on this terminal. The client registers nothing, and its end leaves the session running
const attached = args[0] === 'attach' ? inRegistry(args[1]) : null;
if (args[0] === 'attach' && !attached) { console.error(`no such session: ${args[1]}`); process.exit(1); }
// `--session-id <uuid>` (2026-10-31): a new chat under the id the board picked, as Claude Code takes one; with --resume
// only beside --fork-session, as Claude Code refuses it otherwise
if (arg('--session-id') && arg('--resume') && !args.includes('--fork-session')) { console.error('Error: --session-id can only be used with --continue or --resume if --fork-session is also specified.'); process.exit(1); }
// `--resume <id> --fork-session [--session-id <uuid>]`: a copy of that chat under a new id, the chat itself untouched — its
// lines written into the copy's file with its first word, each under the new id and keeping its uuid (2026-11-04, measured:
// until that word there is no file; this wrote it at the start, and what that hid was a chat with no way back)
const forkOf = args.includes('--fork-session') ? arg('--resume') : null;
let sessionId = attached?.sessionId || (forkOf ? arg('--session-id') || randomUUID() : arg('--resume') || arg('--session-id') || randomUUID());
const cwd = process.cwd();
// `--agent <name>` (2026-11-06): the chat as that agent, as Claude Code 2.1.319 takes it — one of the folder's (its
// `.claude/agents` and up, to its git root), yours, an enabled plugin's or its own, else it ends at once saying which there
// are; '' is none, over a folder's settings' own. The transcript's first line says it (`agent-setting`), the registry's
// `agent` the flag's. A resume keeps the transcript's.
const jsonAt = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const mdNames = d => { try { return readdirSync(d).filter(n => n.endsWith('.md')).map(n => (/^name:\s*(\S+)/m.exec(readFileSync(join(d, n), 'utf8')) || [, n.slice(0, -3)])[1]); } catch { return []; } };
const agentFlag = args.includes('--agent') ? arg('--agent') ?? '' : null;
const settings = [join(CLAUDE_DIR, 'settings.json'), join(cwd, '.claude', 'settings.json'), join(cwd, '.claude', 'settings.local.json')].map(jsonAt);
let agent = agentFlag ?? (arg('--resume') && !args.includes('--fork-session') ? null : [2, 1, 0].map(i => settings[i]?.agent).find(a => typeof a === 'string' && a) || null);
if (agentFlag) {
  const known = ['claude', 'Explore', 'general-purpose', 'Plan', 'statusline-setup', ...mdNames(join(CLAUDE_DIR, 'agents'))];
  for (let d = cwd; d !== homedir(); d = dirname(d)) { known.push(...mdNames(join(d, '.claude', 'agents'))); if (existsSync(join(d, '.git')) || dirname(d) === d) break; }
  const plugins = jsonAt(join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'))?.plugins || {};
  for (const [key, on] of Object.entries(Object.assign({}, ...settings.map(s => s?.enabledPlugins || {})))) if (on === true && plugins[key]?.[0]?.installPath) known.push(...mdNames(join(plugins[key][0].installPath, 'agents')).map(n => `${key.split('@')[0]}:${n}`));
  if (!known.includes(agentFlag)) { console.error(`--agent '${agentFlag}' not found. Available agents: ${known.join(', ')}`); process.exit(1); }
}
if (!agent) agent = null;
const slug = cwd.replace(/[/.]/g, '-');
const projDir = join(CLAUDE_DIR, 'projects', slug); let file = join(projDir, `${sessionId}.jsonl`);
const sessDir = join(CLAUDE_DIR, 'sessions'), regFile = join(sessDir, `${process.pid}.json`);
mkdirSync(projDir, { recursive: true }); mkdirSync(sessDir, { recursive: true });
// resumed in another folder than its own (2026-10-19, a chat whose folder is gone): Claude Code finds the transcript by
// its id in whichever project folder has it, one alone, and writes on there
const foundById = id => readdirSync(join(CLAUDE_DIR, 'projects')).map(d => join(CLAUDE_DIR, 'projects', d, `${id}.jsonl`)).filter(f => existsSync(f));
if (arg('--resume') && !forkOf && !existsSync(file)) {
  const found = foundById(sessionId);
  if (found.length === 1) file = found[0];
}
let owedCopy = !forkOf ? null : () => {
  const src = foundById(forkOf)[0];
  if (src) appendFileSync(file, readFileSync(src, 'utf8').split('\n').filter(Boolean).map(l => { try { const j = JSON.parse(l); if ('sessionId' in j) j.sessionId = sessionId; return JSON.stringify(j) + '\n'; } catch { return ''; } }).join(''));
};
const now = () => new Date().toISOString();
let parent = null;
let owedAgent = agent && !(arg('--resume') && !forkOf);   // a new chat's agent, written with its first line
const line = o => { if (owedCopy) { const copy = owedCopy; owedCopy = null; copy(); } if (owedAgent) { owedAgent = false; appendFileSync(file, JSON.stringify({ type: 'agent-setting', agentSetting: agent, sessionId }) + '\n'); } appendFileSync(file, JSON.stringify(o) + '\n'); };
function userLine(text) {
  const uuid = randomUUID();
  line({ parentUuid: parent, isSidechain: false, type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, uuid, timestamp: now(), userType: 'external', entrypoint: 'cli', cwd, sessionId, version: 'fake', gitBranch: 'main' });
  parent = uuid;
}
function assistantLine(text, stop = 'end_turn') {
  const uuid = randomUUID();
  line({ parentUuid: parent, isSidechain: false, type: 'assistant', message: { model: 'fake-1', id: 'msg_' + uuid.slice(0, 8), type: 'message', role: 'assistant', content: [{ type: 'text', text }], stop_reason: stop }, uuid, timestamp: now(), entrypoint: 'cli', cwd, sessionId, version: 'fake' });
  parent = uuid;
}
// FAKE_SCREEN's `replies` (2026-10-16, the README's clips): a prompt's own answer, for the one a clip types
const reply = text => SCREEN?.replies?.[text] ?? `You said: ${text}\n\nThis is the fake claude — one paragraph, one code fence, done.\n\n\`\`\`sh\necho ${JSON.stringify(text)}\n\`\`\``;

// ---- interactive ----
// The registry file, rewritten on each change of state as the real one does: busy for a turn, idle between them.
// procStart as Claude Code writes it (2026-10-14): this process's start as `ps` gives it in UTC, in the C locale — what the
// board holds a pid against before it signals one (sameProcess); without it every check took the no-procStart shortcut.
const t0reg = Date.now();
const procStart = (() => { try { return execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(process.pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' } }).trim(); } catch { return undefined; } })();
const register = (status = 'idle') => attached || writeFileSync(regFile, JSON.stringify({ pid: process.pid, procStart, sessionId, cwd, startedAt: t0reg, version: 'fake', kind: 'interactive', entrypoint: 'cli', name: 'fake-' + basename(cwd), status, statusUpdatedAt: Date.now(), ...agentFlag && { agent: agentFlag } }));
register();
const bye = code => { try { unlinkSync(regFile); } catch {} out(`${FULL ? '\x1b[?1049l' : ''}\x1b[?2004l\x1b[?1004l\x1b[?25h\n`); process.exit(code); };
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => bye(sig === 'SIGHUP' ? 129 : 143));

// What is drawn waits behind an answer to a resize being written (FAKE_ANSWER, below): a chunk ends anywhere, in an escape.
let sink = null;
const out = s => { if (sink) sink.push(s); else process.stdout.write(s); };
const cols = () => process.stdout.columns || 80, rows = () => process.stdout.rows || 24;
const LIVE = 6;                                   // rule, prompt, rule, status ×3
// FAKE_TUI=fullscreen is Claude Code's `tui: fullscreen` (2026-10-11): the alternate screen, the transcript drawn from
// the top under a blank first row and the live region pinned to the bottom, the newest lines kept once it overflows,
// every change a whole repaint (paint). What say() put up since the last commit() the next say() replaces — a reply
// growing in place, as it does there, rather than each step of it scrolling away.
const FULL = process.env.FAKE_TUI === 'fullscreen';
// FAKE_SCREEN=<file.json> (2026-10-11, the README's drawer shot): `{ screen: [lines], status: [three lines] }` drawn in
// place of the banner and the history, and of the status lines under the prompt — the timer still; `replies` (2026-10-16)
// maps a prompt to its answer.
const SCREEN = process.env.FAKE_SCREEN ? JSON.parse(readFileSync(process.env.FAKE_SCREEN, 'utf8')) : null;
// How a resize is answered (2026-11-05). By default the whole region at once, in one write. FAKE_ANSWER=real as Claude
// Code 2.1.318 was measured to: its modes at once, then, FAKE_ANSWER_MS later (6-23 there), ESC[2J and the whole screen
// in chunks of 1020 bytes, FAKE_ANSWER_GAP_MS apart — wider than the real ones (under 1 ms), to land a frame in it.
// FAKE_ANSWER=silent, none at all. FAKE_STREAM_MS a line rewritten that often, however busy a turn can be. A prompt
// `fake real|silent|slow <ms>|stream <ms>` changes them mid-chat.
// FAKE_SIZE_MARK: the size the screen was drawn for on its first and last rows, `<<cols x rows>>`, so a frame says
// what it was drawn for (lib/framewatch.mjs): the wrong size is a stale screen, one mark alone a torn one.
let ANSWER = process.env.FAKE_ANSWER || '', ANSWER_MS = Number(process.env.FAKE_ANSWER_MS ?? 10), STREAM_MS = Number(process.env.FAKE_STREAM_MS || 0);
const ANSWER_GAP = Number(process.env.FAKE_ANSWER_GAP_MS || 0), SIZE_MARK = !!process.env.FAKE_SIZE_MARK;
const sizeMark = () => SIZE_MARK ? `<<${cols()}x${rows()}>>` : '';
let shown = [], mark = 0;
const commit = () => { mark = shown.length; };
const t0 = Date.now();
let input = '', cur = 0, tokens = 12300, dollars = 0;   // the prompt's text and the cursor in it, in code points
const rule = () => '─'.repeat(cols());
const elapsed = () => { const s = Math.floor((Date.now() - t0) / 1000); return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };
const status2prefix = () => `  ctx ${(tokens / 1000).toFixed(1)}K/1.0M ${'▓'.repeat(Math.max(1, Math.round(tokens / 100000)))}${'░'.repeat(10 - Math.max(1, Math.round(tokens / 100000)))} ${Math.round(tokens / 10000)}% | elapsed `;
const status2suffix = () => ` | cost $${dollars.toFixed(2)} | 🧩 fake`;
const at = (row, col) => `\x1b[${row};${col}H`;
/** The live region, drawn whole at the bottom of the screen — what SIGWINCH and every turn end do. A screen that
 *  shrank since the last paint is scrolled up by the difference first (the transcript above the region moves into
 *  scrollback, as under any terminal app), else the erase from the region's new top would eat the transcript's last
 *  lines — which is what the board's tab strip did to the re-attach scenario (2026-09-20). A screen that grew has
 *  the old region's rows cleared too, so no stale rule lingers above the new one. */
let lastRows = 0;
function drawLive() {
  const r = rows();
  if (lastRows > r) out(at(r, 1) + '\n'.repeat(lastRows - r));
  const top = r - LIVE + 1, from = lastRows && lastRows < r ? Math.min(top, lastRows - LIVE + 1) : top;
  lastRows = r;
  // erased from the old region's top, drawn at the bottom: drawn from the old top (2026-10-03), the region sat mid-screen
  // after a grow while the cursor went to the bottom rows — a key typed then landed in the transcript
  out(`\x1b[?25l${at(from, 1)}\x1b[J${at(top, 1)}`);
  out(`\x1b[2m${rule()}\x1b[0m\n`);
  out(`\x1b[1m❯\x1b[0m ${promptText()}\n`);
  out(`\x1b[2m${rule()}\x1b[0m\n`);
  if (SCREEN) out([0, 1, 2].map(i => SCREEN.status?.[i] || '').join('\n'));
  else {
    out(fitW(`  📂 ${basename(cwd)} | 🌿 main | \x1b[32mFake 1\x1b[0m | 💪 \x1b[33mtest\x1b[0m | 🆔 \x1b[35m${sessionId.slice(0, 8)}\x1b[0m`) + "\n");
    out(fitW(`${status2prefix()}${elapsed()}\x1b[33m${status2suffix()}\x1b[0m`) + "\n");
    out(fitW(`${sizeMark()}  \x1b[33m⏵⏵ fake mode on\x1b[0m (shift+tab to cycle) · ← for agents`));
  }
  out(at(top + 1, 3 + cur) + '\x1b[?25h');
}
/** The prompt's text as its one row shows it: a newline (Shift+Enter) as ⏎ — the real one grows the box a row instead. */
const promptText = () => input.replace(/\n/g, '⏎');
/** The prompt's row alone, after an edit: the text, the rest of the row cleared, the cursor where it is in the text. */
function drawPrompt() { const top = rows() - LIVE + 1; out(`${at(top + 1, 1)}\x1b[2K\x1b[1m❯\x1b[0m ${promptText()}${at(top + 1, 3 + cur)}`); }
/** A line of FAKE_SCREEN's wrapped at its words to the width, the rest under its text — after a ⏺, a >, a ⎿ or a list's
 *  dash —, as Claude Code wraps; its colours carry over, the terminal keeping them across the rows. */
const visible = l => [...l.replace(/\x1b\[[0-9;]*m/g, '')].length;
function wrapScreen(l, w) {
  if (visible(l) <= w) return [l];
  const ind = ' '.repeat(/^\s*(?:(?:⏺|>|⎿|-)\s+)?/.exec(l.replace(/\x1b\[[0-9;]*m/g, ''))[0].length), out = [];
  let cur = null;
  for (const word of l.split(' ')) {
    if (cur !== null && visible(cur.trim()) && visible(cur) + 1 + visible(word) > w) { out.push(cur); cur = ind + word; }
    else cur = cur === null ? word : cur + ' ' + word;
  }
  return [...out, cur];
}
/** Under the mark, a status line no wider than the screen: one that wraps scrolls the mark off the top. */
const fitW = l => SIZE_MARK ? clipTo(l, cols() - 4) : l;   // four for the wide glyphs, which count one here
/** A line cut at the width, its escapes all kept. */
function clipTo(l, w) { let n = 0, o = ''; for (const part of l.split(/(\x1b\[[0-9;]*m)/)) { if (part.startsWith('\x1b')) { o += part; continue; } for (const ch of part) if (n < w) { o += ch; n++; } } return o; }
function paint() {
  // under the mark, every line within the width (2026-11-05): the real one never lets a line wrap, and an autowrapped row
  // drawn over is one the serialize addon brings back wrong, in the holder's snapshot the soak compares with
  const all = SCREEN ? shown.flatMap(l => wrapScreen(l, cols())) : SIZE_MARK ? shown.map(l => clipTo(l, cols())) : shown;
  const view = all.slice(Math.max(0, all.length - (rows() - LIVE - 1)));
  out(`\x1b[?25l\x1b[H\x1b[2J${sizeMark()}${view.map((l, i) => at(i + 2, 1) + l).join('')}`);
  lastRows = 0; drawLive();
}
/** Only the timer's cells — Claude Code's status bar does the same, so a replay that starts after the paint shows lone digits. */
function tick() {
  if (SCREEN) return;
  const col = status2prefix().length + 1;
  if (SIZE_MARK && col + 8 > cols() - 4) return;   // its cells cut off the line: written past the edge, they would wrap onto the mark
  out(`\x1b7${at(rows() - 1, col)}${elapsed()}\x1b8`);
}
/** Transcript text goes above the live region: erase it, print, make room, draw it again at the bottom. */
function say(lines) {
  if (FULL) { shown.splice(mark, Infinity, ...lines); return paint(); }
  out(`${at(rows() - LIVE + 1, 1)}\x1b[J`);
  out(lines.join('\n') + '\n' + '\n'.repeat(LIVE - 1));
  drawLive();
}
async function turn(text) {
  const knob = /^fake (real|silent|slow|stream)(?: (\d+))?$/.exec(text);
  if (knob) { const [, k, n] = knob; if (k === 'stream') stream(Number(n)); else { ANSWER = k === 'slow' ? 'real' : k; if (k === 'slow') ANSWER_MS = Number(n); else ANSWER_MS = 10; } }
  register('busy');
  userLine(text);
  say([...text.split('\n').map((l, i) => `${i ? '  ' : '\x1b[36m>\x1b[0m '}${l}`), '']); commit();
  tokens += 900 + text.length * 7; dollars += 0.01;
  const r = reply(text);
  const chunks = r.split('\n');
  const acc = [];
  // `slow <s>` keeps the turn going that many seconds — a chat that stays clauding, for the tiles' and the overview's tests
  const slow = /^slow (\d+)/.exec(text); if (slow) { say(['\x1b[2m✻ Working slowly…\x1b[0m']); await new Promise(res => setTimeout(res, Math.min(600, +slow[1]) * 1000)); }
  for (const c of chunks) { acc.push(c); say(['\x1b[2m● fake is thinking…\x1b[0m', ...acc]); await new Promise(res => setTimeout(res, 60)); }
  assistantLine(r);
  register('idle');
  say([`\x1b[32m●\x1b[0m ${chunks[0]}`, ...chunks.slice(1), '', `\x1b[2m✻ Done in ${elapsed()}\x1b[0m`]); commit();
}
/** /compact, as Claude Code 2.1.28x writes it: the typed command as a plain prompt line first (no tags — it reads as a
 *  prompt), busy while it summarises, then the boundary, the summary, the command's own tagged lines — and no
 *  assistant line, so no end_turn (2026-09-29: the card stayed clauding after it). */
async function compact() {
  register('busy');
  userLine('/compact');
  say([`\x1b[36m>\x1b[0m /compact`, '\x1b[2m✻ Compacting conversation…\x1b[0m']);
  await new Promise(res => setTimeout(res, 600));
  const base = () => ({ isSidechain: false, timestamp: now(), uuid: randomUUID(), userType: 'external', entrypoint: 'cli', cwd, sessionId, version: 'fake', gitBranch: 'main' });
  line({ ...base(), parentUuid: null, type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', level: 'info' });
  line({ ...base(), type: 'user', isCompactSummary: true, isVisibleInTranscriptOnly: true, message: { role: 'user', content: 'This session is being continued from a previous conversation that ran out of context.' } });
  line({ ...base(), type: 'user', isMeta: true, message: { role: 'user', content: '<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>' } });
  line({ ...base(), type: 'user', message: { role: 'user', content: '<command-name>/compact</command-name>\n            <command-message>compact</command-message>\n            <command-args></command-args>' } });
  line({ ...base(), type: 'user', message: { role: 'user', content: '<local-command-stdout>Compacted (ctrl+o to see full summary)</local-command-stdout>' } });
  register('idle');
  say(['\x1b[2mCompacted (ctrl+o to see full summary)\x1b[0m', '']); commit();
}

process.stdin.setRawMode?.(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
out('\x1b[?2004h\x1b[?1004h');   // bracketed paste, focus reporting — the modes the real one sets; the snapshot must carry them
// History on resume: the transcript's last turns, the way Claude Code prints them back.
const history = [];
if (existsSync(file)) for (const raw of readFileSync(file, 'utf8').split('\n')) { try { const j = JSON.parse(raw); if (j.type === 'agent-setting' && agentFlag === null) agent = j.agentSetting || null; const t = j.message?.content?.find?.(c => c.type === 'text')?.text; if (t && (j.type === 'user' || j.type === 'assistant')) history.push(`${j.type === 'user' ? '\x1b[36m>\x1b[0m' : '\x1b[32m●\x1b[0m'} ${t.split('\n')[0].slice(0, 200)}`); } catch {} }
out(`${FULL ? '\x1b[?1049h' : ''}\x1b[2J\x1b[H`);
say(SCREEN ? SCREEN.screen : [`\x1b[1mfake claude\x1b[0m · session ${sessionId}${forkOf ? ` (a branch of ${forkOf.slice(0, 8)})` : arg('--resume') ? ' (resumed)' : ''}${agent ? ` · as @${agent}` : ''} · ${cwd}`, ...history.slice(-8), '']); commit();
/** /clear, as Claude Code does it: the same process goes on under a new session id — the registry file says so — with a
 *  fresh transcript and the screen started over. The board must follow the pid to the new chat (2026-09-20). The new
 *  transcript is written at once with the command's own lines — a caveat, the command, its empty output — which are
 *  no one's word (2026-09-28: the board took a chat with a file for one with a start, and the card sank to the bottom);
 *  the file comes before the registry says so, the order the board has to survive. */
function clearSession() {
  sessionId = randomUUID(); file = join(projDir, `${sessionId}.jsonl`); parent = null; tokens = 12300; dollars = 0; owedAgent = !!agent;   // /clear keeps the agent
  const base = () => ({ isSidechain: false, timestamp: now(), uuid: randomUUID(), userType: 'external', entrypoint: 'cli', cwd, sessionId, version: 'fake', gitBranch: 'main' });
  line({ ...base(), parentUuid: null, type: 'user', isMeta: true, message: { role: 'user', content: '<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>' } });
  line({ ...base(), type: 'user', message: { role: 'user', content: '<command-name>/clear</command-name>\n            <command-message>clear</command-message>\n            <command-args></command-args>' } });
  line({ ...base(), type: 'system', subtype: 'local_command', content: '<local-command-stdout></local-command-stdout>', level: 'info' });
  register();
  out('\x1b[2J\x1b[H'); shown = []; mark = 0;
  say([`\x1b[1mfake claude\x1b[0m · session ${sessionId} (cleared) · ${cwd}`, '']); commit();
}
/** /resume <id> (2026-11-04): the same process goes on under that chat's id, and nothing refuses one already running elsewhere. */
function resumeSession(id) {
  const found = foundById(id)[0]; if (!found) { say([`No conversation found with session ID: ${id}`, '']); commit(); return; }
  sessionId = id; file = found; owedCopy = null; register();
  say([`\x1b[1mfake claude\x1b[0m · session ${sessionId} (resumed) · ${cwd}`, '']); commit();
}
setInterval(tick, 1000);
let answering = 0;
function answerResize() {
  const draw = FULL ? paint : drawLive;
  if (ANSWER === 'silent') return;
  if (!ANSWER) return draw();
  const gen = ++answering;
  out('\x1b[?2004h');
  setTimeout(() => {
    if (gen !== answering) return;
    const queued = sink || [];   // behind the answer this one replaces
    sink = []; draw(); const parts = [...sink, ...queued].join('').match(/[\s\S]{1,1020}/gu) || []; sink = [];
    const next = i => {
      if (gen !== answering) return;
      if (i === parts.length) { const q = sink; sink = null; for (const x of q) out(x); return; }
      process.stdout.write(parts[i]);
      if (ANSWER_GAP) setTimeout(next, ANSWER_GAP, i + 1); else setImmediate(next, i + 1);
    };
    next(0);
  }, ANSWER_MS);
}
process.stdout.on('resize', answerResize);
let streamed = 0, streamer = 0;
function stream(ms) { clearInterval(streamer); STREAM_MS = ms; if (ms) streamer = setInterval(() => out(`\x1b7${at(2, 1)}stream ${++streamed}\x1b8`), ms); }
stream(STREAM_MS);
let ctrlC = 0, busy = false, focusView = false;
// The keys, read as a terminal app reads them (2026-10-14): escape sequences whole — focus reports, arrows and the
// edit keys, a bracketed paste —, Shift+Enter (the drawer's ESC CR) a newline in the prompt, the line-editing keys the
// drawer sends for the Mac's (⌃A ⌃E ⌃U ⌃K, ESC b / f / d, ESC DEL) acted on. Before, every ESC was dropped and the rest
// of its sequence typed — so a typed I, O or [ was dropped too, as the tail of a focus report, and ESC CR was Enter.
const cps = () => [...input];
const edit = (from, to, text = '') => { const c = cps(); c.splice(from, to - from, ...text); input = c.join(''); cur = from + [...text].length; };
const isWord = ch => /[\p{L}\p{N}_]/u.test(ch || '');
const lineStart = () => { const c = cps(); let i = cur; while (i > 0 && c[i - 1] !== '\n') i--; return i; };
const lineEnd = () => { const c = cps(); let i = cur; while (i < c.length && c[i] !== '\n') i++; return i; };
const wordBack = () => { const c = cps(); let i = cur; while (i > 0 && !isWord(c[i - 1])) i--; while (i > 0 && isWord(c[i - 1])) i--; return i; };
const wordAhead = () => { const c = cps(); let i = cur; while (i < c.length && !isWord(c[i])) i++; while (i < c.length && isWord(c[i])) i++; return i; };
const CSI = /^\x1b\[([0-9;?]*)[\x20-\x2f]*([\x40-\x7e])/;
let pasting = false;
async function submit() {
  const text = input.trim(); input = ''; cur = 0;
  if (text === '/exit' || text === '/quit') bye(0);
  if (text === '/clear') return clearSession();
  if (text.startsWith('/resume ')) return resumeSession(text.slice(8).trim());
  if (text === '/compact' && !busy) { busy = true; await compact(); busy = false; return; }
  // /focus, the view toggle the board's header button types in (2026-09-20): the real one answers with exactly
  // this line, and the board reads it back off the screen to know which way it went.
  if (text === '/focus') { focusView = !focusView; say([`\x1b[2mFocus view ${focusView ? 'enabled' : 'disabled'}\x1b[0m`, '']); commit(); return; }
  if (text && !busy) { busy = true; await turn(text); busy = false; } else drawLive();
}
if (firstPrompt?.trim()) setTimeout(async () => { busy = true; await turn(firstPrompt.trim()); busy = false; }, 150);
process.stdin.on('data', async d => {
  const was = input, wasAt = cur;
  for (let i = 0; i < d.length;) {
    const rest = d.slice(i), ch = String.fromCodePoint(rest.codePointAt(0));   // a whole code point: an emoji is two halves
    if (pasting) {   // a bracketed paste is text, its newlines too, up to its end
      const end = rest.indexOf('\x1b[201~');
      const text = (end < 0 ? rest : rest.slice(0, end)).replace(/\r\n?/g, '\n');
      edit(cur, cur, text); i += end < 0 ? rest.length : end + 6; if (end >= 0) pasting = false; continue;
    }
    if (ch === '\x1b') {
      const csi = CSI.exec(rest);
      if (csi) {
        const [all, arg, fin] = csi;
        if (fin === 'D') cur = Math.max(0, cur - 1); else if (fin === 'C') cur = Math.min(cps().length, cur + 1);
        else if (fin === 'H') cur = lineStart(); else if (fin === 'F') cur = lineEnd();
        else if (fin === '~' && arg === '3') edit(cur, Math.min(cps().length, cur + 1));
        else if (fin === '~' && (arg === '1' || arg === '7')) cur = lineStart(); else if (fin === '~' && (arg === '4' || arg === '8')) cur = lineEnd();
        else if (fin === '~' && arg === '200') pasting = true;
        i += all.length; continue;   // the rest — a focus report (I, O), up and down, a paste's end out of place — is nothing to the prompt
      }
      const next = rest[1];
      if (next === 'O' && rest.length > 2) {   // SS3: the arrows in the application mode
        const fin = rest[2];
        if (fin === 'D') cur = Math.max(0, cur - 1); else if (fin === 'C') cur = Math.min(cps().length, cur + 1); else if (fin === 'H') cur = lineStart(); else if (fin === 'F') cur = lineEnd();
        i += 3; continue;
      }
      if (next === '\r') edit(cur, cur, '\n');   // Shift+Enter, as the drawer sends it: a newline, not a send
      else if (next === '\x7f' || next === '\b') edit(wordBack(), cur);   // ⌥⌫
      else if (next === 'b') cur = wordBack(); else if (next === 'f') cur = wordAhead();   // ⌥← ⌥→, Meta as readline has them
      else if (next === 'd') edit(cur, wordAhead());   // ⌥⌦
      i += next === undefined ? 1 : 2; continue;   // a lone ESC, or Meta with any other key: nothing
    }
    i += ch.length;
    if (ch === '\x03') { if (++ctrlC >= 2) bye(0); continue; }
    if (ch === '\x04') bye(0);
    if (ch === '\r' || ch === '\n') { await submit(); continue; }
    if (ch === '\x01') { cur = lineStart(); continue; }   // ⌃A, ⌘← in the drawer
    if (ch === '\x05') { cur = lineEnd(); continue; }   // ⌃E, ⌘→
    if (ch === '\x15') { edit(lineStart(), cur); continue; }   // ⌃U, ⌘⌫
    if (ch === '\x0b') { edit(cur, lineEnd()); continue; }   // ⌃K, ⌘⌦
    if (ch === '\x7f' || ch === '\b') { if (cur > 0) edit(cur - 1, cur); continue; }
    if (ch >= ' ') edit(cur, cur, ch);
  }
  if (input !== was || cur !== wasAt) drawPrompt();
});
