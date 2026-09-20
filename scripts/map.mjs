#!/usr/bin/env node
// Rewrite the section maps at the top of server.mjs and public/index.html from the files' own banners — the
// `// -----… / // Name / // -----…` blocks and `// ---- name ----` lines in the server, the script's `// ---- name`
// and the stylesheet's `/* ---- name ---- */` in the page. Names only, no line numbers (those drift): grep one to jump.
//   node scripts/map.mjs        (npm run map)
import { readFileSync, writeFileSync } from 'node:fs';
const OPEN = '// Map ▾', CLOSE = '// Map ▴';
function place(text, block, anchorRe) {
  const a = text.indexOf(OPEN), b = text.indexOf(CLOSE);
  if (a >= 0 && b > a) return text.slice(0, a) + block + text.slice(b + CLOSE.length);
  const m = text.match(anchorRe); if (!m) throw new Error('no anchor for the map');
  const i = m.index + m[0].length; return text.slice(0, i) + '\n' + block + text.slice(i);
}
let s = readFileSync('server.mjs', 'utf8');
const big = [...s.matchAll(/^\/\/ -{40,}\n\/\/ (.+)\n\/\/ -{40,}$/gm)].map(m => ({ i: m.index, t: m[1].trim(), sub: false }));
const small = [...s.matchAll(/^\/\/ ---- (.+?) -*$/gm)].map(m => ({ i: m.index, t: m[1].trim(), sub: true }));
const all = [...big, ...small].sort((a, b) => a.i - b.i).filter(x => !/^Map/.test(x.t));
s = place(s, [`${OPEN} — the sections, from the file's own banners (node scripts/map.mjs rewrites this; grep a name to jump)`, ...all.map(x => `//${x.sub ? '      · ' : '  '}${x.t}`), CLOSE].join('\n'), /^\/\/   CLAUDE_DIR=.*$/m);
writeFileSync('server.mjs', s);
let h = readFileSync('public/index.html', 'utf8');
const css = [...h.matchAll(/^  \/\* ---- (.+?) ---- \*\/$/gm)].map(m => `//   css · ${m[1].trim()}`);
const js = [...h.matchAll(/^  \/\/ ---- (.+?) -*$/gm)].map(m => `//   js  · ${m[1].trim()}`);
h = place(h, [`${OPEN} — the page's sections, from its own banners (node scripts/map.mjs rewrites this; grep a name to jump)`, ...css, ...js, CLOSE].join('\n'), /^<script>\n/m);
writeFileSync('public/index.html', h);
console.log(`map: ${all.length} server sections, ${css.length} css + ${js.length} js page sections`);
