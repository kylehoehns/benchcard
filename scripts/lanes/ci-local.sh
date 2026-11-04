#!/bin/zsh
# Local copy of the five required checks in .github/workflows/test.yml.
# Usage: ci-local.sh [worktree]   (default: current directory)
#
# - Refuses unless the branch already contains origin/main (the up-to-date rule).
# - Runs the same parts CI runs, two smoke parts at a time: smoke suite (this is `node --test`,
#   so it also stands in for the "node 24" job), smoke 1/3 2/3 3/3, evals,
#   redirect-check, and the three history checks (What's new since #529) against origin/main.
#   Then merges the smoke parts the way the `smoke` job does.
# - The slot pool is one fixed path, /tmp/benchcard-ci-slots, so every lane on the
#   machine shares it whatever its TMPDIR is. CI_SLOT_POOL overrides it.
# - Ports: every server and Chrome here binds port 0 with its own temp
#   profile, so runs in different worktrees never collide on ports.
# - CPU is the real limit (flakes under load). A machine-wide slot pool lets
#   at most CI_SLOTS runs go at once (default 2 since 2026-11-01, when each run went to two smoke parts at a time; at 1, two at once flaked on boot timeouts, 2026-10-31); others wait their turn.
set -u
WT=${1:-$PWD}
SLOTS=${CI_SLOTS:-2}
TMPROOT=${TMPDIR:-/tmp}; TMPROOT=${TMPROOT%/}
POOL=${CI_SLOT_POOL:-/tmp/benchcard-ci-slots}
cd "$WT" || exit 2
mkdir -p "$POOL"

git fetch -q origin main || { echo "ci-local: git fetch failed"; exit 2; }
if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "ci-local: NOT UP TO DATE - $(git rev-parse --abbrev-ref HEAD) is missing origin/main $(git rev-parse --short origin/main). Rebase first."
  exit 3
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "ci-local: uncommitted changes - commit first so the run matches what CI will see."
  exit 3
fi

# Take a slot. A slot is a directory holding the owner's pid; a dead owner's slot is reclaimed.
SLOT=""
while [ -z "$SLOT" ]; do
  for i in $(seq 1 $SLOTS); do
    d=$POOL/$i
    if mkdir "$d" 2>/dev/null; then echo $$ > "$d/pid"; echo "$WT" > "$d/wt"; SLOT=$d; break; fi
    p=$(cat "$d/pid" 2>/dev/null)
    if [ -n "$p" ] && ! kill -0 "$p" 2>/dev/null; then rm -rf "$d"; fi
  done
  [ -z "$SLOT" ] && { echo "ci-local: all $SLOTS slots busy ($(cat $POOL/*/wt 2>/dev/null | xargs -n1 basename | tr '\n' ' ')); waiting..."; sleep 20; }
done
OUT=$(mktemp -d "$TMPROOT/benchcard-ci-XXXXXX")
mkdir -p "$OUT/parts"
SHA=$(git rev-parse --short HEAD)
# Run on a frozen copy of the commit, so an agent editing the worktree
# mid-run can't change what is being tested (2026-10-31: a doc-writer did).
git worktree add -q --detach "$OUT/tree" HEAD || exit 2
trap 'rm -rf "$SLOT"; git -C "$WT" worktree remove --force "$OUT/tree" 2>/dev/null' EXIT INT TERM
cd "$OUT/tree"
echo "ci-local: $(basename $WT) @ $SHA, slot $(basename $SLOT)/$SLOTS, logs in $OUT"
START=$SECONDS

typeset -A PIDS
run() { local name=$1; shift; ( local t=$SECONDS; "$@" > "$OUT/$name.log" 2>&1; local rc=$?; echo "$rc $((SECONDS-t))" > "$OUT/$name.rc" ) & PIDS[$name]=$!; }
# Two Chrome-heavy smoke parts at a time, not four. All seven jobs at once put
# a 10-core machine at load 15-22 and page loads timed out in tests no diff
# touched (2026-11-01: one lane needed five runs on the same sha).
run smoke-suite node scripts/smoke.mjs --shard suite --out "$OUT/parts/suite.json"
run smoke-1     node scripts/smoke.mjs --shard 1/3 --out "$OUT/parts/1-3.json"
run evals       node scripts/evals.mjs
run history     zsh -c 'node scripts/check-about-date.mjs origin/main; a=$?; node scripts/check-sitemap-lastmod.mjs origin/main; b=$?; node scripts/check-whats-new.mjs origin/main; c=$?; exit $((a||b||c))'
wait
run smoke-2     node scripts/smoke.mjs --shard 2/3 --out "$OUT/parts/2-3.json"
run smoke-3     node scripts/smoke.mjs --shard 3/3 --out "$OUT/parts/3-3.json"
wait
run redirects   node scripts/redirect-check.mjs
wait
run smoke-merge node scripts/smoke.mjs --merge "$OUT/parts"
wait

FAIL=0
for n in smoke-suite smoke-1 smoke-2 smoke-3 smoke-merge evals redirects history; do
  read rc secs < "$OUT/$n.rc"
  if [ "$rc" = 0 ]; then s=pass; else s=FAIL; FAIL=1; fi
  printf "  %-12s %-4s %4ss\n" $n $s $secs
done
echo "ci-local: $SHA $([ $FAIL = 0 ] && echo GREEN || echo RED) in $((SECONDS-START))s (logs $OUT)"
exit $FAIL
