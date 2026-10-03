#!/usr/bin/env node
// Headless-browser check of the live board: evaluate one expression on the real page and print the result.
//   node scripts/verify.mjs "document.querySelectorAll('.card').length"
//   node scripts/verify.mjs --hash <session-id> "document.querySelectorAll('.text.md').length"
//   URL=http://127.0.0.1:7399/ node scripts/verify.mjs "…"
//   node scripts/verify.mjs --shot /tmp/board.png "1"      # also save a screenshot after the expression
//   DARK=1 node scripts/verify.mjs …                      # emulate prefers-color-scheme: dark
// For anything with more than one step — attach, wait, act, measure — write a scenario (scripts/scenario.mjs).
import { launchChrome, openBoard } from '../lib/cdp.mjs';

const URL_ = process.env.URL || 'http://127.0.0.1:7331/';
const TIMEOUT = Number(process.env.TIMEOUT_MS || 20000);
const args = process.argv.slice(2);
let hash = null, shot = null;
const hi = args.indexOf('--hash'); if (hi !== -1) { hash = args[hi + 1]; args.splice(hi, 2); }
const si = args.indexOf('--shot'); if (si !== -1) { shot = args[si + 1]; args.splice(si, 2); }
const expr = args.join(' ');
if (!expr) { console.error('usage: node scripts/verify.mjs [--hash <session-id>] [--shot file.png] "<js expression>"'); process.exit(2); }

// Chrome is closed — and its profile removed — on every way out, awaited (2026-10-03: an exit hook cannot wait for
// Chrome's own exit, so every run left its profile in $TMPDIR).
let cdp = null;
const bail = setTimeout(async () => { console.error(`timed out after ${TIMEOUT}ms`); await Promise.race([cdp?.close(), new Promise(r => setTimeout(r, 4000))]); process.exit(1); }, TIMEOUT);
try {
  cdp = await launchChrome({ port: process.env.CDP_PORT ? Number(process.env.CDP_PORT) : undefined, dark: !!process.env.DARK });
  await openBoard(cdp, URL_, { hash });
  let out;
  try { out = { value: await cdp.evaluate(expr) }; } catch (e) { out = { error: e.message }; }
  if (shot) { await cdp.shot(shot); console.error('screenshot → ' + shot); }
  if (out.error) { console.error('EXCEPTION:', out.error); process.exitCode = 1; }
  else console.log(typeof out.value === 'string' ? out.value : JSON.stringify(out.value, null, 1));
  if (cdp.exceptions.length) { console.error('page JS exceptions:', cdp.exceptions); process.exitCode = 1; }
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { clearTimeout(bail); await cdp?.close(); }
process.exit(process.exitCode || 0);
