# Blocked states say why

When a plan cannot be produced, the card stage explains the reason instead of
rendering an empty frame, the bench button is disabled rather than opening onto
nothing, and the timeline says what to fix. Choosing Platoon without defining
the fives used to fall through and quietly plan as if balanced — a silent
no-op is worse than a clear ask, so it is now an error that names Group 1.
Picking Platoon now fills the groups first (see
[design decisions](../design-decisions.md), #569). The error shows only after
the coach changes a group so it is not five, or empties them all.

Closers has the same trap without the blocked state: the engine only forces
anyone onto the floor once the closing group has players, so leaving "Who
closes" empty produced a plan identical to Even with nothing saying so. It
now says so twice -- an info banner in the issues list and a line under the
picker -- but stays an info rather than an error, because unlike an undefined
platoon the plan is perfectly valid. Picking Closers fills five first, so the
empty picker is left only by a coach who empties it or by fewer than five
players here.
