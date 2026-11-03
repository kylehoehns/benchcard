# 570 — Levels: one clear note, and best-player choices hide until levels differ

## Issue

#570 (part of #561, the ease-of-use pass): say in one note on the player sheet
everything levels do, hide best-player choices on planning screens while
every level is equal, and say under Order's two options where its first one is
set. A short brief (light-review lane, display only).

## Goal

A coach reading a player's Level row learns all four things levels do. A coach
whose kids are all at one level is not offered "Best players", which would do
nothing; one line tells them to set levels on the Team page first. On Order, a
coach can see where the first option's name comes from. No plan changes.

## Survey (on `82c9ba3`)

- The note is `levelsNote()` in `app/roster-view.js`. It has two spellings by
  the team's "Extra minutes go to" stance, and leaves out Order. `test/leak.test.js`
  and `scripts/smoke/team-screen.mjs` pin "never printed and never shown in
  bench mode" in it, so that clause stays.
- #567 renamed "The odd minutes" to **Extra minutes go to** and put it behind
  a **Fine-tuning** row in Settings (`#fineTuneBtn`, `#fineTune`,
  `#tieBreakSeg`, `#fineTuneNote` in `app/index.html`; bound and painted in
  `app/teams-view.js`).
- #579 renamed Order's first option. It is now "Best players get the extra
  sub" or "Kids behind on minutes get the extra sub", taken from the stance
  (`mixChoice` in `app/strategy.js`). The issue's "Best players play the most"
  is the old name.
- Best-player choices on planning screens today: Settings' **Best players**
  button, and Order's first option when the stance is Best players. Strongest
  five in the overtime sheet stays whatever the levels (issue, ADR 0001).
  Lineup balance already has its own equal-levels note (`noLevelsLine`,
  `app/balance.js`). Closers' "your best players close" line already shows
  only when levels differ.
- `tiersDiffer` (`app/engine.js`) and `tierOfPlayer` (`app/state.js`) already
  answer "do levels differ"; `strategy.js` wraps them as `levelsDiffer`.

## Choices the issue left open

- **Which kids count for "levels differ" in Settings:** the whole team roster
  (`state.players`), because Settings is a team setting, not one game's.
- **Order needs nothing hidden.** Its first option names the stance. With
  equal levels, Settings no longer offers Best players, so the stance can only
  be Best players if it was saved earlier, and the issue says a saved choice
  keeps showing. So Order shows both options as today, plus the pointer line.
- **The pointer names the full path:** "Set in Settings > Fine-tuning > Extra
  minutes go to." The row is behind Fine-tuning since #567, so the shorter
  path would send a coach to a row they cannot see.
- **In Settings the whole "Extra minutes go to" row hides,** not only its
  Best players button: a segment with one choice is not a choice. In its place,
  the Fine-tuning footnote reads the pointer line (one gray line under the
  group, W3).
- **A saved Best players keeps the row** with both buttons, even with equal
  levels. Tapping Kids behind on minutes then hides the row, as for any team
  with equal levels.

## What would settle it

1. Player sheet, Level footnote (any stance), exactly: "Levels mix strong and
   newer kids on the floor, decide who gets the few extra minutes if you
   choose that in Settings, help Order build its list, and pick the strongest
   five in overtime. They never give a kid a lot more minutes. They are never
   printed and never shown in bench mode."
2. Settings, every player at one level, stance Kids behind on minutes, after
   tapping Fine-tuning: no "Best players" and no "Kids behind on minutes"
   button; the footnote reads exactly "When minutes can't split evenly, the
   spare sub goes to the kids behind on minutes. Set levels on the Team page to
   choose your best players instead."
3. Settings, two levels different: both buttons show after Fine-tuning, and
   the footnote is today's ("When minutes can't split evenly, who gets the
   spare sub. Everyone still plays about the same.").
4. Settings, equal levels with Best players saved: both buttons show, Best
   players pressed.
5. Order (built list, game not started): under the two options, the line "Set
   in Settings > Fine-tuning > Extra minutes go to." Not shown once the coach
   has moved someone (the options are not shown then either).
6. Plans unchanged: `test/levels-570-fingerprint.test.js`, recorded at
   `82c9ba3` before any edit, stays green.
7. Look checks: player sheet, Settings (Fine-tuning open) and Order, at 320
   and 390 wide, 16 and 32px text, levels equal and different, long names,
   scrolled to the bottom. No clipping.

## Proof

- Items 2-5: Coach scenarios (`test/coach.js`), new file
  `test/levels-570-scenarios.test.js`. Rosters use made-up names only.
- Item 1: a Coach scenario reading the player sheet footnote.
- Item 6: the fingerprint test, `node --test`.
- Item 7: `scripts/look.mjs` and the full smoke run.

## Coach note

Two What's new entries: Settings hides Best players until levels differ; the
Level note and Order's line say what levels do and where the choice is set.

## Out of scope

- A third option on Order (decided against, `docs/design-decisions-rotation-order.md`).
- Bench mode and the overtime sheet's Strongest five.
- The make-up-minutes switches (#563, #581, another lane).
