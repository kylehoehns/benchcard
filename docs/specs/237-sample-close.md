# 237 — ✕ on an untouched sample closes

## Issue

#237. After "Try a sample team", ✕ on step 1 shows "Discard this team?"
instead of closing. The question lands at the bottom of the screen, far from
the ✕, so the ✕ looks dead.

## Goal

A coach who opened the sample just to look can leave it with one tap. Once
they have made the sample their own, by editing the name or any roster line,
the flow still asks before throwing that work away.

## What would settle it

At 390×844, on the welcome screen with no teams:

1. **Try a sample team**, then ✕ on step 1: the flow closes, `#frAsk` never
   shows, and the welcome screen is back. Nothing is stored:
   `state.onboarded === false`, and the stored record holds 0 players.
2. The same with **Escape** instead of ✕. Android back fires the same `cancel`
   event, so this covers it too.
3. **Set up my team**, then **Fill with a sample team** (`#frFill`), then ✕:
   the flow closes with no ask, the same as 1.
4. **Try a sample team**, edit the roster (for example, add a character to one
   line), then ✕: `#frAsk` shows "Discard this team?" with "Keep editing |
   Discard", and the flow stays open. This is today's behavior, kept.
5. **Try a sample team**, change only the team name, then ✕: the ask shows,
   as in 4.
6. Typed text with no sample involved (`backAndCancel`'s existing case) still
   asks. Unchanged.

"Untouched" means `fr.teamName === SAMPLE_TEAM_NAME` **and**
`fr.roster === fr.filled`. The same comparison `commitFirstRun` already uses
for A35 decision 1 decides whether a sample counts as the coach's.

## Surfaces

- `app/onboarding.js`: `askBeforeDiscardTeam` only.
- `scripts/smoke/first-run-flow.mjs`: `sampleFillsAndSavesNothing` flips its
  two "✕ over the sample shows the ask" checks to "closes with no ask", and
  gains items 2, 4 and 5.
- `sw.js` through `npm run sw:bump` (`onboarding.js` is precached).
- Must not change: `trap.js` (`guardClose`, `closeSheet`, `showAskRow`), the
  add-team mode (`#frFill` is hidden there, and `fillSample` never runs), the
  `?try=N` path (`loadSample`), and `commitFirstRun`'s analytics branch.

## Constraints

- Reuse `fr.filled` and `SAMPLE_TEAM_NAME` (`roster.js`). Do not re-derive
  "is this our sample" by regenerating `sampleRosterText`: `fr.filled` is
  already the record of exactly what was filled.
- The one guard `askBeforeDiscardTeam` covers ✕, Escape and Android back,
  because all three go through `closeSheet` → `guardClose`. Change the guard,
  not the three callers.
- Precache bump: `npm run sw:bump` after `onboarding.js` changes
  (`AGENTS.md` § Traps).

## Design

In `askBeforeDiscardTeam`, after the existing empty-draft early return, add a
second early return for an untouched sample, as defined above. That is one
condition, beside the existing empty check. It is based on name and roster
only, the same as the empty check, so a format change on step 2 over an
untouched sample also closes with no ask, just as it does over an empty
draft today.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `sampleFillsAndSavesNothing` | smoke row for the first-run flow (`scripts/smoke/first-run-flow.mjs`), real taps and keys over CDP | 1, 2, 3, 4, 5 |
| `backAndCancel` | same row, unchanged | 6 |

Red first: on main, 1 and 3 fail because the ask shows, and 2 fails because
Escape shows the ask. 4 and 5 are already green on main. That is expected,
since they pin today's behavior so the fix cannot over-reach. To show they can
fail, report the output of 4 and 5 with the new condition deliberately
widened to skip the ask whenever `fr.filled` is set.

## Out of scope

- Moving the ask row nearer the ✕. It stays where `#agAsk` puts it for the
  add-game flow.
- The iPhone toolbar question from the issue. There is no device here, and
  with this fix the untouched case no longer shows the ask at all.
