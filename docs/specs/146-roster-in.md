# #146 — Getting a roster in: repeats, commas, too few players, Add a team

## Issue

#146. Four rough edges in getting a roster in: a repeated name is added
without a word and then shows as two identical rows; commas are not read as
separators and the paste step never shows what it found; a team with fewer
than five players is sent to a sheet that cannot fix it; and Add a team drops
the coach into Settings and leaves an empty "Needs a fix" game behind. Rules
named: K2, W4, N8.

## Goal

A coach pasting a roster sees the names Benchcard read before anything is
added, is told when a name appears twice, and can keep both or drop one. Two
kids who share a name never show as two identical rows. A team that is short
of five gets a button that adds players. Adding a second team asks for a name
and a roster in the same flow first run uses, and backing out leaves nothing
behind.

## Survey (main at d0a1b3e, 390×844, headless Chrome)

Measured with scratch probes built on `scripts/smoke/chrome.mjs`, `dom.mjs`
and `fixtures.mjs` (a RICH record with the roster swapped for 13 players:
"Maya Webb" #12, "Maya Webb" with no number, and two "Kai Lee" with no
number). The full smoke suite was not run.

| # | Claim in the issue | Verdict | Evidence |
| --- | --- | --- | --- |
| 1a | A repeated name in one paste is added silently | holds, by design | `repeatIndexes` (roster.js:131) compares only against the roster *before* the paste; its comment calls two same-named lines "twins, which are real". Pasting "Maya Webb\n12 Maya Webb" added both with no offer. |
| 1b | The card tells them apart (MAYW / MAYW2) | holds | Card leaves read MAYW, MAYW2, KAIL, KAIL2 (`autoShortNames`, engine.js:139). |
| 1c | Team tells them apart | **partly falsified** | Team rows read "12 Maya Webb" / "MA Maya Webb" (the badge is `initials(p)`, state.js:54), but "KA Kai Lee" / "KA Kai Lee" for two players with no number: identical. |
| 1d | Bench mode tells them apart | partly holds | Floor and bench rows use card names (MAYW, MAYW2). The swap toast and Next change use `callNames` (gamemode.js:434), whose last rung is the full name, so both read "Maya Webb" (`callNames` on two "Maya Webb" returns the same string for both). |
| 1e | Who's here shows identical rows, told apart only by color | **changed since (#143)** | Rows are now `.prow who-row` with a badge (game-setup.js:~220). With one numbered Maya they differ by badge: "12 Maya Webb ✓" / "MA Maya Webb ✓". With no numbers they are identical: "KA Kai Lee ✓" twice. Both rows' `aria-label` is the bare name ("Kai Lee", "Kai Lee"), so a screen reader cannot tell them apart in either case. K2 is met only when a number happens to differ. |
| 1f | Timeline shows identical rows | holds | `tlName` (timeline.js:188) is the full name. Rows read "Maya Webb", "Maya Webb", "Kai Lee", "Kai Lee", each with only a color `.dot`. Row `aria-label`s also match. |
| 1g | Season shows identical rows | holds | The ledger (`callNames`, season-view.js:347) and filed-game rows (`nameOf`) both print "Maya Webb" twice and "Kai Lee" twice, with only a color bar. |
| 2a | "Sam, Jo, Kai" makes one player | holds | Paste sheet → one player named "Sam, Jo, Kai". `deriveShortNames` gives "SAM,"; `callNames` gives "Sam,", which is what the toast at gamemode.js:349 prints ("… on for Sam, this stint."). |
| 2b | "12 Maya Webb, 4 Jo" | (not in issue) | Parses as one player, #12, named "Maya Webb, 4 Jo". |
| 2c | Step 1 says "8 players so far" and shows no names | holds | `#frCount` read "8 players so far." (`countLine`, onboarding.js:48). The Paste a list sheet shows no count or names at all: only the button label ("Add player" for the comma line). |
| 3 | Too few players → "Change who's here", which cannot fix it | holds | 3-player team: panel reads "This plan can't be built / Only 3 players available; you need at least 5 to field a lineup. / Change who's here". The sheet lists 3 rows, all checked, plus "Plan blocked: …". Mapping is `blockedFix` (state.js:1103): `NOT_ENOUGH_PLAYERS` → 'who', whatever the roster size. |
| 4a | Add a team goes straight to Settings | holds | `addTeam` (teams-view.js:380) pushes `newTeam('', null, settings)`, calls `setView('settings')`, focuses `#teamName` (empty, placeholder "Wildcats 6th Grade"). Heading "Settings". |
| 4b | "About seven paragraphs" of text | roughly holds | 5 visible explanatory lines (p/.note) in Settings, e.g. "Each team keeps its own settings.", "2 of 2 teams". |
| 4c | Back leads to "Game 1 · Needs a fix" with 0 players | holds | Today row: "Needs a fix Game 1 0 players · even minutes". Saved record: the new team exists with 0 players and 1 game. It exists from the first tap. |

Pieces found to reuse:

- Parser: `parseRosterLine` / `parseRoster` (roster.js:9, 33). Lines split
  on `[\r\n]+` only. "12, Maya Webb" and "Maya Webb, 12" are tested forms
  (test/roster.test.js:12-21) and must still parse as one player.
- Name matching: `repeatIndexes`'s key (trim, lowercase, collapse spaces).
- Card names: `deriveShortNames` (engine.js:125). engine.js has no imports,
  so roster.js can import it without a cycle and without a new request.
- Call names: `callNames` (roster.js:175), used by gamemode, pills,
  plan-view, season-view, state.js `ruleItems` and onboarding.
- Lists: `joinNames` (state.js:909), "A, B and C".
- First run: `#firstRunFlow`, `FR_STEPS`, `stepTeam`, `stepCard`,
  `countLine`, `shortOfLineup`, `newDraft`, `startTeam`, the `#frAsk`
  discard ask (onboarding.js:469-725). Nothing is written until commit.
- Blocked panel: `blockedFix` + `timelineEmpty` (timeline.js:156). The
  jump-to-Team pattern is `rosterCta`'s `setView('team'); $(id).click()`
  (timeline.js:139). `#sheetPaste` lives inside `#view-team`, so it can only
  open once Team is showing.
- Duplicate-number notice: `duplicateNumbers` + `#dupewarn` (roster-view.js)
  — untouched.

## Decided with the maintainer

- A repeated name gets an inline "Drop one" button; tapping Add keeps both.
- A shared name adds the jersey number when it tells the players apart,
  otherwise the card name in parentheses.
- "Add players" opens Team with Paste a list already open.
- Add a team is name, then roster, then the card. It copies the current
  team's game format, has no sample team, and saves nothing until Next on
  the name step.

## What would settle it

At 390×844 light and dark unless a line says otherwise. "Large text" means
320px wide with a 32px root.

1. **Comma lines split.** `parseRoster` on a text with **no line break**
   splits it on commas when every comma-separated piece contains a letter.
   Each piece then goes through `parseRosterLine`.
   - `"Sam, Jo, Kai"` → 3 players: Sam, Jo, Kai, no numbers.
   - `"Sam, Jo, Kai,"` → the same 3 (empty pieces dropped).
   - `"12 Maya Webb, 4 Jo"` → 2 players: Maya Webb #12, Jo #4.
   - `"12, Maya Webb"` and `"Maya Webb, 12"` → 1 player, Maya Webb #12
     (a piece with no letter blocks the split).
   - A text **with** line breaks never splits on commas:
     `"Webb, Maya\nTran, Eli"` → 2 players named "Webb, Maya" and
     "Tran, Eli", exactly as today.
   - Every case in test/roster.test.js still passes unchanged.
2. **The paste step lists what it read.** It updates on every keystroke, in
   an `aria-live="polite"` line. Numbered players are written
   "Maya Webb #12".
   - First-run step 1 (`#frCount`), exact copy:
     - empty: unchanged, "Paste from wherever your roster lives. Jersey
       numbers are optional."
     - `"Sam, Jo, Kai"`: "3 players so far: Sam, Jo and Kai. 5 needed to
       field a lineup."
     - `"Sam"`: "1 player so far: Sam. 5 needed to field a lineup."
     - the 12-line sample (`sampleRosterText(12)`): "12 players so far: Maya
       Webb #12, Eli Tran #4, … and Ryan Vance #6." — all 12 names, in
       paste order.
   - Paste a list sheet: while the box is empty, the note stays "One per
     line. Numbers are read from either end: “12 Maya Webb” or “Maya Webb
     #12”." With text, the note becomes the list: "3 players: Sam, Jo and
     Kai." / "1 player: Sam." The confirm button still reads
     `confirmAddLabel(n)` ("Add 3 players").
3. **A repeat is shown before adding.** When two or more parsed entries have
   the same name (the `repeatIndexes` key: case, edge and inner spaces
   ignored), a line appears under the list in both places, one per repeated
   name:
   - twice: "Maya Webb is listed twice." — three times: "Maya Webb is listed
     3 times."
   - beside it, a `btn ghost sm` button "Drop one", at least 48px tall,
     accessible name "Drop one Maya Webb".
   - **Keep both** is doing nothing: the confirm button adds every entry, as
     today. No second confirm.
   - **Drop one** removes one entry from the text box and repaints the list,
     the count and the button. It removes the entry **without** a number if
     exactly one of the group lacks one; otherwise the **last** one. Other
     lines stay byte-identical. For `"Maya Webb\n12 Maya Webb"` the box
     becomes `"12 Maya Webb"`, the list "1 player: Maya Webb #12.", and the
     repeat line goes away.
   - The existing "N of these were already on the roster." offer after a
     paste is unchanged.
4. **Shared names are told apart everywhere.** For players whose full names
   match (same key as item 3), the shown name gets a suffix:
   - " #12" when the player has a number no one else in that group has;
   - otherwise " (MAYW2)", the player's card name exactly as the card prints
     it (`deriveShortNames` over the whole roster).
   - Fixture: "Maya Webb" #12, "Maya Webb" (no number), "Kai Lee" and "Kai
     Lee" (no numbers). Expected: "Maya Webb #12", "Maya Webb (MAYW2)",
     "Kai Lee (KAIL)", "Kai Lee (KAIL2)". Players whose names are unique
     are unchanged ("Hana Kim", not "Hana Kim #9").
   - Where it shows: Who's here row text **and** `aria-label`; Timeline row
     name **and** `aria-label`; Season "Minutes so far" and filed-game rows;
     Team roster rows; bench mode's swap toast and Next change; every other
     `callNames` reader (rules, pills). `callNames`' last rung (full name)
     becomes the suffixed full name. Its earlier rungs ("Maya", "Maya W.")
     do not change.
   - At 390 and large text, a suffixed long name (`LONG_NAME` twice, one
     with #12) wraps or ellipsizes the way that screen already does. The
     suffix is never cut off in Who's here or Team, and nothing overflows.
5. **Too few players: "Add players".** When the plan's first error is
   `NOT_ENOUGH_PLAYERS` **and the roster has fewer than 5 players**, the
   blocked panel's button reads exactly "Add players". Tapping it shows the
   Team screen with the Paste a list sheet open and its box focused. With 5
   or more on the roster (some marked absent), the button still reads
   "Change who's here" and opens Who's here. Check with a 3-player roster,
   and with an 11-player roster where 7 are absent.
6. **Add a team is a flow, not Settings.**
   - Team menu → "Add a team" opens `#firstRunFlow` with the accessible name
     "Add a team". Step "1 of 2", heading "Who's on the team?", the same
     Team name and roster fields as first-run step 1, with items 1-3 working
     there. "Fill with a sample team" is not shown. Next is disabled below 5
     players, as in first run.
   - Next commits: a new team with that name and roster, settings copied
     from the team it was added from (`newTeam(name, players,
     team().settings)`), made active. Step "2 of 2" is "Here's your first
     card", and "Go to the game" lands on the new team's Game 1 with the plan
     built. No tour.
   - **Backing out adds nothing.** ✕, Escape or back on step 1 closes (with
     the existing "Discard what you typed?" ask when anything is typed). The
     team menu still lists only the teams there were before, and Today still
     shows the old team with no "Game 1 · Needs a fix" row.
   - Settings is not opened at any point.
   - `track('team_added')` fires once, on commit, not on open.
     `first_run_complete` does not fire.
   - At 12 teams (`MAX_TEAMS`, teams-view.js:59) the menu has no "Add a team", as today.
7. **Large text.** At 320/32 the paste sheet (12 names typed, one repeated),
   first-run step 1 with the same text, the Add a team step 1, and the
   3-player blocked panel have no horizontal overflow, no clipped text, and
   "Drop one" and "Add players" fully on screen.

## Surfaces

- `app/roster.js` — comma splitting in `parseRoster`; new pure exports for
  the repeats list (grouped entries), dropping one entry from the text, the
  preview sentence, and the suffixed full names; `callNames`' last rung.
  Imports `deriveShortNames` from engine.js.
- `app/onboarding.js` — `countLine` takes the parsed list; step 1 repeat
  line; an add-team mode of `#firstRunFlow` (steps: team, card), exported
  opener.
- `app/roster-view.js` — paste sheet list line and repeat line; Team rows
  use the suffixed name.
- `app/teams-view.js` — `addTeam` opens the flow instead of Settings.
- `app/state.js` — `blockedFix(issues, rosterSize)` gains the 'add' opener.
- `app/timeline.js` — 'add' opener (Team + paste sheet, `rosterCta`'s jump
  pattern); `tlName` and row labels use the suffixed name.
- `app/game-setup.js` — Who's here row text and `aria-label`.
- `app/season-view.js` — ledger and filed-game rows.
- `app/index.html` — only if the paste sheet needs a holder for the list and
  repeat line.
- `app/app.css` — the repeat line's layout, if `.note` plus a `btn ghost sm`
  does not already lay out.
- `app/sw.js` — VERSION and SHELL bump.
- Tests that pin today's strings: test/roster.test.js, first-run.test.js
  (`countLine`), blocked-fix.test.js, sample-team.test.js.
- Smoke checks that may name today's markup: `first-run-flow.mjs`,
  `who-rows.mjs`, `team-screen.mjs`; `app-large-text.mjs` STATES.
- **Must not change:** `engine.js`, `budget.js`, `storage.js` (no schema
  change: the suffix is display-only, never stored); the card and its short
  names; `duplicateNumbers` and `#dupewarn`; the after-paste "already on the
  roster" offer; `sampleRosterText`.

## Constraints

- **Pure modules.** roster.js is one of the four; this task is explicitly
  about its parser and names, so it changes — but only as items 1, 3 and 4
  say. engine.js is imported, not edited.
- **Reuse, do not re-derive.**
  - Name matching uses `repeatIndexes`' key. One key function, shared.
  - Card names come from `deriveShortNames`. Do not write a second
    abbreviator.
  - The suffix is computed in one roster.js function. Who's here, Timeline,
    Season, Team and `callNames` all read it. No screen builds its own.
  - Lists join with `joinNames`. Button copy for adding stays
    `confirmAddLabel`.
  - Add a team is `#firstRunFlow` with `stepTeam` and `stepCard`, the draft
    and its discard ask. Not a new dialog, not a copy of the steps.
  - The 'add' opener uses `rosterCta`'s jump (`setView('team')` then the
    Team screen's own `#pasteRow`), not a second paste sheet.
- **K2.** After this change no two rows anywhere show the same name with
  only color between them, and each row's accessible name is distinct.
- **W4.** The blocked panel's button fixes the problem it names.
- **N8.** Add a team is full screen, has a step count, and ✕ always escapes.
- **Mobile first, large text**: 390 first; 320/32 for every new state; do not
  touch `APP_LARGE_TEXT_ALLOW`.
- **Precache**: bump `VERSION`, set `SHELL`.
- American spelling. No tab bar. Do not quote the maintainer in code or
  docs.
- A possible import cycle between teams-view.js and onboarding.js: if one
  appears, inject the opener through `initOnboarding`/init the way `setView`
  is, rather than importing back.

## Design

- **Parser.** `parseRoster(text)`: if the text has no `\r` or `\n` and holds
  a comma, split on commas, drop empty pieces, and use the pieces if each
  has a letter (`/\p{L}/u`). Otherwise parse lines as today.
- **Preview.** A pure `rosterPreview(entries)` in roster.js gives the name
  list ("Sam, Jo and Kai", numbered as "Maya Webb #12") and the repeat
  groups. `countLine` and the paste sheet wrap it in their own sentences
  (item 2). The paste sheet's `.note` swaps between the hint and the list.
- **Drop one.** A pure `dropRepeat(text, name)` returns the new text: it
  finds the entry item 3 names, removes that line, or that piece of a comma
  line, and leaves every other line alone. The caller writes it into the box
  and fires the same repaint as typing.
- **Names.** A pure `distinctNames(players)` returns id → full name, with
  the item 4 suffix only on shared names. `callNames(players)` uses it for
  its last rung. Callers that show a full name use it instead of `p.name`.
- **Blocked fix.** `blockedFix(issues, rosterSize)`: `NOT_ENOUGH_PLAYERS` with
  `rosterSize < 5` → `{ label: 'Add players', opener: 'add' }`. The '5' is
  the engine's `ON_FLOOR`; read it from the issue's own count or an export,
  not a new literal. `timelineEmpty` handles 'add' with the jump.
- **Add a team.** `openAddTeam(trigger)` in onboarding.js opens
  `#firstRunFlow` in an add-team mode: steps `[stepTeam, stepCard]`, sample
  button hidden, dialog `aria-label` "Add a team" (put back to "Get started"
  on close). Next on step 1 commits: players built the way `startTeam` builds
  them (shared helper, not a copy), `newTeam(name, players,
  team().settings)` pushed and made active, `track('team_added')`,
  `editHappened()`. Nothing is written before that. `addTeam` in
  teams-view.js keeps its `MAX_TEAMS` check and calls the opener.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `parseRoster` comma cases, the tested line forms unchanged | `node --test test/roster.test.js` | 1 |
| `rosterPreview` list text and repeat groups; `dropRepeat` on `"Maya Webb\n12 Maya Webb"`, on a comma line, and on three repeats | `node --test test/roster.test.js` | 2, 3 |
| `countLine` exact strings for 0, 1, 3 and 12 players | `node --test test/first-run.test.js` | 2 |
| `distinctNames` on the item 4 fixture; unique names unchanged; `callNames` last rung suffixed, earlier rungs unchanged | `node --test test/roster.test.js` | 4 |
| `blockedFix` with roster 3 → "Add players"/'add'; roster 11, 4 available → "Change who's here"/'who' | `node --test test/blocked-fix.test.js` | 5 |
| New smoke check `roster-in.mjs`: types into the paste sheet and first-run step 1, reads the list and repeat text, taps "Drop one", reads the box; seeds the item 4 fixture and reads Who's here, Timeline, Season, Team row text and `aria-label`s; 3-player and 7-absent blocked panels, taps "Add players" and checks Team + open `#sheetPaste` + focus; Add a team: opens, abandons (team count and Today rows unchanged), then completes (new team active, Game 1 planned, Settings never shown) | `node scripts/smoke.mjs --only "roster in"` | 1-6 |
| Large text: paste sheet with 12 names and a repeat, first-run step 1 with the same, Add a team step 1, 3-player blocked panel added to `APP_LARGE_TEXT_STATES` | `app-large-text.mjs` | 7 |
| Existing checks follow any markup move | `first-run-flow.mjs`, `who-rows.mjs`, `team-screen.mjs` | 2, 4, 6 |
| Look | `/browser-verify`, and `node scripts/compare-shots.mjs --issue 146` writing to `notes/mockups/prototype/compare/146/`: paste sheet with a repeat, first-run step 1 with 12 names, Add a team step 1, Who's here with the item 4 fixture, the 3-player blocked panel — light and dark at 390, plus 320/32, plus the paste sheet scrolled to its bottom | 2-7 |

## Out of scope

- Detecting a repeat against the existing roster before adding. The
  after-paste offer stays as it is.
- Splitting on anything but commas (tabs, semicolons, runs of spaces).
- Comma splitting in multi-line pastes.
- Duplicate jersey numbers (`#dupewarn` already handles them).
- The card's short names and the card itself.
- Who's here gaining its own add button; the blocked panel's button is the
  fix (W4).
- A team emptied later by removing its players still shows "Needs a fix";
  only Add a team's leftover is removed here.
- Renaming or moving the Settings team name field.
