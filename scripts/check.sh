#!/bin/sh
# Static checks, ten seconds: every script parses, the page's inline script compiles, the shell scripts parse,
# the Swift type-checks against the deployment target build.sh uses. `npm run check`. No network, no server.
set -eu
cd "$(dirname "$0")/.."
echo "› node --check"
for f in server.mjs lib/*.mjs scripts/*.mjs scripts/scenarios/*.mjs test/*.mjs; do [ -f "$f" ] && node --check "$f"; done
echo "› the page's script"
node scripts/check-page.mjs public/index.html
echo "› shell"
for f in scripts/launchd.sh scripts/check.sh hooks/hook.sh; do [ -f "$f" ] && sh -n "$f"; done
bash -n mac/build.sh
if command -v swiftc >/dev/null 2>&1; then
  MIN_OS=$(sed -n 's/^MIN_OS=\(.*\)$/\1/p' mac/build.sh)
  echo "› swiftc -typecheck (macOS $MIN_OS)"
  swiftc -typecheck -swift-version 5 -target "$(uname -m)-apple-macosx${MIN_OS:-13.0}" mac/Sources/main.swift
else echo "› swiftc not found — the app is not type-checked here"; fi
echo "ok"
