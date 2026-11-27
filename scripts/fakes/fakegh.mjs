#!/usr/bin/env node
// A stand-in for `gh` — the one call the board makes of it for PR state and title, `gh api graphql -f query={…}`,
// answered from a JSON file instead of GitHub, so a fixture's PR chips come out coloured and titled offline.
//   GH_BIN=scripts/fakes/fakegh.mjs FAKEGH_PRS=<file>   the file maps "owner/repo#n" → { state: OPEN|MERGED|CLOSED, title, isDraft? }
// Anything else a PR's entry holds is handed back as GitHub would — the fields whose move it is goes by (author,
// headRefOid, viewerLatestReview, reviews, comments, pushes, asks, reviewRequests: server/prs/turn.mjs's PR_FIELDS) — and
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
//   `auth token` (2026-10-17): FAKEGH_TOKEN, else `fake-token-<FAKEGH_VIEWER or me>` — what scripts/fakes/fakegithub.mjs takes.
// Anything else asked of it fails, loudly.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/** A GraphQL document's tokens: names, punctuation, the spread, strings and numbers (arguments, skipped). */
function tokens(src) {
  return src.match(/\.\.\.|[{}():,[\]$!=@]|"(?:[^"\\]|\\.)*"|-?\d[\d.]*|[A-Za-z_]\w*/g) || [];
}

/** The selection set at `at` (a `{`) as a tree: each field by its alias, else its name → { sub: its own tree or null for a
 *  scalar, on: the types of the inline fragments it came from, or null when it is asked for whatever the type }. */
function selection(tokenList, at) {
  const sel = {};

  const put = (key, field) => {
    const was = sel[key];

    if (!was) return void (sel[key] = field);
    if (field.sub) was.sub = { ...(was.sub || {}), ...field.sub }; // the same field twice (two fragments): what either asks
    was.on = was.on && field.on ? new Set([...was.on, ...field.on]) : null;
  };

  let index = at + 1;

  while (index < tokenList.length && tokenList[index] !== '}') {
    if (tokenList[index] === '...') {
      // `... on Type { … }`
      const type = tokenList[index + 2];
      const fragment = selection(tokenList, index + 3);

      for (const [name, field] of Object.entries(fragment.sel)) {
        put(name, { sub: field.sub, on: field.on || new Set([type]) });
      }

      index = fragment.end;
      continue;
    }

    const key = tokenList[index++];

    if (tokenList[index] === ':') index += 2; // an alias: the answer is keyed by it

    if (tokenList[index] === '(') {
      let depth = 0;

      do {
        if (tokenList[index] === '(') depth++;
        else if (tokenList[index] === ')') depth--;
        index++;
      } while (depth && index < tokenList.length);
    }

    let sub = null;

    if (tokenList[index] === '{') {
      const nested = selection(tokenList, index);

      sub = nested.sel;
      index = nested.end;
    }

    put(key, { sub, on: null });
  }

  return { sel, end: index + 1 };
}

const NOT_NULL = new Set(['isDraft', 'isCrossRepository']); // Boolean! in GitHub's schema: false, never null

/** GitHub's answer for a field the entry leaves out. */
const blank = (key, field) =>
  field.sub ? ('nodes' in field.sub ? { nodes: [] } : null) : NOT_NULL.has(key) ? false : null;

/** The entry's value cut to the selection `sel`; every key it holds that `sel` does not name goes to `unasked`. */
function shape(value, sel, path, unasked) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item, index) => shape(item, sel, `${path}[${index}]`, unasked));
  if (!sel || typeof value !== 'object') return value;
  for (const key of Object.keys(value)) if (!(key in sel)) unasked.push(`${path}.${key}`);
  const out = {};

  for (const [key, field] of Object.entries(sel)) {
    if (key in value) out[key] = shape(value[key], field.sub, `${path}.${key}`, unasked);
    else if (!field.on || field.on.has(value.__typename)) out[key] = blank(key, field);
  }

  return out;
}

const [cmd, sub, flag, arg] = process.argv.slice(2);

if (cmd === 'repo' && sub === 'clone') {
  const [ref, dir] = [flag, arg];

  if (!/^[\w.-]+\/[\w.-]+$/.test(ref || '') || !dir) {
    console.error(`fakegh: repo clone <owner/name> <dir>, not: ${process.argv.slice(2).join(' ')}`);
    process.exit(2);
  }

  const progress = process.argv.includes('--progress');
  const ms = Number(process.env.FAKEGH_CLONE_MS ?? 1200);
  const steps = 10;

  mkdirSync(dir, { recursive: true });
  process.stderr.write(`Cloning into '${dir}'...\n`);

  if (ref.split('/')[1].startsWith('no-such-')) {
    setTimeout(() => {
      rmSync(dir, { recursive: true, force: true });
      console.error(`GraphQL: Could not resolve to a Repository with the name '${ref}'. (repository)`);
      process.exit(1);
    }, ms / 4);
  } else {
    let step = 0;

    const tick = setInterval(() => {
      step++;

      if (progress) {
        process.stderr.write(
          step <= 7
            ? `Receiving objects: ${String(Math.round((step / 7) * 100)).padStart(3)}% (${step * 10}/70)\r`
            : `Resolving deltas: ${String(Math.round(((step - 7) / 3) * 100)).padStart(3)}% (${step - 7}/3)\r`,
        );
      }

      if (step < steps) return;
      clearInterval(tick);
      mkdirSync(join(dir, '.git'), { recursive: true });
      writeFileSync(join(dir, '.git', 'config'), `[remote "origin"]\n\turl = https://github.com/${ref}.git\n`);
      writeFileSync(join(dir, 'README.md'), `# ${ref}\n`);
      if (progress) process.stderr.write('Resolving deltas: 100% (3/3), done.\n');
    }, ms / steps);
  }
} else if (cmd === 'auth' && sub === 'token') {
  // the chat's token (2026-10-17): FAKEGH_TOKEN, else one the fake GitHub takes for FAKEGH_VIEWER
  process.stdout.write(`${process.env.FAKEGH_TOKEN || `fake-token-${process.env.FAKEGH_VIEWER || 'me'}`}\n`);
} else if (cmd === 'pr' && sub === 'diff') {
  let prs = {};

  try {
    prs = JSON.parse(readFileSync(process.env.FAKEGH_PRS, 'utf8'));
  } catch {}

  const match = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/.exec(flag || '');
  const pr = match && prs[`${match[1]}/${match[2]}#${match[3]}`];

  if (pr?.diff) process.stdout.write(pr.diff);
  else {
    console.error(`could not find pull request diff: ${pr ? 'no diff in the fixture' : 'HTTP 404: Not Found'}`);
    process.exitCode = 1;
  }
} else {
  if (cmd !== 'api' || sub !== 'graphql' || flag !== '-f' || !arg?.startsWith('query=')) {
    console.error(`fakegh: only \`api graphql -f query=…\` is faked, not: ${process.argv.slice(2).join(' ')}`);
    process.exit(2);
  }

  const fail = process.env.FAKEGH_FAIL;

  if (fail && (!isAbsolute(fail) || existsSync(fail))) {
    let why = fail;

    if (isAbsolute(fail)) {
      try {
        why = readFileSync(fail, 'utf8').trim();
      } catch {}

      why ||= 'HTTP 502: Bad Gateway (https://api.github.com/graphql)';
    }

    console.error(`gh: ${why}`);
    process.exit(1);
  }

  let prs = {};

  try {
    prs = JSON.parse(readFileSync(process.env.FAKEGH_PRS, 'utf8'));
  } catch {}

  const query = selection(tokens(arg.slice('query='.length)), 0).sel;

  const data = { viewer: { login: process.env.FAKEGH_VIEWER || 'me' } };
  const errors = [];
  const unasked = [];

  for (const match of arg.matchAll(
    /(p\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\) \{ pullRequest\(number: (\d+)\)/g,
  )) {
    const key = `${match[2]}/${match[3]}#${match[4]}`;
    const pr = prs[key];

    if (pr) {
      const { diff, ...entry } = pr;

      data[match[1]] = { pullRequest: shape(entry, query[match[1]].sub.pullRequest.sub, key, unasked) };
    } else data[match[1]] = null;

    if (!pr) {
      errors.push({
        type: 'NOT_FOUND',
        path: [match[1], 'pullRequest'],
        message: `Could not resolve to a PullRequest with the number of ${match[4]}.`,
      });
    }
  }

  if (unasked.length) {
    console.error(
      `fakegh: the fixture has what the query does not ask for — ${unasked.join(', ')} (a field PR_FIELDS dropped or renamed?)`,
    );

    process.exit(2);
  }

  process.stdout.write(`${JSON.stringify(errors.length ? { data, errors } : { data })}\n`);

  if (errors.length) {
    console.error(errors.map(error => `gh: ${error.message}`).join('\n'));
    process.exitCode = 1;
  }
}
