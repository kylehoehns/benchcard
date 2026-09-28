#!/bin/bash
# PostToolUse(Edit|Write). Advisory only -- it never blocks and never fails a
# tool call. Two reminders, each fired only when the edit actually earns it.
#
# WHY ADVISORY AND NOT A BLOCK. The right SHELL digest is not knowable mid-edit:
# the other precached files may not be final yet, so there is no correct value
# to demand at edit time; blocking here would only be able to demand something
# wrong. Once the edits are done, `npm run sw:bump` computes it in seconds, and
# test/sw.test.js is the check that decides, everywhere. This is the nudge that
# gets you there before you commit --
# scripts/check-sw-version.mjs needs a base ref and so is inert locally.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"
path=$(jq -r '.tool_input.file_path // ""')
base=$(basename "$path")
notes=""

# Is this file one of the ones sw.js precaches? Ask sw.js, not a copied list --
# a second copy of PRECACHE here would drift and this repo says so at length.
case "$path" in
  */app/*)
    if [ -f "$root/app/sw.js" ] && grep -qF "'./$base'" "$root/app/sw.js"; then
      v=$(grep -oE "const VERSION = '[^']*'" "$root/app/sw.js" | head -1)
      s=$(grep -oE "const SHELL = '[^']*'" "$root/app/sw.js" | head -1)
      notes="app/$base is in sw.js PRECACHE, so this edit changes the shell. Before committing: run \`npm run sw:bump\` to bump VERSION and set SHELL. Currently ${v:-?} / ${s:-?}."
    fi
    ;;
esac

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
