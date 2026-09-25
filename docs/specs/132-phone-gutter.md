# #132 — Phone screens use an 11px side margin instead of 16px

## Issue

#132 (a sub-issue of #153). On a phone, Today, the game screen, Team, Season
and Settings sit 11.2px from each side of the screen. L6 and the prototype
both use 16px.

## Goal

On a phone, the content of those five screens starts 16px from the left edge
and stops 16px from the right. That is the same inset the sheets and the
Add a game flow already use. With the phone's text size turned up, the margin
grows with the text, the way the sheets' margin already does. Nothing wider
than a phone changes.

## Decisions

The survey below was run at 699987e, in a browser, on the `RICH` smoke
fixture.

- **Change one number: `.7rem` becomes `1rem` in the phone rule.**
  `app/app.css:1979` is
  `@media (max-width: 620px) { .wrap { padding-left: .7rem; padding-right: .7rem; } }`.
  Every screen the issue names gets its side padding from `.wrap` and from
  nothing else. Today, Team, Season and Settings are `<main class="view wrap">`
  (`index.html:472, 1013, 1196, 1242`). The game screen is a `.wrap` inside
  `#view-games` (`index.html:513`). No view block and no inline `style=` sets
  side padding. The three `style="max-width:820px"` attributes only set a
  width, and the one inline `padding` (`index.html:390`) is on the
  no-JavaScript notice.
- **`1rem`, not `16px`.** T2 says to size in `rem`. The sheets
  (`.pgrp { margin: 1.1rem 1rem 0 }`, `app.css:3073`) and the flow
  (`.flow-f { padding: 0 1rem }`, `app.css:2768`) already use `1rem`, and
  measure 16px at a 16px root and 32px at a 32px root. The screens should
  match them at every text size, not only the default one.
- **Keep the phone rule and edit it. Don't raise the base `clamp()` floor.**
  The base rule (`app.css:302`) is `clamp(.85rem, 2.6vw, 1.5rem)`. Raising
  its floor to `1rem` and deleting the phone rule gives the same result on a
  phone. But it also changes widths from 621px up whenever the text is
  enlarged. Editing the phone rule changes nothing above 620px. At 621px the
  base rule gives 2.6vw = 16.1px, so the step from 16px is under 1px.
- **Give the rule its own comment.** The comment above it today describes
  the footer that #33 removed, not this rule. Replace it with one line that
  names L6 and #132.
- **No spacing token.** `app/tokens.css` has none: no `--sp-*`, `--gutter`
  or `--space-*`. #152 adds the spacing scale and will tokenize every spacing
  literal at once, this one included. Adding one token here would decide
  #152's naming ahead of it. `1rem` is the same literal the sheets and the
  flow already use, so this adds no new value.
- **The Today cards, the Team list, the Season blocks, the Settings groups and
  the game screen's day header, sentence and columns all move with it.** None
  of them has its own side inset. Each measured exactly at the `.wrap`
  padding (11.2px, or 22.4px at a 32px root).

**Decided by the owner on 2026-09-25.** The survey found three bars on the
same screens with their own side padding. None of them gets it from `.wrap`,
and the issue does not mention them:

| Layer | Rule | 390px | 360px | 320px | 320px / 32px text | Prototype |
| --- | --- | --- | --- | --- | --- | --- |
| Floating bar (`#actionbar`) and resume bar (`#resumeBar`), button edge | `.actionbar` `padding: … clamp(.7rem, 3vw, 1rem)` (`app.css:1594`) | 11.7 | 11.2 | 11.2 | 16 (`.5rem`, `app.css:3817`) | `.dock` 16 |
| Undo toast container | `.toasts` `padding: 0 clamp(.7rem, 3vw, 1rem)` (`app.css:1720`) | 11.7 | 11.2 | 11.2 | 22.4 | `#toast` 16 |
| Header (`.bar`) | `.7rem` at ≤620px (`app.css:3519`), `.5rem` at ≤385px (`:3547`) and at ≤19em (`:3582`) | 11.2 | 8 | 8 | 16 | `.nav` 16 |

- **Q1, decided yes: the floating bar, the resume bar and the toasts move to
  `1rem` too.** Today the floating bar's button lines up with the content to
  within 0.5px. If only the content moved, the full-width button would sit
  4–5px outside the cards above it. Set `.actionbar` and `.toasts` side
  padding to `1rem`, and leave the ≤19em `.actionbar` rule (`.5rem`) alone,
  since it exists so "Start game" fits at a 32px root. A browser trial with
  that override showed no sideways scroll on any of the five screens at 300,
  320, 360, 390 and 420px, or at 320px with 32px text. That trial is a hint,
  not proof: smoke has to agree.
- **Q2, decided no: the header stays as it is.** Its padding is tuned in
  three stages so its buttons stay on one row (`big-text.test.js` checks
  their order). At 360px and 320px the back button and the gear stay at 8px,
  so the gap between the header's edge and the content's edge grows from
  3.2px to 8px. Moving the header is a restyle of the header, and #138 and
  #140 already touch it.
- **Q3, decided: the large title sits at 16px, as the issue says.** The
  prototype's 20px title indent (`.lt { padding: 2px 20px 0 }`) is left out.
- **Q4, decided: the welcome screen is left to #145.** `#view-welcome` is not
  a `.wrap`. Its padding is `clamp(.85rem, 3vw, 1.5rem)` (`app.css:2133`),
  which is 13.6px on every phone. The orchestrator adds a note to #145 saying
  so; the build does not touch it.

## What would settle it

The `RICH` fixture, light theme, measured with `getBoundingClientRect`.
"Left" is `rect.left`. "Right" is `innerWidth − rect.right`.

1. At **390×844**, **360×800** and **320×568** with a 16px root, each element
   below has left = **16px (±1)** and right = **16px (±1)**. Today all of them
   read 11.2 / 11.2.
   - Today: `.today-h1`, the first `.today-game` (`#todayGames`'s first
     child), `#todayTeam`, `#todaySeason`.
   - Game screen: `#view-games .dayhead`, `#sentence`, `.cols`.
   - Team: `#view-team .dayhead`, `#rosterlist`.
   - Season: `#view-season .dayhead`, `#seasonbox`.
   - Settings: the first and last `#view-settings .side-box`.

   The heading is measured by its box, so the left edge is the heading's box,
   not where its first letter is drawn. At 390×844 the content column is
   **358px** wide (today 367.6). At 360 it is **328px**, and at 320 it is
   **288px**.
2. At **320px wide with a 32px root** (the smoke large-text cell), the same
   elements have left = right = **32px (±1)**. Today they read 22.4. The
   column is **256px** (today 275.2).
3. `npm run smoke -- --no-tests` passes with **no allowance added or raised**.
   `APP_LARGE_TEXT_ALLOW` stays empty and `LARGE_TEXT_ALLOW` is unchanged.
   These rows are the ones most likely to move, because the column narrows:
   - the 300–420px no-overflow sweep;
   - the 28-state app shell pass at 320px / 32px;
   - touch targets and Settings rows at 320, 360 and 390;
   - `game rows fit` (all nine rows above Start game at 390×844). The
     sentence may wrap one line sooner.
4. Widths above 620px do not change. Record `#view-today` and
   `#view-games > .wrap`'s computed `padding-left`/`padding-right` on
   `main` at 621, 700, 840 and 1280px (16px root). They read the same on the
   branch.
5. Unchanged at 320, 360 and 390 (16px root) and at 320px / 32px: a sheet's
   first `.pgrp` (16 / 32), the Add a game flow's `.flow-f` (16 / 32), the
   header's `.bar` padding (11.2 at 390, 8 at 360 and 320, 16 at 320/32).
6. At 390, 360 and 320 (16px root) the
   `#abBench` button and the `#resumeBar` button have left = right = **16px
   (±1)** (today 11.7 at 390 and 11.2 at 360 and 320). A toast's edges are at
   16px. At 320px / 32px the floating bar's button stays at 16px, from the
   `.5rem` ≤19em rule.
7. `node scripts/compare-shots.mjs --issue 132` runs. Each 320px shot, and the
   360px Team and Settings shots, is looked at once for crowding: text that
   wraps where it did not before, a label cut short, or a control pushed to a
   second row. Anything found is filed as a new issue and not fixed here.

## Surfaces

- Changes: `app/app.css` (the rule at 1979 and the comment above it,
  `.actionbar`'s side padding at 1594 and `.toasts`' at 1720),
  `app/sw.js` (`VERSION` and `SHELL`), and the new smoke check and its
  registry entry (see Proof).
- Must not change: the base `.wrap` rule (`app.css:302`), the header `.bar`
  stages (3513, 3546, 3581), the ≤19em `.actionbar` rule (3817),
  `#view-welcome`, sheet and flow padding, `app/index.html`,
  `app/tokens.css`, any JavaScript.

## Constraints

- **Guidelines:** L6 (16px side margins), T2 (size in `rem`), P5 and A4
  (layout holds at 200% text), I1 (48px targets still fit in the narrower
  column).
- **Precache bump.** `app.css` is precached (`app/sw.js:45`). Bump `VERSION`
  (356 at 699987e, or one past whatever `main` has when this is built) and
  set `SHELL` to the digest `npm test` names, in the same change.
- **No new spacing literal and no new token.** Use `1rem`, the value the
  sheets and the flow already use. #152 turns it into a token later.
- **Cascade order stays as it is.** `test/big-text.test.js` pins the order
  of the 620px, 385px and 19em blocks around `.bar`.
  `test/landscape-chrome.test.js` needs the first `@media (max-width: 620px)`
  (`app.css:1024`) to come before the landscape block. Edit the rule where it
  is, and don't move it.
- **The new smoke check is built under `/new-guard`.** Run it against
  699987e first and watch it fail with the 11.2px readings, for the right
  reason, before the fix goes in.
- Mobile first: measure at 390×844 first.

## Design

Change `.7rem` to `1rem` in the phone `.wrap` rule and give it its own
comment. Set `.actionbar` and `.toasts` side padding to
`1rem` in their base rules, so the ≤19em override still wins at large text.
Add one smoke check that measures item 1's elements at the three widths and
at 320px / 32px. Bump the precache.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Phone gutter smoke check | a new module under `scripts/smoke/` plus one registry entry (the #130 shape), on `RICH`. It reads item 1's elements on the five screens at `TOUCH_WIDTHS` (320, 360, 390) and at `LARGE_TEXT_WIDTH`/`LARGE_TEXT_PX`, and item 6's buttons. `node scripts/smoke.mjs --only "<its name>"` while iterating. | 1, 2, 6 |
| Existing smoke suite | `npm run smoke -- --no-tests`: the width sweep, the app large-text pass, touch, settings rows, `game rows fit` | 3 |
| Wide widths and untouched layers | `/browser-verify`, computed padding, `main` against the branch, on `node scripts/serve.mjs` | 4, 5 |
| Crowding look | `node scripts/compare-shots.mjs --issue 132` | 7 |
| Precache and cascade order | `npm test` (`sw.test.js`, `big-text.test.js`, `landscape-chrome.test.js`) | Constraints |

## Out of scope

- Spacing tokens (`--sp-*`) and the other 61 rem spacing values: #152.
- The header's side padding (Q2).
- The welcome screen and first-run step spacing: #145.
- The large title's 20px prototype indent (Q3).
- Sheet layout (#143), control sizes (#140), bench mode (#138), and every
  other item under #153.
- Any crowding the compare set shows at 320px. It is filed, not fixed here.
