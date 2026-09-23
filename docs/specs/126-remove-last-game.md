# #126 — Let a coach remove their last game

## Issue

#126. A coach cannot remove a team's only game. It stays until they delete
the whole team.

## Goal

A coach who planned a practice game to try the app can remove it, the same
way they remove any other game, with Undo. Today then shows no games, one
short line saying games show up there, and the usual "Add a game" button.
Nothing breaks, and the game does not come back after a reload.

## Decisions

The owner decided the shape in the issue's comment: an empty Today with a
short note next to the existing add-a-game action. The game screen can't be
reached while the team has no games, and there is no reset-to-a-blank-game.
The rest is decided here from the docs, so nothing is left for the owner.

- **The note is one gray line: "No games yet. Add one to see it here."**
  - W3 allows at most one gray line, and no heading. The Team screen's empty
    state has a heading because a roster is the whole screen. A Today with
    no games still has Team and Season below it.
  - "No games yet" follows the app's existing wording, "No players yet" and
    "No games filed yet". The second sentence is the owner's own suggestion,
    tightened.
  - P2: "Add a game" stays the screen's one prominent action. It is not
    duplicated inside the note.
- **Zero games is a real, saved state.** A saved team whose `days` is an
  empty array loads with no days. `sanitizeTeam`'s fallback, which adds one
  day and one new game, now applies only when there is no `days` array: v6
  and older records (`raw.day`), junk, and a missing team. Otherwise a
  removed last game would come back on every reload and every backup
  restore. `activeDay` and `activeGame` load as 0 without indexing into
  `days`.
  - A v7 record whose days are all empty used to fall back to a new game.
    Now it loads with no days, the same as `days: []`. Both mean the coach
    has no games.
- **Filing keeps its own fallback.** When filing the last past day empties
  the team, it still starts a new day with a game copied from the last one
  ("Started a new day."). That is #100's decision, for a coach whose
  weekend just ended, not one who removed a game. Unchanged.
- **One question decides "does this team have a game": `hasGames()` in
  `state.js`.** It is true when `team().days` has at least one day. There
  are no empty days, so a day always has a game. `game()` and `lastGame()`
  return `undefined` instead of throwing when there is no day.
- **The game screen can't be reached with no games.**
  - `setView('games')` lands on Today instead. This covers boot with a saved
    `view: 'games'`, the browser's back and forward buttons (`popstate`),
    and every caller.
  - The print action (the `p` key and `#print`) and the tour (`startTour`,
    from Settings and Help) do nothing. The tour's own two buttons are
    hidden while there are no games, because the tour walks the game screen.
  - The head script in `index.html` that picks the first paint from the
    stored `view` must agree with `sanitize` (see `test/first-paint.test.js`).
    If a no-games team is folded to `today` in `sanitize`, the head script
    folds it too.
- **Renders skip the game screen's parts when there is no game.**
  - `computeAll` sets `plans` to `[]` and skips the day-totals loop when
    there is no day.
  - `render()` skips every game-screen section (setup, sentence, strategy,
    budget, balance, constraints, seasonadj, summary, issues, plan,
    timeline, totals, cards, gameview) when `hasGames()` is false.
    `renderTabs` skips its game-pane branch the same way. One check in
    `render()` beats a guard in each of fourteen renderers.
  - The boot line in `app.js` that tracks `plan_generated` reads `game()`
    only when there is one.
- **Wide layout (840px and up):** with no games, the game pane is hidden and
  Today takes the space the layout gives it when no game is open. No empty
  frame is shown.
- **"Remove this game" shows whenever the game screen is showing.** The game
  screen needs a game, so it shows whenever the team has one. `removeGame()`
  loses its below-two guard.
  - When the last game goes, the toast reads `Removed <label>.`. It drops
    "The day rebalanced.", because there is no day left to rebalance. Undo
    restores the game and reopens its game screen, as it does now.
- **"Add a game" works from no games.**
  - The draft is `newGame(0, null, state.settings)`, dated today
    (`seasonDate()`).
  - `sameAsLast()` returns `null`, so the "Same as …?" shortcut is not
    offered.
  - `stepHere` does not call `lastGame()` on a day that does not exist.
- **The Team screen stays safe.** Removing a player asks `removalCosts`
  (`roster-view.js`), which reads `state.day.games`. With no day, the cost is
  nothing.
- **A smoke check guards it.** Most of these throws happen only in a real
  render, so `node --test` cannot catch them. A new smoke check,
  `no-games`, removes a one-game team's game and reads the console.

## What would settle it

1. On a team with one game, the game screen shows "Remove this game".
   Tapping it lands on Today and shows the toast `Removed <label>.` with
   Undo.
2. Today, at 390×844, then shows no passes and the line "No games yet. Add
   one to see it here." (read from `document.body.innerText`), with
   `#todayAddGame` visible. Team and Season still show. The console has 0
   errors.
3. Undo restores the game and reopens its game screen, with 0 console
   errors.
4. Reloading after the removal still shows no games, with 0 console errors.
   A v7 record with `days: []` loads with `days.length === 0`,
   `activeDay === 0` and `activeGame === 0`. A v6 record with no games, and
   `{}`, still get one day and one game.
5. With no games:
   - `setView('games')`, the `p` key, `startTour()` and a `popstate` to a
     `games` history entry all leave Today on screen and throw nothing;
   - the tour's buttons are hidden;
   - the `v` key still goes to Team and back;
   - removing a player on the Team screen works;
   - changing a team setting works;
   - switching teams works.
   The console has 0 errors.
6. "Add a game" from no games opens the flow, offers no "Same as …?"
   shortcut, and on finishing lands on the game screen for the new game,
   dated today. Today then lists it.
7. At 1280×800, steps 1, 2 and 6 hold. No game pane frame shows while there
   are no games, and the console has 0 errors.
8. Filing still starts a new day when it empties the team
   (`test/season.test.js` unchanged).
9. `npm test` passes, and `npm run smoke` passes with 51 checks (the 50 plus
   `no-games`). `app/sw.js` has `VERSION` +1 and `SHELL` set to the digest
   `npm test` names.

## Surfaces

Changes:

- `app/state.js`: `hasGames()`, a safe `game()`/`lastGame()`, `removeGame()`,
  `sameAsLast()`, `computeAll`;
- `app/storage.js`: `sanitizeTeam`'s fallback and index clamps;
- `app/render.js`: `render()` skips the game sections, and `setView` redirects;
- `app/teams-view.js`: the Today note, `#removeGame`, `renderTabs`'s game
  branch, the add-a-game flow;
- `app/index.html`: the note's element, and the head script if needed;
- `app/app.js`: the boot `track` line and `printCard`;
- `app/tour.js`, `app/roster-view.js`, and the CSS for the note if one class
  is needed (reuse `.note` if it fits);
- `app/sw.js`;
- `test/`: `this-game.test.js` (its `< 2` regex), the `storage.test.js`
  fallback tests, `add-game.test.js`, new tests;
- `scripts/smoke/`: a `no-games` check and its registry entry;
- `CONTEXT.md`: the **Today** entry says a team can have no games.

Must not change:

- the four pure modules' behavior for a team with games (`engine.js`,
  `budget.js`, `storage.js` apart from the fallback, `roster.js`);
- filing's fallback;
- removing a game when others remain, including its toast;
- anything shown for a team with games.

## Constraints

- **One answer lives in one place.** "Does this team have a game?" is
  `hasGames()`. No other file counts days or games to answer it.
- **Reuse, do not re-derive.** The note reuses an existing gray-line style,
  such as `.note` or Season's `sn-empty`, not a new look. The draft reuses
  `newGame`. The date reuses `seasonDate()`.
- **Mobile first:** 390×844, then 1280×800.
- **Copy:** W1 sentence case, W3 one gray line.
- **Precache bump.**
- **`wrap-blind.test.js`:** negative checks use `lacks` from `test/prose.js`.
- **Guards follow `/new-guard`.**

## Design

- `state.js`:
  - `export const hasGames = () => team().days.length > 0;`
  - `game = () => state.day?.games[state.activeGame]`, and `lastGame` the
    same way.
  - `removeGame` drops its guard, and with no days left sets `activeDay` and
    `activeGame` to 0.
  - `sameAsLast` returns `null` with no days.
  - `computeAll` guards as above.
- `render.js`:
  - `render()` filters the game sections out of the run when `!hasGames()`.
  - `setView` maps `'games'` to `'today'` when `!hasGames()`.
  - `popstate` goes through `setView`.
- `teams-view.js`:
  - `renderTabs` paints the note when `!hasGames()` and hides it otherwise.
  - `#removeGame` shows whenever there is a game, and its toast drops "The
    day rebalanced." when no game is left.
  - `openAddGame`, `stepWho` and `stepHere` handle no days.
- `storage.js`: the fallback applies only when `raw.days` is not an array,
  and the clamps never index an empty `days`.
- The smoke check `no-games` does settle items 1–5 and 7 with a one-game
  record, at 390×844 and at 1280×800.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `removeGame`, `hasGames`, `game()`, `sameAsLast`, `computeAll` on a no-days team | `node --test` (state tests) | 1, 5 |
| `sanitize` of `days: []`, v6 with no games, `{}` | `node --test` (`test/storage.test.js`) | 4 |
| the add-a-game draft with no days | `node --test` (`test/add-game.test.js`) | 6 |
| filing's fallback | `node --test` (`test/season.test.js`, unchanged) | 8 |
| remove, note, Undo, reload, blocked ways in, Team edits, 0 console errors, both widths | `npm run smoke` (new `no-games`) | 1–5, 7 |
| the whole suite and the precache digest | `npm test`, `npm run smoke` | 9 |
| the add-a-game flow from no games, and how the note and wide layout look | browser at 390×844 and 1280×800 | 2, 6, 7 |

## Out of scope

- Filing's "Started a new day" fallback.
- A heading or illustration in the empty state.
- Removing a whole day at once.
- The empty state of a brand new team. `newTeam` still starts with one game.
