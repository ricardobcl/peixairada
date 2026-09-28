#!/usr/bin/env node
// A stand-in for `gh` — the one call the board makes of it for PR state and title, `gh api graphql -f query={…}`,
// answered from a JSON file instead of GitHub, so a fixture's PR chips come out coloured and titled offline.
//   GH_BIN=scripts/fakegh.mjs FAKEGH_PRS=<file>   the file maps "owner/repo#n" → { state: OPEN|MERGED|CLOSED, title, isDraft? }
// Anything else a PR's entry holds is handed back as GitHub would — the fields whose move it is goes by (author,
// headRefOid, viewerLatestReview, reviews, comments, pushes, asks, reviewRequests: server.mjs's PR_FIELDS) — and
// `viewer` is FAKEGH_VIEWER, else `me`. The file is read on every call, so a test moves a PR by rewriting it.
// A PR the file does not name is one GitHub would not show us (null), as the real call answers it. Anything else asked
// of it (a clone) fails, loudly.
import { readFileSync } from 'node:fs';

const [cmd, sub, flag, arg] = process.argv.slice(2);
if (cmd !== 'api' || sub !== 'graphql' || flag !== '-f' || !arg?.startsWith('query=')) { console.error(`fakegh: only \`api graphql -f query=…\` is faked, not: ${process.argv.slice(2).join(' ')}`); process.exit(2); }
let prs = {};
try { prs = JSON.parse(readFileSync(process.env.FAKEGH_PRS, 'utf8')); } catch {}
const data = { viewer: { login: process.env.FAKEGH_VIEWER || 'me' } };
for (const m of arg.matchAll(/(p\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\) \{ pullRequest\(number: (\d+)\)/g)) {
  const pr = prs[`${m[2]}/${m[3]}#${m[4]}`];
  data[m[1]] = pr ? { pullRequest: { ...pr, isDraft: !!pr.isDraft } } : null;
}
process.stdout.write(JSON.stringify({ data }) + '\n');
