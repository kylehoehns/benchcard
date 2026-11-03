# Design decisions: Rotation order

Split out of [design decisions](design-decisions.md), which has a size limit.
The same rule applies: a decision is kept with its alternative.

The spec was #545. #547 changed who builds the list; see
[The app builds the list](#the-app-builds-the-list-547). The glossary entry is
**Rotation order** in CONTEXT.md.

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
  a warning keeps the coach in charge, and the coach's list is never changed
  to fix a rule. The app's list is built to meet the rules instead (#547).
- **When `c` is more than `n - 5`, fewer than `c` players change.** Fewer
  players sit than `c`, so the plan says "With 8 players, only 3 sit each
  stint, so fewer than 4 change at a break." and still shows the formula.

## Notes

- **Rules warn; they never block.** The coach's list is never reordered to fit a
  rule. After the fives are made, one note is written for each rule the list breaks: a minimum or league minimum
  missed (`MIN_MISSED`), Plays at most (`CAP_EXCEEDED`), a run past Plays at
  most or Sits at most (`CONSEC_EXCEEDED`, `BENCH_EXCEEDED`), an Apart pair on
  the floor together (`APART_TOGETHER`), Starts the last period missed, and the
  fewer-than-`c` note above. Keep-together (`PAIR_PARTIAL`) and One of two on
  (`KEEPON_PARTIAL`) stay as notes too. The app's list gets the same notes, and
  one more: `ORDER_BUILT_SHORT` (#547).
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
  writes one. When the latest earlier Order game that day is the coach's, the
  list is that game's cycle, turned to begin at whoever it would put on next.
  Otherwise the list is the app's: the roster order for now, built at the next
  plan (#547). Adding a game on Order writes it the same way, at the moment it
  is added to its day (`addGame`), whether it was cloned or picked at step 3.
  Same day only: a game on a new day, or one that replaces a filed day, is built
  from its own settings and does not carry another day's list. Alternative:
  carry the order across days. Rejected: a new day is a new set of kids and a
  new first five, and the earlier day's stopping point means nothing.
- **Where a cycle stopped is read, not stored.** From the game's last effective
  stint: the circle at that stint, the window start (the member of the five whose
  circle predecessor is not on the five), and the player `c` places on. A kid who
  sat for the rest of the game is not in that circle. A five
  that is not a run of the circle (a hand swap broke it) is read from its first
  member on, to the first player not on it. The same helper gives the lead for a
  re-plan, and the engine keeps no second "who is next" of its own.
- **An old record reads as roster order.** A game saved before this change has
  no list, so it reads as the roster order. Nothing looks back at an earlier game
  for it. A list with no `orderBuilt` flag is the coach's and is never rebuilt
  (#547). This is a known limit.

## The app builds the list (#547)

The spec is [specs/547-order-builds-the-list.md](specs/547-order-builds-the-list.md).

- **Who owns the list is one flag, `orderBuilt`.** Set means the app built it.
  Absent means the coach set it. Alternative: no flag, and treat any list the
  coach has not moved as the app's. Rejected: every game saved before this change
  would be rebuilt, and its plan would change. The flag is not carried in a
  handoff, so a handed-off list is the coach's and plans as before. Alternative:
  carry it. Not done: the spec puts that out of scope.
- **The app's list is built again on every plan until the game starts.** The
  build reads the roster, levels, who is here, the rules, the format, Players
  changing at once and the odd minutes setting, as they are at that moment. So an
  added Apart rule, or a kid marked Out, moves the app's list. The coach's list
  never moves by itself. Once a stint is played, or the game is finished, the
  list is frozen, even if the app built it. Alternative: write the list once,
  when Order is picked, as #545 does. Rejected: a rule added later would never
  reach the list.
- **A new game's list follows the day's list.** When the latest earlier Order
  game that day is the coach's, the new game continues its cycle and is the
  coach's too. In every other case the new game's list is the app's: there is no
  earlier Order game that day, or the earlier one is the app's. Alternative:
  always continue the day's cycle. Rejected for an app's earlier list: the app
  rebuilds that list from the earlier game's own settings, so its stopping point
  means nothing.
- **Out and Running late kids are not placed by the builder.** They go at the end,
  in roster order. The cycle skips them anyway, so a spot for them would change
  no stint. A Running late kid who is here before the game starts is placed on
  the next build. One who arrives mid-game joins at the end, because the list is
  frozen by then.
- **The builder is a fixed search, not a random one.** It starts by matching kids
  to spots: the kid with the highest priority takes the spot with the most
  minutes. It then swaps two kids, keeping each swap that lowers the score, until
  none does. Then it tries every three-kid turn once, and goes back to swaps if
  one helps. The score is 1,000,000 times the rule cost in minutes, plus the
  preference cost. A rule always beats a preference. The rule cost is the minutes
  a minimum falls short, the minutes a cap is exceeded, the minutes an Apart pair
  shares, the minutes both kids of a One of two on pair sit, and the minutes a
  Starts the last period kid misses. Together counts the minutes the pair does not
  share beyond the fewest any two spots can share, so the cycle's best costs
  nothing. The preference gives the most minutes to the highest priority, weighted
  by how many kids each one ranks above.
  - Alternative: random restarts or a shuffle. Rejected: the same input must give
    the same list, and the spec puts shuffle out of scope.
  - Alternative: stop on a clock. Rejected: the list would depend on the phone.
    The search stops after a fixed 12,000 score checks (`BUILD_CAP` in
    `app/engine.js`). The spec sets that count against a 50 ms budget for the
    largest roster at a 4× CPU slowdown. The measured time is in the PR.
- **Equal priorities are equal.** Kids with the same priority share a tie. With
  everyone equal and no rules, the list is the roster order. Alternative: a
  random tie break. Rejected: no random choice anywhere in the list.
- **Starts the last period is in the builder.** The issue's list of rules left it
  out. #545 still reads it, and it can be steered. Alternative: leave it out.
  Not done: the rules should shape the list.
- **Plays at most and Sits at most are not in the builder.** The issue said they
  could steer the list. That is false. Each spot's runs come from the cycle, and
  every spot is filled, so every list has the same runs and none can do better.
  #545's CONSECUTIVE and BENCH notes still say when the cycle breaks them.
  Alternative: score them anyway. Not done: the term would be the same for every
  list.
- **Starting five stays not used.** See "Starting five is not offered" above.
  Alternative: let the builder pick a starting five. Not done: the order picks
  who starts.
- **When no order meets every rule, the list comes closest and says so.** The
  search keeps the closest list it finds. The app's list gets #545's per-rule
  notes and one warn note, `ORDER_BUILT_SHORT`, built by `orderShortNote`. It
  says what the builder could not do, in plain words. Alternative: no extra note.
  Rejected: a coach who did not set the list has no other way to learn the app
  could not do better.
- **Copying a game's plan copies whose list it is.** "Copy from another game",
  with How it plans on, copies the list and the flag. An app's list is built
  again for the new game, and a coach's list is copied as set. A game added
  without a copy drops both, and `addGame` writes its start. Alternative: always
  copy the list as the coach's. Rejected: a copied list the new game's roster or
  rules do not fit would stay frozen.
- **Moving a row makes the list the coach's.** Any move clears the flag.
  "Build it for me again" sets it back, and Undo restores the coach's list. The
  button shows only for a coach's list before the game starts. Alternative: no way
  back short of a new game. Rejected: a coach who moved one kid by mistake would
  have no way to get the app's list back.
- **Minutes sit under each name.** Each kid's minutes this game show as a muted
  second line, from the open plan. Alternative: a separate minutes column.
  Rejected: at 320 px it takes width from the name. After each plan the numbers
  refresh in place. If the app rebuilt the list under an open sheet, the rows are
  drawn again.
- **The footer says who built the list.** The app's list says so, and that a
  move makes it the coach's. The coach's list says "You set this list."

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
