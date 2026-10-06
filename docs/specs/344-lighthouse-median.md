# #344 — Lighthouse badge: publish the median of three runs

## Issue

#344: the performance badge jumps between runs of the same deploy (76, 67, 60
on 2026-10-06), so run Lighthouse three times and publish each category's
median.

## Goal

The README badges show what the site scores, not how busy the GitHub runner
was. Started in the small lane; the diff outgrew its 20-line limit (35 added
lines in the script and workflow), so it switched to the full lane here.

## What would settle it

1. Three reports with performance 0.60, 0.76, 0.67 give `performance: 67`.
2. The median is per category: when the middle performance and the middle
   accessibility come from different reports, both are still the middle
   value (taking "the whole middle run" fails this).
3. An even count (decided at build time; the ticket left it to the builder):
   the mean of the two middle rounded scores, rounded with `Math.round`.
   70 and 75 give 73.
4. One report: output byte-for-byte unchanged; every existing test in
   `test/lighthouse-scores.test.js` stays and passes unchanged.
5. A null or missing category score in any report, not just the first, makes
   `scoresFrom` throw naming the category, and the CLI exit 1 with nothing on
   stdout. No report path at all also exits 1.
6. `url`, `formFactor`, `lighthouseVersion` kept; `fetchTime` from the last
   report.
7. `lighthouse.yml` runs Lighthouse three times and passes all three reports
   to the script. `test/ci-config.test.js` still holds every #327 rule
   (schedule + `workflow_dispatch` only, top-level `contents: read`, write
   only on the job, push only `HEAD:badges`, `npx -y lighthouse@`, the four
   categories, no install), plus a new rule: the script gets exactly three
   `report-N.json` files.
8. After merge, a `workflow_dispatch` run publishes `lighthouse.json` to
   `badges` (the owner starts it; not provable from a branch).

## Surfaces

- Change: `scripts/lighthouse-scores.mjs`, `.github/workflows/lighthouse.yml`,
  `test/lighthouse-scores.test.js`, `test/ci-config.test.js`,
  `docs/operations.md` if it names a single run.
- Must not change: `app/` (so no `sw:bump`), `package.json`, `README.md`'s
  badge lines, the `badges` branch.

## Constraints

- Zero dependencies: Lighthouse only via `npx -y lighthouse@12`.
- Reuse `CATEGORIES` and the per-report validation and rounding; do not
  re-derive them.
- The workflow stays not-a-check; its guards stay green.

## Design

`scoresFrom` takes one report or an array. Each report goes through the old
per-report function, so every report is validated. The output takes the
metadata of the last report, and each category key is the median of the
rounded scores. The CLI reads every path argument. The workflow loops
`for i in 1 2 3` writing `report-$i.json`, then passes all three.

## Proof

- `node --test test/lighthouse-scores.test.js`: items 1-6 (the pure function
  and the CLI, spawned).
- `node --test test/ci-config.test.js`: item 7, a guard under `/new-guard`,
  with mutations (one report, four reports) it must catch.
- A local run: three `npx -y lighthouse@12` reports against
  https://benchcard.app fed to the script, output pasted in the PR.
- Item 8 is checked by the owner after merge.

## Out of scope

- Changing the schedule, the categories, the form factor or the badges.
- More than three runs, or dropping outliers.
