# #572: The app's own statements match what it does

## Issue

#572 (part of #561): four places say something the app does not do. Fix
the day chart's "automatically", count played minutes when evening out the
day, make the catch-up note name everyone, and show the minute range next to
the game sentence.

## Goal

A parent who checks the app against the game finds it telling the truth. A
kid who sat through bench swaps in game 1 gets that time back in game 2, the
day chart and the plan agree on how many minutes each kid has, and a coach
holding a card that no longer matches the plan is told so.

## Survey (what the ticket got right and wrong)

- (a) holds, with one correction: the "Across the day" chart is on the
  **Season** screen (`#daySection`, `app/index.html`), not the game screen.
  `renderDayTotals` (`app/plan-view.js`) ends with "Later games even out
  against this automatically." in every case.
- (b) holds. `addUp` in `solveDay` (`app/state.js`) hands later games
  `p.minutes` unless the game has overtime. The day chart and `dayTotals`
  sum `effectiveMinutes`. The same `mins` also feeds `noteToday`, so the
  season's "today so far" deficit moves with it (the design-decisions season
  entry says so).
- The app does not record printing today. `printCard` and `shareCardImage`
  (`app/app.js`) only track analytics. The card prints the open game only.
- (c) holds (`app/engine.js`, the `CARRYOVER_ACTIVE` note: three names at
  most, "are being caught up").
- (d) holds. `STRATEGY_WORDS.balanced` is the tappable phrase; the range is
  built by `summaryLine` (`app/state.js`).

## What would settle it

1. **Swaps count.** A two-game day, 10 kids, Even, sub every 4 min, game 2's
   *Even out earlier games* on. In game 1, after stint 1 is played, a hand
   swap takes kid A off for one 4-minute stint they were planned to play.
   Game 2 then gives A 4 more minutes than it did before the swap (A was
   planned level with everyone), within the existing 2-stint clamp.
2. **No swaps, no change.** A seeded fingerprint taken on `main` at
   `f22c36a` **before any app change**: for seeds 1-20 and at least three
   shapes, a two- or three-game day with carryover on, the stints' fives and
   minutes of every game, plus the issue codes. Taken three ways: no game
   started; game 1 started (`live.at = 2`) with no swaps; game 1 finished
   with no swaps. All three must match after the change. The test holds the
   hashes.
3. **Not started stays planned.** A game that has not started (no stint
   played, not finished) hands later games its planned minutes, even if it
   holds a swap made before tip-off.
4. **Chart and evening out agree.** For a started game, the minutes added to
   the day (`cum`) equal `effectiveMinutes`, the same numbers the day chart
   sums.
5. **"Automatically" only when true.** The chart's note says later games even
   out against the day only for the later games where `evensOutDay` holds.
   Every later game: "Later games even out against this automatically."
   Some: names them the way `evensOutLine` names games (tip-off, else
   opponent; "The 2:30 PM game evens out against this automatically." /
   "The 2:30 PM and 4:00 PM games even out …"), falling back to a count
   ("1 later game evens out …", "2 later games even out …") when any of them
   has neither. None (all Platoon, Order, or the switch off): the sentence is
   left off. Tested for Platoon, Order and the switch off.
6. **Catch-up note.** `CARRYOVER_ACTIVE` reads
   "Minutes are deliberately uneven here to even out the day. Avery, Blake,
   Casey and 3 others get a little more. Drew and Emery get a little less."
   - Up to 4 kids on a side: name them all (`andList`). 5 or more: name the
     first 3 and "and N others".
   - One kid: "Avery gets a little more." / "Drew gets a little less."
   - The "less" sentence is left off when nobody carries a negative credit.
   - No kid with positive credit: the existing "Balanced against minutes
     already played today." stays.
   - Order on each side: biggest credit first (most behind first; most ahead
     first).
7. **Range.** "12–16 min each" (the minutes half of `summaryLine`, from
   `effectiveMinutes`) shows (i) on the Today pass, as a part of
   `passSummary` right after the strategy words —
   "11 players · even minutes · 12–16 min each · evens out the day · 2 rules"
   — only when the plan is ok, and (ii) in a plain line `#sentenceRange`
   directly under the sentence (after `#sentenceEvens`), not a button,
   hidden with no roster or a blocked plan. "even minutes" stays the
   tappable phrase.
8. **Changed since printed.** Tapping Print (any of `#print`, `#cardPrint`,
   `#frPrint`, Today's Print card) or Share image (when the share is not
   cancelled) saves the open game's rotation stamp on the game
   (`g.printed`). A game whose current plan's stamp differs from
   `g.printed` shows "Changed since printed" on its Today pass and in the
   game screen's sub line (`#gameSub`). Not shown: never printed, plan
   blocked, game finished, or the plan unchanged. Printing again clears it.
   A test shows: printed, then an earlier game's swap moves this plan →
   cue; printed, nothing moved → no cue; a swap in game 1 that does not
   change game 2's plan → no cue.
9. **Docs.** `docs/design-decisions.md`'s season entry says played minutes
   count once a game starts (with planned minutes for a game not started).
   `CONTEXT.md`'s *Evening out the day* says the same.

## Surfaces

Change: `app/state.js` (`addUp`, `passSummary`, a range helper shared with
`summaryLine`, the printed stamp helpers), `app/engine.js` (the
`CARRYOVER_ACTIVE` message only), `app/plan-view.js` (`renderDayTotals`'s
note, `renderSummary` paints `#sentenceRange`), `app/teams-view.js` (the cue
on the pass and in `#gameSub`), `app/app.js` (record the print),
`app/storage.js` (keep `printed`), `app/handoff.js` (a handed-off game drops
`printed`), `app/index.html` (`#sentenceRange`), `app/app.css` (its style,
the cue's style), `scripts/whats-new.json`, `app/whats-new.html`,
`app/sitemap.xml`, tests, `docs/`.

Must not change: the 2-stint clamp, `rules.js`, `gamemode.js`,
`strategy.js`, the Settings and Plan sheets (another lane is editing them),
the printed card.

## Constraints

- `engine.js` is a pure module: only the one message changes, through the
  existing `andList`; no planning logic moves.
- Reuse, do not re-derive: `gameStarted` (`live.js`) for "started";
  `effectiveMinutes` for played minutes; `evensOutDay` for which games even
  out; `rotationStamp` for the stamp; `tipoffLabel`/`joinNames` for naming
  games as `evensOutLine` does; the minutes half of `summaryLine` for the
  range (one helper, both callers).
- `g.printed` is not part of the plan signature: printing never re-solves.
- Interface guidelines: W3 (one gray line, no help icon) for
  `#sentenceRange`; K1 (the tint stays on the phrases, so the range line and
  the cue are secondary text, not tinted); K3 (the cue is not a status color
  and not a second status word); T2 (rem sizes).
- Copy follows ship-feature's What's new rule. Examples use the made-up
  names Avery, Blake, Casey, Drew, Emery, Finley, Gray, Harper, Indy.
- Look checks: Today, the game screen with a started game, and Season's day
  chart, at 320 and 390 wide, 16 and 32px, long names
  ("Alexandria Montgomery-Okafor"), scrolled to the bottom, full height;
  the catch-up note with 1, 3 and 6 kids. Clipping blocks the merge.

## Design

- `addUp`: `const mins = (g.overtime?.length || gameStarted(g.live)) ?
  effectiveMinutes(g, p) : p.minutes;` and the comment above it, and the
  `base` comment in `computeAll`, say why: once a stint is played, what was
  played (and the rest as it now stands) is what the day hands on.
- `printedStamp(p)` / `notePrinted(g, p)` / `changedSincePrinted(g, p)` in
  `state.js`, reading the module-private `rotationStamp`.
- `storage.js` keeps `printed` when it is a non-empty string.
- What's new: one entry per coach-visible change, per the rule.

## Proof

- `node --test` on `state.js` through `test/state-fixture.js`: items 1-5
  and 8's stamp logic (the plan-level tests, the fingerprint).
- `node --test` on `engine.js`: item 6 (wording builder, many cases).
  Re-record the goldens that hash `issues` text (`test/platoon-day.test.js`'s
  `balanced`, and any other) only because the message changed; say so in the
  commit.
- Coach scenario (`test/coach.js`): item 8 end to end — print a game, swap in
  an earlier game, see "Changed since printed" on Today and the game screen,
  print again, and it goes. Item 7 on screen: the range under the sentence
  and on the pass.
- Look checks via `scripts/look.mjs` for layout and clipping.

## Out of scope

- Moving or restyling `#summary` below the timeline.
- Telling the coach which earlier game moved a printed plan.
- The other #561 children (#563 edits the same design-decisions entry; keep
  the wording consistent with what is there when this lands).
