#!/usr/bin/env bash
# Serial merge of one PR: wait until its 5 required checks pass on a head that
# contains origin/main, squash-merge, then wait for main CI + Workers Builds on
# the merge commit. Exits non-zero (and merges nothing more) on any red.
# Between the checks and the merge it runs preview-check.mjs (#596), which waits
# for the preview deploy, looks at the pages the PR changed and posts a PR
# comment; if that fails nothing is merged.
# Exit codes: 1 PR red, 2 main red after the merge, 3 behind main, 4 preview
# check failed (nothing merged), 5 couldn't read from GitHub (#613: a failed or
# empty gh read is retried 3 times, LANES_GH_RETRY_WAIT seconds apart, default 5;
# after the merge, exit 5 says the PR is already merged).
set -u -o pipefail
N=$1
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MAIN=$(git -C "$HERE" worktree list --porcelain | sed -n 's/^worktree //p' | head -n 1)
cd "$MAIN" || exit 2
WAIT=${LANES_GH_RETRY_WAIT:-5}
AFTER=""
# cant_read: print the failure and exit 5 (never call it inside $(...)).
cant_read() { echo "couldn't read #$N from GitHub: $1"; [ -n "$AFTER" ] && echo "$AFTER"; exit 5; }
# read_gh VAR need cmd...: run cmd up to 3 times; set VAR to its output. With
# need=1 an empty answer is a failure. Sets a variable, so exit 5 really exits.
read_gh() {
  local var=$1 need=$2 out err="" try errf; shift 2
  errf=$(mktemp)
  for try in 1 2 3; do
    if out=$("$@" 2>"$errf"); then
      if [ "$need" = 1 ] && [ -z "$out" ]; then err="gh returned nothing"
      else printf -v "$var" '%s' "$out"; rm -f "$errf"; return 0; fi
    else
      err=$(grep -v '^$' "$errf" | tail -n 1); [ -n "$err" ] || err="the command failed with no message"
    fi
    [ "$try" -lt 3 ] && { echo "#$N read failed (attempt $try of 3): $err; retrying"; sleep "$WAIT"; }
  done
  rm -f "$errf"; cant_read "$err"
}
REQ='^(node 24|smoke|evals|service worker behind redirects|checks that need history)$'
while :; do
  git fetch -q origin main
  read_gh head 1 gh pr view $N --json headRefOid -q .headRefOid
  read_gh _ 0 git fetch -q origin "pull/$N/head"
  base_err=$(git merge-base --is-ancestor origin/main "$head" 2>&1); base_rc=$?
  [ "$base_rc" = 1 ] && { echo "#$N is behind main; the lane must rebase and rerun local CI"; exit 3; }
  [ "$base_rc" = 0 ] || cant_read "comparing origin/main with '$head' failed: $(echo "$base_err" | tail -n 1)"
  read_gh st 0 gh pr view $N --json statusCheckRollup -q "[.statusCheckRollup[]|select((.name // .context)|test(\"$REQ\"))|(.conclusion // .status)]|join(\",\")"
  case "$st" in *FAILURE*|*CANCELLED*|*TIMED_OUT*) echo "#$N red: $st"; exit 1;; esac
  [ "$(echo "$st" | tr ',' '\n' | grep -c '^SUCCESS$')" = 5 ] && break
  sleep 45
done
node "$HERE/preview-check.mjs" "$N"; pc=$?
[ "$pc" = 0 ] || { [ "$pc" = 2 ] && cant_read "the preview check could not read from GitHub (see its output above)"; echo "#$N preview check failed; not merged"; exit 4; }
read_gh t 1 gh pr view $N --json title -q .title
gh pr merge $N --squash --subject "$t (#$N)" --body "" || exit 1
git pull -q --ff-only; sha=$(git rev-parse HEAD); echo "merged #$N as ${sha:0:7}"
AFTER="#$N is already merged (as ${sha:0:7}); do not rerun merge-one, only check main CI and the deploy by hand"
while :; do
  read_gh runs 0 gh api repos/kylehoehns/benchcard/commits/$sha/check-runs -q '[.check_runs[]|select(.name|test("^(node 24|smoke|evals|service worker behind redirects|checks that need history|Workers Builds: benchcard)$"))|"\(.name)=\(.conclusion // .status)"]|join(",")'
  case "$runs" in *=failure*|*=cancelled*|*=timed_out*) echo "MAIN RED at ${sha:0:7}: $runs"; exit 2;; esac
  [ "$(echo "$runs" | tr ',' '\n' | grep -c '=success$')" = 6 ] && { echo "main green + deployed at ${sha:0:7}"; exit 0; }
  sleep 45
done
