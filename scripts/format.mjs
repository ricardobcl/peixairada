#!/usr/bin/env node
// `npm run format` (2026-11-27): Prettier lays the code out, ESLint makes what it can fix (a blank line, one declaration
// a line, braces, a template), and Prettier lays out again what ESLint changed — till neither changes a thing: a line
// Prettier breaks may want a blank line round it. The page's parts are fixed each alone, by the rules that read
// nothing past the part (PART_RULES); lint-page.mjs lints them whole.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { assemblePage } from '../lib/page.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PRETTIER = fileURLToPath(import.meta.resolve('prettier/bin/prettier.cjs')); // the nearest node_modules', a worktree's too

const PART_RULES = new Set([
  '@stylistic/padding-line-between-statements',
  '@stylistic/lines-between-class-members',
  'one-var',
  'curly',
  'prefer-template',
  'object-shorthand',
  'prefer-exponentiation-operator',
]);

function prettier(...args) {
  const run = spawnSync(process.execPath, [PRETTIER, '--log-level', 'warn', ...args], { cwd: ROOT, stdio: 'inherit' });

  if (run.error || run.status !== 0) process.exit(run.status || 1);
}

/** The files ESLint fixed of those given; none ignored ones (the page's parts are). */
async function fixFiles(files) {
  const eslint = new ESLint({ cwd: ROOT, fix: true, errorOnUnmatchedPattern: false });
  const results = await eslint.lintFiles(files);

  await ESLint.outputFixes(results);

  return results.filter(result => result.output != null).map(result => result.filePath);
}

/** The page's script parts fixed one by one, as the statements of a function (a part may `return`); the ones changed. */
async function fixParts(parts) {
  const eslint = new ESLint({
    cwd: ROOT,
    fix: true,
    ruleFilter: ({ ruleId }) => PART_RULES.has(ruleId),
    overrideConfig: { languageOptions: { parserOptions: { ecmaFeatures: { globalReturn: true } } } },
  });

  const changed = [];

  for (const part of parts) {
    const text = readFileSync(part, 'utf8');
    const [result] = await eslint.lintText(text, { filePath: `${ROOT}public/page.js` });
    const fatal = result.messages.find(message => message.fatal);

    if (fatal) throw new Error(`${part}:${fatal.line}: ${fatal.message}`);

    if (result.output != null && result.output !== text) {
      writeFileSync(part, result.output);
      changed.push(part);
    }
  }

  return changed;
}

prettier('--write', '.');

const fixed = new Set();
let files = ['.'];
let parts = assemblePage().parts.filter(file => file.endsWith('.js'));

for (let round = 1; files.length + parts.length && round <= 5; round++) {
  files = await fixFiles(files);
  parts = await fixParts(parts);

  const changed = [...files, ...parts];

  changed.forEach(file => fixed.add(file));
  if (changed.length) prettier('--write', ...changed);
}

console.log(`formatted; ESLint fixed ${fixed.size} file${fixed.size === 1 ? '' : 's'}`);
