# #301 — Card and Game pass scenarios: Half sheet, Change line, share or hand off

## Issue

#301 (a sub-issue of #293): cover the Card journey with Coach scenarios — a
coach looks at the Card, switches it to the Half sheet, and hands the Game
to another phone.

## Goal

A coach who prints or shares a Game gets the Plan they made: the Card shows
every Stint's Change line, the Half sheet is the same Plan at a bigger size,
and the Game handed to an assistant opens on the other phone with the same
Plan. If a tap on any of those controls stops doing its job, a scenario goes
red.

## A word on "Game pass"

`CONTEXT.md` defines **Game pass** as one Game's summary on Today, not as
the hand-off link. The ticket's third criterion ("share or hand off produces
a Game pass; opening it in a fresh page shows the same Plan") means the link
that **Hand off** builds in the Share sheet. That is the only share path
that carries a Plan: Share image is a picture. This spec reads it that way
and calls it "the Hand off link". No glossary change.

## What would settle it

Fixture: the smoke harness's rich Team through `Coach.onGameDay()` — 11
Players, Format 4 × 8, Sub interval every 4 min (8 Stints, 160 Minutes),
Hawks at 9:00 AM and Ravens at 11:30 AM, clock pinned to Sat, Sep 12, 2026,
12:00. Each scenario opens the Hawks Game with a tap on
`Hawks, 9:00 AM, planned`, then taps `Card`.

1. **Change line.** The Card shows one Change line per Stint, 8 in all,
   reading top to bottom (measured on this tree, seed 1234):

   ```
   Q1 8:00 START
   4:00 ▼CASE HANA NIA
   Q2 8:00 ▼ANA SAM THEO
   4:00 ▼CASE DEVO JORD
   Q3 8:00 ▼HANA MARC RILE
   4:00 ▼ANA CASE NIA
   Q4 8:00 ▼ELI SAM THEO
   4:00 ▼CASE DEVO JORD
   ```

   The card measures 3.45 × 5 in (Pocket).
2. **Half sheet.** In the Share sheet (`Share or hand off`), choosing `Half
   sheet · 8 × 5.1 in` under `Size` makes the card measure 8 × 5.1 in. Its
   Change lines and each Stint's five are exactly what the Pocket card
   showed. After reopening the app, the card is still 8 × 5.1 in with the
   same Change lines and fives.
3. **Hand off.** In the Share sheet, `Hand off` then `Share link` sends one
   link. Opening that link in a fresh page with no saved record (another
   phone) says `Smoke Test game added. Open bench mode to run subs.`, opens
   the game screen, and its Card shows the same 8 Change lines and the same
   five in every Stint as the sender's Card.

And, from the ticket:

- Scenarios are named in a coach's words. They act only through taps and
  typing, and assert only what is on screen or kept across a reload.
- Every verb the journey needs lives in `test/coach.js`.
- Mutation proof: at least 4 realistic breaks of this journey's handlers in
  `app/`, each turning a named scenario red, then restored. Recorded in the
  PR.
- `test/card-scenarios.test.js` passes 20 runs in a row locally (through
  the smoke lock), each run under 10s, and `npm test` is green.
- No existing unit test is removed (the #293 comment after #296: scenarios
  are additive). `test/handoff.test.js` and the `card-*.test.js` files stay.

## Surfaces

Changes:

- `test/card-scenarios.test.js` (new): items 1-3.
- `test/coach.js`: new verbs, appended, plus one added line in
  `Coach.open` for the share-sheet stand-in (below). No existing verb is
  reordered, reformatted or changed.
- `docs/specs/301-card-scenarios.md`: this file.

Must not change: anything under `app/`. This ticket changes no app
behavior. A mutation is made in `app/` only to prove a scenario can fail,
and is restored before the commit.

## Constraints

- `AGENTS.md` § Test seams: the Coach seam. A scenario never reads `state`,
  never imports app code, and asserts only what a coach sees.
- The file is shaped like `test/roster-scenarios.test.js` and
  `test/game-day-scenarios.test.js`: skipped without Chrome (`hasChrome`),
  one `Coach` per file, and an `afterEach` that fails if the page logged an
  error.
- Reuse `Coach.onGameDay()`, `tap`, `toast`, `comeBackDaysLater(0)` and
  `land` (through the driver). Do not write a second fixture or a second
  way to reload.
- Driver changes are add-only. Other lanes (#298, #300) also add verbs to
  `test/coach.js`, and lanes are rebased on each other after each merge.
- American spelling.

## Design

**The share-sheet stand-in.** Hand off's button calls `navigator.share`
when the phone has one and the clipboard otherwise. Headless Chrome on a
Mac has `navigator.share` and on CI's Ubuntu does not, so the button is
`Share link` on one and `Copy link` on the other, and neither hands the
link back to a test. `Coach.open` adds one on-new-document script that
gives every page a `navigator.share` that keeps what it was given and
resolves, the way a phone's share sheet takes the link. The button is then
always `Share link`, as on a phone. `canShare` is left alone. No scenario
here taps Share image, which checks `canShare` first; on a machine where
that says yes, the stand-in would take the image too, and keep no link.

New Coach verbs, appended to `test/coach.js`:

- **`changeLines()`**: the Card's Change lines, top to bottom, as they
  read (`Q2 8:00 ▼ANA SAM THEO`). The first copy of the card only.
- **`cardFives()`**: each Stint's five on the Card, top to bottom, as the
  card shows them (`['ANA', 'CASE', 'HANA', 'NIA', 'SAM']`).
- **`cardSize()`**: the card's size in inches, as a ruler would read the
  print, `'3.45 × 5'` or `'8 × 5.1'`.
- **`choose(name, option)`**: pick `option` in the dropdown a coach would
  call `name`. It taps the dropdown and types the option's text, the way a
  keyboard picks from a closed select, then fails by name unless that
  option is the one showing.
- **`sharedLink()`**: the last link the share-sheet stand-in was given, or
  fails if nothing was shared.
- **`openLink(url)`**: open `url` in a fresh page with no saved record —
  another phone — and wait for the game screen.

The scenarios live in one `describe('a coach prints or hands off a game')`,
one test per item 1-3 above.

## Proof

- **The Coach seam** (`node --test test/card-scenarios.test.js`) covers
  items 1-3. Each scenario is written first and seen red against a missing
  verb or a wrong expected value that names the behavior, never an import
  error.
- **Mutation proof**, by hand: at least 4 breaks in `app/`, for example the
  Timeline | Card switch's tap, the Size dropdown's change handler, the
  Change line's "who comes off", the Share link button sharing the wrong
  address, and the hand-off link leaving out the Format. Each break is
  shown turning a named scenario red, then restored.
- **Stability**: 20 runs in a row of the file through `with-smoke-lock.sh`,
  with the time of each run.
- The proof pair (`npm run smoke`, which runs `npm test` inside it) on the
  commit.

## Out of scope

- Any app change, including any bug a scenario finds. A bug is reported,
  not fixed here.
- Removing unit tests.
- Share image's PNG: it carries a picture, not a Plan a test can read
  back, and its painter has its own unit tests.
- Print itself (`window.print()`), Copies, Names and the Minutes strip.
- The Game pass on Today (`CONTEXT.md`'s meaning); the Day journey (#299)
  covers Today's games.
