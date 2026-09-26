# #145 — First run and Add a game: one inset, one filled button, the prototype's details

## Issue

#145 (item 15 of #153). The first-run and Add a game flows have spacing
slips. Add a game step 1 shows two filled buttons. Several details have
drifted from the prototype: the checked-in tiles, the radio circles, the
"Even out" row, the title size, the progress bar, and the close chip.

## Goal

A coach setting up a team, or adding a game, sees every line start at the
same 16px margin. They see one black button per screen, and the flow looks
like the prototype's Add a game.

## Survey (origin/main at 4334cd0)

**Structure**
- Both flows are top-level dialogs: `dialog.flow#addGameFlow` and
  `#firstRunFlow` (index.html:1623, 1668).
- `paintFlowShell` / `flowStepBody` (trap.js:552-592) build each step as
  `.flow-body > div > [h2.flow-q, …]`.
- `.flow-body` has no side padding (app.css:2818), so each child insets
  itself, one class at a time (app.css:2938-2954).

**Children with no inset**
- First run step 1: `p.note#frCount` (x=0), and `#frFill` "Fill with a
  sample team" (`btn ghost sm`, text at about 12.5px).
- First run step 3: `div.stage#frStage`, the gray preview area (x=0 to 390;
  card.css:80 gives only 4.8px of inner padding at ≤620px).
- Add a game step 2: `p.sheetempty` (3.2px).
- Add a game step 3: the `switchRow` `label.prow` (a bare, transparent row;
  its text is at 16px, but the row is full width).
- onboarding.js:623-631 records that a 1rem inset on the stage was dropped
  on purpose. The owner has now reversed that (below).

**Other findings**
- First run step 2: the "How often do you sub?" label (`span.f.fr-f`) has
  0px of box gap to the stepper card above it (`dialog.flow .pgrp` has no
  bottom margin). What reads as about 4px is only the text's leading.
- First run step 3: `#frPrint` / `#frShare` (`.btn` in `.gm-cta.fr-cta`)
  are sized to their text and centered. The equal-width rule
  `#sheetCard .gm-cta .btn { flex: 1 }` (app.css:1572) is scoped to
  `#sheetCard`.
- Add a game step 1: "Use it" is `btn primary` at `width: 100%` in
  `div.flow-card` (teams-view.js:753-758, app.css:2844). The footer's
  `#agNext` is also filled, so the screen has two filled buttons.
- Add a game step 2: checked-in (present) tiles are `.plr.on`, drawn with
  the selection ring (`inset 0 0 0 2.5px var(--tint)`, app.css:3519). The
  Plan sheet's picker uses the same `.plr.on` to mean "selected", so the
  change must be scoped to `dialog.flow`.
- Add a game step 3: the options are `button.opt[role=radio]`. They never
  had a radio circle (git history: only 4f0216e, #32).
- Add a game step 3: the `.flow-q` title is 34px (`--fs-large`) and wraps
  "How should minutes split?" onto two lines at 390.
- Both flows: `trap.js:562` lights only the current progress segment.
- Both flows: the ✕ (`.bsheet-close`, top left) is a bare 17px glyph with
  no fill. Back (`#agBack` / `#frBack`) is a `btn ghost` "‹ Back" in the
  bottom bar.
- `#view-welcome` (the landing before first run): its side padding is
  `clamp(.85rem,3vw,1.5rem)` (app.css:2193), which is 13.6px on every phone
  up to 453px. It is left to this ticket by #132.

**Prototype**
- The prototype has **no first run** (its README leaves it out on purpose).
  First-run steps follow the same flow rules, not a mockup.
- Add a game (notes/mockups/prototype/index.html, flowHTML 628-643, and
  `light-add-game-1..3.png`):
  - Everything is inset 16px.
  - "Same as …? Use it" is one surface card, with "Use it" as right-aligned
    600-weight text in the accent color.
  - A checked-in tile is plain: surface fill, no ring, a ✓. An out tile is
    transparent, with a 1.5px hairline and "Out".
  - An option has a 22px `.rad` circle (a 2px `--faint` ring). When on, the
    card gets a 2px `--ink` ring, and the circle becomes a 7px `--ink` dot.
  - "Even out" is a 46px row with a switch, in a white `.grp`, 18px below
    the options.
  - The title is 30px, line-height 1.12, weight 700, letter-spacing
    −.028em, and fits on one line.
  - The progress bar fills finished steps and the current one.

## Decided (owner, on the issue, 2026-09-25)

1. **Close and back.** On every step, the ✕ is the same round chip as
   `#backBtn`: a 36px `--chip` disc with a 48px hit area, top left (C10).
   Back stays in the bottom bar beside Next, within thumb reach (the I3
   twin of Android's back gesture). It shows a chevron icon, not the "‹"
   character.
2. **First run step 3's preview area gets the 16px inset.** At 320px the
   card shrinks from about 94% to about 84% of its size. That is accepted.
   Update the comment at onboarding.js:623.
3. **Print and Share are two equal, outlined halves, 48px tall.** They are
   not filled, because the bottom bar's button is the one filled button on
   the screen (C2).
4. **Fields stay as they are.** #141's owner decision keeps bordered
   fields with outside labels everywhere. The prototype's borderless field
   with the label inside is a documented departure.

## What would settle it

At 390×844 unless a line says otherwise, light and dark.

1. **One inset rule (L6).**
   - Every direct child of a flow step's wrapper gets its 16px side inset
     from **one** shared rule, not one rule per class. Delete the per-class
     inset rules this replaces.
   - The step title keeps its own look but takes its inset from the same
     rule.
   - At 390 and at 320, in both flows, on every step (including Add a game
     step 1 with the "Same as" card showing, and step 2 with no players),
     no visible box or text inside `.flow-body` starts left of x=16 or ends
     right of (width − 16). At ≥840 the 34rem centered cap still applies.
   - `#frCount`, `#frFill`, `#frStage`, `p.sheetempty` and the step 3
     switch row all sit at 16.
2. **First run step 2.** The "How often do you sub?" label has a visible
   gap above it. It follows the same spacing as a group title after a
   group: 8px-grid spacing (L6), at least 16px of box gap.
3. **First run step 3.**
   - The preview area runs from 16 to width − 16.
   - `#frPrint` and `#frShare` are equal width (±1px), fill the row between
     the insets, are 48px tall and outlined (not `primary`).
4. **Add a game step 1: exactly one filled button.**
   - The "Same as …?" card is one button, surface fill, with "Use it" as
     right-aligned accent text, like the prototype.
   - Tapping anywhere on the card does what "Use it" did.
   - Counting computed backgrounds on step 1 with the card showing finds
     exactly one element filled with `--tint`: `#agNext`.
5. **Add a game step 2.**
   - In `dialog.flow`, a checked-in tile has a surface fill, no ring
     (`box-shadow: none`, and a border matching an unchecked tile's
     border, not `--tint`), and still shows its ✓.
   - An out tile keeps its current look.
   - The Plan sheet's picker (`.plr.on` outside `dialog.flow`) is
     unchanged.
6. **Add a game step 3.**
   - Each `.opt` shows a 22px radio circle: an empty ring when off, a
     filled dot when on, in the prototype's proportions.
   - Checked is still carried by `aria-checked`. The circle is decoration
     (`aria-hidden`, or a pseudo-element).
   - "Even out earlier games" sits in a white `.pgrp` group, inset 16px.
   - The title "How should minutes split?" is on one line at 390, at 30px.
     All flow titles move to 30px together.
   - Use a token. If no token is 30px, add one to tokens.css (K5 text size
     scales with it) rather than writing a literal.
7. **Progress bar.** Both flows fill every segment up to and including the
   current step.
8. **Close and back.**
   - `#agClose` and `#frClose` draw the `#backBtn` chip: a 36px circle
     filled from `--chip`, translucent and blurred with the same solid
     fallbacks, an icon (not a text ✕) in `--ink-2`, and a 48px hit area.
   - `#agBack` and `#frBack` show a chevron icon from `app/icons.js` plus
     "Back".
9. **Welcome screen.** `#view-welcome` has 16px side padding at every phone
   width (≤600), and wider padding above that is unchanged.
10. **Large text.** At 320px with a 32px root, nothing overflows sideways
    in either flow on any step, and nothing clips.
11. **Nothing else moves.** The full smoke suite passes, including the
    touch sweep, `app-large-text`, the first-run and Add a game checks, and
    `compare-shots` where it runs.

## Surfaces

- Changes:
  - `app/app.css`
  - `app/card.css` (only if the stage's inset has to live there)
  - `app/tokens.css` (a 30px type token, if needed)
  - `app/index.html` (`#agClose`, `#frClose`, `#agBack`, `#frBack`)
  - `app/teams-view.js` (the "Same as" card, the option radios)
  - `app/onboarding.js` (the stage comment)
  - `app/trap.js` (progress)
  - `app/sw.js`
  - `test/`
  - `scripts/smoke/`
- Must not change:
  - `app/engine.js`
  - the Plan sheet picker's `.plr.on`
  - what any button does (the "Same as" card only widens its tap target)
  - the flows' step order and copy
  - the input style (#141 owns it)

## Constraints

- L6 (16px margins, 8px grid). C2 (one filled button). N5 / C10 (the ✕
  chip top left). I1 (every control's hit area is ≥48, including the
  chip's). I3 (a visible back). K5 (a new type token scales with text
  size).
- Reuse, do not re-derive:
  - the `#backBtn .i` chip rule and its fallbacks. Extend the selector
    list, and do not copy the declarations.
  - `--chip` and `--chip-hover`
  - `.pgrp` for the "Even out" group
  - icons from `app/icons.js` (`data-icon`)
  - the flow's existing ≥840 centering
- #141 is being built at the same time and deletes `.wel-seg`, which is on
  the welcome screen. Change only `.welcome`'s padding there, and leave
  `.wel-seg` alone.
- Precache: bump `VERSION` in `app/sw.js` by one, and set `SHELL` to the
  digest `npm test` names. (The final VERSION is set at rebase time.)
- A long smoke run can hang. Wrap any smoke run in
  `perl -e 'alarm 900; exec @ARGV' …`.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Inset sweep: every visible box in `.flow-body` within [16, W−16], every step of both flows, at 390 and 320 | a new smoke check | 1, 3 (stage) |
| Filled-button count on Add a game step 1 with the "Same as" card | smoke | 4 |
| Tile, radio, "Even out" group, title on one line, progress fill | smoke, light and dark | 5, 6, 7 |
| Close chip computed styles equal `#backBtn .i`'s; the back icon | smoke | 8 |
| Print/Share equal halves | smoke | 3 |
| Welcome 16px | smoke, or an extension of the phone-gutter check (#132) | 9 |
| Progress fill logic | `node --test` on trap.js's progress helper, if it can be exported without DOM; otherwise smoke only | 7 |
| Look | `/browser-verify` on the preview: both flows, every step, 390 and 320/32, light and dark, side by side with `light-add-game-1..3.png` | 1-10 |

## Out of scope

- The prototype's borderless fields (see Decided 4).
- The prototype's "Cancel" text and "n of 3" layout. The app keeps its ✕
  and its step count (C10).
- Any change to what the flows ask, or their order.
