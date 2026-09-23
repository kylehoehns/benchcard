# 23 — Today is home, and back goes home

## Issue

#23 (parent #18): the app opens on a new Today screen. Game, Team, Season and
Settings open from it as screens with a back button, and back goes through
browser history. The view tabs, team chips and game chips go away. This ticket
builds the navigation only; what is on the game screen does not change.

## Goal

A coach opens Benchcard and sees their team's games for the day, with Team and
Season underneath and a gear for Settings. Every other screen is one tap away
and has one way home: the back button, the browser's back, or Android's back
gesture, which all do the same thing.

## Survey (2026-09-15)

What the tree looks like today, checked against the ticket:

- **Navigation.** `render.js` `setView(v, instant)` is the one path. It flips
  `hidden` on `#view-welcome`, `#view-games`, `#view-team`, `#view-season` and
  `#view-settings`, and saves `state.view`. Callers: `#viewnav` tabs and the
  cog (`app.js`), `printCard` (`app.js`), backup restore (`app.js`),
  onboarding (twice), the `V` key (`shortcuts.js` `nextView()`), the tour
  (`tour.js`), `addTeam` and `removeTeam` (`teams-view.js`), and the empty
  roster's "Add player" / "Paste a list" (`timeline.js` `rosterCta`).
  Nothing calls `history.pushState` or listens for `popstate`.
- **Header.** `.bar` holds the Benchcard brand, `#viewnav` (Games / Team with
  `#rcount` / Season), `#keysHint` (shown only with hover, a fine pointer and
  760px or wider) and `#settingsBtn`. The cog toggles back to
  `viewBeforeSettings()`.
- **Chips.** `#teamtabs` (team chips plus "+ Team") is shell furniture painted
  by `renderTeams()`. `#tabs` inside `#view-games` holds the game chips,
  "+ Game" and "New day", painted by `renderTabs()`. Both in `teams-view.js`.
- **There is no Today screen.** `#view-games` is the day and the open game
  together.
- **Saved screen.** `storage.js` sanitizes `view` to one of `games`, `team`,
  `season`, `settings`, translating legacy `roster` to `team`, and anything
  else to `games`. The index.html pre-paint script copies that allow-list and
  stamps `data-boot`; `test/first-paint.test.js` runs the real script against
  `loadState` over one table.
- **The open game** is saved as `team.activeGame`, an index. `sanitizeTeam`
  clamps it into range, and a day always has at least one game. So the ticket's
  "or to Today if that game no longer exists" cannot happen through the app,
  only through a hand-edited or corrupt save (decision 2).
- **Tour.** All four steps anchor inside `#view-games`. `startTour` already
  switches to games first.
- **Undo** replaces the whole `state`, including `view`, then calls the
  action's refresh (or `renderAll`). Only `removeTeam` and backup restore move
  the screen on undo.
- **Budget.** `requests` is pinned at 40 of 41, so a new module is not free.
- **Copy.** The help sheet says "Add a game with **+ Game**"; that button is
  going away.

## Decisions the survey needed (human, 2026-09-15)

1. **A saved `games` opens the Game screen.** `games` keeps meaning the game
   screen, and `today` is a new stored value. Nothing is translated. A missing
   or unrecognized value opens Today.
2. **An out-of-range saved game is clamped, not sent to Today.** No new rule:
   the clamp `sanitizeTeam` already applies stands. The first-paint table gets
   a row for it, so the first frame and the loader still agree.
3. **`#keysHint` stays in Today's header, desktop only,** exactly where its CSS
   shows it now. On a phone Today's header is the team name and the gear.
4. **Removing the open game returns to Today.** Undo restores the game and
   reopens its Game screen.

Design calls made in this spec without asking, because the ticket and #18
already point one way:

- History is never deeper than one screen: `[Today]` or `[Today, X]`. Going
  from one pushed screen to another (P on Team, Add a team from the menu while
  a screen is open, the tour started from Settings, `rosterCta` on the game)
  replaces the top entry instead of pushing, so back always lands on Today.
- Finishing onboarding opens the Game screen with Today beneath it, as
  `setView('games')` does now, so the tour has its anchors.
- `V` on Today opens Team. On any other screen it goes back to Today.
- `P` from any screen opens the current game's screen and prints it, as it
  does now.

## What would settle it

At 390×844 on the smoke suite's `RICH` fixture (11 players, two games today,
three filed), unless stated:

1. **Today.** A record saved with `view: 'today'`, or with no `view`, boots
   onto Today, which shows:
   - a header with a button whose visible text is the team's name (or
     `Team N` when unnamed), and an icon-only button whose accessible name is
     exactly `Settings`;
   - a heading `Today`;
   - one entry per game in `day.games`, in order, each showing
     `gameLabel(g, i)` (the opponent, or `Game N`) and, when set, its tip-off
     (`g.when`). Activating one opens that game's screen with
     `activeGame` set to it;
   - a Team entry showing `Team`, the team name and the player count
     (`11 players`), which opens Team;
   - a Season entry showing `Season` and the filed-games count (`3 games
     filed`; `1 game filed`; `No games filed yet` at zero), which opens Season;
   - a `New day` button and an `Add a game` button.
2. **Team menu.** The team-name button opens a popover menu (the `popover`
   attribute) anchored to it. It lists every team, the current one marked with
   a checkmark and `aria-current="true"` (the attribute the team chips carry
   now), then
   `Add a team` (absent at the 12-team cap). Choosing another team makes it
   active and repaints Today. `Add a team` adds the team and opens Settings
   with `#teamName` focused and selected, as `addTeam()` does now.
3. **The gear only on Today.** On Game, Team, Season and Settings no element
   with the accessible name `Settings` is visible.
4. **Back button.** Game, Team, Season and Settings each show, top-left of the
   header, an icon-only button named exactly `Back to Today`, and the screen's
   title (`gameLabel` for the game, else `Team`, `Season`, `Settings`), shown
   once on the screen.
5. **History.** From Today, opening any of the four raises `history.length`
   by exactly 1. `history.back()` from each returns to Today, and so does the
   back button. Going from a pushed screen to another pushed screen does not
   raise `history.length`. After a reload on a pushed screen, one
   `history.back()` still lands on Today, not off the app.
6. **Gone.** `#viewnav`, `#teamtabs`, `#tabs`, `#rcount` and the `.bar`
   brand no longer exist in the page. `#keysHint` is still in Today's header,
   visible only under its current media query.
7. **Reopening.** A reload returns to the screen last open: Today, Game (the
   game at the clamped `activeGame`), Team, Season or Settings. For each, the
   pre-paint script stamps `data-boot` so the first frame shows only that
   screen. `test/first-paint.test.js` has a row for each of the five screens,
   for legacy `roster`, for an unrecognized value (Today), and for an
   out-of-range `activeGame` on `games`, and the script and `loadState` agree
   on every row.
8. **URL.** `location.href` after boot and after every navigation in items
   1–5 equals the URL the app was loaded with. No player name, team name or
   game label ever appears in it.
9. **Keyboard.** `P` clicks `#print` (from Today it opens the game first).
   `S` shuffles and `B` opens bench mode, on the Game screen only. `?` toggles
   the shortcuts sheet. Escape closes it. `V` on Today opens Team; `V` on
   Team, Game, Season or Settings returns to Today.
10. **Tour.** On a first run the tour reaches `Step 4 of 4` with each step
    spotlighting its anchor. `test/tour-anchors.test.js` passes.
11. **Actions and undo.**
    - `New day` on Today files, starts a new day and shows Undo. Undo
      restores the day and the coach is still on Today.
    - `Add a game` on Today adds a game copied from the last one (as "+ Game"
      does) and opens its Game screen.
    - `Remove this game` on a Game screen removes it and returns to Today.
      Undo restores it and reopens that game's screen.
    - Removing a team from Settings returns to Today (welcome if it was the
      last). Undo restores it and returns to Settings.
    - After any undo, the screen on show is the one `state.view` names.
12. **Copy.** The help sheet no longer names `+ Game`; it says `Add a game`
    on Today.
13. `npm test` and `npm run smoke` pass. Every test or smoke state written
    against `#viewnav`, `#teamtabs`, `#tabs`, `#rcount` or
    `viewBeforeSettings` is updated or retired in the same change.

## Surfaces

Change:

- `app/index.html`: Today's markup (`#view-today`), the per-screen header
  (team button, menu, gear, keys hint on Today; back and title elsewhere),
  remove `#viewnav`, `#teamtabs`, `#tabs`, `#rcount` and the brand. The
  pre-paint script learns `today`. The help sheet line about `+ Game`.
- `app/render.js`: `setView` handles `today`, the history entries and
  `popstate`. `viewBeforeSettings` goes.
- `app/teams-view.js`: `renderTeams` becomes the team menu, `renderTabs`
  becomes Today's game entries, Team/Season entries, New day and Add a game.
  `removeGame` returns to Today; `removeTeam` returns to Today.
- `app/app.js`: the cog handler, the tabs wiring and the boot call.
- `app/shortcuts.js`: `V`.
- `app/toast.js`: the default undo refresh shows the screen `state.view` names.
- `app/tour.js`, `app/onboarding.js`, `app/timeline.js`: their `setView`
  calls, only as far as the new model needs.
- `app/storage.js`: `VIEWS` gains `today`; the unrecognized fallback becomes
  `today`. `app/state.js`: `freshState` `view` becomes `today`.
- `app/app.css`: Today, the header, the menu, the `data-boot` rules.
- `app/sw.js`: bump `VERSION`, set `SHELL`.
- `scripts/smoke.mjs`, `scripts/smoke-checks.js`: every state that clicks
  `#viewnav` or `#settingsBtn`; the 320px/32px app-shell pass gains Today;
  the new check(s) under Proof.
- Tests naming the removed markup: at least `team-strip`, `view-before-settings`,
  `sample-team`, `aria-state`, `boot-guard`, `css-collide`, `gamemode-open`,
  `print-scope`, `storage-warn`, `this-game`, `first-paint`, `storage`.
- `AGENTS.md`: the smoke check count, if rows are added.

Must not change:

- `app/engine.js`, `app/budget.js`, `app/roster.js`, and every part of
  `app/storage.js` other than the view allow-list and its fallback.
- The Game screen's contents below its header: day name, rotation, card,
  folds, bench mode entry, `#removeGame`.
- The printed card, `card.css`, `card.js`.
- The footer `.foot`, bench mode, the dialogs and the tour's steps.
- `about.html`, `advanced.html`, the six chart pages.

## Constraints

- **Reuse, do not re-derive:**
  - `setView` stays the one way a screen changes. History is pushed, replaced
    and popped in one place beside it, not by each caller.
  - `storage.js`'s `VIEWS`/`VIEW_WAS` stay the one allow-list and the one
    legacy translation. The pre-paint script copies them, and
    `first-paint.test.js`'s same-members check keeps the copy honest. Do not
    add a translation for `games`.
  - `gameLabel(g, i)` is the one game label. Use it on Today and in the Game
    header.
  - The team label fallback (`name.trim() || Team N`) is written in three
    places today (`renderTeams`, `renderSettings`, `removeTeam`). The menu,
    the Team entry and the header use one helper, not a fourth copy.
  - "+ Game"'s push (`newGame(n, lastGame(), state.settings)`),
    `startNewDay`, `addTeam` and `removeTeam` move with their behavior
    intact. Do not write a second version of any of them.
  - The Season entry's count reads `team().season.games` the same way
    `season-view.js` counts it.
  - `undoable` and its snapshot stay the undo path.
  - The team menu uses the native `popover` attribute (C8), not a new overlay
    or focus trap.
- **No new module.** `requests` is pinned at 40 of 41. Today's rendering lives
  in `teams-view.js`, which already owns the strips it replaces.
- **Stored values keep their keys.** `games`, `team`, `season`, `settings`
  keep their meanings; `today` is the only addition. No migration.
- **The URL never changes.** `pushState`/`replaceState` are called with no
  URL argument, or with the current one. The privacy rule is that no roster
  data reaches a link.
- **The first frame is the loader's answer.** Every `data-boot` value has a
  CSS rule, and the pre-paint script and `loadState` answer from one table.
- **Precache bump:** `index.html`, `app.css` and the JS files above are
  precached. Bump `VERSION` and set `SHELL` to the digest `npm test` names.
- **Mobile first:** verify at 390×844, then 320px with 32px root text.
  `APP_LARGE_TEXT_ALLOW` stays empty.
- **Rendering rule:** a render never repaints the control a coach is using.
  Switching team from the menu repaints Today, not the menu mid-tap.
- **Touch targets:** the existing ≥44px sweep covers the new buttons and
  entries.
- **Interface guidelines:** N1 (Today is home, no tab bar), N2 (Team and
  Season as labelled entries below the games), N3 (team menu on the name,
  checkmark, Add a team), N4 (gear on Today only, named `Settings`), N5 (back
  button top-left, icon, `Back to Today`), N6 (every push is a history entry;
  overlays closing on back is out of scope here), C1 (back or title on the
  left, at most two actions on the right on a phone), C8 (menus are popovers
  anchored to their button, checkmark on the current choice), A2 (icon
  buttons named for what happens).
- **Words:** Today, New day, Add a game, Add a team, Settings, as in
  `CONTEXT.md`. A game on Today is not called a "row" or "tile" in copy.

## Design

```
Today (390px)                      Game / Team / Season / Settings
┌───────────────────────────────┐  ┌───────────────────────────────┐
│ [Smoke Test ⌄]        [⚙]     │  │ [‹]  Hawks                    │
│ Today                         │  │ …screen contents unchanged…   │
│ ┌ Hawks          9:00       › │  └───────────────────────────────┘
│ ┌ Game 2         11:30      › │
│ [Add a game]   [New day]      │
│ Team    Smoke Test · 11 players › │
│ Season  3 games filed         › │
└───────────────────────────────┘
```

- **Screens.** `#view-today` joins the views. `setView` accepts `today`,
  `games`, `team`, `season`, `settings`, `welcome`.
- **History.** Each entry carries its screen in `history.state`. Opening a
  screen from Today pushes; opening one from another pushed screen replaces;
  going to Today from a pushed entry calls `history.back()`, and `popstate`
  shows the screen its state names (Today when none). At boot, the current
  entry is replaced with Today, and if the saved screen is not Today one entry
  is pushed for it, so back works after a reload. Welcome makes no entries.
- **Header.** One header per screen state. On Today: the team button (opens
  the menu), `#keysHint`, the gear. Elsewhere: the back button and the title.
  An in-page heading that repeats the title (Season's `h1`) goes, so the
  title appears once.
- **Remove game** calls `setView('today')` after the splice; the snapshot
  holds `view: 'games'` and the old `activeGame`, so the undo refresh shows
  the Game screen again.
- **Undo refresh.** The default refresh calls `setView(state.view)` before
  `renderAll`, so every undo lands on the screen its snapshot names.

## Proof

The seams `/tdd` builds at:

- **`node --test test/storage.test.js`** — `sanitize` keeps `today`, `games`,
  `team`, `season`, `settings`; turns `roster` into `team`; turns a missing or
  unknown `view` into `today`. `newTeam`/fresh state starts on `today`.
  Covers item 7 (the loader half).
- **`node --test test/first-paint.test.js`** — the real pre-paint script
  against `loadState` over the table rows in item 7, plus the same-members
  check and a CSS rule for every stamp. Covers item 7 (the first-frame half).
  This test reads source; it is already a named guard and stays one
  (`/new-guard`).
- **`node --test test/tour-anchors.test.js`** — unchanged and green. Item 10.
- **Smoke, new check `today and back`** (`/new-guard`), on `RICH` booted with
  `view: 'today'`: items 1, 2, 3, 4, 5, 6 and 8 — Today's contents, the menu
  (switch team, checkmark, Add a team), gear absent elsewhere, back button name
  and position, `history.length` +1 per push and none per replace,
  `history.back()` and the back button each landing on Today, a reload on each
  pushed screen then one `history.back()` landing on Today, and
  `location.href` unchanged throughout.
- **Smoke, new check `today keys and undo`** (`/new-guard`), on `RICH`:
  items 9 and 11 — `V` both ways, `P` from Today opening the game (with
  `window.print` stubbed), `S`/`B` inert off the Game screen, New day + Undo
  on Today, Add a game, Remove this game → Today → Undo → that game, remove
  team + Undo → Settings.
- **Smoke, existing checks** — the tour last-step state, the overlay/touch/
  320px-32px passes (the app-shell pass gains Today), the budgets. Item 13.
- **`npm test`** — item 12 by the existing copy guards, and item 13.
- **`/browser-verify`** at 390×844, then 320px with 32px root text:
  screenshots of Today, the open team menu, and each pushed screen's header;
  a reload on each screen with no visible flash; the tour on a first run.
  Android's back gesture follows `popstate` in Chrome and is not measured on a
  device here — say so, don't claim it.

## Out of scope

- Game passes, the rotation picture and "Needs a fix" on Today (#26).
- Overlays and sheets closing on back (N6's second half), and bench mode
  reacting to back (#27, #33).
- The Resume bar (#34), wide-screen side by side (#35), first run (#36).
- The footer, the `?` help controls and the 48px sweep (#37).
- Moving the across-the-day chart or the day name off the Game screen.
- iOS swipe-back and Android predictive back inside an installed web app
  (unverified per N5, N6).
- Any change to what New day, adding or removing a game or team does to the
  data.
