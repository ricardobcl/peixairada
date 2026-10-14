#!/usr/bin/env node
// The live board in WebKit, the app's engine, rather than the harness's Chrome (2026-10-11, late night) — for what
// the app alone shows: a body of script run on the page in a WKWebView, what it returns printed; `--shot` saves the
// window as WebKit's compositor drew it, and `--then` runs a second body on that frame, where `shot` reads its pixels.
//   npm run webkit -- "return document.querySelectorAll('.card').length"
//   npm run webkit -- --hash <session-id> --shot /tmp/wk.png "return peix.state().current"
//   npm run webkit -- --then "return shot.where((r, g, b) => r > 200 && g < 60)" "<a body that draws something red>"
//   URL=http://127.0.0.1:7399/ SIZE=1280x800 PREFS='{"tiles":false}' npm run webkit -- "…"
//   WK_BORDERS=1 npm run webkit -- --shot /tmp/layers.png "return (await layers()).match(/\\(layer bounds/g).length"
// The body is an async function's: `return` what to print; `frame()`, `sleep(ms)` and `until(fn, ms)` are at hand, and
// it runs once the board has its snapshot (with --hash, once that chat is open). In --then, `shot.px(x, y)` is
// [r, g, b] in sRGB at a point in CSS px, and `shot.where(test, [x, y, w, h])` the count and centroid of the pixels
// that pass. A body can also ask the shell (2026-10-13): `await layers()` is the compositor's layer tree as text, one
// `(layer bounds …)` a layer; `await footprint()` the web process's memory, `{ now, peak }` in MB; `say(line)` prints
// a line at once. `WK_BORDERS=1` and `WK_COUNTERS=1` draw WebKit's compositing borders and repaint counters into a
// --shot — what is a layer of its own, what paints again. The page starts from no prefs but auto-resume off (`PREFS`
// over them): the app's defaults, tiles and the floating header on. `WAIT` (s) before the capture, 0.3 by default;
// `TIMEOUT` (s) for the whole run, 30. A locked screen hides the page and WebKit runs no frames: it says so and gives
// up. The Swift is compiled on first use, and again when it changes, into node_modules/.cache.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The cache in the nearest node_modules up the folders, as Node finds it (2026-10-14): a worktree inside the repo has
// none of its own, and one made here for the cache was the one check.sh then compared the vendored xterm against.
let nm = root; while (!existsSync(join(nm, 'node_modules')) && dirname(nm) !== nm) nm = dirname(nm);
const src = join(root, 'scripts/webkit.swift'), bin = join(nm, 'node_modules/.cache/peixairada/webkit');
const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i === -1 ? '' : args.splice(i, 2)[1] ?? ''; };
const hash = opt('--hash'), shot = opt('--shot'), then = opt('--then'), body = args.join(' ');
if (!body) { console.error('usage: npm run webkit -- [--hash <session-id>] [--shot file.png] [--then "<body>"] "<body>"'); process.exit(2); }
const [w, h] = (process.env.SIZE || '1600x900').split('x');
try { JSON.parse(process.env.PREFS || '{}'); } catch { console.error('PREFS is not JSON'); process.exit(2); }

const mtime = f => { try { return statSync(f).mtimeMs; } catch { return 0; } };
if (mtime(bin) < mtime(src)) {
  mkdirSync(dirname(bin), { recursive: true });
  console.error('› compiling scripts/webkit.swift');
  const c = spawnSync('swiftc', ['-O', '-swift-version', '5', '-o', bin, src], { stdio: 'inherit' });
  if (c.status !== 0) process.exit(c.status ?? 1);
}
const r = spawnSync(bin, [process.env.URL || 'http://127.0.0.1:7331/', body, shot, then], {
  stdio: 'inherit',
  env: { ...process.env, WK_W: w, WK_H: h, WK_HASH: hash, WK_PREFS: process.env.PREFS || '{}',
    ...(process.env.WAIT && { WK_WAIT: process.env.WAIT }), ...(process.env.TIMEOUT && { WK_TIMEOUT: process.env.TIMEOUT }) },
});
process.exit(r.status ?? 1);
