# 622 — The printed card: bigger, bolder, any sub pattern

## Issue

#622 asks for a new printed-card layout that reads at arm's length and holds
up whether 1, 3 or 5 kids swap at each sub.

## Goal

A coach glances at the card at the scorer's table and, in about a second,
finds the sub time, sees who goes in (white names in black boxes) and who
comes off. It works the same for a coach who swaps 3 every time, one who
swaps all 5, and one who swaps a different number each time. It works with a
roster of 5-letter names, too.

## The reference

`docs/specs/622-card-redesign/` holds the judged prototype. **Match it.**

- `prototype.mjs` builds static HTML for one game:
  `node prototype.mjs game-mixed.json mixed` writes `pocket-mixed.html` and
  `half-mixed.html` next to it. Its `<script>` is the fit algorithm, written
  against the DOM. Read it as the spec of *what* the fit decides, not of how
  the app measures (see Constraints).
- `game-{std,lines,mixed,long5}.json` are the four test games:
  - std: 3 swap every time;
  - lines: all 5 swap every time;
  - mixed: 5, 2, 4, 1, 3, 4, 4 swap;
  - long5: mixed, with every name 5 letters long. That is the app's real
    worst case, because `deriveShortNames` never prints more than 5 letters.
  Clocks are seconds left in the quarter (480 = 8:00).
- `{pocket,half}-{std,lines,mixed,long5}.png` are the renders, at 2x, that
  the judges scored.

The prototype's header and footer are stand-ins. The app keeps its own
header behavior. The footer follows this spec, not the prototype's
"all 10 play 16 min".

## What would settle it

1. **Rows.** Each printed row, left to right:
   - an empty square tick box;
   - the period name over the clock (`Q2` over `4:00`; overtime prints its
     `periodName`, `OT`);
   - the kids going in, each as a black box with white text;
   - an outlined `OUT` tag followed by the names coming off, or `ALL 5`
     when all five come off;
   - an outlined `STAY` tag followed by the names who stay on.
   A thick rule above a row starts a new period, and a thin rule above a
   row marks a sub within one.
2. **The first row of the game** (stint index 0) prints `STARTING FIVE`
   over the five names and a `BENCH` tag with the rest. Page 2 of a
   two-card game starts with an ordinary sub row.
3. **No-sub stints are not printed.** A stint where nobody goes in, other
   than the first, has no row. The period rule still goes above the first
   printed row of each period.
4. **Box sizes.**
   - Rows sending in 1-3 kids share one box font size; rows sending in 4-5
     share another.
   - The 4-5 size is at least 85% of the 1-3 size.
   - Boxes shrink, in 0.5px steps, down to a floor (pocket 13px, half 16px)
     before they wrap.
   - A row that still overflows wraps after ceil(n/2) boxes, so 5 boxes
     split 3 + 2.
5. **OUT and STAY text.** OUT is never larger than the row's boxes ×
   0.8 (pocket) or × 0.72 (half); STAY uses × 0.74 or × 0.66. Those are the
   prototype's `--ocap` and `--scap`, clamped to its `--o`, `--omin`, `--s`
   and `--smin`. OUT is weight 800. STAY is weight 600. Both are black.
6. **Pocket card.** OUT and STAY share one line under the boxes. If any row
   can't fit both on one line, even with both shrunk to their floors, STAY
   is left off **every** row of that card. OUT is never dropped.
7. **Half-sheet.** The columns are tick, time, boxes, then OUT over STAY.
   The OUT/STAY column is as wide as its longest line plus the tag, clamped
   to 205-230px. The boxes get the rest of the width.
8. **The time column never shrinks.** When a card is too tall, the boxes
   shrink first, up to 5px in 0.5px steps. Then the row padding drops to
   3px. Then only the names area scales, down to 0.8.
9. **Footer.**
   - Every card prints the key line `BLACK BOX = send in · tick the box as
     you sub`.
   - When Settings shows minutes on the card (`state.ui.showMinutes`), the
     per-kid minutes strip prints below the key line, as it does today.
10. **Long games split by period.**
    - The half-sheet's two-column layout (`columnsFor`, `.stintcols`) is
      removed.
    - A card holds as many rows as fit at the minimum row height: pocket
      44px, half 50px.
    - A game with more rows than that splits across cards by period, using
      `paginate`'s existing rule.
    - **The 8-stint, 11-player day RICH prints on one card at both sizes,
      with minutes on.**
    - **A 4 × 8 game subbed every 2 minutes (16 stints) prints on two cards
      at both sizes, titled `… Q1-Q2` and `… Q3-Q4`.**
11. **The four reference games, at both sizes, in the app.** Run each one
    through the Card view at 390×844, with the font at 16px and at 32px.
    - **No clipping:** nothing is cut off. `look.mjs`'s `findings` is empty
      for the card.
    - **No overlaps:** no row overlaps another.
    - **Same decisions as the prototype:** the same box sizes per tier
      (±0.5px), the same rows wrapped, and STAY shown or dropped the same
      way. That means STAY shows on std, lines and mixed, and is dropped on
      long5's pocket card.
12. **Jersey numbers.** With the card set to show numbers
    (`state.ui.cardId === 'number'`), the boxes, OUT, STAY, the starters and
    BENCH all print numbers.
13. **Share image.** The shared PNG shows:
    - the black boxes, filled, with white text;
    - the outlined tags;
    - the tick boxes.
    `share.js` today paints only text and horizontal borders.
14. **Still true:**
    - the card is 3.45 × 5in or 8 × 5.1in;
    - the header elides long titles and shows the `Q1-Q2` scope and `1/2`;
    - copies, print-day scope, print, the card sheet preview and first-run
      step 3 all still show the card;
    - the card is black on white in dark mode.

## Surfaces

**Changes:**
- `app/card.js`: `buildCard`, `paginate`, `CARD_SIZES`, the fit. Remove
  `columnsFor` and `COL_GUTTER`.
- `app/card.css`: the card rules. Remove `.stintcols`, `.five`, `.chg` and
  `.fresh`.
- `app/share.js`: paint background fills, all four borders, and text in its
  own color.
- `test/coach.js`: the card-reading verbs (`changeLines`, `cardFives`, `starters`) read the new rows. Keep their names where the meaning is
  unchanged; add verbs where it isn't.
- The card scenarios and smoke checks that read the old markup:
  - `test/card-scenarios.test.js`
  - `test/print-card-scenarios.test.js`
  - `test/card-columns.test.js`: delete, or turn it into the
    period-split check
  - `test/card-minutes.test.js`
  - `scripts/smoke/card-at-32.mjs`
  - `scripts/smoke/card-font.mjs`
  - anything else `grep -rlnE "\.five|\.chg|fresh|stintcols"` finds
    under `test/` and `scripts/`
- The marketing pictures of the card. Regenerate them with
  `scripts/og.mjs --card` and the welcome "On paper" image, as that
  script's header says.
- `scripts/whats-new.json`, `app/whats-new.html` and `app/sitemap.xml`
  (step 5's coach note).

**Must not change:**
- `engine.js`, `budget.js`, `storage.js` and `roster.js`;
- the plan itself and `effectiveStints`/`effectiveMinutes` in `state.js`;
- the print `@page` and the two card sizes.

## Constraints

- **Measure with canvas, as today.** The AGENTS.md trap applies: the fit
  is computed from `widthAt` (canvas `measureText`) with `CARD_FONT`, and
  cards re-fit once `document.fonts.load` settles. Do not port the
  prototype's DOM `scrollWidth` measuring. `#sheet` can be hidden, and the
  previews are clones that are never fitted. Reuse `widthAt`, `fitHeadline`,
  `elideMiddle`, `labelsFor`, `paginate` and `effectiveStints`. Do not
  re-derive the in, out or stay lists: `in`, `out` and `onFloor` are already
  on each stint. STAY is `onFloor` minus `in`.
- **Never regress the card.** It stays 3.45 × 5in and legible. The pocket
  card's padding, header sizes and row sizes come from the prototype. If
  you change `CARD_SIZES` (`oppPx`/`whenPx`/`markPx`), change the matching
  CSS too: the comment on `CARD_SIZES` says why.
- **The card is paper.** It is `#000` on `#fff` in both themes, with no
  grays for names.
- **Mobile first.** The card preview is checked at 390×844.
- **Copy.** The key line wording is exact.

## Design

- `buildCard` emits one `.row` per printed stint. In each row: `.tick`,
  `.t` (`.q` and `.c`), then the boxes (`.chips` of `.chip`), then `.grp`
  units (`.k` tag plus `.o` or `.s` names), matching the prototype's class
  names where they don't collide with `app.css`. `test/css-collide.test.js`
  checks for collisions; rename where it fails.
- The fit runs in JS before the card goes in the DOM:
  1. Compute each row's widest-fitting box size from canvas widths: the
     names, the chip padding and the gaps against the available width.
  2. Pick one size per tier.
  3. Cap OUT and STAY.
  4. Make the pocket STAY decision.
  5. Size or wrap the text.
  6. Fit the height.
  The result is applied as inline font sizes and classes (`.wrap`, `.br`,
  `.nostay`). The rows are a flex column with `flex: 1 1 auto`, so they
  spread to fill the card.
- Rows per card come from the minimum row height (item 10). Wire them into
  `paginate` in place of `perColumn() * cols`.

## Proof

- **Coach seam** (`test/coach.js`, `node --test`), for items 1-3, 9, 10, 12
  and 14:
  - a coach opens the Card for RICH's day and for a 16-stint day, at both
    sizes, with minutes on and off, and with numbers on;
  - the test reads what the card prints: rows, tags, names, STARTING FIVE,
    BENCH, the key line, the titles and the card count.
  - New fixtures for the four reference games go in
    `scripts/smoke/fixtures.mjs` or the coach state fixture, whichever the
    existing scenarios use.
    The solver will not choose these exact swaps on its own. Produce each
    game's stints the way a coach would: hand swaps (`live.overrides`)
    or a fixed order. Use the real roster of 10 and the names in the JSON
    files.
- **Smoke** (layout), for items 4-8 and 11:
  - one check renders the four reference games at both sizes;
  - it asserts the box sizes per tier, the wraps, STAY shown or dropped, no
    clipping or overlap, and the time column's font size unchanged at 16px
    and 32px.
- **Share** (item 13): a smoke or scenario step that shares the card. It
  reads the PNG's pixels where a box sits and checks they are dark.
- **`/browser-verify`** at the end: screenshots of the four games at both
  sizes, side by side with the prototype PNGs, for the PR.

## Out of scope

- Per-kid minutes in rows, or room to write off-plan changes.
- A filled OUT tag or a bigger "OUT ALL 5". The judges suggested both; they
  belong in a later issue.
- Changing what the plan decides.
