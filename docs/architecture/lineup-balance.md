# Lineup balance

Orthogonal to the strategies in [planning-strategies.md](planning-strategies.md), and the answer to the objection that kills
even minutes in practice: fairness decides *how long* each player is on, and
says nothing about *who is on together*, so five players chosen purely for
fairness can be a coach's five weakest at once.

Each player carries `tier`, 1--5, defaulting to 3. Lineup strength is the sum
of the five on the floor; each stint gets a target and `cost()` charges the
deviation at `BALANCE_WEIGHT` (5), well under the minutes term's 60/minute. The
work is mostly done by the minute-neutral `exchangeSwaps` move that pairs
already needed -- it rearranges who shares the floor without moving anyone's
total, so balance is usually free.

**A level cannot move anyone's total, and that is now structural rather than
hoped for.** The search runs in two passes. The first has the balance term
switched off and settles every player's minutes; the second switches it on but
restricts the search to exchanges between *equal-length* stints, the one move
that cannot shift a total, on half the iteration budget. Until that split,
balance was a tie-break on the minutes by accident: eleven players over eight
4-minute stints means seven play 16 and four play 12, the minutes term is
exactly flat across every choice of which seven, and the tiers were left
holding the casting vote -- marking a child developing quietly cost them four
minutes a game, about a game and a half across a season. `test/fuzz.test.js`
now holds the property directly: hold every input still, change only the
levels, and every total comes back identical. The one way a level can reach a
total is the coach asking for it out loud -- `settings.tieBreak: 'levels'`,
which is composed outside the engine and is described with the tie-break
below.

Four shapes, set per game as `game.balance`: `even`, `start`, `finish`, `both`.

**Every shape must average to zero, and that is arithmetic, not taste.** Total
strength across a game is fixed by the minutes -- it is the sum over players of
tier times stints played -- so even minutes pin the mean stint strength exactly.
A curve averaging above it asks for strength the roster does not have. The first
version ramped `start` from full amplitude down to the mean (+0.5 average); the
solver flattened into a compromise satisfying nothing, and it read exactly like
a weight set too low. `centered()` re-zeroes whatever the shape produces, because
a cosine over eight samples is not exactly balanced either.

Amplitude is `bestFive - base`, so `start` genuinely aims the top five at the
first stint rather than nudging vaguely upward.

Inert by default: with every player on tier 3 every five is worth the same and
the term is identically zero. `test/fuzz.test.js` asserts a flat roster plans
byte-identically under all four shapes, and that no shape ever widens the
minutes spread.

**Levels never leave the planning screen.** Not the printed card, not bench
mode, not the shared PNG, not analytics. That is a product decision about
children, not a technical one, and `test/leak.test.js` enforces it at the
source: `card.js`, `gamemode.js` and `share.js` may not reference `tier` at all.
The UI is `balance.js`, split across two screens because the two halves have
different lifetimes: `levelMeter` sits on the **Team** screen — since #31 in
one player's own sheet rather than in a strip under every name, because a level
lives on the player and is a season-long judgement — and `renderBalance` sits
with the **plan** (the shape is per game, stored as `game.balance`). The balance shape
is chosen on a level-2 page inside the Plan sheet (#28); `renderBalance` paints
that page and no longer checks a fold. When every player is on the same level,
the page's hint text ends with a button, "Open Team", which closes the sheet and
goes to the Team page (#148, W4) — the same pattern as `rosterCta`.

The meter drags. Pointer handlers on `.bal-steps` read the level from the row's
own geometry, so a finger can wander off the strip and still be understood, and
`touch-action: pan-y` lets a vertical drag scroll the page while a sideways one
reaches the handler. Painting is synchronous and in place during the drag with
the re-solve deferred to `pointerup` -- re-rendering the list mid-drag would
rebuild the button under the finger, which is the trap `PLAN_ONLY` exists for.
One `fx.tick()` per level crossed gives it detents on Android.

It is also a real radio group from the keyboard, which it was not until
2026-08-25: Space or Enter selects the focused step, the arrows move selection
and focus together so a screen reader can never announce one level over a meter
showing another, and a roving `tabindex` keeps the group to one tab stop
instead of five per player. The key-to-level decision is `levelFromKey` in
`balance.js`, kept pure so `test/level-keys.test.js` can exercise every key
without a DOM. There is deliberately **no `onclick`** on a step: `pointerdown`
calls `preventDefault()` and owns the pointer path, so a click handler would be
a second commit route racing the drag.
