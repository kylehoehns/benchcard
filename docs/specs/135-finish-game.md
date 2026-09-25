# #135 — A game is finished when the coach taps "Finish game"

> **This spec supersedes one rule in `docs/specs/123-live-module.md`.** That
> spec (line 41, and item 9 at line 137) kept "the last stint is finished":
> `stage()` returned `'finished'` for `at >= stints.length - 1`. The owner
> decided on 2026-09-25 to drop that rule. `docs/specs/123-live-module.md` is
> the record of what #123 asked for at its commit. It is historical: **do not
> edit it.** This file is the rule from here on.

> **Decided by the owner on 2026-09-25.** Each question took the default this
> spec was written to:
>
> 1. **The last stint of a reopened finished game** shows the plain disabled
>    Next chevron, as before this ticket. There is no second "Finish game".
>    Pinned by item 10.
> 2. **No way to un-finish a game after its Undo is gone**, in this ticket.
>    Undo (C9) is the way back. Pinned by item 10.
> 3. **The "Good game, coach." tip and the install prompt wait for the Undo.**
>    On the close that Finish game makes, they wait until the Undo toast has
>    left (after `UNDO_MS`, or when it is dismissed), then run their own
>    checks as now. Pinned by item 7.
> 4. **The Finished dot is the neutral `--info` token**, and K3 gains
>    "Finished is neutral". Pinned by items 5 and 6.

## Issue

#135, under #153. If a coach steps through bench mode to the last stint and
closes it, the game goes back to "Planned". The Resume bar disappears, and
"Start game" opens at stint 1 again. But the last stint (for example Q4
2:00–0:00) has not been played yet. This comes from `stage()` in
`app/live.js:18`, which treats the last stint as finished.

The owner decided on 2026-09-25: **option 1, finished means the coach said
so.** Reaching the last stint keeps the game underway. The last stint shows
"Finish game" in place of Next, with Undo. A finished game gets its own status
word on Today, "Finished", with a status color from K3.

The owner also decided that #135 lands **before** #133. #133 skips games that
were "never started" when a day files. It needs a "started" signal that holds
when a played game is opened again. This ticket provides that signal.

## Goal

A game is finished only when the coach taps "Finish game" on its last stint.
Until then, a game past stint 1 is Underway, wherever the coach left it,
including on the last stint. A finished game says "Finished" on Today and on
the game screen, and it stays finished if bench mode is opened again. Old
saved records load with nothing lost.

## Decisions

- **Finished is a saved fact: `live.finished === true`.** Today "finished" is
  worked out from `live.at`, and `openGameMode` resets `live.at` to 0 for a
  finished game (`gamemode.js:129`, via `openAt`). So a fully played game,
  reopened and closed without a tap on Next, reads as never started. That is
  the gap #133's draft spec raises in its open question (case 2). A flag that
  nothing clears except Undo closes that gap:
  - Only Finish game sets it. Nothing in the app clears it. An Undo snapshot
    restores the value from before, the same as for any other field.
  - Opening, stepping, swaps, rebalances and "Back to the printed plan" do not
    touch it.
- **`stage(p, live)` reads the flag first, then `at`.**
  - `null` when the plan is missing or did not solve (unchanged).
  - `'finished'` when `live.finished === true`, whatever `at` is.
  - `'not-started'` when `at <= 0`.
  - `'part-played'` otherwise. This now includes the last stint, and an `at`
    past the end of a plan that got shorter.
  - Every other export keeps building on `stage`. `resumeAt`, `passStatus`,
    `openAt` and `resumeBarAt` get their new answers from it, not from a new
    check of their own.
- **`resumeAt` clamps.** It indexes `p.stints[live.at]`. Before, an `at` past
  the end was "finished", so `resumeAt` never saw one. Now it is part-played.
  So `resumeAt` reads the row at `stintIndex(p, live)` and returns that index
  as `at`. Without this, a plan made shorter mid-game would crash Today.
- **A one-stint plan is not finished at stint 0 any more.** It is
  not-started until the coach taps Finish game, which shows at once because
  stint 0 is its last stint. This changes a claim in #133's draft spec ("a
  one-stint plan counts as started"). #133's spec must be updated to match.
- **The status word is "Finished", with class `done`.** `passStatus` returns
  `{ word: 'Finished', cls: 'done' }` for a finished game. `.pass-status` is
  the only place it is drawn: Today's pass and the game screen's `#gameSub`.
  The pass's accessible name ends ", finished", from the same lower-casing
  `renderPass` does now. `done` is the name `.gm-dot.done` already uses for
  "completed". The dot is `--info` (decision 4).
- **"Finish game" is its own button, `#gmFinish`, in bench mode's footer.**
  - It sits where `#gmNext2` (the Next chevron) is. It shows only on the last
    stint of a game that is not finished. On that stint, `#gmNext2` is hidden
    and stays `disabled`, as it is today. The swipe's edge check
    (`gamemode.js:565`) and the ArrowRight shortcut (`shortcuts.js:150`) read
    `#gmNext2`, so neither of them can finish a game. Finishing is always a
    tap on a labeled button (I3).
  - A separate button, not a relabeled chevron: `#gmNext2` is an icon button
    named "Next stint". Swapping its label, icon, name and action on one
    stint makes one control do two things.
  - It has the `.gm-nav.next` look (the team fill, K1), is at least 48px tall
    (I1), and reads "Finish game" in sentence case (W1, W2).
- **Tapping Finish game closes bench mode, marks the game finished, and
  offers Undo.**
  - It closes the way ✕ and Done close (`closeGameMode`), back to the screen
    bench mode was opened from.
  - The write is one `undoable` (`toast.js:74`). The mutation sets
    `live.finished = true` and nothing else. `live.at` stays on the last
    stint.
  - The toast reads "Marked `<gameLabel>` finished.", for example "Marked
    Hawks finished." or "Marked Game 2 finished." (`gameLabel`,
    `state.js:526`). It sits in `#toasts` above the action bar (C9), not
    inside the closed bench mode.
  - Undo restores the snapshot: the game is Underway on its last stint, the
    Resume bar is back, and bench mode stays closed.
- **"Reached the end" becomes "tapped Finish game".** `closeGameMode`
  measures `stage(p, live) === 'finished'` today to decide whether to tip
  after a game (`gamemode.js:261`). With a flag that survives reopening, that
  would tip again every time a finished game is opened and closed. So the
  close that Finish game makes passes `true` to `onClose`, and ✕ and Done
  pass `false`. `closeGameMode` no longer asks `stage`.
- **Reopening a finished game** (settled by the ticket):
  - "Start game" is the label. `resumeAt` is null for a finished game, so
    `labelBench` (`card.js:25`) already says so.
  - It opens at stint 1. `openAt` returns 0 for `'finished'`, as now, and
    `openGameMode` still writes that into `live.at` and saves.
  - The game stays finished. Stepping to stint 5 and closing leaves Today
    reading "Finished", with no Resume bar. For #133 it reads as started.
- **No Resume bar for a finished game.** `resumeBarAt` is built on
  `resumeAt`, which answers only for `'part-played'`. N7 is about a game in
  progress, and a finished game is not.
- **Old records load unchanged, with no version bump.** `sanitizeGames`
  (`storage.js:490`) rebuilds `live` as `{ at, overrides }` and drops any
  other key. So `finished` must be added there, or it is lost on the next
  load. It keeps `finished: true` only when the saved value is exactly `true`,
  and writes no key otherwise. A record without it loads byte-for-byte as
  now (`test/storage.test.js:247` deep-equals `{ at: 0, overrides: {} }` and
  keeps passing). Absent means "not finished". That is the same "absent is
  off" pattern `useSeasonTargets` uses. `storage.js` is on AGENTS.md's "leave
  alone" list. This one key is the change this ticket needs from it, and
  nothing else in it moves.
- **An old record whose game sits on its last stint now reads Underway.**
  Before this change, a game coached out and then reopened was reset to stint
  0 on open. So a saved game on its last stint is one the coach closed there
  without reopening. Under the new rule that is exactly the case the ticket
  says must stay Underway. No migration tries to guess otherwise.
- **The glossary changes.** `CONTEXT.md`'s **Part-played game** becomes "a
  game that bench mode has moved past its first stint and that the coach has
  not finished". A new **Finished game** entry: "a game the coach marked
  finished with Finish game on its last stint", in code
  `live.finished`, `live.js` (`stage`). **Filed game**'s "Avoid: finished"
  stays, and gains a clause: a filed game is not called finished, because
  "finished" now means the bench-mode fact. This goes to the doc-writer.

## What would settle it

The fixture is `RICH` (`scripts/smoke/fixtures.mjs`) at 390×844 unless an
item says otherwise. Game 0 is Hawks. "Last stint" means index
`p.stints.length - 1`, read from the page's own plan.

1. **Closing on the last stint keeps the game Underway.** Open Hawks in
   bench mode, step with `#gmNext2` until `#gmGame` reads "stint N of N",
   then tap `#gmClose`. Today's Hawks pass reads **Underway** with class
   `now`. `#resumeBar` is showing, with the label
   "Hawks · `<where of the last stint>` · Resume". `#gmOpen` / `#abBench`
   reads "Resume · `<where>`". `live.at` is the last index and
   `live.finished` is absent.
2. **Resume opens on the last stint.** From item 1, tap `#resumeBtn`.
   `#gmGame` reads "stint N of N", and `#gmFinish` is showing.
3. **The Finish game button.** On the last stint of a game that is not
   finished, `#gmFinish` is visible, its text is exactly "Finish game", and
   its box is at least 48px tall. `#gmNext2` is `hidden` and `disabled`. On
   every earlier stint `#gmFinish` is hidden and `#gmNext2` shows as now. A
   left swipe and ArrowRight on the last stint change nothing: bench mode
   stays open, and `live.finished` stays absent.
4. **Finish game.** From item 2, tap `#gmFinish`. Bench mode closes
   (`#gamemode` hidden, `benchOpen()` false). The Hawks pass reads
   **Finished** with class `done`, and its `aria-label` ends ", finished".
   `#resumeBar` is hidden. `#gmOpen` reads "Start game". Opening Hawks'
   game screen, `#gameSub` includes "Finished". The saved record has
   `live.finished === true` and `live.at` on the last index.
5. **The dot is `--info`.** The Finished pass's `.pass-status::before`
   background equals `--info` read through a probe
   (`PASS_STATUS_DOT_PROBE` / `CSS_VAR_COLOR_PROBE`, `scripts/smoke/dom.mjs`),
   in light and in dark. Text stays `--muted`, as for every status (K3's
   comment, `app.css:509`).
6. **Contrast.** `--info` is added to `CONTROL_TOKENS` in
   `test/contrast.test.js`, so the dot must clear 3:1 (4.5:1 with more
   contrast) against every ground in all four themes. Measured now:
   `#6C6C72` on `--surface` `#FFFFFF` is 5.22:1, on `--surface-2` 4.83:1, on
   `--bg` 4.75:1; dark `#98989F` on `#1C1C1E` is 5.94:1, on `#242426`
   5.41:1, on `#0B0B0C` 6.86:1. More contrast: 8.14:1 light, 8.99:1 dark on
   `--surface`. `--info` already clears the 4.5:1 text floor in that test.
   No token value changes.
7. **Undo.** After item 4, the toast reads exactly "Marked Hawks
   finished." with an Undo button. It is fully on screen and above
   `#actionbar` when that bar shows. It is still there 2 seconds later, whatever the tip and
   install counters say (decision 3). Tap Undo: the pass reads
   **Underway**, `#resumeBar` shows the last stint again, `live.finished` is
   absent, and bench mode stays closed. An unnamed game's toast reads
   "Marked Game `<n>` finished."
8. **`live.js`, at the unit level** (`test/live.test.js`, 4-stint plan):
   - `stage` at `{ at: 3 }` is `'part-played'`; at `{ at: 7 }` is
     `'part-played'`; at `{ at: 0, finished: true }`, `{ at: 2, finished:
     true }` and `{ at: 3, finished: true }` is `'finished'`; at `{ at: 0 }`
     is `'not-started'`.
   - 1-stint plan: `{ at: 0 }` is `'not-started'`, and
     `{ at: 0, finished: true }` is `'finished'`.
   - `resumeAt(plan(4), { at: 3 })` is `{ at: 3, where: 'Q1 3:00' }`.
     `resumeAt(plan(4), { at: 7 })` is `{ at: 3, where: 'Q1 3:00' }`.
     `resumeAt` of any finished `live` is `null`.
   - `passStatus` at `{ at: 3 }` is `{ word: 'Underway', cls: 'now' }`, and
     at `{ at: 0, finished: true }` is `{ word: 'Finished', cls: 'done' }`.
     A blocked or missing plan with `finished: true` is still Needs a fix.
   - `openAt(plan(4), { at: 3 })` is 3. `openAt(plan(4), { at: 2, finished:
     true })` is 0. `openAt(plan(4), { at: 7 })` is 3.
   - `resumeBarAt` skips a finished game and picks a game on its last stint.
9. **Reopening a finished game.** After item 4, tap `#gmOpen`. `#gmGame`
   reads "stint 1 of N". Step to stint 3 with `#gmNext2`, then tap
   `#gmClose`. The pass still reads **Finished**. `#resumeBar` stays hidden.
   The record has `live.finished === true` and `live.at` 2. So
   `stage(p, live)` is `'finished'`, which is what #133 reads as started.
10. **The last stint of a reopened finished game** (decisions 1 and 2).
    Step it to the last stint: `#gmFinish` is hidden and
    `#gmNext2` shows `disabled`, as before this ticket. Nothing on Today or
    the game screen offers to un-finish it.
11. **Old records load.** `sanitize` keeps `live.finished` only when it is
    `true`. A saved game with `finished: true` loads with it, through both
    `load` and a backup restore (`backup.js`). A game with no `finished`, or
    with `finished: 'yes'`, `1` or `false`, loads as `{ at, overrides }` with
    no `finished` key. The existing `test/storage.test.js` and
    `test/backup.test.js` expectations do not change.
12. **Large text.** At 320px wide with a 32px root, bench mode on the last
    stint: the footer (`#gmDone`, `#gmPrev`, the dots, `#gmFinish`) has no
    horizontal overflow, nothing sits above the viewport, "Finish game" is
    not clipped, and every control in the row is at least 48px. This is a
    new state, "bench mode, last stint", in `APP_LARGE_TEXT_STATES`
    (`scripts/smoke/app-large-text.mjs`). Its `close` puts the record back so
    later states see RICH as it was.
13. **Nothing re-derives stage.** `test/live-guard.test.js` passes with no
    change to it. No file outside `live.js` and `storage.js` reads
    `live.finished`, except `gamemode.js` writing it (`live.finished = true`
    inside the `undoable`). The guard is extended to fail on a read of
    `live.finished` outside those two files, and it is watched failing
    against a planted read first (`/new-guard`).

## Surfaces

- Changes:
  - `app/live.js`: `stage` (reads `finished` first; drops the last-stint
    rule), `resumeAt` (clamps through `stintIndex`), `passStatus` (the
    Finished branch). The header comment's rule list follows.
  - `app/gamemode.js`: `#gmFinish` wiring and its handler (one `undoable`,
    then close), `renderGameMode`'s footer (show `#gmFinish` / hide
    `#gmNext2` on the last stint of an unfinished game), and
    `closeGameMode` taking whether the close came from Finish game instead of
    asking `stage`. The comment above `openGameMode`'s `openAt` call is
    updated: a finished game is one the coach finished, not one on its last
    stint.
  - `app/index.html`: the `#gmFinish` button in `.gm-foot`, after `#gmNext2`,
    `hidden` by default.
  - `app/app.css`: `.pass-status.done::before { background: var(--info); }`
    beside the other three (`app.css:516–518`), and whatever `#gmFinish`
    needs to share `.gm-nav.next`'s look at text width.
  - `app/toast.js`: for decision 3. The tip and
    install prompt wait for a live Undo toast to leave.
  - `app/storage.js`: `sanitizeGames`' `live` block keeps
    `finished: true`. Nothing else.
  - `app/sw.js`: `VERSION` and `SHELL`.
  - Tests: `test/live.test.js` (the old "last stint is finished", "past the
    end is finished", "1-stint plan is finished at 0", "resumeAt: null when
    finished (the last stint)", "resumeAt: null when past the end",
    "passStatus: Planned … at 3" and "openAt: a finished game opens on stint
    0" cases are rewritten to the new rule; this is the owner's decision, not
    a weakened test), `test/pass-status.test.js` (its "the last stint is game
    over" assertion flips to Underway; a Finished case is added),
    `test/resume-bar.test.js` ("null when … the last stint" becomes a case
    where the last-stint game is picked, and a finished case is added),
    `test/gamemode-open.test.js` ("a part-played game says so on the plan
    page" pins `at >= p.stints.length - 1` inside `stage`; it now pins the
    `finished` read instead), `test/storage.test.js` and
    `test/backup.test.js` (item 11), `test/contrast.test.js` (item 6),
    `test/live-guard.test.js` (item 13).
  - Smoke: a new check module, `scripts/smoke/finish-game.mjs`, and its one
    registry entry, for items 1–5, 7, 9 and 10. `pass-underway.mjs` and
    `game-passes.mjs` stay as they are. Item 12's state goes in
    `app-large-text.mjs`.
  - Docs (doc-writer): `CONTEXT.md` (Decisions, above);
    `docs/interface-guidelines.md` K3 ("Finished is neutral") and N7 if its
    wording needs "part-played" updated; `docs/architecture.md:30` and
    `:887` (the "last stint is a game that is over" paragraph);
    `AGENTS.md`'s large-text state count (28 → 29).
- Must not change:
  - `docs/specs/123-live-module.md` (historical; see the note at the top).
  - `app/card.js`, `app/timeline.js`, `app/teams-view.js`: they already ask
    `resumeAt`, `resumeBarAt` and `passStatus`, and the new answers reach
    them through those.
  - `app/state.js`: `newGame` keeps `live: { at: 0, overrides: {} }`.
    `archiveDay` and filing are #133's.
  - `app/shortcuts.js`.
  - Any token value in `app/tokens.css`.
  - `scripts/smoke/fixtures.mjs`'s `RICH` and `partPlayed`.

## Constraints

- **Reuse `stage` in `app/live.js`. Do not re-derive it.** Every rule about
  where a game stands, the new flag included, lives in `live.js`. No other
  file compares `live.at` (`test/live-guard.test.js`) or reads
  `live.finished` (item 13). `live.js` keeps importing only `./engine.js`.
- **Reuse `undoable`** for Finish game's Undo, and `gameLabel` for the
  toast's name. No second restore path and no second "opponent or Game N"
  string.
- **Reuse `closeGameMode`** for the close. No second teardown.
- **Precache bump.** `live.js`, `gamemode.js`, `storage.js`, `index.html`
  and `app.css` are precached (`sw.js:38–70`). Bump `VERSION` in
  `app/sw.js` and set `SHELL` to the digest `npm test` names, in the same
  change.
- **`REQUESTS_BASELINE` does not move.** No new module joins the boot graph.
- **The live-guard extension is built under `/new-guard`.** Watch it fail on
  a planted `live.finished` read before trusting it.
- **Guidelines:** N7 (Resume bar for a part-played game only), K3 (status
  colors; gains "Finished"), K5 (dot 3:1, text 4.5:1), C9 (one Undo toast;
  it is not replaced by a tip), C10 (bench mode's exits unchanged), P6 (no
  confirm on Finish game), I1 (48px), I3 (the swipe is never the only way,
  and never finishes), W1 and W2 ("Finish game" is a verb, sentence case),
  A4 (item 12).
- **Glossary words:** "finished", "part-played", "never started". Not "in
  progress", "live game", "completed" or "over" in copy (`CONTEXT.md`).
- **American spelling** (`test/spelling.test.js`).
- Mobile first: 390×844, then 320px with a 32px root.
- One issue. #133's filing rule, #138's bench-mode restyle and #147's "clear
  Done" are not part of this diff. #147 waits for this ticket.

## Design

In `live.js`, `stage` checks the plan, then `live?.finished === true`, then
`at <= 0`, and otherwise answers `'part-played'`. `resumeAt` reads its row at
`stintIndex`. `passStatus` gains the Finished branch before Planned.

In bench mode, `renderGameMode` shows `#gmFinish` and hides `#gmNext2` when
`stintIndex` is the last stint and `stage` is not `'finished'`. `#gmFinish`'s
handler closes bench mode, then runs one `undoable` that sets
`live.finished = true` and repaints Today. `closeGameMode` gets whether this
close is a finish from its caller.

`sanitizeGames` keeps `finished: true`. Add the `.done` dot. Update the tests
that pinned the old rule, add the smoke check and the large-text state, and
bump the precache.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `live.js` exports with hand-built plans | `node --test test/live.test.js` | 8 |
| `passStatus` / `resumeBarAt` on real plans | `node --test test/pass-status.test.js test/resume-bar.test.js` (`state-fixture.js`, `S.computeAll()`) | 1, 4 and 9 at the unit level |
| Load and restore | `node --test test/storage.test.js test/backup.test.js` | 11 |
| Dot contrast | `node --test test/contrast.test.js` | 6 |
| No re-derivation | `node --test test/live-guard.test.js test/gamemode-open.test.js` | 13 |
| Bench mode, Today, Undo in a browser | `node scripts/smoke.mjs --only "<finish-game check name>"` (`scripts/smoke/finish-game.mjs`) | 1, 2, 3, 4, 5, 7, 9, 10 |
| Large text | `node scripts/smoke.mjs --only` the app large-text row | 12 |
| Precache | `node --test test/sw.test.js` | the bump |
| By eye, light and dark | `/browser-verify` on `npm run serve`, then the preview: the Finished pass next to Planned and Underway, and the footer on the last stint | 3, 5 |

`npm test` then `npm run smoke -- --no-tests`, once, by whoever commits.

## Out of scope

- #133's filing rule. This ticket only makes sure a finished game reads
  `'finished'` from `stage` even after reopening. #133's draft spec needs
  updating for two things this changes: its open question's case 2 is closed
  by `live.finished`, and "a one-stint plan counts as started" is no longer
  true. Its case 1 (bench mode opened and closed on stint 0) still reads
  never started. That is #133's question, not this one.
- Recording that bench mode was ever opened.
- Un-finishing a game outside Undo (decision 2).
- Bench mode's look (#138) and its Done and next-change wording (#147).
- Any analytics event for finishing a game.
