# Design decisions: Platoon and Closers start filled in

Split out of [design decisions](design-decisions.md), which has a size limit.
The same rule applies: a decision is kept with its alternative.

The spec was #569. The glossary entry is **Group** in CONTEXT.md. Order does
the same thing for its list; see
[rotation order](design-decisions-rotation-order.md).

## Platoon's groups

- **A coach who picks Platoon gets a plan straight away**, not the "Fill a
  group" block. With every group empty, the app makes one group for each full
  five here: one group for 5 to 9 kids, two for 10 to 14, three for 15 to
  19, and so on. Anyone left over is named as not playing (`UNIT_LEFTOVERS`). Fewer
  than five here fills nothing. Alternative: always two groups, as the issue
  first said. Rejected: with 15 here that leaves five kids on the bench all
  game when a third full group would play them.
- **Who is placed never depends on level.** The kids placed are the first
  full fives here in roster order. Levels decide only who plays together:
  when the placed kids' levels differ, they are dealt in a snake, strongest
  first (1-2-2-1…), so each group gets some of the stronger players. When the
  levels are the same, Group 1 is the first five and Group 2 the next five.
  Alternative: a strong group and a weak group. Rejected: Level means "who
  plays together, never how many minutes" (ADR 0001), and splitting by
  strength hands the lowest levels the bench.

## Closers' five and window

- **A coach who picks Closers with nobody picked gets five closers.** When
  levels differ, the five highest levels close, with roster order breaking
  ties. At one level, the five on the floor last in the game's plan before
  the pick close. With no plan to read (Add a game, or a blocked plan), the
  first five here in roster order close. Alternative: leave the picker empty,
  which plans like Even. Rejected: a coach who picked Closers wanted closers.
- **The window becomes the last regulation period through the end**,
  overtime included when the game has it. The engine counts the window back
  from the last stint, so counting only regulation stints would cut the
  closers out of part of the last period.

## When the fill happens

- **Picking the strategy, or adding a game on it, is the only time.** An
  emptied group shows the blocked message rather than refilling, and a game
  saved before this change stays as it was until Platoon is picked again.
  Groups and closers are not rebuilt when Who's here changes, unlike Order's
  list. Alternative: refill whenever a group is empty. Rejected: the coach
  emptying a group is a choice, and the blocked message is how they fix it.
- **A list the app filled is flagged** (`unitsBuilt`, `closersBuilt`, kept
  only when `true`), and a gray "Built for you" line under the editor says
  so. The coach's first change (a tap in a picker, Add group, Remove group)
  clears the flag and the line. The line says "stronger players are split"
  only when the fill used levels, judged over the same kids the fill placed.
- **Closers' window is one line under a "Change when" row.** Tapping it opens
  the chips for the rest of the visit to that game and moves focus to the
  selected chip. Alternative: show the chips always. Rejected: the window is
  already set for the coach, so the chips are a second decision most coaches
  never need.
