# Intent: the trust line says the same thing twice

**Stage 1.** Written before any design or implementation work. Approved by the
product owner by being committed here.

## Problem

The privacy line reads "Your roster and your players never leave your device."
A roster *is* the players, so it names one noun twice.

Underneath that, a second and larger problem: the app carries **two** forms of
the claim and nobody ever chose between them.

    "Your roster and your players never leave your device."
      index.html:735 (welcome foot), index.html:1280, about.html:1027,
      and the trust line on all six roster-size chart pages

    "Your roster never leaves your device."
      index.html:254 (meta description), index.html:294 (JSON-LD),
      index.html:1427

## Proposed outcome

One sentence, in one form, everywhere it appears. The second form wins: it is
shorter, it is already in use, and it is not redundant. Standardising on it is
a delete, not a rewrite.

## Affected users and systems

- Every visitor — this is the app's central trust claim.
- `app/index.html`, `app/about.html`.
- `scripts/charts.mjs`, which **generates** the six roster-size pages. Editing
  their HTML by hand would be undone by the next `npm run charts`, and a hook
  now denies that edit outright.
- `test/analytics.test.js`, which bans four absolute phrasings across every
  HTML file and every string literal in every `app/*.js`.

## Constraints

- **The claim must stay narrow.** It says roster and players on purpose. It may
  never widen to "nothing is uploaded" or "nothing leaves your device": the
  site counts anonymous page views and feature usage, so either sentence would
  be false. This is not a style preference; it is the difference between a true
  statement and a false one.
- `about.html:1027` already spells out the honest long form in the paragraph
  under the bold line. That paragraph is not redundant and does not change.
- Whatever wording wins must be **identical everywhere**.

## Open questions

None blocking. The wording is chosen; the work is mechanical.

## What would settle it

One sentence, in one form, in every place it appears, still narrow, and
`scripts/charts.mjs` emits that same form.
