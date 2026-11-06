#!/bin/sh
# The board's API from a terminal, with its key (2026-10-16): every route but the page wants it (server.mjs, keyWant).
#   scripts/board.sh /api/terminals        # GET; the answer on stdout
#   scripts/board.sh /api/key -X PUT       # whatever follows the path goes to curl
# PORT is 7331 unless set; the key is the file beside the state file (STATE_FILE, else the Mac's default).
set -eu
[ $# -ge 1 ] || { sed -n '3,4p' "$0"; exit 1; }
P="${1#/}"; shift
STATE="${STATE_FILE:-$HOME/Library/Application Support/peixAIrada/state.json}"
KEY=$(cat "$(dirname "$STATE")/key" 2>/dev/null || true)
# The key goes to curl as a config line on its stdin, never an argument (2026-11-06): ps shows every account's arguments.
# printf is the shell's own, no process of its own.
printf 'header = "x-peix-key: %s"\n' "$KEY" | curl -s -K - "http://127.0.0.1:${PORT:-7331}/$P" "$@"
