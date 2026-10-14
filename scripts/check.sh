#!/bin/sh
# Static checks, ten seconds: every script parses, the page's inline script compiles, the tests keep to a state and temp
# dirs of their own and name every route (scripts/check-tests.mjs), the shell scripts parse, the app's Swift type-checks
# against the deployment target build.sh uses, and the WebKit check's against this Mac.
# `npm run check`. No network, no server.
set -eu
cd "$(dirname "$0")/.."
echo "› node --check"
for f in server.mjs lib/*.mjs scripts/*.mjs scripts/scenarios/*.mjs test/*.mjs; do [ -f "$f" ] && node --check "$f"; done
echo "› the page's script"
node scripts/check-page.mjs public/index.html
echo "› the tests: their environment, their temp dirs, every route named"
node scripts/check-tests.mjs
# The holder's headless xterm is pinned to the vendored client's version (the screen is drawn by one and read by the
# other), and public/vendor is copied from node_modules by hand: a drift on either side shows here, not in a drawer.
echo "› vendored xterm = node_modules"
# The nearest node_modules up the folders, as Node finds it: a worktree inside the repo has none of its own (2026-10-14).
NM=$PWD; while [ ! -d "$NM/node_modules" ] && [ "$NM" != / ]; do NM=$(dirname "$NM"); done; NM="$NM/node_modules"
for p in @xterm/xterm/lib/xterm.js:xterm.js @xterm/xterm/css/xterm.css:xterm.css @xterm/addon-fit/lib/addon-fit.js:xterm-addon-fit.js @xterm/addon-web-links/lib/addon-web-links.js:xterm-addon-web-links.js; do
  cmp -s "$NM/${p%%:*}" "public/vendor/${p##*:}" || { echo "public/vendor/${p##*:} differs from $NM/${p%%:*}" >&2; exit 1; }
done
echo "› shell"
for f in scripts/launchd.sh scripts/check.sh scripts/worktree.sh scripts/fakepmset.mjs scripts/fakecaffeinate.mjs; do [ -f "$f" ] && sh -n "$f"; done   # the two fakes are sh in a file node reads too
bash -n mac/build.sh
# CLAUDE.md is loaded into every session in this repo, whole: past its budget, a bullet has grown a story, and the story
# belongs in docs/DECISIONS.md (2026-10-12). Characters, as Claude Code counts them — it warns at 150 000.
echo "› CLAUDE.md size"
node -e 'const n = require("fs").readFileSync("CLAUDE.md", "utf8").length, max = 120000;
if (n > max) { console.error(`CLAUDE.md is ${n} characters, over its ${max}: pare its bullets to their rules, the stories go to docs/DECISIONS.md`); process.exit(1); }'
if command -v swiftc >/dev/null 2>&1; then
  MIN_OS=$(sed -n 's/^MIN_OS=\(.*\)$/\1/p' mac/build.sh)
  echo "› swiftc -typecheck (macOS $MIN_OS)"
  swiftc -typecheck -swift-version 5 -target "$(uname -m)-apple-macosx${MIN_OS:-13.0}" mac/Sources/main.swift
  swiftc -typecheck -swift-version 5 scripts/webkit.swift
else echo "› swiftc not found — the app is not type-checked here"; fi
echo "ok"
