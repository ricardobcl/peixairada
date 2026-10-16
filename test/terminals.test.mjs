// The drawers end to end, no browser: a throwaway server with the fake claude, a fixture chat resumed in a holder,
// the socket's snapshot, a server restart with the holder alive under it, adoption, and the kill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alive, sleep, startTestServer, tmpDir, waitFor } from '../lib/testserver.mjs';
import { defaultFixture } from '../scripts/fixture.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** Attach like the page does: the first binary frame is the snapshot; `until` stops when a text is seen. `p.opened`
 *  is the socket open — a send before it throws — and `p.text()` what has come so far. */
function attach(url, id, { until = null, timeout = 8000 } = {}) {
  const ws = new WebSocket(`${url.replace(/^http/, 'ws')}api/terminals/${id}/ws`); ws.binaryType = 'arraybuffer';
  ws.send2 = m => ws.send(JSON.stringify(m));
  let first = null, all = '', exit = null;
  const opened = new Promise(res => ws.addEventListener('open', res, { once: true }));
  const p = new Promise(res => {
    const finish = () => { clearTimeout(t); try { ws.close(); } catch {} res({ first, all, exit }); };
    const t = setTimeout(finish, timeout);
    ws.onmessage = e => {
      if (typeof e.data === 'string') { const m = JSON.parse(e.data); if (m.t === 'exit') exit = m.code; return; }
      const s = Buffer.from(e.data).toString('utf8'); if (first === null) first = s; all += s;
      if (until && all.includes(until)) finish();
    };
    ws.onerror = () => {}; ws.onclose = () => { if (first !== null) finish(); };
  });
  Object.assign(p, { ws, opened, text: () => all });
  return p;
}

test('a drawer runs in a holder, gives a page a snapshot, survives a server restart, and ends on DELETE', { timeout: 60_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const chat = fx.chats[1];
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  try {
    const list = await srv.api('api/sessions');
    assert.ok(list.body.sessions.some(s => s.id === chat.id), 'the fixture chat is on the board');
    // resume it in a drawer
    const r = await srv.api(`api/sessions/${chat.id}/terminal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cols: 100, rows: 30 }) });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const t = r.body.terminal;
    assert.ok(t.pid > 0 && t.holderPid > 0 && t.holderPid !== t.pid, 'the PTY and the holder have their own pids');
    assert.ok(alive(t.holderPid) && alive(t.pid));
    assert.deepEqual(readdirSync(join(srv.dir, 'terms')).filter(f => f.startsWith(t.id)).sort(), [`${t.id}.json`, `${t.id}.log`, `${t.id}.sock`]);
    // the fake registers → the chat is alive, with the drawer's process as its own
    await waitFor(async () => { const s = (await srv.api('api/sessions')).body.sessions.find(s => s.id === chat.id); return s.alive && s.live?.pid === t.pid && s.terminal?.id === t.id; }, { what: 'the resumed chat alive with the drawer as its process' });
    // a page attaches: the first frame is the whole screen (the fake's prompt and status), not a byte replay — once the
    // fake has drawn, which it does right after it registers
    const a1 = await waitFor(async () => { const a = await attach(srv.url, t.id, { until: 'fake mode on', timeout: 1500 }); return a.first?.includes('fake mode on') && a; }, { what: 'a snapshot of the drawn screen' });
    assert.ok(a1.first.includes('❯') && a1.first.includes('fake mode on'), 'the snapshot carries the prompt and the status bar');
    assert.ok(a1.first.includes('\x1b[?2004h'), 'the snapshot carries the modes the program set');
    const snapLog = srv.logText().match(/screen snapshot (\d+) chars, (\d+)×(\d+)/);
    assert.ok(snapLog && Number(snapLog[2]) === 100 && Number(snapLog[3]) === 30, 'the server logged the snapshot at the PTY size');
    const sum1 = (await srv.terminals()).find(x => x.id === t.id);
    assert.equal(sum1.cols, 100); assert.equal(sum1.connected, true); assert.ok(sum1.lastSnapshotChars > 100);
    // restart the server: the holder and the fake stay, the new server adopts them, the screen is still there
    await srv.restart();
    assert.ok(alive(t.holderPid) && alive(t.pid), 'the holder and its claude outlive the server');
    const adopted = (await srv.terminals()).find(x => x.id === t.id);
    assert.ok(adopted, 'the new server lists the drawer');
    assert.equal(adopted.pid, t.pid); assert.equal(adopted.sessionId, chat.id); assert.equal(adopted.exited, null);
    assert.match(srv.logText(), /adopted — pid \d+, holder \d+, chat/);
    const a2 = await attach(srv.url, t.id, { until: 'fake mode on' });
    assert.ok(a2.first.includes('❯'), 'a page attaching after the restart gets the screen');
    const s2 = (await srv.api('api/sessions')).body.sessions.find(s => s.id === chat.id);
    assert.equal(s2.terminal?.id, t.id, 'the chat still points at its drawer');
    // type through the new server and see the fake answer
    const p = attach(srv.url, t.id, { until: 'You said: ping', timeout: 8000 });
    await p.opened; p.ws.send2({ t: 'in', d: 'ping\r' });
    const a3 = await p;
    assert.ok(a3.all.includes('You said: ping'), 'input reaches the PTY through the adopted holder');
    // end it: the fake exits, the registry entry goes, the holder lingers with the exit code then is let go
    const d = await srv.api(`api/terminals/${t.id}`, { method: 'DELETE' });
    assert.equal(d.status, 200);
    await waitFor(async () => (await srv.terminals()).find(x => x.id === t.id)?.exited != null, { what: 'the terminal reporting its exit' });
    assert.ok(!alive(t.pid), 'the fake is gone');
    const d2 = await srv.api(`api/terminals/${t.id}`, { method: 'DELETE' });   // an exited one is let go at once
    assert.equal(d2.status, 200);
    await waitFor(async () => !(await srv.terminals()).some(x => x.id === t.id), { what: 'the exited drawer forgotten' });
    await waitFor(() => !existsSync(join(srv.dir, 'terms', `${t.id}.sock`)), { what: 'the holder removing its socket' });
  } finally { await srv.stop(); }
});

test('a new chat in a folder is tied to its session by pid when the fake registers', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  try {
    const r = await srv.api('api/terminals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cwd: process.cwd(), cols: 90, rows: 24 }) });
    assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.terminal.sessionId, null);
    const linked = await waitFor(async () => (await srv.terminals()).find(x => x.id === r.body.terminal.id)?.sessionId || null, { what: 'the terminal learning its session id from the registry' });
    const meta = srv.holders().find(h => h.id === r.body.terminal.id);
    assert.equal(meta.sessionId, linked, 'and told its holder, so an adoption after a restart knows it too');
  } finally { await srv.stop(); }
});

test('a chat in no folder (2026-10-14): the board\'s own folder, made for the first chat and again for a resume after it was deleted', { timeout: 40_000 }, async () => {
  const srv = await startTestServer({ fake: true });
  const scratch = join(realpathSync(srv.dir), 'no folder');
  try {
    assert.equal(existsSync(scratch), false, 'nothing made before a chat asks for it');
    const r = await srv.post('api/terminals', { cwd: scratch, cols: 90, rows: 24 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.ok(existsSync(scratch), 'made for it');
    const id = await waitFor(async () => (await srv.terminals()).find(x => x.id === r.body.terminal.id)?.sessionId || null, { what: 'the chat registered' });
    const s = await waitFor(async () => (await srv.api('api/sessions')).body.sessions.find(x => x.id === id && x.alive), { what: 'its card' });
    assert.deepEqual([s.cwd, s.project], [scratch, 'no folder'], 'claude runs there, and the project reads so');
    await srv.api(`api/terminals/${r.body.terminal.id}`, { method: 'DELETE' });
    await waitFor(async () => !(await srv.api('api/sessions')).body.sessions.find(x => x.id === id)?.alive, { what: 'its claude ended' });
    rmSync(scratch, { recursive: true, force: true });
    const again = await srv.post(`api/sessions/${id}/terminal`, { cols: 90, rows: 24 });
    assert.equal(again.status, 201, JSON.stringify(again.body));
    assert.ok(existsSync(scratch), 'made again for the resume');
  } finally { await srv.stop(); }
});

test('a launcher: a folder whose Taskfile launches claude lists it, a new chat there runs `task <name>`, and the chat is tied to the drawer by descent', { timeout: 40_000 }, async () => {
  const cwd = tmpDir('peix-tf-'); writeFileSync(join(cwd, 'Taskfile.yml'), 'version: "3"\n');   // the fake task never reads it; the server looks for it
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: cwd });
  const ran = join(tmpDir('peix-task-'), 'runs'), runs = () => existsSync(ran) ? readFileSync(ran, 'utf8').trim().split('\n') : [];
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true, env: { TASK_BIN: join(ROOT, 'scripts', 'faketask.mjs'), FAKE_TASK_LOG: ran } });
  const post = body => srv.post('api/terminals', body);
  try {
    const none = await srv.api(`api/launchers?cwd=${encodeURIComponent(process.cwd())}`);
    assert.deepEqual(none.body.launchers, [], 'a folder without a Taskfile has no launchers');
    // its Taskfile is the folder's code: not run before Claude Code trusts the folder (2026-10-16)
    const shut = await srv.api(`api/launchers?cwd=${encodeURIComponent(cwd)}`);
    assert.deepEqual([shut.body.launchers, shut.body.untrusted], [[], true], 'a folder Claude Code has not trusted has none, and says why');
    const refused = await post({ cwd, task: 'production-workload' });
    assert.equal(refused.status, 400); assert.match(refused.body.error, /Claude Code has not trusted the folder/);
    assert.deepEqual(runs(), [], 'and task was never run there');
    assert.match(srv.logText(), /its Taskfile is not asked for launchers — Claude Code has not trusted the folder/);
    writeFileSync(join(fx.dir, '.claude.json'), JSON.stringify({ projects: { [realpathSync(dirname(cwd))]: { hasTrustDialogAccepted: true } } }));   // the folder above it, as Claude Code takes it
    const l = await srv.api(`api/launchers?cwd=${encodeURIComponent(cwd)}`);
    assert.equal(l.body.untrusted, false); assert.deepEqual(runs(), ['--list --json'], 'trusted, task is asked');
    assert.deepEqual(l.body.launchers, [{ name: 'production-workload', desc: 'Launch Claude Code against the production workload cluster' }], 'only the task whose description mentions Claude');
    assert.equal((await srv.api('api/launchers?cwd=relative')).status, 400);
    const bad = await post({ cwd, task: 'setup' });
    assert.equal(bad.status, 400); assert.match(bad.body.error, /no launcher named setup/);
    const r = await post({ cwd, task: 'production-workload', cols: 90, rows: 24 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const t = r.body.terminal;
    assert.equal(t.task, 'production-workload'); assert.equal(t.sessionId, null);
    assert.match(srv.logText(), /terminal t\d+-\w+: task production-workload in/);
    const linked = await waitFor(async () => (await srv.terminals()).find(x => x.id === t.id)?.sessionId || null, { what: 'the terminal learning its session id although claude is not the PTY\'s process' });
    const s = (await srv.api('api/sessions')).body.sessions.find(s => s.id === linked);
    assert.ok(s.alive, 'the chat is alive'); assert.notEqual(s.live.pid, t.pid, 'with a claude below task, not task itself'); assert.equal(s.terminal?.id, t.id, 'and the drawer is its');
    const meta = srv.holders().find(h => h.id === t.id);
    assert.equal(meta.task, 'production-workload'); assert.equal(meta.claudePid, s.live.pid, 'the holder was told claude\'s pid, for an adoption after a restart');
    const a = await attach(srv.url, t.id, { until: 'fake mode on' });
    assert.ok(a.all.includes('❯'), 'a page attaching sees claude\'s prompt through task');
    // /clear there: the same claude under a new id — and claude is not the PTY's process, task is (2026-10-03: the
    // drawer stayed on the old chat, and the new one read as live in another terminal)
    const p = attach(srv.url, t.id, { timeout: 3000 }); await p.opened; p.ws.send2({ t: 'in', d: '/clear\r' });
    const moved = await waitFor(async () => { const id = (await srv.terminals()).find(x => x.id === t.id)?.sessionId; return id !== linked && id; }, { what: 'the drawer following /clear to the new chat' });
    const s2 = (await srv.api('api/sessions')).body.sessions.find(s => s.id === moved);
    assert.equal(s2.terminal?.id, t.id, 'the new chat has the drawer'); assert.equal(s2.live.pid, s.live.pid, 'the same claude');
  } finally { await srv.stop(); }
});

test('a zsh drawer: a holder running zsh -l -i in the chat folder, beside the claude one', { timeout: 40_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const chat = fx.chats[1];
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  try {
    const r = await srv.api(`api/sessions/${chat.id}/shell`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cols: 100, rows: 30 }) });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const t = r.body.terminal; assert.equal(t.shell, true); assert.equal(t.sessionId, chat.id); assert.equal(t.resume, false);
    const again = await srv.api(`api/sessions/${chat.id}/shell`, { method: 'POST' });
    assert.equal(again.status, 200); assert.equal(again.body.terminal.id, t.id, 'the chat\'s zsh, answered with again');
    // ⌘T (2026-10-13): `fresh` starts another beside it, every time
    const more = await srv.post(`api/sessions/${chat.id}/shell`, { cols: 100, rows: 30, fresh: true });
    assert.equal(more.status, 201, JSON.stringify(more.body)); assert.notEqual(more.body.terminal.id, t.id, 'a second zsh');
    const s = (await srv.api('api/sessions')).body.sessions.find(s => s.id === chat.id);
    assert.equal(s.shell?.id, t.id, 'the chat carries its first zsh'); assert.equal(s.terminal, null, 'and it is not its claude drawer');
    assert.deepEqual(s.shells.map(x => x.id), [t.id, more.body.terminal.id], 'and every zsh, oldest first');
    assert.equal(s.alive, false, 'a shell is no claude: the chat is not live');
    const a = attach(srv.url, t.id, { until: 'peix-shell-22', timeout: 20_000 });
    await a.opened; await waitFor(() => /[%$#] *$/.test(a.text().replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')), { what: 'the shell\'s prompt' });
    a.ws.send2({ t: 'in', d: 'echo peix-shell-$((20+2))\r' });
    const out = await a;
    assert.ok(out.all.includes('peix-shell-22'), `the zsh ran the command: ${JSON.stringify(out.all.slice(-300))}`);
    const d = await srv.api(`api/terminals/${t.id}`, { method: 'DELETE' }); assert.equal(d.status, 200);
    await waitFor(async () => (await srv.terminals()).find(x => x.id === t.id)?.exited != null, { what: 'the zsh ending' });
    const after = (await srv.api('api/sessions')).body.sessions.find(s => s.id === chat.id);
    assert.equal(after.shells.find(x => x.id === more.body.terminal.id)?.exited, null, 'the other zsh lives on');
  } finally { await srv.stop(); }
});

test('two asks for a chat\'s drawer at once start one claude, and a pid the registry outlived is no claude, nor signalled', { timeout: 40_000 }, async () => {
  const { spawn } = await import('node:child_process');
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const chat = fx.chats[1], other = fx.chats[0];
  // a "claude" whose registry file says it started in 2001, waiting on you: its pid is some other process now
  const stranger = spawn('sleep', ['60'], { stdio: 'ignore' });
  writeFileSync(join(fx.dir, 'sessions', `${stranger.pid}.json`), JSON.stringify({ pid: stranger.pid, sessionId: other.id, cwd: other.cwd, startedAt: Date.now(), procStart: 'Mon Jan  1 00:00:00 2001', kind: 'interactive', entrypoint: 'cli', status: 'waiting', waitingFor: 'input needed', statusUpdatedAt: Date.now() }));
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  try {
    const ask = () => srv.post(`api/sessions/${chat.id}/terminal`, { cols: 90, rows: 24 });
    const [a, b] = await Promise.all([ask(), ask()]);
    assert.equal(a.body.terminal.id, b.body.terminal.id, 'the second ask got the first one\'s drawer');
    assert.equal((await srv.terminals()).filter(t => t.sessionId === chat.id && t.exited === null).length, 1, 'one holder');
    // liveness by pid and start (2026-10-14): the pid answers, but it is not the process that wrote the file
    const s = (await srv.api('api/sessions')).body.sessions.find(x => x.id === other.id);
    assert.equal(s.alive, false, 'a pid handed on is no claude'); assert.notEqual(s.status, 'needs-input', 'and nothing asks you');
    const take = await srv.post(`api/sessions/${other.id}/takeover`, { cols: 90, rows: 24 });
    assert.equal(take.status, 409); assert.match(take.body.error, /not live anywhere/);
    assert.ok(alive(stranger.pid), 'and the process that has its pid now was left alone');
  } finally { stranger.kill(); await srv.stop(); }
});

test('/clear in a drawer takes the chat\'s zsh tabs along to the new chat (2026-10-14)', { timeout: 40_000 }, async () => {
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const chat = fx.chats[1];
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  const chatOf = async id => (await srv.api('api/sessions')).body.sessions.find(s => s.id === id);
  try {
    const r = await srv.post(`api/sessions/${chat.id}/terminal`, { cols: 100, rows: 30 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const t = r.body.terminal;
    await waitFor(async () => (await chatOf(chat.id))?.alive, { what: 'the resumed chat alive' });
    const z = await srv.post(`api/sessions/${chat.id}/shell`, { cols: 100, rows: 30 });
    assert.equal(z.status, 201, JSON.stringify(z.body));
    const p = attach(srv.url, t.id, { timeout: 3000 }); await p.opened; p.ws.send2({ t: 'in', d: '/clear\r' });
    const moved = await waitFor(async () => { const id = (await srv.terminals()).find(x => x.id === t.id)?.sessionId; return id !== chat.id && id; }, { what: 'the drawer following /clear' });
    const zt = (await srv.terminals()).find(x => x.id === z.body.terminal.id);
    assert.equal(zt.sessionId, moved, 'the zsh is the new chat\'s, as the drawer is');
    assert.equal(srv.holders().find(h => h.id === zt.id)?.sessionId, moved, 'and its holder was told, for an adoption after a restart');
    await waitFor(async () => (await chatOf(moved))?.shells?.some(x => x.id === zt.id) && !(await chatOf(chat.id))?.shells?.length, { what: 'the new chat carrying the zsh, the old one none' });
  } finally { await srv.stop(); }
});

test('a drawer has none of the board\'s own configuration: PORT and every knob the server reads stay the server\'s (2026-10-14)', { timeout: 40_000 }, async () => {
  // what server.mjs reads off its environment, as it reads it — a knob added there and set by the test server is caught here
  const src = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
  const reads = new Set([...src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map(m => m[1]));
  for (const m of src.matchAll(/findBin\('([a-z]+)'/g)) reads.add(`${m[1].toUpperCase()}_BIN`);
  const KEEP = new Set(['CLAUDE_DIR', 'PATH', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME', 'VSCODE_CLI_DATA_DIR', 'XPC_SERVICE_NAME', 'JIRA_API_TOKEN']);
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true, env: { TERM_LINGER_MS: '300000' } });
  try {
    const z = await srv.post(`api/sessions/${fx.chats[1].id}/shell`, { cols: 100, rows: 30 });
    assert.equal(z.status, 201, JSON.stringify(z.body));
    const a = attach(srv.url, z.body.terminal.id, { until: ':peix-end-42', timeout: 20_000 });
    await a.opened; await waitFor(() => /[%$#] *$/.test(a.text().replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')), { what: 'the shell\'s prompt' });
    a.ws.send2({ t: 'in', d: "printf 'peix-env-%s:' $((40+2)); env | cut -d= -f1 | tr '\\n' ' '; printf ':peix-end-%s\\n' $((40+2))\r" });
    const out = await a, hit = out.all.match(/peix-env-42:([^:]*):peix-end-42/);
    assert.ok(hit, `the zsh listed its environment: ${JSON.stringify(out.all.slice(-300))}`);
    const names = hit[1].split(/\s+/).filter(Boolean);
    assert.ok(names.includes('CLAUDE_DIR') && names.includes('PEIXAIRADA_DRAWER') && names.includes('ZDOTDIR'), `what a drawer needs is there: ${names}`);
    assert.ok(reads.has('PORT') && !names.includes('PORT'), 'no PORT: a dev server run there does not take the board\'s');
    assert.deepEqual(names.filter(n => reads.has(n) && !KEEP.has(n)), [], 'nothing else the server reads either');
    assert.ok(!names.includes('TERM_LINGER_MS'), 'nor the holder\'s own knob');
  } finally { await srv.stop(); }
});

test('a socket path past 103 bytes is said before anything is spawned, by the server and by the holder (2026-10-14)', { timeout: 40_000 }, async () => {
  const { spawn } = await import('node:child_process');
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const deep = join(tmpDir('peix-'), 'd'.repeat(100));
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true, env: { TERMS_DIR: deep } });
  try {
    const r = await srv.post(`api/sessions/${fx.chats[1].id}/shell`, { cols: 100, rows: 30 });
    assert.equal(r.status, 500); assert.match(r.body.error, /too deep for a socket: .* is \d+ bytes, macOS takes 103/);
    assert.equal(existsSync(deep), false, 'no holder was started: not even its folder made');
  } finally { await srv.stop(); }
  // the holder on its own, given such a folder (an older server's): it says so in its meta and starts no PTY
  mkdirSync(deep, { recursive: true });
  const id = 'tlong';
  writeFileSync(join(deep, `${id}.json`), JSON.stringify({ id, cwd: tmpdir(), bin: '/bin/sleep', args: ['30'], shell: false, sh: '/bin/zsh', cols: 80, rows: 24 }));
  const h = spawn(process.execPath, [join(ROOT, 'lib', 'termhold.mjs'), deep, id], { stdio: 'ignore' });
  const code = await new Promise(res => h.on('exit', res));
  const meta = JSON.parse(readFileSync(join(deep, `${id}.json`), 'utf8'));
  assert.equal(code, 1); assert.match(meta.error, /socket path is too long/); assert.equal(meta.pid, null, 'no PTY spawned');
});

test('a snapshot carries what the serialize addon leaves out: the mouse\'s SGR encoding, a hidden cursor, the scroll region (2026-10-14)', { timeout: 30_000 }, async () => {
  const { spawn } = await import('node:child_process');
  const { connect } = await import('node:net');
  const { Terminal } = await import('@xterm/headless').then(m => m.default ?? m);
  const dir = tmpDir('peix-h-'), id = 'tmodes', zdot = join(dir, 'zdot'); mkdirSync(zdot);
  // what a fullscreen TUI sends: the alternate screen, mouse tracking in SGR, the cursor hidden, a region, the cursor in it
  const tui = "printf '\\033[?1049h\\033[?1000h\\033[?1006h\\033[?25l\\033[3;20r\\033[5;7Hhello'; exec sleep 30";
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, cwd: dir, bin: '/bin/sh', args: ['-c', tui], shell: false, sh: '/bin/zsh', cols: 80, rows: 24 }));
  const h = spawn(process.execPath, [join(ROOT, 'lib', 'termhold.mjs'), dir, id], { stdio: 'ignore', env: { ...process.env, ZDOTDIR: zdot } });
  let sock;
  try {
    sock = await waitFor(() => new Promise(res => { const s = connect(join(dir, `${id}.sock`)); s.once('connect', () => res(s)); s.once('error', () => res(null)); }), { what: 'the holder\'s socket' });
    sock.setEncoding('utf8');
    let buf = '', snap = null;
    sock.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (m.t === 'snap') snap = m; } });
    await waitFor(async () => { snap = null; sock.write(JSON.stringify({ t: 'snap' }) + '\n'); await waitFor(() => snap, { what: 'a snapshot' }); return snap.d.includes('hello'); }, { what: 'a snapshot of the TUI drawn' });
    // the page: a fresh xterm written the snapshot, as attachTerm does after reset()
    const page = new Terminal({ cols: 80, rows: 24, scrollback: 5000, allowProposedApi: true });
    await new Promise(r => page.write(snap.d, r));
    const core = page._core, b = page.buffer.active;
    assert.equal(page.modes.mouseTrackingMode, 'vt200', 'mouse tracking, which the addon did carry');
    assert.equal(core.coreMouseService.activeEncoding, 'SGR', 'and its SGR encoding — not X10\'s, which the page never sends');
    assert.equal(core.coreService.isCursorHidden, true, 'the cursor stays hidden');
    assert.deepEqual([core.buffer.scrollTop, core.buffer.scrollBottom], [2, 19], 'the scroll region is the TUI\'s');
    assert.deepEqual([b.type, b.cursorY, b.cursorX], ['alternate', 4, 11], 'and the cursor where the TUI left it, not homed by the region');
    let sent = ''; const d = core.coreService.onData(s => sent += s);
    core.coreMouseService.triggerMouseEvent({ col: 9, row: 4, x: 0, y: 0, button: 4, action: 0, ctrl: false, alt: false, shift: false }); d.dispose();
    assert.equal(sent, '\x1b[<64;10;5M', 'a wheel step reaches the TUI as it asked for it');
  } finally { sock?.end(); h.kill('SIGTERM'); await new Promise(r => h.exitCode !== null ? r() : h.on('exit', r)); }
});

test('a claude live elsewhere is known by its start as Claude Code writes it, whatever the server\'s locale, and taken over', { timeout: 40_000 }, async () => {
  const { spawn, execFileSync } = await import('node:child_process');
  const fx = defaultFixture(tmpDir('peix-fx-'), { cwdA: process.cwd(), cwdB: tmpdir() });
  const chat = fx.chats[1];
  const other = spawn('sleep', ['60'], { stdio: 'ignore' });   // stands in for a claude live in iTerm
  const procStart = execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(other.pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' } }).trim();   // as Claude Code writes it
  writeFileSync(join(fx.dir, 'sessions', `${other.pid}.json`), JSON.stringify({ pid: other.pid, sessionId: chat.id, cwd: chat.cwd, startedAt: Date.now(), procStart, kind: 'interactive', entrypoint: 'cli', status: 'idle', statusUpdatedAt: Date.now() }));
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true, env: { LANG: 'en_GB.UTF-8', LC_ALL: '', LC_TIME: 'en_GB.UTF-8' } });   // where ps writes "Wed 14 Oct" for "Wed Oct 14"
  try {
    await waitFor(async () => (await srv.api('api/sessions')).body.sessions.find(s => s.id === chat.id)?.alive, { what: 'the chat live elsewhere' });
    const take = await srv.post(`api/sessions/${chat.id}/takeover`, { cols: 90, rows: 24 });
    assert.ok(take.status < 300, `take over: ${take.status} ${JSON.stringify(take.body)}`);
    await waitFor(() => !alive(other.pid) || other.exitCode !== null || other.signalCode, { what: 'the other claude ended' });
  } finally { try { other.kill(); } catch {} await srv.stop(); }
});

// Node takes its 'error' listener off a socket it hands to 'upgrade'; until the boot is done nobody else has put one on
// (2026-10-14): a holder that accepts and says nothing holds the boot HELLO_MS, and a page's WebSocket reset in that
// window ended the server — an unheard ECONNRESET.
test('a WebSocket reset while the boot waits on a mute holder ends that socket, not the server', { timeout: 40_000 }, async () => {
  const dir = tmpDir(); mkdirSync(join(dir, 'terms'));
  const mute = createServer(() => {}).listen(join(dir, 'terms', 't1-mute.sock'));   // accepts, never says hello
  writeFileSync(join(dir, 'terms', 't1-mute.json'), JSON.stringify({ id: 't1-mute', cwd: '/tmp', bin: '/bin/true', args: [] }));
  const log = () => { try { return readFileSync(join(dir, 'server.log'), 'utf8'); } catch { return ''; } };
  const up = startTestServer({ dir, keep: true }).then(srv => ({ srv }), err => ({ err }));
  try {
    const port = Number((await waitFor(() => /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(log()), { what: 'the port taken' }))[1]);
    const c = connect(port, '127.0.0.1', () => {
      c.write(`GET /api/terminals/t1-mute/ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`);
      setTimeout(() => c.resetAndDestroy(), 300);   // while the boot still waits for the mute holder's hello
    });
    c.on('error', () => {});
    const { srv, err } = await up;
    assert.equal(err, undefined, `the server came up: ${err?.message.split('\n')[0]}`);
    try {
      await sleep(300);
      assert.equal(srv.proc.exitCode, null, 'still running');
      assert.equal((await srv.api('api/projects')).status, 200, 'and answering');
      assert.doesNotMatch(log(), /Unhandled 'error'/);
    } finally { await srv.stop(); }
  } finally { mute.close(); }
});
