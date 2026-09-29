# #232: Closing a pinned timeline card returns focus to the player's name

## Issue

#232. On the game screen's Timeline, closing a pinned card with its × leaves
keyboard focus on `<body>`, so a keyboard or screen-reader user loses their
place in the list.

## Goal

A coach using a keyboard or a screen reader opens a player's card from the
Timeline, reads it, and closes it. They land back on that player's name, not
at the top of the page, so the next Tab or arrow press carries on from where
they were.

## Decisions (locked by the owner, 2026-09-29)

1. **Closing with the × returns focus** to the pinned row's `.tl-name`, whether
   the × was pressed with the keyboard or clicked with a mouse.
2. **Escape also closes the card.** The survey found the issue's claim that
   Escape closes it was false: on main, Escape does nothing to the card (the
   only Escape handler is the modal focus trap in `app/trap.js:57`). The owner
   chose to add it. Escape closes the card when focus is inside `#tlDetail` or
   on the pinned row's `.tl-name`, and focus lands on that `.tl-name`.

## What the survey found

- `app/timeline.js:457`: the × runs `tlPinned = null; renderTimeline();`.
  `renderPinned` then removes `.tld`, and the focused × goes with it, so focus
  falls to `<body>`.
- Pinning and unpinning do not rebuild the rows: the rows are only rebuilt when
  `box.dataset.sig` changes (`timeline.js` ~line 255). The row's `.tl-name`
  button is the same element before and after closing, so it can take focus
  straight back.
- Tapping the name again (`timeline.js:282`) also unpins. Focus is already on
  the name there, and that must not change.

## What would settle it

At 390×844 on the game screen's Timeline, with the RICH fixture:

1. Tab to the second row's `.tl-name` and press Enter: the card opens. Tab to
   the × and press Enter: the card closes, and `document.activeElement` is that
   row's `.tl-name`.
2. The same, but the × is clicked with the mouse: `document.activeElement` is
   that row's `.tl-name`.
3. Open the card, move focus to the ×, press Escape: the card closes
   (`#tlDetail` is gone and the name's `aria-expanded` is `"false"`), and
   `document.activeElement` is that row's `.tl-name`.
4. Open the card with Enter (focus stays on the name), press Escape: the card
   closes, and focus is still on the name.
5. With no card open, Escape on the Timeline does nothing (no error, and focus
   does not move).
6. Escape inside an open modal (anything using `app/trap.js`) still behaves as
   it does today. It must not also close a pinned card behind the modal.
7. Each of items 1–4 fails on today's main.

## Surfaces

- **Change:** `app/timeline.js` (the × handler and a keydown handler for
  Escape), `scripts/smoke/pinned-card.mjs` or a new smoke module plus its
  `registry.mjs` and `scripts/smoke/README.md` rows, and `app/sw.js` (from
  `npm run sw:bump`).
- **Must not change:** the pinned card's look (#230's one joined card), and
  `app/trap.js`.

## Constraints

- Put focus back on the **same** `.tl-name` element the card belongs to; find it
  by `data-id`, with `CSS.escape`, as `renderPinned` already does.
- Escape is scoped to the Timeline card. It must not go on `document` in a way
  that fires while a modal's trap is open (item 6). A listener on `#timeline`
  (or the card and the row) is the simplest way to keep it scoped.
- `focus()` must not scroll the page: pass `{ preventScroll: true }` if the name
  is already in view, so closing never jumps the list.
- `npm run sw:bump`, since `timeline.js` is precached.

## Design

- The × handler records the pinned id, clears `tlPinned`, re-renders, then
  focuses `#timeline .tl-row[data-id="<id>"] .tl-name`.
- An Escape keydown on `#timeline`: if a card is open and the event came from
  inside `#tlDetail` or from the pinned row's `.tl-name`, close it the same way
  (one shared close function, not two copies) and stop the event.

## Proof

- **Smoke, in a browser:** a check (added to `pinned-card.mjs`, or a new row
  such as "closing a pinned card returns focus to the name") that lands on the
  Timeline at 390×844 and drives items 1–5 with real key presses and a real
  click, reading `document.activeElement`. It covers items 1–5. Item 7 is shown
  by running it against today's `timeline.js` before the fix.
- **Item 6:** the check opens a modal that uses the trap, presses Escape, and
  asserts the pinned card is still open behind it. If no modal can be opened
  from the game screen with a card pinned, say so in the report and cover
  item 6 by reasoning about the listener's scope instead.

## Out of scope

- Moving focus *into* the card when it opens.
- Any change to how the card looks or animates.
