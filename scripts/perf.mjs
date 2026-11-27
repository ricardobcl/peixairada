#!/usr/bin/env node
// The board's cost in WebKit, the app's engine (2026-10-13): on a made-up board shaped like a busy one — 400 chats over
// fifteen coloured folders, 300 of them done, five clauding, eighteen alive and idle, PRs with faces — with the lights
// the app runs with (tiles, the floating header, the status bar, every lane open), the web process's CPU at rest, with
// the pointer moving over the board, with the list scrolled a frame at a time and on home (the sea), the frames each
// phase dropped, how long a chat takes to open from its card, the compositor's layers, the memory, and the rules of
// lib/animcheck.mjs checked where they bite (WebKit keeps an animation on a box it does not draw; Chrome, the scenarios'
// engine, makes none). Every one of 2026-10-13's causes passed every scenario; this is what catches the next.
//   npm run perf                       the numbers, and a non-zero exit past a ceiling or on a broken rule
//   npm run perf -- --runs 3           three runs, the median of each number (this Mac's load moves CPU ±2–3 points)
//   npm run perf -- --against <ref>    the same board on <ref>'s page and server too (a detached worktree of it), the
//                                      runs interleaved, side by side — the before and after of a change
//   npm run perf -- --sample           where the web process's time went in each phase: macOS `sample`, the top of its
//                                      stacks, idle waits left out (the CPU numbers read high while it is attached)
//   npm run perf -- --app [s]          the app as it runs instead: its board's web process, CPU over s seconds (10), its
//                                      memory, and where its time went — the real board, your chats and settings
//   npm run perf -- --prefs '<json>'   the page's prefs over the board's own — another look's cost, as
//                                      '{"look":"light","skinFollow":false}'
//   npm run perf -- --json             the results as JSON on the last line too
//   CEIL_REST=15 CEIL_POINTER=25 CEIL_SCROLL=45 CEIL_HOME=30 CEIL_OPEN=400 CEIL_LAYERS=600   the ceilings, in % of a
//   core, ms and layers — about twice what the board measured on 2026-10-13
// It needs the screen awake and unlocked (scripts/webkit.mjs runs no frames otherwise), and takes about 40 s a run.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ANIM_RULES } from '../lib/animcheck.mjs';
import { sleep, tmpDir } from '../lib/testserver.mjs';
import { makeFixture, toolLines } from './fixture.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);

const flag = name => {
  const index = argv.indexOf(name);

  if (index < 0) return false;
  argv.splice(index, 1);
  return true;
};

const value = name => {
  const index = argv.indexOf(name);

  if (index < 0) return null;
  const given = argv[index + 1];

  argv.splice(index, 2);
  return given;
};

const JSON_OUT = flag('--json');
const SAMPLE = flag('--sample');
const RUNS = Math.max(1, Number(value('--runs') || 1));
const AGAINST = value('--against');
const PREFS = value('--prefs');

let APP = null;

{
  const index = argv.indexOf('--app');

  if (index >= 0) {
    const seconds = Number(argv[index + 1]);

    APP = seconds > 0 ? seconds : 10;
    argv.splice(index, seconds > 0 ? 2 : 1);
  }
}

if (argv.length) {
  console.error(
    'usage: npm run perf -- [--runs n] [--against <ref>] [--prefs <json>] [--sample] [--json] | --app [seconds]',
  );

  process.exit(2);
}

const env = process.env;

const CEIL = {
  rest: +(env.CEIL_REST || 15),
  pointer: +(env.CEIL_POINTER || 25),
  scroll: +(env.CEIL_SCROLL || 45),
  home: +(env.CEIL_HOME || 30),
  open: +(env.CEIL_OPEN || 400),
  layers: +(env.CEIL_LAYERS || 600),
};

const PHASES = ['rest', 'pointer', 'scroll', 'home'];

const CHAT_COUNT = 400;
const DONE = 300;
const WORK = 5;
const IDLE = 18;
const WIN = 6000;

// ---- the web process: its CPU time, its memory, where its time goes ----
const ps = (field, pid) =>
  spawnSync('ps', ['-o', `${field}=`, '-p', String(pid)], {
    encoding: 'utf8',
    env: { ...env, TZ: 'UTC' },
  }).stdout.trim();

const cpuTime = pid => {
  // [[dd-]hh:]mm:ss.cc
  const printed = ps('time', pid);

  if (!printed) return null;

  const [days, clock] = printed.includes('-') ? printed.split('-') : [0, printed];
  const parts = clock.split(':').map(Number);

  while (parts.length < 3) parts.unshift(0);
  return +days * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2];
};

const footprintMb = pid => {
  const match = spawnSync('footprint', [String(pid)], { encoding: 'utf8' }).stdout.match(
    /Footprint: ([\d.]+) (KB|MB|GB)/,
  );

  return match ? +match[1] * { KB: 1 / 1024, MB: 1, GB: 1024 }[match[2]] : null;
};

// `sample`'s "top of stack" section: the functions the process was in, the waits of idle threads left out
const IDLE_FN =
  /^(__psynch_cvwait|__psynch_mutexwait|__workq_kernreturn|mach_msg2?_trap|__semwait_signal|semaphore_\w+_trap|kevent\w*|__select|__ulock_wait2?|start_wqthread|thread_start|_pthread_start|__sigsuspend)$/;

const shortFn = name => {
  // WebCore::Foo::bar<…>(args…) const → Foo::bar
  let stripped = name.replace(/\(anonymous namespace\)::/g, '');

  for (let pass = 0; pass < 12 && /<[^<>]*>/.test(stripped); pass++) stripped = stripped.replace(/<[^<>]*>/g, '');
  return (
    stripped
      .replace(/\(.*$/s, '')
      .replace(/^(WebCore|WebKit|WTF|JSC|Inspector)::/, '')
      .trim()
      .slice(0, 90) || name.slice(0, 90)
  );
};

function topOfStack(file, count = 6) {
  let text;

  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }

  const at = text.indexOf('Sort by top of stack');

  if (at < 0) return [];
  const rows = [];

  for (const line of text.slice(at).split('\n').slice(1)) {
    if (!line.trim()) break;
    const match = line.match(/^\s+(.+?)\s+\(in ([^)]+)\)\s+(\d+)$/);

    if (match && !IDLE_FN.test(match[1])) rows.push({ fn: shortFn(match[1]), lib: match[2], n: +match[3] });
  }

  const total = rows.reduce((sum, row) => sum + row.n, 0) || 1;

  return rows.slice(0, count).map(row => ({ pct: Math.round((row.n / total) * 100), fn: row.fn, lib: row.lib }));
}

const stackLines = top => top.map(row => `    ${String(row.pct).padStart(3)} %  ${row.fn}  (${row.lib})`).join('\n');

// ---- --app: the board as it runs ----
if (APP) {
  // the board's web process: the app logs it (BoardView.swift, 2026-10-13); else the first one the app started, which is the
  // board's unless its process was ever loaded again
  const isWeb = pid => /WebContent/.test(ps('comm', pid));

  let pid = null;
  let how = '';

  try {
    const last = [
      ...readFileSync(env.APP_LOG || join(homedir(), 'Library/Logs/peixairada-app.log'), 'utf8').matchAll(
        /board: web process (\d+)/g,
      ),
    ].at(-1)?.[1];

    if (last && isWeb(last)) {
      pid = +last;
      how = 'named in the app log';
    }
  } catch {}

  if (!pid) {
    const app = spawnSync('pgrep', ['-x', 'peixAIrada'], { encoding: 'utf8' }).stdout.trim().split('\n')[0];

    if (!app) {
      console.error('the app is not running');
      process.exit(1);
    }

    const since = Date.parse(`${ps('lstart', app)} UTC`);

    const webs = spawnSync('pgrep', ['-f', 'com.apple.WebKit.WebContent'], { encoding: 'utf8' })
      .stdout.trim()
      .split('\n')
      .filter(Boolean)
      .map(webPid => [+webPid, Date.parse(`${ps('lstart', webPid)} UTC`)])
      .filter(([, started]) => started >= since)
      .sort((left, right) => left[1] - right[1]);

    if (!webs.length) {
      console.error('no web process started after the app');
      process.exit(1);
    }

    pid = webs[0][0];
    how = 'the first web process the app started (a build from 2026-10-13 on names it in its log)';
  }

  const cpuBefore = cpuTime(pid);
  const t0 = Date.now();

  await sleep(APP * 1000);

  const cpu = ((cpuTime(pid) - cpuBefore) / ((Date.now() - t0) / 1000)) * 100;
  const mb = footprintMb(pid);

  const file = join(tmpDir('pxperf-'), 'app.sample.txt');

  spawnSync('sample', [String(pid), String(Math.min(APP, 5)), '-file', file], { stdio: 'ignore' });
  const top = topOfStack(file, 8);

  console.log(`the app's board: web process ${pid}, ${how}`);
  console.log(`cpu      ${cpu.toFixed(1)} % of a core over ${APP} s`);
  console.log(`memory   ${mb === null ? '?' : `${Math.round(mb)} MB`} (its footprint, as Activity Monitor counts it)`);

  console.log(
    `where its time went (sample, ${Math.min(APP, 5)} s, idle waits left out):\n${stackLines(top) || '    nothing but waiting'}`,
  );

  if (JSON_OUT) console.log(JSON.stringify({ pid, cpu, mb, top }));
  process.exit(0);
}

// ---- the board ----
const base = tmpDir('pxperf-');
const claude = join(base, 'c');

mkdirSync(claude);

const names = [
  'wallet',
  'ledger',
  'gateway',
  'risk',
  'orders',
  'ira',
  'execution',
  'erebor',
  'staking',
  'rewards',
  'autopilot',
  'clients',
  'board',
  'feeds',
  'web',
];

const colors = [
  '#1f6feb',
  '#2f9e5b',
  '#0e8a8a',
  '#c53535',
  '#8250df',
  '#d9a82a',
  '#bf8700',
  '#e8782a',
  '#3fb950',
  '#a371f7',
  '#db61a2',
  '#57606a',
  '#c96442',
  '#0969da',
  '#6e7781',
];

// each project's colour in the setup, and as Peacock's for a board from before 2026-10-15 (--against)
const cwds = names.map((name, index) => {
  const dir = join(base, 'r', name);

  mkdirSync(join(dir, '.vscode'), { recursive: true });
  writeFileSync(join(dir, '.vscode', 'settings.json'), JSON.stringify({ 'peacock.color': colors[index] }));
  return dir;
});

const setup = JSON.stringify({
  projects: Object.fromEntries(names.map((name, index) => [name, { color: colors[index] }])),
});

const face = (login, fill) => ({
  login,
  __typename: 'User',
  avatarUrl: `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${fill}"/></svg>`,
  )}`,
});

const people = ['ana', 'rui', 'eva', 'joao', 'marta', 'tiago', 'ines', 'pedro'].map((login, index) =>
  face(login, colors[index]),
);

const me = face('me', '#888');

const ago = min => new Date(Date.now() - min * 60_000);
const iso = date => date.toISOString().replace(/\.\d+Z$/, 'Z');

const prs = {};
const sleeps = [];
const chats = [];

let prn = 100;

for (let index = 0; index < CHAT_COUNT; index++) {
  const projectIndex = index % names.length;
  const cwd = cwds[projectIndex];
  const repo = names[projectIndex];
  const working = index < WORK;
  const alive = index < WORK + IDLE;
  const done = index >= CHAT_COUNT - DONE;

  const at = alive ? ago(5 + index * 7) : done ? ago(2880 + (index - (CHAT_COUNT - DONE)) * 130) : ago(30 + index * 40);
  const urls = [];

  for (let prIndex = 0; prIndex < (done ? 1 : 1 + (index % 3)); prIndex++) {
    const prNumber = prn++;
    const author = people[(index + prIndex) % people.length];
    const reviewer = people[(index + prIndex + 3) % people.length];

    prs[`acme/${repo}#${prNumber}`] = {
      state: done ? (prIndex % 2 ? 'CLOSED' : 'MERGED') : prIndex === 2 ? 'MERGED' : 'OPEN',
      title: `Change ${prNumber} in ${repo}, a title of a few words`,
      createdAt: iso(ago(3000)),
      headRefOid: `H${prNumber}`,
      author: prIndex % 2 ? me : author,
      reviews: {
        nodes: [
          { author: reviewer, state: 'COMMENTED', submittedAt: iso(ago(60)) },
          { author: me, state: 'APPROVED', submittedAt: iso(ago(120)) },
        ],
      },
      comments: { nodes: [{ author: reviewer, createdAt: iso(ago(20)) }] },
      pushes: { nodes: [] },
      asks: { nodes: [] },
      reviewRequests: { nodes: [] },
    };

    urls.push(`https://github.com/acme/${repo}/pull/${prNumber}`);
  }

  let live;

  if (alive) {
    const child = spawn('sleep', ['900'], { stdio: 'ignore' });

    sleeps.push(child);
    live = { pid: child.pid, status: working ? 'busy' : 'idle' };
  }

  chats.push({
    cwd,
    at,
    title: `Chat ${index} about ${repo}, long enough to wrap`,
    prompt: `Look at ${urls.join(' and ')} — what changed?`,
    reply: 'Reviewed; one nit on naming.',
    live,
    done,
    lines: working
      ? id => toolLines({ id, cwd, name: 'Bash', input: { command: 'npm test' }, at: new Date() })
      : undefined,
  });
}

const fx = makeFixture(claude, chats);

writeFileSync(join(base, 'prs.json'), JSON.stringify(prs));

const doneMarks = JSON.stringify({
  done: Object.fromEntries(
    fx.chats.filter((chat, index) => chats[index].done).map(chat => [chat.id, new Date().toISOString()]),
  ),
});

// One server per tree, each over the same made-up ~/.claude with a state dir of its own; the other tree's from a
// detached worktree of the ref, with this checkout's node_modules.
const boards = [];
const worktrees = [];
const harnesses = new Set();

async function startBoard(root, label) {
  const dir = join(base, `s${boards.length}`);

  mkdirSync(dir);
  writeFileSync(join(dir, 'state.json'), doneMarks);
  writeFileSync(join(dir, 'config.json'), setup);
  const { startTestServer } = await import(pathToFileURL(join(root, 'lib', 'testserver.mjs')).href);

  const server = await startTestServer({
    claudeDir: claude,
    fake: true,
    dir,
    env: {
      GH_BIN: join(ROOT, 'scripts', 'fakes', 'fakegh.mjs'),
      FAKEGH_PRS: join(base, 'prs.json'),
      FAKEGH_VIEWER: 'me',
      REGISTRY_POLL_MS: '10000',
      TASK_GRACE_MS: '3000',
    },
  });

  const open = (await server.api('api/sessions')).body.sessions.find(
    session => session.status === 'stale' && !session.done,
  )?.id;

  const board = { label, server, open };

  boards.push(board);
  return board;
}

let stopping = null;

const stop = () =>
  (stopping ||= (async () => {
    for (const child of sleeps) child.kill();
    for (const harness of harnesses) harness.kill();
    for (const board of boards) await board.server.stop().catch(() => {});

    for (const wt of worktrees) {
      spawnSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' });
    }
  })());

// Every way out stops the boards and removes the --against worktree, as scripts/scenario.mjs does (2026-10-14: SIGINT
// alone before — a Bash tool's timeout is a SIGTERM, a closed terminal a SIGHUP), and never waits on them over 15 s.
const finish = async code => {
  setTimeout(() => process.exit(code), 15_000).unref();
  await stop();
  process.exit(code);
};

for (const [sig, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
  ['SIGHUP', 129],
]) {
  process.on(sig, () => finish(code));
}

for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, error => {
    console.error(`${ev}: ${error?.stack || error}`);
    finish(1);
  });
}

// ---- one run: the page in WebKit, its phases, and the web process's CPU time sampled beside it ----
const prefs = {
  barStats: ['cpu', 'mem'],
  lanesShut: [],
  cards: 'compact',
  cardsEven: true,
  skinFollow: false,
  look: 'dark',
};

if (PREFS) {
  try {
    Object.assign(prefs, JSON.parse(PREFS));
  } catch {
    console.error('--prefs is not JSON');
    process.exit(2);
  }
}

const body = `await sleep(3000);
  const rules = ${ANIM_RULES}, list = document.querySelector('#slist'), out = { phases: [], opens: [] };
  // a phase with nothing to do each frame sleeps (2026-10-15): a frame asked for every frame is a style pass and a walk of
  // every layer each, which hid the cost of a main-thread animation at rest (the pixel mark's steps(), 2.5 % of a core)
  const phase = async (name, step) => { await say('phase ' + name + ' ' + ${WIN / 1000});
    const iv = []; let last = 0, i = 0; const t0 = Date.now();
    if (!step) await sleep(${WIN});
    else await new Promise(res => { const f = t => { if (last) iv.push(t - last); last = t; step(i++); if (Date.now() - t0 >= ${WIN}) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
    out.phases.push({ name, t0, t1: Date.now(), frames: step ? iv.length : null, dropped: step ? iv.filter(v => v > 20).length : null }); };
  await phase('rest');
  await frame(); out.layers = ((await layers()).match(/\\(layer bounds/g) || []).length;
  await phase('pointer', i => document.dispatchEvent(new PointerEvent('pointermove', { clientX: 200 + (i * 7) % 1200, clientY: 200 + (i * 3) % 700, bubbles: true })));
  const range = Math.max(1, list.scrollHeight - list.clientHeight);
  await phase('scroll', i => { const d = (i * 12) % (2 * range); list.scrollTop = d < range ? d : 2 * range - d; });
  // chats opened from their cards, as a click opens them: three clauding, three not
  list.scrollTop = 0; await sleep(500);
  const cards = [...list.querySelectorAll(':scope > .card:not(.active)')];
  for (const id of [...cards.filter(c => c.classList.contains('working')).slice(0, 3), ...cards.filter(c => !c.classList.contains('working')).slice(0, 3)].map(c => c.dataset.id)) {
    const s = performance.now(); list.querySelector(':scope > .card[data-id="' + id + '"]').click();
    await until(() => document.querySelector('#log')?.dataset.sid === id, 5000, 'the chat open'); await frame(); await frame();
    out.opens.push(Math.round(performance.now() - s)); await sleep(400); }
  // home: no chat open, the sea on (a page from before 2026-10-10 has none)
  window.peixKey('Digit0');
  if (await until(() => !peix.state().current, 3000).catch(() => false)) { await sleep(1000); await phase('home'); }
  out.footprint = await footprint();
  return { ...out, rules, cards: list.querySelectorAll(':scope > .card').length };`;

const median = xs => {
  const sorted = xs.filter(number => Number.isFinite(number)).sort((left, right) => left - right);

  return sorted.length
    ? sorted.length % 2
      ? sorted[sorted.length >> 1]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : NaN;
};

async function measure(board, tag) {
  const pidFile = join(base, `pid-${tag}`);
  const samples = [];
  const sampling = [];

  rmSync(pidFile, { force: true });

  const startSample = (name, secs) => {
    if (!existsSync(pidFile)) return;
    const file = join(base, `${tag}-${name}.sample.txt`);

    const child = spawn(
      'sample',
      [readFileSync(pidFile, 'utf8').trim(), String(Math.max(1, Math.floor(secs) - 1)), '-file', file],
      { stdio: 'ignore' },
    );

    sampling.push(new Promise(res => child.on('close', () => res([name, file]))));
  };

  const harness = spawn(process.execPath, [join(ROOT, 'scripts', 'webkit.mjs'), '--hash', board.open, body], {
    env: {
      ...env,
      URL: board.server.url,
      KEY: board.server.key || '',
      SIZE: '1728x1117',
      PREFS: JSON.stringify(prefs),
      TIMEOUT: '120',
      WK_PIDFILE: pidFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  let err = '';

  harness.stdout.on('data', chunk => {
    output += chunk;
  });

  harness.stderr.on('data', chunk => {
    // the body's `say('phase …')` lines start a sample; the rest is the harness's to say
    err += chunk;
    let newline;

    while ((newline = err.indexOf('\n')) >= 0) {
      const line = err.slice(0, newline);
      const match = line.match(/^phase (\w+) ([\d.]+)$/);

      err = err.slice(newline + 1);
      if (!match) process.stderr.write(`${line}\n`);
      else if (SAMPLE) startSample(match[1], +match[2]);
    }
  });

  harnesses.add(harness);

  const exited = new Promise(res =>
    harness.on('close', exitCode => {
      harnesses.delete(harness);
      res(exitCode);
    }),
  );

  let running = true;

  exited.then(() => {
    running = false;
  });

  (async () => {
    while (running) {
      if (existsSync(pidFile)) {
        const cpu = cpuTime(+readFileSync(pidFile, 'utf8'));

        if (cpu !== null) samples.push([Date.now(), cpu]);
      }

      await sleep(250);
    }
  })();

  const code = await exited;

  if (code !== 0) throw new Error(`the WebKit harness failed on ${board.label} (exit ${code})`);
  const res = JSON.parse(output.trim().split('\n').pop());

  const at = ms => {
    let best = null;

    for (const sample of samples) if (!best || Math.abs(sample[0] - ms) < Math.abs(best[0] - ms)) best = sample;
    return best;
  };

  const phases = {};

  for (const phase of res.phases) {
    const atStart = at(phase.t0);
    const atEnd = at(phase.t1);

    phases[phase.name] = {
      cpu:
        atStart && atEnd && atEnd[0] > atStart[0]
          ? ((atEnd[1] - atStart[1]) / ((atEnd[0] - atStart[0]) / 1000)) * 100
          : NaN,
      dropped: phase.dropped,
      frames: phase.frames,
    };
  }

  const stacks = Object.fromEntries((await Promise.all(sampling)).map(([name, file]) => [name, topOfStack(file)]));

  return {
    cards: res.cards,
    rules: res.rules,
    layers: res.layers,
    memory: res.footprint,
    opens: res.opens,
    open: median(res.opens),
    phases,
    stacks,
  };
}

// ---- the runs, interleaved when there are two trees: A B, B A, … so a drift in this Mac's load falls on both ----
const results = new Map();

try {
  await startBoard(ROOT, 'this tree');

  if (AGAINST) {
    const sha = spawnSync('git', ['-C', ROOT, 'rev-parse', '--short', AGAINST], { encoding: 'utf8' }).stdout.trim();

    if (!sha) throw new Error(`no such commit: ${AGAINST}`);
    const wt = join(base, 'against');

    worktrees.push(wt);
    const add = spawnSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', wt, sha], { encoding: 'utf8' });

    if (add.status !== 0) throw new Error(`git worktree add: ${add.stderr}`);
    // the nearest node_modules up the folders, as Node finds it (2026-10-14): a worktree inside the repo has none of its own
    let nm = ROOT;

    while (!existsSync(join(nm, 'node_modules')) && dirname(nm) !== nm) nm = dirname(nm);
    symlinkSync(join(nm, 'node_modules'), join(wt, 'node_modules'));
    await startBoard(wt, `${sha} (${AGAINST})`);
  }

  for (const board of boards) results.set(board, []);

  for (let run = 0; run < RUNS; run++) {
    for (const board of run % 2 ? [...boards].reverse() : boards) {
      if (RUNS > 1 || boards.length > 1) console.error(`› run ${run + 1} of ${RUNS}: ${board.label}`);
      results.get(board).push(await measure(board, `r${run}-${boards.indexOf(board)}`));
    }
  }
} catch (error) {
  console.error(error.message);
  await finish(1);
}

await stop();

// ---- what came out: the medians, side by side; the ceilings and the rules held against this tree ----
const sum = runs => {
  const medianOf = pick => median(runs.map(pick));

  return {
    cards: medianOf(run => run.cards),
    layers: medianOf(run => run.layers),
    memory: medianOf(run => run.memory?.now),
    peak: medianOf(run => run.memory?.peak),
    open: medianOf(run => run.open),
    phases: Object.fromEntries(
      PHASES.map(phase => [
        phase,
        {
          cpu: medianOf(run => run.phases[phase]?.cpu),
          dropped: medianOf(run => run.phases[phase]?.dropped),
          frames: medianOf(run => run.phases[phase]?.frames),
        },
      ]),
    ),
    rules: [...new Set(runs.flatMap(run => run.rules))],
    stacks: runs.at(-1).stacks,
  };
};

const sums = boards.map(board => ({ label: board.label, ...sum(results.get(board)) }));
const mine = sums[0];

const fmt = (number, digits = 1) => (Number.isFinite(number) ? number.toFixed(digits) : '—');
const col = (text, width = 22) => String(text).padEnd(width);
const over = [];

console.log(`a made-up board of ${CHAT_COUNT} chats in WebKit; ${RUNS > 1 ? `the median of ${RUNS} runs` : 'one run'}`);
console.log(`${col('') + sums.map(result => col(result.label)).join('')}ceiling`);
console.log(col('cards in the list') + sums.map(result => col(fmt(result.cards, 0))).join(''));

for (const phase of PHASES) {
  if (!sums.some(result => Number.isFinite(result.phases[phase].cpu))) continue;
  if (!(mine.phases[phase].cpu <= CEIL[phase])) over.push(phase);

  console.log(
    col(`${phase} (% of a core)`) +
      sums
        .map(result =>
          col(
            `${fmt(result.phases[phase].cpu)}${Number.isFinite(result.phases[phase].frames) ? `  ${fmt(result.phases[phase].dropped, 0)}/${fmt(result.phases[phase].frames, 0)} slow` : ''}`,
          ),
        )
        .join('') +
      CEIL[phase] +
      (over.at(-1) === phase ? '  ← over' : ''),
  );
}

if (!(mine.open <= CEIL.open)) over.push('open');

console.log(
  col('a chat opened (ms)') +
    sums.map(result => col(fmt(result.open, 0))).join('') +
    CEIL.open +
    (over.at(-1) === 'open' ? '  ← over' : ''),
);

if (!(mine.layers <= CEIL.layers)) over.push('layers');

console.log(
  col('layers') +
    sums.map(result => col(fmt(result.layers, 0))).join('') +
    CEIL.layers +
    (over.at(-1) === 'layers' ? '  ← over' : ''),
);

console.log(
  col('memory (MB, peak)') + sums.map(result => col(`${fmt(result.memory, 0)} (${fmt(result.peak, 0)})`)).join(''),
);

console.log(
  '(slow: frames over 20 ms of all drawn in the phase, where it moves something each frame; rest and home sleep)',
);

for (const result of sums) {
  if (result.rules.length) console.log(`rules broken on ${result.label}:\n  ${result.rules.join('\n  ')}`);
}

if (!mine.rules.length) console.log('rules: none broken on this tree (lib/animcheck.mjs)');

if (SAMPLE) {
  for (const result of sums) {
    for (const [phase, top] of Object.entries(result.stacks)) {
      console.log(`where ${result.label}'s time went, ${phase}:\n${stackLines(top) || '    nothing but waiting'}`);
    }
  }
}

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      Object.fromEntries(
        sums.map((result, index) => [index ? 'against' : 'tree', { ...result, runs: results.get(boards[index]) }]),
      ),
    ),
  );
}

process.exit(over.length || mine.rules.length ? 1 : 0);
