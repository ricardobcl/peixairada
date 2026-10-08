#!/usr/bin/env node
// A stand-in for `pmset` — the two calls the board makes of it to keep the Mac awake with its lid closed (2026-10-08):
// `pmset -g`, of which it reads SleepDisabled, and `pmset -a disablesleep 0|1`, which on a real Mac takes root. The
// setting lives in FAKE_PMSET_FILE ("0" or "1"); every test server is handed this script (PMSET_BIN) and AWAKE_ADMIN=none,
// so no test asks for a password or changes how this Mac sleeps.
import { readFileSync, writeFileSync } from 'node:fs';
const file = process.env.FAKE_PMSET_FILE;
if (!file) { console.error('fakepmset: FAKE_PMSET_FILE is not set'); process.exit(2); }
const args = process.argv.slice(2);
const read = () => { try { return readFileSync(file, 'utf8').trim() === '1' ? 1 : 0; } catch { return 0; } };
if (args[0] === '-g') {
  process.stdout.write(`System-wide power settings:\n SleepDisabled\t\t${read()}\nCurrently in use:\n sleep                1\n displaysleep         10\n`);
} else if (args[0] === '-a' && args[1] === 'disablesleep' && /^[01]$/.test(args[2] || '')) {
  if (process.env.FAKE_PMSET_FAIL) { console.error(process.env.FAKE_PMSET_FAIL); process.exit(1); }
  writeFileSync(file, args[2]);
} else { console.error(`fakepmset: no such call: ${args.join(' ')}`); process.exit(2); }
