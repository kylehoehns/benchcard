# Rules are additive, not tabular

A grid of ten min/cap boxes is mostly waste — a coach sets a limit on one or
two players a game. Nothing shows until a rule exists, each rule reads back as
a plain sentence chip ("Kade capped at 12 min", "Jack / Jackson apart"), and
adding one starts from a row of rule types rather than a form. The starting
five and last-period pickers reuse the same tap-a-player control as closers.

**Rules are also editable in place (#148).** Tapping a rule's chip opens its own
page with the same controls Add a rule shows (without the kind choices, because
a rule's kind does not change), and each change applies immediately. Half-done
picks — one player in a pair, no players in a five — are not applied until the
pick is complete, and the stored rule keeps its last whole value. A pair that
matches another rule of the same kind reads "You already have this rule." on the
page and is not applied. Removing a rule or changing one raises an undo toast
naming what happened — "Changed: Eli plays at most 24 min" or "Removed: Eli
plays at most 20 min" — for nine seconds; the snapshot is taken once per visit,
on the first applied change, so tapping the stepper four times to change 20 → 24
shows one toast and one undo. Leaving the page clears the snapshot.

The collapsed row says which of the two it is. With rules set, `#conscount` is
a count in an accent pill; with none, it names what the section holds
(*minutes, pairs, starters*) in muted type — `.count.zero` unsets the pill,
because an empty state rendered as a badge reads as an alert about something
the coach has not done. It says nothing at all only when there is no roster,
because a "0 of 0" count would be empty noise.
