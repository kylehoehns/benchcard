# #383 — Mark a late arrival Here now from bench mode

## Issue

#383. A kid who walks in late cannot be marked as here from bench mode; the
coach has to leave bench mode, open Who's here, tick the kid and come back.

## Goal

In bench mode, a coach sees who is not here yet, taps **Here now** beside the
kid who just walked in, and the plan picks them up from the next stint. The
stint on the floor right now does not change. One Undo takes it back.

## Decisions

The ticket is `ready-for-agent`. The survey held up its claims:

- Bench mode lists only available players: `bench` is
  `availIds(g).filter(...)` in `renderGameMode` (`app/gamemode.js`).
- `setAvailable` is called only from `game-setup.js` (Who's here) and
  `teams-view.js`.
- `setAvailable` records `live.arrived[id] = at` for a kid who was out
  (`state.js`), and `resolveRest` reads it through `lateArrivals`.
- Marking a kid here mid-game on Who's here re-plans through `render()` →
  `computeAll()` → `syncOverrides` → `freezePlayedAndReplan`, which freezes
  stints `0..at` (the arriving kid was not on stint `at`'s floor, so `through`
  is `at + 1`) and re-solves from `at + 1` with `resolveRest`. So "the current
  stint's floor does not change" is what that path already does.
- **Falsified during the build:** that freeze holds only once a full
  `render()` has adopted the plan's stamp. Stepping stints inside bench mode
  never renders, so `live.stamp` can still be `''`, and `syncOverrides` then
  takes its "first sight: adopt it" branch and re-plans stint 3 too. Leaving
  bench mode for Who's here runs that full render first, so Here now calls
  `computeAll()` (no logic change in `state.js`) before `setAvailable`, inside
  the same `undoable`. Without it, items 1 and 3 below fail.
- #376 (PR #389) only changed `resolveRest` for a sit (`sitIds` non-empty).
  An arrival passes no `sitIds`, so it is untouched by that change.

Questions the ticket leaves open, decided here as closest to its intent:

- **Toast punctuation.** `{Name} is here.`, with the period every other
  bench-mode toast carries.
- **Which name the toast uses.** The other bench-mode toasts use the call name
  (`callNames`, first name where it is unique). Here now does the same, with
  the arriving player included in the set the call names are made from. With
  RICH's names that is the first name.
- **Accessible name of the button.** Every row has a button reading **Here
  now**, so each one's accessible name is `Here now, {full name}` (visible
  label first, WCAG 2.5.3). The visible text stays **Here now**.
- **"9 players with 1 marked out".** Read as nine players here and a tenth
  marked out: RICH's roster trimmed to ten (`p0`..`p9`), with `p9` out.
- **Focus after the tap** (no ticket rule): on the next **Here now** button
  if one is left, otherwise the first floor row (`gmFocusFirstFloor`). On
  Undo, the restored player's **Here now** button.
- **A pick in progress.** Here now clears it, like every other bench-mode edit.
- **The Not here group is shown on every stint**, including the last. Marking
  a kid here there records the arrival and changes no stint, which is exactly
  what Who's here does at that point.

## What would settle it

1. Coach scenario: ten-player roster, one (`p9`) marked out, Hawks game, bench
   mode at stint 3 of 8. A **Not here** group lists that player, with a
   **Here now** button at least 48px tall. Tap it. The toast reads
   **{Call name} is here.** Stint 3's floor is unchanged. The player is on the
   floor in at least one stint from 4 on, and the Not here group is gone.
2. Undo from that toast: the player is back under **Not here**, and the floors
   for stints 3..8 match those before the tap.
3. The floors for stints 3..8 after Here now equal the floors after leaving
   bench mode at stint 3, marking the same player here on **Who's here**, and
   coming back (same plan, same seed: neither path touches `g.seed`).
4. Nobody out: no **Not here** group (not in the accessibility tree, `hidden`).
5. Look check at 320 and 390 wide, 16 and 32px text, with long names (the
   `LONG_AND_SQUEEZE` record, a long-named player marked out), each state
   scrolled to the bottom and full height: nothing clipped, no cramped wrap,
   the Not here group scrolls into view above the pinned footer. The smoke
   32px-at-320 pass measures the new state at zero.
6. `npm test` and `npm run smoke` pass.

## Surfaces

Changes: `app/gamemode.js` (render the group, the Here now handler),
`app/index.html` (a static `#gmOutSec` section under `#gmBenchSec`),
`app/app.css` (the row's layout, if the bench row's styles do not cover it),
`app/sw.js` (`npm run sw:bump`), `test/coach.js` (a verb only if one is
missing, plus the ten-player game-day record), a Coach scenario in
`test/game-day-scenarios.test.js`, and a new `APP_LARGE_TEXT_STATES` entry in
`scripts/smoke/app-large-text.mjs` (bench mode with a player out), plus
`scripts/smoke/README.md` if the index needs it.

Must not change: `app/state.js` logic (`setAvailable`, `resolveRest`,
`freezePlayedAndReplan`), `app/engine.js`, the four pure modules, Who's here's
own behavior.

## Constraints

- **Reuse `setAvailable(g, id, true)`.** Do not edit `g.out` or
  `live.arrived` by hand, and do not call `resolveRest` from the handler. The
  re-plan is the one `render()` already runs (`computeAll` →
  `freezePlayedAndReplan`), so Here now and Who's here cannot disagree.
- **One `undoable`** (the bench-mode `undoable` handed in through
  `initGameMode`): `mutate` calls `setAvailable` and clears the pick; the
  refresh repaints with the injected `render(...)` (the same keys Who's here's
  `availability` edit repaints: `'strategy'` plus `PLAN_ONLY` from `edit.js`)
  and then `renderGameMode()`. The `undoable` suppresses #134's rotation toast,
  so the coach sees one toast with one Undo (P6, C9).
- **Toast copy is `{Name} is here.`** The trailing period matches every
  other bench-mode toast ("Marked Hawks finished.", "Ana sits for the rest.
  ..."); the ticket's own sentence ends there too.
- The group is a static `<div class="gm-sec" id="gmOutSec" hidden>` with an
  `<h3 class="gm-lab">Not here</h3>` heading (W1 sentence case) and a list,
  shown only when `g.out` names a player on the roster. Hidden when nobody is
  out.
- Each row: avatar and full name (as bench rows draw them) plus a `.btn`
  **Here now** button, at least 48px tall and wide (I1), pressed state via the
  shared `press` class (I4). The group lives in `.gm-body`, the scroller above
  the pinned `.gm-foot` (I2, C10).
- Long names wrap at word boundaries and never clip; the button never shrinks
  below 48px or leaves the row. At 320px/32px the row may stack the button
  under the name.
- Precache: `app/gamemode.js`, `app/index.html` and `app/app.css` are
  precached: run `npm run sw:bump`.
- American spelling. No privacy-claim wording.
- #388 (Next change box splitting a long name mid-word) is a known separate
  bug: do not fix it here.

## Design

`index.html`: after `#gmBenchSec`, add `#gmOutSec` with the heading and an
empty `#gmOut` list.

`renderGameMode`: `const out = g.out.filter(id => byId(id))`;
`set('#gmOutSec', 'hidden', !out.length)`; rebuild `#gmOut` with one row per
out player in roster order. The row is a plain container (not a button) with
the avatar, the name and a `button.press.btn` reading **Here now**, its
`aria-label` `Here now, {name}`, `onclick = () => hereNow(g, id, callName)`.

`hereNow`: `tick()`, then
`undoable(\`${name} is here.\`, () => { setAvailable(g, id, true); gmPick = null; },
(undoing) => { render(<availability keys>); renderGameMode(); focus as decided })`.

## Proof

- **Coach seam** (`test/game-day-scenarios.test.js`, driven through
  `test/coach.js`): items 1, 2, 3 and 4, each a scenario that started red.
  The 48px height in item 1 may be read through an existing driver read or a
  small new one in `coach.js`; it reads what is on screen.
- **Smoke** (`scripts/smoke/app-large-text.mjs`): a new state "bench mode,
  not here" — bench mode with a long-named player marked out — measured by the
  32px-at-320 pass and the clip sweep, at zero. Item 5's smoke half. It must be
  shown to go red (e.g. against a deliberately clipping style) under
  `/new-guard`.
- **`/browser-verify` and `scripts/look.mjs`** at 320/390 × 16/32: item 5's
  pictures, with `-bottom` shots.

## Out of scope

- #388, the Next change box mid-word split.
- Marking a player out from bench mode (the other direction).
- Any change to how a late arrival's minutes are computed (#247's maths).
