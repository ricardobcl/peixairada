#!/bin/sh
# Run peixAIrada as a macOS login item (launchd user agent): starts at login, restarts if it dies.
#   scripts/launchd.sh install     # write ~/Library/LaunchAgents/net.peixairada.server.plist, load it, start now
#   scripts/launchd.sh uninstall   # stop it and remove the plist
#   scripts/launchd.sh status      # is it loaded / running?
#   scripts/launchd.sh logs        # tail the log
#   scripts/launchd.sh print       # show the plist that would be installed
# PORT / NOTIFY env vars are baked into the plist at install time (defaults 7331 / native).
set -eu
LABEL=net.peixairada.server
DIR=$(cd "$(dirname "$0")/.." && pwd -P)
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/peixairada.log"
PORT="${PORT:-7331}"
NOTIFY="${NOTIFY:-native}"
NODE=$(command -v node || true)
[ -n "$NODE" ] || { echo "node not found in PATH" >&2; exit 1; }
NODE="$(cd "$(dirname "$NODE")" && pwd -P)/$(basename "$NODE")"   # launchd has no PATH/shims: use the real binary

plist() {
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$DIR/server.mjs</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>NOTIFY</key><string>$NOTIFY</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
}

case "${1:-}" in
  install)
    mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    plist > "$PLIST"
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "installed $LABEL → http://127.0.0.1:$PORT   (log: $LOG)";;
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"; echo "removed $LABEL";;
  status)
    launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E '^\s*(state|pid|last exit code)' || echo "$LABEL is not loaded";;
  logs) tail -n 50 -f "$LOG";;
  print) plist;;
  *) sed -n '2,8p' "$0"; exit 1;;
esac
