#!/bin/bash
# PreToolUse(Bash). Three commands AGENTS.md forbids in prose, forbidden in fact.
#
# Prose in AGENTS.md is read once at session start and competes with 11KB of
# other prose. These three have all been violated or nearly violated before,
# and all three are exactly matchable, so they belong here instead of there.
# AGENTS.md still states each rule and WHY -- this file is only the enforcement.
#
# Scoping matters as much as matching: a guard that fires on `grep -n
# update-budgets scripts/smoke.mjs` would be turned off within a day, and a
# guard that is off is worse than no guard because it reads as protection.
# Every pattern below is ordered so that reading ABOUT the command is allowed
# and RUNNING it is not.
set -uo pipefail

# FAIL CLOSED. Without jq the reads below return empty, every pattern misses,
# and the hook allows everything while still reporting success -- the exact
# shape of false green this repo has been bitten by most. Exit 2 blocks the
# call instead. The check uses only bash builtins so it still works when the
# PATH is the thing that is broken.
if ! command -v jq >/dev/null 2>&1; then
  echo "guard-bash.sh cannot run: jq is not on PATH, so it cannot read the tool input. Failing closed rather than waving the call through." >&2
  exit 2
fi

cmd=$(jq -r '.tool_input.command // ""')

deny() {
  jq -n --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

# The flag must come AFTER smoke.mjs in the same command word-run, which is how
# it is actually invoked and is not how anyone greps for it.
if printf '%s' "$cmd" | grep -qE 'smoke\.mjs[^|;&]*--update-budgets'; then
  deny 'Blocked: a blanket --update-budgets re-records scripts/budgets.json wholesale and erases the hand-set `requests` pin (40 of 41), which is the one number in that file that is a real constraint rather than a regression alarm. Widen the specific ceiling in scripts/budgets.mjs instead, deliberately, and say why in the commit. AGENTS.md, "Layout".'
fi

if printf '%s' "$cmd" | grep -qE '(^|[|;&[:space:]])git[[:space:]]+add[[:space:]]+(-A|--all|\.)([[:space:]]|$)'; then
  deny 'Blocked: stage explicit paths, never `git add -A` / `git add .`. This tree carries screenshots, .playwright-mcp scratch and worktrees that are ignored today only because someone remembered to ignore them; the next scratch file will not be. notes/TICKETS.md, header.'
fi

if printf '%s' "$cmd" | grep -qE '(^|[|;&[:space:]])git[[:space:]]+commit' \
   && printf '%s' "$cmd" | grep -qiE 'co-authored-by'; then
  deny 'Blocked: no `Co-Authored-By` trailer in this repo. 382 commits carry zero trailers and AGENTS.md ("Rules") says so explicitly; that overrides the general instruction to keep the trailer. Re-run the commit without it.'
fi

exit 0
