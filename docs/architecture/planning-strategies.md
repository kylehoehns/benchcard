# Planning strategies

- **Even** (default) -- as close to equal as the clock allows. One click.
- **By hand** -- per-player targets on sliders, with locks. Exact when they
  add up to the whole game; short of that the spare minutes get shared out and
  each row says what it will really play.
- **Closers** -- even minutes early, a group you pick finishes the game.
- **Platoon** -- fixed fives alternating wholesale, no optimization.

Plus rules that compose with any of them: min/cap minutes, Together and
Apart pairs, pinned starting five and Starts the last period rule, and a
most-stints-in-a-row limit.

There is a third pair relation, `keepOnFloor` -- "One of two on".
It is worth spelling out why it is not one of the other two wearing a minus
sign: `pairs` and `avoids` both constrain the **floor** (both on / never both
on), and this one constrains the **bench** (never both off). A coach who wants
a ball handler out there at all times is saying nothing about whether the other
one is also playing, so "apart" is not its inverse. It is scored over the
sitting set at the weight reserved for a broken minimum or cap -- effectively
hard, with no soft/hard switch, because "mostly a ball handler on the floor" is
not something a coach can act on. The cases it cannot reach are refused before
the search (`KEEPON_UNSATISFIABLE`, `FORCED_GROUP_KEEPON`) rather than priced.
Paired with `avoids` on the same two players it is satisfiable, not a conflict:
never both on plus never both off is exactly one of them, always.

**Overtime is planned after regulation (#368).** A game that is tied and goes
to overtime keeps its regulation stints as they were played, and only the
overtime stints are planned.

Each overtime has its own **Who plays** choice, picked in the Overtime sheet
and stored with that overtime (#369). Each overtime period keeps its own
choice, so a first overtime and a second can differ:

- **Next rotation** -- the game's own strategy, as set out below. This is the
  default each time the sheet opens.
- **Even out** -- planned as Even whatever the game's strategy. The closing
  group and the units do not apply in that overtime.
- **Keep this five** -- the five on the floor on the last regulation stint,
  hand swaps included.
- **Strongest five** -- the five highest-Level players still playing (at the
  game and not sat for the rest), ties going to whoever has played fewer minutes. Level is never shown; this choice is
  the one place it picks minutes. See
  [ADR 0001](../adr/0001-level-picks-the-overtime-five.md).

Keep and Strongest work out their five once, when the overtime is added, and
store it. A re-plan does not move that five: not a hand swap that re-plans
later stints, not Reset (`#gmReset` puts a pinned overtime stint back on its
stored five, not on the plan, and plans an Even out overtime again as Even
out), not the #134 "rotation changed" fallback, which writes the pinned fives
back after it drops the swaps, and not a Plays at most or Apart rule. Only the
stints that are not pinned are solved; the pinned fives count as minutes
already played.

Apart, One of two on and Plays at most do not reshape a pinned five. When a
pinned five breaks one of them, the plan gets a `PIN_BREAKS_RULE` warning
(#440) naming the kids and the rule, and the five stays. That covers Keep this
five too. The warning follows the five on the floor, so a hand swap that takes
the kid off clears it. A hand swap on a pinned stint still works.

When a pinned player goes Out, or is sat for the rest, their place is filled
from the players still playing: for Strongest five by highest Level, then
fewest minutes; for Keep this five by fewest minutes. The other four stay. A
kid sat for the rest stays off through every later re-plan, overtime included
(#412).

The game's own strategy, for Next rotation:

- **Even** -- the player with the fewest minutes after regulation is on the
  floor first.
- **Closers** -- the closing group is on the floor for the last overtime stint.
- **Platoon** -- the unit order carries on. The first overtime stint sends out
  the next unit, counted by the stint's place in the whole game.
- **By hand** -- overtime is planned as Even around the minutes played. The
  per-player targets the coach saved are for regulation, so they are left as
  they were, and so are the regulation stints. Locks do not carry into
  overtime.
- **Plays at most** -- a player at their cap after regulation is not on the
  floor in overtime.

No choice drops a hand swap that was already made. The Overtime sheet and
its Undo are in [bench-mode.md](bench-mode.md).
