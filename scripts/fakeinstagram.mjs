#!/usr/bin/env node
// A stand-in for lib/instagram.mjs (2026-10-18): the same four commands, answered from FAKEIG_FILE, a JSON object —
//   { loggedIn, user, profiles: { <handle>: { id, storyAt, posts: [{ code, pk, at, caption, alt, image, url }] } | { error } },
//     stories: { <handle>: [{ pk, at, image, url }] } }
// — every call appended to FAKEIG_LOG, one line of its arguments. `login` logs the file in (loggedIn: true, user: 'me').
// A post's or a story's `image` is any address the server can fetch: a data: URL in the tests.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const [cmd, ...rest] = process.argv.slice(2), file = process.env.FAKEIG_FILE;
if (process.env.FAKEIG_LOG) appendFileSync(process.env.FAKEIG_LOG, [cmd, ...rest].join(' ') + '\n');
let d = {}; try { d = JSON.parse(readFileSync(file, 'utf8')); } catch {}
const names = rest.filter((x, i) => x !== '--profile' && rest[i - 1] !== '--profile');
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
if (cmd === 'look') out({ places: Object.fromEntries(names.map(h => [h, d.profiles?.[h] || { error: 'no such account' }])) });
else if (cmd === 'stories') {
  if (!d.loggedIn) out({ loggedIn: false, stories: {} });
  else { const ids = new Set(names), by = Object.entries(d.profiles || {}).filter(([, p]) => ids.has(String(p.id))).map(([h]) => h); out({ loggedIn: true, user: d.user || 'me', stories: Object.fromEntries(by.map(h => [h, d.stories?.[h] || []])) }); }
}
else if (cmd === 'login') { d.loggedIn = true; d.user ||= 'me'; if (file) writeFileSync(file, JSON.stringify(d)); out({ loggedIn: true, user: d.user }); }
else if (cmd === 'check') out({ loggedIn: !!d.loggedIn, user: d.loggedIn ? d.user || 'me' : null });
else { process.stderr.write(`fakeinstagram: no command ${cmd}\n`); process.exit(2); }
