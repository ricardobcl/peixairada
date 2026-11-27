#!/usr/bin/env node
// Every scenario in scripts/scenarios/, one after another, with a line each and a verdict at the end.
//
//   npm run scenarios                 all of them
//   npm run scenarios -- drawer       only the ones whose name contains "drawer"
//   npm run scenarios -- --no-retry   a failure is a failure, first time
//
// One at a time on purpose: each starts its own server and its own Chrome, and a Mac running four of those at
// once is slow enough that a scenario waiting on the machine (lsof over every process, a PTY settling) times out
// on the clock rather than on the board. That is what makes a suite that "sometimes fails", which is worse than
// one that takes four minutes.
//
// A scenario that fails is run **once more**, and if it passes then it is reported FLAKY rather than quietly
// forgiven: the suite still exits 0 — a browser scenario that passes on the second go is usually the machine,
// not the board — but the line stays in the output and in the summary, so a flake that becomes a habit is seen.
// --no-retry is the honest gate for a bisect.
//
// A scenario that needs Chrome's new headless, run under chrome-headless-shell, exits 77 (2026-11-23; `meta.newHeadless`):
// SKIP, never run again, counted apart — the verdict says which and why.
import { execFileSync, spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'scripts', 'scenarios');
const args = process.argv.slice(2);
const retry = !args.includes('--no-retry');
const pats = args.filter(argument => !argument.startsWith('--'));

const all = readdirSync(DIR)
  .filter(file => file.endsWith('.mjs'))
  .sort();

const names = all.filter(file => !pats.length || pats.some(pattern => file.includes(pattern)));

if (!names.length) {
  console.error(
    `no scenario matches ${pats.join(' ')} — have: ${all.map(file => file.replace('.mjs', '')).join(', ')}`,
  );

  process.exit(2);
}

const run = file =>
  new Promise(resolve => {
    const t0 = Date.now();

    // past its own bail and cleanup, a scenario is ended (SIGTERM, which it cleans up on) rather than hang the suite
    const child = spawn(process.execPath, [join(ROOT, 'scripts', 'scenario.mjs'), join(DIR, file)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
    });

    let out = '';

    child.stdout.on('data', chunk => {
      out += chunk;
    });

    child.stderr.on('data', chunk => {
      out += chunk;
    });

    child.on('close', code => resolve({ code, out, ms: Date.now() - t0 }));
  });

/** The one line worth showing from a failed run — the assertion or the wait that gave up. */
const why = out =>
  (out.split('\n').find(line => /FAILED:/.test(line)) || out.split('\n').filter(Boolean).pop() || '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^(Error|AssertionError)[^:]*:\s*/, '')
    .slice(0, 120);

/** What a run left running (2026-10-14): a process whose command line names its server's state dir (the server, its
 *  holders) or its Chrome's profile — read off the run's own log, looked for once the run has exited. A scenario's
 *  cleanup ends them all; one still there is the harness leaking, as three servers did from 2026-10-03 on. */
const leftovers = out => {
  const marks = [...out.matchAll(/\(state (\/[^\s,)]+)|chrome profile (\/\S+)/g)].map(match => match[1] || match[2]);

  if (!marks.length) return [];
  let ps;

  try {
    ps = execFileSync('/bin/ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8', maxBuffer: 64 << 20 });
  } catch {
    return [];
  }

  return ps
    .split('\n')
    .filter(line => marks.some(mark => line.includes(mark)))
    .map(line => line.trim().slice(0, 160));
};

const secs = ms => `${(ms / 1000).toFixed(1)}s`;
const SKIP = 77; // scenario.mjs's exit for a scenario this Chrome cannot run
const results = [];

for (const file of names) {
  const name = file.replace('.mjs', '');

  process.stdout.write(`${name.padEnd(22)} … `);
  let result = await run(file);
  let flaky = null;

  if (result.code !== 0 && result.code !== SKIP && retry) {
    process.stdout.write(`failed — again … `);
    const again = await run(file);

    if (again.code === 0) flaky = why(result.out); // what it failed on the first time: a flake nobody can see is no use
    result = { ...again, first: result.out };
  }

  const state = result.code === SKIP ? 'SKIP' : result.code !== 0 ? 'FAIL' : flaky ? 'FLAKY' : 'ok';

  console.log(
    `${state} ${secs(result.ms)}${result.code !== 0 ? ` — ${why(result.out)}` : flaky ? ` — first run: ${flaky}` : ''}`,
  );

  if (state === 'FAIL') {
    console.log(
      result.out
        .split('\n')
        .filter(line => !/^\[peixairada\]/.test(line))
        .join('\n')
        .trimEnd()
        .split('\n')
        .slice(-25)
        .join('\n'),
    );
  }

  await new Promise(res => setTimeout(res, 500)); // a process on its way out is not a leak
  const leaks = [...(result.first ? leftovers(result.first) : []), ...leftovers(result.out)];

  for (const leak of leaks) console.log(`  LEAK ${leak}`);
  results.push({ name, state, ms: result.ms, flaky, leaks: leaks.length });
}

const bad = results.filter(result => result.state === 'FAIL');
const flaky = results.filter(result => result.state === 'FLAKY');
const leaky = results.filter(result => result.leaks);
const skipped = results.filter(result => result.state === 'SKIP');
const total = results.reduce((sum, result) => sum + result.ms, 0);

console.log(
  `\n${results.length - skipped.length - bad.length}/${results.length - skipped.length} passed in ${secs(total)}${
    skipped.length
      ? ` · skipped (need Chrome's newer headless mode, CHROME is chrome-headless-shell): ${skipped.map(result => result.name).join(', ')}`
      : ''
  }${flaky.length ? ` · flaky (passed on the second run): ${flaky.map(result => result.name).join(', ')}` : ''}${
    bad.length ? ` · failed: ${bad.map(result => result.name).join(', ')}` : ''
  }${leaky.length ? ` · left processes running: ${leaky.map(result => result.name).join(', ')}` : ''}`,
);

process.exit(bad.length ? 1 : 0);
