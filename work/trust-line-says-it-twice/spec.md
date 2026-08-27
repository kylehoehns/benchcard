# Spec: standardise the privacy claim on one sentence

**Stage 2.** Requirements and design, written from `intent.md`. Reviewed
against the constraints there before any code was planned.

## Requirement

Every surface that states the privacy claim states it as:

> Your roster never leaves your device.

No surface states any other form of the claim.

## Design

A **delete, not a rewrite.** The target sentence already exists in three
places; the work is removing "and your players" from the longer form and
regenerating what is generated.

### Surfaces and how each is changed

| Surface | Change |
| --- | --- |
| `app/index.html:735, 1280` | edit in place |
| `app/about.html:1027` | edit the bold line only; the paragraph under it stays |
| six `app/*-player-basketball-rotation-chart.html` | **not edited** — change `scripts/charts.mjs` and regenerate |
| `app/index.html:254, 294, 1427` | already correct; verify untouched |

### Policy constraints applied

- **Narrowness is a hard requirement, not a preference.** The banned absolutes
  stay banned; `test/analytics.test.js` is the enforcement and its phrasing
  list does not change.
- **Generated files have one editor.** `guard-edit.sh` denies hand edits to the
  chart pages, so the generator is the only route by construction.
- **Precache.** `index.html` and `about.html` are precached, so `VERSION` and
  `SHELL` move in the same edit.

## Acceptance

1. Exactly one form of the claim exists anywhere under `app/`.
2. `npm test` green, including `test/analytics.test.js`.
3. `npm run charts` produces no diff after the change lands.
4. A reader sees the new sentence — proved from `document.body.innerText`, not
   from a grep.

## Flagged for policy owner

The claim is a legal-adjacent statement about data handling. It was reviewed
against what the app actually does: analytics loads a third-party script and
counts anonymous page views and feature usage. The narrow claim remains true
under that behaviour; any widening would not.
