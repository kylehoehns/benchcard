# #102 — Tip-off is a time

## Issue

#102, the third slice of #64 (plan games for a future day). Tip-off becomes a
real time picked from a native time input, and a day's games sort by it.

## Goal

A coach types "9:00 AM" once, from the phone's own time picker, and the day's
games line up in the order they are played — on Today, on the game screen, and
in how the day evens minutes out. A game with no tip-off yet still works; it
just waits at the end of its day.

## Decisions this slice rests on

Settled with the maintainer on #64 and in `CONTEXT.md` (**Tip-off**: optional;
games in a day are played, shown and evened out in tip-off order). The ticket is
`ready-for-agent`; the survey below found two claims the tree does not support,
and they are settled here from the ticket's own rule ("everywhere it showed
before") rather than escalated:

- **The Resume bar never showed a tip-off.** Its label is
  `gameLabel(...) · <where> · Resume` (`renderResumeBar`, `app/teams-view.js`).
  The ticket's list is illustrative of "everywhere it showed before"; the Resume
  bar is left as it is.
- **The printed card did show it.** `card.js` passes `g.when` to `buildCard` as
  the header's right corner. So the card shows the formatted time in that same
  spot ("9:00 AM"), which is what "everywhere it showed before" means. #103 then
  adds the weekday there; this slice changes nothing else about the card.

Decided while writing this spec (implementation, not user-facing trade-offs):

- **The field is renamed: `when` → `tipoff`**, holding `"HH:MM"` (24-hour,
  zero-padded) or `""`. The shape is the migration (`app/storage.js` header):
  `sanitize` reads only `tipoff`, so every old free-text `when` is dropped on
  first load — acceptance item 4 — with no version branch. Keeping the name and
  testing the string would keep old text that happens to look like a time
  ("10:00" was typed as free text and could have meant anything), which item 4
  says to clear. A stale v7 build reading a new record finds no `when` and shows
  no tip-off: harmless, so **no storage-key bump**.
- **The stored order is the order.** Each day's `games` array is kept sorted by
  tip-off (a stable sort: timed games first, earliest first; untimed after, in
  the order they already had). Everything that walks a day in order — the
  passes, "Game N", `solveDay`'s evening out, `evensOutLine` — then follows with
  no second ordering to keep in step. The open game follows its own id across a
  re-sort.
- **Markup ids stay** (`#when`, `.pass-when`, `.card-hd .when`): only the
  data field is renamed. Fewer moving parts, and the ids never reach a coach.
- **The shown time is the phone's locale**, `toLocaleTimeString(locale,
  { hour: 'numeric', minute: '2-digit' })`, the same `undefined`-locale habit
  `dayHeading` and `season-view.js`'s `dateLabel` use. Current ICU puts U+202F
  (narrow no-break space) before "AM"; tests match the Intl output or `\s`,
  never a hard-coded ASCII space.

## What would settle it

1. **Input.** Step 1 of Add a game and the game screen's "This game" both carry
   a native `<input type="time">` labelled "Tip-off", optional; emptying it
   stores `tipoff: ""`. It is at least 48px tall (I1), sized in `rem` (T2), and
   at 320px with 32px text it does not push the page sideways.
2. **Display.** With `tipoff: "09:00"` and en-US, the game pass, its
   `aria-label`, the game screen's sub line (`#gameSub`), the sentence's
   "Evens out …" line and the card's corner read `9:00 AM`; `"13:30"` reads
   `1:30 PM`. With `tipoff: ""` none of them shows a time (the pass and sub line
   drop the segment; "Evens out" falls back to the opponent, as now).
3. **Order.** A day with games added in the order B (no tip-off), C (`"13:00"`),
   A (`"09:00"`), D (no tip-off) is shown, labelled and evened out in the order
   A, C, B, D. Changing C's tip-off to `"08:00"` re-sorts to C, A, B, D, and the
   evening out of the games after it is re-planned against the new order (the
   plans for A under carryover differ before and after). Clearing A's tip-off
   then gives C, B, D, A: a game that loses its time goes after the timed
   games and after the untimed games already there (a stable sort of the
   current array). The open game stays open across every re-sort.
4. **Migration.** A v7 record (or backup restored through `restoreBackup`) with
   `when: "Sat 9:00"`, `when: "10:00"` or any other `when` loads with
   `tipoff: ""` and every other field of the game unchanged. A record with a
   valid `tipoff` keeps it; a malformed one (`"9:00"`, `"25:00"`, `"12:60"`,
   `42`) is treated as absent. Loading sorts each day by tip-off, so a
   hand-edited backup still holds item 3's order.
5. **Same as.** The "Same as …?" card on step 1 reads `Same as 9:00 AM?` when
   the team's last game has `tipoff: "09:00"`, and `Same as the last game?` when
   it has none. (This replaces the old fallback to the opponent, as the ticket
   says.)
6. `npm test` and `npm run smoke` pass, and any test written against the old
   free-text field or its `Sat 9:00` placeholder is updated or retired in the
   same change.

## Surfaces

Changes: `app/storage.js` (sanitize `tipoff`, sort each day), `app/state.js`
(`newGame`, the legacy-record mapper, the sort helper, the time label,
`evensOutLine`, `sameAsLast`, `addGame`/`moveGame` keep the order),
`app/teams-view.js` (pass, pass `aria-label`, sub line, step 1's field and the
draft's empty check), `app/game-setup.js` and `app/app.js` (`#when` reads and
writes `tipoff` and re-sorts), `app/card.js` (one line: the corner gets the
formatted time), `app/index.html` (`#when` becomes `type="time"`), `app/app.css`
(`input[type=time]` joins the input rules the way #101 added
`input[type=date]`), `app/sw.js` (`VERSION`, `SHELL`), `scripts/og.mjs` and
the smoke fixtures/checks that write `when`, tests under `test/`.

Must not change: `app/engine.js`, `app/budget.js`, `app/balance.js` (the
solver), the season's shape (`seasonGame`), the card's layout (#103 owns it),
the Resume bar's label.

## Constraints

- **The shape is the migration** — no version branch in `sanitize`; idempotent.
- **Reuse, do not re-derive:** `flowField(..., type)` (trap.js, #101) for the
  step-1 field; `gameLabel` for the untimed fallback; `solveDay`/`computeAll`'s
  existing per-day walk for evening out — sorting the array is the whole change
  there; `openGame` to keep the open game after a re-sort. One time-label
  function, used by every display site in item 2 — not a `toLocaleTimeString`
  call per site.
- **The four pure modules** (`engine`, `budget`, `balance`, `storage`'s pure
  parts) stay DOM-free; the label helper takes the locale as a parameter
  (default `undefined`) so tests pin en-US.
- **Precache bump:** any change to a precached file bumps `VERSION` in
  `app/sw.js` and sets `SHELL` to the digest `npm test` names.
- Guideline rules from the ticket: **C6** (one control per row: the tip-off
  field is its own row), **I1** (48px), **T2** (`rem`), **W1** (sentence case:
  "Tip-off", "Same as the last game?").

## Design

- `validTipoff(v)` → `"HH:MM"` or `""` (regex `^([01]\d|2[0-3]):[0-5]\d$`).
- `tipoffLabel(hhmm, locale)` → `""` for `""`, else the locale time built from
  local parts (`new Date(2000, 0, 1, h, m)`), never a parsed string.
- `sortDay(games)` → stable in-place sort: timed by `tipoff` string compare,
  untimed after.
- `setTipoff(v)` in state: writes `tipoff` on the open game, sorts its day, and
  re-points `activeGame` at the same game id; `#when`'s input handler calls it
  and re-renders what `#when` re-renders today plus Today's passes.
- `addGame` sorts after inserting and opens the new game at its sorted index;
  `moveGame` sorts the day it lands in.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `sanitize` / `restoreBackup` exports | `node --test`, `test/storage.test.js`, `test/backup.test.js` | 4 |
| `validTipoff`, `tipoffLabel`, `sortDay`, `setTipoff`, `addGame`, `evensOutLine`, `sameAsLast`, `dayPlans` with a carryover day | `node --test` (state-fixture pattern) | 2 (label, Evens out), 3, 5 |
| DOM-stub render of a pass, `#gameSub` and the card corner | `node --test` (existing pass/card tests) | 2 |
| smoke: add-game flow sets a tip-off through `input[type=time]`; Today's passes read the locale time in tip-off order; 320px/32px no overflow | `npm run smoke` (existing `add-game-flow` / `game-passes` checks, extended) | 1, 2, 3 |
| `/browser-verify` at 390×844 on the preview: set, change and clear a tip-off; read the passes' order and text | preview | 1, 2, 3 |

## Out of scope

- The card's weekday and its corner layout — #103.
- Showing tip-off in the Resume bar (it never did).
- A tip-off's time zone: it is the phone's wall-clock time on the day's date.
