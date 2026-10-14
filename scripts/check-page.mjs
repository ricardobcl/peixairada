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
// page in the pane has the keyboard, and every ⌘ letter and digit (mac/Sources/main.swift's boardKeys and cmdKeys; ⌘W
// and ⌘, are the menus', not the forwarder's).
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
    // (2026-10-14) A row that promises the key "again from" its tab fills the column is answered by a hot…Key handler
    // (zoomAgain before the plain one), and every hot…Key the page defines is in HOTKEYS — ⌥⌘D's sat unbound, its
    // plain hotDiff in the map, and the promise was the row's alone.
    const handler = c => html.match(new RegExp(`const HOTKEYS = \\{.*?\\b${c}: (\\w+)\\s*[,}]`))?.[1] || null;
    for (const line of table[1].split('\n').filter(l => /\bagain from\b/.test(l)))
      for (const [, c] of line.matchAll(/'alt:(\w+)'/g)) if (!/^hot\w+Key$/.test(handler(c) || '')) fail(`⌥⌘ ${c}'s row says again from its tab fills the column, but HOTKEYS gives it ${handler(c) || 'no named handler'}, not a hot…Key`);
    const bound = hot.map(handler);
    for (const [, f] of html.matchAll(/function (hot\w+Key)\(/g)) if (!bound.includes(f)) fail(`${f} is defined but no key in HOTKEYS calls it`);
    const src = readFileSync(new URL('../mac/Sources/main.swift', import.meta.url), 'utf8');
    const set = name => { const m = src.match(new RegExp(`static let ${name}: Set<String> = \\[([^\\]]*)\\]`)); return m ? [...m[1].matchAll(/"(\w)"/g)].map(x => x[1]) : null; };
    const fwd = set('boardKeys'), cmdFwd = set('cmdKeys');
    if (!fwd || !cmdFwd) fail('main.swift: boardKeys or cmdKeys not found');
    else {
      for (const c of hot.filter(c => /^Key[A-Z]$/.test(c))) if (!fwd.includes(c.slice(3).toLowerCase())) fail(`⌥⌘${c.slice(3)} is the board's, but the app does not forward it from the pane (boardKeys)`);
      for (const c of cmd.filter(c => /^(Key[A-Z]|Digit\d)$/.test(c) && c !== 'KeyW')) if (!cmdFwd.includes(c.slice(-1).toLowerCase())) fail(`⌘${c.slice(-1)} is the board's, but the app does not forward it from the pane (cmdKeys)`);
      // …and the other way (2026-10-14): what the app forwards, the board answers — a letter it takes from a page and the
      // board drops is a key the page never got
      for (const l of fwd) if (!hot.includes('Key' + l.toUpperCase())) fail(`main.swift forwards ⌥⌘${l.toUpperCase()} (boardKeys), which HOTKEYS does not answer`);
      for (const l of cmdFwd) if (!cmd.includes((/\d/.test(l) ? 'Digit' : 'Key') + l.toUpperCase())) fail(`main.swift forwards ⌘${l.toUpperCase()} (cmdKeys), which CMDKEYS does not answer`);
    }
    // The ⌥⌘ digits and arrows the forwarder matches by key code (⌥ composes a symbol over them): each code the Mac's
    // own (kVK_ANSI_1 is 18…), each answered by HOTKEYS, and every digit and arrow HOTKEYS has, forwarded.
    const KVK = { 18: 'Digit1', 19: 'Digit2', 20: 'Digit3', 21: 'Digit4', 23: 'Digit5', 22: 'Digit6', 26: 'Digit7', 28: 'Digit8', 25: 'Digit9', 29: 'Digit0', 123: 'ArrowLeft', 124: 'ArrowRight', 125: 'ArrowDown', 126: 'ArrowUp' };
    const fn = src.match(/static func hotkeyCode\([\s\S]*?\n  \}\n/)?.[0];
    if (!fn) fail('main.swift: hotkeyCode not found');
    else {
      const byCode = [...fn.matchAll(/e\.keyCode == (\d+) \{ return \("(\w+)", "altcmd"\) \}/g)].map(([, n, c]) => [+n, c]);
      for (const [n, c] of byCode) {
        if (KVK[n] !== c) fail(`main.swift's hotkeyCode sends key code ${n} as ${c}, but ${n} is ${KVK[n] || 'neither a digit nor an arrow'}`);
        if (!hot.includes(c)) fail(`main.swift forwards ⌥⌘ ${c} (key code ${n}), which HOTKEYS does not answer`);
      }
      for (const c of hot.filter(c => /^(Digit\d|Arrow\w+)$/.test(c))) if (!byCode.some(([, x]) => x === c)) fail(`⌥⌘ ${c} is the board's, but the app does not forward it from the pane (hotkeyCode's key codes)`);
    }
    if (!process.exitCode) console.log(`${file}: ${hot.length} ⌥⌘ and ${cmd.length} ⌘ keys, each with its row; the app forwards them all, and the board answers all it forwards`);
  }
}
