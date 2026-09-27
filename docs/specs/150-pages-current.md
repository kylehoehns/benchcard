# About, Advanced and How it works describe the app as it is

## Issue

#150. The About page, the Advanced page and the in-app How it works sheet
(`#help` in `app/index.html`) still describe the app from before the
redesign. They use old names, point at controls that moved, and draw rules
as chips the app no longer has.

## Goal

A coach who reads any of the three and then opens the app finds the same
names, in the same places, doing the same thing. Nothing on those pages
sends them looking for a row of steps under a name, a ✕ on a rule, or a
button labeled "Undo in-game changes".

## Decided with the maintainer

- **App strings:** the three pages, plus every app string that says
  "rotation level" (the level control's accessible name and the tie message
  in `state.js`). Bench mode's "maximum" block reasons, `rules.js`'s "minute
  limits" and `engine.js`'s "capped at" are **not** in this change.
- **Search data:** the `<head>` JSON-LD's "minute floors and ceilings" is
  reworded. (#149 kept "substitution" in the head for search. Nobody
  searches for "floors and ceilings", so that reason does not apply here.)
- **Rule mocks:** redrawn as rule rows, the way the Rules page shows them:
  plain text and a chevron, with the app's exact sentences. The red and
  green chip styling goes. The sentence about "the red chip" is rewritten
  to say the plan reports it in the note under the plan.

## What would settle it

Page copy means body text with comments stripped, as `test/glossary.js`'s
`htmlBodyCopy()` reads it. For `index.html`, "How it works" is the `#help`
sheet's body copy.

1. **Balance shape is Steady.** `about.html` and `advanced.html` call the
   shape **Steady**, as `balance.js` and How it works already do:
   - about.html's shape list (`<b>Even</b> — every stint…`, ~936) and
     advanced.html's list (~470) read `<b>Steady</b> — every stint about as
     strong as every other.` The sentence after the dash is unchanged,
     because `scripts/feature-keys.mjs` proves `shape:even` by it.
   - advanced.html's mock seg (~457) reads `Steady`, not `Even`.
   - `<h3>Even</h3>` (the strategy) on both pages is unchanged.
   - `scripts/feature-keys.mjs`'s comment about the Even/Steady split
     (~102-113) says what is true after this change.
2. **Levels have their current names.**
   - No page copy on the three says "rotation level" or "rotation levels".
     about.html ~892 and advanced.html ~464 say "a level"; the plate header
     at about.html ~900 reads "Team · levels".
   - The about.html mock's level words match `balance.js`'s labels. The two
     rows that read "Rotation" (~915, ~920) read "Regular". The level
     column still fits "Regular" at 390 and at 320/32 (no clipping, no
     wrap inside the word).
   - `balance.js`'s level control `aria-label` is `Level for ${name}`
     (`Level for this player` when there is no name).
   - `state.js`'s tie message (~1275) reads "…: the lower levels, which is
     how this team settles a tie."
   - `test/leak.test.js`'s patterns that name "Rotation level" follow the
     new label, so they still catch a level name leaking to the card.
3. **Levels are set where they are set.**
   - How it works (~1758): levels are set on the **Team** page by tapping a
     player and choosing their level in the sheet that opens. Not "the row
     of steps under their name".
   - about.html's figcaption (~928): the same place, in about.html's own
     voice. Not "Five steps, set once on the Team page and dragged with a
     thumb" as if the steps sat on the Team page.
4. **Rules are rows.**
   - How it works (~1776): a rule is removed by opening it and tapping
     **Remove rule**. No "carries its own ✕".
   - about.html (~958-967) and advanced.html (~493-502) draw the rules
     list as rows: each row is one sentence and a chevron, styled like the
     Rules page's rows. No `rchip` class, no ✕, no red or green state.
   - Every mocked sentence is exactly what `state.js`'s `ruleItems()`
     prints for that rule:
     - "Simone plays at least 10 min"
     - "Cole plays at most 12 min"
     - "Bria and Ty together"
     - "Noah and Mia apart"
     - "Bria, Cole, Noah, Rafael and Ty start the game"
     - "Nobody plays more than 2 stints in a row"
     - "Rafael or Devon is always on the floor"
   - The figcaptions say how a rule is removed (open it, Remove rule), not
     "in one tap".
   - advanced.html (~529-531): when two rules cannot both hold, the plan
     says so in the note under the plan. No "chip", no "red chip".
5. **Rule names match the Add rule screen.** How it works's
   "Plays at least / Plays at most" entry (~1781) no longer says "a
   minimum, a maximum". It says what the two do in the app's words: for
   example "The fewest minutes one player gets, the most, or both."
6. **The bench-mode reset is named as the coach sees it.** How it works
   (~1851) no longer says "**Undo in-game changes** in the top bar". It
   names the control by what it does and where it is: the round-arrow
   button at the top of bench mode, "Back to the printed plan" (its
   accessible name, `#gmReset`), which shows once something has changed.
7. **The search data is current.** `index.html`'s JSON-LD `description`
   and `featureList` do not say "floors and ceilings". They say
   "minimums and maximums" or the app's own words. Nothing else in the
   `<head>` changes. `<noscript>` is unchanged.
8. **A guard keeps them out.** A new test, in `test/prose.js`'s style
   (`lacks`, whitespace-safe), fails if the page copy of about.html,
   advanced.html or `#help` contains any of:
   - `rotation level` (any case, singular or plural)
   - a level named Rotation (`lv-word">Rotation`)
   - `<b>Even</b> —` or a seg reading `Even` in advanced.html's shape mock
   - `rchip`, `carries its own ✕`, `in one tap`, `red chip`
   - `Minutes limit`, `floor and ceiling`, `floors and ceilings`,
     `a floor, a ceiling`
   - `Undo in-game changes`, `row of steps`

   The index.html JSON-LD is checked for `floors and ceilings` in the same
   test. The strategy heading `<h3>Even</h3>`, "On the floor", "Rest limit"
   and the sheets' ✕ close buttons are **not** caught. The test is shown red
   by planting at least three of the phrases, one per page.
9. **Images show the current app.** Regenerate with `scripts/og.mjs`:
   - `app/bench-sample.png`. Bench mode has changed since it was made
     (#156, #164, #166, #169, #171). Its `alt` in about.html (~788)
     describes what the new image shows, for example "Next change at…",
     not "NEXT SUB".
   - `app/card-sample.png` and `@2x`, and `app/og.png`: regenerate, then
     compare with the committed files. Keep whichever is current; if the
     new one differs, commit it. Every `alt` that quotes on-screen text
     quotes what the committed image shows. `og.png`'s alt quotes the game
     sentence; check it against the image.

## Surfaces

Change:
- `app/about.html`, `app/advanced.html` (body copy, the two mocks, alts,
  about.html's footer dateline, and any mock CSS the rows need)
- `app/index.html` (`#help` body copy and the JSON-LD only)
- `app/balance.js` (the one aria-label)
- `app/state.js` (the one tie message)
- `app/bench-sample.png`, and `card-sample*.png` / `og.png` if they changed
- `scripts/feature-keys.mjs` (the comment only, unless the proof needs more)
- `test/leak.test.js` (the patterns), a new guard test
- `app/sw.js` VERSION and SHELL

Do not change:
- `app/engine.js`, `app/budget.js`, `app/storage.js`, `app/roster.js`
  (the pure modules)
- `app/gamemode.js`, `app/rules.js`, and `engine.js`'s messages (decided:
  out of scope)
- the `<noscript>` block, and the `<head>` apart from the JSON-LD
- the six chart pages (the survey found none of these words on them)

## Constraints

- **One answer lives in one place.** The rule sentences come from
  `ruleItems()`. The mocks copy them exactly, and the guard does not
  hold its own copy of them.
- **CONTEXT.md is the vocabulary.** Steady (not Even) for the shape;
  Level, and the five labels in `balance.js`; Rule, Minimum, Cap. The
  glossary names **Minimum** and **Cap** on about/advanced (~974, ~507)
  stay. They are CONTEXT.md's terms.
- **Keep #149's guard green.** `test/one-name.test.js` and
  `test/static-pages.test.js` must still pass.
- **`scripts/feature-keys.mjs` must still find every feature** on
  about/advanced. The Steady sentence keeps its wording for that reason.
- **`about.html`'s dateline moves with its content.** The "history" CI job
  checks it (`scripts/check-about-date.mjs`): both halves of the `<time>`
  are set to the commit's date.
- **Precache bump.** If a precached file changes, bump `VERSION` and set
  `SHELL` to the digest `npm test` names.
- **Interface guidelines W1, W2.** Any button or label text in a mock is
  sentence case and names its result ("Remove rule").
- American spelling.

## Design

- Copy edits on the three pages, as listed above.
- about/advanced mocks: replace each chip list with a list of rows.
  Borrow the look of the app's rule rows (a hairline between rows, the
  sentence on the left and a chevron on the right) using the static
  pages' own CSS. They do not load `app.css`. Drop the `rchip`, `ok`,
  `err` and `x` rules and add row rules in the same place. The level
  column in the about.html level mock is re-checked for "Regular".
- Two one-line code changes: `balance.js`'s aria-label and `state.js`'s
  tie message.
- The images come from `node scripts/og.mjs --bench app/bench-sample.png
  --card app/card-sample.png`, which also writes `og.png`.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| The new guard (named source-reading seam, `/new-guard`), shown red by planting | `node --test test/<new guard>.test.js` | 1–8 |
| The level control's accessible name | an existing `balance` test, or a new case beside it, that renders `levelMeter` and reads its `aria-label` | 2 |
| The tie message | the test that already covers `state.js`'s issue messages (find it), updated | 2 |
| Leak patterns still catch a level leak | `node --test test/leak.test.js` | 2 |
| Features still found | `node --test test/feature-coverage.test.js` (or whatever runs `feature-keys.mjs`) | 1 |
| #149's guards | `node --test test/one-name.test.js test/static-pages.test.js` | all |
| Look: about.html level mock and rules mock, advanced.html shape mock and rules mock, How it works (Lineup balance, Rules, Sit for the rest), at 390 light and dark and at 320/32 | `/browser-verify` (me, on the preview) | 2, 3, 4 |
| The images | viewing the regenerated PNGs against the committed ones | 9 |

## Out of scope

- Bench mode's block reasons ("Plays at most maximum"), `rules.js`'s
  "minute limits" / "over a limit", and `engine.js`'s "capped at" / "a
  limit of". These were decided out of this change.
- Adding #150's words to CONTEXT.md's `_Avoid_` lists. Most of them
  collide with good uses ("Even" the strategy, "On the floor", "Rest
  limit"), so the dedicated guard holds them instead.
- The six chart pages, README, and `docs/`.
