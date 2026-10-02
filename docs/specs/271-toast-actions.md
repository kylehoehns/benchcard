# #271 — the toast's button and dismiss wrap together

**Issue** — #271. A toast with a button drops its ✕ onto a row of its own,
under the first word of the message, on a 360–375px phone.

Started in the small lane; switched to the full lane mid-build because the
measured smoke check is 64 lines of `scripts/`.

## Goal

A coach who gets "Benchcard updated." with Reload, or any Undo toast, sees the
button and the ✕ side by side at the right, on every phone width and text
size the app supports, or both on the message's row when they fit.

## What would settle it

At 320, 360, 375 and 390px, at the default text size (16px root) and at 32px:

1. A toast with a button: the ✕ shares the button's row (tops within 1px)
   whenever the button, the gap and the ✕ fit the toast's content box.
   Measured on main: 360/16 and 375/16 fail (the ✕ is 57.6px below the
   button's row, at the left edge).
2. The ✕ is the rightmost item, and its right edge sits at the toast's
   content edge (within 1px). The button never passes the content edge.
3. A toast with no button (`flash()`): the ✕ right edge sits at the content
   edge (within 1px).
4. Where the button and the ✕ cannot share one row (320px at 32px text: the
   pair is wider than the 208px content box), the ✕ stacks under the button,
   right-aligned, rather than overflowing the toast. Decided during the build;
   it is the one place rule 1 is conditional.

## Surfaces

- Change: `app/toast.js` (`actionToast`), `app/app.css` (the `.toast`
  block), `app/sw.js` (bump), `scripts/smoke/phone-gutter.mjs`,
  `test/big-text.test.js`.
- Must not change: the tip toast and install toast (`.tip-toast`,
  `.install-toast`), `.tmsg`'s 12rem basis, the selectors the smoke checks
  click (`.toast .tundo`, `.toast[data-undo] .tundo`, `.toast .tx`).

## Constraints

- Mobile first: 390×844 first, 320px and 32px text are the floors.
- Precache: `app/` changes, so `npm run sw:bump`.
- `test/smoke-page-state.test.js`: direct CDP counts per smoke file may only
  shrink — the check lands through `land`/`resize`.
- No new registry row: extend an existing row that already sweeps 320–390px
  and 32px text.

## Design

`actionToast` puts the button (when there is one) and the ✕ in one
`span.tacts`. `.toast .tacts` is a flex item with `flex: none;
margin-left: auto`, so the pair wraps as a unit and right-aligns, and is
itself a wrapping flex row (`justify-content: flex-end; max-width: 100%`) so
the pair can stack inside a toast too narrow for both. It replaces the old
`.toast .tundo, .toast .tmsg + .tx { margin-left: auto }` rule.

## Proof

- **Smoke, `phone gutter: five screens, #abBench and #resumeBar,
  320–390px + 320px/32px text`** (`scripts/smoke/phone-gutter.mjs`): raises
  the real toasts through the page's own `/toast.js` (`offer` with Reload,
  and `flash`) at the four widths and both text sizes, and measures items
  1–4. Shown red on main.
- **`test/big-text.test.js`**: the source-reading assertion "the wrapped
  action row lands at the right edge" is deleted. It passed with this bug
  live; the measured check above replaces it.

## Out of scope

- Renaming the phone-gutter row.
- The tip and install toasts' own layouts.
