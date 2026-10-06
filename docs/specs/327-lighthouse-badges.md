# #327 — Lighthouse score badges in the README, refreshed weekly

## Issue

#327: show benchcard.app's four Lighthouse scores as README badges, kept
current by a weekly workflow instead of someone running Lighthouse by hand.

## Goal

A visitor to the repo sees the live site's mobile Performance, Accessibility,
Best Practices and SEO scores at the top of the README, and the numbers are
never more than a week old. Nobody has to remember to refresh them.

## What the survey found

On `main` (8096b1d):

- **Workflows.** `.github/workflows/` holds `test.yml` (the required checks),
  `vendor-drift.yml` and `bands.yml`. All use `actions/checkout@v7` and
  `actions/setup-node@v7` by tag (not by SHA), `runs-on: ubuntu-24.04`,
  top-level `permissions: contents: read`, and no `timeout-minutes`.
  Scheduled ones sit off the hour (`20 6 * * 1`, `40 7 * * 1`) and say why.
- **`test/ci-config.test.js`** reads only `test.yml` for its job-name and
  path-filter pins, plus `vendor-drift.yml` for its filter. A new workflow
  does not trip it, so nothing guards the new one yet.
- **The coverage badge** is a shields.io dynamic JSON badge on
  `raw.githubusercontent.com/kylehoehns/benchcard/main/scripts/coverage.json`,
  `query=$.lines`, `color=black`.
- **`test/no-dependencies.test.js` is not on `main`.** The issue names it as
  the guard that keeps `package.json` at zero dependencies. It exists only on
  the open PR #323 (`readme-badges`). This change adds nothing to
  `package.json` either way: Lighthouse runs through `npx -y lighthouse@12`,
  so the claim does not change what gets built. Noted, not escalated.
- **The 2026-10-06 baseline run** (Lighthouse 12.8.2, mobile, against
  `https://benchcard.app/`): categories `performance` 0.75,
  `accessibility` 0.96, `best-practices` 0.79, `seo` 1. Desktop: 0.99, 0.96,
  0.78, 1.
- **No coach sees this.** Nothing under `app/` changes, so there is no
  precache bump, no look check and no preview check.

## What would settle it

1. **`scripts/lighthouse-scores.mjs`** turns a Lighthouse JSON report into the
   scores file. Its pure export `scoresFrom(report)` returns exactly these
   keys: `url`, `formFactor`, `fetchTime`, `lighthouseVersion`,
   `performance`, `accessibility`, `bestPractices`, `seo`. Each score is
   `Math.round(score * 100)`, the rounding Lighthouse's own report uses:
   - the mobile baseline above gives `75, 96, 79, 100`;
   - the desktop baseline gives `99, 96, 78, 100`;
   - a category whose `score` is `null` (Lighthouse could not score it)
     throws, naming the category, so a broken run never writes a badge
     reading `null`;
   - a report missing one of the four categories throws, naming it.

   Run as `node scripts/lighthouse-scores.mjs <report.json>`, it prints the
   JSON (2-space indent, trailing newline) to stdout and exits 0; on a bad
   report it prints the error to stderr and exits 1.
2. **`.github/workflows/lighthouse.yml`**:
   - triggers: `schedule` (Mondays `50 7 * * 1`, off the hour like the
     others) and `workflow_dispatch`, and nothing else. No `push` or
     `pull_request`: it must never become, or look like, a required check;
   - top-level `permissions: contents: read`; the one job widens to
     `contents: write`, and nothing else is granted;
   - runs `npx -y lighthouse@12 https://benchcard.app` with mobile defaults,
     `--only-categories=performance,accessibility,best-practices,seo`,
     `--output=json`, and
     `--chrome-flags="--headless=new --window-size=412,915"` (without the
     window size a headless mobile run fails with `NO_FCP`);
   - pipes the report through `scripts/lighthouse-scores.mjs` into
     `lighthouse.json`;
   - commits that file to the `badges` branch and pushes with an explicit
     `HEAD:badges` refspec. The first checkout sets
     `persist-credentials: false`, so the token is only on the `badges`
     checkout. Nothing pushes to `main`;
   - one run at a time (`concurrency`), and `timeout-minutes: 15`.
3. **The `badges` branch** is an orphan branch holding only
   `lighthouse.json`. It is seeded once, before merge, from one local run of
   the same command and script, so the badges render on merge day.
4. **README** shows four shields.io dynamic JSON badges, beside the coverage
   badge, reading
   `https://raw.githubusercontent.com/kylehoehns/benchcard/badges/lighthouse.json`
   with queries `$.performance`, `$.accessibility`, `$.bestPractices` and
   `$.seo`, labels `performance`, `accessibility`, `best practices`, `seo`,
   and `color=black` to match the coverage badge. Each links to the
   workflow's runs page,
   `https://github.com/kylehoehns/benchcard/actions/workflows/lighthouse.yml`.
   No score appears in README text.
5. **Guards** in `test/ci-config.test.js`, built under `/new-guard`, each
   watched failing against a broken copy before it is trusted:
   - `lighthouse.yml`'s `on:` block has `schedule` and `workflow_dispatch` and
     no `push` or `pull_request`;
   - its top-level permissions are exactly `contents: read`, and
     `contents: write` appears only at job level;
   - every `git push` in its `run:` steps (reassembled with the file's
     existing `extractRunCommands`) pushes to `badges` and none names `main`;
     a workflow with no push at all fails, since then the guard measured
     nothing;
   - it runs Lighthouse through `npx -y lighthouse@` (no install step);
   - the README has one badge per score key `scoresFrom` emits, reading the
     `badges` branch URL above. Keys come from running `scoresFrom` on a
     fixture, not from a second hand-written list.

## Surfaces

- New: `scripts/lighthouse-scores.mjs`, `.github/workflows/lighthouse.yml`,
  `test/lighthouse-scores.test.js`, this spec.
- Changed: `test/ci-config.test.js` (new guards, nothing existing loosened),
  `README.md` (four badges), `docs/operations.md` (the workflow, next to the
  other non-required ones).
- Must not change: anything under `app/`, `package.json`, `test.yml`, and the
  `REQUIRED` list in `ci-config.test.js`.

## Constraints

- **Zero dependencies.** Lighthouse is fetched by `npx -y` at run time;
  `package.json` stays `{"type":"module"}` plus scripts.
- **One answer in one place.** The scores live only in `lighthouse.json` on
  the `badges` branch. The key names are written once, in
  `scoresFrom`; the README's queries are checked against it, not against a
  copy.
- **Match the existing workflows:** tag-pinned `@v7` actions, `ubuntu-24.04`,
  `node-version: '24'`, a header comment that says what the file is for and
  why it is shaped that way.
- **Never push to `main`.** The scheduled job holds write access, so the
  push target is spelled out and guarded.
- **Reuse** `extractRunCommands` in `ci-config.test.js` for reading `run:`
  steps; do not write a second YAML reader.
- **American spelling** (`test/spelling.test.js`).
- **No `app/` change**, so no `npm run sw:bump`.

## Design

`scripts/lighthouse-scores.mjs` exports `scoresFrom` and runs a small CLI
only when invoked directly (the `process.argv[1]` check `scripts/bands.mjs`
uses). The category ids map to the output keys in one table in that file.

The workflow checks out `main` read-only, runs Lighthouse, writes
`lighthouse.json`, checks out `badges` into `badges/` with the job's token,
copies the file in, commits as `github-actions[bot]`, and pushes
`HEAD:badges`. History on `badges` grows one commit a week, which doubles as
a score record.

## Proof

- **`node --test test/lighthouse-scores.test.js`**: `scoresFrom` on inline
  fixture reports (item 1's four cases, expected values from this spec), and
  the CLI's exit code and stdout on a fixture file and on a bad one.
- **`node --test test/ci-config.test.js`**: item 5's guards, each falsified
  once against a broken copy of the workflow or README.
- **One real run**, by the orchestrator: the workflow's Lighthouse command and
  script, run locally against `https://benchcard.app`, seed the `badges`
  branch (item 3). The first scheduled or dispatched run on GitHub happens
  after merge, by the owner.

## Out of scope

- Desktop scores, or both form factors. Mobile only.
- Score-based badge colors.
- Fixing anything the scores point at (#324, #325, #326 do that).
