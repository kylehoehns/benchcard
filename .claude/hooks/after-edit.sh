#!/bin/bash
# PostToolUse(Edit|Write). Advisory only -- it never blocks and never fails a
# tool call. Two reminders, each fired only when the edit actually earns it.
#
# WHY ADVISORY AND NOT A BLOCK. The right SHELL digest is not knowable until
# `npm test` has hashed the precached bytes, so there is no correct value to
# demand at edit time; blocking here would only be able to demand something
# wrong. test/sw.test.js is the check that can actually decide, and it runs
# everywhere. This is the nudge that gets you there before you commit --
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
      notes="app/$base is in sw.js PRECACHE, so this edit changes the shell. Before committing: bump VERSION and set SHELL to the digest \`npm test\` names, in the same edit. Currently ${v:-?} / ${s:-?}."
    fi
    ;;
esac

case "$path" in
  */test/*.test.js)
    notes="${notes:+$notes }Guard edited. Run it RED before trusting it green: break the thing it guards, confirm it fails, restore. A guard that cannot fail is not a guard -- see /new-guard."
    ;;
esac

[ -z "$notes" ] && exit 0

jq -n --arg c "$notes" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $c
  }
}'
