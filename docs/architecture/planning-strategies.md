# Planning strategies

- **Even** (default) -- as close to equal as the clock allows. One click.
- **By hand** -- per-player targets on sliders, with locks. Exact when they
  add up to the whole game; short of that the spare minutes get shared out and
  each row says what it will really play.
- **Closers** -- even minutes early, a group you pick finishes the game.
- **Platoon** -- fixed fives alternating wholesale, no optimization.

Plus rules that compose with any of them: min/cap minutes, Together and
Apart pairs, pinned starting five and last-period five, and a
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
