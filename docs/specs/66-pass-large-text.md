# #66 — A game's card on Today is cut off at 320px with 32px text

## Issue

#66. At 320px wide with 32px text, the one-line pass summary on a Today game
card is cut off, so a coach using large text cannot read its end (the rule
count). The owner's comment on the issue adds the card's top row: the status
runs past the card's inner edge into its padding at the same size.

## Goal

A coach with large text on a small phone can read every word on each Today
game card: the name, the tip-off, the status and the whole summary. At normal
text sizes the card looks as it does now, except that a summary too long for
one line wraps instead of ending in "…".

## Decisions

The issue is unlabelled. Each question here is answered by the repo's
guidelines, so none is the owner's to decide:

- **Wrap, do not shrink.** `docs/interface-guidelines.md` T2: "Lay out for
  200%: rows grow and side-by-side pieces stack." The issue itself says
  wrapping onto a second line is fine.
- **The top row and title change only inside the existing
  `@media (max-width: 19em)` block.** That block is the app's large-text stage: at 16px text it needs a viewport under 304px, so
  it never fires at 320px or wider at default size. That is what keeps "at
  normal sizes it still shows on one line" true without a second rule.
- **The top row wraps.** `.pass-top` gets `flex-wrap: wrap`, so the status moves
  under the tip-off when both do not fit, instead of running into the padding.
  The tip-off stays on one line (`white-space: nowrap`) so "9:00 AM" does not
  break into "9:00 / AM"; a whole row is the better break than half a time.
- **The title wraps too.** At 320/32 the title "Panthers" shows as "Pant…".
  That is a real team name cut off, which the same T2 rule and the repo's
  look-check standard (clipping blocks a merge) both rule out. It wraps and
  breaks a long word if it must (`overflow-wrap: anywhere`), rather than
  truncating. It is in the same card and the same cause, so it is in scope.

- **The summary wraps at every size, not only at 19em.** The build found
  that Ravens' full summary is already cut off on `main` at 390px with 16px
  text (scrollWidth 346px in a 332px box). The issue's goal is that the whole
  summary can be read. Its "one line at normal sizes" item was written to keep
  the normal look, not to require an ellipsis. So `.pass-summary`'s base rule
  wraps (`white-space: normal`), and a summary that fits stays on one line.
  The title keeps its base rule: every fixture name fits at 390px, and a long
  team name at normal size is a separate question.

## What would settle it

Measured with the `FOUR` fixture (`scripts/smoke/fixtures.mjs`) on Today. Its
second game, Ravens, has the full summary
`11 players · even minutes · evens out the day · 2 rules`.

1. At 320px wide with a 32px root, for every `.today-game` card:
   - `.pass-summary`, `.pass-title`, `.pass-when` and `.pass-status` each have
     `scrollWidth <= clientWidth` (nothing is ellipsized or clipped);
   - `.pass-top`'s `scrollWidth <= clientWidth`;
   - every `.pass-status`'s right edge is at or left of the card's content
     edge (the card's right minus its `padding-right`), within 0.5px;
   - Ravens' `.pass-summary` `innerText` is the full string above.
2. At 390px wide with a 16px root, no `.pass-summary` is ellipsized, and
   Ravens' reads the full string. Panthers', Game 3's and Owls' summaries are
   one line: height no more than one line-height (computed `line-height`, or
   1.5 × font size when `normal`) plus 1px. Every `.pass-title` is one line
   and not ellipsized. `.pass-top` is one row (the tip-off and status tops are
   within 2px of each other).
3. At 320/32 the page does not pan sideways (the existing large-text pass
   keeps `today` at zero; `APP_LARGE_TEXT_ALLOW` stays empty).
4. `npm test` and `npm run smoke` pass.

## Surfaces

Changes: `app/app.css` (rules inside the existing `@media (max-width: 19em)`
block, plus `.pass-summary`'s base `white-space`), `app/sw.js` (`VERSION`, `SHELL`), one smoke check, and whatever
the registry/count pins need (`scripts/smoke/registry.mjs`,
`scripts/smoke.mjs`, `test/smoke-only.test.js`).

Must not change: `passSummary` and its words, `renderPass`, the `.pass-*`
rules outside the 19em block except `.pass-summary`'s `white-space`,
`APP_LARGE_TEXT_ALLOW`.

## Constraints

- **Mobile first, T2:** wrap rather than shrink or hide.
- **The 19em block's order note:** it must stay after the 620px and 385px
  blocks. Add the new rules inside it, with a short comment in the block's
  style saying why.
- **Reuse, do not re-derive:**
  - Use the `FOUR` fixture and `reloadWithRecord` from `fixtures.mjs`, and
    `LARGE_TEXT_PX` / `LARGE_TEXT_WIDTH` from `registry.mjs` for 32 and 320.
    Do not hard-code them.
  - Set the font size the way `app-large-text.mjs` does (set it, then reload).
  - Do not copy the expected summary out of `passSummary`; the fixture's
    expected string already lives in `game-passes.mjs` (`buildWant`). Export
    and read it, or compare against the literal once with a comment naming
    where it comes from.
- **`OVERFLOW_PROBE` cannot see this defect:** it compares edges to the
  viewport, not to a card's padding, and it cannot see ellipsis. The new check
  must measure `scrollWidth` against `clientWidth` and the status against the
  card's content edge directly.
- **Precache bump:** `app.css` is precached. Bump `VERSION` in `app/sw.js` and
  set `SHELL` to the digest `npm test` names.

## Design

- `app.css`, base rule: `.pass-summary` wraps (`white-space: normal`, no
  ellipsis).
- `app.css`, in the 19em block:
  `.pass-top { flex-wrap: wrap; }`,
  `.pass-when { white-space: nowrap; }`,
  `.pass-title { white-space: normal; overflow-wrap: anywhere; }`. The
  summary needs nothing here, since its base rule already wraps, and it is
  built from short words, so it never needs a mid-word break.
- A smoke check, `scripts/smoke/pass-large-text.mjs` (or a function added to
  `app-large-text.mjs` if that reads better), that loads `FOUR` at 320/32 and
  asserts item 1, then at 390/16 asserts item 2. It must go red on `main`
  before the CSS lands.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| New smoke check at 320/32 and 390/16 over the `FOUR` fixture | `npm run smoke` | 1, 2 |
| Existing large-text pass, `today` pinned at zero | `npm run smoke`, `app-large-text.mjs` | 3 |
| `/browser-verify` on the preview at 390×844 and 320px/32px | preview | 1, 2 |

## Out of scope

- Any wording change to the summary or status.
- Other screens' large-text layout.
