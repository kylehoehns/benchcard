# Design decisions: Rotation order

Split out of [design decisions](design-decisions.md), which has a size limit.
The same rule applies: a decision is kept with its alternative.

The spec was #545. The glossary entry is **Rotation order** in CONTEXT.md.

## The plan is a formula, not a search

- **The plan is read off the list; nothing is solved.** With `n` players
  available and `c` changing at once (Players changing at once, 1 to 5), stint
  `j` is `circle[(j * c + t) mod n]` for `t` = 0 to 4. The circle is the game's
  order over the players who are here. The list is turned when it is written
  (see below), so the first player on it who is here leads the first stint.
  Alternative: run the normal search with the order as a strong preference.
  Rejected: the coach asked to know who is next, and a search that sometimes
  breaks the order cannot promise it.
- **`order` has its own path in `generatePlan`.** It skips the search, the seed,
  and the rules that shape the search: Starting five, minutes targets, and the
  change limit as a rule (Players changing at once sets the step of the cycle
  instead). Starts the last period is still read, and is only warned about when
  the list misses it. The rules the order cannot satisfy are checked afterwards
  and say so (see Notes). Nothing blocks. Alternative: refuse the plan. Rejected:
  a warning keeps the coach in charge, and the list is never changed to fix a
  rule.
- **When `c` is more than `n - 5`, fewer than `c` players change.** Fewer
  players sit than `c`, so the plan says "With 8 players, only 3 sit each
  stint, so fewer than 4 change at a break." and still shows the formula.

## Notes

- **Rules warn; they never block or reorder.** After the fives are made, one
  note is written for each rule the list breaks: a minimum or league minimum
  missed (`MIN_MISSED`), Plays at most (`CAP_EXCEEDED`), a run past Plays at
  most or Sits at most (`CONSEC_EXCEEDED`, `BENCH_EXCEEDED`), an Apart pair on
  the floor together (`APART_TOGETHER`), Starts the last period missed, and the
  fewer-than-`c` note above. Keep-together (`PAIR_PARTIAL`) and One of two on
  (`KEEPON_PARTIAL`) stay as notes too.
- **Each note ends in the plain reason the list gives**, such as "the order puts
  them on the floor for more." It never says "no legal lineup", because no
  search ran.
- **The notes that describe a search are not written:** `SUBS_EXCEEDED`,
  `HALF_LATE`, `HALF_EARLY`, `SPREAD_RULE` and `SPREAD_FLOOR`.
- **One info note says how the minutes fall** (`SPREAD_ORDER`). It names the low
  end the way the other spread notes do, or says the minutes are even. A swap
  rebuilds it like the other spread notes.

## Where the order lives

- **Each game keeps its own `order` (a list of ids).** Editing one game never
  moves another. The effective order drops anyone no longer on the roster and
  adds anyone missing at the end, so an empty list is the roster order. A
  handed-off game carries its list, so it plans the same. Alternative: one order
  on the team. Dropped by the owner: two games a day often want different lists.
- **The starting point is written once.** Picking Order on a game with no list
  writes one: the latest earlier Order game that day, turned to begin at whoever
  its cycle would put on next, or the roster order when there is none. Adding a
  game on Order writes it the same way, at the moment it is added to its day
  (`addGame`), whether it was cloned or picked at step 3. Same day only: a game on
  a new day, or one that replaces a filed day, starts from the roster order.
  Alternative: carry the order across days. Rejected: a new day is a new set of
  kids and a new first five, and the earlier day's stopping point means nothing.
- **Where a cycle stopped is read, not stored.** From the game's last effective
  stint: the circle at that stint, the window start (the member of the five whose
  circle predecessor is not on the five), and the player `c` places on. A kid who
  sat for the rest of the game is not in that circle. A five
  that is not a run of the circle (a hand swap broke it) is read from its first
  member on, to the first player not on it. The same helper gives the lead for a
  re-plan, and the engine keeps no second "who is next" of its own.
- **An old record reads as roster order.** A game saved before this change has
  no list, so it reads as the roster order. Nothing looks back at an earlier game
  for it. This is a known limit.

## A game underway

- **A change of plan keeps the stints played and continues the cycle.** The
  lead for the first re-planned stint is where the stint before it left the
  cycle. The new circle is the game's order over who is playing now, so a late
  kid appears at their place and a sat or Out kid is gone. If the lead is no
  longer playing, the next player after them in the order who is.
- **Moving a kid in the order mid-game keeps the stints played.** The rest follows
  the new order, starting from the player the old order would have put on next
  (or the next after them in the new order who is playing). Alternative: start
  the rest from the top of the new order. Rejected: the coach moves one kid and
  the player who was due on next would change for no reason.
- **Order does not claim to even out the day.** The "evens out the day" line and
  the Across the day switch are off for a game on Order, with a note saying the
  order decides who plays. The switch's setting is kept underneath.
- **Sit for the rest keeps the cycle going.** The four who stay are not forced
  into the next five: the order decides. `resolveRest` does not refuse Order.

## The list on screen

- **One row per player with two 48px arrow buttons.** C6 says a list row has one
  control. This list is the exception, because a visible button is the way to
  move (I3), and drag is out of scope. The move acts at once. Focus stays on the
  pressed button, or on its partner at either end.
- **Order has no Shuffle and no Lineups group.** There is no seed to shuffle and
  no balance shape to choose. Shuffle is hidden, not just disabled, and the `s`
  shortcut does nothing, because it clicks the same button.
- **Starting five is not offered, and one already set says it is not used.**
  The order picks who starts.

## Like Platoon

- **Order gets what Platoon gets, and no more.** No season targets reach its
  plan, and no day carryover changes it. No Plays in each half or period is
  applied, and no league full periods are pinned. The league minimum in minutes
  or percent still applies, and it warns the way the notes above do.
