#!/usr/bin/env node
// Compile every inline <script> of a page (syntax only), pointing at the line in the HTML on an error.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const file = process.argv[2] || 'public/index.html';
const html = readFileSync(file, 'utf8');
let n = 0, bad = 0;
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  n++;
  const lineOffset = html.slice(0, m.index).split('\n').length - 1;
  try { new vm.Script(m[1], { filename: file, lineOffset }); }
  catch (e) { bad++; console.error(`${file}: ${e.message}${e.stack?.split('\n')[0]?.includes(file) ? '\n  ' + e.stack.split('\n')[0] : ''}`); }
}
if (!n) { console.error(`${file}: no inline script found`); process.exit(1); }
if (bad) process.exit(1);
console.log(`${file}: ${n} inline script${n === 1 ? '' : 's'} compile`);
