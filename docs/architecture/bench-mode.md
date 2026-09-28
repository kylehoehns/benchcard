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

**#gmReset is labeled (#139).** The reset button has `aria-label="Back to the
printed plan"` and the `title` attribute is removed to avoid confusion with
the visible label.

**Filing waits while bench mode is open (#100).** A game running past midnight
must not be filed out from under the coach mid-stint. `fileIfPast` checks that
bench mode is not open before filing; when it closes, the app immediately runs
it again in case the day is now due. This keeps games from disappearing into the
season while a coach is actively using them. Games that were never started are
left out of the season; only games that were at least partially played file (#133).

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
breakpoint, where the top-left X is already an easy target.

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

Reality diverges from the plan, so a swap here **overrides** the plan for the
current stint or the rest of the game rather than re-solving underneath the
coach mid-game. Overrides persist per game and can be reset back to the plan.

There is a third scope, **"Sit for the rest"**, and it is the one case where the
app does re-solve: the picked player is out for the rest of the game and
`resolveRest` (`state.js`) asks the solver to cover the remaining stints
honouring what everyone has already played. It needs no replacement pick —
*who* is the question it answers, not a precondition of asking it. "Rest of
game" beside it still hands every remaining stint to one named kid, and that is
deliberate: there the coach named them, which is an instruction rather than an
unfairness. Measured across 162 cases the re-solve is fairer in 115 and the
same in 47, never worse, mean spread 2.7 against 6.5 minutes.

Mechanically it is the same edit a hand swap makes — fives written into
`live.overrides[k…n-1]` and nothing before `k` — so the past cannot move,
`effectiveMinutes` never forks, `#gmReset` already undoes it and the rotation
stamp already drops it if the plan moves underneath. It offers an **Undo**
rather than asking a confirm, because a coach cannot tell whether sitting
someone was right until the rest of the game has rebalanced. The fairness input
is `carryoverTargets` from `budget.js`, the same helper the season carryover
uses, with the deficit read off this game so far; `generatePlan`'s own
`carryover` argument is deliberately *not* used, because its two-stint clamp is
right between games and wrong inside one. The `minutes` and `platoon`
strategies are refused out loud — their numbers are set by hand. So is a
remainder the solver cannot cover: the toast names the rule that stopped it
(`SIT_RULES` in `gamemode.js`, keyed by the solver's own error codes) rather
than saying "one of your rules". The engine's own message is not reused there,
because every one of those sentences is written about a whole game and inside a
suffix solve its numbers are the remainder's.

Any change in bench mode makes the card in the coach's pocket stale, so the
line under the bar says how many stints no longer match it — counted against
the printed plan rather than off the override keys, since a re-solve often
rewrites a stint with the five it already had.

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
on screen.

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
roster: marking a player absent in Who's here (#27) drops any override naming
them, the same way removing them does. An override is a five the coach picked by
hand, so with one of them not in the gym it is not a lineup, and it would
otherwise ride into bench mode and onto the printed card.
