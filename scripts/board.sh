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
exec curl -s -H "x-peix-key: $KEY" "http://127.0.0.1:${PORT:-7331}/$P" "$@"
