#!/usr/bin/env node
// The page's script linted as it runs (2026-11-25): put together from its parts (lib/page.mjs), each inline <script> of
// it linted as `public/page.js` under eslint.config.mjs, and every finding told at the part and line it came from.
// Exit 1 on an error. `npm run lint` runs it after ESLint's own pass over the rest.
import { ESLint } from 'eslint';
import { relative } from 'node:path';
import { assemblePage } from '../lib/page.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const { html, where } = assemblePage();
const eslint = new ESLint({ cwd: ROOT });
const found = [];
for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
  const from = m.index + '<script>'.length;
  const line0 = html.slice(0, from).split('\n').length;   // the page's line the script starts on
  const col0 = from - html.lastIndexOf('\n', from - 1) - 1;
  const [res] = await eslint.lintText(m[1], { filePath: `${ROOT}public/page.js` });
  for (const msg of res.messages) {
    const at = where(line0 + (msg.line ?? 1) - 1);
    found.push({ ...msg, file: relative(process.cwd(), at.file), line: at.line, column: (msg.line === 1 ? col0 : 0) + (msg.column ?? 1) });
  }
}
found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
for (const f of found) console.log(`${f.file}:${f.line}:${f.column}  ${f.severity === 2 ? 'error' : 'warning'}  ${f.message}  ${f.ruleId ?? ''}`);
const errors = found.filter(f => f.severity === 2).length;
if (found.length) console.log(`\n${errors} error${errors === 1 ? '' : 's'}, ${found.length - errors} warning${found.length - errors === 1 ? '' : 's'} in the page's script`);
process.exit(errors ? 1 : 0);
