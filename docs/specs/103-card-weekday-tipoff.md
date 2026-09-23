# #103 — The card shows the weekday and tip-off

## Issue

#103, the last slice of #64 (plan games for a future day). The printed card's
top-right corner shows the day's short weekday and the game's tip-off time.

## Goal

A coach who prints Saturday's cards on Thursday can tell at a glance which day
and which game each card is for: the corner reads "Sat 9:00 AM", or "Sat" when
the game has no tip-off yet.

## Decisions this slice rests on

Settled with the maintainer on #64 (the card may change here, and only here).
The ticket is `ready-for-agent`. The survey held up its claims; these details
were settled while writing the spec, from the tree:

- **The weekday comes from the day's date.** Every day has a valid `date`
  (`sanitizeTeam` falls back to today, `app/storage.js`), and the card only ever
  prints games of the open day (`state.day`), so every card on one sheet shares
  that day's weekday. "Each game's own weekday" in the ticket holds by
  construction: each game's weekday is its day's.
- **The format is the weekday alone, not "Sat, Sep 27".** The ticket's copy is
  "Sat 9:00 AM". `toLocaleDateString(locale, { weekday: 'short' })`, then one
  ASCII space, then `tipoffLabel`. Same `undefined`-locale habit as
  `tipoffLabel` and `dayHeading`.
- **The card sample is pinned to a Saturday.** `scripts/og.mjs --card`
  photographs SEED, whose day would otherwise be dated the day the script runs
  and print whatever weekday that is. SEED's day gets the next Saturday on or
  after the run date (never a past date, which would file itself on boot), so
  the About page's card always reads "Sat 9:00 AM". Only `card-sample.png` and
  `card-sample@2x.png` are regenerated; `og.png` and `bench-sample.png` do not
  show the card's corner.
- **The layout does not change.** `.card-hd .when` is already `flex: none`
  and the title's width already subtracts the corner's measured width
  (`buildCard`, `app/card.js`), and `fitHeadline` elides the title. A longer
  corner therefore shortens the title rather than overlapping it. This slice
  proves that with the ticket's worst case instead of changing CSS.

## What would settle it

1. **Label.** A pure `cornerLabel(date, tipoff, locale)` returns, for en-US:
   `("2026-09-26", "09:00")` → `Sat 9:00 AM` (the time part matched with `\s`
   before AM/PM, since ICU puts U+202F there); `("2026-09-30", "12:30")` →
   `Wed 12:30 PM`; `("2026-09-26", "")` → `Sat`; an invalid date with a valid
   time → the time alone; both invalid → `""`.
2. **Card.** `renderCards` passes `cornerLabel(state.day.date, g.tipoff)` to
   `buildCard` as its corner, so `.card-hd .when` reads `Sat 9:00 AM` (plus the
   existing `  1/2` page mark when a game splits across pages).
3. **Multi-game card.** With `printScope: 'day'` and a day of three games timed
   `09:00`, `11:00` and none, the three cards' corners read `<wd> 9:00 AM`,
   `<wd> 11:00 AM` and `<wd>`, where `<wd>` is that day's short weekday.
4. **Fit.** A pocket card (3.45 × 5in, the existing smoke row stays green),
   with a 20-character opponent (`Riverside Wolverines`) and corner
   `Wed 12:30 PM`: the `.card-hd .title` and `.when` boxes do not overlap, the
   `.when` text is not clipped (`scrollWidth <= clientWidth`), and both sit
   inside the card header. Same on the half card.
5. **Images and docs.** `app/card-sample.png` and `app/card-sample@2x.png` are
   regenerated with `node scripts/og.mjs --card app/card-sample.png` and show
   `Sat 9:00 AM`. `docs/design-decisions.md`'s card-header paragraph, which says
   "`.when` never shrinks, so a long name cannot push the date off the card",
   is checked, and changed if it no longer describes the corner.
6. `npm test` and `npm run smoke` pass; the source-reading assertion in
   `test/card-minutes.test.js` that names `tipoffLabel(g.tipoff)` is updated to
   the new call.

## Surfaces

Changes: `app/storage.js` (`cornerLabel`, next to `tipoffLabel`, reusing
`localDate`), `app/card.js` (the one `buildCard` call), `app/sw.js`
(`VERSION`, `SHELL`), `scripts/og.mjs` (SEED's day date), the two card sample
images, tests under `test/`, one smoke check (item 4), docs as item 5 says.

Must not change: `buildCard`'s signature and layout code, `app/card.css`
(unless item 4 fails, and then only the header rule), the card's size,
`app/engine.js`, `app/budget.js`, `app/balance.js`, the app's other date labels
(`dayHeading`, `weekdayLabel`).

## Constraints

- **Reuse, do not re-derive:** `localDate` for the date (never
  `new Date('YYYY-MM-DD')`, which is UTC and gives the wrong weekday west of
  Greenwich); `tipoffLabel` for the time. One corner function, one call site.
- **The four pure modules** stay DOM-free; `cornerLabel` takes the locale as a
  parameter so tests pin en-US.
- **P1 (the card is the product)**: the card stays 3.45 × 5in and legible;
  item 4 is the proof.
- **Precache bump:** `app/card.js` and `app/storage.js` are precached. Bump
  `VERSION` in `app/sw.js` and set `SHELL` to the digest `npm test` names.
- **Smoke:** extend an existing card check (`card-at-32.mjs` or the card size
  check) rather than a new module if it fits; if a new check is added, register
  it the way `registry.mjs` requires. Widening the byte budget is routine.

## Design

- `cornerLabel(date, tipoff, locale)` in `app/storage.js`:
  `[wd, tipoffLabel(tipoff, locale)].filter(Boolean).join(' ')`, where `wd` is
  `localDate(date)?.toLocaleDateString(locale, { weekday: 'short' }) ?? ''`.
- `app/card.js`: import it and replace `tipoffLabel(g.tipoff)` with
  `cornerLabel(state.day.date, g.tipoff)`.
- `scripts/og.mjs`: SEED's `day` gets `date: nextSaturday()` (local date,
  `seasonDate` format). Check SEED loads through the legacy/v3 path with that
  date kept; if `migrateLegacy` drops it, set it where the record is seeded
  instead.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `cornerLabel` export | `node --test`, next to the `tipoffLabel` tests | 1 |
| source-reading assertion that `renderCards` computes `corner` from `cornerLabel(state.day.date, g.tipoff)` and hands it to `buildCard` | `node --test`, `test/card-minutes.test.js` | 2 |
| smoke: `printScope: 'day'`, three games timed 09:00, 11:00 and untimed, each `.card-hd .when` matched against `<wd> 9:00 AM` / `<wd> 11:00 AM` / `<wd>` | `npm run smoke`, `card-at-32.mjs`'s `multiGameProbe` | 3 |
| smoke: pocket and half card with `Riverside Wolverines` and `Wed 12:30 PM`, title/corner overlap and clipping probe; card is 3.45 × 5in | `npm run smoke` | 4 |
| regenerate and look at the card sample | `node scripts/og.mjs --card app/card-sample.png` | 5 |
| `/browser-verify` on the preview at 390×844: the card sheet's corner text and the 20-character case | preview | 2, 3, 4 |

## Out of scope

- Showing the month and day on the card.
- Any other card layout change.
- The weekday anywhere other than the card.
