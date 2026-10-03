#!/bin/sh
# Run peixAIrada as a macOS login item (launchd user agent): starts at login, restarts if it dies.
#   scripts/launchd.sh install     # write ~/Library/LaunchAgents/net.peixairada.server.plist, load it, start now;
#                                  # if the app is running on its own server, hand over to the agent (see below)
#   scripts/launchd.sh restart [--after N]   # restart the agent after a change to server.mjs — the drawers stay (each
#                                  # hangs off its own holder, lib/termhold.mjs); N seconds first, for a recap to land
#   scripts/launchd.sh uninstall   # stop it and remove the plist
#   scripts/launchd.sh status      # is it loaded / running?
#   scripts/launchd.sh logs        # tail the log
#   scripts/launchd.sh print       # show the plist that would be installed
# PORT / NOTIFY env vars, this shell's PATH and its node are baked into the plist at install time — after switching
# Node versions or moving a CLI, install again. PORT defaults to 7331. NOTIFY defaults to `off` when the app is
# installed — the app adopts this server and posts its own (richer) notifications, and would stay quiet if the server
# posted native ones — and to `native` for a bare-server setup.
# Why an agent at all: the app's own server dies with the app, and every drawer's claude with it. The
# agent's server outlives the app, so quitting or rebuilding the app leaves the chats running; and since the
# drawers moved into holders (2026-09-20) a `restart` leaves them running too.
set -eu
LABEL=net.peixairada.server
DIR=$(cd "$(dirname "$0")/.." && pwd -P)
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/peixairada.log"
PORT="${PORT:-7331}"
if [ -z "${NOTIFY:-}" ]; then if [ -d /Applications/peixAIrada.app ]; then NOTIFY=off; else NOTIFY=native; fi; fi
NODE=$(command -v node || true)
[ -n "$NODE" ] || { echo "node not found in PATH" >&2; exit 1; }
NODE="$(cd "$(dirname "$NODE")" && pwd -P)/$(basename "$NODE")"   # launchd has no PATH/shims: use the real binary
# The CLIs the server shells out to — claude, gh, task, code — are wherever this shell finds them (Homebrew, mise or
# asdf shims, ~/.local/bin), so the agent gets this PATH, then the system's: a fixed Homebrew-only PATH left a gh
# installed by mise unfound, and the PR states silently off. Absolute entries only, once each, escaped for the plist.
# Every value in the plist is escaped for XML (2026-10-03: the PATH only before — a folder with an & in its name left
# a plist launchd refused, after the old agent had already been booted out).
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
AGENT_PATH=$(xml "$(printf '%s' "$PATH:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin" | awk -v RS=: -v ORS=: '/^\// && !seen[$0]++' | sed -e 's/:$//')")

plist() {
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$(xml "$NODE")</string><string>$(xml "$DIR/server.mjs")</string></array>
  <key>WorkingDirectory</key><string>$(xml "$DIR")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$(xml "$PORT")</string>
    <key>NOTIFY</key><string>$(xml "$NOTIFY")</string>
    <key>PATH</key><string>$AGENT_PATH</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$(xml "$LOG")</string>
  <key>StandardErrorPath</key><string>$(xml "$LOG")</string>
</dict>
</plist>
PLIST
}

# From a terminal drawer the shell may end with the server it hangs off (the app's, on install; the agent's, on
# uninstall — a restart no longer ends it, but the script does not bet on that) and die half way. Detach it, with
# every argument, as build.sh does.
case "${1:-}" in install|restart|uninstall)
  case " $* " in *" --detached "*) ;; *)
    if [ -n "${PEIXAIRADA_DRAWER:-}" ] || [ "${__CFBundleIdentifier:-}" = net.peixairada.app ]; then
      OUT="${TMPDIR:-/tmp}/peixairada-launchd.log"
      echo "› this terminal is a peixAIrada drawer: running detached so the change outlives it — log: $OUT"
      nohup "$0" "$@" --detached >"$OUT" 2>&1 </dev/null &
      exit 0
    fi;;
  esac;;
esac

case "${1:-}" in
  install)
    mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
    # the new plist checked before the old agent goes: a plist launchd refuses must not leave no agent at all
    plist > "$PLIST.new" && plutil -lint "$PLIST.new" >/dev/null || { echo "the plist does not lint — the agent is left as it was: $PLIST.new" >&2; exit 1; }
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    mv "$PLIST.new" "$PLIST"
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "installed $LABEL → http://127.0.0.1:$PORT   (log: $LOG, notify=$NOTIFY)"
    # The app's own server holds the port until the app quits; the agent's waits for it (server.mjs retries
    # a busy port). Hand over: quit the app, let the agent bind, open the app again — it adopts what answers.
    if pgrep -xq peixAIrada; then
      echo "› peixAIrada may be running on its own server: quitting it so the agent takes the port (the drawers stay — each has its holder)"
      osascript -e 'quit app "peixAIrada"' 2>/dev/null || true
      i=0; while pgrep -xq peixAIrada && [ $i -lt 20 ]; do sleep 1; i=$((i+1)); done
      i=0; while ! curl -sf -o /dev/null "http://127.0.0.1:$PORT/api/projects" && [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done
      if curl -sf -o /dev/null "http://127.0.0.1:$PORT/api/projects"; then open -a peixAIrada && echo "› agent answering; peixAIrada reopened and adopts it"
      else echo "› the agent is not answering on $PORT yet — see $LOG; open the app once it does" >&2; fi
    fi;;
  restart)
    AFTER=0; shift
    while [ $# -gt 0 ]; do case "$1" in --after) AFTER="${2:-0}"; shift; shift;; *) shift;; esac; done
    if [ "$AFTER" -gt 0 ] 2>/dev/null; then echo "› restarting in $AFTER s"; sleep "$AFTER"; fi
    launchctl kickstart -k "gui/$(id -u)/$LABEL" && echo "restarted $LABEL — the drawers hang off their holders and stay; the app reattaches by itself";;
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"; echo "removed $LABEL";;
  status)
    launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E '^\s*(state|pid|last exit code)' || echo "$LABEL is not loaded";;
  logs) tail -n 50 -f "$LOG";;
  print) plist;;
  *) sed -n '2,10p' "$0"; exit 1;;
esac
