# #201 — The tour shows rules, the Timeline | Card switch and share

## Issue

#201. The first-run tour has had the same four steps since the Plan sheet
landed (#28). It never mentions the share button, the Timeline | Card switch,
or the rules and lineups in the Plan sheet. The issue asked whether the tour
should change and how.

## Goal

A new coach who finishes setting up their first team is shown, on their own
game, every control they need before tip-off: who is here, how minutes are
shared, where rules and lineups live, the rotation, the card view of it, and
the two things they use in the gym (bench mode, and printing or sharing the
card). It stays short enough to read once, and it works for a coach on 200%
text on a small phone.

## Decided with the owner

- **Share joins the last step.** No step of its own. The gym step says the
  card can be printed or shared, and its spotlight moves to the share button
  (`#shareBtn`).
- **Six steps, not four.** The two new ones are the Timeline | Card switch and
  the Plan sheet's rules and lineups.
- **Nothing new for coaches who already saw the tour.** No tour version, no
  "what's new". `tourSeen` keeps its meaning and its shape. Anyone who wants
  the new tour replays it from Help or Settings.

## Survey (main at 197dd20, headless Chrome, smoke's forced DejaVu Sans, `RICH` fixture)

Measured with a scratch probe built on `scripts/smoke/chrome.mjs`, `dom.mjs`,
`fixtures.mjs` and `registry.mjs`'s `FONT_INJECTION_SCRIPT`, opening the tour
the way `overlay.mjs` does (Settings → How it works → Show me around again).
The smoke suite was not run.

How the tour works today (`app/tour.js`):

- `TOUR` is an array of `{ sel, title, body | lines, before? }`. `sel` is a
  list of anchors; `tourAnchor` takes the first one with client rects. A step
  with no visible anchor still shows its copy, centered, with no ring.
- One ring per step (`#tourHole`, a box with a huge spread shadow as the
  scrim). There is no way to ring two controls at once.
- `tourGo` writes "Step N of M", the title, the body, M dots (`#tourDots`,
  `aria-hidden`), sets `#tourNext` to "Got it" on the last step and hides
  `#tourSkip` there. It scrolls Y only, by hand (`test/tour-scroll.test.js`).
- `placeTour` puts the box on whichever side of the ring has more room and
  clamps it into the viewport. It re-runs on scroll and resize.
- `startTour` refuses with no games (#126), switches to the games view, and
  calls `openTrap`, which focuses the first control (Skip). `endTour` sets
  `state.tourSeen = true` and saves. Escape ends it. A tap on the scrim
  advances.
- Entry points: `finishFr` in `onboarding.js` (520ms after first run, only if
  `!state.tourSeen` and not Add a team), `#helpTour` and `#helpTourSettings`
  (both call `tourAgain` in `shortcuts.js`). Reduced motion: the only motion
  is `.tour`'s `viewIn` entrance, which the global reduced-motion rule
  already cuts to 0.01ms. Steps snap; the ring is never transitioned.
- No live region. A screen reader hears the dialog's label when focus lands
  in it, and nothing when Next changes the step.

Where the candidate anchors sit, per step, before any change:

| Anchor | 390×844, 16px | 320×844, 32px | 1280×800 |
| --- | --- | --- | --- |
| `#phraseRules` ("no rules") | 9,276 129×35 | 17,1036 258×69 | 377,227 |
| `#viewSeg` | 16,330 177×36 (just above the timeline) | 32,1143 256×68 | 384,281 |
| `#timeline` | 16,376 358×414 | 32,1231 256×1415 | 384,328 |
| `#shareBtn` | 331,10 48×48 (sticky header) | 256,19 48×48 | 1208,10 |
| `#abBench` / `#gmOpen` | 16,780 / hidden | 16,771 / hidden | hidden / 860,708 |

All four are on the game screen at every width, and none is inside a fold or
a closed sheet. `#phraseRules` always has text ("no rules" or "N rules",
`sentenceParts` in `state.js`). `#shareBtn` is shown on the game screen at
every width, and the header is `position: sticky`, so the ring stays on it
while the page scrolls.

What the survey found that the issue does not say:

1. **The tour does not fit at 320px with 32px text today, even with four
   steps.** The box is 867px tall on step 1, 1,189px on step 2, 858px on step
   3 and 959px on step 4, on an 844px screen. The `.tour` layer is
   `position: fixed` and does not scroll, so the rest is simply gone. Step 2's
   Next button starts at y=987 and step 4's "Got it" at y=832+ (both off
   screen). The action row alone is 181px tall there: Skip, the dots and Next
   each wrap to their own line. A coach on 200% text can only leave step 2 by
   tapping the scrim or pressing Escape.
2. **No smoke check sees it.** Only "tour, first step" is in the 320px/32px
   list (`app-large-text.mjs:164`). `applargetext` checks the side edges and
   "stranded above", not the bottom edge. The clip-sweep check looks for text
   wider than its own box, split words and text under other text. None of
   them looks at a box running off the bottom. So "the clip-sweep check
   passes" is not enough to prove the tour fits; this spec adds a check that
   does.
3. **Step 4 names a button that no longer exists.** It says "Bench mode is
   the big-button sideline view". The button reads "Start game" (or
   "Resume · Q2 4:30" on a part-played game, `labelBench` in `card.js`).
4. **Opening a sheet from the tour cannot work.** The Plan sheet is a
   `<dialog>` opened with `showModal()`, which puts it in the top layer above
   `#tour` (z-index cannot beat the top layer) and makes the tour inert. So
   the rules step points at the sentence's door into the sheet, not at the
   sheet itself.

Item 1 is fixed in this change (see Design). The new copy adds to a box that already does not fit, and the
acceptance test below cannot pass without it.

## What would settle it

At 390×844 light unless a line says otherwise, `RICH` fixture, smoke's forced
font. "Large text" means 320×844 with a 32px root.

1. **Six steps, in this order, with this copy and these anchors.** Each
   `sel` is exactly the list given; no step has a `before`.

   | # | Title | `sel` | Body |
   | --- | --- | --- | --- |
   | 1 | Who is here tonight | `['#phrasePlayers']` | Everyone on the roster is available. Tap the number of players to mark who isn't here, and the rotation rebuilds. *(unchanged, byte for byte)* |
   | 2 | How the minutes get shared | `['#phraseStrategy']` | *(unchanged `lines`)* **Even**: as close to equal as the clock allows. **By hand**: you set each player’s total yourself. **Closers**: even early, then a group you pick finishes. **Platoon**: fixed fives that swap as whole units. |
   | 3 | Rules and lineups | `['#phraseRules']` | Tap here to add rules the plan keeps, like a starting five or two players kept apart. Lineup balance lives here too. |
   | 4 | This is the rotation | `['#timeline']` | One row per player, the game clock running left to right. Open a row to see that player’s minutes, stints and rest. *(unchanged)* |
   | 5 | Timeline or card | `['#viewSeg']` | Card shows the same rotation the way it prints, sized for your pocket. Switch back to Timeline any time; the plan doesn’t change. |
   | 6 | What you use in the gym | `['#shareBtn']` | Start game opens bench mode: who is on, who is next, one tap to move the game along. This button prints the card or shares it as an image. |

   Curly apostrophes (’) in the new strings, as step 2 and step 4 use. Step 1
   keeps its straight one; `test/rule-words.test.js` pins that string.
2. **Counting.** Step k reads "Step k of 6" in `#tourStep`. `#tourDots` holds
   exactly 6 `<i>`, and only the k-th has class `on`.
3. **The end.** Steps 1–5 show Skip and "Next". Step 6 hides Skip and its
   button reads "Got it". Tapping it closes the tour, `state.tourSeen` is
   `true`, and focus goes back to where it was before the tour opened (as
   today, `closeTrap`).
4. **Every step rings its anchor at 390×844.** For each step: `#tourHole` is
   not hidden, and its rect contains the anchor's rect (for `#timeline`, the
   ring covers the timeline's top edge and is capped at 52% of the viewport
   height, the existing `CAP`). The box is fully inside the viewport and does
   not overlap the ring. On step 6 the ring is around `#shareBtn` at the top
   right and the box sits below it.
5. **Desktop.** At 1280×800 step 6 rings `#shareBtn` and the box is inside
   the viewport. (There is no fallback anchor any more; `#shareBtn` shows at
   every width.)
6. **Large text, every step.** For each of the six steps at 320×844/32px:
   `#tourBox` is fully inside the viewport on both axes; `#tourNext` is fully
   inside it and at least 48px tall; the step line and title are on screen.
   If the body does not fit, it scrolls inside the box. The box may cover
   the ring at this size (there is no room for both), but it may not run off
   any edge.
7. **No cut-off text.** All six steps are states in the 320px/32px pass, and
   `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"`
   and `--only "app shell at 320px/32px text"` both pass with no new entry
   in any allow list or known-issues list.
8. **Coaches who already saw the tour see nothing.** A record with
   `tourSeen: true` loads with the tour hidden. No new stored field, no
   version on the tour. `app/storage.js`, `app/state.js` and the `tourSeen`
   tests in `test/storage.test.js` are unchanged.
9. **Entry points unchanged.** First run still starts the tour 520ms after
   "Go to the game", now reading "Step 1 of 6". Add a team and the sample
   team still get no tour. "Show me around again" in Help and Settings still
   starts it, and both are still hidden with no games (`no-games.mjs`).
10. **Precache bump.** `app/sw.js` `VERSION` and `SHELL` are bumped with
    `npm run sw:bump`; `npm run check:history` passes before the push; the
    proof pair is green: `npm test`, then `npm run smoke -- --no-tests`.

## Surfaces

Change:

- `app/tour.js` — `TOUR` (six steps, new `sel` on step 6, new copy on steps
  3, 5, 6); the top banner and the block comment above `TOUR` ("four
  coach-marks", the paragraph about the last step's action-bar fallback,
  which no longer exists); the two "three of the four anchors" comments in
  `startTour` (all six anchors are on the game screen now).
- `app/app.css` — the `.tour-box` / `.tour-bd` rules (lines 1834–1844) for
  the height cap and the scrolling body. The `.tour-acts` large-text rule
  (line 3550) only if the fit needs it.
- `app/sw.js` — `VERSION` / `SHELL` via `npm run sw:bump`.
- `test/tour-anchors.test.js` — "four steps" becomes six, and it pins each
  step's title and `sel` in order (item 1).
- `scripts/smoke/first-run-flow.mjs:462` — "Step 1 of 4" becomes
  "Step 1 of 6".
- `scripts/smoke/overlay.mjs:188-194` — the two tour states become six,
  "tour, step 1 of 6" … "tour, step 6 of 6", built by one loop so the open
  script is written once. Step 6's close is `#tourNext` (Got it); the others
  close with Skip.
- `scripts/smoke/app-large-text.mjs:164` — the list names all six tour
  states instead of "tour, first step". (The file is 47,050 bytes against
  `test/smoke-size.test.js`'s 55,000 ceiling, so this fits.)
- A new check, `scripts/smoke/tour-steps.mjs`, and one entry for it in
  `scripts/smoke/registry.mjs` (items 2–6).
- `docs/architecture.md` lines 269–278 and 286–287 ("a four-step tour", the
  list of what it points at, the fallback anchor, "three of the four
  anchors") — for the doc-writer.

Must not change:

- `tourSeen` anywhere: `app/storage.js` (`sanitize`), `app/state.js`
  (`DEFAULT`), `test/storage.test.js`, `test/backup.test.js`.
- `app/onboarding.js` (`finishFr` and the 520ms delay), `app/shortcuts.js`
  (`tourAgain`), `app/render.js` (the no-games hide).
- `app/index.html`. The `#tour` markup already builds any number of steps
  and dots from `TOUR`.
- `placeTour`'s maths and `tourGo`'s Y-only scroll, apart from what the fit
  fix needs (see Design). `test/tour-scroll.test.js` stays as it is.
- The Plan sheet, `#viewSeg`, `#shareBtn` and the card sheet.
- `test/rule-words.test.js` — step 1's body stays exactly as it is, so this
  test passes untouched.
- Older specs in `docs/specs/`; they record what was asked at the time.

## Constraints

- **Mobile first.** Item 4 (390×844) is checked before items 5–6.
- **The card is untouched.** Nothing in `card.css`, `card.js` or the print
  path changes.
- **Precache bump.** `tour.js` and `app.css` are precached (`app/sw.js`
  lists both): `npm run sw:bump` in the same change, `npm run check:history`
  before pushing.
- **The four pure modules** (`engine.js`, `budget.js`, `storage.js`,
  `roster.js`) are not touched.
- **Words (W1, `CONTEXT.md`).** Sentence case titles. The copy uses the
  glossary's words and the labels on screen: "rules", "starting five",
  "apart" (a rule kind in `rules.js`'s `KINDS`), "Lineup balance" (the row's
  own label), "Timeline" and "Card" (the switch's labels), "Start game" (the
  button's label), "bench mode". Not "constraint", "starters", "game mode",
  "floor" for a minimum, or "printout". American spelling
  (`test/spelling.test.js`).
- **W3.** The tour is not reference material. Each body is one or two
  sentences, no longer than the longest body today (the gym step, 146
  characters; step 3 is 116). `test/feature-coverage.test.js` keeps the
  tour out of its feature list on purpose; do not add it.
- **Reduced motion (M3).** No new animation or transition. The ring still
  snaps; the body's scroll, if any, is the browser's own.
- **Accessibility (A1, A4).** Next/Got it and Skip keep `min-height: 48px`.
  If `.tour-bd` becomes a scroll container, it has to be reachable by
  keyboard (a scroller Chrome makes focusable on its own, or `tabindex="0"`
  with a name), and the smoke a11y checks over the six tour states must stay
  green.
- **The tour never opens anything.** No step gets a `before` that opens the
  Plan sheet or taps `#viewSeg`. A sheet opened with `showModal()` sits above
  the tour and makes it inert (survey item 4). Tapping the switch would also
  change the coach's saved `state.ui.gameView`.
- **Reuse, do not re-derive.** The new check imports `evalIn`, `step`,
  `setWidth`, `WIDTH`, `HEIGHT` (`dom.mjs`), `LARGE_TEXT_PX`,
  `LARGE_TEXT_WIDTH`, `LAPTOP`, `TOUCH_MIN` (`sizes.mjs`) and the tour open
  script from `overlay.mjs`'s states rather than a second copy. The expected
  titles live in one place in the check (and one in `tour-anchors.test.js`,
  which reads the source); the step count comes from the length of that
  list, not a second literal `6`.
- **No prototype PNG shows the tour** (`notes/mockups/prototype/` has none),
  so the PR shows screenshots of all six steps at 390×844 (light and dark)
  and at 320px/32px instead of a side-by-side.

## Design

### Order, and why

1. Who is here tonight — `#phrasePlayers`
2. How the minutes get shared — `#phraseStrategy`
3. Rules and lineups — `#phraseRules`
4. This is the rotation — `#timeline`
5. Timeline or card — `#viewSeg`
6. What you use in the gym — `#shareBtn`

Steps 1–3 walk the sentence in the order a coach reads it: players, then
strategy, then rules, all on the first screen with no scroll. Step 4 shows
what those three produce. Step 5 comes after the rotation, not before, even
though the switch sits just above the timeline: "Timeline or card" means
nothing until the coach knows what the timeline is, and at 390px the switch
is 46px above where step 4 left the ring, so the move is short. Step 5 also
leads into step 6: the card view is what the share button prints or sends.
Step 6 ends on what happens at the gym, as today.

At 390×844 the page scrolls once on the way down (step 4, as today) and once
back to the top (step 5). Everything else is on the first screen.

### `TOUR`

Replace the array with the six steps in item 1's table. Step 3 and step 5
are new objects with a one-line comment each saying why they anchor where
they do (step 3: the sentence's door into the Plan sheet, because the tour
cannot open a modal sheet; step 5: the switch, with no `before`, because
tapping it would change the coach's saved view). Step 6 keeps its title,
takes the new body, and its `sel` becomes `['#shareBtn']`. The
`['#abBench', '#gmOpen']` fallback pair goes: the ring is on the share
button now, and "Start game" is named in the copy. `tourGo`, `placeTour`,
`startTour` and `endTour` do not change for the step count; they already
read `TOUR.length`.

### Fitting the box at large text

Cap the box at the viewport and let only the body scroll, so the step line,
title and buttons are always on screen:

```css
.tour-box { display: flex; flex-direction: column;
  max-height: calc(100% - 20px); }          /* 10px edge, as placeTour uses */
.tour-bd { min-height: 0; overflow-y: auto; }
```

`.tour` is `position: fixed; inset: 0`, so `100%` is the layer's height. The
scratch probe measured this at 320px/32px with the new copy: every box came
out at 824px, the buttons ended at y=802, and the body scrolled (335–386px
visible of 378–701px). At 390×844 nothing changed: the tallest box is step 2
at 334px, well under the cap, and no body scrolled. `placeTour` reads
`box.offsetHeight`, which is now the capped height, so the existing
"which side has more room" and clamp logic keeps the box on screen with no
change to the maths.

If the build finds a keyboard or screen-reader problem with the scrolling
body, fix it in the same rule set (see Constraints); do not shrink the
copy to dodge it.

### The new smoke check

`scripts/smoke/tour-steps.mjs`, one registry row named from the constants,
for example `` `tour: six steps at ${WIDTH}px, ${LAPTOP}px and ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text` ``,
`setup: 'rich'`. It opens the tour through the real Help path, then for each
step reads `#tourStep`, `#tourTitle`, the dots, Skip/Next state, and the
rects of `#tourHole`, `#tourBox`, `#tourNext` and the step's anchor, and
checks items 2–6. It runs at 390×844, then 1280×800 (step 6 only is enough
for item 5), then reloads once at 320×844/32px (the way `appLargeTextPass`
sets `Page.setFontSizes` and puts it back to 16 in a `finally`). On the last
step it taps "Got it" and reads `tourSeen` back from the saved record.
Restores `RICH` before it returns, like the other rich rows do.

It must fail on today's tree. Write it first, run it with `--only`, and
record the red: at least "Step 1 of 4, want Step 1 of 6" and, at 320px/32px,
step 2's `#tourNext` below the viewport. `/new-guard` owns how.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| `test/tour-anchors.test.js`: six steps, titles and `sel` in order, every anchor an id in `index.html`, none inside a fold | `node --test test/tour-anchors.test.js` (a source-read guard, so `/new-guard`) | 1 |
| `test/rule-words.test.js`: step 1 body exact | `npm test`, untouched | 1 |
| new `tour-steps.mjs` row | `node scripts/smoke.mjs --no-tests --only "<its row name>"`; red on main first | 2, 3, 4, 5, 6 |
| the six tour states in the 320px/32px list | `--only "no cut-off text at 320px/32px text"` and `--only "app shell at 320px/32px text"` | 6, 7 |
| the six tour states in `overlay.mjs` | `--only "a11y in overlays and dialogs"` (names, ids, the last control reachable) | 3, 6 (a11y half) |
| first run starts the tour at "Step 1 of 6" | `--only "first run: welcome, three steps, every way out"` | 9 |
| no tour with no games | existing `no-games.mjs` row, full run | 9 |
| `tourSeen` unchanged | `test/storage.test.js`, `test/backup.test.js` in `npm test`, untouched; the diff touches neither `storage.js` nor `state.js` | 8 |
| screenshots of all six steps at 390×844 light and dark and at 320/32, plus one replay with reduced motion on | `/browser-verify` | 1, 4, 6, reduced motion |
| precache bump | `test/sw.test.js` in `npm test`; `npm run check:history` | 10 |
| the proof pair | the committer: `npm test`, then `npm run smoke -- --no-tests` | all |

## Out of scope

- A "what's new" note or any tour for coaches who already saw it (owner's
  decision). No tour version.
- Today, the team menu and season export. The issue lists them as possibly
  outside a first-look tour on purpose, and the owner's decision adds only
  the two steps above.
- Ringing two controls in one step. Step 6 rings the share button only;
  "Start game" is named in the copy and stays visible at the bottom, under
  the scrim.
- Announcing each new step to a screen reader. There is no live region
  today and the tour is a `role="dialog"` whose label is read when focus
  lands in it; changing that is its own issue if wanted.
- A replay with the Card view already chosen (`state.ui.gameView === 'card'`).
  Step 4's `#timeline` is hidden then, so step 4 shows its copy centered with
  no ring, as it does today. First run always starts on Timeline.
- The scrim in forced-colors mode (it is a `box-shadow`, which forced colors
  drops). Unchanged by this change.
- Step 6's copy on a part-played game, where the button reads
  "Resume · Q2 4:30" rather than "Start game". First run never has one.
