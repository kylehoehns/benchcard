# 283: about page cuts off text

## Issue

#283: `scripts/look.mjs` found cut-off and mid-word-split text on `about.html`. The smoke clipping sweep never looks at that page, so nothing caught it.

## Goal

A coach who reads the about page on a phone, at the default text size or with large text turned on, sees every heading, name and link whole. No word is cut off, and none is split in the middle.

## What would settle it

1. **The demo names are first names.** The level-chooser demo (`.lv-row .nm`) shows first names only, matching the timeline demo above it: Bria, Cole, Noah, Elena, and so on. No `.nm` on the page holds a space.
2. **The headings fit.** At 320px wide with 32px text, the `h1` ("Even minutes, worked out before the game.") and `h2#tournament` are not cut off, and no word in them breaks mid-word.
3. **The email breaks cleanly.** At 320px and 390px with 32px text, `hello@benchcard.app` is either on one line or breaks right after the `@`, never inside a word.
4. **look.mjs agrees.** `node scripts/look.mjs --view about --widths 320,390 --font 16,32` reports 0 findings in `measurements.json`, in both light and dark.
5. **The smoke clipping sweep covers the about page,** so this cannot come back unnoticed:
   - It loads `/about.html` at 320px/32px and at 390px/16px, and scrolls to the bottom too.
   - It runs the same four tests it runs on app views: text wider than its box, a name narrower than its longest word, a mid-word break, and text under something else.
   - It reports 0 findings once items 1–3 are fixed.
   - It must be able to fail. With item 1 reverted (the full names back), it reports the `.nm` findings. Show that red run.

## Surfaces

- **Change:**
  - `app/about.html`: the demo names, the heading CSS and the email markup or CSS;
  - `scripts/smoke/clip-sweep.mjs`: the about page as a swept page;
  - the smoke registry or test lists, only if a new row is needed;
  - `app/sw.js`, through `npm run sw:bump`;
  - tests.
- **Must not change:**
  - `app/vendor/`;
  - the app views' own sweep results;
  - `CLIP_SWEEP_ALLOW` entries that already exist. A new allow entry needs a reason. Excusing a finding instead of fixing it is out of scope.

## Constraints

- **Reuse, do not re-derive:**
  - `clip-sweep.mjs`'s own probe functions, `SCROLL_TO_BOTTOM` and the `land` helper (`page-state.mjs`, with `page: '/about.html'`, as `hand-off.mjs` and `share-door.mjs` already use);
  - `LARGE_TEXT` from `sizes.mjs`, and whatever cell `sizes.mjs` names for 390px/16px;
  - `look.mjs` for the before and after evidence.
- **Mobile first.** Fix at 320px and 32px. The heading may get smaller at large text sizes, but must not get smaller at the default size on a 390px phone. Wrap the heading; do not ellipsize it.
- **The about date.** `about.html` changes, so its footer `<time>` is today's date (`npm run check:history`).
- **The precache bump.** Run `npm run sw:bump` after the last change to `app/`.
- **The byte budget.** If a payload budget fails, widen `bytesAbs`.
- **Smoke time.** The new sweep should add 20s or less to the smoke run. Report its timed row.

## Design

- **Names:** edit the demo markup to use first names.
- **Headings:** size them so the longest word fits at 320/32. A `clamp()`, or the type-scale steps the page already uses, at large text. Check that 390/16 is unchanged.
- **Email:** `hello@<wbr>benchcard.app`, or an `overflow-wrap` rule that breaks only there. Prefer `<wbr>`, which is markup and cannot split a word.
- **Sweep:** a pass, or an extension of `clipSweepPass`, that lands on `/about.html` at the two cells, runs the existing probes at the top and scrolled to the bottom, and reports findings the same way.

## Proof

- **Smoke row (the sweep on about):** covers items 1, 2, 3 and 5. Show it red first: on today's `about.html` it must report the findings the issue lists.
- **`look.mjs` run:** covers item 4. Paste the findings count before and after.
- **`/browser-verify` on the preview:** the h1, email and level-chooser card at 320/32 and 390/16, by screenshot.

## Out of scope

- `advanced.html` and the six chart pages. Not part of #283; file a new issue if look.mjs finds anything there.
- Any change to the app views or to `app.css`.
- Accepting a finding through an allow entry or a known issue rather than fixing it.
