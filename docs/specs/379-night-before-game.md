# 379 — A game set up the night before is kept the next morning

## Issue

#379: a game set up the night before (on a first run, or received in a
hand-off link) is filed as "never started, so it was left out" the next
morning, and a new random game replaces it.

## Goal

A coach who sets up and prints on Friday night opens the app on Saturday to
the same game and the same rotation as the printed card. An assistant who gets
the link on Friday night has the same game on Saturday, with its label and
tipoff.

## What would settle it

The issue's acceptance criteria, as Coach scenarios with a pinned clock:

1. First run on 2026-10-30 at 21:00 with 9 players (the sample team), then a
   boot on 2026-10-31 at 09:00. The game is on today with the same seed and
   stints: the card shows the same five players in every stint. No toast
   contains `left out`.
2. The same, but stint 1 was started on the 30th. Behavior is as today: the
   day is filed, and today gets a new game.
3. A link made on 2026-10-30 for a game labelled `vs Hawks` with tipoff 09:30,
   received on the 30th and booted on the 31st. The game is on today with
   label `vs Hawks`, tipoff 09:30 and the sender's stints.
4. A link made for 2026-11-01 and received on 2026-10-30 is filed under
   2026-11-01 (Today's day headings read it as `Sun, Nov 1`; on the 31st it
   would read `Tomorrow`).
5. A link in the old format (no date) imports as today.

## Surfaces

- Changes: `app/state.js` (a new `carryUnplayedDay`), `app/app.js` (boot and
  `fileOverdueDay` call it), `app/handoff.js` (`encode` adds the day date,
  label and tipoff; `decode` files under the later date), `app/sw.js` (bump),
  `test/coach.js` (a verb to pin a given clock), new scenario tests, and unit
  tests where a pure function has many cases.
- Must not change: `fileIfPast` and `archiveDay` (a day with a started game
  files exactly as today), `live.js`, `toast.js`, `storage.js`, the link's
  `#p=1` prefix.

## Constraints

- "Started" reuses `live.js`'s readers: a game is started when
  `finishedGame(live)` or `playedStints(live) > 0`. Do not re-read `live.at`
  directly. (This is `stage()`'s `part-played`/`finished` without needing a
  solved plan, so it can run before `computeAll` at boot.)
- The carry respects `dueToFile`'s guards: not while bench mode is open, not
  before onboarding.
- A3: the plan does not change, so nothing is announced. No toast on a carry.
- P6: a carry loses nothing and moves nothing the coach can see except the
  day's date, so there is nothing to undo and no toast to hang an Undo on.
- Dates are `seasonDate(today)` strings, compared as strings, as `dayIsPast`
  does. "Today" is injectable so a pinned clock can stand in.
- Reuse `sortDay`, `dayFor`, `seasonDate`. Do not write a second date
  validator: `sanitizeTeam` already falls back to today for a bad day date.
- Precached files change, so `npm run sw:bump`.

## Design

**Carry an unplayed day forward.** `carryUnplayedDay(today)` in `state.js`:
when filing is due (`dueToFile(today)`), today has no day, and the most recent
past day has no started game, set that day's `date` to today and return true.
Its games, seeds, labels, tipoffs, stints, overrides and settings are
untouched, because they are the same objects. Older past days are left for
`fileIfPast` to file as before. The order of `days` stays sorted: the moved
day was the latest past day, and any future day is still after today.

`app.js` calls it in two places:

- At boot, before the hand-off block, so a link opened the morning after
  lands in the carried day rather than creating today's day first (which
  would make the night-before day file as "left out").
- At the top of `fileOverdueDay`, before `navigate` is worked out, so the
  visibility and bench-mode-close paths also carry. If the carry leaves
  nothing due, it saves and re-renders and stops there: no `undoable`, so no
  empty toast.

**The link carries the day.** `encode` adds `label` and `tipoff` to the game
object `g`, and the sender's day date as a top-level `d`. `decode` dates the
received day `d` when `d` is later than the receiver's `seasonDate(new
Date())`, otherwise today. An old link has no `d`, so it imports as today, and
no `label`/`tipoff`, which `sanitizeTeam` cleans to its defaults.

Choices the issue did not decide:

- **The version stays `1`.** The new fields are additive: an old link decodes
  on a new phone (no `d`, so today), and a new link decodes on an old phone
  (unknown `d` ignored; `label` and `tipoff` inside `g` already pass through
  `sanitizeTeam`). Bumping to `2` would make every not-yet-updated phone call
  a new link damaged. The prefix still names the version, so a breaking change
  later can bump it.
- **Replacing a game the phone already has keeps the phone's own label and
  tipoff,** as #377 left it. Only the add path changes.
- **Boot carries before receiving a link** (above). The issue's rule "today
  has no day yet" would otherwise be broken by the link itself.
- **"Most recent past day"** means the latest-dated day before today, however
  many days ago.
- **The sample team stands in for "9 players"**: its first run goes through
  the same `startTeam` that dates the game today.

## Proof

| Seam | Covers |
| --- | --- |
| Coach scenario, `test/night-before-scenarios.test.js`: first run on the 30th at 21:00, boot on the 31st at 09:00: same card stints, Today shows the game, no toast with `left out` | 1 |
| Coach scenario, same file: first run, start stint 1 on the 30th, boot on the 31st: the filing toast shows and today has a new game | 2 |
| Coach scenario, same file: link labelled `vs Hawks`, tipoff 09:30, made and opened on the 30th on a fresh phone, boot on the 31st: the game is on Today as `vs Hawks, 9:30 AM` with the sender's stints | 3 |
| Coach scenario, same file: link for a day dated 2026-11-01 opened on the 30th: Today lists it under `Sun, Nov 1` | 4 |
| `node --test` through `decode`, `test/handoff.test.js`: a payload with no `d` dates today; a `d` before today dates today; a `d` after today keeps `d`; a junk `d` dates today; `label` and `tipoff` round-trip through `encode`/`decode` | 4, 5 and the date rule's cases |
| `node --test` through `carryUnplayedDay`, `test/day-list.test.js`: no past day; today already has a day; latest past day has a started game; a finished game; older past days left in place; bench open; not onboarded | 1, 2 and the rule's edges |

## Out of scope

- The boot-time order of the hand-off toast and a filing toast (#377's known
  gap). A carry shows no toast, so it does not add to it.
- Using the link's label and tipoff when replacing a game the phone has.
