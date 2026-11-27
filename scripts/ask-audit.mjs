#!/usr/bin/env node
// A week's audit of the board's questions (2026-11-02, round XIX's P3): does every time the registry says a chat is waiting
// become an alert? It logs each chat's flips of status, read only and from the sessions' own files (never a .key), with no
// words of any chat in them, for seven days, then takes itself off launchd.
//   launchctl submit -l net.peixairada.askaudit -- "$(which node)" "$PWD/scripts/ask-audit.mjs"
//   node scripts/ask-audit.mjs --report
import { execFileSync } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OUT = join(homedir(), 'Library/Logs/peixairada-ask-audit.jsonl');
const APP = join(homedir(), 'Library/Logs/peixairada-app.log');

const DIR = join(process.env.CLAUDE_DIR || join(homedir(), '.claude'), 'sessions');

const EVERY_MS = 3000;
const FOR_MS = 7 * 86400e3;
const NEAR_MS = 30_000;
const NOT_ASKING = new Set(['dialog open']);

if (process.argv.includes('--report')) report();
else watch();

function watch() {
  const last = new Map();
  const started = Date.now();

  const look = () => {
    if (Date.now() - started > FOR_MS) {
      try {
        execFileSync('/bin/launchctl', ['remove', 'net.peixairada.askaudit']);
      } catch {}

      process.exit(0);
    }

    const seen = new Set();
    let files;

    try {
      files = readdirSync(DIR).filter(file => /^\d+\.json$/.test(file));
    } catch {
      return;
    }

    for (const file of files) {
      let entry;

      try {
        entry = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
      } catch {
        continue;
      }

      const key = String(entry.pid);
      const now = `${entry.status}|${entry.waitingFor || ''}`;

      seen.add(key);

      if (last.get(key) !== now) {
        last.set(key, now);

        appendFileSync(
          OUT,
          `${JSON.stringify({
            at: Date.now(),
            pid: entry.pid,
            sid: String(entry.sessionId || '').slice(0, 8),
            status: entry.status,
            waitingFor: entry.waitingFor || null,
            kind: entry.kind,
          })}\n`,
        );
      }
    }

    for (const pid of last.keys()) if (!seen.has(pid)) last.delete(pid);
  };

  look();
  setInterval(look, EVERY_MS);
}

function report() {
  const flips = readFileSync(OUT, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));

  const asks = flips.filter(flip => flip.status === 'waiting' && !NOT_ASKING.has(flip.waitingFor));

  const alerts = readFileSync(APP, 'utf8')
    .split('\n')
    .map(line => /^(\S+) alert: kind=needs-input/.exec(line))
    .filter(Boolean)
    .map(match => Date.parse(match[1]))
    .filter(time => time >= flips[0].at - NEAR_MS);

  const missed = asks.filter(ask => !alerts.some(time => Math.abs(time - ask.at) <= NEAR_MS));
  const by = {};

  for (const ask of asks) by[ask.waitingFor || '(none)'] = (by[ask.waitingFor || '(none)'] || 0) + 1;
  const days = ((flips.at(-1).at - flips[0].at) / 86400e3).toFixed(1);

  console.log(
    `${days} days · ${flips.length} flips · ${asks.length} into waiting · ${alerts.length} needs-input alerts · ${missed.length} waiting with no alert within ${NEAR_MS / 1000} s`,
  );

  console.log('what they waited for:', by);

  for (const ask of missed.slice(0, 30)) {
    console.log('  no alert:', new Date(ask.at).toISOString(), ask.sid, ask.waitingFor);
  }
}
