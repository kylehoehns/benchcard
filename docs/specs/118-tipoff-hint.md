# #118 — The Tip-off field is an empty box when no time is set

## Issue

#118. On the game screen, the Tip-off field (`#when`, a native
`type="time"` input) shows the browser's own empty state when no time is set.
A coach cannot tell what goes in it, or whether it is needed.

## Goal

A coach looking at "This game" with no tip-off set can tell the field takes
a time, that it is optional, and what setting it does.

## Decisions

The issue is unlabelled. The survey held up every claim, and the glossary
and #112 answer each open question, so none is the owner's to decide:

- **The survey.** `app/index.html` has `#when` as `type="time"` with no hint
  and no `aria-describedby`. `app.js` wires `oninput` to `setTipoff`
  (`app/state.js`), which stores the time and re-sorts the day's games by it.
  `renderSetup` (`app/game-setup.js`) sets its value. A time input cannot
  show a placeholder, so example text in the box is not an option.
- **A hint line, not a "Set a time" button.** The issue names the hint as
  the smallest option. #112 just put the same kind of hint under Day name,
  one row up, so the box reads one way. A button that reveals the input adds
  a second tap and a state to test, for a field a coach may want every game.
- **The copy: `Optional. Sets the order of the day's games.`** `CONTEXT.md`
  **Tip-off**: "The time a game starts, on its day's date; optional. Games in
  a day are played, shown and evened out in tip-off order." The hint says
  both halves in the coach's words. It is static, so it lives in the markup
  only, and no script sets it.
- **The label stays `Tip-off`.** It is the glossary's word. "Optional" is in
  the hint, as #112's placeholder carried it for Day name.
- **Same style and spacing as `#dayNameHint`.** A `.note` right after the
  input, inside `.s-thisgame`, where #112's rule already pulls it close to
  its field. No new CSS unless the browser look shows a gap is wrong.

## What would settle it

1. `#whenHint` is a `.note` right after `#when` in `app/index.html`, and its
   text is exactly `Optional. Sets the order of the day's games.`
2. `#when` has `aria-describedby="whenHint"`.
3. No script writes `#whenHint` (the text lives in the markup only).
4. The label for `#when` still reads `Tip-off`.
5. Checked at 390×844 and at 320px with 32px text, light and dark, with no
   tip-off set: nothing clipped in "This game", and the hint sits closer to
   `#when` than to the next thing below it.
6. `npm test` and `npm run smoke` pass.
7. `app/sw.js` `VERSION` bumped and `SHELL` set to the digest `npm test`
   names.

## Surfaces

Changes: `app/index.html` (the Tip-off row and its comment), `app/sw.js`,
a test.

Must not change: `setTipoff`, `validTipoff`, how a tip-off is saved,
`renderSetup`, the card's corner label, the Day name row.

## Constraints

- **One answer lives in one place:** the hint text lives in the markup only.
- **Reuse, do not re-derive:** the markup test uses `element` from
  `test/markup.js`, as `test/day-name-field.test.js` and
  `test/this-game.test.js` do. Put the new cases in
  `test/day-name-field.test.js` only if they fit its seam; otherwise a new
  small test file.
- **Glossary:** use **Tip-off**; avoid "tip time" and "start time".
- **Mobile first.**
- **Precache bump** for `app/index.html`.
- **`wrap-blind.test.js`:** negative checks use `lacks` from `test/prose.js`.

## Design

- `app/index.html`: in the Tip-off row, add
  `aria-describedby="whenHint"` to `#when` and
  `<p class="note" id="whenHint">Optional. Sets the order of the day's
  games.</p>` right after it. Update the row's comment to say why (#118).

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| the markup: hint element, text, placement, `aria-describedby`, label | `node --test`, reading `app/index.html` with `test/markup.js` | 1, 2, 4 |
| no script in `app/` names `whenHint` (a guard, named here) | `node --test` | 3 |
| overflow, large-text reflow, accessible names | `npm run smoke` | 5, 6 |
| no tip-off at 390×844 and 320px/32px, light and dark | a browser look | 5 |
| `test/sw.test.js`'s digest | `npm test` | 7 |

## Out of scope

- A "Set a time" button, or any change to how a time is entered or cleared.
- The date and time values cut off at 320px with 32px text (#120).
