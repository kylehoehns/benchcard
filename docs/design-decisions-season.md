# Design decisions: the season record

Split out of [design decisions](design-decisions.md), which has a size limit.
The same rule applies: a decision is kept with its alternative.

- **A day that ends is kept, not thrown away.** `teams[].season.games` holds
  every finished game — its date, format, opponent and the per-player minutes
  actually played. A game is finished when it is in the day at the moment the
  day's own date passes *and its plan solved and the game was at least started*
  (`fileIfPast`, #100, #133), but only if the coach has set up a team (#252):
  there is deliberately no "Finish game" button, and — since #100 — no "New day"
  button either, because the bug being fixed is that a coach loses a day without
  ever being asked, and an answer that only works when they remember to press
  something reproduces it for the coach who is busiest.
  `plan.ok` is the one honest signal available with no UI — a game that never
  produced a rotation was never played — and deleting a game beforehand already
  takes it out of the day. A game that was planned but never started is not
  filed with its planned minutes, and it is not dropped either (this replaces
  #133's "left out" rule). It waits on Today under "Did you play these?" until
  the coach answers (#632). We chose to ask rather than file it on its own, or
  carry it to today with no word, because a game the coach never ran should not
  count toward minutes without them saying so. The three answers are Played
  (files it with its planned minutes), Move to today, and Didn't play (removes
  it). Waiting games are not in the season, so they do not count toward minutes
  until answered. This also removes the night-before carry (#379): a game set up
  Friday night is asked about on Saturday like any other, and Move to today is
  how the coach keeps it. When filing builds a fresh day for an empty one, that
  one empty game is replaced by Move to today rather than sitting beside the
  moved game. The minutes come from `effectiveMinutes`, never
  `plan.minutes`, so a hand swap in bench mode is counted as what happened.
  Archiving runs inside `undoable`'s mutation, after the snapshot, so Undo
  un-archives with no second code path, and it is idempotent by game id so
  nothing can be counted twice. The season is **history, not instruction**:
  unlike constraints, its minutes are not swept against the current roster,
  because a kid who left in November still played those minutes in October.
- **And it can be read, and corrected.** The **Season** view — opened from its
  own entry on Today (#23) — shows minutes this season per player, most
  behind first, then one collapsible row per game holding what everyone played
  in it, games grouped by day with the newest first. Game-first rather than a
  grid on purpose — twelve players by ten games is 120 cells, and at 390px a
  table of them either pans sideways or shrinks past reading, so it is two
  lists a phone can hold. Each list sits in the grouped cards Team and Settings
  use (`.pgrp` / `.prow`), and names are call names, the first-name form bench
  mode uses (#144). A ledger row is one line: its "2 games · 16 behind" note is
  visually hidden text a screen reader still reads. An id with no player on the
  roster is shown as *Left the team*, with a gray bar and minutes intact, which
  is what "history, not instruction" looks like on screen. Each filed game carries a
  **Remove this game**, through `undoable`: filing finishes whatever is in the
  day once it has passed, so a day nobody played still files a game, and this
  is the only correction path there is. No levels, ever — `test/leak.test.js` covers the
  Season view for the same reason it covers the card.
- **And it can be handed to someone else.** An **Export** button in the Season
  screen's header (visible only when a game is filed) writes those minutes as one
  wide CSV — `Player | Sep 14 vs Falcons | … | Total`, one row per player, one
  column per game — which is the shape a coach pastes into a parent email and
  the shape a league timesheet asks for, and the shape the Season view on screen
  cannot be. It is the Season view's
  twin, so it is built in `season-view.js` next to the wording it shares
  (*Left the team* included) rather than in `backup.js`; it borrows only the
  filename stamp and the `<a download>` from there, because a **report is not a
  backup** — nothing reads it back and it never goes near `sanitize`. Columns
  run oldest first, which is the one place it disagrees with the Season view: a
  spreadsheet reads left to right as time. **A player who was not at a game
  reads as an em dash, and a `0` means she was there and did not get on the
  floor** — a `minutes` map holds a key for everyone who was available, so the
  record already tells the two apart, and a blanket `0` credited a kid with
  turning up to games played before she joined the team and to games after she
  left. Her `Total` is still a number, and it still sums (Excel and Sheets skip
  a dash in a `SUM` exactly as they skip a blank). The count of games beside
  her name in the Season view is the same attendance, read from `seasonShare`, so
  the two surfaces cannot say different things about the same child. RFC 4180 quoting
  (opponents and team names are free text and one of them is eventually
  `Falcons, B`), CRLF, and a UTF-8 BOM so Excel on Windows renders *Tomás*
  rather than *TomÃ¡s*. **The header row is whitelisted by
  `test/leak.test.js`**: this is the one file that gets forwarded, so a column
  added "for completeness" fails the build rather than shipping a child's
  level to their parents.
- **And it can plan the next game.** *The season so far*, a choice in
  Make up minutes from (#563), opens each player's minute
  target adjusted by how far off their share of the season they are. It is an
  **input, not solver machinery**:
  everything it produces arrives as `constraints.targetMinutes`, which the
  engine has always taken, and nothing in `engine.js` changed for it.
  "Their share" is **attendance-weighted, one game at a time** — a filed game's
  share is its own mean, and a player is measured only against the games they
  were actually in. An equal split of the whole season across the roster would
  hand the kid who missed three games a claim on a game and a half of floor
  time, paid for by the kids who turned up; attendance is not a debt. What the
  weighting leaves is the unfairness the app itself creates: the remainder
  minutes stint arithmetic has to drop on somebody, week after week.
  It is a choice on the **Make up minutes from** row
  ([#563](design-decisions-make-up.md)), offered once a game is filed. Only the
  flags are stored: targets are re-derived on every `computeAll`, so turning it
  off restores the previous plan exactly.
  A **hand-set target and a lock are untouchable by construction**: it writes a
  target only where there is not one already, so the By hand strategy gets
  nothing (those sliders *are* the coach's targets), Platoon gets nothing (the
  groups are exact), and a locked row is left out of the pinned set entirely
  rather than handed a target — a target would pin it at 1000/min, and a
  suggestion must not be promoted to a promise on its way past one.
  A single game corrects by **at most two stints either way** — the same clamp
  the day carryover already uses — bounded by `minMinutes`/`maxMinutes` and the
  game itself, and if the numbers cannot be made to add up to the floor budget
  exactly the whole adjustment stands down rather than shipping targets the
  solver would stop honouring. "The season so far" **includes today's earlier
  games** (played minutes once a game has started, #572, else planned; after
  overtime, effective minutes, #368), or game 2 of a
  tournament would pay off a debt game 1 has already cleared.
  And it **says what it did**, under the row: the even share, then one line
  per player who is off it — *Marcus Webb opens at 24 min — 8 down on the
  season* — with *plays 8* beside the ask when whole stints cannot hit it. A
  number that moves with nothing joining it to a reason is the thing that makes
  a tool untrustworthy. The panel is its own repaint section (`seasonadj`),
  because it is the one thing in `rules.js` that depends on a solve.
- **A coach can take their record with them.** Local storage is not durable
  storage: WebKit evicts it after seven days without a visit (a home-screen
  install is exempt, a tab is not) and "clear history" takes it everywhere, so
  the **Benchcard** zone of Settings ends in a Backup group that writes the
  record to a JSON file and restores one. Restore *replaces* — player ids collide across two exports of
  the same record, so merging would double a roster rather than put it back —
  and its net is the nine-second undo toast, not a confirm dialog: removing a
  team is deliberately the only confirm in the app. The same picker is offered
  on the first-run screen, because eviction is exactly what lands a returning
  coach there holding a file, and both entry points also take a **paste**: a
  quiet link under the Restore control reveals a textarea, because a `.json` in
  an email attachment or in iCloud Drive is awkward to hand to a mobile file
  picker and that is the device this whole feature exists for. `readBackup`
  takes a string and never cared where it came from, so the paste path is the
  same parser, the same rejection and the same undo -- not a second import.
  `test/backup.test.js` pins the round trip as lossless over a fully populated
  record, and pins that there is exactly one of each; add a schema field and add
  it there.
