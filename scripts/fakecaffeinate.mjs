#!/bin/sh
true /*
# A stand-in for `caffeinate -i -w <pid>` (2026-10-08): it holds no assertion, only lives as the real one would — until
# the process it waits on is gone, or it is ended. Every test server is handed it (CAFFEINATE_BIN), so no test keeps
# this Mac awake; FAKE_CAFFEINATE_PIDS, when set, gets a line with its pid, for a test to look for it.
# sh, in a file node reads as well (2026-10-14) — see fakepmset.mjs. No `*` before a `/` below.
pid=0; prev=
for a in "$@"; do [ "$prev" = -w ] && pid=$a; prev=$a; done
case $pid in ''|*[!0-9]*) pid=0 ;; esac
[ -z "$FAKE_CAFFEINATE_PIDS" ] || printf '%s %s\n' "$$" "$*" >> "$FAKE_CAFFEINATE_PIDS"
while :; do sleep 0.3; [ "$pid" = 0 ] || kill -0 "$pid" 2>/dev/null || exit 0; done
*/
