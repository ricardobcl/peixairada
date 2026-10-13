#!/usr/bin/env node
// The board's cost in WebKit, the app's engine (2026-10-13): on a made-up board shaped like a busy one — 400 chats over
// fifteen coloured folders, 300 of them done, five clauding, eighteen alive and idle, PRs with faces — with the lights
// the app runs with (tiles, the floating header, the status bar, every lane open), the web process's CPU at rest, with
// the pointer moving over the board and with the list scrolled a frame at a time, the frames each phase dropped, and the
// rules of lib/animcheck.mjs checked where they bite (WebKit keeps an animation on a box it does not draw; Chrome, the
// scenarios' engine, makes none). Every one of 2026-10-13's causes passed every scenario; this is what catches the next.
//   npm run perf                 the numbers, and a non-zero exit past a ceiling or on a broken rule
//   CEIL_REST=15 CEIL_POINTER=25 CEIL_SCROLL=45 npm run perf   the ceilings, in % of a core (this Mac's load moves them a
//   few points; they are ~2× what the board measured that day)
// It needs the screen awake and unlocked (scripts/webkit.mjs runs no frames otherwise), and takes about a minute.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANIM_RULES } from '../lib/animcheck.mjs';
import { sleep, startTestServer, tmpDir } from '../lib/testserver.mjs';
import { makeFixture, toolLines } from './fixture.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CEIL = { rest: +(process.env.CEIL_REST || 15), pointer: +(process.env.CEIL_POINTER || 25), scroll: +(process.env.CEIL_SCROLL || 45) };
const N = 400, DONE = 300, WORK = 5, IDLE = 18, WIN = 6000;

// ---- the board ----
const base = tmpDir('pxperf-'), claude = join(base, 'c'), srv = join(base, 's'); mkdirSync(claude); mkdirSync(srv);
const names = ['wallet', 'ledger', 'gateway', 'risk', 'orders', 'ira', 'execution', 'erebor', 'staking', 'rewards', 'autopilot', 'clients', 'board', 'feeds', 'web'];
const colors = ['#1f6feb', '#2f9e5b', '#0e8a8a', '#c53535', '#8250df', '#d9a82a', '#bf8700', '#e8782a', '#3fb950', '#a371f7', '#db61a2', '#57606a', '#c96442', '#0969da', '#6e7781'];
const cwds = names.map((n, i) => { const d = join(base, 'r', n); mkdirSync(join(d, '.vscode'), { recursive: true }); writeFileSync(join(d, '.vscode', 'settings.json'), JSON.stringify({ 'peacock.color': colors[i] })); return d; });
const face = (login, fill) => ({ login, __typename: 'User', avatarUrl: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${fill}"/></svg>`) });
const people = ['ana', 'rui', 'eva', 'joao', 'marta', 'tiago', 'ines', 'pedro'].map((l, i) => face(l, colors[i])), me = face('me', '#888');
const ago = min => new Date(Date.now() - min * 60_000), iso = d => d.toISOString().replace(/\.\d+Z$/, 'Z');
const prs = {}, sleeps = [], chats = [];
let prn = 100;
for (let i = 0; i < N; i++) {
  const k = i % names.length, cwd = cwds[k], repo = names[k], working = i < WORK, alive = i < WORK + IDLE, done = i >= N - DONE;
  const at = alive ? ago(5 + i * 7) : done ? ago(2880 + (i - (N - DONE)) * 130) : ago(30 + i * 40);
  const urls = [];
  for (let j = 0; j < (done ? 1 : 1 + i % 3); j++) {
    const n = prn++, a = people[(i + j) % people.length], r = people[(i + j + 3) % people.length];
    prs[`acme/${repo}#${n}`] = { state: done ? (j % 2 ? 'CLOSED' : 'MERGED') : j === 2 ? 'MERGED' : 'OPEN', title: `Change ${n} in ${repo}, a title of a few words`, createdAt: iso(ago(3000)),
      headRefOid: 'H' + n, author: j % 2 ? me : a, reviews: { nodes: [{ author: r, state: 'COMMENTED', submittedAt: iso(ago(60)) }, { author: me, state: 'APPROVED', submittedAt: iso(ago(120)) }] },
      comments: { nodes: [{ author: r, createdAt: iso(ago(20)) }] }, pushes: { nodes: [] }, asks: { nodes: [] }, reviewRequests: { nodes: [] } };
    urls.push(`https://github.com/acme/${repo}/pull/${n}`);
  }
  let live;
  if (alive) { const s = spawn('sleep', ['600'], { stdio: 'ignore' }); sleeps.push(s); live = { pid: s.pid, status: working ? 'busy' : 'idle' }; }
  chats.push({ cwd, at, title: `Chat ${i} about ${repo}, long enough to wrap`, prompt: `Look at ${urls.join(' and ')} — what changed?`, reply: 'Reviewed; one nit on naming.', live, done,
    lines: working ? id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test' }, at: new Date() }) : undefined });
}
const fx = makeFixture(claude, chats);
writeFileSync(join(base, 'prs.json'), JSON.stringify(prs));
writeFileSync(join(srv, 'state.json'), JSON.stringify({ done: Object.fromEntries(fx.chats.filter((c, i) => chats[i].done).map(c => [c.id, new Date().toISOString()])) }));
const server = await startTestServer({ claudeDir: claude, fake: true, dir: srv, env: {
  GH_BIN: join(ROOT, 'scripts', 'fakegh.mjs'), FAKEGH_PRS: join(base, 'prs.json'), FAKEGH_VIEWER: 'me', REGISTRY_POLL_MS: '10000', TASK_GRACE_MS: '3000' } });
const stop = async () => { for (const s of sleeps) s.kill(); await server.stop(); };
process.on('SIGINT', () => stop().then(() => process.exit(130)));

// ---- the page, its phases, and the web process's CPU time sampled beside it ----
const sessions = (await server.api('api/sessions')).body.sessions, open = sessions.find(s => s.status === 'stale' && !s.done)?.id;
const prefs = { tiles: true, headFloat: true, statusBar: true, barStats: ['cpu', 'mem'], cardSpot: true, wallFollow: true, lanesShut: [], cards: 'compact', cardsEven: true, skin: 'own-dark', look: 'dark' };
const body = `await sleep(3000);
  const rules = ${ANIM_RULES}, phases = [], list = document.querySelector('#slist');
  const phase = async (name, step) => { const iv = []; let last = 0, stop = false, i = 0; const t0 = Date.now();
    await new Promise(res => { const f = t => { if (last) iv.push(t - last); last = t; step?.(i++); if (Date.now() - t0 >= ${WIN}) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
    phases.push({ name, t0, t1: Date.now(), frames: iv.length, dropped: iv.filter(v => v > 20).length }); };
  await phase('rest');
  await phase('pointer', i => document.dispatchEvent(new PointerEvent('pointermove', { clientX: 200 + (i * 7) % 1200, clientY: 200 + (i * 3) % 700, bubbles: true })));
  const range = Math.max(1, list.scrollHeight - list.clientHeight);
  await phase('scroll', i => { const d = (i * 12) % (2 * range); list.scrollTop = d < range ? d : 2 * range - d; });
  return { rules, phases, cards: document.querySelectorAll('#slist > .card').length };`;
const pidFile = join(base, 'pid'), samples = [];
const cpuTime = pid => { const r = spawnSync('ps', ['-o', 'time=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim(); if (!r) return null;
  const [h, m, s] = r.includes('-') ? [0, 0, 0] : r.split(':').length === 3 ? r.split(':').map(Number) : [0, ...r.split(':').map(Number)]; return h * 3600 + m * 60 + s; };
const harness = spawn(process.execPath, [join(ROOT, 'scripts', 'webkit.mjs'), '--hash', open, body], { env: { ...process.env, URL: server.url, SIZE: '1728x1117', PREFS: JSON.stringify(prefs), TIMEOUT: '90', WK_PIDFILE: pidFile }, stdio: ['ignore', 'pipe', 'inherit'] });
let output = ''; harness.stdout.on('data', d => { output += d; });
const exited = new Promise(res => harness.on('close', res));
let running = true; exited.then(() => { running = false; });
(async () => { while (running) { if (existsSync(pidFile)) { const t = cpuTime(+readFileSync(pidFile, 'utf8')); if (t !== null) samples.push([Date.now(), t]); } await sleep(250); } })();
const code = await exited;
await stop();
if (code !== 0) { console.error(`the WebKit harness failed (exit ${code})`); process.exit(1); }
const res = JSON.parse(output.trim().split('\n').pop());
const at = ms => { let best = null; for (const s of samples) if (!best || Math.abs(s[0] - ms) < Math.abs(best[0] - ms)) best = s; return best; };
let bad = 0;
console.log(`${res.cards} cards in the list (of ${N}: Idle and Done hold back past 30)`);
for (const p of res.phases) {
  const a = at(p.t0), b = at(p.t1), cpu = a && b && b[0] > a[0] ? (b[1] - a[1]) / ((b[0] - a[0]) / 1000) * 100 : NaN, over = !(cpu <= CEIL[p.name]);
  bad += over;
  console.log(`${p.name.padEnd(8)} ${cpu.toFixed(1).padStart(5)} % of a core (ceiling ${CEIL[p.name]})  ${p.dropped} of ${p.frames} frames over 20 ms${over ? '  ← over' : ''}`);
}
if (res.rules.length) { bad++; console.log('rules broken:\n  ' + res.rules.join('\n  ')); } else console.log('rules: none broken (lib/animcheck.mjs)');
process.exit(bad ? 1 : 0);
