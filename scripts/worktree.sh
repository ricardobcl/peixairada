#!/bin/sh
# A worktree per piece of parallel work, so sessions sharing this checkout stay out of each other's files (2026-10-14).
#   scripts/worktree.sh new <name> [base]   # .claude/worktrees/<name> on a new branch <name>, from base (local main)
#   scripts/worktree.sh list                # each: its commits not on main, files not committed, in use, last touched
#   scripts/worktree.sh done <name>...      # remove the worktree and its branch, if all its work is on main
#   scripts/worktree.sh prune               # done for each one that took commits, has them all on main, and has
#                                           # been left an hour; the others are kept and said why
# No node_modules link: Node looks for node_modules up the folders, so a worktree inside the repo finds the checkout's
# own. Nothing is forced: a worktree is kept while it has a file not committed (an untracked one too), a commit not on
# main (compared by patch, so a cherry-picked one counts as on main), or a process whose current folder is inside it.
# A link to the checkout's node_modules, as older worktrees had, goes first — the link alone, never what it points at.
# MAIN (the branch to compare with) and QUIET_S (prune's wait) are the tests'. Run from a worktree, it works on the
# main checkout's.
set -eu
DIR=$(dirname "$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)")
DIR=$(cd "$DIR" && pwd -P)
ROOT="$DIR/.claude/worktrees"
MAIN="${MAIN:-main}"
QUIET_S="${QUIET_S:-3600}"
CWDS=

die() { echo "$*" >&2; exit 1; }

registered() {
  git -C "$DIR" worktree list --porcelain | grep -qxF "worktree $1"
}

# The current folder of every process this user can see, read once (lsof takes seconds), outside any pipe.
read_cwds() {
  [ -n "$CWDS" ] || CWDS=$(lsof -a -d cwd -F n 2>/dev/null | sed -n 's/^n//p'; echo .)
}

in_use() {
  printf '%s\n' "$CWDS" | awk -v p="$1" 'index($0, p) == 1 && (length($0) == length(p) || substr($0, length(p) + 1, 1) == "/") { f = 1 } END { exit !f }'
}

# Commits at $1 with no equal patch on main.
unlanded() {
  git -C "$DIR" cherry "$MAIN" "$1" | grep -c '^+' || true
}

# What is in the worktree and not committed, but for an old node_modules link.
loose() {
  git -C "$1" status --porcelain --untracked-files=all | grep -vxF '?? node_modules' || true
}

# When the worktree's HEAD last moved (a commit, a reset, its making), in seconds since the epoch.
touched() {
  t=$(git -C "$1" reflog -1 --date=unix --format=%gd HEAD 2>/dev/null | tr -dc 0-9)
  echo "${t:-0}"
}

# Whether anyone committed in it: a fresh worktree, or one only fast-forwarded to main, is someone's start.
worked() {
  git -C "$1" reflog --format=%gs HEAD 2>/dev/null | grep -qE '^(commit|rebase|cherry-pick)'
}

remove() {
  wt="$ROOT/$1"
  registered "$wt" || { echo "$1: no worktree at $wt" >&2; return 1; }
  br=$(git -C "$wt" symbolic-ref --short -q HEAD || true)
  tip=$(git -C "$wt" rev-parse HEAD)
  n=$(unlanded "$tip")
  [ "$n" -eq 0 ] || { echo "$1: kept — $n commit(s) not on $MAIN (one landed by a cherry-pick with a conflict resolved is" \
    "not the same patch: once it is on $MAIN, git -C $wt reset --keep $MAIN, then done again)" >&2; return 1; }
  left=$(loose "$wt")
  [ -z "$left" ] || { printf '%s: kept — not committed:\n%s\n' "$1" "$left" >&2; return 1; }
  ! in_use "$wt" || { echo "$1: kept — a process works inside it" >&2; return 1; }
  if [ -L "$wt/node_modules" ]; then
    [ "$(cd "$wt/node_modules" && pwd -P)" = "$(cd "$DIR/node_modules" 2>/dev/null && pwd -P)" ] ||
      { echo "$1: kept — its node_modules links somewhere else" >&2; return 1; }
    rm "$wt/node_modules"
  fi
  git -C "$DIR" worktree remove "$wt"
  if [ -n "$br" ]; then
    # On main by ancestry, -d agrees; on main by patch only (a cherry-pick), -d would not, and unlanded said so.
    if git -C "$DIR" merge-base --is-ancestor "$tip" "$MAIN"; then git -C "$DIR" branch -q -d "$br"
    else git -C "$DIR" branch -q -D "$br"; fi
  fi
  echo "$1: removed${br:+, and its branch $br}"
}

names() {
  git -C "$DIR" worktree list --porcelain | sed -n "s|^worktree $ROOT/\([^/]*\)\$|\1|p"
}

cmd="${1:-list}"
[ $# -eq 0 ] || shift
case "$cmd" in
  new)
    [ $# -ge 1 ] || die "usage: scripts/worktree.sh new <name> [base]"
    case "$1" in ''|*/*|.*|-*) die "$1: a plain folder name, please";; esac
    git -C "$DIR" worktree add -q -b "$1" "$ROOT/$1" "${2:-$MAIN}"
    echo "$ROOT/$1"
    ;;
  list)
    now=$(date +%s); read_cwds
    for name in $(names); do
      wt="$ROOT/$name"
      br=$(git -C "$wt" symbolic-ref --short -q HEAD || echo detached)
      n=$(unlanded "$(git -C "$wt" rev-parse HEAD)")
      f=$(loose "$wt" | grep -c . || true)
      use=; ! in_use "$wt" || use=', in use'
      echo "$name ($br): $n not on $MAIN, $f not committed$use, touched $(( (now - $(touched "$wt")) / 60 )) min ago"
    done
    ;;
  done)
    [ $# -ge 1 ] || die "usage: scripts/worktree.sh done <name>..."
    rc=0; read_cwds
    for name in "$@"; do remove "$name" || rc=1; done
    exit $rc
    ;;
  prune)
    now=$(date +%s); read_cwds
    for name in $(names); do
      wt="$ROOT/$name"
      worked "$wt" || { echo "$name: kept — no commit of its own yet"; continue; }
      [ $(( now - $(touched "$wt") )) -ge $QUIET_S ] ||
        { echo "$name: kept — touched within the hour"; continue; }
      remove "$name" || true
    done
    ;;
  *) die "usage: scripts/worktree.sh new <name> [base] | list | done <name>... | prune" ;;
esac
