# 72 — Fit all 9 player rows on the game screen

## Issue

#72 (child of #18): on a 390 × 844 phone the game screen shows 5 of 9 player
rows before scrolling, and the prototype shows all 9. Move the lineup-balance
note below the timeline, make the rows short, and make each player's name the
button that opens their details.

## Goal

A coach glancing down at the bench, phone in one hand, sees the whole
rotation — every player, and the Start game button — without scrolling. They
can still tap a player's name to see that player's breakdown, and tap it again
to close it.

## Survey (2026-09-17, on `a852110`)

- **The note.** The "balance note" the issue means is the
  `#issues` box (`renderIssues`, `app/plan-view.js`). With the `?try=9`
  sample it holds one info alert, the engine's `SPREAD_FLOOR` line ("Best
  possible spread with 9 players and 4-minute stints is 4 minutes. …"). It
  sits in `section.s-rot` in `app/index.html`, between the Rotation header
  and `#timeline`. Measured at 390 × 844: `#issues` top 380px, `#timeline`
  top 514px, so the box and its margin take 134px.
- **The rows.** `renderTimeline` (`app/timeline.js`) builds each
  `div.tl-row` with `role="button"`, `tabindex="0"`, an `onclick` and an
  `onkeydown` (Enter/Space) that toggle `tlPinned`; `aria-label`,
  `aria-expanded` and `aria-controls="tlDetail"` are set on the row.
  `.tl-row` has `min-height: 48px` (`app/app.css`), so each row is 48px.
  Measured: rows at 539, 587, … 923; `#actionbar` top 771px; 4 rows fully
  visible above it (the issue says 5, counting a partly hidden one).
- **The skeleton.** `app/index.html` paints bare `.tl-row` markup before boot
  so nothing jumps when the plan lands; it has to stay the same height as a
  real row.
- **The copy.** `timelineEmpty` says "No rotation yet. Resolve the errors
  above." That sentence is about `#issues`.
- **The guards.** `scripts/smoke-checks.js` has the app-wide
  `touch targets ≥ 44px` sweep (structural: every `button` and
  `[role=button]`) and the `today and game controls ≥ 48px` list, which
  names `.tl-row`.
- **The budget.** With the note moved, the timeline would start at about
  380px and the rows at about 405px. 771 − 405 = 366px is left for 9 rows,
  so the row pitch (row top to next row top) can be at most about 40px.

## The one conflict, and the call made

The issue asks for rows "close to the prototype's ~31px" **and** a name
button whose tap area is at least 48 × 48px **without** overlapping its
neighbors. In a single column, a tap area can be no taller than the row
pitch without overlapping the next one. So both cannot hold at once when the
pitch is under 48px, and 9 rows at 48px do not fit (9 × 48 = 432 > 366).

The issue itself says what to do: use the largest height that avoids
overlap, and say so in the PR. So:

- **Row pitch is 2.25rem (36px at the default text size)** in the one-row
  layout. That is 5px taller than the prototype, for a bigger target, and it
  leaves about 40px of slack under the ninth row at 390 × 844, so a font
  that wraps differently does not push a row under the action bar.
- **The name button fills the whole row pitch**: 36px tall, and as wide as
  the name column (6.5rem = 104px, well over 48). No gaps between rows, so
  the targets touch but never overlap.
- **In the stacked layout** (the timeline narrower than 20em — 320px, and
  any width with large text) the name sits on its own line above the track,
  and the button there is at least 48px tall, so I1 holds in full there.
- The PR says all of this.

## What would settle it

1. At 390 × 844, light and dark, with the `?try=9` sample: all 9
   `.tl-row[data-id]` rows lie fully between the top of the viewport and the
   top of `#actionbar`, and `#abBench` (Start game) is fully on screen, with
   `scrollY` 0. Side-by-side images with `light-game-timeline.png` and
   `dark-game-timeline.png` are committed under
   `notes/mockups/prototype/compare/72/` and shown in the PR.
2. Each row shows the color dot, the full name (`tlName`) and the total,
   at the sizes #69 set (`--fs-secondary` 500 name, `--fs-footnote` 600
   total). Nothing is shrunk to make the rows fit.
3. Each name is a real `<button type="button" class="tl-name">` inside
   `.tl-lab`. Its box is the tap area: at least 48px wide, and at least
   `min(48px, row pitch)` tall, where the row pitch is the distance from its
   row's top to the next row's top. No two name buttons overlap. The row
   itself has no `role`, no `tabindex` and no click handler.
4. Tapping a name pins that player: the row gets `.pin`, the `.tld` panel
   (`#tlDetail`) opens directly under the row with the same content as today.
   Tapping the same name again closes it; tapping another name moves the pin.
   The ✕ in the panel still closes it. The button carries what the row
   carried: `aria-label` (name, minutes, the most/fewest word, stints on the
   floor), `aria-expanded` (`"true"` only when pinned) and
   `aria-controls="tlDetail"` only when pinned. Enter and Space work because
   it is a native button.
5. At 320px wide with a 32px default font size, nothing on the game screen
   is cut off or overlaps, and there is no scroll on the x axis (the
   existing `app-large-text` smoke state for the games view stays at zero).
   Fewer rows fitting there is fine.
6. `#issues` is the next sibling after `#timeline` inside `.s-rot` (before
   `#stats`). Its content is unchanged. Because the error alerts now sit
   below the timeline too, the empty-state line reads "No rotation yet.
   Resolve the errors below."
7. `npm test` and `npm run smoke` pass. Tests written against the old row
   markup are updated in the same change.
8. The printed card is unchanged: `app/card.css` and `app/card.js` are not
   touched, and the smoke card checks stay green.

## Surfaces

Change: `app/timeline.js`, `app/app.css`, `app/index.html` (move `#issues`;
the skeleton row markup if needed to keep its height), `app/sw.js` (VERSION
and SHELL), `scripts/smoke-checks.js`, `scripts/smoke/` (a new fit check and
its registry row), `test/` (new and updated cases), `scripts/budgets.mjs`
(only if a byte ceiling is crossed), `docs/` via doc-writer.

Must not change: `app/card.css`, `app/card.js`, the printed card, the four
pure modules (`engine.js`, `budget.js`, `storage.js`, `roster.js`),
`app/about.html` (its demo `.tl-row` is its own CSS), `renderIssues`'
content, `scripts/budgets.json` `requests`, any element id.

## Constraints

- `docs/interface-guidelines.md`:
  - **I1** — the 48px rule now applies to the name button, not the row.
    Where the pitch is under 48px (the one-row layout), the button takes
    the whole pitch; that is the issue's own fallback, and the PR says so.
  - **L1** — the timeline stays unboxed.
  - **L2** — Start game stays in the floating action bar; nothing moves it.
  - **C1** — the header is not touched.
  - **T1–T3** — rem only, sizes from the seven `--fs-*` tokens, weights
    400–700. No new font-size token. The row pitch is in rem.
- The name button looks like the label it replaces: no button chrome, no
  underline, no tint (K1 does not allow tint here). Focus is visible with the
  app's existing focus ring.
- Reuse, do not re-derive: `tlName` for every label (the test pins it), the
  existing `tlPinned` toggle and `renderPinned`, the existing `aria-label`
  text, `el()` from `dom.js`. Keep the reconcile-not-rebuild shape: the
  button is built once with the row, and written into on later renders.
- Hover dimming and the `.pin` look stay on the row.
- The skeleton (`index.html`) stays exactly the height of a real row, so
  nothing jumps on boot.
- Mobile first: measure at 390 × 844 first.
- If a precached file changes, bump `VERSION` in `app/sw.js` and set `SHELL`
  to the digest `npm test` names, in the same edit.
- Byte budget overruns: widen the slack in `scripts/budgets.mjs` and say why.
  Never re-record `requests`; never run `--update-budgets`.
- Guards (smoke checks, source-reading tests) are written under
  `/new-guard`: watch each one fail against a broken tree before trusting it.
- American spelling.

## Design

1. **Markup** (`renderTimeline`). The row is a plain `div.tl-row` with
   `data-id` and `--c`. `.tl-lab` holds one `button.tl-name` (type button)
   that contains `span.dot` and `span.nm`. Its `onclick` toggles `tlPinned`
   and re-renders, exactly as the row's did. The later-render name update
   still writes `.nm`. The per-render loop sets `aria-label`,
   `aria-expanded` and `aria-controls` on the button instead of the row.
   `renderPinned` still inserts the panel after the row.
2. **Note.** Move `<div id="issues" …>` below `#timeline` in `index.html`,
   keeping its attributes. Update the empty-state sentence to "below".
3. **CSS, one-row layout** (`@container (min-width: 20em)`): `.tl-row` has
   no min-height beyond `2.25rem`, no vertical padding, and
   `align-items: stretch` for the label so the button fills the row; the
   track stays 1rem tall and centered, and the total stays centered.
   `.tl-name` is `display: flex; align-items: center; gap: .4rem;
   width: 100%; min-height: 2.25rem;` with no background, border or padding,
   inheriting color and font, and text-align left.
4. **CSS, stacked layout** (the default rule): `.tl-name` has
   `min-height: 48px` so I1 holds in full; the row keeps its current stacked
   grid.
5. **Base `.tl-row`** loses `min-height: 48px` and `cursor: pointer`
   (`.tl-name` gets the pointer cursor).
6. **Skeleton**: the skeleton's `.tl-lab` content must produce the same row
   height. If the name button's height is what sets it, give the skeleton the
   same structure (a `span.tl-name` wrapper is fine, it is `aria-hidden`).

## Proof

- **Smoke `game rows fit` (new, `scripts/smoke/`)** — loads `?try=9` on a
  wiped origin at 390 × 844 (reuse `tryLanding`'s pattern or the helper
  itself), in light **and** dark, and asserts item 1: 9 rows, each fully
  between 0 and `#actionbar`'s top, `#abBench` fully on screen, `scrollY` 0.
  Also asserts item 3's geometry on the same page: each `.tl-name` is at
  least 48px wide, at least `min(48, pitch) − 0.5` tall, and does not overlap
  the next one. Registered in `registry.mjs`; AGENTS.md's check count is
  updated by doc-writer. Covers 1, 3.
- **The touch sweeps** (`scripts/smoke-checks.js`): `.tl-row` leaves the
  `today and game controls ≥ 48px` list (it is no longer a control).
  `.tl-name` is measured by the new check above, which owns its rule, so the
  two generic sweeps skip `.tl-name` in the one-row layout only — when its
  height equals its row pitch — and a comment says why and points at the
  new check. In the stacked layout it stays in both sweeps. Covers 3.
- **Smoke `app-large-text`** (existing): the games view at 320px / 32px
  stays at zero on both axes. Covers 5.
- **Smoke card checks** (existing) stay green. Covers 8.
- **`node --test`, a new `test/timeline-name-button.test.js`** — drives
  `renderTimeline` through a minimal DOM stub if the module can be loaded
  that way; otherwise it is a named source-reading guard under `/new-guard`
  that asserts: no `role`/`tabindex`/`onclick` on `.tl-row`, a
  `button` with class `tl-name` carries `aria-expanded`, and the empty-state
  copy says "below". Covers 3, 4 (the markup half), 6.
- **A smoke step for the toggle** (in the new check or its own): click the
  third `.tl-name` → `#tlDetail` exists directly after that row and the
  button's `aria-expanded` is `"true"`; click it again → no `#tlDetail`,
  `aria-expanded="false"`; focus the button and press Enter via CDP
  `Input.dispatchKeyEvent` → opens. Covers 4.
- **A smoke or node check for the note's place**: `#timeline`'s next element
  sibling is `#issues`. Covers 6.
- **`/browser-verify`** by the orchestrator: the side-by-side images and the
  320px large-text image. Covers 1, 2, 5.

## Out of scope

- #29: the Timeline | Card switch, the summary line under the timeline, and
  moving Shuffle.
- #33: floating controls and collapsing titles.
- Changing the sentence's line height, the header, or the Rotation header
  to win more room.
- First names on the timeline (full names stay; a test pins them).
- `app/about.html`'s demo timeline.
