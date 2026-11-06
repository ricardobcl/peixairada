#!/usr/bin/env node
// A stand-in for the osascript that opens a tab with the key (2026-10-16 as `open`; osascript since 2026-11-06, the URL
// on its stdin as `open location "…"`, never an argument): the URL it would open in this Mac's browser is written to
// FAKE_OPEN_LOG, a line each, its own arguments to FAKE_OPEN_LOG.argv, and nothing is opened.
import { appendFileSync } from 'node:fs';
let script = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { script += c; });
process.stdin.on('end', () => {
  const url = (() => { try { return JSON.parse(/^open location (".*")\s*$/m.exec(script)?.[1] ?? '""'); } catch { return ''; } })();
  if (process.env.FAKE_OPEN_LOG) { appendFileSync(process.env.FAKE_OPEN_LOG, `${url}\n`); appendFileSync(`${process.env.FAKE_OPEN_LOG}.argv`, `${JSON.stringify(process.argv.slice(2))}\n`); }
});
