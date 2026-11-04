# Design decisions: Make up minutes from

Split out of [design decisions](design-decisions.md), which has a size limit.
The same rule applies: a decision is kept with its alternative.

The spec was #563, with #581 folded in. The glossary entry is **Make up
minutes from** in CONTEXT.md.

- **One row with three choices replaces two switches.** The Plan sheet had
  "Across the day" and "Across the season" switches, and Settings had "A new
  game starts". The two switches could not both mean something (the season
  already counts the day), so the pair was really three states. The choices are
  *This game only*, *Earlier today* and *The season so far*. The alternative,
  keeping two switches and hiding the odd combination, left the coach to work
  out which combination was real.
- **The choice is a pure function of the two flags already stored.** This game
  only is both off, Earlier today is `useCarryover` alone, and The season so far
  is both. `makeUpOf` reads it and `setMakeUp` writes it; nothing else touches
  the flags. The fourth pair (season on, day off) is cleaned to The season so
  far when a team is loaded, and no stored game changes shape, so no plan
  changes (the fingerprint tests guard that).
- **A row is offered only when it means something.** Earlier today needs an
  earlier game that day, and The season so far needs a filed game. With fewer
  than two offers the row is hidden. Showing a choice never writes it, so a
  saved season choice comes back when games are filed again.
- **Only Even and Closers read it.** By hand sets its own minutes, and Platoon
  and Order fix who plays, so the row is hidden for them and the line under the
  strategy says so. #581: By hand no longer says its plan "evens out the day".
- **The team default is `settings.makeUp`, and Settings no longer asks.**
  `seasonDefault` is gone. A new game takes The season so far when that was the
  team's last pick, otherwise Earlier today from a day's second game on, and
  This game only for the first. Add a game lost its switch (#563) and then its
  strategy step (#565): the Plan sheet owns the choice.
