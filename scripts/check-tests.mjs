#!/usr/bin/env node
// The tests' own static checks (2026-10-14), `npm run check`.
// **The environment**: server.mjs reads where its state lives as it is imported, so `npm test` preloads test/env.mjs,
// and a test file that imports server.mjs either imports ./env.mjs above it (a file run alone is the same) or sets
// STATE_FILE itself before a dynamic import of it.
// **No temp dir left behind**: a test or a scenario makes its folders with lib/testserver.mjs's tmpDir(), which removes
// each as the process exits — a bare mkdtempSync left some 280 in $TMPDIR in four days.
// **Every route is named**: each path server.mjs's HTTP section answers is written out in test/ or scripts/scenarios/,
// or is on DRIVEN below with the scenario that drives it through the page — by the path, whatever the method.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(join(ROOT, f), 'utf8');
const fails = [];

const npmTest = JSON.parse(read('package.json')).scripts?.test || '';
if (!/--import[= ]\.\/test\/env\.mjs\b/.test(npmTest)) fails.push(`package.json: the test script does not preload ./test/env.mjs (node --import ./test/env.mjs --test …): ${npmTest}`);

const files = ['test', 'scripts/scenarios'].flatMap(d => readdirSync(join(ROOT, d)).filter(f => f.endsWith('.mjs')).map(f => `${d}/${f}`));
for (const f of files) {
  const t = read(f), at = re => { const m = re.exec(t); return m ? m.index : -1; };
  if (/\bmkdtempSync\b/.test(t)) fails.push(`${f}: a bare mkdtempSync — tmpDir() from lib/testserver.mjs removes its folder on exit`);
  if (!f.startsWith('test/')) continue;
  const env = at(/^import '\.\/env\.mjs';/m), stat = at(/^import [^;]*from '\.\.\/server\.mjs';/m), dyn = at(/import\('\.\.\/server\.mjs'\)/), own = at(/process\.env\.STATE_FILE = /);
  if (stat >= 0 && !(env >= 0 && env < stat)) fails.push(`${f}: imports ../server.mjs without import './env.mjs' above it`);
  if (dyn >= 0 && !(env >= 0 && env < dyn) && !(own >= 0 && own < dyn)) fails.push(`${f}: imports ../server.mjs before setting STATE_FILE or importing ./env.mjs`);
}

// Routes no test writes out, each with what drives it through the page (a click, not a path): one a test names may come
// off, and one server.mjs no longer answers fails here.
const DRIVEN = {
  '/': 'lib/cdp.mjs',   // the page itself: every scenario opens it
  '/vendor/:id': 'lib/cdp.mjs',   // its scripts and styles, with it
  '/api/sessions/:id/drift': 'scripts/scenarios/branch-drift.mjs',   // the branch's chip clicked
  '/api/sessions/:id/waive': 'scripts/scenarios/let-go.mjs',   // ⌥-click on your move
  '/api/sessions/:id/unlink': 'scripts/scenarios/header-prs.mjs',   // ⌥-click on a PR chip
  '/api/sessions/:id/changes': 'scripts/scenarios/changes-tab.mjs',
  '/api/sessions/:id/switch': 'scripts/scenarios/editor-branch.mjs',   // Editor ▾'s Switch this folder…
  '/api/worktrees': 'scripts/scenarios/editor-branch.mjs',
  '/api/worktrees/modules': 'scripts/scenarios/editor-branch.mjs',   // Link node_modules
  '/api/worktrees/branch': 'scripts/scenarios/chat-worktree.mjs',   // ⌥⌘N's new worktree
  '/api/worktrees/bases': 'scripts/scenarios/chat-worktree.mjs',    // …and what its new branch starts from (2026-10-28)
};
/** A route's regex literal as a path: each group a `:id`. */
const asPath = src => { let out = '', depth = 0; for (const c of src.replace(/\\\//g, '/')) { if (c === '(' && !depth++) out += ':id'; else if (c === ')') depth--; else if (!depth) out += c; } return out; };
const server = read('server.mjs'), http = server.slice(server.indexOf('\n// HTTP\n'), server.indexOf('\n// Boot'));
if (http.length < 1000) fails.push('server.mjs: the HTTP section was not found (its banner, then the Boot one)');
const routes = new Set([...http.matchAll(/\bp === '(\/[^']*)'/g)].map(m => m[1]).concat([...http.matchAll(/\bp\.match\(\/\^(.+?)\$\/\)/g)].map(m => asPath(m[1]))));
const corpus = files.map(read).join('\n'), esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const r of routes) {
  if (DRIVEN[r]) continue;
  const parts = r.slice(1).split(':id').map(esc), named = new RegExp(`(?<=['"\`/])${parts.join(".{1,60}?")}${r.endsWith(':id') ? "[^\\s'\"`)]" : '(?![\\w/-])'}`);
  if (!named.test(corpus)) fails.push(`server.mjs answers ${r}, which no test or scenario names: test it, or put it on DRIVEN (scripts/check-tests.mjs) with the scenario that drives it`);
}
for (const [r, by] of Object.entries(DRIVEN)) {
  if (!routes.has(r)) fails.push(`scripts/check-tests.mjs: DRIVEN names ${r}, which server.mjs no longer answers`);
  if (!existsSync(join(ROOT, by))) fails.push(`scripts/check-tests.mjs: DRIVEN's ${r} is driven by ${by}, which is not there`);
}

if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log(`${files.length} test and scenario files: their environment, their temp dirs; ${routes.size} routes, each named or driven`);
