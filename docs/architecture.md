# Architecture

How the app is put together and why each piece is shaped the way it is. Paths
are relative to `app/` unless stated otherwise.

`AGENTS.md` is the harness — the traps, the rules and what is enforced — and it
is not repeated here. Where the two would overlap, this file points and AGENTS
explains.

## Layout

    app/       everything that gets served — the site root
    test/      node --test
    scripts/   CI tooling
    notes/     internal working notes, never deployed

`app/` is an allowlist, and that is the point: `wrangler.jsonc` points
`assets.directory` at it, so a file is public only by being put there. The
previous arrangement served the repo root minus an `.assetsignore` denylist,
where forgetting one line published an internal file at `benchcard.app/<name>`.
A directory that has to be opted into fails closed.

Everything below is relative to `app/`.

- `engine.js` — planning core. Pure, dependency-free, deterministic for a given seed.
- `roster.js` — roster text parsing (jersey numbers from either end of a line). Pure.
- `icons.js` — Lucide path data, extracted at vendor time.
- `fx.js` — animation vocabulary over the vendored Motion library.
- `budget.js` — minute-budget allocation in stint slots. Pure.
- `storage.js` — load/save with validation and a one-behind backup, plus the shape of a finished game. Pure apart from `localStorage`.
- `dom.js` — forgiving DOM one-liners shared by the UI modules, plus the
  shared `ctx2d` canvas everything that sizes type by measurement uses.
- `trap.js` — focus trap for the overlays, plus the `data-fk` focus/caret restore.
- `state.js` — the app record: state shape and migration, load/save glue, the
  accessors every view reads through, the slot budget and the plan cache.
  Imports only the pure modules, so the view seams can depend on it freely.
- `card.js` — the printed card: sizes, canvas auto-fit, pagination, the preview
  zoom and the phone disclosure. The card is the product, so it is its own file.
- `share.js` — the same card as a PNG, painted from the laid-out DOM onto a
  canvas, for `navigator.share` with a clipboard/download fallback. The image
  keeps a taller bottom margin than its other three, with `benchcard.app`
  centred in it: the in-card mark is 7px, which is about five device pixels
  once a phone scales the picture into a message bubble. A URL and nothing
  else — the band is outside the card rect, so it costs the card no space.
- `backup.js` — the whole record out to a JSON file and back. Deliberately
  small: export is `JSON.stringify(state)` and import is `storage.js`'s
  `sanitize`, so there is neither a second serialiser nor a second parser to
  drift from the schema.
- `render.js` — the repaint dispatcher: `SECTIONS` (one key per independently
  repaintable region), `render` / `renderAll`, the debounced `soon`, the
  view switch (`setView`: flip the `hidden` flags on Games / Team / Season /
  Settings, scroll to the top; deliberately *not* a View Transition — see the
  comment there) and the theme. **The Roster view became "Team" in A40** —
  label first (slice 1), then the stored key, the `data-view` and the `id`
  (slice 2). The old key `roster` is still written in coaches' backup files, so
  `sanitize` translates it in exactly one place (`VIEW_WAS` in `storage.js`);
  nothing else in the app may. A guard must still not assume the label and the
  key are the same string — they agree today by coincidence, not by rule.
  It imports every renderer, so
  nothing may import it back: a view that needs to repaint is handed the
  callback at boot, through its `init*` function. That rule is what keeps the
  import graph a tree.
- The views, one module each — `roster-view.js`, `teams-view.js` (the team
  chips, which mount in the shell above every view rather than inside one, the
  game tabs, and the active team's name at the head of Settings),
  `season-view.js` (the Season view: minutes per player, game by game, and the
  one place a game filed by mistake can be deleted), `game-setup.js`,
  `strategy.js`, `balance.js`,
  `rules.js`, `pills.js`, `plan-view.js`, `timeline.js`, `gamemode.js`,
  `tour.js`, `onboarding.js`, `shortcuts.js` (the keyboard and
  the two reference sheets) and `toast.js` (undo, the tip jar, flash).
- `app.js` / `index.html` — the entry point and the markup. `app.js` is now the
  wiring only: the controls no single module owns, and the boot block that
  hands each module its callbacks.
- `tokens.css` / `app.css` / `card.css` — the styles, in that load order and
  for that reason. `tokens.css` is the palette, type, radii and easings plus
  the two theme blocks (dark mode is nothing but the second block — no
  component rule anywhere has a dark variant); `app.css` is the chrome and the
  components; `card.css` is the printed card and the `@media print` block that
  prints it, kept beside the object it describes. The order is load-bearing in
  two places on purpose: `.stage`'s narrow-screen padding and the `@media
  print` overrides both have to come last.
- `sw.js`, `_headers`, `site.webmanifest`, `robots.txt`, `sitemap.xml`, the
  icons and `vendor/` — the rest of what is served.

Outside it: `test/*.test.js` (`node --test`) and
`scripts/check-sw-version.mjs`, the CI guard on the service-worker version.

726 tests, including 400-scenario property-based fuzzing of the engine.
Generation runs 20–50 ms across every configuration tried, including a
20-player roster and a 20-stint game.
## Planning strategies

- **Balanced** (default) -- as close to equal as the clock allows. One click.
- **Minutes** -- per-player targets on sliders, with locks. Exact when they
  add up to the whole game; short of that the spare minutes get shared out and
  each row says what it will really play.
- **Closers** -- even minutes early, a group you pick finishes the game.
- **Platoon** -- fixed fives alternating wholesale, no optimisation.

Plus rules that compose with any of them: min/cap minutes, play-together and
keep-apart pairs, pinned opening five and last-period five, and a
most-stints-in-a-row limit.

There is a third pair relation, `keepOnFloor` -- "always one of these two on".
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
## Lineup balance

Orthogonal to the strategies above, and the answer to the objection that kills
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
a weight set too low. `centred()` re-zeroes whatever the shape produces, because
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
different lifetimes: `renderLevelControls` sits on the **roster** page — the
tab labelled **Team** (levels live on the player and are a season-long
judgement) and `renderBalance` sits with the
**plan** (the shape is per game, stored as `game.balance`). Both folds are shut
by default and build their bodies only on open -- `<details>` keeps children in
the DOM either way, and eagerly building ten rows of five buttons cost 127 DOM
nodes for every coach who never opens it.

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
## First run

The app opens empty and asks for the coach's team — name, players, format —
rather than a seeded fake roster, which reads like a demo. Players can be typed,
pasted in any of the usual shapes (`12 Marcus Webb`, `Marcus Webb #12`,
`Devon Ellis`).

A **sample team** is the opt-in exception, and it is opt-in on purpose: nothing
is seeded unless the coach asks. "Try a sample team" sits above the form and
**fills it in** — ten players and the name **"Sample team"**, deliberately not
a plausible club name — for the coach with nothing to paste. It creates no
team, saves nothing and goes nowhere: the coach edits the box or taps "Build my
first card" exactly as if they had typed it, so there is nothing to undo and no
removal sentence to get wrong. The cast lives in `roster.js` as lines of text
that go back through `parseRoster`, so the sample is parsed by the same code a
paste is, and it
opens with `#welRoster`'s own placeholder names so there is one fictional cast
in the app rather than two. The six roster-size landing pages link in with
`?try=N`, and that path is the **one** that still builds the team and shows the
card — somebody who clicked "see this as a card" asked for the card, not for a
filled-in form, so it also still flashes how to remove what it made. It is read
only when there is no team and stripped from the URL
immediately: it carries one integer and nothing about anybody, and it is not a
URL share — there is still no way to put a coach's roster in a link, and there
must not be.

When onboarding finishes, a four-step **tour** runs once per device
(`state.tourSeen`, persisted, so it never repeats): the squad row, the strategy
picker, the timeline and the bench button. It is a spotlight rather than a
modal — a cutout over the coach's own screen, explained in place — because the
alternative is a slideshow of a rotation they have never seen. Each step names
a fallback anchor: the action bar is phone-only, so on desktop the last step
lands on the identical button beside the card. Whether a step scrolls to its
anchor is read off the anchor's computed position rather than declared per
step; a `position: fixed` one is already where it is going to be, and
scrolling to it walks the page to the top for nothing.

**How this works** (Settings → *How this works*) is the reference sheet — the strategies and when a
coach would pick each, what every rule does, how a tournament day carries over,
how to read the card (`▼` is who comes off, underlined is who just came on) and
what the app does with a roster. It is static markup in `index.html`, not
built in JS: it is prose, it never depends on state, and generating it would
only make it harder to edit. It ends with **Show me around again**, which closes
the sheet and re-runs the tour — switching back to the Games view first, since
three of the four anchors live there.

Settings is not the only door into it. Five **?** controls on the Games view
open the same sheet scrolled to the section that describes the control they sit
beside — Plan, Lineup balance, Rules, Across the day, and *Use this on the
bench*. The rule is one **?** per section of the sheet, not one per control:
each is a `data-help="<section id>"` in the markup and `shortcuts.js` is the
only thing that reads it, so a sixth is an edit to `index.html` alone. The
target is the in-app sheet rather than `advanced.html` on purpose — it never
leaves the app, so it works in a gym with no signal, needs no page load and has
no back button. *Reading the card* has no **?**, because its header is itself a
button and the only other place to hang one is hidden while the card is folded,
which is the default. The scroll is a single `scrollTop` write on `.keysbox`:
`scrollIntoView` defaults `inline` to `'nearest'` and would move the sheet
sideways, which is the same bug the tour carries a note about.

Roster order is the order everything else reads in, so it is directly
draggable: press the order column or the avatar of a row and move it. The
handle is deliberately only those two — `touch-action: none` has to be scoped
narrowly or the roster stops scrolling under a thumb — and the up/down arrows
stay as the keyboard and screen-reader path. A press becomes a drag past 5px,
so tapping an arrow still just moves the row one slot; the click that would
otherwise follow a real drag is swallowed. A drop moves the row nodes and
splices `state.players` rather than re-rendering, which keeps whatever is
half-typed in a field alive.

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
now clears the animation for its duration (`.rlist.dragging .rrow`).

On a touch pointer (or any screen under 620px) the arrows are not a stacked
pair but a row of two 44×44 buttons, and the avatar stands down to pay for the
width: a roster row is exactly as tall as one 44px input, so stacked arrows can
never be more than 22px each. The player's colour moves to a 3px stripe on the
row's left edge, which reads at least as well in a list.

Under 620px even that pair is too expensive. A phone row is 368px wide, and
88px of arrows plus a 67px card-name field left the name input 102px of the
176px the longest sample name wants — so eleven of fifteen names clipped
mid-character, with no ellipsis, because an `<input>` just cuts. The name is
the only column a coach reads down the list, so at phone width the arrows
collapse into a single 44px grip (`.rgrip`, the drag handle they always were)
and the card-name column moves behind a **Card names** toggle in the roster
footer, which drops the override onto a second line of each row rather than
taking the width back off the name. The name gets 209px and every sample name
fits. The grip takes <kbd>↑</kbd>/<kbd>↓</kbd> when focused, so losing the
arrow buttons does not lose the keyboard path, and `movePlayer()` now runs its
re-render inside `withFocus()` so a second press has something to press.

Two things in that row were under the 44px minimum until they were measured.
The jersey-number column was `2.4rem` — 38.4px — in every grid, and the input
fills its column, so `input.num` was under the rule at every width rather than
only on a narrow phone; it is `2.75rem` now, and the name column (`1fr`)
absorbs it. The level meter is worse-behaved, because its five steps share
whatever the row has left: a 44px step needs `viewport >= 285.6px + the level
word`, and the word is per-player ("Developing" is the widest), so the strip
crossed under 44 somewhere around 350–365px — a 360px Android. Below 380px the
meter therefore stacks: the strip takes the whole row and the level word moves
to its own line beneath it. That costs ~17px of row height on a small phone and
keeps the word, which is the part a coach reads. `scripts/smoke.mjs` now sweeps
the touch check across games/roster/folds-open at 320, 360 and 390 rather than
measuring one screen at one width, which is what let both of these live.
## Interface

**The chrome is three tabs and a cog.** Games, Roster and Season are the nav;
Settings sits behind a cog beside Print. The split is *policy vs plan*: a coach
would change a strategy or an availability between two games on the same
Saturday, and would never change a theme or a league rule, so the first belongs
on the game screen and the second behind the cog. Season earns its tab because
it is the thing a coach opens *between* games; Settings does not, because it is
set once a season.

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

The tab budget is now spent, and that is measured rather than assumed. With the
brand, three tabs, the cog and Print, the bar's one-row floor is **374px** in
the 620px stage and **359.9px** once the 385px stage tightens the gaps — one row
at 360, 375 and 390, two rows at 320, which is exactly what two tabs did. It
only fits because `?` and the theme toggle gave up their seats: each icon button
in the bar costs 50px (44 + gap), the same as a tab. The bar carries `flex-wrap`
for every phone width, so past the floor it gets taller rather than breaking —
two rows at a 20px root and two at 24px on a 390px screen, nothing panning.

**Settings is two labelled zones.** The top one is headed with the active
team's name and holds policy that belongs to that team alone; the bottom is
headed *Benchcard* and holds the theme, the help sheet and backup/restore. The
heading is the scope, so a coach with a rec team and a club team never has to
remember which one a setting landed on. Deliberately one surface rather than
two: "where do I save my stuff" should not require knowing whether saving is a
team thing or an app thing before you can find it. Putting the theme and the
help sheet first is also what makes the page legible — a settings surface whose
only contents are abstract policy is undiscoverable.

The team zone's first control is **Players changing at once** (1–5, default 3):
`maxSubs`, which has always existed in `engine.js` and was invisible to a coach
until it moved here. It is a *preference*, and the copy says so, because the
solver treats it as one — see the design note below.

Five bare digits read as a rule, so the control carries a **live read-back**
(`#maxSubsRead`, written by `renderSettings`): one sentence per option, naming
what the solver actually does with the number. The sentences are a RANGE
rather than a count, and that is not a stylistic choice — there are two bounds
and only one of them is on screen. `DEFAULT_MIN_SUBS = 1` pulls toward at least
one change per break with a cost of 20 a change short (`engine.js:1092`),
exactly as `maxSubs` pushes against the top at 40 a change over
(`engine.js:1091`); `minSubs` is exposed nowhere, so it is the same 1 under
every option. Neither bound is hard — `repairChurn` gives up when no legal swap
exists, and it clamps the floor to `avail.length - ON_FLOOR`, so a five-player
squad changes nobody — which is why every sentence hedges with "aims for".
At 5 the ceiling is unreachable (`ON_FLOOR` is 5, so `subs > 5` cannot happen
and the over-cost can never fire), so that option alone says "no ceiling" —
and deliberately does **not** say "no limit", because the floor is still
pulling and a promise about both bounds would be false.

The hero is a **rotation timeline** — players down the side, the game clock
across, colour-coded blocks where each is on the floor. Blocks are positioned
by elapsed minutes rather than stint index, so unequal stint lengths land in
the right place, and consecutive stints merge into one block so a long run
reads as a run. Fairness, back-to-back sits and the closing group are all
visible at a glance in a way a table of rows never made them.

Each row ends in that player's total minutes, and the highest and lowest totals
in the squad are called out — in words (`MOST` / `FEWEST`) as well as colour, so
the judgement survives colour blindness and a screen reader. A callout is an
outlier, so an end is only named when it is a minority of the squad — at most a
third. Twelve players splitting 16/12 four-to-eight names the four who lead;
fifteen splitting 16/8 ten-to-five names the five who are short, not the ten
who are not. When neither end is small enough — an even plan, or a 6/6 split —
nothing is tagged and the gutter collapses rather than shouting at every row.

Players carry identity: a colour from a perceptually even hue set (lightness
and chroma themed once, only the hue varies per player), used in the squad
pills, the timeline, the budget sliders and the day chart. The stint-by-stint
table still exists, demoted to a disclosure.

Period dividers cross the track and the blocks alike, and the two want opposite
ink — in dark mode the blocks are the *light* thing, so the themed hairline
vanished inside exactly the long runs a coach needs to read. A divider and a
block are both full track height, so each divider is wholly over one or the
other; `renderTimeline` marks the covered ones and they switch to dark ink.

Theme follows the phone. `auto` is the default, and it is resolved to a real
`data-theme` value — by a small inline script before first paint, and by
`applyTheme()` once the state is loaded — because the dark palette hangs off
`[data-theme="dark"]` with no `prefers-color-scheme` rule behind it. The query
is watched, so a phone that turns dark at dusk turns the app with it; an
explicit light/dark choice still wins, and `theme-color` follows the resolved
background.

**The first frame.** The same idiom decides which VIEW paints. `#view-games` is
the one view that ships visible, so a first-ever visitor used to paint the games
shell and watch it flip to the welcome screen a beat later. A second pre-paint
script stamps `data-boot` on `<html>` with the view the boot is going to land
on, and `app.css` hides the games shell (and the bar, the foot and the team
strip) and reveals that view for the stamp; `applyView` removes the attribute
the first time it runs. It resolves the WHOLE view, not welcome-versus-games:
a coach who left the app on Team, Season or Settings watched the same flash one
view along. **Games is stamped as nothing at all**, deliberately — it is the
markup default, so a throw in the script degrades to today's behaviour instead
of to a blank frame. That is also why the team strip ships visible with one row
of height reserved rather than `hidden`: the chips only arrive with
`renderTeams`, and a rule keyed on the stamp can never reach a boot that stamps
nothing, so the strip is chrome that the welcome stamp takes AWAY, exactly like
the bar and the foot. Shipping `#view-welcome` visible instead would only move the
flash onto the returning coach, who loads the app far more often. The script
walks `loadState`'s whole key chain — the v6 backup, v5/v4/v3 and both legacy
keys — and repeats its three acceptance clauses, because a cheaper check that
disagreed would flash the welcome screen at a coach whose primary record is gone
but whose backup is fine. `test/first-paint.test.js` runs the real script beside
`loadState` and fails on any disagreement.

The card is presented as a physical object on a lit stage rather than as a
sidebar thumbnail.


Type is **Inter Variable**, vendored — one file covers every weight and renders
identically on Android and Windows instead of falling back to Roboto or Segoe.
Icons are **Lucide**, with only the path data extracted into `icons.js` (4.7 KB
for 25 icons) rather than shipping a runtime. Motion drives spring transitions,
staggered entrances and FLIP reordering; continuous interactions like dragging a
minute slider deliberately stay on CSS transitions, where spawning a spring per
input event would cost more than it buys.

One consequence worth knowing: the printed card is auto-fitted from canvas
`measureText`, and the constraint that follows from it — the measurement font
stack matching `.card`'s exactly, and the re-fit on font load — is a trap
`AGENTS.md` owns and this file does not restate.

Motion, colour and touch behaviour run off tokens in one place: easing curves
(nothing linear), four durations, a warm-neutral palette with a single ember
accent, and full light/dark. `prefers-reduced-motion` disables all of it, and
**the preference is watched, not sampled** — a phone can flip it from Control
Centre mid-game, so `fx.js` exports `enabled` as a live binding and re-reads
the query on `change`. That gating is not decoration: the CSS
`@media (prefers-reduced-motion: reduce)` block can only neutralise CSS
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
<kbd>V</kbd> switch Games/Roster, <kbd>B</kbd> open game mode, arrows to move
between stints there, <kbd>?</kbd> for the list, Escape to close. Each key
clicks the button it names rather than repeating its work, so a disabled or
absent control is already the answer for the key too. *Disabled*, note, not
*hidden*: a programmatic `.click()` fires on a hidden element and is stopped
only by `disabled`, which is why <kbd>P</kbd> still works on the three views
the Print button is not on: it lives beside the card, inside the games view,
so on Roster, Season and Settings the button <kbd>P</kbd> clicks is inside a
hidden `<main>` — and `printCard` switches to Games before it prints, so the
key lands on the card rather than spooling whatever is on screen. It is not in
the top bar, and nothing in the top bar depends on the view any more: hiding a
button there took it out of the flex flow and shifted the whole right-hand
cluster every time a coach opened Settings. Print going `disabled`
whenever the plan is blocked is what stops <kbd>P</kbd> from spooling a page of
furniture with no card on it, and Shuffle is `disabled` on the same flag, since
`analyzeFeasibility` runs before the seed is used at all: a blocked plan is
blocked for every seed, so <kbd>S</kbd> could only reshuffle nothing. They are
inert while a
field has focus, and behind the shortcuts sheet.
The `?` hint in the header only appears on a fine pointer at ≥760px — on a
phone it would advertise something the coach cannot press.

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
explicit `order`, so Game format sits between the squad and the plan (it is
the input the rotation is built from), **Rules is the last of the five inputs,
directly above the rotation it constrains**, card head, card and the bench
button slot in after the timeline, and Across-the-day, Stint-by-stint and Card
options fall below. Rules was at 11 of 13 — under the card and under the bench
button — for as long as the list existed, which put the one feature no
competitor has at the bottom of the page; the list is renumbered whole and
`index.html` carries the same order, because above 1100px `order` does nothing
and source order is the reading order. The flex `gap` is zeroed there — the blocks already carry margins, and a
gap double-counts every seam. The rule is `@media screen`, so the print path,
which flattens everything through `.print-path`, is untouched.

Touch minimums (44px) are gated `@media (pointer: coarse), screen and
(max-width: 620px)`. The pointer half alone was a trap: it never fires in a
resized desktop browser, so nothing behind it was ever exercised in testing.

**Destructive actions are undoable, not confirmed.** Removing a player,
removing a game, starting a new day and clearing in-game changes all happen
immediately and raise an undo toast for nine seconds. A `confirm()` asks at the
wrong moment — before the coach can see what it did, and a game removal is only
judgeable once the rest of the day has rebalanced. The snapshot is the whole of
`state`: a day is a few KB, and a per-action inverse would have to know that
removing a player also sweeps their id out of every game's out-list,
constraints and carryover. `state` is a `const` binding everything closes over,
so a restore refills it in place rather than reassigning. There are no
`confirm()` calls left in the app.

**Game mode traps focus.** It sits on top of the page rather than replacing
it, so without a trap Tab walks into the form underneath.

Mobile specifics that came out of real use:

- **Game tabs wrap; they do not scroll horizontally.** A sideways scroller
  nested inside a vertically scrolling page is miserable on a phone, and
  wrapping also removed the need for scroll-into-view, which was yanking the
  page to the top every time a slider settled. Wrapping only holds if a single
  tab fits the row, so the label is capped at 20 characters — a
  tournament-length opponent name made a 431px tab in a 368px row and put the
  whole page into a horizontal scroll. The cut is in the **middle**, weighted
  towards the end (`elideMiddle` in `state.js`): tournament labels share a long
  prefix and differ only in the round and the opponent, so a tail ellipsis gave
  two different games the same tab. The tip-off time beside it is never
  truncated, the full label is the tab's accessible name and tooltip, and it
  stays in the game's own opponent field.
- **Squad pills elide the same way, and for the same reason.** `.plr .nm` is
  capped at 15ch, and a tail ellipsis cut the surname off — two kids with the
  same long first name became two identical pills for the tap that decides who
  plays. `fitPills()` in `pills.js` runs the tabs' middle cut, but sized by
  measurement instead of a character count, because 15ch is a different number
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
  real controls on the roster view rather than reimplementing them. A squad
  that is genuinely under strength — 4 of 11 present — still gets the red
  error, because there it is the right message. On the roster page the same
  state hides the `.rhead` column labels: headings over an empty table read as
  something that failed to load.
- **A blank timeline always offers a way out of itself.** "Resolve the errors
  above" is only useful if the coach can reach the control that caused them, and
  on a phone the Rules fold is collapsed and several screens down. `timelineEmpty`
  reads the plan's issues: a rules-caused error (`RULE_ERRORS` — minimums, caps,
  pair/avoid conflicts, pinned fives) adds **Fix the rules**, Platoon without a
  unit adds **Fill a unit**, and an empty roster gets the roster CTA. Both
  buttons go through `jumpToEditor()`, which opens the enclosing `<details>`
  before scrolling — landing on a collapsed summary is worse than not moving.
  Errors fixed elsewhere (not enough players, closers, unit sizes) get no
  button, because their control is already on screen.
- **The substitution interval is a chip group, not a `<select>`.** Eight long
  options in a native picker fills a phone screen for a one-tap decision.
- **Destructive actions leave the nav strip.** "Remove game" sits in the game
  panel header behind a confirm, not as a tab beside the games.
## Game mode

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
production — 0x0 against the card preview, which is folded away by default
below 1100px, so the animation silently never ran on mobile at all; and
`top: 855` against an 844px viewport when the coach beat the action bar's own
slide-in. Both degraded to a plain CSS fade, which is indistinguishable from
"the animation did not run". Nothing on the way into game mode may measure the
page again; `test/gamemode-open.test.js` pins that. Under reduced motion
`sheetUp` declines and the CSS `gmIn` keyframe takes over, which the global
reduce rule collapses to an instant state change. A tap anywhere finishes the
transition on the spot rather than waiting it out (`armInterrupt`), and a tap
that lands on the page still receding behind the rising sheet is swallowed
rather than acted on.

**A part-played game says so from the plan page.** A reload closes game mode —
on iOS, switching to the clock or the scorebook app and coming back is often
enough — and the coach landed back on Games with no sign a game was underway,
under a button reading "Use on the bench", which reads as *start*. The state was
always fine; the page was just silent about it. `resumeAt()` in `card.js` is the
one answer to "is this game part-played": stint 0 is indistinguishable from
never started and the last stint is a game that is over (game mode restarts that
one), so only the middle counts. It relabels the bench button — "Resume · Q2
4:00", with a play icon — and the timeline draws a `.tl-now` playhead down every
row at the same point. The marker is per-track rather than one line across the
body, because the track is a middle column on desktop and a full-width row on a
phone. Bench mode is deliberately **not** reopened on load: a coach who reloaded
*because* something was wrong would be trapped in it.

Leaving is a **thumb reach on a phone**: as well as the X in the top bar there
is a **Done** button at the left end of the stint bar, because game mode is the
one screen used standing up one-handed and the top-left corner is the worst
place on a 390px screen to have to reach. It is text rather than a chevron so it
never reads as a third stint control, and it is hidden above the coarse-pointer
breakpoint, where the top-left X is already an easy target.

The dot strip is **a window, not the whole game**, past 12 stints. It is ~142px
wide on a 390px phone, which is about twelve usable dots; an 8×20 game has forty
of them, and drawn one-per-stint they overflowed a centred, clipped strip so that
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
touch gesture's scrolling behaviour is fixed before the first `pointermove`
lands. The swipe drives the prev/next buttons rather than repeating their
logic, so their `disabled` state is also what marks the ends of the game — at
either end the drag rubber-bands and snaps back, and the end of the game is
felt rather than guessed at.

The next change is named with **the clock time it happens at** — "Next sub ·
Q2 4:00". "Coming off / going in" with no time on it reads as ambiguous,
because the next break is often mid-period rather than the period boundary a
coach assumes. Players who arrived at the current break carry a "just on" tag
rather than a bare glyph, and that tag always matches the previous stint's
"On" list.

Each player shows **played / projected** — minutes from the stints already
completed, then where they finish if the plan holds. Mid-game the live question
is "how much has this kid actually played", and a projected total reads the same
in the first quarter as the fourth. The bench is sorted lightest-played first,
so its order answers "who goes in next".

A swap starts with the player coming **off**, so until one is picked no bench
row does anything. Those rows are therefore not buttons at all — they render as
a plain full-width list with hairline rules, and the "Bench" label carries
"tap who comes off first". A disabled button styled like the live one is a
trap: it looks tappable, swallows the tap and explains nothing. Dimming was
rejected for the same reason the rest of game mode is high contrast — a dim row
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

There is a third scope, **"Sit, rebalance"**, and it is the one case where the
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
totals, the detail panel, the stat tiles, the stint grid, the minute bars and
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

A stored override that no
longer names five real players is discarded on load — a stale one is worse than
none, and "real" means present as well as on the roster: sitting a player out
in Squad drops any override naming them, the same way removing them does. An
override is a five the coach picked by hand, so with one of them not in the gym
it is not a lineup, and it would otherwise ride into bench mode and onto the
printed card.
## Card

3.45 x 5.0 in by default, tiled on letter with dashed cut lines, sized to tuck
in a pocket Moleskine (there is a wider half-sheet variant too, below). Type is auto-fitted: the widest lineup row is measured and the card
scales to fill its width, so short first names print bigger for free. Everything
is sized in inches, so screen CSS pixels (96/in) map 1:1 to print.

- The change line carries **OUT only**. The incoming players are already printed
  in the lineup directly below it, so listing them twice was costing about half
  the line's width and forcing it down to 7pt. Incoming players are underlined
  in the lineup instead.
- **12pt is a hard floor for names.** Past roughly 13 stints the game is split
  across two cards, broken on period boundaries, rather than shrunk to fit.
- **The card also leaves as a PNG.** Printing needs a printer; "text me your
  rotation" is how a card actually reaches another coach, and that is the whole
  word-of-mouth story for an app nobody advertises. `share.js` clones the
  card into an offscreen host (outside `#sheet`, so the preview's `--cardzoom`
  is unset and every rect is a real 96dpi print pixel), walks it, and paints
  each leaf's text and each horizontal rule onto a 3x canvas — no library, and
  no `foreignObject`, which cannot see the vendored Inter without inlining the
  whole woff2. Then `navigator.share({files})` where it exists, the clipboard
  where it does not, a download where neither does. The whole path from tap to
  `share()` is synchronous, including a hand-rolled `toDataURL` decode instead
  of `toBlob`: `navigator.share` needs transient activation, and an `await` in
  front of it loses that on iOS — the platform the feature exists for.

- **Two shapes, same card.** `ui.cardSize` picks `pocket` (3.45 x 5.0 in, two
  across a letter sheet) or `half` (8 x 5.1 in, two down it) for coaches who
  carry a clipboard instead of a notebook. Both are cut from one letter page
  inside the .25in `@page` margin. `CARD_SIZES` in `card.js` holds the width,
  height, padding, header/footer allowance and the name-size floor and ceiling
  for each; the auto-fit and `paginate()` read them, so the half-sheet gets
  bigger type (up to 44px) rather than the same type with more air. The
  preview is laid out at true print size and shrunk to the column with
  `zoom` (reset to 1 in print), so an 8in card still fits a phone.

- **The half-sheet takes a second column of stints once one will not hold
  them.** It was height-bound and width-unbound — its width-fit ceiling
  (44.96px) sat *above* its own 44px `maxName`, so the extra width bought
  nothing at all and the bigger sheet held **9 stints against the pocket
  card's 12**, telling the coach to sub less often. `columnsFor` in `card.js`
  splits the rows into two `.stintcols` columns past that point, which takes
  the half-sheet to **18 stints on one piece of paper** at ~21px names —
  still a third larger than the pocket card's ~16.6px. Deliberately *not*
  unconditional: below one column's worth the sheet is byte-identical to what
  it always was, because two columns on a card that already fits would shrink
  an 8-stint sheet from 23.7px to 22px and make it "merely wider" — which is
  the thing the shape exists to avoid. The `minName` floor stays at **20**; it
  never binds below twenty stints, so there was nothing to relax. Every
  measurement (`widthFit`, `heightFit`, `chgSize`) is per column, so the
  one-column path is arithmetically the same code it was before.
## Rules are additive, not tabular

A grid of ten min/cap boxes is mostly waste — a coach sets a limit on one or
two players a game. Nothing shows until a rule exists, each rule reads back as
a plain sentence chip ("Kade capped at 12 min", "Jack / Jackson apart"), and
adding one starts from a row of rule types rather than a form. The starting
five and last-period pickers reuse the same tap-a-player control as closers.

The collapsed row says which of the two it is. With rules set, `#conscount` is
a count in an accent pill; with none, it names what the section holds
(*minutes, pairs, starters*) in muted type — `.count.zero` unsets the pill,
because an empty state rendered as a badge reads as an alert about something
the coach has not done. It says nothing at all only when there is no roster,
the same call `availCountText` makes when it declines to write "0 of 0".
## Blocked states say why

When a plan cannot be produced, the card stage explains the reason instead of
rendering an empty frame, the bench button is disabled rather than opening onto
nothing, and the timeline says what to fix. Choosing Platoon without defining
the fives used to fall through and quietly plan as if balanced — a silent
no-op is worse than a clear ask, so it is now an error that names Unit 1.

Closers has the same trap without the blocked state: the engine only forces
anyone onto the floor once the closing group has players, so leaving "Who
closes" empty produced a plan identical to Balanced with nothing saying so. It
now says so twice -- an info banner in the issues list and a line under the
picker -- but stays an info rather than an error, because unlike an undefined
platoon the plan is perfectly valid.
## A boot that fails says so, and hands the season back

`index.html`'s head carries a small inline script — the only one besides the
theme resolver and the timeline skeleton — that installs `window.onerror` and
`unhandledrejection` before a single module runs, and app.js's final
`renderAll()` sits inside a try/catch that calls it.

**Why inline and not a module.** A throw at the top of `app.js`, or in any
module it imports, happens before a line of app.js's own body executes: a
handler installed from a module cannot see the failure that matters most. A
module also cannot report its own failure to load, and a second file would be a
41st request against a budget deliberately pinned at 41.

**What a coach sees.** `#view-games` is the only view in the markup that is not
`hidden`, so before this a broken boot left a live, empty shell: no message and
no route to the backup. (A first-run device now hides it before paint — see
"The first frame" below — which the panel survives, because it replaces the
whole body rather than un-hiding a view.) The guard now replaces the page with a panel that says
Benchcard could not start, offers **Download my backup** and a reload, and says
in plain words that the roster is still on the device. The panel is BUILT IN
THE CATCH and is not in the markup — a hidden panel would spend a third of the
node budget's headroom on a screen almost nobody sees.

**The download is `backup.js`'s, not a copy of it.** It dynamically imports
`downloadText` and `backupFilename` at click time, and hands them the raw
`localStorage` bytes — trying the same newest-first key chain the theme script
uses, because a coach whose boot broke mid-migration still has a record under
an older key, and an empty file would be worse than nothing. `backup.js` is
already in the boot graph, so on a normal failure the import resolves from the
module registry and fetches nothing; if the boot died earlier than that, it is
precached.

The reporting half is `app_error` — see Analytics above for why that event is
the one sanctioned exception, and why it carries no message and no stack.
## Photo scanning: removed

Benchcard used to read a roster off a photo of a team sheet -- Tesseract in a
worker, lazily fetched, with a review step because OCR on a gym printout is a
suggestion rather than an answer. It was ~9.6 MB of vendored WASM, a lazy-load
budget rule, a focus-trapped dialog, its own analytics event and a chunk of
this file.

It was removed after it was tried in an actual gym several times and did not
work well enough. Copy-and-paste is not much of a hardship, and a feature that
mostly fails is worse than one that does not exist: it is the first thing a new
coach reaches for, so it was failing at exactly the wrong moment.

What went with it: `scan.js`, `scan-view.js`, `vendor/ocr/`, the `scan_used`
event, the `LAZY_PREFIXES` machinery in `scripts/budgets.mjs` and its smoke
check, two vendored icons, and two forced states in the a11y overlay pass.
Worth remembering as a shape rather than a lesson about OCR: the check that
guarded it ("the OCR bundle stays lazy") could no longer fail once the bundle
was gone, so it was deleted rather than left green forever.
