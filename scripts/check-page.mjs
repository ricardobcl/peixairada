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

for (let offset = html.indexOf('\n'); offset >= 0; offset = html.indexOf('\n', offset + 1)) starts.push(offset + 1);

const lineAt = offset => {
  let lo = 0;
  let hi = starts.length - 1;

  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;

    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }

  return lo + 1;
};

const at = line => {
  const place = where(line);

  return `${place.file}:${place.line}`;
}; // the part's path as the page's was given

let count = 0;
let bad = 0;

for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  count++;
  const lineOffset = lineAt(match.index) - 1;

  try {
    new vm.Script(match[1], { filename: file, lineOffset });
  } catch (error) {
    bad++;
    const line = Number(/:(\d+)$/m.exec(error.stack?.split('\n')[0] || '')?.[1]);

    console.error(`${line ? where(line).file : file}: ${error.message}${line ? `\n  ${at(line)}` : ''}`);
  }
}

if (!count) {
  console.error(`${file}: no inline script found`);
  process.exit(1);
}

if (bad) process.exit(1);

console.log(
  `${file}: ${count} inline script${count === 1 ? '' : 's'} compile, put together from ${parts.length} parts`,
);

// Every part is the page's once, and nothing in its folders is left out (2026-11-25): a file there that no include names
// would be code that never runs, and one named twice would run twice.
{
  const dir = join(file, '..');
  const named = parts.map(part => relative(dir, part));

  const twice = named.filter((part, index) => named.indexOf(part) !== index);

  const files = sub => {
    try {
      return readdirSync(join(dir, sub), { recursive: true })
        .filter(path => /\.(css|js)$/.test(path))
        .map(path => join(sub, path));
    } catch {
      return [];
    }
  };

  const left = [...files('css'), ...files('js')].filter(path => !named.includes(path));

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
const quoted = [...html.matchAll(/=\s*'\$\{/g)].map(match => at(lineAt(match.index)));

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
  .filter(match => !/\.showModal\(\);[\s\S]*\brepostPane\(\)/.test(match[0]))
  .map(match => at(lineAt(match.index)));

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

  for (const match of html.matchAll(/^(?:async )?function\*? ?(\w+)\s*\(/gm)) {
    (seen.get(match[1]) || seen.set(match[1], []).get(match[1])).push(at(lineAt(match.index)));
  }

  const twice = [...seen].filter(([, at]) => at.length > 1);

  if (twice.length) {
    console.error(
      `a function declared twice, the later one silently replacing the first: ${twice.map(([name, where]) => `${name} at ${where.join(', ')}`).join('; ')}`,
    );

    process.exit(1);
  }
}

if (file.endsWith('public/index.html')) {
  const keysOf = name => {
    const match = html.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`));

    return match ? [...match[1].matchAll(/(?:^\s*|[,{]\s*)(\w+):/g)].map(keyMatch => keyMatch[1]) : null;
  };

  const hot = keysOf('HOTKEYS');
  const cmd = keysOf('CMDKEYS');
  const shift = keysOf('SHIFTKEYS') || [];
  const cmdShift = keysOf('CMDSHIFTKEYS') || [];
  const ctrl = keysOf('CTRLKEYS') || [];
  const ctrlAlt = keysOf('CTRLALTKEYS') || [];
  const table = html.match(/const KEYS = \[([\s\S]*?)\n\];/);

  const fail = msg => {
    console.error(`${file}: ${msg}`);
    process.exitCode = 1;
  };

  if (!hot || !cmd || !table) fail('HOTKEYS, CMDKEYS or KEYS not found');
  else {
    const rows = [...table[1].matchAll(/'((?:alt|cmdshift|cmd|shift|ctrlalt|ctrl):\w+)'/g)].map(match => match[1]);

    for (const code of hot) if (!rows.includes(`alt:${code}`)) fail(`⌥⌘ ${code} is in HOTKEYS but has no row in KEYS`);
    for (const code of cmd) if (!rows.includes(`cmd:${code}`)) fail(`⌘ ${code} is in CMDKEYS but has no row in KEYS`);

    for (const code of shift) {
      if (!rows.includes(`shift:${code}`)) fail(`⌥⌘⇧ ${code} is in SHIFTKEYS but has no row in KEYS`);
    } // (2026-11-24) Top priority's ⌥⌘⇧↑↓

    for (const code of cmdShift) {
      if (!rows.includes(`cmdshift:${code}`)) fail(`⇧⌘ ${code} is in CMDSHIFTKEYS but has no row in KEYS`);
    } // (2026-11-25) ⇧⌘D

    for (const code of ctrl) {
      if (!rows.includes(`ctrl:${code}`)) fail(`⌃⌘ ${code} is in CTRLKEYS but has no row in KEYS`);
    } // (2026-11-25) a strip's tabs

    for (const code of ctrlAlt) {
      if (!rows.includes(`ctrlalt:${code}`)) fail(`⌃⌥⌘ ${code} is in CTRLALTKEYS but has no row in KEYS`);
    } // (2026-11-25) a tab out into a tile

    for (const row of rows) {
      const [modifiers, code] = row.split(':');

      if (
        !(
          modifiers === 'alt'
            ? hot
            : modifiers === 'shift'
              ? shift
              : modifiers === 'cmdshift'
                ? cmdShift
                : modifiers === 'ctrl'
                  ? ctrl
                  : modifiers === 'ctrlalt'
                    ? ctrlAlt
                    : cmd
        ).includes(code)
      ) {
        fail(`KEYS names ${row}, which no map answers`);
      }
    }

    // (2026-10-14) A row that promises the key "again from" its tab fills the column is answered by a hot…Key handler
    // (zoomAgain before the plain one), and every hot…Key the page defines is in HOTKEYS — ⌥⌘D's sat unbound, its
    // plain hotDiff in the map, and the promise was the row's alone.
    const handler = code =>
      html.match(new RegExp(`const HOTKEYS = \\{[\\s\\S]*?\\b${code}: (\\w+)\\s*[,}]`))?.[1] || null;

    for (const line of table[1].split('\n').filter(tableLine => /\bagain from\b/.test(tableLine))) {
      for (const [, code] of line.matchAll(/'alt:(\w+)'/g)) {
        if (!/^hot\w+Key$/.test(handler(code) || '')) {
          fail(
            `⌥⌘ ${code}'s row says again from its tab fills the column, but HOTKEYS gives it ${handler(code) || 'no named handler'}, not a hot…Key`,
          );
        }
      }
    }

    const bound = hot.map(handler);

    for (const [, name] of html.matchAll(/function (hot\w+Key)\(/g)) {
      if (!bound.includes(name)) fail(`${name} is defined but no key in HOTKEYS calls it`);
    }

    const src = readFileSync(new URL('../mac/Sources/Keys.swift', import.meta.url), 'utf8');

    const set = name => {
      const match = src.match(new RegExp(`static let ${name}: Set<String> = \\[([^\\]]*)\\]`));

      return match ? [...match[1].matchAll(/"(\w)"/g)].map(keyMatch => keyMatch[1]) : null;
    };

    const fwd = set('boardKeys');
    const cmdFwd = set('cmdKeys');

    if (!fwd || !cmdFwd) fail('Keys.swift: boardKeys or cmdKeys not found');
    else {
      for (const code of hot.filter(entry => /^Key[A-Z]$/.test(entry))) {
        if (!fwd.includes(code.slice(3).toLowerCase())) {
          fail(`⌥⌘${code.slice(3)} is the board's, but the app does not forward it from the pane (boardKeys)`);
        }
      }

      for (const code of cmd.filter(entry => /^(Key[A-Z]|Digit\d)$/.test(entry) && entry !== 'KeyW')) {
        if (!cmdFwd.includes(code.slice(-1).toLowerCase())) {
          fail(`⌘${code.slice(-1)} is the board's, but the app does not forward it from the pane (cmdKeys)`);
        }
      }

      // …and the other way (2026-10-14): what the app forwards, the board answers — a letter it takes from a page and the
      // board drops is a key the page never got
      for (const char of fwd) {
        if (!hot.includes(`Key${char.toUpperCase()}`)) {
          fail(`Keys.swift forwards ⌥⌘${char.toUpperCase()} (boardKeys), which HOTKEYS does not answer`);
        }
      }

      for (const char of cmdFwd) {
        if (!cmd.includes((/\d/.test(char) ? 'Digit' : 'Key') + char.toUpperCase())) {
          fail(`Keys.swift forwards ⌘${char.toUpperCase()} (cmdKeys), which CMDKEYS does not answer`);
        }
      }

      // ⇧⌘ letters (2026-11-25): forwarded both ways, as cmdKeys are
      const csFwd = set('cmdShiftKeys') || [];

      for (const code of cmdShift) {
        if (!csFwd.includes(code.slice(-1).toLowerCase())) {
          fail(`⇧⌘${code.slice(-1)} is the board's, but the app does not forward it from the pane (cmdShiftKeys)`);
        }
      }

      for (const char of csFwd) {
        if (!cmdShift.includes(`Key${char.toUpperCase()}`)) {
          fail(`Keys.swift forwards ⇧⌘${char.toUpperCase()} (cmdShiftKeys), which CMDSHIFTKEYS does not answer`);
        }
      }
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
      17: 'KeyT',
    };

    const fn = src.match(/static func hotkeyCode\([\s\S]*?\n {2}\}\n/)?.[0];

    if (!fn) fail('Keys.swift: hotkeyCode not found');
    else {
      const byCode = [...fn.matchAll(/e\.keyCode == (\d+) \{ return \("(\w+)", "altcmd"\) \}/g)].map(
        ([, keyCode, code]) => [+keyCode, code],
      );

      for (const [keyCode, code] of byCode) {
        if (KVK[keyCode] !== code) {
          fail(
            `Keys.swift's hotkeyCode sends key code ${keyCode} as ${code}, but ${keyCode} is ${KVK[keyCode] || 'neither a digit, an arrow nor Return'}`,
          );
        }

        if (!hot.includes(code)) {
          fail(`Keys.swift forwards ⌥⌘ ${code} (key code ${keyCode}), which HOTKEYS does not answer`);
        }
      }

      for (const code of hot.filter(entry => /^(Digit\d|Arrow\w+|Enter)$/.test(entry))) {
        if (!byCode.some(([, forwarded]) => forwarded === code)) {
          fail(`⌥⌘ ${code} is the board's, but the app does not forward it from the pane (hotkeyCode's key codes)`);
        }
      }

      // …and ⌥⌘⇧ (2026-11-24): each forwarded by its key code as "shift", each answered by SHIFTKEYS
      const byShift = [...fn.matchAll(/e\.keyCode == (\d+) \{ return \("(\w+)", "shift"\) \}/g)].map(
        ([, keyCode, code]) => [+keyCode, code],
      );

      for (const [keyCode, code] of byShift) {
        if (KVK[keyCode] !== code) {
          fail(
            `Keys.swift's hotkeyCode sends ⌥⌘⇧ key code ${keyCode} as ${code}, but ${keyCode} is ${KVK[keyCode] || 'neither a digit, an arrow nor Return'}`,
          );
        }

        if (!shift.includes(code)) {
          fail(`Keys.swift forwards ⌥⌘⇧ ${code} (key code ${keyCode}), which SHIFTKEYS does not answer`);
        }
      }

      for (const code of shift) {
        if (!byShift.some(([, forwarded]) => forwarded === code)) {
          fail(`⌥⌘⇧ ${code} is the board's, but the app does not forward it from the pane (hotkeyCode's key codes)`);
        }
      }

      // …and ⌃⌘ (2026-11-25) the same way, as "ctrlcmd", each answered by CTRLKEYS
      const byCtrl = [...fn.matchAll(/e\.keyCode == (\d+) \{ return \("(\w+)", "ctrlcmd"\) \}/g)].map(
        ([, keyCode, code]) => [+keyCode, code],
      );

      for (const [keyCode, code] of byCtrl) {
        if (KVK[keyCode] !== code) {
          fail(
            `Keys.swift's hotkeyCode sends ⌃⌘ key code ${keyCode} as ${code}, but ${keyCode} is ${KVK[keyCode] || 'neither a digit, an arrow nor Return'}`,
          );
        }

        if (!ctrl.includes(code)) {
          fail(`Keys.swift forwards ⌃⌘ ${code} (key code ${keyCode}), which CTRLKEYS does not answer`);
        }
      }

      for (const code of ctrl) {
        if (!byCtrl.some(([, forwarded]) => forwarded === code)) {
          fail(`⌃⌘ ${code} is the board's, but the app does not forward it from the pane (hotkeyCode's key codes)`);
        }
      }

      // …and ⌃⌥⌘ (2026-11-25), as "ctrlalt", answered by CTRLALTKEYS
      const byCtrlAlt = [...fn.matchAll(/e\.keyCode == (\d+) \{ return \("(\w+)", "ctrlalt"\) \}/g)].map(
        ([, keyCode, code]) => [+keyCode, code],
      );

      for (const [keyCode, code] of byCtrlAlt) {
        if (KVK[keyCode] !== code) {
          fail(
            `Keys.swift's hotkeyCode sends ⌃⌥⌘ key code ${keyCode} as ${code}, but ${keyCode} is ${KVK[keyCode] || 'neither a digit, an arrow nor Return'}`,
          );
        }

        if (!ctrlAlt.includes(code)) {
          fail(`Keys.swift forwards ⌃⌥⌘ ${code} (key code ${keyCode}), which CTRLALTKEYS does not answer`);
        }
      }

      for (const code of ctrlAlt) {
        if (!byCtrlAlt.some(([, forwarded]) => forwarded === code)) {
          fail(`⌃⌥⌘ ${code} is the board's, but the app does not forward it from the pane (hotkeyCode's key codes)`);
        }
      }
    }

    if (!process.exitCode) {
      console.log(
        `${file}: ${hot.length} ⌥⌘, ${shift.length} ⌥⌘⇧, ${cmdShift.length} ⇧⌘, ${ctrl.length} ⌃⌘ and ${cmd.length} ⌘ keys, each with its row; the app forwards them all, and the board answers all it forwards`,
      );
    }
  }
}
