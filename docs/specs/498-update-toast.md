# 498 — The update toast gets its own look

## Issue

#498: the "Benchcard updated." toast with its gray Reload pill looks
unfinished and dated. Give the update offer its own toast variant, the way
`.tip-toast` and `.install-toast` have one, with a clear primary Reload button
and clearer words.

## Goal

When a new version takes over, the coach sees a small, finished-looking card:
a refresh glyph, a bold "New version ready", one line saying what Reload does
and that it is safe, and a Reload button that obviously is the thing to tap.
Nothing else about when or how it appears changes.

## What would settle it

1. **Words.** Title **New version ready**, help text **Reload to get it. Your
   game stays saved.**, button **Reload**, dismiss named **Dismiss**. The
   second sentence is true: `save()` (`app/state.js`) writes the whole record
   to localStorage synchronously on every change, so a reload loses nothing
   that was saved. (When saving is failing, the app already shows its own
   storage warning; the toast does not try to repeat that.)
2. **Its own variant.** The update toast carries the class `update-toast` (on
   top of `.toast`). It has a leading refresh glyph (`rotate-ccw`, already
   vendored in `app/vendor/icons/`, path data added to `app/icons.js`), the
   title on its own line in bold, the help text under it.
3. **A primary Reload button.** Filled solid, not the shared gray
   translucent pill. The toast is the inverse surface (`--ink` ground, `--bg`
   text), so the primary fill on it is the inverse of the app's Graphite
   primary: `--accent-ink` fill with an `--accent` label. Those two tokens never
   move with team color, so the numbers hold for every team. Measured in a
   real browser, in light and in dark: the Reload label against the button
   **≥ 4.5:1**, the button fill against the toast **≥ 3:1**; the help text
   against the toast **≥ 4.5:1**.
4. **No dead band.** At 320 and 390 wide, 16 and 32px text, light and dark:
   when the Reload button fits beside the text it sits on the text's row; when
   it wraps under the text, the message's widest text line is at least 60% of
   the toast's content width (a short lone line over a wrapped button row is
   the dead band the owner saw). No clipping, no sideways scroll, nothing
   above the top of the screen.
5. **Behavior unchanged.** Never automatic; never over bench mode; comes back
   on the next visibility change if it was missed or dismissed; ✕ dismisses
   it; every control at least 48px tall; lifts clear of the action bar and the
   resume bar; Reload calls `location.reload()`; it dwells `UNDO_MS` like any
   other offer.
6. **A failing check exists.** A smoke row fails if the update toast loses
   `update-toast`, or if its button's measured fill against the toast falls
   under 3:1 (which the old gray pill does), in either theme.
7. **Other toasts unchanged.** `.toast`, `.tundo`, `.tip-toast`,
   `.install-toast` render exactly as before. The shared `.toast` rules are
   not edited.

## Surfaces

Change: `app/toast.js` (`offerReload` and the builder it calls), `app/app.css`
(new `.update-toast` rules beside the tip/install variants), `app/icons.js`
(one path), `test/coach.js` (verbs to fake a waiting worker and a takeover),
a new Coach scenario file, a new smoke module under `scripts/smoke/` plus its
registry entry and `scripts/smoke/README.md` row, `APP_LARGE_TEXT_STATES`
(two toast states), `test/sw.test.js` only if the builder's name moves.

Do not touch: `app/engine.js`, `app/state.js` (another lane is editing both),
any other screen's CSS, the shared `.toast`/`.tundo`/`.tmsg`/`.tacts` rules,
`app/vendor/**`.

## Constraints

- Reuse the existing toast machinery: `actionToast`'s host, timer, dismiss and
  `liftToasts` (one box, one timer). Do not write a second toast builder that
  re-derives them; extend what `actionToast`/`offer` take (a class and a
  message node) if that is the clean way.
- Tokens only: `--fs-*`, `--sp-*` where they exist, `--r`/`--r-sm`,
  `--accent`/`--accent-ink`. No new color literals in `app.css`.
- Mobile first: 390×844 first. Touch targets ≥ 48px. Animations stay
  transform/opacity (the shared `toastIn`/`toastOut`).
- The smoke row reads colors through a canvas (paint the computed color,
  read the pixel), not by regex-parsing `getComputedStyle` (Chrome reports
  `color-mix` as `color(srgb …)`); see `/browser-verify`.
- The fake waiting worker (a page that was already controlled at boot, and a
  `controllerchange` later) lives in one place under `scripts/smoke/` and is
  imported by both the Coach driver and any smoke row that needs it. It also
  stubs `navigator.serviceWorker.register` so the real worker cannot fire its
  own `controllerchange` mid-scenario.
- American spelling. No absolute privacy phrasings in copy.

## Design

`offerReload` keeps its gate (`updateWaiting`, `benchOpen()`) and calls an
exported `showUpdate(reload)` (name is the developer's) that raises the toast
through the shared machinery with class `update-toast`, the glyph, a `.tmsg`
holding the bold title and the help line, then the Reload button and ✕ in
`.tacts`. CSS, scoped to `.update-toast`:

- the glyph: `flex: none`, about 1.25em, `align-self: flex-start`, nudged to
  the title's cap height;
- `.tmsg`: title `display: block; font-weight: 700`, help `display: block;
  font-weight: 400`, color a token mix of `--bg` that clears 4.5:1;
- `.tundo`: `background: var(--accent-ink); color: var(--accent)`, hover a
  small mix toward `--accent`; same 48px height and radius as today;
- `align-items: flex-start` or center as the look checks show best, and
  enough `.tmsg` basis that the button wraps only when it really cannot fit.

## Proof

- **Coach seam** (new `test/update-scenarios.test.js`, through
  `test/coach.js`): on Today, a new version takes over and the coach sees
  "New version ready Reload to get it. Your game stays saved." with Reload and
  Dismiss (items 1, 5); tapping Reload reloads the page (5); with bench mode
  open a takeover shows nothing, and after leaving bench mode and coming back
  to the app the offer is there (5); dismissed with ✕, it comes back on the
  next visibility change (5).
- **Smoke row** (new module): raises the real update toast through
  `showUpdate` at 320 and 390, 16 and 32px, light and dark, over Today; checks
  `update-toast`, the three contrast numbers (canvas-read), the dead-band
  rule, 48px controls, nothing off screen (items 2, 3, 4, 6). Watch it fail
  against the current gray pill before the CSS lands.
- **Large-text and clip sweeps**: two new `APP_LARGE_TEXT_STATES` entries,
  "update toast on Today" and "update toast on the game screen", so
  `applargetext`, `clipsweep` and `scripts/look.mjs` cover it (item 4).
- `test/sw.test.js`'s three update tests keep asserting the same behavior.
- Item 7 is covered by the existing toast rows (`phone gutter`, the undo-toast
  states) staying green.

## Out of scope

- The toast still floats over content while it is up (the owner noted it
  covers two player rows). It is transient and dismissable, and every toast
  works this way; moving it is a different change.
- Restyling the undo, flash, tip or install toasts.
- Showing the toast in bench mode.
