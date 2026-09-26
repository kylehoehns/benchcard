# #142 — Settings looks like the rest of the app

## Issue

#142 (item 12 of #153). Blocker #141 merged as PR #162. Surveyed against
origin/main at 7b859ef.

## Goal

Settings uses the same look as Team: sentence-case gray section
headers over borderless inset groups, rows of at least 48px, at most one gray
footnote under each group, and two button styles (row action, destructive).
Every long explanation that leaves Settings keeps its meaning in How it works.

## Survey

| Claim in #142 | Verdict | Where |
|---|---|---|
| Title is small and centered | Holds. Only the bar title shows, via `data-bar-title="Settings"`. #33 decided this on purpose, and a smoke check pins it. | app/index.html:1251; app/render.js:400-420 (`syncBarTitle`, `watchLargeTitle` keeps Settings `.title-in`); scripts/smoke/floating-controls.mjs:48-53, 109-112 (`NO_LARGE_TITLE = new Set(['settings'])`) |
| Uppercase headers inside the cards | Holds. "SMOKE TEST" is the smoke fixture's team name painted into `#setTeamHd`. | `.side-hd` app/app.css:1685; `.set-h` app/app.css:4397; fixture scripts/smoke/fixtures.mjs:85 |
| Cards have borders; "no other card has a border" | Border holds. "No other card" is partly false: the game screen's "This game" box uses the same `.side-box`. So `.side-box` must not change globally. | `.side-box` app/app.css:1684; game use app/index.html:708 |
| Paragraph lengths (~50, ~60, ~55 words) | Holds: 51, 57, 54 words. | app/index.html:1251-1621 (full list below) |
| Five button looks | Holds, but the list is incomplete. It misses `#teamColorBtn` (outlined `.btn`) and `.paste-go` "Restore" (`.btn`). Remove this team moved: it is now a `.prow-danger` row (#141). | `#removeTeam` own `.pgrp` after the team box; `.prow-danger` app/app.css:3438 |
| `<h4>` Backup and restore at index.html:1566 | Moved to index.html:1582. "This team" (1261) and "Benchcard" (1514) are divs. The only real heading in the view is the bar's `h1#barTitle`. | app/index.html:1261, 1514, 1582 |
| Match Team's section headers | Team has a large title and inset groups but no section headers. The header style to reuse is `.pgrp-h` / `.pgrp-f` (used in sheets), with a Settings inset fix. | `.pgrp-h`/`.pgrp-f` app/app.css:3281-3285; Team markup app/index.html:1049+, rows painted in app/roster-view.js:741-771 |

### Settings paragraphs today (words)

| Where | Text | Words |
|---|---|---|
| Team box, under heading | "Each team keeps its own settings." | 6 |
| Team name | "Heads the card when a game has no opponent, and names the day above your games." | 16 |
| A game is | "Periods, and minutes in each period. A game you add copies the format from the game before it, so this is what a game starts as when there is nothing to copy: a brand new team, or your first game. You can still change it per game from the game screen." | 51 |
| Team color | "Tints the primary buttons and the selected states across the app." | 11 |
| Players changing at once | "How many go on together at a substitution. Fewer keeps the floor settled; more breaks up long stretches on the bench. Totals come out the same either way." | 28 |
| `#maxSubsRead` (live) | From `SUBS_READ`, app/teams-view.js:89, e.g. "Aims for one to three changes a break, and goes higher only when holding to three would cost somebody minutes. The plan says so when it does." | ~27 |
| The odd minutes | "When the clock will not divide evenly, somebody plays one stint less. Choose who lands on the high side. Minimum minutes, caps and minutes you set by hand all still win. Until you set levels on the Team page, both settle it the same way." | 45 |
| Everyone plays at least | "Minutes, for every player who is available. Leave it at 0 unless your league has a rule. A minimum you set on one player still wins when it is higher, a cap you set still wins when it is lower, and the plan says so if the game is not long enough to give everyone that much." | 57 |
| A new game starts | "Every game you add can open with “Even out the season so far” already on, so you do not tick it each week. You can still change it per game under Rules. Until a finished day has filed there is no season to even out, and both settle a new game the same way." | 54 |
| `#teamCount` | "N of M teams" (app/roster-view.js:786) | 4 |
| How it works row | "The reference sheet, and the guided tour again." | 8 |
| Backup, intro | "Your roster is saved in this browser and nowhere else. Clearing your history can erase it, and so can leaving Benchcard unopened for a week on an iPhone. Save a file now and keep it somewhere you would keep a photo." | 41 |
| `#persistNote` (hidden unless granted) | "This browser has agreed to keep Benchcard’s data, so a week without opening it will not clear your roster. Clearing your history still will." | 24 |
| Backup, after controls | "Restoring replaces everything on this device with what is in the file. You get nine seconds to undo it." | 19 |

### Settings buttons today

| Control | Class | Planned style |
|---|---|---|
| `#teamColorBtn` | `btn press color-row-btn` | Row action (`button.prow`, value = swatch + color name, chevron) |
| `#helpBtn` "Open" | `btn press` | Row action "How it works" + chevron |
| `#helpTourSettings` "Show me around again" | `btn press` | Row action, its own row, no chevron |
| About / Contact / Buy me a coffee | `a.setrow.linkrow` + `.linkrow-chev` | Row action (`a.prow` + `.prow-chev`) |
| `#exportBackup` "Save a backup file" | `btn press` | Row action |
| `#importBackup` "Restore from a file" | `btn ghost press` | Row action |
| `.paste-open` "or paste a backup" | `linkish press` | Row action "Paste a backup" (keeps `.paste-open`) |
| `.paste-go` "Restore" | `btn press` | Row action, a row under the textarea (keeps `.paste-go`) |
| `#removeTeam` | `prow prow-center prow-danger press` | Destructive (already done in #141) |
| `#maxSubsSeg`, `#tieBreakSeg`, `#seasonDefSeg`, `#themeSeg` | `.seg.wide` | Not buttons in this sense: C7 segmented controls. They stay, inside rows. |
| `#colorPicker` dialog buttons | own dialog | Out of scope |

### Things pinned to today's structure

- scripts/smoke/settings-rows.mjs (registry.mjs:198, `settingsrows`) runs scripts/smoke-checks.js:409. It counts direct children of `#view-settings .side-box` that hold a control, and fails on 0 rows. With no `.side-box` it fails. Must be re-pointed at `#view-settings .pgrp .prow` (guard edit, via /new-guard).
- scripts/smoke/phone-gutter.mjs:73-74 reads the first and last `#view-settings .side-box`.
- scripts/smoke/team-color.mjs:116, 281 reads `.set-h` color as accent. Also reads `#setTeamHd`, `.help-h`, `#colorOpts .color-opt.on`.
- scripts/smoke/floating-controls.mjs:48-53, 109-112 requires Settings to have no large title.
- scripts/smoke/overlay.mjs:113-150 uses `#view-settings .paste-open`, `.pastebox`, `#helpBtn`.
- scripts/smoke/no-games.mjs:142-146 requires `#helpTourSettings` hidden with no games (render.js:179).
- scripts/smoke/remove-rows.mjs and game-field-match.mjs use `#removeTeam` and `#teamName`.
- test/smoke-registry.test.js:87 names 'settings rows ≥ 48px'.
- test/settings.test.js:526-700 pins class strings (`class="set-h">Backup and restore<`, `class="side-box"`, `class="side-hd">Benchcard<`, `<a class="setrow linkrow"`, `<span class="setrow-t">About</span>`), the Benchcard order (Appearance < How it works < Show me around again < About < Contact < Buy me a coffee < Backup), no `class="setrow"` between `#helpBtn` and `#helpTourSettings`, nothing after Backup, and the team zone order (`#setTeamHd` < `#teamName` < `#removeTeam` < Benchcard, every renderSettings id before Benchcard).
- test/note-placement.test.js: every `p.note` sits inside a box.
- test/one-control-each.test.js: remove actions are `.prow-danger`.
- test/backup.test.js:429-437: `#persistNote` must exist and app.js unhides it only after `keepStored()`.
- test/help-deeplink.test.js bans in `#help`: "Season tab", `\bPrint\b`, "Across the day", `under\s+(?:<b>)?Rules`.

## What would settle it

Checked at 390×844 and at 320, 360, 390 wide, light and dark, with the rich
smoke fixture (long team name "Smoke Test" and a real roster), scrolled to the
bottom:

1. Title: unchanged. Settings keeps its bar title (`data-bar-title`), as in the prototype and #33. floating-controls.mjs's `NO_LARGE_TITLE` stays as it is.
2. Inside `#view-settings` there is no `.side-box`, `.side-hd`, `.set-h`, `.setrow`, `.linkrow` and no visible `.btn` or `.linkish` (the `#colorPicker` dialog is excluded).
3. Every group is a `.pgrp`: border width 0, background `--surface`, radius `--r-sm`, left edge at 16px and right edge at viewport width − 16px.
4. Every section header is an `h2.pgrp-h`: font size `--fs-footnote`, color `--muted`, `text-transform: none`, `letter-spacing: normal`, text starts 32px from the screen edge (the prototype's 32px).
5. At most one footnote (`p.pgrp-f`) after each `.pgrp`, text starts 32px from the screen edge, color `--muted`. No `p.note` inside a `.pgrp`.
6. Every row (`#view-settings .pgrp > .prow`, and `label.prow`) is at least 48px tall at 320, 360 and 390.
7. Every clickable control in Settings is a `.prow` (row action) or `.prow.prow-danger` (destructive, only `#removeTeam`). Segmented controls stay as `.seg`.
8. How it works has a "Settings" section (`h4.help-h`) that holds each moved explanation, with the meanings listed in the footnote table below. help-deeplink.test.js still passes.
9. Side by side with notes/mockups/prototype/light-settings.png and dark-settings.png: same group shapes, header placement, row separators and footnote placement. Differences allowed by the README (docs win): 48px rows, 16px row text, and more settings (S1).
10. `npm test` and `npm run smoke` pass, including the re-pointed settings rows check.

## Surfaces

Change:
- app/index.html: `#view-settings` markup (1251-1621); new "Settings" section in `#help` (1830-1966).
- app/app.css: Settings modifiers for `.pgrp-h` / `.pgrp-f` inset; wrapping row for label + seg; drop now-dead Settings rules (`#helpTourSettings` nowrap 4419, stale `#removeTeam` nowrap 660, `#view-settings .setrow` min-height 4411, `.set-h` 4397 and `.linkrow` 4427 if nothing else uses them).
- app/teams-view.js: only if the markup it paints changes shape (for example `#maxSubsRead` becoming the group footnote, or `#setTeamHd` becoming an `h2`). Behavior stays.
- app/sw.js: bump `VERSION`, set `SHELL` to the digest `npm test` names.
- test/settings.test.js: rewrite the class-string pins to the new classes, keep each pin's intent.
- New guard test (via /new-guard) for the Settings look.
- scripts/smoke-checks.js (settings rows), scripts/smoke/phone-gutter.mjs, team-color.mjs.

Must not change:
- `.side-box` and `.side-hd` global rules (the game screen's "This game" box uses them, index.html:708; `#view-games .side-hd` at app.css:1690).
- app/app.js paste and backup wiring: the `.pastein`, `.paste-open`, `.pastebox`, `.paste-text`, `.paste-go` classes (app.js:322-330, shared with the welcome screen at index.html:987-1010) and the ids `#exportBackup`, `#importBackup`, `#backupFile`, `#persistNote` (app.js:242-285).
- Every id renderSettings paints: `#setTeamHd`, `#teamName`, `#setPeriods`, `#setPerMins`, `#teamColorBtn`, `#teamColorSwatch`, `#teamColorName`, `#maxSubsSeg`, `#maxSubsRead`, `#tieBreakSeg`, `#minMins`, `#seasonDefSeg`, `#teamCount`, `#removeTeam`, `#themeSeg`, `#helpBtn`, `#helpTourSettings`.
- `#colorPicker` dialog behavior; engine.js.
- app/render.js's title handling and floating-controls.mjs: Settings keeps its bar title.

## Constraints

- Reuse `.pgrp`, `.prow`, `.prow-t`, `.prow-v`, `.prow-chev`, `.pgrp-h`, `.pgrp-f`, `.prow-in`, `.prow-danger`, `.prow-center`. Do not write a new card, row or header style.
- Reuse the existing `#view-settings .pgrp { margin-left:0; margin-right:0 }` (app.css:3305) with the `.wrap` gutter. Do not re-derive the 16px edge.
- Header and footnote inset: `.pgrp-h` / `.pgrp-f` pad 2rem, which assumes a sheet with 1rem group margins. In Settings the group margin is 0, so add one Settings modifier that pads them 1rem inline (text at 32px from the screen edge). Follow Season's `.sn-day` precedent (app.css:4310).
- Wrapping rows (label above, full-width seg below): follow the `#sheetPlayer .pgrp .prow { flex-wrap:wrap }` precedent (app.css:3428). Do not invent a new row type.
- Keep `#removeTeam` exactly as #141 left it.
- Keep all class and id hooks listed under "Must not change".
- The moved text in How it works must not use the phrases help-deeplink.test.js bans. "Change it per game under Rules" becomes "in the game's Plan, under Across the season".
- `#persistNote` stays a `p` with that id, still unhidden only by `keepStored()` (backup.test.js:429-437).
- Guard edits (settings rows smoke, new guard test) go through /new-guard. Seams go through /tdd.
- Long smoke runs: wrap in `perl -e 'alarm 900; exec @ARGV'`.
- Byte budget: widen `bytesAbs` if needed, do not escalate.

## Design

### Page shape

```
[bar title "Settings", unchanged]

h2.pgrp-h#setTeamHd   <team name>
.pgrp   Team name  [input]
        Team color            ● Graphite ›
p.pgrp-f  Each team keeps its own settings.

.pgrp   A game is             [2] × [20] min
        A new game starts     [On its own | With the season]
p.pgrp-f  What a new game starts as. Change any game from its own screen.

.pgrp   Players changing at once   [1 2 3 4 5]
        The odd minutes            [Furthest behind | Best players]
        Everyone plays at least    [0] min
p.pgrp-f#maxSubsRead  (live SUBS_READ line)

.pgrp   Remove this team            (red, centered; #141)
p.pgrp-f#teamCount  2 of 5 teams

h2.pgrp-h  Benchcard
.pgrp   Appearance            [Automatic | Light | Dark]
        How it works                         ›
        Show me around again
        About                                ›
        Contact                              ›
        Buy me a coffee                      ›

h2.pgrp-h  Backup and restore
.pgrp   Save a backup file
        Restore from a file
        Paste a backup
          [textarea] / Restore               (hidden until opened)
p.pgrp-f  Saved only in this browser. Keep a backup file somewhere safe.
p.pgrp-f#persistNote (hidden unless granted; replaces the footnote above)
```

Notes on the shape:
- Group B holds the two "what a new game starts as" settings. Group C holds the three that shape who plays.
- `#persistNote` is a second line only when the browser grants storage. To keep "one footnote per group", it replaces the default footnote when shown: the default gets `hidden` in the same `keepStored()` branch. Its text becomes "This browser keeps Benchcard’s data. Clearing your history still erases it.", and How it works gets the always-true version (table below). This needs a one-line change at app.js:261 inside the existing `keepStored()` guard, which backup.test.js allows.
- Headers: all section headers are `h2`. The only `h1` is the title.
- `#teamCount` moves from a loose row to the Remove group's footnote.

### Footnotes and where each longer text goes

New How it works section: `h4.help-h` "Settings", placed after "Changing the plan mid-game" and before `#helpTour`, as one `dl.help-dl` with a `dt` per setting and the text in `dd`.

| Setting | Original text | Footnote in Settings | How it works "Settings" entry (dt → dd) |
|---|---|---|---|
| Team zone | "Each team keeps its own settings." | Group A footnote: "Each team keeps its own settings." | (none; kept as footnote) |
| Team name | "Heads the card when a game has no opponent, and names the day above your games." | none | Team name → "Heads the card when a game has no opponent, and names the day above your games." |
| Team color | "Tints the primary buttons and the selected states across the app." | none | Team color → "Tints the primary buttons and the selected states across the app." |
| A game is | "Periods, and minutes in each period. A game you add copies the format from the game before it, so this is what a game starts as when there is nothing to copy: a brand new team, or your first game. You can still change it per game from the game screen." | Group B footnote: "What a new game starts as. Change any game from its own screen." | A game is → "Periods, and minutes in each period. A game you add copies the format from the game before it, so this is what a game starts as when there is nothing to copy: a brand new team, or your first game. You can still change it per game from the game screen." |
| A new game starts | "Every game you add can open with “Even out the season so far” already on, so you do not tick it each week. You can still change it per game under Rules. Until a finished day has filed there is no season to even out, and both settle a new game the same way." | (shares group B footnote) | A new game starts → "Every game you add can open with “Even out the season so far” already on, so you do not tick it each week. You can still change it per game in the game's Plan, under Across the season. Until a finished day has filed there is no season to even out, and both settle a new game the same way." (reworded only where help-deeplink.test.js bans "under Rules") |
| Players changing at once | "How many go on together at a substitution. Fewer keeps the floor settled; more breaks up long stretches on the bench. Totals come out the same either way." | Group C footnote: the live `#maxSubsRead` line. | Players changing at once → "How many go on together at a substitution. Fewer keeps the floor settled; more breaks up long stretches on the bench. Totals come out the same either way." |
| `#maxSubsRead` | live, from `SUBS_READ` (teams-view.js:89) | Group C footnote (still painted by renderSettings) | (none) |
| The odd minutes | "When the clock will not divide evenly, somebody plays one stint less. Choose who lands on the high side. Minimum minutes, caps and minutes you set by hand all still win. Until you set levels on the Team page, both settle it the same way." | (shares group C footnote) | The odd minutes → same text, verbatim |
| Everyone plays at least | "Minutes, for every player who is available. Leave it at 0 unless your league has a rule. A minimum you set on one player still wins when it is higher, a cap you set still wins when it is lower, and the plan says so if the game is not long enough to give everyone that much." | (shares group C footnote) | Everyone plays at least → same text, verbatim. (The Rules section of #help already says part of this; keep both.) |
| `#teamCount` | "N of M teams" | Remove group footnote | (none) |
| How it works row | "The reference sheet, and the guided tour again." | none (the two rows say it) | (none; dropped, the row labels carry it) |
| Backup intro | "Your roster is saved in this browser and nowhere else. Clearing your history can erase it, and so can leaving Benchcard unopened for a week on an iPhone. Save a file now and keep it somewhere you would keep a photo." | Backup footnote: "Saved only in this browser. Keep a backup file somewhere safe." | Backup and restore → "Your roster is saved in this browser and nowhere else. Clearing your history can erase it, and so can leaving Benchcard unopened for a week on an iPhone. Save a file now and keep it somewhere you would keep a photo." |
| `#persistNote` | "This browser has agreed to keep Benchcard’s data, so a week without opening it will not clear your roster. Clearing your history still will." | Replaces the backup footnote when shown: "This browser keeps Benchcard’s data. Clearing your history still erases it." | Added to the same dd: "Some browsers agree to keep Benchcard’s data. Then a week without opening it will not clear your roster, but clearing your history still will." |
| Restore note | "Restoring replaces everything on this device with what is in the file. You get nine seconds to undo it." | none | Same dd, verbatim: "Restoring replaces everything on this device with what is in the file. You get nine seconds to undo it." |

Optional, recommended: `#helpBtn` stays `openHelp()`. A later issue could deep-link to the Settings section via `openHelp('settings')` (shortcuts.js:70); not needed here.

### Row markup patterns

- Text input: `label.prow` > `span.prow-t` "Team name" + `input.prow-in#teamName`.
- Button with value: `button.prow#teamColorBtn` > `span.prow-t` + `span.prow-v` (swatch `#teamColorSwatch` + `#teamColorName`) + `span.prow-chev`.
- Seg row: `div.prow` (wrapping modifier) > `span.prow-t` + `.seg.wide` full width below.
- Minutes row: `div.prow` > `span.prow-t` + `.minwrap` right-aligned (inputs keep ids).
- Link row: `a.prow` > `span.prow-t` + `span.prow-chev`; Buy me a coffee keeps `data-tip-link`.
- Paste: the `.pastein` wrapper keeps its class and holds `button.prow.paste-open` and the hidden `.pastebox` with `textarea.paste-text` and `button.prow.paste-go`.

## Proof seams

| What | Seam | How |
|---|---|---|
| Rows ≥ 48px at 320/360/390 | scripts/smoke-checks.js:409 via settings-rows.mjs | Re-point at `#view-settings .pgrp > .prow` (and `.pastein > .prow`), keep "fails on 0 rows". /new-guard. Keep the registry name so smoke-registry.test.js:87 holds. |
| Group look (no border, 16px edges, header and footnote at 32px, sentence case, `h2`, one footnote per group, only `.prow` / `.prow-danger` buttons), light and dark | New smoke check, e.g. scripts/smoke/settings-look.mjs + registry entry | /new-guard. Reads computed styles at 320 and 390. |
| No old classes; every section header is `h2`; How it works holds each moved text | New node test, comment-stripped index.html | /new-guard. Checks for key phrases ("nine seconds to undo", "nothing to copy", "one stint less", "league has a rule", "Even out the season so far", "nowhere else"). |
| Order and zone pins | test/settings.test.js:526-700 | Rewrite class strings, keep order and zone intent. How it works and Show me around again become two rows, so that pin changes. |
| Title | scripts/smoke/floating-controls.mjs | Unchanged; must still pass. |
| Gutter | scripts/smoke/phone-gutter.mjs:73-74 | Read first and last `#view-settings .pgrp`. |
| Team color | scripts/smoke/team-color.mjs:116, 281 | Drop the `.set-h` accent read (no accent headers remain); keep `#setTeamHd` read. |
| Persist footnote swap | test/backup.test.js:429-437 | Must still pass; extend only if the swap changes app.js:261. |
| Look | compare-shots `--issue 142`; /browser-verify | Beside light-settings.png and dark-settings.png at 390, plus 320 at 32px text, long team name, scrolled to bottom, paste box open. |

## Out of scope

- The `#colorPicker` dialog look.
- Changing any setting's behavior or defaults.
- Deep links from Settings into How it works.
- The game screen's "This game" box (also a bordered `.side-box`).
- Turning segmented controls into steppers like the prototype's "3" stepper.
- A separate Backup screen (the prototype's "Back up and restore ›" row).

## Decided

1. **Title.** Settings keeps its bar title, as in `light-settings.png` and #33. It is a pushed screen, reached from Team with a back button. The rest of #142 ships. (The human chose this.)
2. **How it works and Show me around again are two rows.** One action per row (C6). settings.test.js's pin changes to match.
3. **`#maxSubsRead` is group C's one footnote.** It answers the current choice. The fixed text moves to How it works.
4. **Restore is a plain row action,** not destructive. It can be undone for nine seconds and removes nothing.
5. **Backup keeps its own header,** `h2.pgrp-h` "Backup and restore", placed last. The prototype's single "Back up and restore ›" row would need a new screen (out of scope).
6. **`#persistNote` swaps with the default Backup footnote** in the same `keepStored()` branch, so a group never shows two footnotes.
