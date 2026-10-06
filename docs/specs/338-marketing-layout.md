# #338: layout fixes on the about and advanced pages

## Issue

#338 asks for three layout defects on `about.html` and `advanced.html`, found
by #332's look check, to be fixed, and for a check that guards sideways scroll
on both pages.

## Goal

A coach reading either page on a 320px or 390px phone, at normal or 200% text,
in light or dark, never sees the page pan sideways, text run out of its box,
labels pile on top of each other, or an address split mid-word.

## What would settle it

Measured in headless Chrome through the smoke harness's `land` (CI's forced
font), on `/about` and `/advanced`, at 320px and 390px, 16px and 32px root,
light and dark:

1. **advanced footer email.** At 320px/32px, `hello@benchcard.app` breaks only
   after the `@` (two lines: `hello@` and `benchcard.app`), never inside a
   word. Before: it broke as `hello@benchcar` / `d.app`.
2. **advanced 390px/16px.** `document.documentElement.scrollWidth` equals
   `clientWidth` (390). Before: 391, because the "Shape" mock's four `nowrap`
   labels (`.seg span`) need about 345px in a 317px pill, and the last one
   reaches 390.67px.
3. **about plan card at 32px text.** At 320px and 390px with a 32px root,
   every element inside the plan card's `.plate` stays inside the plate's box,
   the Q1-Q4 labels do not overlap each other, the timeline track is
   visible, and every player name shows in full (none cut to "..."), at
   16px text too. Before, at 320px/32px: "16 min" reached 314.6px against a plate
   edge near 282px, the track column was 0px wide, and the four Q labels sat
   on top of one another; at 390px/32px the track was about 12px wide and
   the labels still overlapped.
4. **No sideways scroll anywhere in the grid**: every cell above has
   `scrollWidth === clientWidth`, and no element's right edge passes the
   viewport.
5. **A guard**: `npm run smoke`'s `static pages: 2 guides + 6 charts` row
   fails on item 2's defect and on item 3's defect when either is put back,
   and passes on the fixed tree.
6. **Look check**: before and after shots of each of the three spots.

## Surfaces

Changes: `app/advanced.html`, `app/about.html`, `scripts/smoke/static.mjs`,
`app/sw.js` (`npm run sw:bump`), and the about dateline and `app/sitemap.xml`
`lastmod` if `npm run check:history` asks for them.

Must not change: `app/app.css`, any `app/*-player-basketball-rotation-chart.html`
(generated), `scripts/smoke/dom.mjs`'s `OVERFLOW_PROBE` (shared by app checks
that this ticket does not touch), `LARGE_TEXT_ALLOW` (stays empty).

## Constraints

- Mobile first: 390x844 is checked first.
- Precached pages change, so `npm run sw:bump` runs in the same change.
- `LARGE_TEXT_ALLOW` stays `{}`. Do not add an allowance or a tolerance to
  clear any of these failures; fix the page.
- Reuse, do not re-derive:
  - The email fix is about.html's own: `hello@<wbr>benchcard.app`. One
    pattern on both pages.
  - The stacked timeline row is the app's own narrow layout
    (`app/app.css`'s `.tl-row`: `grid-template-areas: "lab tot" "trk trk"`,
    the Q1-Q4 head spanning the full width). The about page's comment says
    the mock is "the timeline, as the plan view draws it"; at large text it
    draws it the way the plan view does when it is narrow.
  - The 2x2 shape control is the page's existing `@media (max-width: 24rem)`
    rule (the app's `.seg.wide`), moved to a breakpoint that covers 390px.
  - `land()` for every page load, `OVERFLOW_PROBE` as it is, `LARGE_TEXT_PX`
    from `sizes.mjs`.
- American spelling.

## Design

1. `advanced.html` footer: `hello@<wbr>benchcard.app`. `overflow-wrap:
   anywhere` stays as the fallback.
2. `advanced.html`: the `.seg` wrap rules leave the `24rem` block for their
   own `@media (max-width: 30rem)` block. Measured at a 16px root: one row
   first fits at 430px (pill 357px wide against 345px of labels), so 480px
   (30rem) leaves the 15% spare `AGENTS.md` asks of text rows. At a 32px root
   30rem is 960px, so large text keeps the 2x2 layout it has today.
   `.plate`'s padding stays at `24rem`.
3. `about.html`, inside the existing `@media (max-width: 19em)` block (live
   at 320px and 390px with a 32px root, never at a 16px root): `.tl-row`
   becomes a wrapping flex row, as the page's `.lv` rows already are. The
   name grows and is never cut; the total sits at the right of the name line
   when it fits (390px/32px) and wraps under the name when it does not
   (320px/32px); the track always takes its own full-width line. `.tl-head`
   becomes one column so the Q1-Q4 labels sit over that full-width track.
   A first build used the app's stacked grid (`"lab tot" "trk trk"`); it fit,
   but at 320px/32px it cut every name to one letter ("B..."), which is not
   readable. The `24rem` block's `--lab` also goes from 3.6rem to 4.2rem:
   at 320px/16px it was cutting "Rafael" and "Simone".
4. `scripts/smoke/static.mjs`:
   - every cell also fails when `documentElement.scrollWidth` exceeds
     `clientWidth`, naming the overshoot. `OVERFLOW_PROBE`'s 1px tolerance is
     what let a 0.67px overflow through, and `pans` read false at 391 vs 390;
     the page's own scroll width is the number the issue reported.
   - the large-text pass runs at 390px as well as 320px (all eight pages, so
     the claim in its header comment is measured rather than assumed), and
     its header comment is corrected.
   - on `/about` and `/advanced`, every cell checks that no visible element
     inside a `.plate` extends more than 1px past that plate's box, and fails
     when either page has no `.plate` (a check that measured nothing fails).
   - in the same cells, no `.plate .nm` name is cut (its `scrollWidth` is
     not over its `clientWidth`); `/about` fails if it has no names.
   - the six chart pages skip the scroll-width check at 320px/32px only: they
     measure 367 in 320 there, from their generated h1. Filed as #340, which
     removes the skip.

## Proof

- Seam: the smoke row `static pages: 2 guides + 6 charts`
  (`node scripts/smoke.mjs --only "static pages: 2 guides + 6 charts"` while
  iterating). Covers items 2, 3 (containment), 4 and 5. Red first on today's
  pages: it must fail naming advanced@390px's scroll width and about's plate
  at 320px/32px before the page fixes land.
- Guard falsification under `/new-guard`: with the fixes in, revert each of
  the two page fixes in turn and see the row go red, then restore and read
  back.
- `/browser-verify` and look shots (scratch script under `.review/`, not
  committed) for items 1, 3 (overlap and visible track) and 6, which the row
  does not judge.

## Out of scope

- The chart pages and the app shell: no change, only measured by the widened
  pass.
- Hiding or shortening any content at large text. Every label, name and total
  stays; the layout reflows.
- A general overlap detector for absolutely positioned labels.
