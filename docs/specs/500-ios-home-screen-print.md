# #500 — Print in the iOS Home Screen app

## Issue

#500. Tapping Print card on Today showed the game screen and no print dialog.
The owner then confirmed on an iPhone, with Benchcard installed to the Home
Screen, that the Share sheet's Print button does nothing either:
`window.print()` does nothing in the iOS Home Screen app, so every Print button
there fails silently.

## Goal

A coach using the Home Screen app on an iPhone taps any Print button and gets
the iOS share sheet with the card image in it. That sheet has its own Print
action. Nothing on screen says Print and then does nothing. Everywhere else,
Print keeps opening the print dialog as it does today.

## Lane

Full lane. The survey put the change past the small lane's 20 lines outside
`test/` and `docs/` (`app/app.js`, `app/teams-view.js`, `app/share.js`,
`app/index.html`). No pure module changes.

## Decisions

The ticket is `ready-for-agent`, and its two comments replace the first steps
of the body. Where the survey falsified a claim or the ticket offered a choice,
this spec picks the option closest to the ticket's intent:

- **The view-transition race (body, step 2) does not exist.** The survey found
  that `setView` (`app/render.js`) stopped using view transitions long ago and
  paints synchronously inside the call; its own comment says `instant` "no
  longer changes the animation (there is none to suppress)" and now only skips
  `window.scrollTo(0, 0)`. So the Today row's `setView('games')` paints the
  game screen before `#print` is clicked, and passing `instant` would only make
  the coach land on the game screen scrolled to wherever Today was. **The Today
  row's view switch stays as it is.** `printCard`'s comment, which still warns
  about "the transition's snapshot overlay", is corrected. The guard the
  ticket asks for becomes: the game screen is the screen showing at the moment
  print is called from Today.
- **How the mode is detected.** `navigator.standalone === true`, the ticket's
  own test. That property exists only on iOS/iPadOS Safari and is `true` only
  in a Home Screen app. An Android installed app (`display-mode: standalone`)
  keeps `window.print()`, which works there. One exported predicate, used by
  every caller; nobody re-reads `navigator.standalone` for this.
- **What Print does in that mode.** `printCard` calls `shareCardImage` instead
  of `window.print()`: the same card image, through the same synchronous path,
  so the tap's activation still reaches `navigator.share`. It does not count a
  print (`card_printed`, `tipAfterPrint`); the share counts itself
  (`card_shared`).
- **One button, not two (Share sheet and first-run step 3).** In that mode
  Print and Share image would do the same thing. So `#print` and `#frPrint`
  are relabelled **Share to print** (printer icon kept) and `#shareCard` and
  `#frShare` are hidden. "Share to print" is the ticket's own example: it says
  a share sheet opens and why.
- **Print card under the card (`#cardPrint`)** reads **Share to print** in that
  mode, same handler.
- **Print card on Today (second comment).** It keeps its one path: open the
  game, show it, click `#print`, which now shares the image. Chosen over
  opening the app's Share sheet because it is one tap to the iOS sheet with
  Print in it, and the same `printCard` every other Print button runs. The
  coach ends on the game screen with the iOS share sheet over it, not on the
  game screen with nothing happening. The button reads **Share to print** and
  is named `Share to print card for <game>`.
- **Copies** is hidden in that mode: the image always carries one copy, so the
  row would do nothing. **Games to print stays**: the survey found the image
  already draws every card on the page side by side (`shareCardImage` takes
  every `#sheet .card:not(.card-copy)`), so "Every game today" carries over.
- **The image's failure toasts** say "Print still works." today. In that mode
  that is false, so they end at the first sentence there ("Could not make the
  image." / "Could not share the image.").

## What would settle it

With `navigator.standalone === true` emulated (no real iPhone is available to
the build), on RICH game day (Hawks 9:00 AM, Ravens 11:30 AM, both planned):

1. Tapping **Share to print card for Ravens** on Today calls
   `navigator.share` once with one PNG file whose name is
   `benchcard-ravens.png`, does not call `window.print()`, and leaves the game
   screen showing.
2. In the Share sheet the primary button reads **Share to print**; there is no
   **Share image** button and no **Copies** row; **Games to print**, Size,
   Names and Minutes strip are still there. Tapping Share to print shares one
   PNG and calls `window.print()` zero times.
3. On the Card view, the button under the card reads **Share to print** and
   shares one PNG; zero prints.
4. First-run step 3 shows one button, **Share to print**, and no Share image.
5. Without the emulation, every existing print scenario in
   `test/print-card-scenarios.test.js` still passes unchanged in what it
   asserts: labels Print / Print card / `Print card for Ravens`, one print per
   tap, Copies present. Tapping Print card for Ravens on Today calls
   `window.print()` with `view-games` the screen showing.
6. Look checks, emulated mode, long team and opponent names (team
   "Alexandria Montgomery-Okafor", opponent of similar length): Today rows,
   the Card view, the Share sheet scrolled to the bottom, at 320 and 390 wide,
   16 and 32px text. No clipped or cramped label.

## Device table

| Device and mode | Before | After |
| --- | --- | --- |
| iPhone, Home Screen app (owner) | every Print: no dialog | Share to print opens the iOS share sheet (emulated; owner to confirm after deploy) |
| iPhone, Safari tab | not tested; assumed to print | unchanged |
| Desktop Chromium | `window.print()` called (ticket body) | unchanged, proven by scenario 5 |
| Android installed app | not tested | unchanged (`navigator.standalone` is undefined there) |

## Surfaces

Change: `app/app.js` (`printCard`, `shareCardImage`'s toasts, a boot-time
pass that relabels and hides the static buttons and the Copies row),
`app/teams-view.js` (the Today row's label and name), `app/share.js` (the
exported predicate and the `SHARE_TO_PRINT` label, beside the share path it chooses), `app/app.css` (`.today-print` wraps: the longer Home Screen label overflowed its button by 4px at 320px / 32px text), `app/index.html` only
if the Copies row needs a hook, `test/coach.js` (a Home Screen app verb and a
share-sheet record of files), `test/print-card-scenarios.test.js` or a new
scenario file.

Must not change: `app/engine.js`, `app/state.js` (another lane is editing them),
`app/storage.js`, `app/card.js`'s `data-needs-card` sweep, the card itself.

## Constraints

- `test/print-gate.test.js` discovers print/share controls from `app.js`
  handlers: `printCard` and `shareCardImage` stay zero-argument named
  top-level functions, and every control that reaches them keeps
  `data-needs-card` (the Today row keeps none, per #432).
- `shareCards` must stay synchronous up to `navigator.share`: no `await`
  between the tap and the share (share.js header).
- Reuse `shareCardImage`; do not build a second image path. Reuse the one
  predicate; `toast.js`'s broader `standalone()` (install prompt) is a
  different question and stays unless folding it onto the predicate is a
  plain win.
- Labels are real text, not CSS `content`. The visible label is part of the
  accessible name (`Share to print card for Ravens` contains `Share to print`).
- `test/coach.js`'s game-row filter skips the Print card control by its name
  prefix; it must skip the new name too.
- Touch targets stay ≥48px; no new horizontal overflow at 320px/32px.
- American spelling; the privacy phrasing guard applies to new strings.

## Proof

- **Coach seam** (`test/coach.js`, a new verb that opens the app as the Home
  Screen app: `navigator.standalone` true and a share sheet that accepts files
  and records each share's file names and title). Covers items 1–4.
- **Coach seam, unchanged mode:** the existing scenarios cover item 5, plus one
  new assertion that print from Today happens with `view-games` showing (the
  print spy records the showing view).
- **Look check:** `scripts/look.mjs` with the emulation, item 6, by the
  orchestrator in step 7 and on the preview.

## Out of scope

- Real-device testing: the owner checks after deploy (tap Print on Today and
  in the Share sheet; a share sheet with Print in it should open).
- The eight chart pages' `print()` buttons (public pages, not the app).
- Changing the image for multi-game days.
