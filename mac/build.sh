#!/bin/sh
# Build peixAIrada.app — a native WKWebView shell that bundles the board and its server.
#   mac/build.sh            build mac/build/peixAIrada.app
#   mac/build.sh install    build, then move it into /Applications and open it
#   mac/build.sh clean      remove build artefacts
# Requires the Xcode command line tools (swiftc). Node is found at runtime, not bundled.
set -eu
DIR=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(cd "$DIR/.." && pwd -P)
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
rm -rf "$APP/Contents/Resources/node_modules/@xterm"
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
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>$MIN_OS</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>Local tool — not distributed</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
plutil -lint "$APP/Contents/Info.plist" >/dev/null

echo "› sign (ad-hoc)"
codesign --force --deep -s - "$APP"
codesign --verify --deep "$APP" && echo "  signature OK"

if [ "${1:-build}" = install ]; then
  echo "› install"
  osascript -e 'quit app "peixAIrada"' 2>/dev/null || true
  sleep 1
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
