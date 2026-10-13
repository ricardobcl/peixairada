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

// The keys (2026-10-12): every code in HOTKEYS and CMDKEYS has its row in KEYS — the Keys pane and the ? sheet are
// drawn from it —, every row's code is one of theirs, and the app forwards every ⌥⌘ letter the board answers while a
// page in the pane has the keyboard, and every ⌘ letter and digit (mac/Sources/main.swift's boardKeys and cmdKeys; ⌥⌘S
// is left to VS Code Web's Save All, and ⌘W and ⌘, are the menus', not the forwarder's).
if (file.endsWith('public/index.html')) {
  const keysOf = name => { const m = html.match(new RegExp(`const ${name} = \\{(.*?)\\};`)); return m ? [...m[1].matchAll(/(?:^\s*|[,{]\s*)(\w+):/g)].map(x => x[1]) : null; };
  const hot = keysOf('HOTKEYS'), cmd = keysOf('CMDKEYS'), table = html.match(/const KEYS = \[([\s\S]*?)\n  \];/);
  const fail = msg => { console.error(`${file}: ${msg}`); process.exitCode = 1; };
  if (!hot || !cmd || !table) fail('HOTKEYS, CMDKEYS or KEYS not found');
  else {
    const rows = [...table[1].matchAll(/'((?:alt|cmd):\w+)'/g)].map(x => x[1]);
    for (const c of hot) if (!rows.includes('alt:' + c)) fail(`⌥⌘ ${c} is in HOTKEYS but has no row in KEYS`);
    for (const c of cmd) if (!rows.includes('cmd:' + c)) fail(`⌘ ${c} is in CMDKEYS but has no row in KEYS`);
    for (const r of rows) { const [m, c] = r.split(':'); if (!(m === 'alt' ? hot : cmd).includes(c)) fail(`KEYS names ${r}, which no map answers`); }
    const src = readFileSync(new URL('../mac/Sources/main.swift', import.meta.url), 'utf8');
    const set = name => { const m = src.match(new RegExp(`static let ${name}: Set<String> = \\[([^\\]]*)\\]`)); return m ? [...m[1].matchAll(/"(\w)"/g)].map(x => x[1]) : null; };
    const fwd = set('boardKeys'), cmdFwd = set('cmdKeys');
    if (!fwd || !cmdFwd) fail('main.swift: boardKeys or cmdKeys not found');
    else {
      for (const c of hot.filter(c => /^Key[A-Z]$/.test(c) && c !== 'KeyS')) if (!fwd.includes(c.slice(3).toLowerCase())) fail(`⌥⌘${c.slice(3)} is the board's, but the app does not forward it from the pane (boardKeys)`);
      for (const c of cmd.filter(c => /^(Key[A-Z]|Digit\d)$/.test(c) && c !== 'KeyW')) if (!cmdFwd.includes(c.slice(-1).toLowerCase())) fail(`⌘${c.slice(-1)} is the board's, but the app does not forward it from the pane (cmdKeys)`);
    }
    if (!process.exitCode) console.log(`${file}: ${hot.length} ⌥⌘ and ${cmd.length} ⌘ keys, each with its row; the app forwards the letters`);
  }
}
