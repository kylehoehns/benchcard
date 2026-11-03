# Design decisions: levels note and best-player choices

Split out of [design decisions](design-decisions.md), which has a size limit.
The same rule applies: a decision is kept with its alternative.

The spec was #570, part of #561. The glossary entries are **Level** and
**Extra minutes go to** in CONTEXT.md. Order's pointer line is in
[rotation order](design-decisions-rotation-order.md#mix-the-fives-557).

## One note for both stances

- **The player sheet's Level note is one text whatever the stance.** The note
  lists the four things levels do: they mix strong and newer kids on the floor,
  they decide who gets the few extra minutes if the coach picks Best players,
  they help Order build its list, and they pick the strongest five in overtime.
  It also says levels never give a kid a lot more minutes, and that they are
  never printed and never shown in bench mode. Alternative: keep two spellings
  by stance, as before. Rejected: the old note needed its second clause to
  follow the stance to stay true, and it left out Order. One text that lists
  every use is true in both states.

## Best-player choices hide while levels are equal

- **In Settings, the whole "Extra minutes go to" row hides while every player on
  the team is at one level.** The check counts the team's whole roster, not
  the players in one game, because Settings is a team setting. Alternative:
  hide only the Best players button. Rejected: a choice with one option is not
  a choice, so the row goes, and its place is taken by a note.
- **The note under Fine-tuning changes to a pointer while the row is hidden.**
  It reads: "When minutes can't split evenly, the spare sub goes to the kids
  behind on minutes. Set levels on the Team page to choose your best players
  instead." Alternative: no note at all. Rejected: a coach who sees no choice
  would not know why, or where to set levels.
- **A saved Best players keeps the row showing.** The stance is not changed
  behind the coach's back. If the coach then taps Kids behind on minutes, the
  row hides, the same as any team with equal levels. Alternative: reset the
  saved stance when levels are equal. Rejected: a choice the coach made would
  change without them touching it.
- **Order needs nothing hidden.** With equal levels, Settings no longer offers
  Best players, so the stance can be Best players only if it was saved earlier.
  Order then shows both of its options as it always did, plus the pointer line.
  The pointer follows the same question as the Settings row
  (`bestPlayersOffered` in state.js): while that row is hidden, it reads "To
  give the extra sub to your best players, set levels on the Team page."
  instead of naming a row the coach cannot see.
  Alternative: hide Order's first option when levels are equal. Rejected: a saved
  choice keeps showing, and hiding it would hide what the list is built from.
- **Plans do not change.** This is display only. The fingerprint test in
  `test/levels-570-fingerprint.test.js` pins the plans.
