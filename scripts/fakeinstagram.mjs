#!/usr/bin/env node
// A stand-in for lib/instagram.mjs (2026-10-18): its one command, `look`, answered from FAKEIG_FILE, a JSON object —
//   { profiles: { <handle>: { id, storyAt, posts: [{ code, pk, at, caption, alt, image, url }] } | { error } } }
// — every call appended to FAKEIG_LOG, one line of its arguments. Any other command is refused, as the real one does
// since its login went (2026-11-23). A post's `image` is any address the server can fetch: a data: URL in the tests.
import { appendFileSync, readFileSync } from 'node:fs';

const [cmd, ...names] = process.argv.slice(2), file = process.env.FAKEIG_FILE;
if (process.env.FAKEIG_LOG) appendFileSync(process.env.FAKEIG_LOG, [cmd, ...names].join(' ') + '\n');
let d = {}; try { d = JSON.parse(readFileSync(file, 'utf8')); } catch {}
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
if (cmd === 'look') out({ places: Object.fromEntries(names.map(h => [h, d.profiles?.[h] || { error: 'no such account' }])) });
else { process.stderr.write(`fakeinstagram: no command ${cmd}\n`); process.exit(2); }
