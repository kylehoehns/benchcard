# Reviewing a change to Benchcard

The review policy, so that every change gets the same passes and severity means
the same thing twice running. `AGENTS.md` is the harness and says *why* each
rule below exists; this file says only what a review does with it.

Read by `/code-review`, and ready for `claude-code-action` if work ever moves
onto pull requests. It does not today: 382 commits, no PRs, and no branch
protection by an explicit decision recorded in `.github/workflows/test.yml`.

## Passes, in order

1. **Correctness**, weighted toward `engine.js`, `budget.js`, `storage.js` and
   `roster.js`. They are pure and heavily tested; a behaviour change in them
   that the task did not ask for is the highest-value finding in the repo.
2. **The card.** 3.45 × 5in, legible at arm's length. It is the product.
3. **Mobile first.** 390×844 before anything else.
4. **The privacy claim**, which is narrow on purpose and must stay narrow.
5. **Guards.** Anything under `test/` or `scripts/` that judges the tree gets
   asked whether it can fail.
6. **Evidence.** Not "is this right" but "what would show it was wrong".

## Severity

**Blocker — do not merge, no exceptions and no follow-up ticket:**

- The card is no longer 3.45 × 5in, or has lost legibility at arm's length.
- A number raised in `LARGE_TEXT_ALLOW` or `APP_LARGE_TEXT_ALLOW` to clear a
  new failure, or either replaced with a blanket tolerance. A blanket is what
  let a 228px sideways pan ship and live for months.
- The `requests` pin in `scripts/budgets.json` re-recorded, or the file
  re-recorded wholesale.
- The privacy claim widened past "your roster and your players never leave your
  device" — "nothing is uploaded" is false while analytics loads a script.
- A generated file edited by hand: `app/vendor/**`, or any of the six
  `app/*-player-basketball-rotation-chart.html`.
- A guard added or changed that has not been shown to go red.
- A precached file changed without `VERSION` and `SHELL` moving in the same
  edit.

**Important — fix before merge:**

- A real defect in the four pure modules, or a behaviour change in them the
  task did not ask for.
- `left`, `top`, `width` or `height` animated on a hot path.
- A rule proved only by `css.includes`, or copy proved only by a grep. Neither
  proves a reader sees anything.
- A touch target under 44px between 320 and 390px, or the last control in an
  open dialog off screen.
- A control without an accessible name, a duplicate id, an aria reference that
  does not resolve.
- A claim in a comment or commit message that the tree cannot support —
  especially a device measurement no machine here could have taken.

**Nit — at most three per review, and none if there is an Important open:**

Byte and node counts inside their ceilings (they are regression alarms, not
constraints, and the shell is precached). Comment wording. Naming. Anything
that would read as tidying.

## Excluded from review

- `app/vendor/**` — review the pin in `app/vendor/fetch.sh` instead; a CI job
  diffs the output byte for byte.
- `app/*-player-basketball-rotation-chart.html` — review `scripts/charts.mjs`.
- `scripts/budgets.json` — review the ceiling in `scripts/budgets.mjs`.
- `notes/**` — not shipped bytes, and CI skips notes-only commits deliberately.

## The evidence standard

`AGENTS.md` § Judgement owns this and a review does not restate it — it applies
it. The four "is not proof" clauses are the ones that decide most findings
here, and "scan whole files" is the one most often skipped under time pressure.

Two things a review adds on top of it:

- **State what you actually ran.** "Verified on an iPhone" is a claim no
  session on this machine can make; `/browser-verify` says why.
- **A suspiciously perfect result makes the check the finding.** If the change
  under review is itself a guard, review it against `/new-guard` rather than
  against your reading of it.
