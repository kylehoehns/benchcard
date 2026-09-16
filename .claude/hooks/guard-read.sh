#!/bin/bash
# PreToolUse(Read). A large text file is read in parts, never whole.
#
# Every turn re-sends the whole context, so a file read whole is paid for on
# every turn after it, not once. Before this hook, app/app.css (181 KB) and
# scripts/smoke.mjs (167 KB) were read whole by subagents over 200 times, and
# turns carrying more than 200k tokens of context were 61% of the project's
# spend. A partial Read still satisfies Edit's read-first rule, so this costs
# an agent nothing but the grep it should have run anyway.
#
# The limit is on size, not on a list of names, so a file that grows past it
# is covered the day it does.
set -uo pipefail

# FAIL CLOSED, for the reason guard-edit.sh gives.
if ! command -v jq >/dev/null 2>&1; then
  echo "guard-read.sh cannot run: jq is not on PATH, so it cannot read the tool input. Failing closed rather than waving the call through." >&2
  exit 2
fi

MAX_BYTES=60000

input=$(cat)
path=$(jq -r '.tool_input.file_path // ""' <<<"$input")
limit=$(jq -r '.tool_input.limit // ""' <<<"$input")

[ -n "$limit" ] && exit 0
[ -f "$path" ] || exit 0

# Images, PDFs and fonts do not arrive as text, so their byte count says
# nothing about their token cost.
shopt -s nocasematch
case "$path" in
  *.png | *.jpg | *.jpeg | *.gif | *.webp | *.ico | *.pdf | *.woff | *.woff2 | *.ipynb)
    exit 0
    ;;
esac

bytes=$(wc -c <"$path" | tr -d ' ')
[ "$bytes" -le "$MAX_BYTES" ] && exit 0

jq -n --arg r "Blocked: ${path##*/} is ${bytes} bytes (about $((bytes / 4000))k tokens), and a file read whole is re-sent on every later turn. Find the part you need with \`grep -n\`, then Read it with offset and limit. A partial Read is enough for Edit. .claude/hooks/guard-read.sh says why." '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $r
  }
}'
exit 0
