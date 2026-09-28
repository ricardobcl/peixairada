#!/usr/bin/env node
// A stand-in for `claude` in tests: the shapes of the real thing that the board depends on, none of the cost.
//   fakeclaude.mjs [--resume <id>] [-p <text>]      (what the server passes: --resume, or -p for a one-shot reply)
// It registers in $CLAUDE_DIR/sessions/<pid>.json like the CLI, appends user/assistant lines to the chat's
// transcript under $CLAUDE_DIR/projects/<slug>/<id>.jsonl, and draws a TUI the way Claude Code does: the
// transcript scrolls above, a live region sits at the bottom (rule · prompt · rule · three status lines), the
// status timer rewrites only its own cells every second, and a resize (SIGWINCH) repaints the whole region —
// which is exactly the behaviour behind the truncated-replay bug of 2026-09-20, and what the drawer tests need.
// It refuses to run without CLAUDE_DIR set to something other than ~/.claude: it must never write the real one.
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const CLAUDE_DIR = process.env.CLAUDE_DIR;
if (!CLAUDE_DIR || CLAUDE_DIR === join(homedir(), '.claude')) { console.error('fakeclaude: CLAUDE_DIR must point at a fixture, never the real ~/.claude'); process.exit(2); }
const args = process.argv.slice(2);
const arg = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
let sessionId = arg('--resume') || randomUUID();
const oneShot = arg('-p');
const cwd = process.cwd();
const slug = cwd.replace(/[/.]/g, '-');
const projDir = join(CLAUDE_DIR, 'projects', slug); let file = join(projDir, `${sessionId}.jsonl`);
const sessDir = join(CLAUDE_DIR, 'sessions'), regFile = join(sessDir, `${process.pid}.json`);
mkdirSync(projDir, { recursive: true }); mkdirSync(sessDir, { recursive: true });
const now = () => new Date().toISOString();
let parent = null;
const line = o => { appendFileSync(file, JSON.stringify(o) + '\n'); };
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
const reply = text => `You said: ${text}\n\nThis is the fake claude — one paragraph, one code fence, done.\n\n\`\`\`sh\necho ${JSON.stringify(text)}\n\`\`\``;

if (oneShot !== null) {   // `claude --resume <id> -p <text>`: append the turn, print the answer, exit
  userLine(oneShot); const r = reply(oneShot); assistantLine(r); process.stdout.write(r + '\n'); process.exit(0);
}

// ---- interactive ----
writeFileSync(regFile, JSON.stringify({ pid: process.pid, sessionId, cwd, startedAt: Date.now(), version: 'fake', kind: 'interactive', entrypoint: 'cli', name: 'fake-' + basename(cwd), status: 'idle' }));
const bye = code => { try { unlinkSync(regFile); } catch {} out('\x1b[?2004l\x1b[?1004l\x1b[?25h\n'); process.exit(code); };
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => bye(sig === 'SIGHUP' ? 129 : 143));

const out = s => process.stdout.write(s);
const cols = () => process.stdout.columns || 80, rows = () => process.stdout.rows || 24;
const LIVE = 6;                                   // rule, prompt, rule, status ×3
const t0 = Date.now();
let input = '', tokens = 12300, dollars = 0;
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
  out(`\x1b[?25l${at(from, 1)}\x1b[J`);
  out(`\x1b[2m${rule()}\x1b[0m\n`);
  out(`\x1b[1m❯\x1b[0m ${input}\n`);
  out(`\x1b[2m${rule()}\x1b[0m\n`);
  out(`  📂 ${basename(cwd)} | 🌿 main | \x1b[32mFake 1\x1b[0m | 💪 \x1b[33mtest\x1b[0m | 🆔 \x1b[35m${sessionId.slice(0, 8)}\x1b[0m\n`);
  out(`${status2prefix()}${elapsed()}\x1b[33m${status2suffix()}\x1b[0m\n`);
  out(`  \x1b[33m⏵⏵ fake mode on\x1b[0m (shift+tab to cycle) · ← for agents`);
  out(at(top + 1, 3 + [...input].length) + '\x1b[?25h');
}
/** Only the timer's cells — Claude Code's status bar does the same, so a replay that starts after the paint shows lone digits. */
function tick() {
  const col = status2prefix().length + 1;
  out(`\x1b7${at(rows() - 1, col)}${elapsed()}\x1b8`);
}
/** Transcript text goes above the live region: erase it, print, make room, draw it again at the bottom. */
function say(lines) {
  out(`${at(rows() - LIVE + 1, 1)}\x1b[J`);
  out(lines.join('\n') + '\n' + '\n'.repeat(LIVE - 1));
  drawLive();
}
async function turn(text) {
  userLine(text);
  say([`\x1b[36m>\x1b[0m ${text}`, '']);
  tokens += 900 + text.length * 7; dollars += 0.01;
  const r = reply(text);
  const chunks = r.split('\n');
  const acc = [];
  for (const c of chunks) { acc.push(c); say(['\x1b[2m● fake is thinking…\x1b[0m', ...acc]); await new Promise(res => setTimeout(res, 60)); }
  assistantLine(r);
  say([`\x1b[32m●\x1b[0m ${chunks[0]}`, ...chunks.slice(1), '', `\x1b[2m✻ Done in ${elapsed()}\x1b[0m`]);
}

process.stdin.setRawMode?.(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
out('\x1b[?2004h\x1b[?1004h');   // bracketed paste, focus reporting — the modes the real one sets; the snapshot must carry them
// History on resume: the transcript's last turns, the way Claude Code prints them back.
const history = [];
if (existsSync(file)) for (const raw of readFileSync(file, 'utf8').split('\n')) { try { const j = JSON.parse(raw); const t = j.message?.content?.find?.(c => c.type === 'text')?.text; if (t && (j.type === 'user' || j.type === 'assistant')) history.push(`${j.type === 'user' ? '\x1b[36m>\x1b[0m' : '\x1b[32m●\x1b[0m'} ${t.split('\n')[0].slice(0, 200)}`); } catch {} }
out('\x1b[2J\x1b[H');
say([`\x1b[1mfake claude\x1b[0m · session ${sessionId}${arg('--resume') ? ' (resumed)' : ''} · ${cwd}`, ...history.slice(-8), '']);
/** /clear, as Claude Code does it: the same process goes on under a new session id — the registry file says so — with a
 *  fresh transcript and the screen started over. The board must follow the pid to the new chat (2026-09-20). The new
 *  transcript is written at once with the command's own lines — a caveat, the command, its empty output — which are
 *  no one's word (2026-09-28: the board took a chat with a file for one with a start, and the card sank to the bottom);
 *  the file comes before the registry says so, the order the board has to survive. */
function clearSession() {
  sessionId = randomUUID(); file = join(projDir, `${sessionId}.jsonl`); parent = null; tokens = 12300; dollars = 0;
  const base = () => ({ isSidechain: false, timestamp: now(), uuid: randomUUID(), userType: 'external', entrypoint: 'cli', cwd, sessionId, version: 'fake', gitBranch: 'main' });
  line({ ...base(), parentUuid: null, type: 'user', isMeta: true, message: { role: 'user', content: '<local-command-caveat>Caveat: The messages below were generated by the user while running local commands.</local-command-caveat>' } });
  line({ ...base(), type: 'user', message: { role: 'user', content: '<command-name>/clear</command-name>\n            <command-message>clear</command-message>\n            <command-args></command-args>' } });
  line({ ...base(), type: 'system', subtype: 'local_command', content: '<local-command-stdout></local-command-stdout>', level: 'info' });
  writeFileSync(regFile, JSON.stringify({ pid: process.pid, sessionId, cwd, startedAt: Date.now(), version: 'fake', kind: 'interactive', entrypoint: 'cli', name: 'fake-' + basename(cwd), status: 'idle' }));
  out('\x1b[2J\x1b[H');
  say([`\x1b[1mfake claude\x1b[0m · session ${sessionId} (cleared) · ${cwd}`, '']);
}
const timer = setInterval(tick, 1000);
process.stdout.on('resize', drawLive);
let ctrlC = 0, busy = false, focusView = false;
process.stdin.on('data', async d => {
  for (const ch of d) {
    if (ch === '\x03') { if (++ctrlC >= 2) bye(0); continue; }
    if (ch === '\x04') bye(0);
    if (ch === '\x1b') continue;   // escape sequences (focus in/out, arrows) are ignored; the rest of a multi-byte one arrives as its own chars
    if (ch === '\r' || ch === '\n') {
      const text = input.trim(); input = '';
      if (text === '/exit' || text === '/quit') bye(0);
      if (text === '/clear') { clearSession(); continue; }
      // /focus, the view toggle the board's header button types in (2026-09-20): the real one answers with exactly
      // this line, and the board reads it back off the screen to know which way it went.
      if (text === '/focus') { focusView = !focusView; say([`\x1b[2mFocus view ${focusView ? 'enabled' : 'disabled'}\x1b[0m`, '']); continue; }
      if (text && !busy) { busy = true; await turn(text); busy = false; } else drawLive();
      continue;
    }
    if (ch === '\x7f' || ch === '\b') { input = [...input].slice(0, -1).join(''); drawLive(); continue; }
    if (ch >= ' ' && !/[\[IO]/.test(ch) || ch > '\x7f') { input += ch; out(ch); }   // `[`, I, O arrive as tails of focus sequences
  }
});
