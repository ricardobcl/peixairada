#!/usr/bin/env node
// The tests' own static checks (2026-10-14), `npm run check`: what keeps a test from reaching this Mac's files.
// **The environment first**: server.mjs reads where its state lives as it is imported, so `npm test` preloads
// test/env.mjs, and a test file that imports server.mjs either imports ./env.mjs above it (a file run alone is the same)
// or sets STATE_FILE itself before a dynamic import of it.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(join(ROOT, f), 'utf8');
const fails = [];

const npmTest = JSON.parse(read('package.json')).scripts?.test || '';
if (!/--import[= ]\.\/test\/env\.mjs\b/.test(npmTest)) fails.push(`package.json: the test script does not preload ./test/env.mjs (node --import ./test/env.mjs --test …): ${npmTest}`);

const tests = readdirSync(join(ROOT, 'test')).filter(f => f.endsWith('.mjs')).map(f => `test/${f}`);
for (const f of tests) {
  const t = read(f), at = re => { const m = re.exec(t); return m ? m.index : -1; };
  const env = at(/^import '\.\/env\.mjs';/m), stat = at(/^import [^;]*from '\.\.\/server\.mjs';/m), dyn = at(/import\('\.\.\/server\.mjs'\)/), own = at(/process\.env\.STATE_FILE = /);
  if (stat >= 0 && !(env >= 0 && env < stat)) fails.push(`${f}: imports ../server.mjs without import './env.mjs' above it`);
  if (dyn >= 0 && !(env >= 0 && env < dyn) && !(own >= 0 && own < dyn)) fails.push(`${f}: imports ../server.mjs before setting STATE_FILE or importing ./env.mjs`);
}

if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
