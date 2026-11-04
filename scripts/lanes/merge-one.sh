#!/usr/bin/env bash
# Serial merge of one PR: wait until its 5 required checks pass on a head that
# contains origin/main, squash-merge, then wait for main CI + Workers Builds on
# the merge commit. Exits non-zero (and merges nothing more) on any red.
# Between the checks and the merge it runs preview-check.mjs (#596), which waits
# for the preview deploy, looks at the pages the PR changed and posts a PR
# comment; if that fails nothing is merged.
# Exit codes: 1 PR red, 2 main red after the merge, 3 behind main, 4 preview
# check failed (nothing merged).
set -u -o pipefail
N=$1
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MAIN=$(git -C "$HERE" worktree list --porcelain | sed -n 's/^worktree //p' | head -n 1)
cd "$MAIN" || exit 2
REQ='^(node 24|smoke|evals|service worker behind redirects|checks that need history)$'
while :; do
  git fetch -q origin main
  head=$(gh pr view $N --json headRefOid -q .headRefOid)
  git fetch -q origin "pull/$N/head"
  if ! git merge-base --is-ancestor origin/main "$head"; then echo "#$N is behind main; the lane must rebase and rerun local CI"; exit 3; fi
  st=$(gh pr view $N --json statusCheckRollup -q "[.statusCheckRollup[]|select((.name // .context)|test(\"$REQ\"))|(.conclusion // .status)]|join(\",\")")
  case "$st" in *FAILURE*|*CANCELLED*|*TIMED_OUT*) echo "#$N red: $st"; exit 1;; esac
  [ "$(echo "$st" | tr ',' '\n' | grep -c '^SUCCESS$')" = 5 ] && break
  sleep 45
done
node "$HERE/preview-check.mjs" "$N" || { echo "#$N preview check failed; not merged"; exit 4; }
t=$(gh pr view $N --json title -q .title)
gh pr merge $N --squash --subject "$t (#$N)" --body "" || exit 1
git pull -q --ff-only; sha=$(git rev-parse HEAD); echo "merged #$N as ${sha:0:7}"
while :; do
  runs=$(gh api repos/kylehoehns/benchcard/commits/$sha/check-runs -q '[.check_runs[]|select(.name|test("^(node 24|smoke|evals|service worker behind redirects|checks that need history|Workers Builds: benchcard)$"))|"\(.name)=\(.conclusion // .status)"]|join(",")')
  case "$runs" in *=failure*|*=cancelled*|*=timed_out*) echo "MAIN RED at ${sha:0:7}: $runs"; exit 2;; esac
  [ "$(echo "$runs" | tr ',' '\n' | grep -c '=success$')" = 6 ] && { echo "main green + deployed at ${sha:0:7}"; exit 0; }
  sleep 45
done
