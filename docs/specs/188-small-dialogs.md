# #188 — Small dialogs cut off text at 320px and 32px text

## Issue

#188. The four small centered dialogs (Team color, Keyboard shortcuts,
Confirm, How it works) are too narrow at 320px wide with 32px text, so their
text runs out of the box.

## Goal

A coach with their phone's text at 200% can read every color name, every
button label and every line of How it works, without anything cut off and
without a dialog panning sideways.

## Survey

The issue's claims hold. What produces the 145px:

- All four dialogs share the `.keyswrap` / `.keysbox` shell (`app/index.html`
  `#colorPicker` :1373, `#confirm` :1708, `#help` :1726, `#keys` :1918).
- At a 32px root every side inset is in `rem`, so it doubles:
  `.keyswrap` padding `clamp(.7rem, 3vw, 1.5rem)` = 22.4px a side
  (`app/app.css:1693`), and `.keysbox` padding `0 1.2rem 1.1rem` = 38.4px a
  side (`app/app.css:1701-1705`).
- The 32px-root block (`@media (max-width: 19em)`, `app/app.css:3376`) caps
  `.keysbox` and `.helpbox` at `calc(100vw - 3rem)` = 224px (`:3533-3534`),
  and `3rem` is 96px at this size. 224 − 2 × 38.4 − 2 (border) = 145px of
  content.
- `.colorbox` and `.confirmbox` (`:1737`, `:1803`) are `min(22rem, 92vw)` =
  294px, which is wider than the wrap's 275px track, so they are not capped
  by that block at all.
- `#helpTour` is a `.btn` (`white-space: nowrap`) with a 362px label.
- `.confirm-acts .btn` is `flex: 1` (`:1740`), so each of Cancel and
  "Remove team" gets half the row; "Remove team" is 216px.
- `.keys-row` is a flex row with a fixed `dt` of `flex: 0 0 4.6rem` (147px at
  this size, `:1746`), leaving the `dd` almost nothing, and the row overflows
  the box sideways.

Reproduced with `node scripts/smoke.mjs --no-tests --only "no cut-off text
at 320px/32px text"`, #188's known-issues entry switched off and all problems
printed (29 in all; `@bottom` repeats each `@top` line):

```
help sheet@top: "A tournament day, and the season" is 229px wide in a 145px box (h3.help-h)
help sheet@top: "Show me around again" is 362px wide in a 145px box (button#helpTour.btn.press)
shortcuts sheet@top: "Print the card" is 64px wide in a 64px box (dd)
shortcuts sheet@top: "Shuffle the rotation" is 110px wide in a 110px box (dd)
shortcuts sheet@top: "Team, or back to Today" is 83px wide in a 83px box (dd)
shortcuts sheet@top: "Start game" is 79px wide in a 79px box (dd)
shortcuts sheet@top: "Previous / next stint, on the bench" is 118px wide in a 118px box (dd)
shortcuts sheet@top: "This list" is 57px wide in a 57px box (dd)
shortcuts sheet@top: "Close whatever is open" is 131px wide in a 131px box (dd)
team color picker@top: "Graphite" is 157px wide in a 145px box (button.color-opt.on)
team color picker@top: "Hardwood" is 162px wide in a 145px box (button.color-opt)
team color picker@top: "Maroon" is 119px wide in a 145px box (button.color-opt)
team color picker@top: "Purple" is 101px wide in a 145px box (button.color-opt)
confirm dialog@top: "Remove team" is 216px wide in a 270px box (button#confirmYes.btn.danger)
1 stale known-issue entry (never matched this run): #188
```

The issue also names `p.help-p`, `p.help-lede` and help `dd`s. The check does
not report those today (they wrap), so they are not separate targets; they
are covered by "no line of help text is wider than the dialog" below.

The Design below was tried through the check's own `injectCss` seam
(`clipSweepPass(c, origin, { injectCss })`) with #188's entry switched off:
every line above went away and the only problem left was the stale #188
entry itself, which removing the entry clears.

## What would settle it

At 320px wide with a 32px root (`LARGE_TEXT_WIDTH` / `LARGE_TEXT_PX`), in
DejaVu Sans (smoke's forced font), with the RICH fixture:

1. Team color picker: all nine color names ("Graphite", "Hardwood",
   "Maroon", "Purple" and the rest) sit fully inside their `.color-opt`
   button, on one line, with no mid-word break.
2. Keyboard shortcuts: every `dd` ("Close whatever is open", "Previous /
   next stint, on the bench", …) is fully inside the dialog, and the dialog
   does not scroll sideways (`.keysbox` `scrollWidth <= clientWidth + 1`).
3. Confirm (Settings → Remove team): both buttons' labels ("Cancel",
   "Remove team") are fully inside their buttons and the dialog does not
   scroll sideways. Both buttons stay at least 48px tall.
4. How it works: "Show me around again" is fully inside `#helpTour` (it may
   wrap to two lines), every `h3.help-h` ("A tournament day, and the
   season", …) fits without a mid-word break, and no `p.help-p`,
   `p.help-lede` or help `dd` is wider than the dialog.
5. #188's entry is removed from `CLIP_SWEEP_KNOWN_ISSUES` in
   `scripts/smoke/clip-sweep.mjs`, and the row "no cut-off text at
   320px/32px text" passes (no #188 problems, no stale entry).
6. No regression at 390×844 with 16px text: the four dialogs have the same
   computed width and padding as on `main` (the fix lives only in the
   `max-width: 19em` block, which does not match at a 16px root), shown by
   a before/after screenshot of each.
7. Still looks right against the prototype: the Team color sheet at 390px
   matches `notes/mockups/prototype/light-settings-team-color.png` as well as
   it does on `main` (no tab bar; the README's "docs win" list applies), and
   the four dialogs at 320/32 are screenshotted in the PR.
8. `npm test` and `npm run smoke -- --no-tests` pass, including
   `test/dialog-viewport.test.js` unchanged.

## Surfaces

Change:

- `app/app.css` — the `@media (max-width: 19em)` block only
  (around `:3525-3534`, where `.keysbox`/`.helpbox` are already set).
- `app/sw.js` — `VERSION` and `SHELL`, via `npm run sw:bump`.
- `scripts/smoke/clip-sweep.mjs` — delete the `issue: 188` entry
  (`:112-127`). Nothing else in that file.
- `docs/specs/188-small-dialogs.md` — this file.

Must not change: `app/index.html` markup, any base (non-media) rule for the
dialog shell, `test/dialog-viewport.test.js`, the other known-issues entries,
`CLIP_SWEEP_ALLOW`, `APP_LARGE_TEXT_ALLOW`, the budgets.

## Constraints

- **Precache bump.** `app/app.css` is precached, so `VERSION` and `SHELL`
  move in the same change: `npm run sw:bump`. Other issues from the #179
  batch are open in parallel and will also bump; the `sw.js` merge driver
  (`npm run setup`) clears that, then re-run `npm run sw:bump`.
- **Reuse the 32px-root block, not a new breakpoint.** Every other
  large-text fix lives in `@media (max-width: 19em)`; this one goes there
  too, and replaces the existing `.keysbox`/`.helpbox` width lines rather
  than adding a second pair. Its comment is rewritten to say why.
- **Follow the block's own precedents:** side padding cut to `.5rem`, the
  way `.bar` and `.actionbar` are; a nowrap `.btn` label allowed to wrap and
  centered, the way `.wel-go`, `#frFill` and `.gm-cta .btn` are; a pair of
  buttons that cannot share a row stacks full width, the way `.fr-cta .btn`
  does; side-by-side pieces stack at 200% (guidelines T2).
- **More room, not more wrapping.** The issue records that
  `overflow-wrap: anywhere` on `.color-opt` made "Graphite" break one
  letter per line. No `overflow-wrap`/`word-break` on these elements.
- **Keep the sticky header honest** (`test/dialog-viewport.test.js`):
  `.keysbox` keeps `padding-top: 0`, and `.keys-hd` gets no negative
  `margin-top`. Its side margins must match the box's new side padding so
  its background still reaches the box edge.
- **16px side margin** (guidelines L6): the dialog sits 16px (`.5rem` at
  32px) in from each screen edge.
- **Do not raise an allowance** or add an allow-list entry to clear any of
  these; the known-issues entry is removed, not edited.
- **Touch targets:** every button in these dialogs stays ≥48px (I1);
  `.color-opt` and `.confirm-acts .btn` already set `min-height: 48px`.
- **Scope.** Only the four `.keyswrap` dialogs. #187, #189–#191, #195–#198
  are being fixed in parallel; none of their elements is in these dialogs,
  but all of them edit the same `19em` block, so expect a text conflict
  there on rebase, not a behavior one.

## Design

Inside `@media (max-width: 19em)` in `app/app.css`, replacing the current
`.keysbox`/`.helpbox` width lines:

```css
.keyswrap { padding-left: .5rem; padding-right: .5rem; }
.keysbox, .helpbox, .colorbox, .confirmbox { width: 100%;
  padding-left: .5rem; padding-right: .5rem; }
.keys-hd { margin-left: -.5rem; margin-right: -.5rem;
  padding-left: .5rem; padding-right: .5rem; }
.help-tour { white-space: normal; text-align: center; }
.confirm-acts { flex-wrap: wrap; }
.confirm-acts .btn { flex: 1 0 100%; }
.keys-row { flex-wrap: wrap; row-gap: .2rem; }
```

At 320/32 that gives each dialog a 288px box and 254px of content (was
145px). The shortcut keys sit on their own line above their description,
the confirm's Cancel sits above its Remove button (DOM order kept, so
Cancel is still first for focus and reading), and "Show me around again"
wraps inside its button. At 16px text none of this applies.

The longest single word in these dialogs is "TOURNAMENT" in an uppercase
`h3.help-h`, 229px of the new 254px (about 10% spare). It fits in the forced
DejaVu Sans; the developer reports the measured width, and if it needs more
room the wrap's side padding is the one to give (not the heading's size).

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| `clipsweep` row with #188's entry removed | `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"` — red on `main` with the entry removed (28 problems), green with the CSS | 1, 2, 3, 4, 5 |
| existing rows that touch these dialogs | `--only` each of: `app shell at 320px/32px text`, `last control in an open dialog is reachable`, `a11y in overlays and dialogs`, `touch targets ≥ 48px, …`, `heading outline: …` | 3 (48px), 6, 8 |
| shell shape | `node --test test/dialog-viewport.test.js`, unchanged | 8 |
| look | `/browser-verify`: screenshots of the four dialogs at 320/32 and 390/16, before and after, and `node scripts/compare-shots.mjs --issue 188` for the Team color sheet against the prototype PNG | 6, 7 |
| the proof pair | the committer: `npm test`, then `npm run smoke -- --no-tests` | 8 |

No new test or guard: the #179 row is the guard, and removing the entry is
what makes it prove this fix.

## Out of scope

- Any other element in the known-issues list (#187, #189–#191, #195–#198).
- The dialogs at widths or text sizes where the `19em` block does not apply.
- Turning the centered dialogs into bottom sheets (guidelines C3) or other
  redesign of these dialogs.
- Changing the help copy or the shortcut list.
