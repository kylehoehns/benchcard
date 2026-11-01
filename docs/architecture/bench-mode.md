# Bench mode

The card, full screen and live — the phone becomes the bench reference, not
just a thing that prints one. Big lineup, live minutes per player, what changes
at the next break, and stint navigation.

**Entering is a sheet, and it measures nothing.** `sheetUp` in `fx.js` drives
the whole view up from the bottom edge in 360ms on the iOS sheet curve while
the page behind it steps back to 0.94 and 0.45 — the native modal idiom, and
there is no scale on the panel at all, so the five on the floor are legible for
the whole travel. It replaced a shared-element grow that had been tuned four
separate times and still read as janky, and the structural reason is worth
keeping: `.gm` is the whole view, surface *and* type, so growing it out of a
44px button scaled every glyph from ~11% and that smear was the jank. The grow
also had to *measure* where to start from, and got it wrong twice in
production — 0x0 against a card preview that was not on screen, so the
animation silently never ran on mobile at all; and `top: 855` against an 844px
viewport when the coach beat the action bar's own slide-in. Both degraded to a
plain CSS fade, which is indistinguishable from "the animation did not run".
Nothing on the way into bench mode may measure the page again;
`test/gamemode-open.test.js` pins that. Under reduced motion
`sheetUp` declines and the CSS `gmIn` keyframe takes over, which the global
reduce rule collapses to an instant state change. A tap anywhere finishes the
transition on the spot rather than waiting it out (`armInterrupt`), and a tap
that lands on the page still receding behind the rising sheet is swallowed
rather than acted on.

**Focus never leaves the dialog (#139).** Keyboard focus always stays inside
`#gamemode`. After each action (stepping stints, swapping, sitting someone,
pressing This stint or Rest of game, or undoing), focus moves to a named target:
the incoming player's floor row after a swap, the first floor row after reset or
undo, the button that was just pressed after This stint or Rest of game, and the
appropriate step button (`#gmNext2` or `#gmPrev`) if that button was hidden or
disabled by the action. Focus uses `preventScroll: true` and does not touch
nothing that would scroll the dialog. A `gmFocus` helper in `gamemode.js` runs
after each action and picks the target by rule, falling back to `#gmClose` if
none applies.

**Stint changes are announced (#139).** A static `#gmLive` element with
`role="status"` inside `#gamemode` reads `"<title>, <subtitle>"` from
`benchHeaderText` when the stint index changes (not on open, not on a swap, not
on a repaint with the same stint). Example: `"Q1 · 4:00 to 0:00, 2 of 8"`. The
text is cleared on close so reopening does not re-announce the same change.

**Player rows carry full accessible names (#139).** Each floor and bench row's
accessible name is `"<number>, <name>, <played> of <projected> minutes"`, and
adds `", just on"` if that tag shows. Example: `"3, Ana Reyes, 0 of 16 minutes"`.
The number is omitted if the player has no jersey number. Floor rows carry
`aria-pressed="true"` when picked, `"false"` otherwise. Bench rows are `div`s
until one is picked (non-interactive), then become `button`s. Scope buttons
(This stint, Rest of game, and the scope toggle) carry `aria-pressed` matching
the `on` class.

**It holds a screen wake lock the whole time it is open.** `openGameMode`
requests one and `closeGameMode` releases it, so a coach can prop the phone on
the bench for a whole timeout without it locking mid-horn; a
`visibilitychange` listener asks again when the tab comes back to the
foreground with bench mode still on screen, since the browser drops the lock
the moment a tab is hidden. `navigator.wakeLock` is feature-detected, never
sniffed by platform (interface guideline D2, D5): where it is absent, or the
request is rejected, this is a silent no-op — bench mode opens, steps and
closes exactly as it did before, nothing shown and nothing logged.

**Toasts are reachable inside bench mode (#139).** The `#toasts` element itself
is moved into `#gamemode` when the dialog opens and moved back to the page when
it closes. The element keeps its id and identity, so `liftToasts` (which keys on
`box.id === 'toasts'`) and the trap's Tab reach still work. Sheet toasts have
a `.bsheet-toasts` element with `role="status"` created before any toast is
inserted, so they are live regions a screen reader honors.

**The page behind bench mode is inert (#305).** While bench mode is open,
every child of `.app` except `#gamemode`, `#toasts`, `dialog` elements and
`[aria-modal="true"]` overlays gets `inert = true`. When bench mode closes,
inert is cleared. This makes Chrome's full accessibility tree (which does not
honor `aria-modal` the way screen readers do) hold only bench mode and the
toasts — the same reach a keyboard gets through the focus trap. A native
`<dialog>` opened with `showModal` was not used, because the top layer would
need stacking work-arounds with the Tour and the toasts.

**#gmReset is labeled (#139).** The reset button has `aria-label="Back to the
printed plan"` and the `title` attribute is removed to avoid confusion with
the visible label.

**Filing waits while bench mode is open (#100).** A game running past midnight
must not be filed out from under the coach mid-stint. `fileIfPast` checks that
bench mode is not open before filing; when it closes, the app immediately runs
it again in case the day is now due. This keeps games from disappearing into the
season while a coach is actively using them. The carry to today (#379) waits
for the same guard. Games that were never started are left out of the season
when their day files; only games that were at least partially played file (#133).

**A part-played game says so in two places.** A reload closes bench mode —
on iOS, switching to the clock or the scorebook app and coming back is often
enough — and the coach landed back on Games with no sign a game was underway,
under a button reading "Start game", which reads as *start*. The state was
always fine; the page was just silent about it. `resumeAt()` in `live.js` is the
one answer to "is this game part-played": stint 0 is indistinguishable from
never started, and the last stint is part-played until the coach taps Finish game
(#135), so only a finished game is completely over. The game screen relabels the bench button —
"Resume · Q2 4:00", with a play icon — and the timeline draws a `.tl-now`
playhead down every row at the same point. The marker is per-track rather than
one line across the body, because the track is a middle column on desktop and a
full-width row on a phone. On Today, a part-played game floats a Resume bar at
the bottom of the screen, reading "{opponent or Game N} · {period and clock} ·
Resume", which opens bench mode at the stint the coach left off at. Both surfaces
read the same `resumeAt()` logic. Bench mode is deliberately **not** reopened on
load: a coach who reloaded *because* something was wrong would be trapped in it.

Leaving is a **thumb reach on a phone**: as well as the X in the top bar there
is a **Leave** button at the left end of the stint bar, because bench mode is the
one screen used standing up one-handed and the top-left corner is the worst
place on a 390px screen to have to reach. It is text rather than a chevron so it
never reads as a third stint control, and it is hidden above the coarse-pointer
breakpoint, where the top-left X is already an easy target. Below 18em of width (large
text, #421) it is an x icon instead, with the word kept for screen readers and
as the accessible name, so Leave, Back, the dots and Next share one row at 320px.
The bar and foot are shorter there too.

The dot strip is **a window, not the whole game**, past 12 stints. It is ~142px
wide on a 390px phone, which is about twelve usable dots; an 8×20 game has forty
of them, and drawn one-per-stint they overflowed a centered, clipped strip so that
everything past stint 11 — the current-stint dot included — was invisible. Above
twelve stints it draws twelve around the current one, dimming the dot at a
truncated edge so the strip reads as a window. The exact position is never
inferred from the dots anyway: the top bar says "stint N of M".

Two things had to go for twelve dots to actually fit that strip. A `<button>`
keeps the UA's 6px side padding even at `min-width: 0`, so each dot had a 12px
floor and the twelfth was sliced by the clip — `.gm-dot` sets `padding: 0`, and
the dots now divide whatever width the strip has instead of a fixed 12px each.
And the current dot's `scale(1.5)` circle is wider than its cell, so `.gm-dots`
carries `padding-inline: 3px` with a matching negative margin: the slack comes
out of the row's flex gap, not out of the dots.

Stints are **swipeable**, buttons and dots included. The body is
`touch-action: pan-y`, which leaves the vertical scroll with the browser and
routes horizontal moves to the app; that has to be declared up front, because a
touch gesture's scrolling behavior is fixed before the first `pointermove`
lands. The swipe drives the prev/next buttons rather than repeating their
logic, so their `disabled` state is also what marks the ends of the game — at
either end the drag rubber-bands and snaps back, and the end of the game is
felt rather than guessed at.

The next change box shows **when and who changes**, titled "Next change at 4:00"
(or "Next change at Q2 8:00" when the change crosses a period boundary). Below
the header, two columns headed Off and On list the players leaving and arriving,
by call name (a first name, with a last initial only when two players share
it). Off names are muted, On names are ink at 600: no arrows, no red or green.
The time drops the period when it matches the current stint's, because the
next break is often mid-period rather than the boundary a coach assumes.
Players who arrived at the current break carry a "just on" tag rather than a
bare glyph, and that tag always matches the previous stint's On column.

In bench mode the box is **pinned**, not part of the list (#430). It sits
between the scrolling floor and the foot, so it stays on screen at every scroll
position. The floor and the bench are the only scroller; the foot is a
normal-flow sibling below the box, not a layer floating over the list. When
the screen is full (a short phone at large text, after a swap), the "card no
longer matches" line and the Running late group shrink and scroll before the foot
moves. A toast lifts above the box in portrait, but only as far as it fits
whole on screen; a toast too tall for the room above the box sits over it, never
over the foot, until it goes.

**A tied game can go to overtime (#368).** On the last stint the Next box
offers **Tied? Add overtime** under the "Game ends at 0:00." line, and it is gone once
the game is finished. The sheet asks for whole minutes from 1 to 10. It is
prefilled with the length the team added last time, which is the team setting
`overtimeMinutes` (2 until a team has added any). The sheet also asks **Who
plays** (#369), with four choices: Next rotation, Even out, Keep this five and
Strongest five. Next rotation is selected each time the sheet opens. "Add
overtime" is one `undoable` step, "Overtime added, N min.": the minutes and
the choice join the game's overtime, the plan is solved again with the stints
already played frozen so they do not move, and the game steps onto the first
overtime stint. Undo takes all of it back, the remembered length included,
because it restores the whole snapshot. The button comes back on the last
overtime stint, and a second overtime is named OT2. Who is on the floor in
each overtime follows the choice made for it; the rules are in
[planning-strategies.md](planning-strategies.md).

Each player shows **played / projected** — minutes from the stints already
completed, then where they finish if the plan holds. Mid-game the live question
is "how much has this kid actually played", and a projected total reads the same
in the first quarter as the fourth. The bench is sorted lightest-played first,
so its order answers "who goes in next".

A swap starts with the player coming **off**, so until one is picked no bench
row does anything. Those rows are therefore not buttons at all — they render as
a plain full-width list with no borders, and the bench label reads "Bench · tap
a player on the floor to swap". When a floor player is picked, it changes to
"Bench · tap who goes on for {name}". A disabled button styled like the live one
is a trap: it looks tappable, swallows the tap and explains nothing. Dimming was
rejected for the same reason the rest of bench mode is high contrast — a dim row
in a dim gym is a legibility regression.

The floor rows go inert the same way when the bench is empty. With a five-player
squad everyone available is already on, so picking would open "Swap in for Ivy"
over an empty list — a swap UI with nothing to swap to. `renderGameMode()`
computes the bench before the floor and renders the floor as plain rows when it
is empty, and clears any stale pick, so availability changing mid-game cannot
strand the swap panel. The whole `#gmBenchSec` is hidden in that state rather
than heading an empty list: a "BENCH" label over a padded empty-state cost
~200px of nothing on a 390px screen. The sentence that replaced it,
"Everyone available is on the floor.", sits directly under the floor it
describes (`#gmAllOn`), where it reads as a fact about the five above it.

Bench rows are full width in both states rather than pills sized to the name.
A swap is one gesture repeated twice — pick who comes off, pick who goes on —
and a name-width chip made the second tap smaller than the first, smallest of
all for the shortest names. Minutes stay right-aligned so played/projected
still reads as a column down the list.

**A late arrival is marked here from bench mode (#383).** Anyone marked
**Running late** on Who's here is listed under a **Running late** group directly
under the bar, above the floor (#430), so a late arrival's **Here now** is on
screen when bench mode opens. A kid turned off on Who's here is **Out** (not
coming) until the Running late chip beside them is tapped (#504). Each player is
one compact row with a **Here now** button. The group caps its own height and
scrolls inside itself, so a long Running late list never pushes the floor off
the screen. The group is hidden when nobody is late, even when kids are Out, and
it shows on every stint, the last included. Tapping **Here now** calls
`setAvailable(g, id, true)`, the same edit Who's here makes, so the plan from the
next stint on picks the kid up. The stint on the floor does not change, and the pick in progress is cleared.
The handler runs `computeAll()` first. Stepping through stints in bench mode never
does a full render, so the plan has not been adopted yet, and without that step
the re-plan would also rewrite the stint on the floor. The change is one
`undoable`: the toast reads "{call name} is here." with an Undo, and the Undo
takes back the arrival and its re-plan together. If the re-plan has to let a kid
fixed to a stint go, the same toast says so once (#437; the rule is in
[design decisions](../design-decisions.md)). Focus moves to the next **Here
now** button, or to the first floor row when none is left. After an Undo, focus
goes to the restored player's own button. Each button's accessible name is
"Here now, {full name}".

**Someone showed up? (#504).** A kid who is Out and shows up anyway is marked
here from one quiet row below the bench, inside the scroller. It appears only
while at least one kid is Out and not late, has `aria-expanded`, and opens a
short list of those kids with the same **Here now** rows, calling the same
`hereNow`. Whether it is open survives repaints within one bench-mode visit, so
Undo of an arrival from it lands on the restored kid's button. Out and Running
late are the same to the plan: the engine reads `out` alone, and `late` is
always a subset of it.

Reality diverges from the plan, so a swap here **overrides** the plan for the
current stint or the rest of the game. A **This stint** swap then re-plans the
stints after it with `resolveRest` so minutes stay even (#247), and its toast
says the rest of the game was re-planned (#415); one Undo takes back both.
Overrides persist per game and can be reset back to the plan,
except that a pinned overtime stint goes back to its stored five and an Even
out overtime is planned again as Even out
([planning-strategies.md](planning-strategies.md)).

There is a third scope, **"Sit for the rest"**, and there the re-solve is the
whole point: the picked player is out for the rest of the game and
`resolveRest` (`state.js`) asks the solver to cover the remaining stints
honouring what everyone has already played. It needs no replacement pick —
*who* is the question it answers, not a precondition of asking it. On the
current stint only that one seat changes: the four who stay are handed to the
solver as the suffix's opening five, so one bench kid comes on and nobody else
moves (#376). If that cannot be met it falls back to a free solve. "Rest of
game" beside it still hands every remaining stint to one named kid, and that is
deliberate: there the coach named them, which is an instruction rather than an
unfairness. Measured across 162 cases the re-solve is fairer in 115 and the
same in 47, never worse, mean spread 2.7 against 6.5 minutes.

Mechanically it is the same edit a hand swap makes — fives written into
`live.overrides[k…n-1]` and nothing before `k` — so the past cannot move and
`effectiveMinutes` never forks. The sit is also recorded as `live.sat` (#412),
and that record is what keeps it through a re-plan. Every re-plan goes through
`resolveRest`, which leaves the sat kids out of the players it may use, so an
arrival, a Who's here change, a Shuffle, an overtime or a hand-off plans them
off again. If the plan moves underneath and the rotation stamp drops the
overrides, the sit is planned again from the next stint on. The sit lasts until
the coach undoes it: **Undo** on its toast does that, and so does **Back to the
printed plan** (`#gmReset`). That button stays on screen while a sit stands in a
game that is not finished, because a re-plan rewrites the sit's stints as not by
hand, and the hand-swap rule alone would hide the only way back. Reset clears
the sit and plans everyone again.

A re-plan cannot refuse over a short bench, so that case is handled inside it. If
leaving the sat kid out would leave fewer than five players, that solve puts them
back on for the fifth seat, the sit stays recorded, and the coach is told once:
"Not enough players to keep {name} sitting." Names are joined with `joinNames`
when there is more than one. The sit applies again on the first re-plan that
has five without them. Marking a sat kid Out (or Running late) and then Here now keeps the sit.

A **This stint** swap and a sit call `resolveRest` directly, not `replanRest`
(#437). If a kid fixed to a stint has to be let go for that solve to work, the
change still goes through and its own toast adds the same "Not enough minutes
left to keep {names} fixed to a stint." sentence. The rule is in
[design decisions](../design-decisions.md).

It offers an **Undo** rather than asking a confirm, because a coach cannot tell
whether sitting someone was right until the rest of the game has rebalanced. The
fairness input
is `carryoverTargets` from `budget.js`, the same helper the season carryover
uses, with the deficit read off this game so far; `generatePlan`'s own
`carryover` argument is deliberately *not* used, because its two-stint clamp is
right between games and wrong inside one. The `minutes` and `platoon`
strategies are refused out loud — their numbers are set by hand — unless the
stints left are all overtime (#368), which is planned around what was played.
So is a
remainder the solver cannot cover: the toast names the rule that stopped it
(`SIT_RULES` in `gamemode.js`, keyed by the solver's own error codes) rather
than saying "one of your rules". The engine's own message is not reused there,
because every one of those sentences is written about a whole game and inside a
suffix solve its numbers are the remainder's. An overtime the coach set to Even
out is planned as Even under any strategy (#369).

Any change in bench mode makes the card in the coach's pocket stale, so the
line under the bar says how many stints no longer match it — counted against
the printed plan rather than off the override keys, since a re-solve often
rewrites a stint with the five it already had. The count starts at the first
hand-swapped stint (#415): a played stint the attendance freeze pinned before
any swap still matches the card, so it is not counted.

This is the one caller of `generatePlan`'s `stints` input, which exists because
a mid-game remainder frequently is not describable as any `{periods,
periodMinutes}` pair — 28.6% of cut points across every format the app accepts,
and 6 of the 11 in its own 4×8 default at 3-minute stints.

Once a swap exists there are two candidate answers to "how many minutes does
this kid get", and only one of them may ever reach a coach's eyes. `state.js`
owns it: `effectiveStints` is the rotation with the coach's fives folded in and
the in/out columns recomputed, `effectiveMinutes` totals them, and every
readout goes through the pair — the card, bench mode, the timeline blocks and
totals, the detail panel, the summary line, the stint grid, the minute bars and
the across-the-day chart. Both short-circuit to the plan's own arrays by
identity when nothing has been swapped, which is every game before tip-off, so
the engine's numbers are what prints rather than a re-rounding of them. The one
deliberate exception is **carryover**, which is a solver *input*: it keeps
totalling planned minutes, because a hand swap in game 1 must not silently
re-solve game 2 underneath the coach. For the same reason the plan table drops
its "best possible is N" footnote once a swap has moved the minutes — that
sentence is a fact about the solve, and the rotation it describes is no longer
on screen. The same rule now covers the spread note under the timeline (#414):
once the minutes have moved, or the game is finished, the engine's spread note
is replaced by one built from `effectiveMinutes`. An uneven spread names the
players who play least and the minutes they play; an even one says what every
player gets. Neither has a reason or an action, because both were about the
solver's choice. The same moved minutes also drop the note that the spread
was held back by the rules, and any missed-minimum or over-cap warning about a
player whose minutes changed. While nothing has moved the engine's note stays
word for word (`movedMinutes` and `minutesNote` in `state.js`).

Below the minute bars the plan also names the **longest unbroken sit** — the
most minutes any player spends on the bench in one go, read straight off
`stints[].sitting` by `longestSit` in `plan-view.js`. Even minutes are only half
of what a kid feels, and the other half went unsaid: at a change limit of 3 the
worst run in a game is twelve minutes or more in 43% of solves and reaches
twenty, and at 5 it tops out at twelve with the same spread and, in 179 of 200
cases, the same minutes to the decimal. So when the run is longer than a third
of the game and `maxSubs` is below 5, the sentence names the lever. It is
deliberately **not** an engine issue code: the trade is one a coach is entitled
to make, and a red row would call it a failure.

A stored override that no longer names five real players is discarded on load
— a stale one is worse than none, and "real" means present as well as on the
roster: marking a player Out in Who's here (#27) drops any override naming
them, the same way removing them does. Setting Running late does not touch overrides. An override is a five the coach picked by
hand, so with one of them not in the gym it is not a lineup, and it would
otherwise ride into bench mode and onto the printed card.
