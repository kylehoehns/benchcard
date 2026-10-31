#!/bin/bash
# PostToolUse(Edit|Write). Advisory only -- it never blocks and never fails a
# tool call. Two reminders, each fired only when the edit actually earns it:
# a guard edited (run it red), and a British spelling.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"
path=$(jq -r '.tool_input.file_path // ""')
notes=""

case "$path" in
  */test/*.test.js)
    notes="${notes:+$notes }Guard edited. Run it RED before trusting it green: break the thing it guards, confirm it fails, restore. A guard that cannot fail is not a guard -- see /new-guard."
    ;;
esac

# #61: American spelling everywhere. One word list, in scripts/spelling.mjs --
# this hook holds no copy of it, it just runs the check on the one edited
# file. Advisory only: it never blocks, it only appends to the note.
case "$path" in
  */app/vendor/*) ;;
  *)
    if [ -f "$root/scripts/spelling.mjs" ]; then
      spelling=$(node "$root/scripts/spelling.mjs" "$path" 2>/dev/null)
      [ -n "$spelling" ] && notes="${notes:+$notes }American spelling (scripts/spelling.mjs): $spelling"
    fi
    ;;
esac

[ -z "$notes" ] && exit 0

jq -n --arg c "$notes" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $c
  }
}'
