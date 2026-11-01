#!/bin/bash
# SessionStart. One fact that is cheap to read, easy to forget, and expensive
# to be wrong about.
#
#   * A dirty tree means another iteration is already running. AGENTS.md
#     says "one writer at a time" and nothing enforced it; two writers in this
#     repo means one of them reverts the other's uncommitted fix, which the
#     Guards section already records happening via `git checkout <file>`.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" 2>/dev/null || exit 0

lines=""
dirty=$(git status --porcelain 2>/dev/null | grep -v '^?? \.claude/worktrees/' || true)
if [ -n "$dirty" ]; then
  lines="The tree is DIRTY, which by AGENTS.md (\"Rules\") means an iteration may already be running here -- one writer at a time. Read the diff before writing anything:
$(head -20 <<<"$dirty")"
fi

[ -z "$lines" ] && exit 0

jq -n --arg c "$lines" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $c
  }
}'
