#!/bin/zsh
# Run one Chrome-heavy command (look.mjs, a smoke --only row) inside the same
# machine-wide slot pool ci-local.sh uses, so ad-hoc checks and full local CI
# runs share one CPU budget. Usage: ci-slot.sh <cmd> [args...]
# The command is stopped after CI_SLOT_TIMEOUT seconds (default 600), so a hung
# script can't hold the one slot forever (2026-10-31: a probe with no timeout did).
set -u
SLOTS=${CI_SLOTS:-2}
LIMIT=${CI_SLOT_TIMEOUT:-600}
TMPROOT=${TMPDIR:-/tmp}; TMPROOT=${TMPROOT%/}
POOL=${CI_SLOT_POOL:-$TMPROOT/benchcard-ci-slots}
mkdir -p "$POOL"
SLOT=""
while [ -z "$SLOT" ]; do
  for i in $(seq 1 $SLOTS); do
    d=$POOL/$i
    if mkdir "$d" 2>/dev/null; then echo $$ > "$d/pid"; echo "$PWD" > "$d/wt"; SLOT=$d; break; fi
    p=$(cat "$d/pid" 2>/dev/null)
    if [ -n "$p" ] && ! kill -0 "$p" 2>/dev/null; then rm -rf "$d"; fi
  done
  [ -z "$SLOT" ] && { echo "ci-slot: all $SLOTS slots busy; waiting..." >&2; sleep 20; }
done
trap 'rm -rf "$SLOT"' EXIT INT TERM
"$@" &
CMD=$!
# Watcher polls once a second, so it ends within 1s of the command (one long
# `sleep` outlived the command and held callers' pipes open; 2026-11-01).
( i=0; while [ $i -lt $LIMIT ] && kill -0 $CMD 2>/dev/null; do sleep 1; i=$((i+1)); done
  kill -0 $CMD 2>/dev/null && { echo "ci-slot: stopped after ${LIMIT}s: $*" >&2; pkill -TERM -P $CMD; kill -TERM $CMD; sleep 5; pkill -KILL -P $CMD; kill -KILL $CMD; } 2>/dev/null ) >/dev/null &
wait $CMD
exit $?
