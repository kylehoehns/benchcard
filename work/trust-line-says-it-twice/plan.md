# Plan: standardise the privacy claim

**Stage 3.** Written in plan mode from `intent.md` and `spec.md`, interrogated,
and committed before implementation. **Revised at the start of implementation**,
in its own commit, before any code changed.

## What the revision changed, and why

**A fifth surface the ticket never listed: `app/advanced.html:660`.** It carries
the long form in the same bold-line-plus-paragraph shape as `about.html`. The
Risks section below predicted exactly this — "the ticket lists only HTML, and
that list has been wrong before" — and it was right. `advanced.html` is
precached, so it was always going to force the shell bump regardless.

**A failing guard comes first.** The original plan went straight to editing
`scripts/charts.mjs`. The process this repo follows says a fix starts with a
test that fails today and passes after, and that is the right call here for a
reason beyond process: what makes this bug possible is that **nothing asserts
one form of the claim exists.** Fix the strings alone and the sixth surface
someone adds next month says it the other way again. The guard is the durable
half of the change; the string edits are the perishable half.

## Files that change

| File | Change |
| --- | --- |
| `scripts/charts.mjs` | the trust-line literal the six pages are built from |
| `app/index.html` | the welcome foot and the help lede |
| `app/about.html` | line 1027, the bold line only |
| `app/sw.js` | `VERSION` bump, `SHELL` to the digest `npm test` names |
| six generated chart pages | regenerated, never hand-edited |

## Order of work

0. **The guard, first and failing.** Assert that exactly one form of the claim
   exists across every surface under `app/`. Commit it red. It belongs beside
   `test/analytics.test.js`'s phrasing list rather than in it: that file bans
   four absolutes, this one pins one wording, and the two answer different
   questions about the same sentence.
1. `scripts/charts.mjs` first, and regenerate. Doing the generator first means
   the hand-edited files and the generated ones are never briefly inconsistent
   in a way a reviewer has to hold in their head.
2. `app/index.html`, then `app/about.html`.
3. `npm test` — read the SHELL digest out of the failure.
4. `app/sw.js`: bump `VERSION`, set `SHELL`, same edit.
5. `npm test` and `npm run smoke`.
6. Read `document.body.innerText` on index and one chart page.

## Risks

- **Regenerating charts touches more than the trust line.** If `charts.mjs` has
  drifted from its committed output for any other reason, step 1 produces a
  diff wider than this change. Check `npm run charts` is a no-op *before*
  editing, so the diff afterwards is attributable.
- **`test/analytics.test.js` scans string literals in every `app/*.js`.** If
  the claim also lives in a module, this plan's file list is incomplete. Grep
  the modules before starting; the ticket lists only HTML, and that list has
  been wrong before — the guard read only markup until it was widened.
- **The precache bump is the step most often forgotten.** `after-edit.sh`
  reminds, but it does not fire on shell-driven edits — a known hole.

## Proof

- `npm test` green, `test/analytics.test.js` included.
- `npm run smoke` 19/19.
- `npm run charts` produces no diff after the change.
- One count, from `document.body.innerText` across index, about and one chart
  page: the new sentence present, the old form absent.

## Departures from this plan

None yet. If implementation departs, this file is updated in the same commit —
a plan that quietly stopped matching the diff is the drift this whole chain
exists to make visible.
