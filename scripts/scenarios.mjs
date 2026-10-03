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
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'scripts', 'scenarios');
const args = process.argv.slice(2);
const retry = !args.includes('--no-retry');
const pats = args.filter(a => !a.startsWith('--'));

const all = readdirSync(DIR).filter(f => f.endsWith('.mjs')).sort();
const names = all.filter(f => !pats.length || pats.some(p => f.includes(p)));
if (!names.length) { console.error(`no scenario matches ${pats.join(' ')} — have: ${all.map(f => f.replace('.mjs', '')).join(', ')}`); process.exit(2); }

const run = file => new Promise(resolve => {
  const t0 = Date.now();
  // past its own bail and cleanup, a scenario is ended (SIGTERM, which it cleans up on) rather than hang the suite
  const p = spawn(process.execPath, [join(ROOT, 'scripts', 'scenario.mjs'), join(DIR, file)], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  p.on('close', code => resolve({ code, out, ms: Date.now() - t0 }));
});
/** The one line worth showing from a failed run — the assertion or the wait that gave up. */
const why = out => (out.split('\n').find(l => /FAILED:/.test(l)) || out.split('\n').filter(Boolean).pop() || '')
  .replace(/^\[[^\]]+\]\s*/, '').replace(/^(Error|AssertionError)[^:]*:\s*/, '').slice(0, 120);

const secs = ms => `${(ms / 1000).toFixed(1)}s`;
const results = [];
for (const file of names) {
  const name = file.replace('.mjs', '');
  process.stdout.write(`${name.padEnd(22)} … `);
  let r = await run(file);
  let flaky = null;
  if (r.code !== 0 && retry) {
    process.stdout.write(`failed — again … `);
    const again = await run(file);
    if (again.code === 0) flaky = why(r.out);   // what it failed on the first time: a flake nobody can see is no use
    r = again;
  }
  const state = r.code !== 0 ? 'FAIL' : flaky ? 'FLAKY' : 'ok';
  console.log(`${state} ${secs(r.ms)}${r.code !== 0 ? ` — ${why(r.out)}` : flaky ? ` — first run: ${flaky}` : ''}`);
  if (r.code !== 0) console.log(r.out.split('\n').filter(l => !/^\[peixairada\]/.test(l)).join('\n').trimEnd().split('\n').slice(-25).join('\n'));
  results.push({ name, state, ms: r.ms, flaky });
}

const bad = results.filter(r => r.state === 'FAIL');
const flaky = results.filter(r => r.state === 'FLAKY');
const total = results.reduce((n, r) => n + r.ms, 0);
console.log(`\n${results.length - bad.length}/${results.length} passed in ${secs(total)}` +
  (flaky.length ? ` · flaky (passed on the second run): ${flaky.map(r => r.name).join(', ')}` : '') +
  (bad.length ? ` · failed: ${bad.map(r => r.name).join(', ')}` : ''));
process.exit(bad.length ? 1 : 0);
