#!/bin/zsh
# After a clean rebase, may this branch skip rerunning local CI?
# Usage: rebase-skip-ok.sh <worktree> <green-sha>
#   <green-sha> = the commit whose local CI was GREEN (before the rebase).
# Owner decision 2026-11-01: skip the rerun only when main's new commits share
# no file with this branch and touch no shared tooling. GitHub's checks still
# must pass before merging. Prints SKIP-OK (exit 0) or RERUN (exit 1) and why.
set -u
WT=$1; GREEN=$2
cd "$WT" || exit 2
git fetch -q origin
git merge-base --is-ancestor origin/main HEAD || { echo "RERUN: branch is not on origin/main yet"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "RERUN: uncommitted changes"; exit 1; }
OLDBASE=$(git merge-base "$GREEN" origin/main)
MAIN_NEW=$(git diff --name-only "$OLDBASE" origin/main | sort -u)
MINE=$(git diff --name-only origin/main...HEAD | sort -u)
[ -n "$MAIN_NEW" ] || { echo "SKIP-OK: main has no new file changes"; exit 0; }
# Same content as what was tested? The branch's own diff must be unchanged.
if ! diff -q <(git diff "$OLDBASE" "$GREEN" | grep -v '^index ') <(git diff origin/main HEAD | grep -v '^index ') >/dev/null; then
  echo "RERUN: the branch's own diff changed in the rebase"; exit 1
fi
SHARED=$(echo "$MAIN_NEW" | grep -E '^(package(-lock)?\.json|scripts/|test/helpers|test/fixtures|\.github/|wrangler|src/)' )
[ -z "$SHARED" ] || { echo "RERUN: main changed shared tooling:"; echo "$SHARED"; exit 1; }
BOTH=$(comm -12 <(echo "$MAIN_NEW") <(echo "$MINE"))
[ -z "$BOTH" ] || { echo "RERUN: main and this branch both changed:"; echo "$BOTH"; exit 1; }
echo "SKIP-OK: main's new commits share no file with this branch:"; echo "$MAIN_NEW" | sed 's/^/  /'
