# #196 — The team menu shows a team's whole name at 320px and 32px text

## Issue

#196. At 320px wide with 32px text, the team menu cuts off a team name
("Smoke Test", 159px in a 143px box) and #179's check says it breaks "Smoke"
mid-word.

## Goal

A coach with large text who opens the team menu can read every team's whole
name and tell two teams apart, even when the names differ only at the end
("Wildcats 5th Grade", "Wildcats 6th Grade").

## Decisions

The survey held up the size problem and falsified the cause the issue gives.

- **Nothing overrides the `nowrap`.** Measured in the check's own probe at
  320px/32px, DejaVu Sans: `span.teammenu-nm` computes `white-space: nowrap`,
  `text-wrap-mode: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`,
  `overflow-wrap: normal`, `word-break: normal`. No rule in any stylesheet
  besides `app/app.css:376` matches it. The name is on **one line**: every
  rect sits at `top: 267`.
- **The "split" is how Chrome draws an ellipsis.** Chrome keeps two pieces
  of the text on the same line: the full string (159px, the hidden part runs
  past the box) and the visible cut-down piece (104px, "Smoke " plus the
  "…"). A `Range` over "Smoke" therefore returns 2 client rects on one line,
  and `WORD_RECTS_FN` (`rectsN > 1`) counts that as a split. So the bug is
  one real problem, not two: the menu ends the name in "…" and **hides the
  whole word "Test"**. The coach sees "Smoke …".
- **Wrap, not a deliberate ellipsis.** The issue allows either. Adding
  `.teammenu-nm` to `CLIP_SWEEP_ALLOW` would turn the row green with no `app/`
  change, but the menu exists to pick one team out of several, and an
  ellipsis turns "Wildcats 5th Grade" and "Wildcats 6th Grade" into the same
  "Wildcats …". `#teamBtnLabel` truncating on Today's header (already on the
  allow list) is fine *because* the menu it opens shows the full name; that
  stops being true if the menu truncates too. Precedent for choosing a wrap
  over an ellipsis: `.bsheet-hd-row h2` (`app/app.css:2794-2802`,
  `white-space: normal; overflow-wrap: break-word`) and `.pass-title` in the
  `max-width: 19em` block (`app/app.css:3561-3568`).
- **Wrap at every size, not only in the `max-width: 19em` block.** A name
  that fits (every name at 390px/16px in the fixtures) draws exactly as it
  does today, and a 40-character name (`#teamName`'s `maxlength`) that
  doesn't fit a 352px menu at 16px is better wrapped there too. One rule
  instead of a base rule and an override.
- **`overflow-wrap: break-word`, not `anywhere`.** `anywhere` lowers the
  span's min-content width, so a flex item can be squeezed until it breaks
  inside ordinary words (#187's `.pass-title` bug). `break-word` only breaks
  a single word longer than the whole line.

## What would settle it

1. At 320×844, root text 32px, smoke's forced DejaVu Sans, the `RICH`
   fixture (team "Smoke Test"), with the team menu open: "Smoke Test" draws
   as "Smoke" on one line and "Test" on the next, every letter visible, no
   "…". `span.teammenu-nm` has `scrollWidth <= clientWidth + 1` and no word
   with more than one client rect.
2. #196's entry is removed from `CLIP_SWEEP_KNOWN_ISSUES`
   (`scripts/smoke/clip-sweep.mjs`), and
   `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"`
   passes. (The check fails on a stale entry, so leaving it in goes red.)
   `.teammenu-nm` is **not** added to `CLIP_SWEEP_ALLOW`.
3. At 390×844, root text 16px, same fixture, menu open: "Smoke Test" is on
   one line, each `.teammenu-item` is 48px tall (as before), the menu is
   anchored under `#teamBtn` and inside the viewport (the existing
   `today-and-back.mjs` check), and no "…" is drawn.
4. At 320px/32px with a second team named "Wildcats 6th Grade" (the
   `#teamName` placeholder), both names show in full, breaking only
   between words; the menu stays inside the viewport on both axes and every
   item is at least 48px tall.
5. No tab bar anywhere (guidelines N1; nothing here adds one).
6. `app/sw.js` `VERSION` and `SHELL` are bumped (`npm run sw:bump`), and the
   proof pair is green: `npm test`, then `npm run smoke -- --no-tests`.

## Surfaces

Change:
- `app/app.css` — `.teammenu-nm` (line 376), and `.teammenu-item`
  (lines 371-373) only if a wrapped name needs vertical padding to clear the
  item's rounded hover background.
- `app/sw.js` — `VERSION`/`SHELL` via `npm run sw:bump`.
- `scripts/smoke/clip-sweep.mjs` — delete the `issue: 196` entry, nothing
  else.

Must not change: `app/teams-view.js` (`renderTeams`, `positionTeamMenu`),
`#teamBtnLabel` and its allow-list entry, `.teammenu` sizing
(`min-width`/`max-width`, lines 365-369), the probe or any other entry in
`clip-sweep.mjs`, other issues' known-issue entries (#187-#191, #195, #197,
#198 are in parallel worktrees).

## Constraints

- **Precache bump:** `app.css` is precached, so `npm run sw:bump` in the same
  change; `npm run check:history` before pushing.
- **Mobile first:** item 3 (390×844, 16px) is checked before item 1.
- **Touch targets:** `.teammenu-item` keeps `min-height: 48px`; a wrapped
  item grows taller, never shorter.
- **C8** (menus are popovers anchored to their button, current choice
  checked): unchanged. `positionTeamMenu()` reads the menu's height on the
  `toggle` event, after layout, so a taller menu is still clamped to the
  viewport; item 4 checks that.
- **T2** ("lay out for 200%: rows grow"): this is that rule applied.
- **Reuse, do not re-derive:** the existing `clipsweep` row and its
  `team menu open` state are the proof at 320/32; do not add a new smoke
  check or a new state. `CLIP_SWEEP_ALLOW` is for text meant to end in "…",
  and this name is no longer meant to.
- **The card is untouched.** No bytes outside the team menu's rules.
- No prototype PNG shows the team menu (`notes/mockups/prototype/` has
  none), so the PR shows before/after screenshots of the menu at 320/32 and
  390/16 instead of a side-by-side.

## Design

`app/app.css:376` becomes a wrapping name:

```css
.teammenu-nm { min-width: 0; overflow-wrap: break-word; }
```

That drops `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`.
The span is already a flex item next to the fixed-width `.teammenu-check`, so
it takes the remaining width (143px at 320/32) and wraps between words. The
button's `align-items: center` keeps the check mark centered against a
two-line name. Update the nearby comment to say why it wraps (the menu is how
a coach tells teams apart).

If the two-line item's text touches the top and bottom of its rounded hover
background, give `.teammenu-item` a small block padding (for example
`padding: .3rem .7rem`); a one-line item stays 48px because `min-height`
wins.

Then delete #196's entry from `CLIP_SWEEP_KNOWN_ISSUES` and run
`npm run sw:bump`.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| the cut-off text row, `team menu open` state, with #196's entry removed | `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"` | 1, 2 |
| red before the fix: already recorded below, from this survey | the same command on `main` with the entry removed | 1, 2 |
| the menu at 390/16 and a two-team menu at 320/32 | a `/browser-verify` step with smoke's font forced (as `scripts/smoke/smoke-font.mjs` does), screenshots of both | 3, 4 |
| menu anchored and on screen at 390 | existing `today-and-back.mjs` row, in the full smoke run | 3 |
| 48px items, no sideways pan at 320/32 | existing touch-target and `applargetext` rows, in the full smoke run | 3, 4 |
| precache bump | `test/sw.test.js` in `npm test`; `npm run check:history` | 6 |
| the proof pair | the committer | 5, 6 |

The red half, recorded on this branch before any change (entry removed,
`problems.slice(0, 4)` widened, then both restored):

```
FAIL  no cut-off text at 320px/32px text  4 problem(s):
team menu open@top: "Smoke Test" is 159px wide in a 143px box (span.teammenu-nm) |
team menu open@top: "Smoke" splits across lines mid-word (span.teammenu-nm) |
team menu open@bottom: "Smoke Test" is 159px wide in a 143px box (span.teammenu-nm) |
team menu open@bottom: "Smoke" splits across lines mid-word (span.teammenu-nm)
```

No new guard is written, so `/new-guard` does not apply.

## Out of scope

- `#teamBtnLabel` on Today's header still ends in "…"; it stays on the allow
  list.
- The check reporting an ellipsis as a "split" (Chrome's two text pieces on
  one line). It only doubles a real clip finding and never fires on an
  allow-listed element; changing the probe is its own issue if wanted.
- A single word longer than the menu's line (a one-word 40-character team
  name). `break-word` breaks it; `.teammenu-item` is not in the probe's
  `ROW_LIKE` exemption, and no fixture has such a name.
- The other clip-sweep bugs (#187-#191, #195, #197, #198).
