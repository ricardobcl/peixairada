#!/usr/bin/env node
// A stand-in for go-task (`task`) in tests — for the folders whose Taskfile launches claude (server.mjs, launchersFor):
//   faketask.mjs --list --json     → two tasks, one whose description mentions Claude (the launcher), one that does not
//   faketask.mjs <name>            → runs the fake claude as a *child* (not exec), the way task runs a command, so the
//                                    chat's pid is below the PTY's and the board has to find it through `ps`, as with
//                                    the real thing (task → sh → mise → claude). FAKE_ENV carries the name down.
// FAKE_TASK_LOG, when set, gets a line per run: its arguments (2026-10-16 — a folder Claude Code has not trusted is never
// asked).
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (process.env.FAKE_TASK_LOG) appendFileSync(process.env.FAKE_TASK_LOG, `${args.join(' ')}\n`);
if (args.includes('--list')) {
  process.stdout.write(JSON.stringify({ tasks: [
    { name: 'production-workload', desc: 'Launch Claude Code against the production workload cluster' },
    { name: 'setup', desc: 'Install dependencies and configure CLI tools' },
  ] }, null, 2) + '\n');
  process.exit(0);
}
const name = args[0];
if (name !== 'production-workload') { console.error(`task: Task "${name}" does not exist`); process.exit(1); }
const child = spawn(process.execPath, [fileURLToPath(new URL('./fakeclaude.mjs', import.meta.url))], { stdio: 'inherit', env: { ...process.env, FAKE_ENV: name } });
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => child.kill(sig));
child.on('exit', code => process.exit(code ?? 1));
