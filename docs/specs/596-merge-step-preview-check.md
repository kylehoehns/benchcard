# #596 — A build lane ends at an open PR; the merge step does the preview check

Light-review brief (tooling only; nothing a coach sees). The batch runs light
review: quality-reviewer and doc-writer only.

## Issue

#596. A lane waits for GitHub CI and the preview deploy, which often runs past
what the agent framework allows, and `merge-one.sh` waits for CI again anyway.
So a lane ends when the PR is open and local CI is green on the pushed commit,
and the merge step runs the preview check, posts it as a PR comment, and
refuses to merge when it fails.

## What the survey found

- **The skill's preview check has no page-picking code.** Step 12 finds the
  preview URL by grepping a `cloudflare-workers-and-pages` comment, then
  follows `/browser-verify` by hand for the spec's values; step 7 runs
  `scripts/look.mjs --view <the views the diff touches>`, the views chosen by
  judgement. So there is no logic to reuse, only a tool (`look.mjs`) and a
  judgement. This change writes the picker once, in
  `scripts/lanes/preview-check.mjs`, and the skill points at it instead of
  describing the judgement.
- **Cloudflare no longer comments the URL on PRs** (#605 has no such comment).
  The deploy shows up as the `Workers Builds: benchcard` check run on the
  head commit, whose output summary names a `Preview URL`
  (`https://<version>-benchcard.kyhoehns.workers.dev`, pinned to that build)
  and a `Preview Alias URL` (`https://<branch>-benchcard.kyhoehns.workers.dev`,
  which follows the branch).
- `look.mjs` measures clipping (its `findings`) but records no console errors,
  and it can shoot only the five app views, the clip-sweep states, `about`
  and `whats-new`.
- smoke's console-error filter (`isOurs` in `scripts/smoke.mjs`) treats any
  URL that is not `127.0.0.1`/`localhost` as third party, so against a preview
  it would call every error third party.
- `check-whats-new.mjs` already holds the list of `app/` paths no coach sees
  (`PLUMBING`, `coachFacing`).

## What would settle it

1. `merge-one.sh <N>`, once the five required checks are green and before
   `gh pr merge`, runs `node scripts/lanes/preview-check.mjs <N>`. When that
   exits non-zero, merge-one prints `#N preview check failed; not merged`,
   exits 4, and `gh pr merge` is never called. When it exits 0, the existing
   lines are unchanged: `merged #N as <sha7>`, then `main green + deployed at
   <sha7>` (exit 0) or `MAIN RED at <sha7>: ...` (exit 2). Exit 1 (PR red) and
   3 (behind main) are unchanged.
2. `preview-check.mjs <N>`:
   - uses `https://<branch>-benchcard.kyhoehns.workers.dev`, the branch
     lowercased with anything outside `[a-z0-9-]` turned into `-`
     (`lane-end-596` -> `https://lane-end-596-benchcard.kyhoehns.workers.dev`);
   - waits (polling, 20-minute cap) for `Workers Builds: benchcard` to succeed
     on the PR's head commit; a failed build, or the cap, fails the check;
   - then waits (5-minute cap) until the alias's `/sw.js` is byte-identical to
     the head build's own `Preview URL` `/sw.js`, so the alias serves the head
     commit. If the summary names no `Preview URL`, it says so and relies on
     the check run alone;
   - picks the pages from `git diff --name-only --no-renames
     origin/main...<head>` (pure function `viewsFor(paths)`):
     `app/about.html` -> `about`; `app/whats-new.html` -> `whats-new`; any
     other `app/<page>.html` except `index.html` and `404.html` -> that page;
     any other path `coachFacing` accepts (index.html, JS, CSS, images) -> the
     five app views (`today, games, team, season, settings`); plumbing,
     `404.html` and paths outside `app/` -> no view. `404.html` is listed as
     not checked;
   - when there are views, runs `look.mjs --url <alias> --widths 390 --height
     844 --font 16 --view <views>` through `ci-slot.sh` (the shared Chrome
     pool), and fails on any unexcused finding or any console error from the
     preview's own origin;
   - when there are none, checks only that the alias answers `/` with 200;
   - posts one PR comment either way: the URL, the head sha, the pages
     checked, the counts of shots, findings and console errors (each one
     listed when non-zero), and PASS or FAIL;
   - exits 0 on PASS, 1 on FAIL (comment posted first when it can be).
3. `look.mjs` records each shot's console errors in `measurements.json`
   (`consoleErrors`, our origin only; others in `thirdParty`), prints them,
   and can shoot static pages beyond `about` and `whats-new` (at least
   `advanced` and the chart pages). The console filter is one function shared
   with smoke, taking the origin, so smoke's behavior on `127.0.0.1` is
   unchanged.
4. The ship-feature skill and `lane-template.txt` describe the same order: a
   lane pushes, opens the PR with its full body, runs local CI green on the
   pushed commit, posts the wrap-up comment, and reports. It does not wait for
   GitHub CI or the preview. The merge step (`merge-one.sh`) waits for CI,
   runs the preview check, and merges. A run that may not merge can run
   `preview-check.mjs` alone to post the comment.

## Seams

- `node --test test/preview-check.test.js`: the pure parts of
  `preview-check.mjs` — the URL from a branch, `viewsFor`, the verdict from
  `measurements.json` records, the comment text, and reading the two URLs out
  of a check run's summary.
- `node --test test/lanes.test.js`: `merge-one.sh` run against a fixture (the
  same bare-origin fixture as `lane.sh`), with a fake `gh` on `PATH` that logs
  its calls and a stub `preview-check.mjs`. Preview fails -> exit 4, message,
  no `gh pr merge` in the log. Preview passes -> `gh pr merge` called and
  `merged #N as` printed. `merge-one.sh` moves from zsh to bash so CI's Ubuntu
  can run it.
- `node --test test/look.test.js`: the new view names in `parseArgs`, and the
  shared console filter (pure).

## Choices the issue left open

- **Which pages.** The issue says "the pages the PR changed". A change to the
  app shell's code can show on any screen, so it maps to the five app views
  `look.mjs` shoots by default rather than to a guess.
- **Which team.** The issue says "the sample team". `look.mjs` loads the rich
  fixture with the long names (`LONG_AND_SQUEEZE`), which is stricter for
  clipping, and the lane rules ask for long names. Kept that.
- **The URL** comes from the branch name, as the lane asked, checked against
  the head build's pinned preview so "matches the PR head" is measured, not
  assumed.
- **The URL, when the build names one.** The build's own alias when the check
  run names one (Cloudflare may shorten a long branch's), else the
  branch-derived URL. The PR comment names the URL actually checked.
- **Exit code 4** for a failed preview check, so the existing 1/2/3 keep their
  meaning.

## Out of scope

Running a lane end to end. Changing what local CI runs. Dark mode or 32px text
on the preview (smoke and the lane's own look checks cover those).
