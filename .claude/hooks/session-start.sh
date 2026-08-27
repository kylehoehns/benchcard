#!/bin/bash
# SessionStart. Two facts that are cheap to read, easy to forget, and expensive
# to be wrong about.
#
#   * A dirty tree means another iteration is already running. notes/TICKETS.md
#     says "one writer at a time" and nothing enforced it; two writers in this
#     repo means one of them reverts the other's uncommitted fix, which the
#     Guards section already records happening via `git checkout <file>`.
#   * The shell constants, so the sw.js bump is a check rather than a lookup.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" 2>/dev/null || exit 0

lines=""
dirty=$(git status --porcelain 2>/dev/null | grep -v '^?? \.claude/worktrees/' || true)
if [ -n "$dirty" ]; then
  lines="The tree is DIRTY, which by notes/TICKETS.md means an iteration may already be running here -- one writer at a time. Read the diff before writing anything:
$(printf '%s' "$dirty" | head -20)"
fi

if [ -f app/sw.js ]; then
  v=$(grep -oE "const VERSION = '[^']*'" app/sw.js | head -1 | sed "s/.*'\(.*\)'/\1/")
  s=$(grep -oE "const SHELL = '[^']*'" app/sw.js | head -1 | sed "s/.*'\(.*\)'/\1/")
  lines="${lines:+$lines
}Shell now: VERSION $v, SHELL $s."
fi

[ -z "$lines" ] && exit 0

jq -n --arg c "$lines" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $c
  }
}'
