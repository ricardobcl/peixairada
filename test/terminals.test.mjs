// The drawers end to end, no browser: a throwaway server with the fake claude, a fixture chat resumed in a holder,
// the socket's snapshot, a server restart with the holder alive under it, adoption, and the kill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestServer } from '../lib/testserver.mjs';
import { defaultFixture } from '../scripts/fixture.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
/** Attach like the page does: the first binary frame is the snapshot; `until` stops when a text is seen. */
function attach(url, id, { until = null, timeout = 8000 } = {}) {
  const ws = new WebSocket(`${url.replace(/^http/, 'ws')}api/terminals/${id}/ws`); ws.binaryType = 'arraybuffer';
  ws.send2 = m => ws.send(JSON.stringify(m));
  const p = new Promise(res => {
    let first = null, all = '', exit = null;
    const finish = () => { clearTimeout(t); try { ws.close(); } catch {} res({ first, all, exit }); };
    const t = setTimeout(finish, timeout);
    ws.onmessage = e => {
      if (typeof e.data === 'string') { const m = JSON.parse(e.data); if (m.t === 'exit') exit = m.code; return; }
      const s = Buffer.from(e.data).toString('utf8'); if (first === null) first = s; all += s;
      if (until && all.includes(until)) finish();
    };
    ws.onerror = () => {}; ws.onclose = () => { if (first !== null) finish(); };
  });
  p.ws = ws;
  return p;
}

test('a drawer runs in a holder, gives a page a snapshot, survives a server restart, and ends on DELETE', { timeout: 60_000 }, async () => {
  const fx = defaultFixture(mkdtempSync(join(tmpdir(), 'peix-fx-')), { cwdA: process.cwd(), cwdB: tmpdir() });
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
    let alive1 = false;
    for (let i = 0; i < 40 && !alive1; i++) { await sleep(150); const s = (await srv.api('api/sessions')).body.sessions.find(s => s.id === chat.id); alive1 = s.alive && s.live?.pid === t.pid && s.terminal?.id === t.id; }
    assert.ok(alive1, 'the resumed chat is alive with the drawer as its process');
    await sleep(700);   // the fake registers first and draws right after; the snapshot must be of a drawn screen
    // a page attaches: the first frame is the whole screen (the fake's prompt and status), not a byte replay
    const a1 = await attach(srv.url, t.id, { until: 'fake mode on' });
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
    await sleep(300); p.ws.send2({ t: 'in', d: 'ping\r' });
    const a3 = await p;
    assert.ok(a3.all.includes('You said: ping'), 'input reaches the PTY through the adopted holder');
    // end it: the fake exits, the registry entry goes, the holder lingers with the exit code then is let go
    const d = await srv.api(`api/terminals/${t.id}`, { method: 'DELETE' });
    assert.equal(d.status, 200);
    let ended = null;
    for (let i = 0; i < 40 && ended === null; i++) { await sleep(150); ended = (await srv.terminals()).find(x => x.id === t.id)?.exited ?? null; }
    assert.notEqual(ended, null, 'the terminal reports its exit');
    assert.ok(!alive(t.pid), 'the fake is gone');
    const d2 = await srv.api(`api/terminals/${t.id}`, { method: 'DELETE' });   // an exited one is let go at once
    assert.equal(d2.status, 200);
    await sleep(600);
    assert.ok(!(await srv.terminals()).some(x => x.id === t.id), 'forgotten');
    assert.ok(!existsSync(join(srv.dir, 'terms', `${t.id}.sock`)), 'the holder removed its socket');
  } finally { await srv.stop(); }
});

test('a new chat in a folder is tied to its session by pid when the fake registers', { timeout: 30_000 }, async () => {
  const fx = defaultFixture(mkdtempSync(join(tmpdir(), 'peix-fx-')), { cwdA: process.cwd(), cwdB: tmpdir() });
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  try {
    const r = await srv.api('api/terminals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cwd: process.cwd(), cols: 90, rows: 24 }) });
    assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.terminal.sessionId, null);
    let linked = null;
    for (let i = 0; i < 40 && !linked; i++) { await sleep(150); linked = (await srv.terminals()).find(x => x.id === r.body.terminal.id)?.sessionId || null; }
    assert.ok(linked, 'the terminal learnt its session id from the registry');
    const meta = srv.holders().find(h => h.id === r.body.terminal.id);
    assert.equal(meta.sessionId, linked, 'and told its holder, so an adoption after a restart knows it too');
  } finally { await srv.stop(); }
});

test('a launcher: a folder whose Taskfile launches claude lists it, a new chat there runs `task <name>`, and the chat is tied to the drawer by descent', { timeout: 40_000 }, async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'peix-tf-')); writeFileSync(join(cwd, 'Taskfile.yml'), 'version: "3"\n');   // the fake task never reads it; the server looks for it
  const fx = defaultFixture(mkdtempSync(join(tmpdir(), 'peix-fx-')), { cwdA: process.cwd(), cwdB: cwd });
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true, env: { TASK_BIN: join(ROOT, 'scripts', 'faketask.mjs') } });
  const post = body => srv.api('api/terminals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const none = await srv.api(`api/launchers?cwd=${encodeURIComponent(process.cwd())}`);
    assert.deepEqual(none.body.launchers, [], 'a folder without a Taskfile has no launchers');
    const l = await srv.api(`api/launchers?cwd=${encodeURIComponent(cwd)}`);
    assert.deepEqual(l.body.launchers, [{ name: 'production-workload', desc: 'Launch Claude Code against the production workload cluster' }], 'only the task whose description mentions Claude');
    assert.equal((await srv.api('api/launchers?cwd=relative')).status, 400);
    const bad = await post({ cwd, task: 'setup' });
    assert.equal(bad.status, 400); assert.match(bad.body.error, /no launcher named setup/);
    const r = await post({ cwd, task: 'production-workload', cols: 90, rows: 24 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const t = r.body.terminal;
    assert.equal(t.task, 'production-workload'); assert.equal(t.sessionId, null);
    assert.match(srv.logText(), /terminal t\d+-\w+: task production-workload in/);
    let linked = null;
    for (let i = 0; i < 60 && !linked; i++) { await sleep(150); linked = (await srv.terminals()).find(x => x.id === t.id)?.sessionId || null; }
    assert.ok(linked, 'the terminal learnt its session id although claude is not the PTY\'s process');
    const s = (await srv.api('api/sessions')).body.sessions.find(s => s.id === linked);
    assert.ok(s.alive, 'the chat is alive'); assert.notEqual(s.live.pid, t.pid, 'with a claude below task, not task itself'); assert.equal(s.terminal?.id, t.id, 'and the drawer is its');
    const meta = srv.holders().find(h => h.id === t.id);
    assert.equal(meta.task, 'production-workload'); assert.equal(meta.claudePid, s.live.pid, 'the holder was told claude\'s pid, for an adoption after a restart');
    const a = await attach(srv.url, t.id, { until: 'fake mode on' });
    assert.ok(a.all.includes('❯'), 'a page attaching sees claude\'s prompt through task');
  } finally { await srv.stop(); }
});

test('a zsh drawer: a holder running zsh -l -i in the chat folder, beside the claude one', { timeout: 40_000 }, async () => {
  const fx = defaultFixture(mkdtempSync(join(tmpdir(), 'peix-fx-')), { cwdA: process.cwd(), cwdB: tmpdir() });
  const chat = fx.chats[1];
  const srv = await startTestServer({ claudeDir: fx.dir, fake: true });
  try {
    const r = await srv.api(`api/sessions/${chat.id}/shell`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cols: 100, rows: 30 }) });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const t = r.body.terminal; assert.equal(t.shell, true); assert.equal(t.sessionId, chat.id); assert.equal(t.resume, false);
    const again = await srv.api(`api/sessions/${chat.id}/shell`, { method: 'POST' });
    assert.equal(again.status, 200); assert.equal(again.body.terminal.id, t.id, 'one zsh per chat');
    const s = (await srv.api('api/sessions')).body.sessions.find(s => s.id === chat.id);
    assert.equal(s.shell?.id, t.id, 'the chat carries its zsh'); assert.equal(s.terminal, null, 'and it is not its claude drawer');
    assert.equal(s.alive, false, 'a shell is no claude: the chat is not live');
    const a = attach(srv.url, t.id, { until: 'peix-shell-22', timeout: 20_000 });
    await sleep(2500);   // the login shell's rc files
    a.ws.send2({ t: 'in', d: 'echo peix-shell-$((20+2))\r' });
    const out = await a;
    assert.ok(out.all.includes('peix-shell-22'), `the zsh ran the command: ${JSON.stringify(out.all.slice(-300))}`);
    const d = await srv.api(`api/terminals/${t.id}`, { method: 'DELETE' }); assert.equal(d.status, 200);
    let ended = null;
    for (let i = 0; i < 40 && ended === null; i++) { await sleep(150); ended = (await srv.terminals()).find(x => x.id === t.id)?.exited ?? null; }
    assert.notEqual(ended, null, 'the zsh ended');
  } finally { await srv.stop(); }
});
