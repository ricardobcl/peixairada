#!/usr/bin/env node
// A stand-in for `pmset` — the calls the board makes of it to keep the Mac awake (2026-10-08): `pmset -g`, of which it
// reads SleepDisabled and the idle sleep in use, `pmset -g ps`, the power drawn from (2026-10-09), and
// `pmset -a disablesleep 0|1`, which on a real Mac takes root. SleepDisabled lives in FAKE_PMSET_FILE ("0" or "1"); the
// power in FAKE_PMSET_POWER, its source and the idle minutes on it ("ac 0": on a charger, never sleeping on its own),
// "battery 1" when there is none. Every test server is handed this script (PMSET_BIN) and AWAKE_ADMIN=none, so no test
// asks for a password or changes how this Mac sleeps.
import { readFileSync, writeFileSync } from 'node:fs';
const file = process.env.FAKE_PMSET_FILE;
if (!file) { console.error('fakepmset: FAKE_PMSET_FILE is not set'); process.exit(2); }
const args = process.argv.slice(2);
const read = () => { try { return readFileSync(file, 'utf8').trim() === '1' ? 1 : 0; } catch { return 0; } };
const power = () => { let t = ''; try { t = readFileSync(process.env.FAKE_PMSET_POWER || '', 'utf8').trim(); } catch {} const [src, min] = (t || 'battery 1').split(/\s+/); return { src, min: Number(min) || 0 }; };
if (args[0] === '-g' && args[1] === 'ps') {
  const ac = power().src === 'ac';
  process.stdout.write(`Now drawing from '${ac ? 'AC' : 'Battery'} Power'\n -InternalBattery-0 (id=1)\t${ac ? '100%; charged; 0:00' : '80%; discharging; 4:00'} remaining present: true\n`);
} else if (args[0] === '-g') {
  process.stdout.write(`System-wide power settings:\n SleepDisabled\t\t${read()}\nCurrently in use:\n Sleep On Power Button 1\n disksleep            10\n sleep                ${power().min}\n displaysleep         10\n`);
} else if (args[0] === '-a' && args[1] === 'disablesleep' && /^[01]$/.test(args[2] || '')) {
  if (process.env.FAKE_PMSET_FAIL) { console.error(process.env.FAKE_PMSET_FAIL); process.exit(1); }
  writeFileSync(file, args[2]);
} else { console.error(`fakepmset: no such call: ${args.join(' ')}`); process.exit(2); }
