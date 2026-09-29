# First run

The app opens empty and asks for the coach's team rather than seeding a fake
roster, which reads like a demo. The welcome screen offers two doors — **Set up
my team** and **Try a sample team** — and both open `#firstRunFlow`, a
full-screen `<dialog>` of three steps (#36): *Who's on the team?* (a name and a
roster box), *How long is a game?* (periods, minutes each, how often to sub),
and then the coach's own first card, with Print and Share image on it. Players
are typed or pasted in any of the usual shapes (`12 Marcus Webb`,
`Marcus Webb #12`, `Devon Ellis`), or as a comma-separated list with no line
breaks (`Sam, Jo, Kai`); they are counted by `parseRoster` as they are typed,
and Next stays disabled until five of them parse.

It is the add-a-game flow's shell, down to the one painter both flows call: a
close chip on every step (the same 36px round control as elsewhere), a chevron
back button in the footer from step 2 on, and "Discard this team?" before typed
text is lost, through the same `guardClose` seam. The two dialogs stay separate
markup — what drifts between two flows is the painting, not twenty lines of tags.

**Nothing is written until Next is pressed on step 2.** Step 3 shows a real
card, and the app has exactly one card builder, which reads the saved record —
so the team is created at the end of step 2 and step 3 clones the card the game
screen has just rendered, rather than drawing a second one from the draft.
Creating it also switches to the game screen underneath the open dialog, which
is what makes "Go to the game" a plain close with nothing to transition.
Leaving before that point stores nothing at all. Step 3 has no Back, because by
then there is nothing left to abandon, and a back gesture there finishes the
flow rather than dead-ending.

A **sample team** is the opt-in exception, and it is opt-in on purpose: nothing
is seeded unless the coach asks. "Try a sample team" opens the flow with step 1
already filled — nine players and the name **"Sample team"**, deliberately not
a plausible club name — for the coach with nothing to paste, and a *Fill with a
sample team* button inside step 1 does the same for a coach who came through the
other door and found the box empty. Nine is the roster the welcome screen's own
rotation solves, so the team in the box is the team the coach just watched. It
creates no team, saves nothing and goes nowhere: the coach edits the box or
walks the steps exactly as if they had typed it, so there is nothing to undo and
no removal sentence to get wrong. The cast lives in `roster.js` as lines of text
that go back through `parseRoster`, so the sample is parsed by the same code a
paste is, and it
opens with `#frRoster`'s own placeholder names so there is one fictional cast
in the app rather than two. The six roster-size landing pages link in with
`?try=N`, and that path is the **one** that still builds the team and shows the
card — somebody who clicked "see this as a card" asked for the card, not for a
filled-in box and three steps, so it also still flashes how to remove what it
made. It is read
only when there is no team and stripped from the URL
immediately: it carries one integer and nothing about anybody, and it is not a
URL share — there is still no way to put a coach's roster in a link, and there
must not be.

The welcome screen carries Hardwood orange styling: a soft gradient band behind
the headline and buttons (#205, #231), and the phrase "The whole game" highlighted
in the app's tint color. The band uses `--tint-soft` so a saved non-Hardwood
color keeps its warmth on the welcome page — new visitors have no saved color,
and the style is Hardwood by default.

When the first-run flow finishes, a six-step **tour** runs once per device
(`state.tourSeen`, persisted, so it never repeats): the players phrase (#27),
the strategy picker, the rules and lineups phrase, the timeline, the
Timeline | Card switch, and the share button. It is a spotlight rather than a
modal — a cutout over the coach's own screen, explained in place — because
the alternative is a slideshow of a rotation they have never seen. There is
no fallback anchor any more; all six anchors show at every width. Whether a
step scrolls to its anchor is read off the anchor's computed position rather
than declared per step; a `position: fixed` one is already where it is going to
be, and scrolling to it walks the page to the top for nothing.

**How it works** (Settings → *How it works*) is the reference sheet — the strategies and when a
coach would pick each, what every rule does, how a tournament day carries over,
how to read the card (`▼` is who comes off, underlined is who just came on) and
what the app does with a roster. It is static markup in `index.html`, not
built in JS: it is prose, it never depends on state, and generating it would
only make it harder to edit. It ends with **Show me around again**, which closes
the sheet and re-runs the tour — switching back to the Games view first, since
all six anchors live there. One control opens it now — `#helpBtn`, the
**Open** button on the *How it works* row in Settings. The **?** buttons that used
to sit beside individual controls are gone, along with the `data-help` attribute
that told each one which section to scroll to (#33, W3). The scroll is a single `scrollTop` write on
`.keysbox`: `scrollIntoView` defaults `inline` to `'nearest'` and would move the
sheet sideways, which is the same bug the tour carries a note about.

**Adding a second team follows the first-run flow.** The team menu on Today
(a checkmark-marked list in a popover off the team name button) offers **Add a
team** once the team count is below the limit. Tapping it opens `#firstRunFlow`
in add-team mode: steps "1 of 2" (*Who's on the team?*) and "2 of 2" (*Here's
your first card*), with no sample team button and no intermediate settings
step. Next on step 1 commits the team (a new `newTeam` with the name, roster,
and the current team's settings copied over), makes it active, and fires
`track('team_added')`. Backing out on step 1 adds nothing. Step 2
(the card view) is unchanged from first run — **Go to the game** closes the
dialog and lands on Game 1 of the new team with the plan built and no tour.

**The Team screen is the roster the way a coach reads it on paper (#31).** The
team's own name is a large in-page `h1` with a muted *N players* under it (the
header leaves its own title off this screen for that reason — *One header, two
states* below), then one grouped list in which each player is a single button:
their number in a badge tinted with their color, their name, the word for their
level, and a chevron. Nothing in a row can be edited, so the list stays
readable at arm's length and a mis-tap cannot change a jersey number. Under it
a second group holds **Paste a list**, and **Put everyone back to the same
level** once anybody is off the default. A duplicate jersey number is a fact
about the whole roster rather than about one player, so its notice stays out
here between the title and the list. With nobody on the roster both groups go
and a designed empty state takes over — a heading, one sentence of what to do,
and both ways to do it — rather than an empty box.

When two players share a name, each is shown with a suffix: a jersey number if
one player has a number no one else in that group has, otherwise the player's
card name in parentheses — so "Maya Webb #12" and "Maya Webb (MAYW2)". This
suffix appears in every surface that displays the player's name: the Team roster
list, Who's here rows, the Timeline, the Season ledger, and the swap toast in
bench mode. The suffix is display-only and is never stored.

**Everything about one player is in their sheet.** A row opens `#sheetPlayer`:
Number, Name, Card name (with the derived short name as the placeholder, so
typing over it is plainly an override), the level meter, the note that says
what a level does, and **Remove from team**. The rows are static markup and
`openPlayerSheet` fills in the values and rewires the handlers for whoever was
tapped, so there is one set of fields rather than one per player. An edit that
only changes a word in the list — the number, the name, the level — writes that
one row back by `data-id` (`repaintRow`) instead of re-rendering: the list is
sitting right behind the open sheet and a rebuild would replay every row's
entrance. A player joining or leaving *does* rebuild it, which is the edit
that should. Removal goes through `undoable`, so the snackbar names the player
and whatever else went with them (`removalCosts`) and undo puts them back at
their old index.

**Adding is two commit sheets** (C4): nothing reaches the roster until the
confirm at the bottom is pressed, and that confirm is named for what pressing
it will do. The header `+` opens *Add a player* (a number, a name, **Add
player**);
*Paste a list* takes the shapes `parseRoster` accepts and updates a preview on
every keystroke — a count and the names as parsed, like "3 players so far: Sam,
Jo and Kai" — so its confirm reads **Add 3 players**. When two or more entries
have the same name (case and spaces ignored), a "Drop one" button appears beside
the repeat notice ("Sam is listed twice"), which removes one entry and repaints
the preview. Both spellings come from `confirmAddLabel` in `roster.js`, so
neither sheet carries its own plural rule.
Closing the paste sheet on top of typed text asks first, and the ask is *inside*
the sheet, in its own footer: a `showModal()` dialog makes everything outside it
inert, so the confirm overlay would have painted behind the sheet and taken no
taps. The seam is `guardClose` in `trap.js` — a dialog registers a callback and
`closeSheet` consults it, which is what makes the ✕, Escape, the platform back
gesture and a backdrop tap ask the same question. `closeSheets` deliberately
does not: a coach who has changed screens is not waiting to answer about a
sheet they can no longer see.

**Reordering is a mode.** *Edit* in the header swaps every row for a reorder
row carrying a drag grip and a move-up and a move-down button, each 48px, at
every width — the old rule hid the arrows below 620px and left a phone with
only the drag, which is backwards for the one device this app is designed for.
The grip takes <kbd>↑</kbd>/<kbd>↓</kbd> as well, and its accessible name
carries the position it is at ("position 1 of 11"): that path is `movePlayer`,
which rebuilds the rows so `withFocus` can restore focus by `data-fk`, and the
move is announced by that focus event rather than by a live region, which it
could not be while every announcement was the same words. The two arrow buttons
take the cheap path instead — `arrowMove` calls `rosterDrop`, which moves the
two affected nodes and splices `state.players` — because an arrow's own button
never leaves the DOM, so focus stays put and nothing needs restoring. There is
no remove in the reorder row — a row is removed from its own detail, and that
is the sheet.

Roster order is the order everything else reads in, so a row on an Edit screen
is directly draggable too: press the order column or the avatar and move it.
The handle is deliberately only those two, and only while Edit is on — the
selector is `.rrow-edit .rord, .rrow-edit .av`, because `touch-action: none` has
to be scoped narrowly or the roster stops scrolling under a thumb, and the
tapping list has no reason to be draggable at all. A press becomes a drag past 5px, so
tapping an arrow still just moves the row one slot; the click that would
otherwise follow a real drag is swallowed. A drop moves the row nodes and
splices `state.players` rather than re-rendering.

A drag near either edge of the viewport scrolls the page, easing in over the
last 60px so a drop low on the screen does not bolt. Everything the drag
measures is therefore in *document* space — `clientY + scrollY` — because the
row has to keep tracking the finger while the page moves underneath it; a
viewport-relative delta drifts by exactly the distance scrolled and the drop
lands on the wrong row. The index maths is `dropIndex()` in `roster.js`, split
out so it can be tested without a browser.

A `pointercancel` is not a drop. An incoming call, the OS claiming the gesture
or a stray second finger all end the pointer without a `pointerup`, and taking
the drop path there reorders the roster to wherever the finger happened to be
— silently, and roster order is what every other screen reads in. The cancel
aims the drop at the row's original index instead, so the row and everything it
displaced slide home and the `state.players` splice is a no-op.

One trap worth remembering: `.rrow` has `animation: rowIn ... both`, and a
filling animation outranks inline style, so its final `transform: none` was
quietly discarding every transform the drag set — the row never moved. The drag
now clears the animation for its duration (`#rosterlist.dragging .rrow`).

The row a coach taps used to be the editable one: six columns holding the grip
and arrows, a number input, a name input, an optional card-name input behind a
**Card names** toggle, a remove ✕ and the level meter, on a 368px phone. Two of
those controls were under the 44px minimum until somebody measured them by
hand — the jersey-number input, which filled a `2.4rem` column at every width,
and a level step, which got whatever the row had left and crossed under 44px
somewhere around a 360px Android. #31 moved every one of those controls into
the player sheet or the reorder row, so neither is in the list any more, and
the meter's one home is the sheet's Level row, where the strip has a whole
group's width to share out.
The lesson outlived the row: `scripts/smoke/touch.mjs` sweeps the touch check
across the app's screens and the sheets they open, at 320, 360 and 390, rather
than measuring one screen at one width — which is what let both of those live.
