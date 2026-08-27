# Plan: standardise the privacy claim

**Stage 3.** Written in plan mode from `intent.md` and `spec.md`, interrogated,
and committed before implementation. **Not yet implemented** — this is a plan
awaiting execution, and saying so is the point: an unexecuted plan that reads
as done is worse than no plan.

## Files that change

| File | Change |
| --- | --- |
| `scripts/charts.mjs` | the trust-line literal the six pages are built from |
| `app/index.html` | lines 735, 1280 |
| `app/about.html` | line 1027, the bold line only |
| `app/sw.js` | `VERSION` bump, `SHELL` to the digest `npm test` names |
| six generated chart pages | regenerated, never hand-edited |

## Order of work

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
