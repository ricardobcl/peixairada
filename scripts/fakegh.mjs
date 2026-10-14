#!/usr/bin/env node
// A stand-in for `gh` — the one call the board makes of it for PR state and title, `gh api graphql -f query={…}`,
// answered from a JSON file instead of GitHub, so a fixture's PR chips come out coloured and titled offline.
//   GH_BIN=scripts/fakegh.mjs FAKEGH_PRS=<file>   the file maps "owner/repo#n" → { state: OPEN|MERGED|CLOSED, title, isDraft? }
// Anything else a PR's entry holds is handed back as GitHub would — the fields whose move it is goes by (author,
// headRefOid, viewerLatestReview, reviews, comments, pushes, asks, reviewRequests: server.mjs's PR_FIELDS) — and
// `viewer` is FAKEGH_VIEWER, else `me`. The file is read on every call, so a test moves a PR by rewriting it.
// **Only what the query asks for** (2026-10-14: the entry was echoed whole, so a field dropped or renamed in PR_FIELDS
// still passed every test): the answer is the query's own selection, an entry's field it does not name — at any depth —
// fails the call loudly (stderr, exit 2, nothing on stdout), and a field the entry leaves out is GitHub's empty for it:
// null, false for a Boolean! (isDraft, isCrossRepository), `{ nodes: [] }` for a connection; a field of an inline fragment
// only on a node whose __typename is that fragment's. `diff` is the fake's own (below).
// A PR the file does not name is one GitHub has not got: null, a NOT_FOUND in `errors` and a non-zero exit, as the real
// call answers it (2026-10-06: the board lets a short reference go on that).
// FAKEGH_FAIL (2026-10-14): the call failing as a whole — offline, rate-limited — its value on stderr, nothing on stdout,
// exit 1; an absolute path fails it only while that file is there (its text the error), so a test turns it on and off
// under a running server.
//   `repo clone <owner/name> <dir> [-- --progress]` (2026-10-09): no network — the folder made at once, as git makes it,
// git's progress on stderr over FAKEGH_CLONE_MS (1200 by default), then a `.git/config` naming the origin and a README.
// A repo named `no-such-…` is one GitHub has not got: gh's error, a non-zero exit, and the folder gone again.
//   `pr diff <url> [--color never]` (2026-10-13): the PR's entry's `diff`, a unified patch as GitHub's; an entry with none,
// or no entry, is gh's error and a non-zero exit.
// Anything else asked of it fails, loudly.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/** A GraphQL document's tokens: names, punctuation, the spread, strings and numbers (arguments, skipped). */
function tokens(src) { return src.match(/\.\.\.|[{}():,[\]$!=@]|"(?:[^"\\]|\\.)*"|-?\d[\d.]*|[A-Za-z_]\w*/g) || []; }
/** The selection set at `at` (a `{`) as a tree: each field by its alias, else its name → { sub: its own tree or null for a
 *  scalar, on: the types of the inline fragments it came from, or null when it is asked for whatever the type }. */
function selection(t, at) {
  const sel = {}, put = (key, f) => {
    const was = sel[key];
    if (!was) return void (sel[key] = f);
    if (f.sub) was.sub = { ...(was.sub || {}), ...f.sub };   // the same field twice (two fragments): what either asks
    was.on = was.on && f.on ? new Set([...was.on, ...f.on]) : null;
  };
  let i = at + 1;
  while (i < t.length && t[i] !== '}') {
    if (t[i] === '...') {   // `... on Type { … }`
      const type = t[i + 2], r = selection(t, i + 3);
      for (const [k, f] of Object.entries(r.sel)) put(k, { sub: f.sub, on: f.on || new Set([type]) });
      i = r.end; continue;
    }
    const key = t[i++];
    if (t[i] === ':') i += 2;   // an alias: the answer is keyed by it
    if (t[i] === '(') { let depth = 0; do { if (t[i] === '(') depth++; else if (t[i] === ')') depth--; i++; } while (depth && i < t.length); }
    let sub = null;
    if (t[i] === '{') { const r = selection(t, i); sub = r.sel; i = r.end; }
    put(key, { sub, on: null });
  }
  return { sel, end: i + 1 };
}
const NOT_NULL = new Set(['isDraft', 'isCrossRepository']);   // Boolean! in GitHub's schema: false, never null
/** GitHub's answer for a field the entry leaves out. */
const blank = (key, f) => f.sub ? ('nodes' in f.sub ? { nodes: [] } : null) : NOT_NULL.has(key) ? false : null;
/** The entry's value cut to the selection `sel`; every key it holds that `sel` does not name goes to `unasked`. */
function shape(v, sel, path, unasked) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map((x, i) => shape(x, sel, `${path}[${i}]`, unasked));
  if (!sel || typeof v !== 'object') return v;
  for (const k of Object.keys(v)) if (!(k in sel)) unasked.push(`${path}.${k}`);
  const out = {};
  for (const [k, f] of Object.entries(sel)) {
    if (k in v) out[k] = shape(v[k], f.sub, `${path}.${k}`, unasked);
    else if (!f.on || f.on.has(v.__typename)) out[k] = blank(k, f);
  }
  return out;
}

const [cmd, sub, flag, arg] = process.argv.slice(2);
if (cmd === 'repo' && sub === 'clone') {
  const [ref, dir] = [flag, arg];
  if (!/^[\w.-]+\/[\w.-]+$/.test(ref || '') || !dir) { console.error(`fakegh: repo clone <owner/name> <dir>, not: ${process.argv.slice(2).join(' ')}`); process.exit(2); }
  const progress = process.argv.includes('--progress'), ms = Number(process.env.FAKEGH_CLONE_MS ?? 1200), steps = 10;
  mkdirSync(dir, { recursive: true });
  process.stderr.write(`Cloning into '${dir}'...\n`);
  if (ref.split('/')[1].startsWith('no-such-')) {
    setTimeout(() => { rmSync(dir, { recursive: true, force: true }); console.error(`GraphQL: Could not resolve to a Repository with the name '${ref}'. (repository)`); process.exit(1); }, ms / 4);
  } else {
    let i = 0;
    const tick = setInterval(() => {
      i++;
      if (progress) process.stderr.write(i <= 7 ? `Receiving objects: ${String(Math.round(i / 7 * 100)).padStart(3)}% (${i * 10}/70)\r` : `Resolving deltas: ${String(Math.round((i - 7) / 3 * 100)).padStart(3)}% (${i - 7}/3)\r`);
      if (i < steps) return;
      clearInterval(tick);
      mkdirSync(join(dir, '.git'), { recursive: true });
      writeFileSync(join(dir, '.git', 'config'), `[remote "origin"]\n\turl = https://github.com/${ref}.git\n`);
      writeFileSync(join(dir, 'README.md'), `# ${ref}\n`);
      if (progress) process.stderr.write('Resolving deltas: 100% (3/3), done.\n');
    }, ms / steps);
  }
} else if (cmd === 'pr' && sub === 'diff') {
  let prs = {};
  try { prs = JSON.parse(readFileSync(process.env.FAKEGH_PRS, 'utf8')); } catch {}
  const m = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/.exec(flag || ''), pr = m && prs[`${m[1]}/${m[2]}#${m[3]}`];
  if (pr?.diff) process.stdout.write(pr.diff);
  else { console.error(`could not find pull request diff: ${pr ? 'no diff in the fixture' : 'HTTP 404: Not Found'}`); process.exitCode = 1; }
} else {
  if (cmd !== 'api' || sub !== 'graphql' || flag !== '-f' || !arg?.startsWith('query=')) { console.error(`fakegh: only \`api graphql -f query=…\` is faked, not: ${process.argv.slice(2).join(' ')}`); process.exit(2); }
  const fail = process.env.FAKEGH_FAIL;
  if (fail && (!isAbsolute(fail) || existsSync(fail))) {
    let why = fail; if (isAbsolute(fail)) { try { why = readFileSync(fail, 'utf8').trim(); } catch {} why ||= 'HTTP 502: Bad Gateway (https://api.github.com/graphql)'; }
    console.error(`gh: ${why}`); process.exit(1);
  }
  let prs = {};
  try { prs = JSON.parse(readFileSync(process.env.FAKEGH_PRS, 'utf8')); } catch {}
  const query = selection(tokens(arg.slice('query='.length)), 0).sel;
  const data = { viewer: { login: process.env.FAKEGH_VIEWER || 'me' } }, errors = [], unasked = [];
  for (const m of arg.matchAll(/(p\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\) \{ pullRequest\(number: (\d+)\)/g)) {
    const key = `${m[2]}/${m[3]}#${m[4]}`, pr = prs[key];
    if (pr) { const { diff, ...entry } = pr; data[m[1]] = { pullRequest: shape(entry, query[m[1]].sub.pullRequest.sub, key, unasked) }; }
    else data[m[1]] = null;
    if (!pr) errors.push({ type: 'NOT_FOUND', path: [m[1], 'pullRequest'], message: `Could not resolve to a PullRequest with the number of ${m[4]}.` });
  }
  if (unasked.length) { console.error(`fakegh: the fixture has what the query does not ask for — ${unasked.join(', ')} (a field PR_FIELDS dropped or renamed?)`); process.exit(2); }
  process.stdout.write(JSON.stringify(errors.length ? { data, errors } : { data }) + '\n');
  if (errors.length) { console.error(errors.map(e => `gh: ${e.message}`).join('\n')); process.exitCode = 1; }
}
