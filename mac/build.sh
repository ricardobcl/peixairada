#!/bin/sh
# Build peixAIrada.app — a native WKWebView shell that bundles the board and its server.
#   mac/build.sh            build mac/build/peixAIrada.app
#   mac/build.sh install    build, then move it into /Applications and open it
#   mac/build.sh clean      remove build artefacts
# Requires the Xcode command line tools (swiftc) and node: the node that runs this is bundled, with node_modules.
set -eu
DIR=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(cd "$DIR/.." && pwd -P)
VERSION=$(node -p "require('$ROOT/package.json').version")   # the one version, package.json's — the About box shows it
BUILD="$DIR/build"
APP="$BUILD/peixAIrada.app"
# The deployment target must be explicit. swiftc's default follows the *toolchain*, not this Mac:
# a beta Xcode stamped the binary "minos 28.0" on a 27.0 machine and LaunchServices refused to
# open it (-10825, kLSIncompatibleSystemVersionErr) — after the old app had already been removed.
MIN_OS=13.0
TARGET="$(uname -m)-apple-macosx$MIN_OS"

case "${1:-build}" in
  clean) rm -rf "$BUILD" "$DIR/icon/makeicon" "$DIR/icon/peixAIrada.iconset" "$DIR/icon/peixAIrada.icns"; echo "cleaned"; exit 0;;
  build|install) ;;
  *) sed -n '2,6p' "$0"; exit 1;;
esac

command -v swiftc >/dev/null || { echo "swiftc not found — install the Xcode command line tools (xcode-select --install)" >&2; exit 1; }

# Run from a terminal drawer *inside* the app, the install would kill itself: quitting the app ends its
# server, the server owns the drawer's PTY, and the signal lands on this script somewhere between the
# quit and the cp — possibly after the rm, leaving no app at all. The drawer's environment inherits the
# app's bundle id, so detect that and rebuild detached: nohup, no tty, output to a log. The chat in the
# drawer ends with the app and is resumed from the board (>_) or with `claude --resume <id>`.
# The detached copy is marked by an *argument*, never an environment variable: `open` hands the
# caller's environment to the app, the app to its server, the server to every drawer, and an env marker
# came back round to the next install from a drawer, which then ran inline and killed itself.
if [ "${1:-build}" = install ] && [ "${2:-}" != --detached ] && [ "${__CFBundleIdentifier:-}" = net.peixairada.app ]; then
  LOG="${TMPDIR:-/tmp}/peixairada-build.log"
  echo "› this terminal lives in a peixAIrada drawer, which dies with the app: rebuilding detached instead"
  echo "  log: $LOG — this chat ends when the app quits; resume it from the board once it is back"
  nohup "$0" install --detached >"$LOG" 2>&1 </dev/null &
  exit 0
fi

echo "› icon"
cd "$DIR/icon"
swiftc -swift-version 5 -O -target "$TARGET" MakeIcon.swift -o makeicon
./makeicon . >/dev/null
iconutil -c icns peixAIrada.iconset -o peixAIrada.icns

echo "› compile"
rm -rf "$BUILD"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -swift-version 5 -O -target "$TARGET" "$DIR/Sources/main.swift" -o "$APP/Contents/MacOS/peixAIrada"

echo "› bundle"
cp "$DIR/icon/peixAIrada.icns" "$APP/Contents/Resources/AppIcon.icns"
cp "$ROOT/server.mjs" "$APP/Contents/Resources/server.mjs"
cp -R "$ROOT/lib" "$APP/Contents/Resources/lib"   # the terminal holder and the plumbing the server imports
# The node that runs the server travels with the app: the one on PATH here, which is the one that
# ran npm install, so node-pty's native addon matches its ABI. The app never looks for node again.
NODE_BIN=$(command -v node) || { echo "node not found on PATH — it is copied into the bundle"; exit 1; }
cp "$(readlink -f "$NODE_BIN")" "$APP/Contents/Resources/node"
chmod +x "$APP/Contents/Resources/node"
echo "  node $("$APP/Contents/Resources/node" --version) bundled"
cp "$ROOT/package.json" "$APP/Contents/Resources/package.json"
cp -R "$ROOT/public" "$APP/Contents/Resources/public"
# The server imports ws and node-pty, so the bundle carries node_modules — installed here first if
# it is missing. The xterm packages are dev-only (vendored copies live in public/vendor) and are
# pruned from the copy; node-pty's spawn-helper keeps its executable bit through cp -R.
[ -d "$ROOT/node_modules/node-pty" ] || (cd "$ROOT" && npm install --no-audit --no-fund)
cp -R "$ROOT/node_modules" "$APP/Contents/Resources/node_modules"
# The xterm *client* packages are dev-only sources for public/vendor; @xterm/headless and addon-serialize are the
# server's (the screen snapshot on attach) and stay.
rm -rf "$APP/Contents/Resources/node_modules/@xterm/xterm" "$APP/Contents/Resources/node_modules/@xterm/addon-fit" "$APP/Contents/Resources/node_modules/@xterm/addon-web-links"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>peixAIrada</string>
  <key>CFBundleDisplayName</key><string>peixAIrada</string>
  <key>CFBundleExecutable</key><string>peixAIrada</string>
  <key>CFBundleIdentifier</key><string>net.peixairada.app</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>$MIN_OS</string>
  <key>NSHighResolutionCapable</key><true/>
  <!-- ⌃⌘F fills the screen up to the camera housing: never the shrunken compatibility mode for a window behind it -->
  <key>NSPrefersDisplaySafeAreaCompatibilityMode</key><false/>
  <key>NSHumanReadableCopyright</key><string>Local tool — not distributed</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
plutil -lint "$APP/Contents/Info.plist" >/dev/null

# Signing. An ad-hoc signature is a new identity every build, and macOS keys its privacy grants (App
# Management, notifications) to the signature: every install reset them. Worse, an ad-hoc app has no
# team, so its own writes into /Applications/peixAIrada.app — the install from a drawer, node-pty's
# chmod at start — count as "another developer modifying an app" and raise the "prevented from
# modifying apps on your Mac" banner. A real identity gives a stable designated requirement and a
# team, and an app may touch apps of its own team. CODESIGN_ID picks it (a hash or a name from
# `security find-identity -v -p codesigning`); unset, the single valid identity in the keychain is
# used; none, or CODESIGN_ID=-, means ad-hoc as before. The first signing asks for the key once.
ID="${CODESIGN_ID:-}"
IDS=$(security find-identity -v -p codesigning 2>/dev/null || true)
if [ -z "$ID" ] && [ "$(printf '%s\n' "$IDS" | grep -c '^ *[0-9][0-9]*) ')" = 1 ]; then
  ID=$(printf '%s\n' "$IDS" | sed -n 's/^ *1) \([0-9A-F]*\) .*/\1/p')
fi
[ -n "$ID" ] || ID=-
if [ "$ID" = - ]; then echo "› sign (ad-hoc — privacy grants will not survive the next install)"
else echo "› sign ($(printf '%s\n' "$IDS" | grep -F "$ID" | sed 's/.*"\(.*\)".*/\1/'))"; fi
codesign --force --deep -s "$ID" "$APP"
codesign --verify --deep "$APP" && echo "  signature OK"

if [ "${1:-build}" = install ]; then
  echo "› install"
  osascript -e 'quit app "peixAIrada"' 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -xq peixAIrada || break; sleep 0.5; done   # the copy must not land on a running app (a fixed second did not always cover the quit)
  rm -rf /Applications/peixAIrada.app
  cp -R "$APP" /Applications/
  # notifications are tied to the bundle's identity, so register the installed copy explicitly
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
    -f /Applications/peixAIrada.app 2>/dev/null || true
  open /Applications/peixAIrada.app
  echo "installed → /Applications/peixAIrada.app"
else
  echo "built → $APP"
  echo "run with: open '$APP'    (or mac/build.sh install)"
fi
