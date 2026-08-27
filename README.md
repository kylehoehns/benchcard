# Benchcard

[![tests](https://github.com/kylehoehns/benchcard/actions/workflows/test.yml/badge.svg)](https://github.com/kylehoehns/benchcard/actions/workflows/test.yml)

Substitution rotations for a youth basketball team, printed on a pocket-notebook card.

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

## Status

Feature-complete for a tournament weekend: engine + tests, a roster editor, a
day of games with tabs, per-game constraints, cumulative day minutes, light and
dark themes, and the printed card.

It is deployed, at `benchcard.app`, with analytics on -- see "Deployment" and
"Analytics". Season history is done too: `season-view.js` keeps the ledger, the
CSV and the carryover across games. What is still not done: a foul-tally
companion card. Offline is done: a service worker precaches the shell, so after one visit the
app boots with the network gone -- see "Search, sharing and install". A new
worker takes over as soon as it installs, but the open page keeps the modules it
already loaded, so nothing swaps under a coach mid-substitution; the new code
lands on the next navigation. An installed iOS app can go weeks without one --
it resumes from a snapshot rather than navigating -- so `index.html` re-checks
for a worker whenever the app returns to the foreground, and when one takes over
`toast.js` *offers* the reload rather than taking it, never over game mode.

## Running it

    cd app && python3 -m http.server 8137     # then open http://localhost:8137

Serve `app/`, not the repo root: the service worker's scope, the manifest's
`start_url` and every absolute path in it assume `app/` is `/`. ES modules are
blocked over `file://`, so it has to be served either way.

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

## Testing

`node --test` — no install step, because there are no dependencies.
`.github/workflows/test.yml` runs it on every push and PR against `main`, on
Node 22 and 24, with `fail-fast: false` so one red leg does not hide the
other's result. The repo is private, so the badge above only renders for
someone signed in with access.

There are **six** CI jobs in total: the `node --test` matrix above, then
`smoke` (`node scripts/smoke.mjs --no-tests`), `redirect` (`redirect-check.mjs`,
the service worker behind Cloudflare's trailing-slash 307s), `about dateline`
(`check-about-date.mjs`), `service worker version` (below) and `vendor drift`
(below). The three named in this sentence went unmentioned here for months
while this paragraph counted to three; if you add a seventh, say so here.

The service-worker version job runs `scripts/check-sw-version.mjs`, which fails when a file in `sw.js`'s
`PRECACHE` changed in the diff but `VERSION` did not. That mistake cannot be
caught by a unit test — the tests see one commit and the bug only exists
between two. It used to cost the worst failure this project has, a returning
coach served the old shell forever, offline, with nothing to notice; the cache
is now named `benchcard-v<VERSION>-<SHELL>` and the `SHELL` half is a digest of
the precached bytes, so the bust no longer depends on anyone remembering.
`VERSION` is the human-readable release label, and this job is what keeps that
label honest. Both sides' precache lists count, so removing a file from `PRECACHE`
needs the bump as well. Run it locally with `node scripts/check-sw-version.mjs
origin/main`. It exits 0 when there is no base ref to compare against — a first
push, a shallow clone, a force-push — because a guard that fails on a ref it
cannot read is a guard people learn to ignore.

`.github/workflows/vendor-drift.yml` re-runs `sh app/vendor/fetch.sh` and
fails if the working tree moves. Committing the output of a script is only
honest if the two stay in sync, and this catches both ways they come apart: a
vendored file edited by hand — tempting, because `app/vendor/` is just files sitting
in the repo — and a CDN serving something new under the same version pin, which
nothing on our side prevents. Because only the second one happens without a
commit, the job runs weekly as well as on changes under `app/vendor/`. It is
kept off every push because it depends on a live CDN, not because it is slow:
a full re-vendor is Motion, two Inter subsets and 26 icons, about 250 KB, and
takes seconds. (It was ~10 MB when Tesseract was vendored; that went with the
photo roster scanner and this sentence did not.)
A deliberate version bump trips it on purpose — label the PR `vendor-bump` to
skip it once the new output is committed. Untracked files count too: an icon
`fetch.sh` downloads but that was never committed is as broken as a modified
one, and that is exactly the state `app/vendor/icons/grip-vertical.svg` was in.

Beyond the example-based tests, `fuzz.test.js` generates 400 random scenarios
(roster size, availability, format, granularity, and a random mix of every
constraint type) and asserts invariants that must always hold:

- no input throws, and a refusal always carries a usable error message
- every stint fields exactly five distinct, available players
- minutes reconcile against the floor-time budget
- **any violated constraint appears in `issues`** — this is the brief's
  "make constraint violations explicit rather than silently ignored",
  tested directly rather than assumed
- identical input yields an identical plan
- short names are always unique and printable

The fuzzer immediately found a real one: a 10-minute period split three ways
gives 3.33-minute stints, and minutes were printing as
`23.333333333333332` — on the pocket card.

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
`measureText`, so its measurement font stack must match `.card`'s exactly, and
the cards are re-fitted once `document.fonts.ready` resolves — otherwise a cold
load measures the fallback and sizes the card for a typeface it will not print
in.

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

## Money

There is none. A tip jar link in the footer, switched **on** — `TIP_URL` at the
top of `toast.js` holds a live Buy Me a Coffee URL, and `about.html` hard-codes
the same one with `analytics.test.js` pinning the two together. Set it to `null`
to hide the link (not the footer: the footer carries the only crawlable link to
`about.html`). The market research behind that decision:
GameChanger gives coaches every premium feature free and monetises parents
instead, so coach-side tooling is expected to be free, and paid-upfront tools
above about $3 collect hostile reviews.

## Analytics

**On.** `analytics.js` exports a single `ANALYTICS` constant, and it now holds a
live Cloudflare beacon token and the `/e` endpoint. The off switch is still
real and still the design — with `ANALYTICS` null every function in the module
no-ops and touches no network — but "off by default" is a description of the
code, not of production. Two layers are running: the
Cloudflare Web Analytics beacon (cookieless, injected from JS so the markup
carries no third-party script when it is off) and eleven events posted
to a Worker. Each event is tied to a decision in `notes/ROADMAP.md` §1;
`plan_generated` fires on every strategy change *and* once per load, since a
coach who picked Closers months ago and never touches the segment would
otherwise read as Balanced forever. (This paragraph said "seven" for as long as
there were ten of them, which is the whole argument for `analytics.test.js`
pinning the list rather than the count.)

**Ten of the eleven are product questions; `app_error` is not, and it is the
one deliberate exception to the rule that this list does not grow.** Until it
existed the app had no way to say it had broken — no `window.onerror`, no
`unhandledrejection`, no try/catch at the boot boundary — so a coach whose app
died in a gym was the only person who would ever know. Its single field is
`where`, one of five literals (`boot`, `render`, `solve`, `storage`, `share`),
picked by `errorWhere()` from the script that threw. **There is no message
field and no stack field**, which is what keeps "counters only" literally true
for an event whose whole subject is an exception. It fires at most once per
page load: an error loop must not become a beacon loop.

**A sample team counts nothing until the coach edits it.**
`first_run_complete{roster}` is the only roster-size signal the app has, and
the six roster-size landing pages are built on that distribution — so if
loading a sample fired it, the data steering the roadmap would be measuring the
app's own suggestion, and those pages would feed their own sizes back into the
numbers that justify them. Loading a sample therefore fires nothing at all
(`plan_generated` cannot fire either: `app.js` fires it at boot behind
`state.onboarded`, which is still false while `initOnboarding` runs), and
neither does **filling the form with it** — a roster submitted exactly as the
app wrote it is our suggestion, not a team, so `finishOnboarding` compares the
box against the text it filled in and defers the count the same way. A
read-and-reset flag on `state.js` defers the count to the first edit, read in
`soon()` — an edit is the coach saying "this is now my team" — and it carries
the roster size **at that moment**, so a coach who trims the sample to eight is
counted as eight. No event and no dimension was added for any of this.

**Counters only, enforced structurally.** `payload()` knows every event and
every field it may carry; a string field must match one of a fixed set of
literals, a number field is clamped to 0–99, and anything else is dropped. A
call site *cannot* send a name, a team or an opponent, and `analytics.test.js`
fuzzes every event with name-shaped values to prove it. Roster size is bucketed
(`1-5` / `6-9` / `10-12` / `13+`) rather than exact.

That is why the copy says *"your roster and your players never leave your
device"* and no longer says *"nothing is uploaded"* — the narrower claim is the
one that stays true once a beacon can load. `analytics.test.js` also greps the
HTML and this file for the old wording, so it cannot creep back.

**Reading it back.** `node scripts/traffic.mjs` is the one command that answers
"has anyone but me used this yet?" — it prints every `first_run_complete`
individually with its timestamp, country and roster bucket, the app events by
country, and zone traffic with the country breakdown always beside the uniques.
That layout is deliberate: there are no accounts, so nothing in the data marks a
row as yours, and a self-exclusion flag was rejected because a forgotten flag
turns your own testing into apparent traffic. Timestamps are the exclusion
mechanism instead, and the script describes rather than concludes. Crawler
traffic in the zone numbers is partly the system working — the site is
submitted to Google and Bing. `node scripts/card-prints.mjs` answers the later
question of *which card format* gets printed; both read from
`benchcard_events` through `scripts/cf.mjs`, which owns the auth, needs a
read-only `CLOUDFLARE_API_TOKEN` in the environment, and never lets a token
reach an error message.

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

## Design decisions

- **Minutes are formatted, never printed raw.** Stint lengths are legitimately
  fractional, so every surface that shows minutes goes through `fmtMinutes`.
- **A corrupt save must not cost the coach their roster.** There is no server to
  recover from, so `storage.js` validates and repairs what it can, keeps the
  previous good record as a one-write-behind backup, and falls back to it with a
  visible warning. The warning distinguishes the three ways the main record can
  fail — `loadState` returns `recoveredFrom: 'unreadable'` when there were bytes
  it could not turn into a record, `'missing'` when the key was simply gone, and
  `'incomplete'` when the key was there and readable and merely not a whole
  record — because telling a coach whose store was evicted that their save was
  "unreadable" invents a corruption that never happened, and calling a record
  that is sitting right there "missing" is no better.
- **An empty app is a state a coach can ask for, and the backup must not
  overrule it.** Removing the last team writes a complete record that says so:
  one team, no players, `onboarded: false`. `sanitize` is total — it coerces any
  object into a valid-looking record — so "it sanitized" cannot tell that record
  from junk, and emptiness is exactly what the two share. `loadState` asks
  instead whether the record is COMPLETE: the version this build stamps, a
  `teams` array with at least one team, and `onboarded` as an actual boolean.
  A record carrying all three is entitled to say the coach has no team; anything
  else still falls through to the backup and still raises the banner.
  Constraints pointing at deleted players are dropped rather
  than left dangling, duplicate ids are collapsed, out-of-range numbers are
  clamped, and unknown enum values fall back. A failed write surfaces instead of
  being swallowed — silently not saving is the worst possible outcome.
- **A team's settings belong to the team, and absent means the default.**
  `teams[].settings` (schema v6) is how a team wants its plans made, as opposed
  to what happens in one game — a league rule set for one squad must never land
  on the other. A record written before it existed simply has no block, which
  `sanitize` reads as today's defaults, so there is still no version branch
  anywhere in `storage.js`: the shape *is* the migration, which is what keeps it
  idempotent and what lets a backup file from an older build import for free.
  Older keys are read, never written, so a coach whose service worker has not
  updated still finds the record their code expects. The block holds exactly the
  keys something honours — a key nothing reads is a claim the app does not keep
  in a file a coach can open. A second team **copies** the first's settings on
  create rather than inheriting them: one league is the common case, and a link
  would be a second thing to explain and to get wrong when a team is removed.
- **The game format default loses to the clone, on purpose.** `settings.periods`
  and `settings.periodMinutes` (4 and 8 = the literals `newGame` always carried)
  are read by `newGame` **only when there is no game to clone from**. The format
  was already sticky — `newGame` deep-copies it off the game it clones, and
  every "+ Game" and "New day" hands it `lastGame()` — so a default that won
  over the clone would snap game 2 of a tournament day back off the odd format
  a coach had just set. The default therefore earns its keep somewhere else:
  `newTeam`'s first game and `sanitizeTeam`'s no-games fallback pass the
  settings through, which is the one place the app used to guess 4×8 at a coach
  whose league is not, and `addTeam` already copies the settings block. It never
  reaches the solver and it is deliberately **not** in the plan signature — the
  game's own `periods`/`periodMinutes` already are, so putting it there would
  re-solve the day for nothing. Substitution granularity is deliberately not a
  setting: it is a preference rather than a league rule, and it lives with the
  period shape in the **Game format** block. That block used to be inside the
  fold labelled *Rules*, shut and below the rotation — which reads as the
  player rules, so a coach looking for "two halves of twenty minutes" never
  opened it. Rules now holds only the player rules; its collapsed summary
  carries the format in words (`2 × 20 min`) so the answer is visible without
  opening anything.
- **A league minimum is a floor on the map the engine already reads.**
  `settings.minMinutes` (0 meaning off) is composed into each game's per-player
  `minMinutes` in `computeAll`, so `engine.js` never learns the setting exists —
  the same trick as the tie-break stance, and the reason neither cost a solver
  change. A minimum the coach set on one player wins when it is higher; their
  **cap wins when it is lower**, because a cap is a deliberate "hold this kid
  back" and raising past it would manufacture a `MIN_ABOVE_CAP` error nobody
  asked for. The engine's own arithmetic still gets to refuse: twelve players at
  fifteen minutes wants more floor-minutes than a 32-minute game has, and
  `MINS_UNSATISFIABLE` says so. One knock-on worth knowing —
  `MIN_OFF_STINT_BOUNDARY` is per player, so a league number that is not a whole
  multiple of the stint fired it once for everybody; `renderIssues` collapses
  the repeat, in the same place and for the same reason it drops Platoon's
  `SPREAD_FLOOR`.
- **"How many change at once" is a preference, and the plan says when it misses.**
  `repairChurn` holds the ceiling while a lineup is built, but the local search
  that follows charges 40 per extra change against 60 a minute off target — so
  when holding to the number would cost somebody minutes, the plan goes over.
  Measured across 160 scenarios it does in about one plan in nine at the default
  of 3. Rather than dress a preference up as a cap (or buy floor continuity by
  quietly paying in the minute evenness the whole app promises), the plan
  carries a `SUBS_EXCEEDED` warning naming the arithmetic, the same contract
  `CONSEC_EXCEEDED` has. Platoon is exempt: alternating whole fives is the
  strategy the coach asked for.
- **A day that ends is kept, not thrown away.** `teams[].season.games` holds
  every finished game — its date, format, opponent and the per-player minutes
  actually played. A game is finished when it is in the day at the moment the
  coach taps **New day** *and its plan solved*: there is deliberately no
  "Finish game" button, because the bug being fixed is that a coach loses a day
  without ever being asked, and an answer that only works when they remember to
  press something reproduces it for the coach who is busiest. `plan.ok` is the
  one honest signal available with no UI — a game that never produced a
  rotation was never played — and deleting a game beforehand already takes it
  out of the day. The minutes come from `effectiveMinutes`, never
  `plan.minutes`, so a hand swap in bench mode is counted as what happened.
  Archiving runs inside `undoable`'s mutation, after the snapshot, so Undo
  un-archives with no second code path, and it is idempotent by game id so
  nothing can be counted twice. The season is **history, not instruction**:
  unlike constraints, its minutes are not swept against the current roster,
  because a kid who left in November still played those minutes in October.
- **And it can be read, and corrected.** The **Season** view — the third nav
  tab — is the ledger over that record: minutes this season per player,
  most first, then one collapsible row per game holding what everyone played in
  it. Game-first rather than a grid on purpose — twelve players by ten games is
  120 cells, and at 390px a table of them either pans sideways or shrinks past
  reading, so it is two lists a phone can hold. An id with no player on the
  roster is shown as *Left the team*, hollow dot and minutes intact, which is
  what "history, not instruction" looks like on screen. Each game carries a
  **Delete this game**, through `undoable`: "New day" finishes whatever is in
  the day, so tapping it twice files a game nobody played, and this is the only
  correction path there is. No levels, ever — `test/leak.test.js` covers the
  ledger for the same reason it covers the card.
- **And it can be handed to someone else.** *Save a spreadsheet* at the top of
  the Season box writes the ledger as one wide CSV — `Player | Sep 14 vs
  Falcons | … | Total`, one row per player, one column per game — which is the
  shape a coach pastes into a parent email and the shape a league timesheet
  asks for, and the shape the ledger on screen cannot be. It is the ledger's
  twin, so it is built in `season-view.js` next to the wording it shares
  (*Left the team* included) rather than in `backup.js`; it borrows only the
  filename stamp and the `<a download>` from there, because a **report is not a
  backup** — nothing reads it back and it never goes near `sanitize`. Columns
  run oldest first, which is the one place it disagrees with the ledger: a
  spreadsheet reads left to right as time. **A player who was not at a game
  reads as an em dash, and a `0` means she was there and did not get on the
  floor** — a `minutes` map holds a key for everyone who was available, so the
  record already tells the two apart, and a blanket `0` credited a kid with
  turning up to games played before she joined the team and to games after she
  left. Her `Total` is still a number, and it still sums (Excel and Sheets skip
  a dash in a `SUM` exactly as they skip a blank). The count of games beside
  her name in the ledger is the same attendance, read from `seasonShare`, so
  the two surfaces cannot say different things about the same child. RFC 4180 quoting
  (opponents and team names are free text and one of them is eventually
  `Falcons, B`), CRLF, and a UTF-8 BOM so Excel on Windows renders *Tomás*
  rather than *TomÃ¡s*. **The header row is whitelisted by
  `test/leak.test.js`**: this is the one file that gets forwarded, so a column
  added "for completeness" fails the build rather than shipping a child's
  rotation level to their parents.
- **And it can plan the next game.** *Even out the season so far*, a switch in
  the Rules section, opens each player's minute target adjusted by how far off
  their share of the season they are. It is an **input, not solver machinery**:
  everything it produces arrives as `constraints.targetMinutes`, which the
  engine has always taken, and nothing in `engine.js` changed for it.
  "Their share" is **attendance-weighted, one game at a time** — a filed game's
  share is its own mean, and a player is measured only against the games they
  were actually in. An equal split of the whole season across the roster would
  hand the kid who missed three games a claim on a game and a half of floor
  time, paid for by the kids who turned up; attendance is not a debt. What the
  weighting leaves is the unfairness the app itself creates: the remainder
  minutes stint arithmetic has to drop on somebody, week after week.
  It is **off by default, per game, and not inherited by a new game** — a coach
  who has never finished a game never sees the switch at all. Nothing is
  written to the record but the one boolean: the targets are re-derived on
  every `computeAll`, so turning it off restores the previous plan exactly.
  A **hand-set target and a lock are untouchable by construction**: it writes a
  target only where there is not one already, so the Minutes strategy gets
  nothing (those sliders *are* the coach's targets), Platoon gets nothing (the
  units are exact), and a locked row is left out of the pinned set entirely
  rather than handed a target — a target would pin it at 1000/min, and a
  suggestion must not be promoted to a promise on its way past one.
  A single game corrects by **at most two stints either way** — the same clamp
  the day carryover already uses — bounded by `minMinutes`/`maxMinutes` and the
  game itself, and if the numbers cannot be made to add up to the floor budget
  exactly the whole adjustment stands down rather than shipping targets the
  solver would stop honouring. "The season so far" **includes today's earlier
  games** (as planned minutes, the same choice `cum` makes), or game 2 of a
  tournament would pay off a debt game 1 has already cleared.
  And it **says what it did**, under the switch: the even share, then one line
  per player who is off it — *Marcus Webb opens at 24 min — 8 down on the
  season* — with *plays 8* beside the ask when whole stints cannot hit it. A
  number that moves with nothing joining it to a reason is the thing that makes
  a tool untrustworthy. The panel is its own repaint section (`seasonadj`),
  because it is the one thing in `rules.js` that depends on a solve.
- **A coach can take their record with them.** Local storage is not durable
  storage: WebKit evicts it after seven days without a visit (a home-screen
  install is exempt, a tab is not) and "clear history" takes it everywhere, so
  the **Benchcard** zone of Settings ends in a Backup group that writes the
  record to a JSON file and restores one. Restore *replaces* — player ids collide across two exports of
  the same record, so merging would double a roster rather than put it back —
  and its net is the nine-second undo toast, not a confirm dialog: removing a
  team is deliberately the only confirm in the app. The same picker is offered
  on the first-run screen, because eviction is exactly what lands a returning
  coach there holding a file, and both entry points also take a **paste**: a
  quiet link under the Restore control reveals a textarea, because a `.json` in
  an email attachment or in iCloud Drive is awkward to hand to a mobile file
  picker and that is the device this whole feature exists for. `readBackup`
  takes a string and never cared where it came from, so the paste path is the
  same parser, the same rejection and the same undo -- not a second import.
  `test/backup.test.js` pins the round trip as lossless over a fully populated
  record, and pins that there is exactly one of each; add a schema field and add
  it there.
- **The stint shape comes from `buildStints`, never a local copy.** `app.js`
  briefly carried a hand-copied duplicate of `periodLengths`, tail-merge rule
  and all. Any drift between the two would have desynced the slot count the
  sliders allocate against from the stints the engine actually builds, silently
  corrupting the whole budget with no error anywhere.
- **Re-allocation uses Hamilton apportionment, not take-from-the-largest.**
  Repeatedly shaving the current maximum flattens the shape the coach dialled
  in: adding an 11th player to a roster with someone set to 32 minutes took all
  four surplus slots off that one player and reset them to average. Scale,
  floor, then hand leftovers to the largest fractional parts.
- **Move legality is re-checked against live state.** The local-search move
  generators are lazy, and an accepted move rewrites the lineup while they are
  still yielding. Without the re-check a stale move could swap in a player who
  was already on the floor — putting the same player on twice and silently
  fielding four.
- **The minute budget is modelled in stint SLOTS, not minutes.** A player's
  minutes are necessarily a whole number of stints, so integer slots make every
  value the coach can dial in exactly achievable -- there is no rounding, the
  budget always sums to the game, and dragging one slider redistributes the
  others one slot at a time so the total lands exactly on capacity.
- **A pinned lineup outranks the consecutive-stint limit.** If the coach names
  five players to close, they close; the fatigue limit is a heuristic and
  yields, with the over-run reported. In practice the local search rests the
  closing group ahead of its window and neither has to give.
- **A coach's minute target is a pin, not a preference.** It survives caps and
  tournament carryover; everyone else water-fills the remaining floor-time.
- **Somebody has to play the odd stint, so it is decided out loud.** When the
  floor-minutes do not divide, `generatePlan` takes a `priority` map -- one
  number per player, highest first -- and nudges the free targets along a ramp
  spanning a tenth of a minute either way. `state.js` fills it with `deficitOf`,
  which is the season deficit where a season exists and reduces to "who has
  played least so far today" where it does not; all zeroes and the engine falls
  back to a seeded rotation. The nudge's largest possible swing anywhere in the
  cost function is 12, under the 20 a missed sub is worth and two orders of
  magnitude under a floor, a cap or a lock, so it decides only what nothing else
  has an opinion about. It is an input, not a cost term: the objective is
  untouched. A stable-arbitrary tie-break was rejected because the same child
  lands short every week by roster position. The `SPREAD_FLOOR` line names who
  pays and `state.js` appends why, so the coach can answer it per player with a
  lock or a hand-set target instead of a global preference.
- **The stance on that tie is the coach's, and it is the one place a level may
  move a minute.** `settings.tieBreak` is `'behind'` (the default, and exactly
  what the app did before it existed) or `'levels'`. Because the engine reads
  `priority` for its ORDER alone and is deliberately never told what the number
  means, the stance is composed in `state.js` -- `tier * 1000 + deficit` -- and
  `engine.js` is not involved in the choice at all. Two properties make it safe
  to leave on a settings page: a roster with no levels set is every tier equal,
  so `'levels'` solves *identically* to `'behind'`; and `applyTieBreak` already
  excludes anyone the coach has spoken for, so a floor, a cap, a lock or a
  hand-set target still outranks it. The claim in the `SPREAD_FLOOR` line
  follows what actually separated the two groups, and the roster page's level
  note stops saying the share is worked out without levels when it is not --
  copy that is false in a state the app can be in is why the option is opt-in
  rather than a weight folded into the default.
- **Players carry generated ids.** Constraints, availability and carryover all
  key off the id, never a roster position. With positional ids, fixing a typo or
  deleting a player mid-tournament silently reattached Kade's cap to Aaron and
  rebalanced the rest of the day against it, with nothing on screen to show
  anything had gone wrong. Deleting a player sweeps every reference to them
  across every game.
- **An explicit short name beats the derived one**, and auto-derivation dodges
  the overrides as well as the other auto names -- otherwise overriding one Jack
  to `JACK` silently collides with `Jackson`.
- **Short names are a card constraint, not a naming scheme.** Five letters exist
  so five columns fit a pocket card. Everywhere with room for the real name uses
  it -- including the timeline, whose rows put the name above a full-width bar
  and which read `AUST` until 2026-08-24 while already announcing "Austin
  Schumacher" to a screen reader; `tlName` in `timeline.js` is the single answer
  now, and it prefers the full name. Game mode's next-sub call -- the line the coach shouts -- uses `callNames()`
  in `roster.js`: first names, plus a last initial when two available players share
  one (the full name if even that collides). It drops back to the short names only
  when a call row would wrap, and then both rows drop together so the block never
  mixes the two.
- **Plans are recomputed, not stored.** The engine is deterministic, so inputs
  plus a stored `seed` reproduce a card exactly. That gives the stability that
  matters (a refresh cannot change a card you already printed) without a cache
  to invalidate. Shuffle just rolls a new seed.
- **A new game inherits the tournament-level setup** from the previous one:
  format, substitution interval, who is at the gym, and all constraints. Only
  the opponent, the tip time and the seed are per-game. The inherited
  constraints are deep-copied -- sharing the object would let an edit on game 2
  silently rewrite game 1's plan and therefore the whole day's carryover.
  "New day" keeps the format (you play the same league every week) but clears
  absences.
- **The team name is the fallback identity, not a decoration.** Asked for once
  at onboarding and editable on the roster page, it heads the card when a game
  has no opponent (where a generic `ROTATION` used to sit) and stands in as the
  day-title placeholder. It is stored raw and trimmed at every read, so typing
  a space does not fight the caret. The card header clamps it: `.when` never
  shrinks, so a long name cannot push the date off the card, and the title
  itself elides through `fitHeadline` in `card.js` — the same middle cut the
  tabs use (`elideMiddle`), for the same reason: printing a day of tournament
  games gave three cards the identical header `VS RIVERSIDE REGIONAL TOURNAMENT
  QUART…`. Unlike the tabs it is sized by measurement, not a character count,
  because a pocket card and a half-sheet have very different header widths and
  the half-sheet usually fits the whole label. The date and the `Q1-Q2` scope
  are never elided, and the CSS `text-overflow: ellipsis` on `.opp` stays as
  the backstop for the frame before the webfont lands.
- **Games chain within a day.** Game N is planned against the minutes actually
  assigned in games 1..N-1, so a kid who sat out game one gets caught up. The
  credit is clamped to +/- 2 stints so one absence cannot hand someone an entire
  later game.
- **Carryover suppresses the fairness messaging.** With carryover on, an uneven
  game is the point -- the target is an even day, not an even game -- so the
  single-game "best possible spread" benchmark is wrong and gets replaced by an
  explanation of who is being caught up. Platoon suppresses the same benchmark,
  in the view rather than the engine: the number is still correct about the
  format, but under a strategy that is by definition not optimising minutes it
  reads as an accusation.
- **Everyone plays before halftime, and it is a default rather than a setting.**
  Even *totals* were never the whole promise: a kid who does not start, sits a
  period and then plays one has the same number on the card and a different
  afternoon. Measured across 2,880 plans, 4.4% of players got their first
  minutes at or after the break and one plan in four had at least one of them;
  a flat 200-per-late-player term in `cost()` takes that to 1.7% and one plan in
  thirteen, with the minute spread and the solve time unmoved (the fix comes out
  of the minute-neutral exchange move, not out of anyone's total). It is not a
  control because the coach already has two — minimum minutes, and the out list.
  The term is level-blind, so it runs in both search passes without a rotation
  level reaching a single total.
  **`maxSubs` governs it.** The first stint seats five and every break after it
  seats `maxSubs` more, so `halfReach = 5 + maxSubs x (stints before halftime -
  1)` is the most that can be got on early without overriding a number the coach
  set by hand on a page that displays it. Past that the app's own default yields
  and says so: `HALF_LATE` names who is still waiting, gives the arithmetic, and
  offers the second lever only when lifting it would help. That governance is
  why `maxSubs` was exposed to the coach before this shipped, and it is what
  keeps `SUBS_EXCEEDED` at exactly its 11.3% baseline across the same 160
  scenarios. Platoon is exempt for the `SUBS_EXCEEDED` reason: the units and
  their order are the coach's.
- **Fairness is scored against water-filled per-player targets**, not raw max-minus-min. A capped player otherwise anchors the minimum and blinds the optimizer to real imbalance among everyone else. `spreadUnconstrained` is the number that actually tells you if the rotation is fair.
- **Local search needs two move types.** A single in-for-out swap shifts both players' minute totals, so once minutes are even it can never improve pairing or sit patterns without breaking balance. The minute-neutral exchange move (trade two players' places across two stints) is what makes pair constraints reachable.
- **Pairs are soft by default** (`hardPairs: true` to force). Requiring two players together every stint fights even minutes hard; the plan maximizes shared floor time and reports it as "together 20 of a possible 20 minutes".
- **Infeasibility is arithmetic, checked before any search**, so the message can name the offending constraint and the numbers.
- **Subs are held to 1-3 per stint** so there is continuity on the floor.

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

## Deployment

ES modules are blocked over `file://`, and this runs on a phone at the gym, so it needs to be served — Cloudflare Pages in production, or `npx serve` locally. No build step either way.

**Cloudflare settings.** Framework preset **None**, build command **`npm test`**,
deploy command **`npx wrangler deploy`**, version command
**`npx wrangler versions upload`**, root directory **`/`**. All four are
mirrored in the comment at the top of `wrangler.jsonc`; they were read off the
dashboard on 2026-08-24, because "confirm the build command is not empty" is
not a question the repo can answer about itself. The version command is what
Cloudflare runs for a **non-production branch** — it uploads the version and
hands back a preview URL instead of publishing to `benchcard.app`, so the same
green-suite gate applies to a branch build without it going live. Note there is
no "output directory" field in the Workers static-assets flow — that belongs to
the older Pages UI. The served directory comes from `assets.directory` in
`wrangler.jsonc`, which names `app`; the root directory is `/` because that is
where `wrangler.jsonc` itself lives. Nothing to install, so no Node version to
pin.

There is genuinely nothing to build, so the build command runs the suite
instead: `node --test` exits non-zero on a failure, which aborts the deploy. A
red suite should never reach benchcard.app, and this is the cheapest place to
enforce that. `.app` is an HSTS-preloaded TLD, which is a non-issue here rather than a
task: Pages serves HTTPS and redirects HTTP with no configuration.

`app/_headers` is the part worth reading before changing. It sits at the root
of the asset directory, which is where Cloudflare looks for it; it is consumed
rather than served. Nothing is content-hashed
— there is no build step, so every URL keeps its name across deploys — and that
one fact decides every rule in it, in both directions:

- **`sw.js` and the HTML get `no-cache`.** A stale `index.html` is a coach on
  three-week-old code; a stale `sw.js` is worse, because it is the only thing
  that can replace itself, so a copy an intermediary is holding never updates.
- **Nothing in `PRECACHE` gets a long cache.** Pages' default for uncached
  assets is already `public, max-age=0, must-revalidate`, which is right for
  them. Be careful about *why*: `sw.js` does **not** precache with
  `cache.addAll` (read the comment above `precache()` — `addAll` stores a
  redirected response and the spec then refuses to serve it for a navigation),
  and it fetches each entry with `{ cache: 'reload' }`, which bypasses the HTTP
  cache outright. So the rule is not protecting the install. It protects the
  first load before any worker exists, the HTML and `sw.js` above, and `LAZY` —
  the Inter ext subset, the one file the fetch handler gets with a plain
  `fetch(req)` and therefore the one that really is served out of the HTTP
  cache. This paragraph claimed `addAll` for months; do not let it back.
- **The long-cache exception is deliberate.** Inter ends up in the worker's
  cache either way, so it gets a week — long enough that nobody refetches it,
  short enough that a re-vendor is not frozen into returning browsers.

The origin is `https://benchcard.app`, registered and used in the canonical,
the `og:`/`twitter:` URLs and the JSON-LD of every HTML file, plus `robots.txt`
and `sitemap.xml`. Absolute URLs are required for Open Graph — Slack, iMessage
and Twitter will not resolve a relative `og:image`. Grep for the string if the
host ever moves.

## Search, sharing and install

The app is JS-rendered, so a crawler that does not execute scripts sees a shell.
Two things address that, and they are different problems:

- **`about.html`** is the indexable page — real prose about the problem, the four
  plans, the rules, how to read the card, and an FAQ carrying `FAQPage` JSON-LD.
  It is standalone in the sense that it loads no modules, but it **links**
  `./tokens.css` rather than carrying a copy (the copy drifted on `--shadow`
  and `--accent-line`, which is why; `tokens.css` is precached, so arriving
  from the app costs no request) and it repeats the pre-paint theme script, so
  arriving from a dark app does not flash white. and links back
  to the app three times. Each section leads with the artefact it is about, and
  most of those artefacts are **drawn in HTML/CSS against the app's own class
  names** (`.tl-*`, `.bal-*`, `.rchip`, `.sn-*`) rather than screenshotted:
  correct in both themes for free, sharper than a PNG, and no extra request.
  Only two images remain, both pre-existing. Every `<h2>` carries an id and a
  nine-row **section index** sits under the hero card: the page is ~14,600px at
  390px and roughly forty screens at 200% text, and the index is the only way
  in other than the scroll bar. It is stacked rows rather than a chip row
  because the labels are the headings themselves — no new prose — and headings
  that long in a wrapping chip row would hang off 320px at a 32px root. It is
  below the card rather than under the CTA pair so it does not compete with
  "Build a card". `test/about-nav.test.js` pins that a tenth section cannot be
  added without an entry. The scroll reveals are
  `IntersectionObserver` plus opacity and transform, and every hidden state is
  behind a `.js` class that the head script adds **only when
  `IntersectionObserver` exists** — so a crawler that does not run scripts, the
  reader this page is for, gets the whole page painted. `test/about-reveal.test.js`
  pins that; do not add a reveal rule outside the `.js` guard. The footer's **How it works** link is the only path a
  crawler has into it, which is why the footer is no longer hidden wholesale when
  `TIP_URL` is empty — only the tip link is.
- **The roster-size pages** — `7-player-basketball-rotation-chart.html` through
  `12-…` — are the long tail. Google's autocomplete suggests every one of those
  variants across unrelated seeds, no competitor has a page for any of them, and
  a coach with nine kids searches for *nine kids*. They are **generated**, by
  `scripts/charts.mjs` (`npm run charts`), and that matters in three ways:
  one template renders all six, so six near-identical pages cannot drift apart;
  the card on each is a real `generatePlan` run at build time rather than a
  drawing or a screenshot, so it cannot contradict the engine; and
  `test/charts.test.js` re-renders all six and compares, so an engine change
  that moves the plans fails the suite until `npm run charts` is re-run.
  The prose slots (`lede`, `caption`) are placeholders carrying `data-draft="1"`
  until the author writes them — `grep -l data-draft app/*.html`. The `<title>`
  and description are assembled from the generated plan's own numbers instead.
  Canonical and `sitemap.xml` use the **extensionless** URL, which is what
  Cloudflare 200s; internal `href`s keep `.html`, which is what works locally
  and what `redirect-check` exercises. They are deliberately **not precached**:
  offline value is near zero for a page reached from a search result, and the
  precache list is the payload budget's problem. The one internal link into them
  is on `about.html` rather than `index.html`, so the app's own cold-load budget
  is untouched.
- **`<noscript>`** is *not* an SEO device; Googlebot runs the JS. It is for the
  human whose browser does not, and a `<noscript><style>` in the head hides
  `.app` so they get the explanation instead of a dead grey page.

`og.png` (1200×630) is generated, not drawn: the real card, screenshotted from
the running app, composed beside the headline. Regenerate it the same way if the
card design changes — a stale preview of an old card is the one image everyone
sees. `icon-512.png` is the brand mark full-bleed on `--accent` at 62% so it
survives a maskable safe zone; 192 and the 180px `apple-touch-icon` are `sips`
downscales of it.

**Offline.** `sw.js` precaches the shell on install and serves it cache-first:
`index.html`, `about.html`, the three stylesheets, every local module in the
import graph, the **latin** Inter subset, the manifest and the icons — well
under a megabyte. The latin-ext subset is the one deliberate exception,
`LAZY` in `sw.js`: fetched and kept only when a roster actually contains a
glyph it covers, rather than pushing 74 KB to every install. The stylesheets are render-blocking, so all three have to be in there
or an offline boot paints unstyled. A gym
with no signal now costs nothing: kill the server, reload, and the app boots and
re-plans from `localStorage`.

Two things about it worth knowing before you change it:

- **Bump `VERSION` whenever a precached file changes, and set `SHELL` in the
  same edit.** The cache is named `benchcard-v${VERSION}-${SHELL}`; `activate`
  deletes every other `benchcard-*` cache. `SHELL` is a digest of every
  `PRECACHE` file's bytes, recomputed from disk by `test/sw.test.js`, and it is
  the half that actually busts the cache — so the bust no longer depends on
  anyone remembering. `VERSION` is the human-readable release label and nothing
  more, which means a forgotten bump leaves a stale *label*, not a stale app on
  a coach's phone. Keep the label honest anyway: it is what a person reads out
  of devtools and what the commit messages name.
- **`vendor/motion.mjs` imports `vendor/motion.umd.js`.** Missing that
  side-effect import is not a degraded animation — `fx.js` throws, `app.js`
  never runs, and the offline app is a skeleton. `sw.test.js` walks the import
  graph from `app.js` and fails if anything in it is not precached, which is how
  that one was caught.

A new worker never swaps code underneath a coach mid-game: the open page keeps
the modules it already loaded, and a waiting worker is told to `skip-waiting`
only on a load with no unsaved edit in flight. When one does take over,
`toast.js` *offers* a reload ("Benchcard updated." / "Reload") rather than
taking it, and never over game mode — see the Status section. That offer is the
update prompt; this paragraph said there was none.

`site.webmanifest` uses `display_override: ["minimal-ui", "standalone"]`. A
home-screen install still prints fine — the in-app **Print** button calls
`window.print()` rather than relying on the browser's share sheet, which
standalone iOS does not have.

**Asking a coach to install it** is the other half of the eviction defence the
Backup box started, because WebKit exempts an installed app from the seven-day
sweep and does not exempt a tab. It lives in `toast.js` beside the tip jar and
borrows its whole contract: one ask, on the second time the app delivered
something (the same `ui.prints` counter — there is deliberately not a second
one), never over a live game, and remembered in `ui.installDone` whichever way
it is answered. It goes on an earlier use than the tip because a roster is
worth more than a coffee, and when it fires the tip stands down: one toast box,
one ask. Chrome's `beforeinstallprompt` is caught and deferred, so the Install
button appears at a moment that earned it rather than as a banner nobody asked
for; iOS has no such API, so that path is an illustration pointing at the Share
glyph in Safari's toolbar. A browser offering neither is shown nothing — there
would be no instruction to give it — and one already running standalone is
never asked at all. `test/install.test.js` pins those rules the way
`test/tip.test.js` pins the tip's.
