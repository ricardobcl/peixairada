#!/usr/bin/env node
// A stand-in for `caffeinate -i -w <pid>` (2026-10-08): it holds no assertion, only lives as the real one would — until
// the process it waits on is gone, or it is ended. Every test server is handed it (CAFFEINATE_BIN), so no test keeps
// this Mac awake; FAKE_CAFFEINATE_PIDS, when set, gets a line with its pid, for a test to look for it.
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2), w = args.indexOf('-w'), pid = w >= 0 ? Number(args[w + 1]) : 0;
if (process.env.FAKE_CAFFEINATE_PIDS) appendFileSync(process.env.FAKE_CAFFEINATE_PIDS, `${process.pid} ${args.join(' ')}\n`);
const alive = p => { try { process.kill(p, 0); return true; } catch { return false; } };
setInterval(() => { if (pid && !alive(pid)) process.exit(0); }, 300);
