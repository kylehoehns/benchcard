# Benchcard

A planner a youth basketball coach uses to share minutes fairly across a team,
before and during a game, and to print the plan on a pocket card. These are the
words for its concepts, so a spec, a ticket, a test name and the copy a coach
reads all say the same thing.

Where the code still uses an older name, it is given as _In code_. Terms marked
**(decided 2026-09-14)** are settled but not yet in the app's copy; renaming the
copy is work to do, not a reason to keep the old word.

## Team and players

**Team**:
A coach's group of players, with its own roster, day, season and team settings.
A coach can have more than one.
_Avoid_: squad, side

**Roster**:
The team's players, in the order everything else lists them.
_Avoid_: squad, list

**Player**:
One person on the roster, identified by a generated id so a rename or reorder
never moves their rules or minutes.

**Player number**:
The jersey number, up to two digits.
_Avoid_: shirt number

**Card name**:
The up-to-five capital letters a player is printed as on the card.
_Avoid_: short name, nickname
_In code_: `shortName`

**Level**:
A coach's rating of a player from 1 to 5 — Developing, Learning, Regular,
Reliable, Go-to — used only to shape who plays together, never how many minutes
anyone gets, and never shown on the card, in bench mode or in an export.
_Avoid_: tier, rating, skill
_In code_: `tier`

## Games and the day

**Game**:
One matchup on the day, with an opponent, a tip-off, a format and its own plan.

**Opponent**:
Who a game is against.
_In code_: `label` on a game today, `opponent` on a filed game

**Tip-off** (decided 2026-09-22, #64):
The time a game starts, on its day's date; optional. Games in a day are played,
shown and evened out in tip-off order.
_Avoid_: tip time, start time

**Day** (decided 2026-09-22, #64):
The games a team plays on one calendar date, usually one game and sometimes a
tournament's worth. Every day has a date; a name ("Spring Classic") is
optional.
_Avoid_: session, tournament (a tournament is one kind of day)

**Filing** (decided 2026-09-22, #64):
What happens to a day once its date has passed: its games go into the season on
that date. It happens on its own; there is no button.
_Avoid_: New day (the old manual action this replaced), archiving

**Format**:
How long a game is: a number of periods of a number of minutes each ("4 × 8").
_Avoid_: game length

**Period**:
One of the equal parts of a game — a half, quarter or other period — named H, Q
or P on screen.

**Stint**:
A stretch of the clock during which the same five players are on the floor.
_Avoid_: shift, block, stretch, rotation (for one stint)

**Break**:
The moment between two stints when players change.
_Avoid_: whistle, substitution (for the moment itself)

**Sub interval**:
How often breaks come: every N minutes, N times a period, or only at the end of
each period.
_Avoid_: granularity, sub frequency
_In code_: `granMode` / `granValue`, `granularity`

## Who plays

**Available**:
A player who is at this game and can be planned.

**Absent**:
A player who is on the roster but not at this game, so the plan leaves them out
entirely.
_Avoid_: out, sitting out, no-show, not here
_In code_: `g.out`

**On the floor**:
The five players playing during a stint.
_Avoid_: on the court, out there

**On the bench**:
Available players not on the floor during a stint.
_Avoid_: sitting, out
_In code_: `sitting`

**Comes on / comes off**:
A player joining or leaving the floor at a break. On the card, who comes off is
marked ▼ and who comes on is underlined.
_Avoid_: in / out, just came in, just on, subbed

## The plan

**Plan**:
Everything the solver produces for one game from its inputs and a seed: the
rotation, each player's minutes, and any issues. It is recomputed, never stored.
_Avoid_: solve, result

**Rotation**:
The plan's lineups over the game, stint by stint. The timeline and the card are
two views of it.
_Avoid_: schedule, lineup (for the whole game)

**Timeline**:
The on-screen view of the rotation: a row per player, the game clock across,
blocks where they are on the floor.

**Minutes**:
How long a player is on the floor in a game, from the plan.
_Avoid_: playing time, PT, shifts

**Spread**:
The gap between the most and fewest minutes among the available players.

**Seed / Shuffle**:
The number that picks among equally good rotations; Shuffle picks a new one.
_Avoid_: randomize, regenerate

**Blocked plan**:
A plan the solver cannot produce because the rules, the roster or the format
contradict each other, shown with what to fix.
_Avoid_: infeasible, error state, needs a fix (except as a game's status)
_In code_: `plan.ok === false`, `issues` with severity `error`

## Strategies

**Strategy**:
How minutes are shared out in a game: Even, By hand, Closers or Platoon.
_Avoid_: mode, plan type

**Even**:
The strategy that makes minutes as equal as the clock allows.
_Avoid_: Balanced, equal time
_In code_: `balanced`

**By hand**:
The strategy where the coach sets each player's minutes, which hold exactly when
they add up to the whole game.
_Avoid_: Minutes (as a strategy name), manual, budget
_In code_: `minutes`, `targetSlots`, `targetMinutes`

**Lock**:
A mark on a By hand player's minutes that holds the number when the rest are
evened out.
_Avoid_: pin

**Closers**:
The strategy that shares minutes evenly and then puts a chosen group on the floor
for the end of the game.
_Avoid_: finishers
_In code_: `closing { stints, players }`

**Closing group**:
The players Closers puts on the floor at the end.
_Avoid_: closing five, closers (for the players)

**Platoon**:
The strategy where fixed groups of five take turns, whole group for whole group.
_Avoid_: lines, shifts

**Unit**:
One fixed group of five in Platoon.
_Avoid_: line, group, five

**Lineup balance**:
An optional setting that uses levels to shape how strong each stint's five is.
_Avoid_: skill balancing, strength

**Balance shape**:
Where lineup balance puts strength across the game: Steady, Start strong, Finish
strong or Both ends. **Steady** is the one that keeps every
stint about as strong as every other.
_Avoid_: Even (for the shape)
_In code_: `balance`, with `even` for Steady

## Rules

**Rule**:
A coach's instruction about one game that the plan must respect, shown as a
sentence ("Maya plays at least 16 min").
_Avoid_: constraint (in copy), setting
_In code_: `constraints`

**Minimum**:
A rule that a player plays at least a number of minutes.
_Avoid_: floor

**Cap**:
A rule that a player plays at most a number of minutes.
_Avoid_: maximum, ceiling, limit

**Together**:
A rule that two players share the floor as much as the plan allows, and in every
stint when the game's rules force it.
_Avoid_: pair, play together, always together

**Apart**:
A rule that two players are never on the floor at the same time.
_Avoid_: avoid, keep apart, never together

**One of two on**:
A rule that at least one of two players is always on the floor.
_Avoid_: keep on floor, never both off, always one on, one of two always on
_In code_: `keepOnFloor`

**Starting five**:
A rule that fixes the five on the floor at tip-off.
_Avoid_: opening five, starters
_In code_: `openingFive`

**Last-period five**:
A rule that fixes the five on the floor at the start of the last period.
_Avoid_: finishing five, closing five
_In code_: `lastPeriodFive`

**Rest limit**:
A rule that no one plays more than a number of stints in a row.
_Avoid_: fatigue limit, max consecutive
_In code_: `maxConsecutive`

## Team settings

**League minimum**:
A team setting for the minutes every available player gets at least, when a
league requires one.
_Avoid_: league floor

**Odd minutes**:
The minutes left over when a game's clock can't divide evenly, and the team
setting for who gets them: furthest behind, or best players.
_Avoid_: tie-break, odd stint
_In code_: `tieBreak`, `priority`

**Players changing at once**:
A team setting for how many players the plan aims to change at each break.
_Avoid_: max subs, change limit, churn
_In code_: `maxSubs`

**Team color** (decided 2026-09-14):
A team setting for the one color that marks the primary action, the sentence's
tappable phrases and selected states, so two teams look different at a glance.
Graphite, the default, is the ink itself.
_Avoid_: theme, accent, brand color
_In code_: `color`, `--tint`

## Across the day and season

**Evening out the day**:
Planning a later game against the minutes planned in the day's earlier games, so
a player who played less earlier plays more now.
_Avoid_: day carryover, tournament carryover
_In code_: `useCarryover`, `carryover`

**Filed game**:
A game kept in the season once its day is filed, with the minutes it actually
produced.
_Avoid_: archived, saved, finished, history
_In code_: `season.games`, `seasonGame`

**Season**:
A team's filed games, and the minutes each player has played across them.
_Avoid_: ledger, history

**Behind / ahead**:
How far a player's season minutes are from their fair share, where fair share
counts only the games they were available for.
_Avoid_: deficit, owed
_In code_: `seasonShare`

**Evening out the season**:
Planning a game so players who are behind on the season play more.
_Avoid_: season carryover, season targets
_In code_: `useSeasonTargets`, `seasonDefault`

## The card

**Card**:
The printed plan for a game, sized for a pocket notebook or a half sheet, and
the product the rest of the app exists to make.
_Avoid_: printout, sheet, chart

**Change line**:
The line above each stint on the card giving the clock and who comes off.
_Avoid_: sub line

## During the game

**Bench mode**:
The full-screen, stint-by-stint view a coach uses on the phone while a game is
being played.
_Avoid_: game mode, live mode, on screen
_In code_: `gamemode.js`, `openGameMode`

**Swap**:
A coach's change to who is on the floor in bench mode, for this stint or the rest
of the game, made without re-planning.
_Avoid_: override (in copy), hand sub
_In code_: `live.overrides`

**Sit for the rest**:
Removing a player from the rest of a game in bench mode and re-planning the
remaining stints around the minutes already played.
_Avoid_: sit and rebalance, re-solve, bench (as a verb)
_In code_: `resolveRest`

**Part-played game**:
A game that bench mode has moved past its first stint but not to its last.
_Avoid_: in progress, live game
_In code_: `live.at`, `resumeAt`

**Played / projected**:
In bench mode, a player's minutes from stints already completed, and where they
finish if the rest of the plan holds.

## The app

**Today** (decided 2026-09-14):
The home screen: the team's upcoming days and their games, and the way to its
team, season and settings. Its title is the team's name (#64); "Today" is only
the screen's name in these docs, and the heading over today's own games.
_Avoid_: home, dashboard, Games (as a screen)

**Game pass** (decided 2026-09-14):
One game's card-like summary on Today, with its tip-off, opponent, status and a
small picture of its rotation.
_Avoid_: tile, row (for a game)

**Sentence** (decided 2026-09-14):
The one-line summary at the top of a game ("9 players, 4 × 8, subbing every 4
min for even minutes, with 2 rules"), whose phrases open the controls they
describe.
_Avoid_: summary bar, header

**Sheet**:
A panel that rises over a screen for a short edit and closes back to it. A live
sheet changes the plan as you tap; a commit sheet collects something first and
has a confirm.
_Avoid_: modal, drawer, popup

**Settings**:
The one screen for team settings and app preferences, opened only from Today.
_Avoid_: preferences, options

**Appearance**:
Whether the app is light, dark, or follows the phone (Automatic).
_Avoid_: theme

**Sample team**:
A fictional roster a new coach can load instead of typing their own.
_Avoid_: demo team

**Tour**:
The short spotlight walkthrough shown once after first setup.
_Avoid_: onboarding (for the tour itself), walkthrough

**How it works**:
The in-app reference that explains strategies, rules and reading the card.
_Avoid_: help sheet, How this works, FAQ

**Backup**:
A file holding everything the app stores on a device, which a coach can save and
restore from.
_Avoid_: export (the season spreadsheet is an export, not a backup)

## Flagged ambiguities

- **Rotation** was also level 3's name; level 3 is now **Regular**, and rotation
  means only the plan's lineups.
- **Even** was also a balance shape; that shape is now **Steady**.
- **Out** meant absent, comes off, sit for the rest, and once on the floor. Use
  the specific term; bare "out" is not a term.
- **Floor** means the court. The minimum-minutes idea is a **minimum** or the
  **league minimum**, never a floor.
- **Bench** is where players wait during a stint, and the start of **bench
  mode**. It is not a verb, and not a word for roster depth.
- **Squad** meant both a team and today's available players; it is neither now.
