# #112 — The day-name field shows the team name and reads as part of this game

## Issue

#112. On the game screen, the first field under "This game" is labelled "Day
or tournament" and shows the team's name as gray placeholder text. It names
every game on that date, not this game, and nothing says it is optional.

## Goal

A coach looking at the game screen sees an empty field that is clearly
optional, clearly named for the day, and clearly shared by every game on that
date. It never shows something that looks like a wrong value typed in.

## Decisions

The issue is unlabelled. The survey held up every claim, and the glossary and
guidelines answer each open question, so none is the owner's to decide:

- **The survey.** `app/game-setup.js:41` and `app/app.js:112` both set the
  placeholder to `teamName() || 'Name this day…'`, so the markup's own
  placeholder (`app/index.html:680`) never shows while a team has a name.
  `dayHeading` in `app/state.js` shows the day name on Today's day headings.
  `CONTEXT.md` **Day**: "Every day has a date; a name ('Spring Classic') is
  optional", and it says to avoid "tournament" as a word for a day.
- **Label `Day name`.** The glossary's word is **Day**, and it says a
  tournament is one kind of day. "Day or tournament" uses the avoided word.
- **Placeholder `Spring Classic (optional)`.** The glossary's own example,
  with the word the acceptance criteria ask for. It is set in one place (the
  markup). No script overwrites it, so the two `teamName() ||` lines go, and
  so does `#teamName`'s `oninput` repaint of it.
- **Move the field after Date, with a hint under it.** The name belongs to the
  date, so it reads after the date. The hint says, in one line, that every
  game on that date shares the name: `Shared by every game on <date>`, where
  `<date>` is `weekdayLabel(state.day.date)` (the same formatter
  `dayHeading` uses, e.g. "Wed, Sep 23"). It is repainted in `renderSetup`,
  the one place `#gameDate` is repainted, so moving the game to another date
  updates it. The field points at the hint with `aria-describedby`, so a
  screen reader reads it too.
- **Row layout.** Today Date and Opponent share one row. After the change
  the order is: Date and Opponent (one row, unchanged), then Day name with its
  hint (its own row), then Tip-off.
- **Tip-off is out of scope.** The issue says it may go in its own issue. It
  is a different control (a native time input that cannot show a
  placeholder), and a separate issue keeps this change to copy and order.
  It is filed as #118.
- **Nothing a coach saved changes.** `state.day.name` keeps its key and its
  meaning. Only the label, placeholder, order and hint change.

## What would settle it

1. With a team named "Sample team" and a day with no name, `#dayName`'s
   placeholder is exactly `Spring Classic (optional)`, and no script sets the
   placeholder (the team name never shows in it).
2. The label for `#dayName` reads `Day name`. No coach-visible text says
   "Day or tournament".
3. A hint element sits right after `#dayName`, reads `Shared by every game on
   <weekdayLabel(state.day.date)>`, and `#dayName` has `aria-describedby`
   pointing at it. Moving the game with `#gameDate` updates the hint's date.
4. In the "This game" box, the `#dayName` row comes after the row holding
   `#gameDate`.
5. Checked at 390×844 and at 320px with 32px text, light and dark, with a
   long day name typed in: nothing clipped (smoke's overflow and large-text
   reflow checks, plus a browser look).
6. `npm test` and `npm run smoke` pass. Any test that asserts the old label
   or placeholder is updated in the same change.
7. `app/sw.js` `VERSION` bumped and `SHELL` set to the digest `npm test`
   names.

## Surfaces

Changes: `app/index.html` (the "This game" box), `app/game-setup.js`
(`renderSetup`), `app/app.js` (the `#teamName` handler's placeholder line),
`app/app.css` (only if the hint needs a style; reuse an existing one if one
fits), their comments that name "Day or tournament", `app/sw.js`, tests.

Must not change: `state.day.name`'s key or how it is saved, `dayHeading`,
`moveGame`, the Tip-off field.

## Constraints

- **One answer lives in one place:** the placeholder lives in the markup
  only. The date in the hint comes from `weekdayLabel`, not a new formatter.
- **Glossary:** use **Day**; do not use "tournament" for a day.
- **Mobile first:** the phone layout is the one that has to read right.
- **Precache bump** for every precached file changed.
- **`wrap-blind.test.js`:** negative checks use `lacks` from `test/prose.js`.
- **A test reads the DOM a module builds**, not the source text, unless it is
  named below as a guard.

## Design

- `app/index.html`: in `.s-thisgame`, move the `#dayName` row after the
  Date/Opponent row. Label `Day name`, placeholder `Spring Classic
  (optional)`, `aria-describedby="dayNameHint"`, and a hint element
  `#dayNameHint` right after the input, in the smallest muted style already
  used for a field note on this screen.
- `app/game-setup.js` `renderSetup`: drop the placeholder line; set
  `#dayNameHint`'s text from `weekdayLabel(state.day.date)`.
- `app/app.js`: drop the `#teamName` handler's placeholder line, and fix its
  comment so it no longer says the day title reads the team name.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `renderSetup` against a DOM with a team name and an unnamed day: placeholder, hint text, and hint after a date change | `node --test`, the existing game-setup test harness | 1, 3 |
| the markup: label text, `aria-describedby`, row order | `node --test`, reading `app/index.html` as the DOM the page loads | 2, 3, 4 |
| overflow, large-text reflow, accessible names | `npm run smoke` | 5, 6 |
| a long day name at 390×844 and 320px/32px, light and dark | `/browser-verify` on the preview | 5 |
| `test/sw.test.js`'s digest | `npm test` | 7 |

## Out of scope

- The Tip-off field's empty state (#118).
- Renaming `state.day.name` or anything saved.
- Where else the day name shows (Today's heading, season rows).
