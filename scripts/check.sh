#!/bin/sh
# Static checks, fifteen seconds: every script parses, the code is linted (ESLint, the page's script whole) and formatted
# (Prettier), the page's inline script compiles, the tests keep to a state and temp dirs of their own and name every route
# (scripts/check-tests.mjs), the shell scripts parse, the app's Swift type-checks against the deployment target build.sh
# uses, with the shell's probe too, and the WebKit check's against this Mac. `npm run check`. No network, no server.
set -eu
cd "$(dirname "$0")/.."
echo "› node --check"
for f in server.mjs server/*.mjs server/*/*.mjs lib/*.mjs scripts/*.mjs scripts/fakes/*.mjs scripts/readme/*.mjs scripts/scenarios/*.mjs scripts/shell-checks/*.mjs test/*.mjs; do [ -f "$f" ] && node --check "$f"; done
# The nearest node_modules up the folders, as Node finds it: a worktree inside the repo has none of its own (2026-10-14).
NM=$PWD; while [ ! -d "$NM/node_modules" ] && [ "$NM" != / ]; do NM=$(dirname "$NM"); done; NM="$NM/node_modules"
# The code as one hand wrote it (2026-11-25): ESLint's recommended rules, the page's script linted as it runs, and
# Prettier's layout — `npm run format` writes it, `npm run lint` says what is left.
[ -x "$NM/.bin/eslint" ] && [ -x "$NM/.bin/prettier" ] || { echo "ESLint or Prettier is missing from $NM — npm install" >&2; exit 1; }
echo "› lint"
"$NM/.bin/eslint" . || { echo "npm run format fixes what ESLint can" >&2; exit 1; }
node scripts/lint-page.mjs || { echo "npm run format fixes what ESLint can" >&2; exit 1; }
echo "› format"
"$NM/.bin/prettier" --check --log-level warn . || { echo "not formatted: npm run format" >&2; exit 1; }
echo "› the page's script"
node scripts/check-page.mjs public/index.html
echo "› the tests: their environment, their temp dirs, every route named"
node scripts/check-tests.mjs
# The holder's headless xterm is pinned to the vendored client's version (the screen is drawn by one and read by the
# other), and public/vendor is copied from node_modules by hand: a drift on either side shows here, not in a drawer.
# The page's markdown, its sanitiser and its highlighter too (2026-11-06): pinned in package.json, so npm audit and
# Dependabot see them, and the copy is the registry's file byte for byte — a hand-picked CDN build is no longer one.
echo "› vendored libraries = node_modules"
for p in @xterm/xterm/lib/xterm.js:xterm.js @xterm/xterm/css/xterm.css:xterm.css @xterm/addon-fit/lib/addon-fit.js:xterm-addon-fit.js @xterm/addon-web-links/lib/addon-web-links.js:xterm-addon-web-links.js \
    dompurify/dist/purify.min.js:purify.min.js marked/lib/marked.umd.js:marked.min.js @highlightjs/cdn-assets/highlight.min.js:highlight.min.js; do
  [ -f "$NM/${p%%:*}" ] || { echo "$NM/${p%%:*} is missing — npm install" >&2; exit 1; }
  cmp -s "$NM/${p%%:*}" "public/vendor/${p##*:}" || { echo "public/vendor/${p##*:} differs from $NM/${p%%:*}" >&2; exit 1; }
done
echo "› shell"
for f in scripts/launchd.sh scripts/check.sh scripts/worktree.sh scripts/board.sh scripts/fakes/fakepmset.mjs scripts/fakes/fakecaffeinate.mjs; do [ -f "$f" ] && sh -n "$f"; done   # the two fakes are sh in a file node reads too
bash -n mac/build.sh
# CLAUDE.md is loaded into every session in this repo, whole: past its budget, a bullet has grown a story, and the story
# belongs in docs/DECISIONS.md (2026-10-12). Characters, as Claude Code counts them — it warns at 150 000. mac/'s own
# (2026-10-28) is loaded once a session reads a file there, with a budget of its own.
echo "› CLAUDE.md size"
node -e 'for (const [f, max] of [["CLAUDE.md", 120000], ["mac/CLAUDE.md", 20000]]) { const n = require("fs").readFileSync(f, "utf8").length;
if (n > max) { console.error(`${f} is ${n} characters, over its ${max}: pare its bullets to their rules, the stories go to docs/DECISIONS.md`); process.exit(1); } }'
# the drawers' launcher (2026-11-23): the server builds it as it runs, where an error is only a drawer with no microphone
if [ -d "$(xcode-select -p 2>/dev/null)" ]; then echo "› cc lib/disclaim.c"; cc -fsyntax-only -Wall -Wextra -Werror lib/disclaim.c; fi
if command -v swiftc >/dev/null 2>&1; then
  MIN_OS=$(sed -n 's/^MIN_OS=\(.*\)$/\1/p' mac/build.sh)
  echo "› swiftc -typecheck (macOS $MIN_OS)"
  # the app's files (2026-11-25), in C's order — the one build.sh compiles them in and shell.mjs hashes them in —, one module
  # checked whole (-wmo: one job, not one a file)
  SWIFT=$(printf '%s\n' mac/Sources/*.swift | LC_ALL=C sort)
  swiftc -typecheck -wmo -swift-version 5 -target "$(uname -m)-apple-macosx${MIN_OS:-13.0}" $SWIFT
  swiftc -typecheck -swift-version 5 scripts/webkit.swift
  # …and the shell as `npm run shell` builds it (2026-11-04); that run is what looks at it, so a change it has not seen is said
  swiftc -typecheck -wmo -swift-version 5 -D PEIX_PROBE -target "$(uname -m)-apple-macosx${MIN_OS:-13.0}" $SWIFT scripts/shell-probe.swift
  [ "$(cat $SWIFT scripts/shell-probe.swift | shasum -a 256 | cut -d' ' -f1)" = "$(cat "$NM/.cache/peixairada/shell-passed" 2>/dev/null)" ] ||
    echo "› note: the shell has changed since \`npm run shell\` last passed: run it before this lands"
else echo "› swiftc not found — the app is not type-checked here"; fi
echo "ok"
