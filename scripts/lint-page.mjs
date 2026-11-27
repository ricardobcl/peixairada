#!/usr/bin/env node
// The page's script linted as it runs (2026-11-25): put together from its parts (lib/page.mjs), each inline <script> of
// it linted as `public/page.js` under eslint.config.mjs, and every finding told at the part and line it came from.
// Exit 1 on an error. `npm run lint` runs it after ESLint's own pass over the rest.
// A part's first statement wants no blank line before it (2026-11-27): the one before is another file's.
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { assemblePage } from '../lib/page.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const { html, where } = assemblePage();
const eslint = new ESLint({ cwd: ROOT });
const found = [];
const linesOf = new Map();
const PADDING = '@stylistic/padding-line-between-statements';
const NO_CODE = /^\s*(?:\/\/.*|\/\*.*|\*.*)?$/; // blank, or a comment's

/** Whether a part's line is its first statement's: nothing but comments above it in its file. */
function firstInPart(file, line) {
  if (!linesOf.has(file)) linesOf.set(file, readFileSync(file, 'utf8').split('\n'));

  return linesOf
    .get(file)
    .slice(0, line - 1)
    .every(text => NO_CODE.test(text));
}

for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
  const from = match.index + '<script>'.length;
  const line0 = html.slice(0, from).split('\n').length; // the page's line the script starts on
  const col0 = from - html.lastIndexOf('\n', from - 1) - 1;
  const [res] = await eslint.lintText(match[1], { filePath: `${ROOT}public/page.js` });

  for (const msg of res.messages) {
    const at = where(line0 + (msg.line ?? 1) - 1);

    if (msg.ruleId === PADDING && at.file.endsWith('.js') && firstInPart(at.file, at.line)) continue;

    found.push({
      ...msg,
      file: relative(process.cwd(), at.file),
      line: at.line,
      column: (msg.line === 1 ? col0 : 0) + (msg.column ?? 1),
    });
  }
}

found.sort(
  (left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column,
);

for (const problem of found) {
  console.log(
    `${problem.file}:${problem.line}:${problem.column}  ${problem.severity === 2 ? 'error' : 'warning'}  ${problem.message}  ${problem.ruleId ?? ''}`,
  );
}

const errors = found.filter(problem => problem.severity === 2).length;

if (found.length) {
  console.log(
    `\n${errors} error${errors === 1 ? '' : 's'}, ${found.length - errors} warning${found.length - errors === 1 ? '' : 's'} in the page's script`,
  );
}

process.exit(errors ? 1 : 0);
