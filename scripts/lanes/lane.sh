#!/usr/bin/env bash
# Start one build lane: a worktree on a new branch at origin/main, node_modules
# linked from the main checkout, and a filled-in prompt for the lane's agent.
# Usage: lane.sh <issue> <branch> <port> [extra-file]
# Worktree: <main>-wt/<issue>. Prompt: <main>-wt/lane-<issue>.txt (path printed).
# Everything is checked and the prompt filled before the worktree is made, so
# a refusal leaves nothing behind.
set -euo pipefail

die() { echo "lane.sh: $*" >&2; exit 1; }

[ $# -eq 3 ] || [ $# -eq 4 ] || die "usage: lane.sh <issue> <branch> <port> [extra-file]"
ISSUE=$1; BRANCH=$2; PORT=$3; EXTRA_FILE=${4:-}

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MAIN=$(git -C "$HERE" worktree list --porcelain | sed -n 's/^worktree //p' | head -n 1)
[ -n "$MAIN" ] || die "cannot find the main checkout from $HERE"
WTDIR="$(dirname "$MAIN")/$(basename "$MAIN")-wt"
WT="$WTDIR/$ISSUE"
PROMPT="$WTDIR/lane-$ISSUE.txt"
LANES="$MAIN/scripts/lanes"
TEMPLATE="$HERE/lane-template.txt"

case "$ISSUE" in ''|*[!0-9]*) die "issue must be a number, got '$ISSUE'";; esac
case "$PORT" in ''|*[!0-9]*) die "port must be a number, got '$PORT'";; esac
[ -z "$EXTRA_FILE" ] || [ -f "$EXTRA_FILE" ] || die "extra file not found: $EXTRA_FILE"
[ -f "$TEMPLATE" ] || die "template not found: $TEMPLATE"
if git -C "$MAIN" show-ref --verify --quiet "refs/heads/$BRANCH"; then die "branch already exists: $BRANCH"; fi
[ ! -e "$WT" ] || die "worktree path already exists: $WT"

TMP=$(mktemp "${TMPDIR:-/tmp}/lane-prompt.XXXXXX")
trap 'rm -f "$TMP"' EXIT

# Values go in through the environment, so / and & in a path are plain text.
export L_N="$ISSUE" L_WT="$WT" L_BRANCH="$BRANCH" L_PORT="$PORT" L_MAIN="$MAIN" L_LANES="$LANES"
if [ -n "$EXTRA_FILE" ]; then L_EXTRA=$(cat "$EXTRA_FILE"); else L_EXTRA=""; fi
export L_EXTRA
awk '
  function rep(s, key, val,   out, i) {
    out = ""
    while ((i = index(s, key)) > 0) { out = out substr(s, 1, i - 1) val; s = substr(s, i + length(key)) }
    return out s
  }
  {
    # __EXTRA__ last, so text inside the extra file is never re-expanded.
    $0 = rep($0, "__N__", ENVIRON["L_N"])
    $0 = rep($0, "__WT__", ENVIRON["L_WT"])
    $0 = rep($0, "__BRANCH__", ENVIRON["L_BRANCH"])
    $0 = rep($0, "__PORT__", ENVIRON["L_PORT"])
    $0 = rep($0, "__MAIN__", ENVIRON["L_MAIN"])
    $0 = rep($0, "__LANES__", ENVIRON["L_LANES"])
    print
  }
' "$TEMPLATE" > "$TMP.body"
trap 'rm -f "$TMP" "$TMP.body"' EXIT
# Leftovers are looked for before the extra text goes in (it may say __X__ on purpose).
LEFT=$(grep -oE '__[A-Z]+__' "$TMP.body" | sort -u | grep -vx '__EXTRA__' || true)
if [ -n "$LEFT" ]; then
  while IFS= read -r name; do echo "lane.sh: unknown placeholder $name in $TEMPLATE" >&2; done <<< "$LEFT"
  exit 1
fi
awk '
  /^__EXTRA__$/ { print ENVIRON["L_EXTRA"]; next }
  { print }
' "$TMP.body" > "$TMP"
if grep -q '__EXTRA__' "$TMP"; then die "__EXTRA__ must be on a line by itself in $TEMPLATE"; fi

git -C "$MAIN" fetch -q origin main
mkdir -p "$WTDIR"
git -C "$MAIN" worktree add -q -b "$BRANCH" "$WT" origin/main
if [ -d "$MAIN/node_modules" ]; then
  ln -s "$MAIN/node_modules" "$WT/node_modules"
else
  echo "lane.sh: warning: $MAIN/node_modules not found, nothing linked" >&2
fi
mv "$TMP" "$PROMPT"
echo "prompt: $PROMPT"
echo "worktree: $WT"
