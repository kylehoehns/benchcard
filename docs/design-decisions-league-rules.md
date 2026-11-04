# Design decisions: League rules in Settings (#566)

Split out of [design decisions](design-decisions.md), which has a size limit.
The same rule applies: a decision is kept with its alternative.

#566 gathers the league rules in one place. A coach finds them under one
**League rules** heading in Settings. The two "in a row" rules (Plays at most
N in a row, Sits at most N in a row) become team values that each new game
starts from. Before this, they were set one game at a time, through Add a rule.

The rules that live there, and where they are read:

- **Everyone plays at least**: `settings.minMinutes` and `settings.minUnit`.
- **Everyone plays in**: `settings.playsIn`.
- **Plays at most** and **Sits at most**: `settings.maxConsecutive` and
  `settings.maxBench`, the team values this file is mostly about.

The reader for each team value is `teamRun` in `app/state.js`, beside
`leagueSetting` and `playsInSetting`. The one writer is `setTeamRun`.

## Choices

- **Only the two "in a row" rules get a team value.** Alternative: give the
  minimum and Everyone plays in per-game rows as well. Not done: those two
  already read the team setting live, in every game, and no saved plan changes
  when they stay that way. The per-game rows the issue asked for are about the
  two in-a-row rules.
- **A team value is a whole number from 0 to 20, and 0 means off.** The default
  is 0, so a team that never opens the setting plans exactly as before. The
  range is the game's own range (`sanitizeTeam` clamps a game's value to 0 to 20
  too).
- **A new game takes the team values, even when it copies the last game.** Add a
  game still clones the day's last game, as it did. The two in-a-row values are
  then set from the team. Alternative: keep copying the last game's values. Not
  done: a number the coach set on one game would carry into every game after
  it, and the team value would never be the one in force.
- **A game can still change its own in-a-row number, and the change stays on
  that game.** The game's detail page says so: "Changes this game only. Your
  team's rule is in Settings." Removing the row on a game sets that game's value
  to 0. The team value stays. Alternative: removing a row also clears the team
  value. Not done: clearing one game should not change the rule for the rest of
  the team.
- **Copy rules still copies the in-a-row values.** Copy rules copies from a game
  the coach picked, so it is an explicit copy of that game's setup. Alternative:
  copy the team values instead. Not done: the coach chose which game to copy.
- **A Settings change reaches the open day's games that have not started.**
  Started games, filed games and other days keep the value they have. This is
  the rule the game format already follows (#567). Alternative: change only new
  games. Not done: a coach who sets a team rule expects this day's coming games
  to follow it. The cost is that a per-game change on those unstarted games is
  overwritten. The coach has just set a rule for the whole team, so that is the
  intent.
- **A team saved before this change gets the strictest value from its games.**
  The saved settings hold no team value, so `sanitizeTeam` derives one from the
  games: the smallest non-zero value among them, or 0 if no game has the rule.
  Filed season games hold no constraints, so they do not count. Alternative: 0
  for every older team. Not done: the first new game would drop a limit the
  coach had on their games. A value the saved settings already hold is kept
  (clamped to 0 to 20). Games keep their own values. The migration is
  shape-driven, with no version number, so running it twice changes nothing.
  It runs before the fallback game for a team with no days, so that game takes
  the derived value too.
- **Each rule gets its own group under one heading.** The four rules sit in
  four groups under "League rules", so each footnote sits under the rule it
  explains. The interface guidelines allow one footnote per group (W3).
  Alternative: one group with one footnote. Not done: that footnote would have
  to explain four rules.
- **The in-a-row rules are a switch and a stepper.** The switch is "Limit time
  on the floor in a row" or "Limit time on the bench in a row". On sets the
  value to 2, held to the top of the stepper. Off sets it to 0. Alternative: a
  stepper that starts at 0 and reads "off" at the bottom. Not done: a switch
  says on or off directly, and the interface guidelines ask for one.
- **One stepper builder, shared by Settings and the rule's page.**
  `runStepperRow` in `app/game-setup.js` builds it for both. Alternative: a copy
  in Settings. Not done: the two would drift, and the same number would have
  two answers.
- **The live line under the minimum says what it comes to in this game.** For
  minutes, a percent, or quarters of time: "= 16 min in a 4 × 8 game, any time".
  For whole quarters: "= 2 whole quarters (16 min)", with the count capped at the
  game's periods. Hidden at 0. It reads the open game, or a game built from the
  team's format when none is open. "Any time" says that a minute count does not
  pick which quarters the minutes fall in. Alternative: no line, and let the
  coach work it out. Not done: "2 quarters of time" means nothing until the game
  length is known. The line is an `aria-live` region and is written only when
  its text changes, so a screen reader is not told the same thing twice.
- **The unit names say what they count, in the game's own period word.** The
  select reads "min", "% of game", "quarters of time" and "whole quarters". In a
  2-period game it reads "halves of time" and "whole halves". The saved values
  (`min`, `pct`, `periods`, `full`) do not change. Alternative: rename the saved
  values too. Not done: saved teams would need a migration, and nothing the
  coach sees needs one. The strategy skip line follows the same names. The engine's
  and game-mode's warning text and `app/advanced.html` use the same words, so
  the coach never meets the old "full periods" name.
- **The plays-in row has its own detail text.** Its page had shown the minimum's
  sentence, "Your league minimum. Change it in Settings.", which named the wrong
  rule. It now reads "Every player plays in every quarter. It's your league
  rule. Change it in Settings." The period word follows the game. Alternative:
  one line for both rows. Not done: that line told the coach the wrong rule.
- **Add a rule no longer offers the two in-a-row kinds.** They are set once, in
  Settings. The rule's own page still shows the stepper, so a game's number can
  be changed there. Alternative: keep them in Add a rule as well. Not done: two
  places to set one number.
- **The engine is not changed.** It still reads each game's own two values, so
  a plan for a saved game comes out the same. `test/league-566-fingerprint.test.js`
  holds the plans of a set of seeded teams, loaded through `sanitizeTeam`, so a
  change to what the plan does shows up there.

## Tests that pin these

- `test/league-rules.test.js`: the team values, the live line and the unit names.
- `test/league-migration.test.js`: the migration, its clamps and its second run.
- `test/league-rules-scenarios.test.js`: new games, a game's own change, Settings
  and the open day.
- `test/league-566-fingerprint.test.js`: the plans of the seeded teams.
