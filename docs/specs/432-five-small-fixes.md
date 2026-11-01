# #432 — Five small fixes

## Issue

#432. Five small things from a redesign review: printing hides behind an
unlabelled share icon, two different things are both called "How it works", a
finished game's main button still says "Start game", the Team screen has the
same title as Today, and the interface guidelines say the redesign has not
shipped.

## Goal

Each label a coach reads names one thing, and names what it does now. A coach
who wants to print sees a button that says so, on the card and on Today.

## Lane

Full lane. The survey put the change past the small lane's 20 lines outside
`test/` and `docs/` (a new control on Today's game rows, a new control under
the card, CSS for both). No pure module changes.

## Decisions

The ticket is `ready-for-agent`. The survey held up all five claims. Where it
offered "for example", this spec picks one and says why:

- **Item 1, what "Print card" does.** It prints straight away, through the same
  `printCard` (`app/app.js`) the share sheet's Print button and the `p` key
  use: same print scope, copies, size and names settings. It does not open the
  share sheet. On Today it first opens that game (so the card printed is that
  game's), then prints; the coach lands on that game's screen, as `p` already
  does from other screens.
- **Item 1, which Today rows.** Only a game whose status is "Planned" (a plan
  that works and the game not started). An underway or finished game, or one
  that needs a fix, gets no Print card button: the first two already had their
  card printed, and the last has no card.
- **Item 1, the share sheet's three names.** The ticket's own example: the tab
  becomes **Card** (was "Print card"), the button stays **Print**, the row
  becomes **Games to print** (was "Print").
- **Item 1, Today's button has no `data-needs-card`.** `card.js`'s sweep gates
  every such control on the *active* game's blocked state, not on the row's
  own, so a blocked active game would disable Ravens' button for no reason. The
  button is shown only for a Planned row, whose card always exists, and its
  handler shows the opened game (`setView('games')`) before clicking `#print`,
  so `#print`'s own gate reads that game.
- **Item 2.** The welcome screen's link becomes **About Benchcard**; Settings'
  row, which opens the in-app guide, keeps "How it works".
- **Item 3.** The label becomes **View game** on a finished game, on both the
  phone's action bar (`#abBench`) and the wide screen's `#gmOpen`. Not hidden:
  opening a finished game is still useful (it reopens at the start for a look
  back), and Shuffle, the finished screen's other disabled-or-changed control,
  stays visible too. Icon unchanged (`maximize-2`).
- **Item 4.** The Team screen's title becomes **Roster**. "Players" would read
  "Players / 11 players" with the count underneath; "Roster" does not repeat.
  The sub line becomes `<team name> · <n> players` (`Tigers · 11 players`),
  just `<team name>` with nobody on the roster, and just the count when the
  team has no name. Today's entry row keeps its label "Team" (out of scope).
  The tab title follows the heading: `Roster · Benchcard`.
- **Item 5.** The status line says the redesign shipped (#18 closed
  2026-09-22) and the app follows these rules; where the two disagree, one of
  them is a bug to file.

## What would settle it

1. **Card tab:** with Hawks (RICH fixture, game day) open on Card, a button
   named **Print card** sits under the card. Tapping it asks the browser to
   print once, with the Hawks card on the page. It is hidden on Timeline and
   disabled with the other `data-needs-card` controls when the plan is
   blocked.
2. **Today:** the Hawks (9:00 AM) and Ravens (11:30 AM) rows, both planned,
   each have a button whose visible text is **Print card** and whose name is
   `Print card for <game label>` (`Print card for Ravens`). Tapping Ravens'
   prints once with the Ravens game open. A finished or underway game's row
   has no such button.
3. **Share sheet:** the segmented control reads `Card | Hand off`; the primary
   button reads `Print`; the rows read `Games to print, Copies, Size, Names,
   Minutes strip`.
4. **Welcome:** the link to `./about` reads `About Benchcard`. Settings' row
   still reads `How it works` and still opens the guide.
5. **Finished game:** after a coach taps Finish game and closes bench mode,
   the main button reads `View game`, not `Start game`. A planned game still
   reads `Start game`; an underway one still reads `Resume · …`.
6. **Team screen:** the large title reads `Roster`; the sub line reads
   `<team name> · 3 players` for a three-player roster. Back still reads
   `Back to <team name>`.
7. **Guidelines:** `docs/interface-guidelines.md` line 7 no longer says the app
   does not follow them.
8. **Look:** at 320 and 390 wide, 16 and 32px root text, with a long team name
   (`Alexandria Montgomery-Okafor Lady Hawks`) and long game labels, Today
   scrolled to the bottom, the game's Card view scrolled to the bottom, the
   share sheet full height and scrolled to the bottom, and the Team screen:
   nothing clipped, no cramped wrapping, every new control at least 48px tall.

## Surfaces

Change: `app/index.html` (welcome link, share sheet names, Card tab's Print
card button), `app/teams-view.js` (`renderPass`: Today's Print card button),
`app/card.js` (`labelBench`: View game), `app/roster-view.js` (Team title and
sub line), `app/timeline.js` (`applyGameView`: show the Card tab's button only
on Card), `app/app.js` (wire the new button to `printCard`; let Today reach
it), `app/app.css` (layout for the two new controls), `docs/interface-
guidelines.md`, tests and smoke checks whose expected copy changes.

Must not change: `engine.js`, `budget.js`, `storage.js`, `roster.js`; the
printed card itself (3.45 × 5in); the tour (`app/tour.js`) — the owner kept it
as it is.

## Constraints

- Reuse `printCard` for every new print control. Do not add a second print
  path or call `window.print()` anywhere new.
- The Card view's `#cardPrint` carries `data-needs-card` so `card.js`'s sweep
  gates it, and `test/print-gate.test.js` discovers it from its handler (a
  named top-level function, not an inline arrow, if that test needs it).
  Today's button does not (see Decisions).
- A button cannot sit inside Today's `.today-game` button. Keep `.today-game`
  as the class of the game's own button (dozens of smoke hooks select it) and
  put the Print card button beside it as a sibling.
- The new controls are `noprint` where they sit inside the print path.
- Touch targets at least 48px; no horizontal overflow at 320px with 32px text
  (`APP_LARGE_TEXT_STATES`); American spelling.
- `passStatus` (`live.js`) is the one source of "Planned"; do not re-derive it.

## Design

- Card tab: a `noprint` wrapper right after `#sheet` holding
  `<button class="btn press" id="cardPrint" data-needs-card>` with the printer
  icon and `Print card`. `applyGameView` hides it whenever `#sheet` is hidden.
- Today: `renderPass` returns a wrapper holding the `.today-game` button and,
  for a planned game, a `btn press` Print card button under it
  (`aria-label="Print card for <label>"`). Its handler opens the game the same
  way the row does, then calls the shared print function.
- `labelBench`: `stage(...) === 'finished'` (or `finishedGame`) gives
  `View game`.
- `renderRoster`: title `Roster`, sub line as decided above.

## Proof

- **Coach scenarios** (`test/coach.js`, new or existing `*-scenarios.test.js`):
  items 1, 2, 5, 6, and the share sheet names in 3. The driver needs a way to
  see that the app asked to print and which game's card was on the page: add
  a verb (for example a stubbed `window.print` that records the card titles at
  the moment of the call).
- **Smoke:** `timeline-card-sheet.mjs`'s row labels (item 3);
  `focus-announce.mjs`'s Team tab title; `APP_LARGE_TEXT_STATES` keeps Today
  and the Card view at zero overflow with the new buttons.
- **Unit:** none new; existing tests whose expected copy changes are updated.
- **Look check** (`scripts/look.mjs`) for item 8, by the orchestrator.

## Out of scope

- The tour. Today's "Team" entry label. Any other copy.
