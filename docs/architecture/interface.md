# Interface

**Today is home; there is no tab bar (#23, N1).** The app opens on Today: the
active team's name as the large title and team-switcher button, a gear for Settings, multiple days stacked in date order each with its own heading and games (each day's games shown in tip-off order, #102), then Team and Season as two entries underneath, and Add a game. When the team has no games (#126), the games section shows a note instead of any days, with Add a game still present.
A day files itself into the season once it has passed (#100), but only when
the coach has set up a team (#252) — there is no "New day" button any more.
When the app reopens on a later day and the Day the coach was on files, it
lands on Today with the Filing toast rather than the last screen (#306); Undo
goes back to that screen. A same-day reopen still restores the last screen.
Game, Team, Season and Settings are each one screen away from
Today rather than siblings on a nav — opening one pushes a browser-history
entry, so the back button, the browser's own back and Android's back gesture
all land back on Today, through the one path `setView` (render.js) owns. The
split that used to be *policy vs plan* across three tabs and a cog is now
*what changes between games* — games and days, Team, Season, all reachable
from Today — versus *what is set once a season* — Settings, behind the gear
that only ever shows on Today (N4). All controls in the Today header are at
least 48 pixels (#69).

**Adding a game asks three questions (#32).** *Add a game* on Today used to drop
a copy of the last game into the day and leave the coach on the game screen to
fix whatever the copy had guessed wrong. It now opens `#addGameFlow`, a
full-screen `<dialog>` that covers everything including the action bar (N8,
C10), and asks what actually differs between this game and the last one: *Who
are you playing?* (opponent and tip-off), *Who's here?* (one tile per roster
player, three across, carrying the last game's answer, where tapping a tile
toggles that player to Absent against a running count), and *How should minutes
split?* (the four strategies with the one-line descriptions `STRATEGIES` holds,
over the *Even out earlier games* switch `rules.js` builds for the Plan sheet).
It is still one tap when nothing differs: step 1 carries a *Same as 9:00?* card
whose summary line comes from the same `sentenceParts` a game pass reads. The
card is the whole button — tapping anywhere on it commits the draft — with
*Add game* as right-aligned ink text. `newGame(len, lastGame(), settings)`
builds the draft when the flow opens, and tapping the card and **Plan it** commit
that same object, so the shortcut and walking all three steps unchanged cannot
land on different games.
When the team has no games (#126), there is no last game to copy: the draft is
`newGame(0, null, settings)` dated today, and no *Same as …?* card is offered.
The draft stays detached until one of them is pressed — a half-answered game is
not in `state.day.games`, so it never paints on Today, never reaches storage and
is never what an undo snapshot catches.

**Back walks that flow rather than throwing it away.** `showModal()` fires a
cancelable `cancel` for Escape and for Android's back gesture alike, so
`oncancel` prevents the close and steps back one, and from step 1 asks to leave.
A gesture is never the only way to do something (I3): a round close chip sits top
left on every step (N5, C10), styled as the same 36px control `#backBtn` uses but
with a close icon. A chevron back button joins the primary button in the footer
from step 2 on, within thumb reach (I2). Closing with an opponent or a tip-off
typed asks "Discard this game?" first, through the same `guardClose` seam and
in-dialog ask row the paste sheet uses.

**One header, two states.** `.bar` floats above content with no border or opaque
background (L2, L3). Instead of a line, a `::before` scrim fades using
`backdrop-filter`, and both fade under `prefers-reduced-transparency: reduce`,
`prefers-contrast: more`, or where `backdrop-filter` is unavailable (#33).

The bar holds `#keysHint` and the gear on Today, and `#barBack` (a round chevron button with an accessible name "Back to <team name>") on other screens, toggled by
`applyView` with the `hidden` attribute — never both, because a coach is always
on Today or exactly one screen away from it. The team menu (`#teamBtn`) moved from the bar into Today's large title.

The bar's title is a centered overlay, `#barTitle`, positioned absolutely inside
`.bar` and `pointer-events: none` so it takes no space in either half (#33
decisions 3–5). On the four screens that own a large title (Today, a game, Team,
Season), the overlay's text is copied at runtime from whichever element carries
`data-large-title` in the view's `<main>` — a single source of truth that stays
honest when a coach renames the team in the roster. On Today, the large title is the team name and also the team menu button (`#teamBtn`). Settings has no large title,
so its bar title reads the static `data-bar-title` on its `<main>` and is shown
at all times. An `IntersectionObserver` in `render.js` (`watchLargeTitle`)
watches the view's `[data-large-title]` element and toggles `.bar.title-in` as
it slides under the bar, fading the overlay in or out. The observer's `rootMargin`
is shrunk by the bar's measured height so exactly one title is always on screen.

The bar title's width is measured, not guessed (#33 decision 4): `render.js` runs
`measureBarSide`, which measures how far the outermost control in each cluster
reaches in from the bar's own edge, takes the larger of the two and writes it as
`--bar-side`. The overlay's `inset` is set from that, so its box stops short of
the buttons on either side instead of sliding under them on a narrow phone. It
is an edge distance rather than a sum of button widths on purpose: padding,
flex gaps and margins are all inside the number that way, and none of them can
be forgotten. The heights of the bar and action bar are measured
into `--bar-h` and `--ab-h` to feed `html`'s `scroll-padding-top` and
`-bottom`, so focus never lands under floating chrome (#33 decision 14).

**Tab title and focus after navigation (#139).** `document.title` is set to
`"<heading> · Benchcard"` on pushed screens (Game, Team, Season, Settings) and
to the home page's title `"Basketball rotation & substitution planner | Benchcard"` on Today,
read from the same `data-large-title` or `data-bar-title` source `#barTitle`
uses. When navigating forward, keyboard focus lands on the new screen's `h1`
(`tabindex="-1"`), with `preventScroll: true` so the focus does not trigger a
scroll. When going back, focus returns to the control that opened the screen —
a game pass, the Team or Season entry, or the Settings button — matched by game
id if the node was rebuilt. If the door is gone or hidden, focus lands on Today's
heading instead. Callers like the add-game flow that focus a specific field
after navigation override the default. The focus works through `applyView`
and `syncBarTitle` in `render.js`.

Five header controls became translucent chips (#33 decision 9): `#backBtn`,
`#shareBtn`, `#settingsBtn` and `#teamAdd` are 48px hit areas around a 2.25rem
circle, and `#teamBtn` is the same treatment as a pill, because its content is
the team's name rather than one glyph. All five use `--r-full`, a
`color-mix` fill over `--chip` (its own token, not `--surface-2` -- see
tokens.css, #137) and a `backdrop-filter`, and all five go flat and opaque
under reduced transparency, more contrast, or no `backdrop-filter` support.
`#teamEdit` and `#seasonExport` stay plain text with no chip (decision 10) —
a screen's chrome tops out at two filled controls or it reads as a toolbar.

The right of the bar carries at most two actions per screen (C1): the share
button on a game, the export on Season once there is a file to save, and *Edit*
plus `+` on Team. Each is hidden by `applyView` the same way, on the one view
it belongs to.

**Print stands on the games view only.** It is the one control in the bar that
belongs to a single view: Games is the only place printing means anything, and
standing over Settings or Roster it reads as "print *this*" — the settings, the
roster — when the only thing this app has ever printed is the card. So
`applyView` hides it the same way it hides the phone action bar, with the
`hidden` attribute rather than a rule of its own. It is hidden, never removed:
`card.js` sweeps `[data-needs-card]` to disable everything that prints or
shares while the plan is blocked, and that sweep — plus the test that discovers
those controls from their handlers — needs the node to exist. At 320px, where
the bar wraps to two rows, that hands 49px of height back on three views of
four. <kbd>P</kbd> stays live everywhere regardless, because `printCard`
switches to Games before it prints; a key that dies on three views out of four
would be worse than no key.

The tab budget this used to measure is retired along with the tabs: Today's
header carries the team button, the keys hint and the gear, and every
other screen carries only a back button and a title, so there is no longer a
row of sibling controls competing for the same 390px.

**Settings is three grouped zones.** The layout matches Team: grouped rows
(`#view-settings .pgrp`) with section headers as `h2.pgrp-h`, at most one
footnote per group as `p.pgrp-f`. Groups sit 16px from the screen edge, and
Settings indents headers and footnotes a further 1rem so they line up with
the row text (32px in all). The top zone is headed
with the active team's name and holds team-specific settings. The middle zone is
headed *Benchcard* and holds Appearance, How it works (with **Show me around
again**), About, Contact and Buy me a coffee. The bottom zone is headed *Backup
and restore* and holds file and paste backup controls. The heading is the scope,
so a coach with a rec team and a club team never has to remember which one a
setting landed on. Deliberately one surface rather than two: "where do I save my
stuff" should not require knowing whether saving is a team thing or an app thing
before you can find it. Putting Appearance and the help sheet first is also what
makes the page legible — a settings surface whose only contents are abstract
policy is undiscoverable.

The team zone opens on a group of the team's own name (`#teamName`) and
**Team color**: one of nine choices
(Hardwood, Graphite, Royal, Navy, Maroon, Red, Forest, Gold, Purple), each with
a swatch. Hardwood is the default; Graphite is the neutral choice and the ink
itself; the other seven tint the primary buttons, tappable phrases and selected
states so two teams read visibly different at a glance. A picker dialog opens on
tap, and the picker marks the current color and applies a new one instantly. The
color is stored per team, so two squads with two colors stay visibly different
when you switch between them. The tint follows the theme — each color has a light
and a dark value — and the `--tint*` tokens live in `tokens.css` alongside the
`--accent` neutrals (#21).

The second group holds the game format (**A game is**: periods and minutes
per period) and **A new game starts**: whether each new game opens with the
"Even out the season so far" switch on. Its footnote says these shape what a
new game starts as, and that any game can be changed from its own screen.

The third group holds **Players changing at once** (1–5, default 3, `maxSubs`),
**The odd minutes** (who gets the high side when the clock does not divide
evenly), and **Everyone plays at least** (league minimum minutes, default 0).
These three settings live together because they shape who plays, and the
group's one footnote is the `maxSubs` read-back below. `maxSubs` has
always existed in `engine.js` and was invisible to a coach until it moved here.
It is a *preference*, and the copy says so, because the solver treats it as one
— see the design note below. Five bare digits read as a rule, so the control
carries a **live read-back** (`#maxSubsRead`, written by `renderSettings`):
one sentence per option, naming what the solver actually does with the number.
The sentences are a RANGE rather than a count, and that is not a stylistic
choice — there are two bounds and only one of them is on screen.
`DEFAULT_MIN_SUBS = 1` pulls toward at least one change per break with a cost
of 20 a change short (`engine.js:1092`), exactly as `maxSubs` pushes against
the top at 40 a change over (`engine.js:1091`); `minSubs` is exposed nowhere,
so it is the same 1 under every option. Neither bound is hard — `repairChurn`
gives up when no legal swap exists, and it clamps the floor to
`avail.length - ON_FLOOR`, so a five-player squad changes nobody — which is
why every sentence hedges with "aims for". At 5 the ceiling is unreachable
(`ON_FLOOR` is 5, so `subs > 5` cannot happen and the over-cost can never
fire), so that option alone says "no ceiling" — and deliberately does **not**
say "no limit", because the floor is still pulling and a promise about both
bounds would be false.

The fourth group holds **Remove this team**, the zone's one destructive
action, with a footnote (`#teamCount`) that reads "2 of 3 teams" when there
is more than one. The longer explanations that used to sit under each Settings
control now live in How it works, in its "Settings" section (#142).

The hero is a **rotation timeline** — players down the side, the game clock
across, color-coded blocks where each is on the floor. Blocks are positioned
by elapsed minutes rather than stint index, so unequal stint lengths land in
the right place, and consecutive stints merge into one block so a long run
reads as a run. Fairness, back-to-back sits and the closing group are all
visible at a glance in a way a table of rows never made them. Blocks are flat
(no gloss or opacity overlay) and sized from the token scale (#69).

Each row ends in that player's total minutes, and the highest and lowest totals
in the squad are called out — in words (`MOST` / `FEWEST`) as well as color, so
the judgement survives color blindness and a screen reader. A callout is an
outlier, so an end is only named when it is a minority of the squad — at most a
third. Twelve players splitting 16/12 four-to-eight names the four who lead;
fifteen splitting 16/8 ten-to-five names the five who are short, not the ten
who are not. When neither end is small enough — an even plan, or a 6/6 split —
nothing is tagged and the gutter collapses rather than shouting at every row.

Players carry identity: a color from a perceptually even hue set (lightness
and chroma themed once, only the hue varies per player), used in the squad
pills, the timeline, the budget sliders and the day chart. The stint-by-stint
table still exists, demoted to a disclosure. Full names show at the secondary
type size, and the timeline no longer has a box around it (#69).

Period dividers are now 3px gaps in the track color, appearing as notches cut
through both blocks and empty track (#69). The period labels above the track
read in a quiet, muted footnote size with no uppercase — they introduce the
track, not interrupt it. When the timeline is narrow (320px with large text) the layout stacks:
player name and total on one line, track underneath. Once the timeline itself is about 20em wide (a container query, so a 390px
phone qualifies) it lays out one row: name, track and total side by side. At
about 34em the name column widens again for desktop.

The timeline's row itself is a plain container, not the button. Each player's
name is a real `<button>` that opens the player's minute breakdown; tapping it
again closes the panel. The row pitch in the one-row layout is 2.25rem (36px at
the default text size), tall enough for nine players to fit above the action bar
on a 390×844 phone. In the stacked layout the button is 48px tall, meeting the
minimum size guidance. Both Enter and Space open the breakdown, since it is a
native button rather than a hand-rolled control. When a coach closes the card
with the × button or with Escape, keyboard focus returns to the player's name
button (#232) so the coach does not lose their place in the list — a keyboard
or screen-reader user reads the card, closes it, and Tab carries on from where
they were instead of jumping to the top of the page.

Theme follows the phone. `auto` is the default, and it is resolved to a real
`data-theme` value — by a small inline script before first paint, and by
`applyTheme()` once the state is loaded — because the dark palette hangs off
`:root[data-theme="dark"]` with no `prefers-color-scheme` rule behind it. The query
is watched, so a phone that turns dark at dusk turns the app with it; an
explicit light/dark choice still wins, and `theme-color` follows the resolved
background.

**The first frame.** The same idiom decides which VIEW paints and which TINT.
`#view-today` is the one view that ships visible (#23), so a first-ever visitor
used to paint the Today shell and watch it flip to the welcome screen a beat
later. A pre-paint script stamps `data-boot` on `<html>` with the view the boot
is going to land on, and another stamps `data-tint` with the active team's color
(#25); `app.css` hides the Today shell (and the bar and the foot) and reveals
that view for its stamp, and the token blocks apply for the tint. `applyView`
removes `data-boot` the first time it runs; `data-tint` stays, because
`applyTint` owns it from then on and rewrites it on every render. It resolves the WHOLE
view, not welcome-versus-Today: a coach who left the app on the open game, Team,
Season or Settings watched the same flash one view along — Games lost the
"ships visible" seat to Today and gained a stamp of its own. **Today is stamped
as nothing at all**, deliberately — it is the markup default, so a throw in the
script degrades to that default screen instead of a blank frame. Graphite tint
is also stamped as nothing (no `data-tint` attribute), as the base look in
`tokens.css` — Hardwood is the default when no color is saved, so a coach
setting up for the first time or starting a new team sees Hardwood from the
first frame. Shipping `#view-welcome` visible instead would only move the flash
onto the returning coach, who loads the app far more often. The script walks `loadState`'s
whole key chain — the v6 backup, v5/v4/v3 and both legacy keys — and repeats its
three acceptance clauses, because a cheaper check that disagreed would flash the
welcome screen at a coach whose primary record is gone but whose backup is fine.
`test/first-paint.test.js` runs the real script beside `loadState` and fails on
any disagreement.

The card is presented as a physical object on a lit stage rather than as a
sidebar thumbnail.

The UI takes the phone's own system font stack; **Inter Variable**, vendored,
loads only for the printed card's face — one file covers every weight the card
uses and renders identically on Android and Windows instead of falling back to
Roboto or Segoe (#21). Icons are **Lucide**, with only the path data extracted into `icons.js` rather
than shipping a runtime — one entry per name in `vendor/fetch.sh`'s list, held
to it in both directions by `test/dead-icon.test.js`, so an icon nothing draws
stops being downloaded in the same commit. Motion drives eased transitions,
staggered entrances and FLIP reordering, all on the one easing curve (no
bounce); continuous interactions like dragging a minute slider deliberately stay
on CSS transitions. Actions a coach repeats many times a minute (a switch, a
checkbox, a player chip's avatar) change state with no transition at all (#151).

The UI's own type follows the phone's text-size setting rather than a fixed
scale (#24): `body` and every text size in `app.css` is one of the seven
`--fs-*` tokens `tokens.css` declares, `inherit`, or (a screen's own large
title, inside the narrow-screen block) capped against the viewport —
`interface-guidelines.md` T2 lists the scale and the platform gate that gets
the root itself to follow the reader's setting. The printed card is exempt:
its sizes (in `card.css`, and the ones `card.js` derives from canvas
`measureText`) do not move with the reader's setting, only the screens around
it do. The smoke suite verifies this in two passes: `applargetext` checks that
everything fits on screen at 320px wide with 32px text, and `clipsweep` verifies
that no text is cut off by its own box, squeezed narrower than its longest word,
split mid-word, or hidden under another element — things that stick out past the
screen edge alone might not catch. Read `docs/specs/179-clip-sweep.md` for the details.

One consequence worth knowing: the printed card is auto-fitted from canvas
`measureText`, and the constraint that follows from it — the measurement font
stack matching `.card`'s exactly, and the re-fit on font load — is a trap
`AGENTS.md` owns and this file does not restate.

Motion, color and touch behavior run off tokens in one place: one easing curve
(`--ease` in CSS, `EASE` from `fx.js` in JS), four durations, a neutral gray
palette with ink as the primary tint, a `prefers-contrast: more` variant, and full light/dark (the
base look with no attribute, #21). A team's color (Hardwood, the default, through
Purple) overrides that neutral tint on the primary buttons, selected states and
tappable phrases (#25); each color declares its own `--tint*` tokens for the
current theme, and `applyTint()` stamps `data-tint` on `<html>` so the CSS
blocks apply — the same pattern as `data-theme`. `prefers-reduced-motion` disables all of it, and
**the preference is watched, not sampled** — a phone can flip it from Control
Center mid-game, so `fx.js` exports `enabled` as a live binding and re-reads
the query on `change`. That gating is not decoration: the CSS
`@media (prefers-reduced-motion: reduce)` block can only neutralize CSS
animations and transitions, and everything discrete here (Motion, the timeline
block FLIP) runs through the Web Animations API, whose timing lives on the
animation object where no media query reaches it. Turning the preference on
therefore also finishes whatever is mid-flight. Two related traps: setting
`transition-duration` on `*` also catches every property change on every
element, because `transition-property` defaults to `all` — harmless at
0.01ms, but it is why a reduced-motion page reports dozens of live
`CSSTransition`s; and an explicit `behavior: 'smooth'` passed to
`scrollIntoView` beats `scroll-behavior: auto !important`, so that call site
asks the preference itself.

**Keyboard shortcuts** exist for the desk half of the job — planning the day
before you leave the house. <kbd>P</kbd> print, <kbd>S</kbd> shuffle,
<kbd>V</kbd> Today ⇄ Team (any other screen goes back to Today first, #23),
<kbd>B</kbd> open bench mode, arrows to move between stints there, <kbd>?</kbd>
for the list, Escape to close. Each key clicks the button it names rather than
repeating its work, so a disabled or absent control is already the answer for
the key too. *Disabled*, note, not
*hidden*: a programmatic `.click()` fires on a hidden element and is stopped
only by `disabled`, which is why <kbd>P</kbd> still works on the four screens
the Print button is not on: it lives beside the card, inside the game screen,
so on Today, Team, Season and Settings the button <kbd>P</kbd> clicks is
inside a hidden `<main>` — and `printCard` switches to the game screen before
it prints, so the key lands on the card rather than spooling whatever is on
screen. Print going `disabled`
whenever the plan is blocked is what stops <kbd>P</kbd> from spooling a page of
furniture with no card on it, and Shuffle is `disabled` on the same flag, since
`analyzeFeasibility` runs before the seed is used at all: a blocked plan is
blocked for every seed, so <kbd>S</kbd> could only reshuffle nothing. They are
inert while a
field has focus, and behind the shortcuts sheet.
The `?` hint sits in Today's own header and only appears on a fine pointer at
≥760px — on a phone it would advertise something the coach cannot press.

The **minute sliders move only themselves.** Auto-redistribution meant fixing
one shoved another, and the coach ended up chasing values around the list.
Instead a meter shows where the allocation stands — under, exact or over, with
the delta in minutes — and "Even out the rest" shares the remainder when they
are ready. A budget that does not add up is guidance, never a blocker: the
solver gets as close as it can and reports the shortfall.

That shortfall used to be reported only in aggregate, which hid the sharpest
version of it. **A hand-set number is handed to the solver intact only when the
targets add up to the whole floor budget.** Short of that, the missing minutes
still have to be played by somebody, and the solver spreads them — dial one
player down to 4 minutes of 160 and leave the rest alone and that player plays
16. So each budget row now says what the plan actually gives it (`4m` /
`plays 16`) whenever the two disagree, and the row's lock is described as what
it is: it holds the number against "Even out the rest", which is the move that
makes the budget exact and the number real. Whether the solver *should* protect
an under-budget target instead is a live question; until it is answered, the
app states the rule rather than hiding it.

The **timeline reconciles rather than rebuilds**, so blocks are the same DOM
nodes between renders and their left/width transitions actually run. Move a
slider and the rotation visibly redistributes. Rebuilding would drop the
previous value and leave the transition nothing to animate from.

Two rendering rules do most of the work:

- **A section never repaints the container being interacted with.** A blanket
  repaint destroys the input under the caret; on a phone that dismisses the
  keyboard mid-word. Sections repaint independently, and a focus restore keyed
  on `data-fk` catches anything that slips through.
- **Controls that own live state mutate in place.** Rebuilding a range input
  under the coach's finger loses pointer capture and kills the drag, so the
  budget rows update their values, fills and totals without touching the DOM
  structure.

On a phone the layout puts the card *directly under the rotation it describes*
— the card is the product, so it should be what scrolling reaches, not the tail
of the page. Below 1100px the two columns dissolve into a single flex list
(`display: contents` on `.col-main` / `.col-side`) and each block carries an
explicit `order`. The sentence sits above that list at every width, and since
#27 it stands in for the Squad and Game format blocks the list used to open
with. The rotation reads first (#69), directly after the sentence, where a coach
opens the phone to see the plan; the day heading starts the *This game* section, then the Plan sheet (#28, which holds the
strategy, rules, lineup balance and evening out), and then *This game* (date, opponent,
day name, tip-off, remove); card head, card and the bench button slot in after the
timeline, and Stint-by-stint and Card options fall below. The Plan sheet
replaced the Plan, Rules and Lineup balance folds that used to read at positions
3, 11 and 4 — putting the strategy, constraints and evening-out controls in one
place, opened at full height. The flex `gap` is zeroed there — the blocks already
carry margins, and a gap double-counts every seam. The rule is `@media screen`,
so the print path, which flattens everything through `.print-path`, is untouched.

Touch minimums (48px) are gated `@media (pointer: coarse), screen and
(max-width: 620px)`. The pointer half alone was a trap: it never fires in a
resized desktop browser, so nothing behind it was ever exercised in testing.
The controls #69 restyled on Today and the game screen hold 48px at every
width, and the smoke check `today and game controls ≥ 48px` sweeps them.

**Destructive actions are undoable, not confirmed.** Removing a player,
removing a game, starting a new day, clearing in-game changes, editing a game
while it is underway, editing or removing a rule, removing a unit from the Platoon editor, and changing a player's level all happen immediately and raise an undo toast for nine seconds. A `confirm()` asks
at the wrong moment — before the coach can see what it did, and a game removal
is only judgeable once the rest of the day has rebalanced. When a game is
part-played, edits split into two paths (#134, #247):

- **Format and substitution changes.** An edit to period count, period minutes, or Sub interval rebuilds the rotation: the coach's hand swaps are dropped (if any), and the played minutes are rewritten. The snackbar offers Undo to restore the periods, the swaps, the current stint and the minutes as they were.
- **Attendance, rules, strategy or Shuffle.** An edit to roster presence (Who's here), rules, planning strategy or the seed keeps the stints already played and the one on the floor, and re-plans only what comes after. No toast appears unless a hand swap in the re-planned stints was replaced. The Set minutes and Platoon strategies cannot re-plan part of a game, so they take the path above.

The snapshot is the whole of `state`: a day is a few
KB, and a per-action inverse would have to know that removing a player also
sweeps their id out of every game's out-list, constraints and carryover. `state`
is a `const` binding everything closes over, so a restore refills it in place
rather than reassigning. There are no `confirm()` calls left in the app.

**Bench mode traps focus.** It sits on top of the page rather than replacing
it, so without a trap Tab walks into the form underneath.

**Bottom sheets are `<dialog>`s, so they need no trap (#73).** `showModal()`
already inerts the page and keeps Tab inside. `openSheet` only adds what it
leaves undone: focus lands on the sheet's title (an `h2` with `tabindex="-1"`),
not the handle, so no ring flashes on a tap; Tab reaches the handle next, whose
ring is drawn on its visible pill. Closing returns focus to the phrase that
opened the sheet. Motion is transform and opacity only: the sheet slides down
while the backdrop fades, half and full height animate, a release looks at
speed (0.5 px/ms over the last 100ms) as well as distance, a drag past the
edge rubber-bands, and the backdrop follows the finger. Reduced motion closes
at once. The release math is pure and tested in `test/trap.test.js`.

Mobile specifics that came out of real use:

- **Today's games are game passes (#26).** A coach opening the app on a
  tournament morning sees them stacked in tip-off order (#102): each shows when it tips off, the
  opponent, and the game's status (#92): Underway (accent) if the game is part-played, Planned
  (green) if the plan is ready, or Needs a fix (amber) if the plan is blocked. Each pass shows
  a small picture of who plays when and for how long (one row per available player,
  `aria-hidden` since it is not a roster list), and a line of setup — player count, strategy,
  any rules, and whether it evens out later games. A blocked plan has no picture. Tapping opens
  the game screen.
  Each pass is a card: neutral surface with 20px radius, no border, with 0.75rem
  gap between them (#69). The status color is shown as a dot only, not the text
  color. Tip-off time, opponent name, and summary are sized from the type scale:
  secondary, large, and secondary respectively. The mini rotation rows (who plays
  when) use the track color for off-floor stretches; the gaps between periods stay
  transparent.
  The stack replaced a strip of tabs (#23) that had to cap a label at 20
  characters. A pass has no such cap: `.pass-title` wraps at large text sizes
  (320px with 32px text, #66/#187) to keep every team name whole, and truncates
  with a tail ellipsis when a single word is wider than the available space
  (#187), keeping the full label in the pass's accessible name. `.pass-summary`
  wraps at every size instead of ending in an ellipsis (#66).
- **Squad pills elide the same way, and for the same reason.** `.plr .nm` is
  capped at 15ch, and a tail ellipsis cut the surname off — two kids with the
  same long first name became two identical pills for the tap that decides who
  plays. `fitPills()` in `pills.js` runs `elideMiddle` (`state.js`) — the same
  middle cut the card's own header uses — but sized by measurement instead of
  a character count, because 15ch is a different number
  of letters for "Willi" than for "Ilinca". The measuring is done on a canvas,
  so a squad of fifteen costs no layout, and the full name stays as the pill's
  `aria-label`. The picker grid ("pick five") goes through the same function; it
  builds its grid detached, so the fit retries once on the next frame. The CSS
  `text-overflow: ellipsis` stays as the backstop.
- **At five available the banner says "nobody comes off".** The engine's answer
  is "minutes divide evenly", which is true and is not what a coach with exactly
  five kids wants confirmed. The extra info alert is added in `renderIssues()`
  rather than the engine — it is a fact about attendance, not about the solve.
- **An empty roster is a starting point, not an error.** `noRoster()` (a
  literally empty `state.players`, nothing else) swaps the games view's red
  "Only 0 players available; you need at least 5" and its "resolve the errors
  above" for the roster view's own empty state plus **Add player** / **Paste a
  list**, and drops the "Squad 0 of 0" scoreboard. The buttons `.click()` the
  Team screen's own first-run buttons rather than reimplementing them — the two
  controls that are on screen while the roster is empty, which is the only time
  this branch runs. A squad that is genuinely under strength — 4 of 11 present —
  still gets the red error with **Add players** (which opens the Team screen with
  Paste a list already open), because there it is the right message and the
  control that fixes it.
- **A blank timeline always offers a way out of itself.** "Resolve the errors
  below" is only useful if the coach can reach the control that caused them. The
  Plan sheet opens at full height, so `timelineEmpty` reads the plan's issues:
  a rules-caused error (`RULE_ERRORS` — minimums, caps, pair/avoid conflicts,
  pinned fives) adds **Fix the rules** (opens the Plan sheet at the Rules group),
  Platoon without a unit adds **Fill a unit** (opens it at the top), and an empty
  roster gets the roster CTA. Both buttons go through `jumpToEditor()`, which
  opens the sheet before scrolling. Errors fixed elsewhere (not enough players,
  closers, unit sizes) get no button, because their control is already on screen.
- **The Sub interval is a list of rows, not a `<select>`.** Eight long
  options in a native picker fills a phone screen for a one-tap decision. One
  builder draws that list (`paintGranRows` in `game-setup.js`), for the game
  screen's own sheet and for step 2 of the first run — the two used to be the
  same eight choices drawn twice, once as rows and once as chips (#36).
- **Destructive actions leave the day's own list.** "Remove game" sits in the
  game screen's own header behind Undo, not among the day's games on Today.

## Hand off

The **Share sheet** opens from a tap on the share button and presents two
segments: **Print card** and **Hand off**. Print card is selected when the
sheet opens, showing the card preview, print and share image buttons, and the
print settings; switching to Hand off swaps the body in place to show the hand-off
interface, which builds a link from the game, its roster and its stints (`encode` in
`handoff.js`), and presents it three ways: a QR code drawn by a lazily loaded
encoder (fetched on first Hand off tap, not at boot, so first paint does not
grow), a native share sheet (or copy-to-clipboard fallback), and a list of the
call names that will travel. The assistant scans the code or taps the link on
their phone, where a cold load checks `location.hash` (app.js), decodes the
game and opens its game screen, with a toast pointing to bench mode. The two phones are not
linked afterward — edits on either one are independent.

The link carries:
- the game's format, substitution interval, strategy, balance, seed and its
  rotation rules
- whether the game is underway, and if so, how far it has progressed and which
  stints the head coach has swapped by hand
- the roster: player ids, call names (first name, or first name plus last
  initial when two share a first name), numbers and skill levels
- the team's id, name and color

It does not carry the full names, the 5-letter abbreviations (re-derived on
open), the opponent, the tip-off time, or a link between the two phones. Call
names are generated by `callNames` (roster.js), never hand-typed, so they stay
unique and match bench mode's own calls.

The entire link, including the game plan, travels in the URL fragment after
`#`, which browsers never send to a server and so the coach chooses who gets
it. Anyone who has the link can open it, and the sheet says so. On the receiving phone, `decode` (handoff.js)
validates the link, cleans it through `sanitizeTeam` (storage.js), and merges
it into the app's own record: a team the phone already has (matched by team id)
keeps its own roster and everything else unchanged, with any incoming players
not on the phone added by call name; a team the phone does not have becomes a
new team or replaces the placeholder on a fresh phone. The game is re-solved
and any stint that differs from the link's becomes an override that is not a
hand swap, so the card matches the sender's exactly.

The app's privacy claim — "your roster and your players never leave your
device" — stays unchanged: the roster does not travel through a server.

Lazy loading is preserved: `handoff.js`, `handoff-view.js` and the QR
library are dynamic imports, requested only when Hand off is first tapped or a `#p=`
link is opened. All three are precached, so a hand-off works offline. The
whole link for a 12-kid game is ≤ 1,200 characters.
