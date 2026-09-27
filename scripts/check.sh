#!/bin/sh
# Static checks, ten seconds: every script parses, the page's inline script compiles, the shell scripts parse,
# the Swift type-checks against the deployment target build.sh uses. `npm run check`. No network, no server.
set -eu
cd "$(dirname "$0")/.."
echo "› node --check"
for f in server.mjs lib/*.mjs scripts/*.mjs scripts/scenarios/*.mjs test/*.mjs; do [ -f "$f" ] && node --check "$f"; done
echo "› the page's script"
node scripts/check-page.mjs public/index.html
# The holder's headless xterm is pinned to the vendored client's version (the screen is drawn by one and read by the
# other), and public/vendor is copied from node_modules by hand: a drift on either side shows here, not in a drawer.
echo "› vendored xterm = node_modules"
for p in @xterm/xterm/lib/xterm.js:xterm.js @xterm/xterm/css/xterm.css:xterm.css @xterm/addon-fit/lib/addon-fit.js:xterm-addon-fit.js @xterm/addon-web-links/lib/addon-web-links.js:xterm-addon-web-links.js; do
  cmp -s "node_modules/${p%%:*}" "public/vendor/${p##*:}" || { echo "public/vendor/${p##*:} differs from node_modules/${p%%:*}" >&2; exit 1; }
done
echo "› shell"
for f in scripts/launchd.sh scripts/check.sh; do [ -f "$f" ] && sh -n "$f"; done
bash -n mac/build.sh
if command -v swiftc >/dev/null 2>&1; then
  MIN_OS=$(sed -n 's/^MIN_OS=\(.*\)$/\1/p' mac/build.sh)
  echo "› swiftc -typecheck (macOS $MIN_OS)"
  swiftc -typecheck -swift-version 5 -target "$(uname -m)-apple-macosx${MIN_OS:-13.0}" mac/Sources/main.swift
else echo "› swiftc not found — the app is not type-checked here"; fi
echo "ok"
