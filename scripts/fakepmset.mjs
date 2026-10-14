#!/bin/sh
true /*
# A stand-in for `pmset` — the calls the board makes of it to keep the Mac awake (2026-10-08): `pmset -g`, of which it
# reads SleepDisabled and the idle sleep in use, `pmset -g ps`, the power drawn from (2026-10-09), and
# `pmset -a disablesleep 0|1`, which on a real Mac takes root. SleepDisabled lives in FAKE_PMSET_FILE ("0" or "1"); the
# power in FAKE_PMSET_POWER, its source and the idle minutes on it ("ac 0": on a charger, never sleeping on its own),
# "battery 1" when there is none. Every test server is handed this script (PMSET_BIN) and AWAKE_ADMIN=none, so no test
# asks for a password or changes how this Mac sleeps.
# sh, in a file node reads as well (2026-10-14): `npm run check` node-checks scripts/*.mjs — to node, all after `true` is
# the comment that line opens — and lib/testserver.mjs names it so. In node it took 150 ms a spawn, seconds on a loaded
# Mac, past readPower's 5 s: every test server runs two a registry poll. No `*` before a `/` below, or node's comment ends.
file=$FAKE_PMSET_FILE
[ -n "$file" ] || { echo 'fakepmset: FAKE_PMSET_FILE is not set' >&2; exit 2; }
sd=0; v=; { read -r v || :; } 2>/dev/null < "$file"; [ "$v" = 1 ] && sd=1
src=; min=; { read -r src min rest || :; } 2>/dev/null < "${FAKE_PMSET_POWER:-/dev/null}"
[ -n "$src" ] || { src=battery; min=1; }
case $min in ''|*[!0-9]*) min=0 ;; esac
if [ "$1" = -g ] && [ "$2" = ps ]; then
  if [ "$src" = ac ]; then from=AC; left='100%; charged; 0:00'; else from=Battery; left='80%; discharging; 4:00'; fi
  printf "Now drawing from '%s Power'\n -InternalBattery-0 (id=1)\t%s remaining present: true\n" "$from" "$left"
elif [ "$1" = -g ]; then
  printf 'System-wide power settings:\n SleepDisabled\t\t%s\nCurrently in use:\n Sleep On Power Button 1\n disksleep            10\n sleep                %s\n displaysleep         10\n' "$sd" "$min"
elif [ "$1" = -a ] && [ "$2" = disablesleep ] && { [ "$3" = 0 ] || [ "$3" = 1 ]; }; then
  [ -z "$FAKE_PMSET_FAIL" ] || { printf '%s\n' "$FAKE_PMSET_FAIL" >&2; exit 1; }
  printf %s "$3" > "$file"
else
  echo "fakepmset: no such call: $*" >&2; exit 2
fi
exit
*/
