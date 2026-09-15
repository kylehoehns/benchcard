# 22 — One Settings screen

## Issue

#22 (parent #18): Settings becomes the one place for settings. A team section,
headed with the team's name, takes every team setting off the Team tab. A
Benchcard section holds Appearance, How it works, About/Contact/tip jar and
Backup. The Team tab keeps only the roster.

## Goal

A coach who wants to change a league rule opens Settings and finds it under
their team's name, so they can see which team it lands on. The Team tab shows
players and nothing else. The Benchcard section holds the app-wide choices.

## Survey (2026-09-15)

The ticket's claims about the tree hold:

- The team section's controls all live on the Team tab today, in
  `#view-team`: `#teamName`, `#removeTeam`, and the `#setTeamHd` box with
  `#setPeriods`/`#setPerMins`, `#maxSubsSeg`, `#tieBreakSeg`, `#minMins`,
  `#seasonDefSeg`. `renderSettings()` in `teams-view.js` paints them and
  already fills `#setTeamHd` with the team's name (fallback `Team N`).
- Players changing at once is on the Team tab, not on the game screen. Moving
  it is part of this ticket.
- `#view-settings` today has a "Benchcard" box (Theme cycler `#theme` +
  `#themeNow`, How it works `#helpBtn`) and a "Backup" box. About, Contact and
  Buy me a coffee exist only in the in-app `<footer class="foot">`.
- The stored value is `state.ui.theme ∈ {'auto','light','dark'}`, default
  `'auto'` (`storage.js` sanitises it, `state.js` defaults it).
- "Show me around again" is `#helpTour`, inside the help sheet (`#help`).

## Decisions the survey needed (human, 2026-09-15)

1. **Backup and restore stays last in the Benchcard section.** The order is
   Appearance, How it works, About/Contact/Buy me a coffee, then Backup and
   restore. This meets S3 (Appearance first) and keeps A25's rule: the control
   that replaces everything on the device goes last. `test/settings.test.js`'s
   "Backup keeps the bottom" check stays, updated for the new markup.
2. **The in-app footer is left alone.** #37 removes it with the rest of the old
   interface. Until then, Settings and the footer both carry About, Contact and
   Buy me a coffee.

## What would settle it

At 390×844, on the smoke suite's `RICH` fixture, unless stated:

1. **Team section first.** `#view-settings` has two sections, in this order.
   The first is headed with the active team's name (`Team N` when unnamed). In
   this order, it contains:
   - Team name (`#teamName`)
   - A game is … periods × … min (`#setPeriods`, `#setPerMins`)
   - Players changing at once (`#maxSubsSeg`, with `#maxSubsRead`)
   - The odd minutes: Furthest behind / Best players (`#tieBreakSeg`)
   - Everyone plays at least … min (`#minMins`)
   - A new game starts: On its own / With the season (`#seasonDefSeg`)
   - Remove this team (`#removeTeam`), with `#teamCount`
2. **Benchcard section second.** It is headed exactly `Benchcard` and
   contains, in this order:
   - Appearance
   - How it works, with an Open button (`#helpBtn`) and a
     `Show me around again` button in that row
   - About (a link to `./about`)
   - Contact (`mailto:hello@benchcard.app`)
   - Buy me a coffee (a link whose href is `TIP_URL`, hidden when `TIP_URL`
     is empty, exactly as `#tipLink` is)
   - Backup and restore (the current backup controls, unchanged, last)
3. **Appearance.** The row is titled `Appearance`. Its control is a group of
   three buttons, `Automatic`, `Light` and `Dark`, with the current one marked
   the same way `#maxSubsSeg` marks its current option. Tapping one sets
   `state.ui.theme` to `'auto'`, `'light'` or `'dark'` and applies it at once.
   A record with no theme shows Automatic. The word "Theme" no longer appears
   anywhere in `#view-settings`, and the `#theme` cycler and `#themeNow` are
   gone.
4. **Team tab is the roster.** `#view-team` contains none of: `#teamName`,
   `#removeTeam`, `#addTeam`, `#teamCount`, `#setTeamHd`, or any id
   `renderSettings()` paints. The roster list, Add player, Paste a list, Card
   names and the levels key stay.
5. **Switching team.** With two teams, switching from the team strip while
   Settings is open changes the team heading and every value in the team
   section to the other team's.
6. **Behaviour unchanged.** Every team setting changes plans exactly as it did
   from the Team tab. The existing tests in `settings.test.js`,
   `league-min.test.js` and `game-format.test.js` stay green, and no assertion
   about plans is loosened.
7. **48px rows.** Every row in `#view-settings` (each setting row, each link
   row, and the backup row) has a rendered height ≥ 48px at 320, 360 and
   390px wide.
8. **Adding a team.** The team strip's `+` is the only Add a team button left.
   After adding, the app opens Settings with `#teamName` focused and selected,
   because that is where a new team gets its name.
9. **Removing a team** from Settings still asks once, removes, shows Undo, and
   Undo restores it. After an undo, the coach is back on the screen they were
   on.
10. **Copy that names the old location is corrected.** Nothing says team
    settings are on the Team tab/page. That covers the help sheet paragraphs
    about Everyone plays at least and about a new game evening out the season
    (both say "the Team tab") and the odd minutes note ("set levels on this
    page" becomes "on the Team page"). The help sheet's references to levels
    being set on the Team page stay, because levels still live there.
11. `npm test` and `npm run smoke` pass. A test written against markup this
    ticket replaces is updated or retired in the same change.

## Surfaces

Change:

- `app/index.html`: move the markup, build the two sections, add the
  Appearance group and the About/Contact/Buy me a coffee rows and the tour
  button, correct the copy.
- `app/app.css`: row layout and the 48px floor for Settings rows only.
- `app/render.js` `applyTheme()`: mark the Appearance group instead of
  painting the cycler.
- `app/app.js`: the Appearance click handler replaces `#theme`'s cycler.
- `app/teams-view.js`: `addTeam()` opens Settings and focuses `#teamName`.
  Its comments stop saying the Team tab/roster page holds the name field.
- `app/toast.js`: the tip href wiring covers the new Settings link.
- `app/tour.js` or wherever `#helpTour` is wired: the Settings button calls the
  same function.
- `app/sw.js`: bump `VERSION`, set `SHELL`.
- `scripts/smoke.mjs`: the new 48px row check. Update any state that opens
  the Team tab to reach a moved control.
- `test/settings.test.js`: retarget the two layout tests (see Proof). Update
  other tests that query moved ids through `#view-team`.
- `AGENTS.md`: the smoke check count, if a row is added.

Must not change:

- `app/engine.js`, `app/budget.js`, `app/storage.js`, `app/roster.js`.
- `app/state.js` defaults and the stored shape. No migration.
- The printed card, `card.css` and `card.js`.
- The footer, the team strip (`#teamtabs`), the view tabs, the tour steps.
- `about.html`, `advanced.html`, the six chart pages.

## Constraints

- **Reuse, do not re-derive:**
  - `renderSettings()` stays the one painter of team settings, and
    `#setTeamHd`'s `Team N` fallback stays the one fallback. Do not write a
    second team-name fallback.
  - `TIP_URL` is read from where `toast.js` reads it. Do not copy the URL into
    markup.
  - The Settings tour button calls exactly what `#helpTour` calls. Do not start
    the tour a second way.
  - `applyTheme()` stays the one place that resolves `auto` and writes
    `data-theme` and `theme-color`. The pre-paint script in `index.html` is not
    touched.
  - Appearance uses the existing `.seg` pattern (the `.on` class and the
    `aria-state` convention `#maxSubsSeg` follows). Do not add a new control
    type.
  - Ids stay unique. The Settings tip link cannot reuse `id="tipLink"` while
    the footer still has it.
- **Stored values keep their keys.** `ui.theme` stays `'auto' | 'light' |
  'dark'`, and the team settings keys do not change.
- **The four pure modules** are not touched.
- **Precache bump:** `index.html`, `app.css` and the JS files above are
  precached, so bump `VERSION` and set `SHELL` to the digest `npm test` names.
- **Mobile first:** verify at 390×844, then 320px with 32px root text. The
  `APP_LARGE_TEXT_ALLOW` map stays empty.
- **Privacy wording:** any new copy uses the narrow claim or none at all.
- **Rendering rule:** a render never repaints the control a coach is using. The
  number fields keep `renderSettings`'s caret rule.
- **Interface guidelines:** S1 (two sections, team heading is the scope), S2
  (no settings on the Team tab), S3 and K4 (Appearance first: Automatic, Light,
  Dark), I1 (48px applies to the new rows; the app-wide 44px sweep rises in
  #37, not here).
- **Words:** Appearance, Automatic, How it works, Show me around again, as in
  `CONTEXT.md`.

## Design

`#view-settings` becomes:

```
Settings
┌ <Team name> ─────────────────────┐   side-box, heading #setTeamHd
│ Team name        [ input ]       │
│ A game is        [4] × [8] min   │
│ Players changing at once [1..5]  │
│ The odd minutes  [Behind|Best]   │
│ Everyone plays at least [0] min  │
│ A new game starts [Own|Season]   │
│ [Remove this team]   2 of 3 teams│
└──────────────────────────────────┘
┌ Benchcard ───────────────────────┐
│ Appearance [Automatic|Light|Dark]│
│ How it works [Open] [Show me …]  │
│ About                         ›  │
│ Contact                       ›  │
│ Buy me a coffee               ›  │
│ Backup (h4) … backup controls    │
└──────────────────────────────────┘
```

- Move the existing `setrow` blocks and their notes as they are. Each note that
  closed with a location is corrected as in item 10. The "Each team keeps its
  own settings." line stays under the team heading.
- The team name field becomes a `setrow` like the others. It keeps its note.
- Backup stays a titled block with its current copy and controls. It may stay a
  second `side-box` visually, as long as the page reads as two sections: a team
  section, then a Benchcard section with Backup last. Choose whichever keeps
  A25's `.set-h:first-child` margin fix meaningful, and keep the test honest
  about which it is.
- About, Contact and Buy me a coffee are link rows: full-width `<a>`s at least
  48px tall, with their accessible names equal to their visible text.
- `addTeam()` switches to Settings rather than the Team tab, then focuses
  `#teamName`. The team strip's own `+` already calls it.

## Proof

- `npm test`. `test/settings.test.js`:
  - "Settings keeps the help sheet above Backup, and Backup keeps the bottom"
    is retargeted from `#theme` to the Appearance group. It still requires
    Appearance < How it works < Backup, and nothing after Backup in
    `#view-settings`.
  - "the per-team settings live on the Team tab" is inverted, keeping its
    read-from-`renderSettings` seam. Every id it paints is in `#view-settings`,
    inside the team section and before the Benchcard heading, and none is in
    `#view-team`. `#addTeam` is absent from `#view-team`.
  - A test that `#view-settings` contains no "Theme" text and no `#theme`
    control. A record with no `ui.theme` still loads as `'auto'` (a
    `storage.test.js` case, if one is not there already).
- `npm run smoke`: a check that every row in `#view-settings` is ≥ 48px at 320,
  360 and 390. **`guard-falsifier` must show it going red** with a Settings row
  forced to 47px. The existing overlay, touch-target, 320px/32px and dialog
  checks stay green with the new Settings content.
- `/browser-verify` at 390×844, then 320px with 32px root text:
  - Settings shows both sections in order (screenshot).
  - Each Appearance choice flips `data-theme` and the marked button, and
    survives a reload.
  - Changing Players changing at once from Settings moves the rotation.
  - With two teams, switching team repaints the heading and values.
  - Add a team lands on Settings with the name focused.
  - Remove, then Undo, works.
  - The Team tab shows only the roster.

## Out of scope

- Removing the in-app footer or the view tabs, team strip, game chips or `?`
  controls (#23, #37).
- Team colour (#25). No row, placeholder or stub for it.
- The roster screen's own redesign and player sheet (#31).
- The gear-only-on-Today rule and a back button (#23).
- Raising the app-wide touch-target sweep to 48px (#37).
- Any change to what a setting does, its default, or its stored key.
