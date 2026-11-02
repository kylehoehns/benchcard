# Design decisions: Rotation order

Split out of [design decisions](design-decisions.md), which has a size limit.
The same rule applies: a decision is kept with its alternative.

The spec was #545. The glossary entry is **Rotation order** in CONTEXT.md.

## The plan is a formula, not a search

- **The plan is read off the list; nothing is solved.** With `n` players
  available and `c` changing at once (Players changing at once, 1 to 5), stint
  `j` is `circle[(j * c + t) mod n]` for `t` = 0 to 4, where the circle is the
  game's order over the players who are here, turned so the first stint's lead
  comes first. Alternative: run the normal search with the order as a strong
  preference. Rejected: the coach asked to know who is next, and a search that
  sometimes breaks the order cannot promise it.
- **`order` has its own path in `generatePlan`.** It skips the search, the seed
  and every rule that shapes the search (Starting five, minutes targets, the
  change limit). The rules the order cannot satisfy are still checked
  afterwards and say so: an Apart pair on the floor together, a Plays at most
  or Plays at least the order breaks, a run past Plays at most or Sits at most.
  Nothing blocks. Alternative: refuse the plan. Rejected: a warning keeps the
  coach in charge, as for every other strategy.
- **When `c` is more than `n - 5`, fewer than `c` players change.** Fewer
  players sit than `c`, so the plan says "With 8 players, only 3 sit each
  stint, so fewer than 4 change at a break." and still shows the formula.

## Where the order lives

- **Each game keeps its own `order` (a list of ids).** Editing one game never
  moves another. The effective order drops anyone no longer on the roster and
  adds anyone missing at the end, so an empty list is the roster order.
  Alternative: one order on the team. Dropped by the owner: two games a day
  often want different lists.
- **The starting point is written once.** Picking Order on a game with no list,
  or adding a game by cloning an Order game, writes the list. It is the
  latest earlier Order game's list, turned to begin at whoever its cycle would
  put on next, or the roster order when there is none. A game's own date can
  change afterwards, so a carried order may continue across days. Accepted: the
  coach can move players, and the day boundary is not known when a game is
  added.
- **Where a cycle stopped is read, not stored.** From the game's last
  effective stint: the circle at that stint, the window start (the member of
  the five whose circle predecessor is not on the five), and the player `c`
  places on. A five that is not a run of the circle (a hand swap broke it) is
  read from its first member on, to the first player not on it. The same
  helper gives the lead for a re-plan.

## A game underway

- **A change of plan keeps the stints played and continues the cycle.** The
  lead for the first re-planned stint is where the stint before it left the
  cycle. The new circle is the game's order over who is playing now, so a late
  kid appears at their place and a sat or Out kid is gone. If the lead is no
  longer playing, the next player after them in the order who is. `resolveRest`
  no longer refuses Order, and the four who stay after a Sit for the rest are
  not forced.

## The list on screen

- **One row per player with two 48px arrow buttons.** This is the one list
  with two controls in a row (guideline C6 allows it here), because a visible
  button is the way to move (I3) and drag is out of scope. The move acts at
  once, and focus stays on the pressed button, or its partner at either end.
- **Order has no Shuffle and no Lineups group.** There is no seed to shuffle
  and no balance shape to choose. The `s` shortcut does nothing.
- **Starting five is not offered, and one already set says it is not used.**
  The order picks who starts.
