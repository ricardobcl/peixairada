#!/usr/bin/env node
// Compile every inline <script> of a page (syntax only), pointing at the line in the file it came from on an error: the
// page is put together from its parts (lib/page.mjs), so a line of it is a line of public/js/… or public/css/….
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import vm from 'node:vm';
import { assemblePage } from '../lib/page.mjs';
const file = process.argv[2] || 'public/index.html';
const { html, parts, where } = assemblePage(file);
// The line an offset of the page is on, by a search of where each line starts (2026-11-25): a split of all before it,
// per match, was most of the check's time — 0.9 s of 1.4 on a page with twice the lines.
const starts = [0];
for (let i = html.indexOf('\n'); i >= 0; i = html.indexOf('\n', i + 1)) starts.push(i + 1);
const lineAt = i => {
  let lo = 0,
    hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= i) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
};
const at = n => {
  const w = where(n);
  return `${w.file}:${w.line}`;
}; // the part's path as the page's was given
let n = 0,
  bad = 0;
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  n++;
  const lineOffset = lineAt(m.index) - 1;
  try {
    new vm.Script(m[1], { filename: file, lineOffset });
  } catch (e) {
    bad++;
    const l = Number(/:(\d+)$/m.exec(e.stack?.split('\n')[0] || '')?.[1]);
    console.error(`${l ? where(l).file : file}: ${e.message}${l ? `\n  ${at(l)}` : ''}`);
  }
}
if (!n) {
  console.error(`${file}: no inline script found`);
  process.exit(1);
}
if (bad) process.exit(1);
console.log(`${file}: ${n} inline script${n === 1 ? '' : 's'} compile, put together from ${parts.length} parts`);

// Every part is the page's once, and nothing in its folders is left out (2026-11-25): a file there that no include names
// would be code that never runs, and one named twice would run twice.
{
  const dir = join(file, '..'),
    named = parts.map(p => relative(dir, p));
  const twice = named.filter((p, i) => named.indexOf(p) !== i);
  const files = sub => {
    try {
      return readdirSync(join(dir, sub), { recursive: true })
        .filter(f => /\.(css|js)$/.test(f))
        .map(f => join(sub, f));
    } catch {
      return [];
    }
  };
  const left = [...files('css'), ...files('js')].filter(f => !named.includes(f));
  if (twice.length) {
    console.error(`${file}: a part included twice: ${twice.join(', ')}`);
    process.exit(1);
  }
  if (left.length) {
    console.error(`${file}: a part no include names, so it never runs: ${left.join(', ')}`);
    process.exit(1);
  }
}

// An attribute's value in single quotes is never built from `${…}` (2026-10-14): esc() escapes `"` and not `'`, so a
// value with a quote in it would close the attribute and run on into the markup. Double quotes, as everywhere else.
const quoted = [...html.matchAll(/=\s*'\$\{/g)].map(m => at(lineAt(m.index)));
if (quoted.length) {
  console.error(`an attribute in single quotes built from \${…} (esc() leaves ' alone) at ${quoted.join(', ')}`);
  process.exit(1);
}

// The keys (2026-10-12): every code in HOTKEYS and CMDKEYS has its row in KEYS — the Keys pane and the ? sheet are
// drawn from it —, every row's code is one of theirs, and the app forwards every ⌥⌘ letter the board answers while a
// page in the pane has the keyboard, and every ⌘ letter and digit (mac/Sources/Keys.swift's boardKeys and cmdKeys; ⌘W
// and ⌘, are the menus', not the forwarder's).
// A dialog up lowers the pane (2026-11-04): a page in the app is a native view, so a dialog opened with one up is drawn under
// it, and Chrome, with no view there, shows nothing wrong. Each opener says so within the two lines after it (2026-11-25:
// formatted, a statement a line).
const unlowered = [...html.matchAll(/^.*\.showModal\(\).*$(?:\n.*){0,2}/gm)]
  .filter(m => !/\.showModal\(\);[\s\S]*\brepostPane\(\)/.test(m[0]))
  .map(m => at(lineAt(m.index)));
if (unlowered.length) {
  console.error(
    `a showModal() with no repostPane() right after it, so it opens under a page in the pane, at ${unlowered.join(', ')}`,
  );
  process.exit(1);
}
// A function declared twice in the script's own scope (2026-11-05): the later one wins, silently — a drawer's `letGo` took over
// the round let go's of that name, and only a scenario's ⌥-click found it. The page's script is one IIFE: its own scope is the
// declarations at a line's start (2026-11-25: its parts formatted each as a file, nothing indented for the IIFE).
{
  const seen = new Map();
  for (const m of html.matchAll(/^(?:async )?function\*? ?(\w+)\s*\(/gm))
    (seen.get(m[1]) || seen.set(m[1], []).get(m[1])).push(at(lineAt(m.index)));
  const twice = [...seen].filter(([, at]) => at.length > 1);
  if (twice.length) {
    console.error(
      `a function declared twice, the later one silently replacing the first: ${twice.map(([n, where]) => `${n} at ${where.join(', ')}`).join('; ')}`,
    );
    process.exit(1);
  }
}
if (file.endsWith('public/index.html')) {
  const keysOf = name => {
    const m = html.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`));
    return m ? [...m[1].matchAll(/(?:^\s*|[,{]\s*)(\w+):/g)].map(x => x[1]) : null;
  };
  const hot = keysOf('HOTKEYS'),
    cmd = keysOf('CMDKEYS'),
    shift = keysOf('SHIFTKEYS') || [],
    cmdShift = keysOf('CMDSHIFTKEYS') || [],
    ctrl = keysOf('CTRLKEYS') || [],
    table = html.match(/const KEYS = \[([\s\S]*?)\n\];/);
  const fail = msg => {
    console.error(`${file}: ${msg}`);
    process.exitCode = 1;
  };
  if (!hot || !cmd || !table) fail('HOTKEYS, CMDKEYS or KEYS not found');
  else {
    const rows = [...table[1].matchAll(/'((?:alt|cmdshift|cmd|shift|ctrl):\w+)'/g)].map(x => x[1]);
    for (const c of hot) if (!rows.includes('alt:' + c)) fail(`⌥⌘ ${c} is in HOTKEYS but has no row in KEYS`);
    for (const c of cmd) if (!rows.includes('cmd:' + c)) fail(`⌘ ${c} is in CMDKEYS but has no row in KEYS`);
    for (const c of shift) if (!rows.includes('shift:' + c)) fail(`⌥⌘⇧ ${c} is in SHIFTKEYS but has no row in KEYS`); // (2026-11-24) Top priority's ⌥⌘⇧↑↓
    for (const c of cmdShift)
      if (!rows.includes('cmdshift:' + c)) fail(`⇧⌘ ${c} is in CMDSHIFTKEYS but has no row in KEYS`); // (2026-11-25) ⇧⌘D
    for (const c of ctrl) if (!rows.includes('ctrl:' + c)) fail(`⌃⌘ ${c} is in CTRLKEYS but has no row in KEYS`); // (2026-11-25) a strip's tabs
    for (const r of rows) {
      const [m, c] = r.split(':');
      if (
        !(m === 'alt' ? hot : m === 'shift' ? shift : m === 'cmdshift' ? cmdShift : m === 'ctrl' ? ctrl : cmd).includes(
          c,
        )
      )
        fail(`KEYS names ${r}, which no map answers`);
    }
    // (2026-10-14) A row that promises the key "again from" its tab fills the column is answered by a hot…Key handler
    // (zoomAgain before the plain one), and every hot…Key the page defines is in HOTKEYS — ⌥⌘D's sat unbound, its
    // plain hotDiff in the map, and the promise was the row's alone.
    const handler = c => html.match(new RegExp(`const HOTKEYS = \\{[\\s\\S]*?\\b${c}: (\\w+)\\s*[,}]`))?.[1] || null;
    for (const line of table[1].split('\n').filter(l => /\bagain from\b/.test(l)))
      for (const [, c] of line.matchAll(/'alt:(\w+)'/g))
        if (!/^hot\w+Key$/.test(handler(c) || ''))
          fail(
            `⌥⌘ ${c}'s row says again from its tab fills the column, but HOTKEYS gives it ${handler(c) || 'no named handler'}, not a hot…Key`,
          );
    const bound = hot.map(handler);
    for (const [, f] of html.matchAll(/function (hot\w+Key)\(/g))
      if (!bound.includes(f)) fail(`${f} is defined but no key in HOTKEYS calls it`);
    const src = readFileSync(new URL('../mac/Sources/Keys.swift', import.meta.url), 'utf8');
    const set = name => {
      const m = src.match(new RegExp(`static let ${name}: Set<String> = \\[([^\\]]*)\\]`));
      return m ? [...m[1].matchAll(/"(\w)"/g)].map(x => x[1]) : null;
    };
    const fwd = set('boardKeys'),
      cmdFwd = set('cmdKeys');
    if (!fwd || !cmdFwd) fail('Keys.swift: boardKeys or cmdKeys not found');
    else {
      for (const c of hot.filter(c => /^Key[A-Z]$/.test(c)))
        if (!fwd.includes(c.slice(3).toLowerCase()))
          fail(`⌥⌘${c.slice(3)} is the board's, but the app does not forward it from the pane (boardKeys)`);
      for (const c of cmd.filter(c => /^(Key[A-Z]|Digit\d)$/.test(c) && c !== 'KeyW'))
        if (!cmdFwd.includes(c.slice(-1).toLowerCase()))
          fail(`⌘${c.slice(-1)} is the board's, but the app does not forward it from the pane (cmdKeys)`);
      // …and the other way (2026-10-14): what the app forwards, the board answers — a letter it takes from a page and the
      // board drops is a key the page never got
      for (const l of fwd)
        if (!hot.includes('Key' + l.toUpperCase()))
          fail(`Keys.swift forwards ⌥⌘${l.toUpperCase()} (boardKeys), which HOTKEYS does not answer`);
      for (const l of cmdFwd)
        if (!cmd.includes((/\d/.test(l) ? 'Digit' : 'Key') + l.toUpperCase()))
          fail(`Keys.swift forwards ⌘${l.toUpperCase()} (cmdKeys), which CMDKEYS does not answer`);
      // ⇧⌘ letters (2026-11-25): forwarded both ways, as cmdKeys are
      const csFwd = set('cmdShiftKeys') || [];
      for (const c of cmdShift)
        if (!csFwd.includes(c.slice(-1).toLowerCase()))
          fail(`⇧⌘${c.slice(-1)} is the board's, but the app does not forward it from the pane (cmdShiftKeys)`);
      for (const l of csFwd)
        if (!cmdShift.includes('Key' + l.toUpperCase()))
          fail(`Keys.swift forwards ⇧⌘${l.toUpperCase()} (cmdShiftKeys), which CMDSHIFTKEYS does not answer`);
    }
    // The ⌥⌘ digits, arrows and Return the forwarder matches by key code (⌥ composes a symbol over them): each code the Mac's
    // own (kVK_ANSI_1 is 18…), each answered by HOTKEYS, and every digit and arrow HOTKEYS has, forwarded.
    const KVK = {
      18: 'Digit1',
      19: 'Digit2',
      20: 'Digit3',
      21: 'Digit4',
      23: 'Digit5',
      22: 'Digit6',
      26: 'Digit7',
      28: 'Digit8',
      25: 'Digit9',
      29: 'Digit0',
      123: 'ArrowLeft',
      124: 'ArrowRight',
      125: 'ArrowDown',
      126: 'ArrowUp',
      36: 'Enter',
    };
    const fn = src.match(/static func hotkeyCode\([\s\S]*?\n {2}\}\n/)?.[0];
    if (!fn) fail('Keys.swift: hotkeyCode not found');
    else {
      const byCode = [...fn.matchAll(/e\.keyCode == (\d+) \{ return \("(\w+)", "altcmd"\) \}/g)].map(([, n, c]) => [
        +n,
        c,
      ]);
      for (const [n, c] of byCode) {
        if (KVK[n] !== c)
          fail(
            `Keys.swift's hotkeyCode sends key code ${n} as ${c}, but ${n} is ${KVK[n] || 'neither a digit, an arrow nor Return'}`,
          );
        if (!hot.includes(c)) fail(`Keys.swift forwards ⌥⌘ ${c} (key code ${n}), which HOTKEYS does not answer`);
      }
      for (const c of hot.filter(c => /^(Digit\d|Arrow\w+|Enter)$/.test(c)))
        if (!byCode.some(([, x]) => x === c))
          fail(`⌥⌘ ${c} is the board's, but the app does not forward it from the pane (hotkeyCode's key codes)`);
      // …and ⌥⌘⇧ (2026-11-24): each forwarded by its key code as "shift", each answered by SHIFTKEYS
      const byShift = [...fn.matchAll(/e\.keyCode == (\d+) \{ return \("(\w+)", "shift"\) \}/g)].map(([, n, c]) => [
        +n,
        c,
      ]);
      for (const [n, c] of byShift) {
        if (KVK[n] !== c)
          fail(
            `Keys.swift's hotkeyCode sends ⌥⌘⇧ key code ${n} as ${c}, but ${n} is ${KVK[n] || 'neither a digit, an arrow nor Return'}`,
          );
        if (!shift.includes(c)) fail(`Keys.swift forwards ⌥⌘⇧ ${c} (key code ${n}), which SHIFTKEYS does not answer`);
      }
      for (const c of shift)
        if (!byShift.some(([, x]) => x === c))
          fail(`⌥⌘⇧ ${c} is the board's, but the app does not forward it from the pane (hotkeyCode's key codes)`);
      // …and ⌃⌘ (2026-11-25) the same way, as "ctrlcmd", each answered by CTRLKEYS
      const byCtrl = [...fn.matchAll(/e\.keyCode == (\d+) \{ return \("(\w+)", "ctrlcmd"\) \}/g)].map(([, n, c]) => [
        +n,
        c,
      ]);
      for (const [n, c] of byCtrl) {
        if (KVK[n] !== c)
          fail(
            `Keys.swift's hotkeyCode sends ⌃⌘ key code ${n} as ${c}, but ${n} is ${KVK[n] || 'neither a digit, an arrow nor Return'}`,
          );
        if (!ctrl.includes(c)) fail(`Keys.swift forwards ⌃⌘ ${c} (key code ${n}), which CTRLKEYS does not answer`);
      }
      for (const c of ctrl)
        if (!byCtrl.some(([, x]) => x === c))
          fail(`⌃⌘ ${c} is the board's, but the app does not forward it from the pane (hotkeyCode's key codes)`);
    }
    if (!process.exitCode)
      console.log(
        `${file}: ${hot.length} ⌥⌘, ${shift.length} ⌥⌘⇧, ${cmdShift.length} ⇧⌘, ${ctrl.length} ⌃⌘ and ${cmd.length} ⌘ keys, each with its row; the app forwards them all, and the board answers all it forwards`,
      );
  }
}
