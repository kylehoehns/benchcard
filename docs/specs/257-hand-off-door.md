# #257 — Hand off sits beside Print, not under it

## Issue

#257: Hand off this game is buried at the bottom of the card sheet, under the
print settings. Printing is front and center, so coaches don't find it.

## Goal

A coach who taps the share icon on the game screen sees two choices at the
top of the sheet: Print card and Hand off. Picking Hand off shows the QR code
and the Share link button right there, in the same sheet. Coaches who only
print see the sheet they have today. The about and advanced pages say the
feature exists, and the privacy notes stay honest about it.

## What the survey found

On `main` (d639b19):

- **The door today.** `#shareBtn` opens `#sheetCard` (`app/app.js:177`). The
  sheet holds, in order: the preview, `#cardnote`, Print and Share image, the
  print settings, the "Cut on the dashed line" note, then the `#handoffBtn`
  row (`app/index.html:794-881`).
- **Hand off is its own dialog.** `#handoffBtn` lazy-imports
  `handoff-view.js` (`app/app.js:431`). `openHandoff` fills and opens
  `#sheetHandoff`, a second sheet (`app/index.html:887-908`).
- **No card yet is already handled on both sides.** `#shareBtn` shows on
  every game screen (`render.js:824`). With a blocked plan, Print and Share
  image are disabled by `[data-needs-card]`, and `openHandoff` writes "There
  is no card to hand off yet. Fix the plan first." Nothing to decide here.
- **About and advanced** never mention hand-off. Both say "Your roster never
  leaves your device." (`about.html:1081`, `advanced.html:693`).
- **Other places that name the door:**
  - the tour's `#shareBtn` step body (`app/tour.js:94`) says the button
    "prints the card or shares it as an image";
  - guideline A2 lists "Share the card" as an example name;
  - `scripts/smoke/hand-off.mjs` drives `#handoffBtn` and `#sheetHandoff`.

## Decisions (made with the human)

1. **A segmented control at the top of the sheet:** Print card | Hand off.
   Picking one swaps the sheet body in place.
2. **The QR shows inline,** under Hand off. `#sheetHandoff` goes away and its
   content moves into the share sheet.
3. **Print card is selected every time the sheet opens.** Nothing is
   remembered.
4. **Names.**
   - The sheet title changes from "The card" to "Share".
   - The share icon's accessible name changes from "Share the card" to "Share
     or hand off".
   - The segments are "Print card" and "Hand off".
5. **No-card games** keep today's behavior on both segments.
6. **About, advanced and privacy:**
   - one entry in about.html's Questions;
   - one section on advanced.html, "Handing a game to an assistant";
   - one sentence in both privacy notes.

## What would settle it

At 390×844, under the smoke clock, with the rich fixture (`goRich`):

- **A. Default.** Tap `#shareBtn`. The sheet's heading reads "Share". The
  segment control is the first control in the sheet body, with "Print card"
  pressed (`aria-pressed="true"`) and "Hand off" not pressed. The preview,
  Print, Share image and the print settings are visible. No hand-off control
  is visible. `#handoffBtn` and `#sheetHandoff` no longer exist.
- **B. Hand off inline.**
  - Tap Hand off. The same dialog stays open, and no second dialog opens.
  - The QR is drawn, and Share link is enabled.
  - The note "Anyone you send this to can open it." and the names list show.
  - The preview, Print, Share image and the print settings are not visible.
  - Everything #250's `handOffPass` checks still holds: the QR is the link
    Share hands out, and a wiped profile opens that link onto the same game.
- **C. Back to Print.** Tap Print card. The print body shows again, and the
  hand-off body is hidden.
- **D. Reset on open.** Pick Hand off, close the sheet, then reopen it with
  `#shareBtn`. Print card is pressed.
- **E. Still lazy.** On a cold load, `handoff-view.js` and `vendor/uqr.mjs`
  are not fetched until Hand off is first tapped. Opening the sheet on Print
  card does not fetch them. #250's `handOffLoadPass`, re-pointed at the new
  door.
- **F. No card.** On a game with a blocked plan, Print card shows Print and
  Share image disabled, as today. Hand off shows "There is no card to hand off
  yet. Fix the plan first." with Share link disabled.
- **G. Names.**
  - `#shareBtn`'s accessible name is "Share or hand off".
  - The tour's share step body names the hand-off.
  - Guideline A2's example reads "Share or hand off".
- **H. Pages.** In each page's rendered `innerText`:
  - about.html has a Questions entry about an assistant running subs from
    their phone, linking to `advanced.html#handoff`;
  - advanced.html has a section headed "Handing a game to an assistant"
    (`id="handoff"`) covering what travels (one game, card names only, where
    the game stands), that the two phones are not linked afterward, and where
    the door is;
  - both privacy notes keep "Your roster never leaves your device." and add a
    sentence that a hand-off link carries one game's card names to whoever
    you send it to, and no Benchcard server sees it.
- **I. The usual smoke rows stay green.** These are overflow at 390×844,
  touch targets, accessible names, unique ids, large text at 320px/32px, and
  the payload budget. Widen bytesAbs if the budget needs it.

## Surfaces

- **Changes:**
  - `app/index.html`: `#sheetCard`, and `#sheetHandoff` removed;
  - `app/app.js`: the `#shareBtn` and segment wiring, and the hand-off door;
  - `app/handoff-view.js`: renders into the share sheet and no longer opens
    its own;
  - `app/app.css`, if the segment or the swap needs a rule;
  - `app/tour.js`, the step body copy;
  - `app/about.html` and `app/advanced.html`;
  - `app/sw.js`, from the precache bump;
  - `docs/interface-guidelines.md` A2;
  - `test/`;
  - `scripts/smoke/hand-off.mjs`, plus one new row or an extension for A–D.
- **Must not change:**
  - `handoff.js` (`encode`, `decode`, `receive`, `leavingNames`): what travels
    and how it arrives;
  - the card, the print path, and every print setting's behavior;
  - `state.js`, `live.js`, and the four pure modules;
  - `notes/mockups/prototype/`. This issue is not a #18 child.

## Constraints

- **Reuse, do not re-derive:**
  - The segment is the existing `.seg` primitive with `aria-pressed`, the
    same shape as `#viewSeg` (`index.html:662`). Guideline C7 allows two
    options to switch a view. Do not build a new tab component.
  - The hand-off body keeps the existing ids (`#handoffQr`, `#handoffShare`,
    `#handoffShareLabel`, `#handoffNote`, `#handoffNamesH`, `#handoffNames`,
    `#handoffStatus`) so `handoff-view.js` and its tests keep working.
  - Names on the sheet come from `leavingNames`. The pages describe them as
    card names, which is what `leavingNames` returns.
- **Lazy loading stays.** `handoff-view.js` is imported on the first Hand off
  tap, as `app.js:431` does today. It is never imported at boot.
- **A stale Hand off render must not land on Print.** `openHandoff` already
  guards with its `opening` counter. Switching back to Print card, or closing
  the sheet, mid-encode must not leave a half-drawn QR the next time Hand off
  is shown.
- **The privacy claim (`REVIEW.md`, privacy pass).** Keep the claim narrow
  and true. The link's game rides after `#`, which a browser never sends.
- **About dateline.** `about.html` changes, so its "last updated" date
  changes too. `check-about-date.mjs` enforces this.
- **Precache.** `index.html`, `app.js`, `handoff-view.js`, `tour.js`,
  `about.html` and `advanced.html` are precached, so run `npm run sw:bump`.
- **Mobile first.** Measure at 390×844 first. Then check 320px at 32px text
  (the large-text row).

## Design

1. **Header.** In `#sheetCard`, the heading becomes "Share". As the first child
   of `.bsheet-body`, add `<div class="seg wide" id="shareSeg" role="group"
   aria-label="Print or hand off">` with two buttons:
   `data-pane="print"` "Print card" and `data-pane="handoff"` "Hand off".
2. **Two panes.**
   - The print pane wraps today's preview, `#cardnote`, CTA, settings and the
     cut note, unchanged.
   - The hand-off pane holds `#sheetHandoff`'s body and `#handoffStatus`.
   - Delete `#sheetHandoff`, `#handoffBtn` and `#sheetHandoffClose`.
3. **Opening and switching.**
   - `#shareBtn` opens the sheet with Print card selected, then runs
     `refreshCardSheetPreview` as today.
   - Picking Hand off shows its pane and calls `openHandoff()` from the
     lazily imported module. `openHandoff` now fills the pane instead of
     opening a sheet.
   - Picking Print card shows the print pane and refreshes the preview,
     because the clone fit needs a non-zero box.
4. **Copy.**
   - `#shareBtn` aria-label: "Share or hand off".
   - The tour step body names Hand off.
   - Guideline A2's example changes to match.
5. **Pages.** About: one `details.qa` entry. Advanced: a `<section>` with
   `h2#handoff`. Privacy: one added sentence in each note.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| The share sheet's segments, panes, reset on open, and no-card states | a smoke row (`scripts/smoke/`, rich fixture, 390×844) | A, B, C, D, F |
| #250's hand-off rows re-pointed at the segment | `scripts/smoke/hand-off.mjs` (`handOffPass`, `handOffLoadPass`) | B, E |
| The accessible name, the tour copy, and the page copy, read from rendered `innerText` and the accessibility name | the same smoke row, plus `test/` for the tour step text | G, H |
| A2's wording | `docs/interface-guidelines.md`, reviewed in the diff | G |
| Overflow, targets, names, ids, large text, budget | the existing smoke rows | I |

## Out of scope

- What a hand-off carries and how it arrives (`handoff.js`).
- #255, the welcome flash on hand-off arrival.
- Remembering the last segment.
- New prototype frames.
- Changing Share image or any print setting.
