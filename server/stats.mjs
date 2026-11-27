// The machine, for the status bar (2026-10-09): CPU, memory, and what the claudes hold.
import { cpus, freemem, totalmem } from 'node:os';
import { execFileP } from './env.mjs';
import { findBin } from './bins.mjs';
import { sessions } from './state.mjs';

// ---- the machine, for the status bar: CPU, memory, and what the claudes hold (2026-10-09) ---------------------------
// Each optional in the page's status bar, each asked only while shown. CPU is the share of every core's time spent busy
// since the last ask (the first sample is taken at boot); memory is used of total — on macOS what Activity Monitor calls
// Memory Used (app memory, wired, compressed: vm_stat's anonymous less purgeable, wired, occupied by the compressor), not
// total less free, which counts the file cache as used; the claudes' is the resident size of every live claude process
// the registry names (`ps`), their children aside.
let cpuLast = null;

export function cpuBusy() {
  const totals = cpus().reduce(
    (sum, core) => {
      const times = core.times;

      sum.idle += times.idle;
      sum.all += times.user + times.nice + times.sys + times.idle + times.irq;
      return sum;
    },
    { idle: 0, all: 0 },
  );

  const last = cpuLast;

  cpuLast = totals;
  return last && totals.all > last.all
    ? Math.max(0, Math.min(100, Math.round(100 * (1 - (totals.idle - last.idle) / (totals.all - last.all)))))
    : null;
}

async function memUsed() {
  const total = totalmem();

  if (process.platform === 'darwin') {
    try {
      const out = (await execFileP('/usr/bin/vm_stat', [], { timeout: 3000 })).stdout;

      const page = Number(/page size of (\d+)/.exec(out)?.[1]) || 16384;
      const count = label => Number(new RegExp(`${label}:\\s+(\\d+)`).exec(out)?.[1]) || 0;

      const used =
        (count('Anonymous pages') -
          count('Pages purgeable') +
          count('Pages wired down') +
          count('Pages occupied by compressor')) *
        page;

      if (used > 0 && used <= total) return { used, total };
    } catch {}
  }

  return { used: total - freemem(), total };
}

async function claudeMem() {
  const pids = [
    ...new Set(
      [...sessions.values()]
        .filter(session => session.alive)
        .flatMap(session => [session.live, ...session.rivals])
        .map(entry => entry?.pid)
        .filter(Number.isInteger),
    ),
  ];

  const ps = pids.length && findBin('ps', "the claudes' memory goes unsaid");

  if (!ps) return { rss: 0, n: 0 };

  try {
    const out = (await execFileP(ps, ['-o', 'rss=', '-p', pids.join(',')], { timeout: 3000 })).stdout
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter(Number.isFinite);

    return { rss: out.reduce((sum, size) => sum + size, 0) * 1024, n: out.length };
  } catch (error) {
    return error.code === 1 ? { rss: 0, n: 0 } : { rss: null, n: pids.length };
  } // 1: none of them alive any more
}

// The two memories are read at most every MEM_EVERY_MS, one reading for every page that asks (2026-10-15; on every ask
// before): each is a process (vm_stat, ps), and each page asks every 3 s. CPU is read on every ask — it spawns nothing.
const MEM_EVERY_MS = 15_000;
const memRead = new Map(); // 'mem' · 'claude' → { at, p }, the reading's promise

function memOnce(kind, read) {
  const reading = memRead.get(kind);

  if (reading && Date.now() - reading.at < MEM_EVERY_MS) return reading.p;
  const promise = read();

  memRead.set(kind, { at: Date.now(), p: promise });
  return promise;
}

/** What the status bar asks for: `want` is a set of cpu · mem · claude. */
export async function machineStats(want) {
  const out = {};

  if (want.has('cpu')) out.cpu = cpuBusy();
  if (want.has('mem')) out.mem = await memOnce('mem', memUsed);
  if (want.has('claude')) out.claude = await memOnce('claude', claudeMem);
  return out;
}
