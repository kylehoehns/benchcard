# Design decisions

The calls that were made, and what they were made against. A decision without
its alternative is an assertion, so the rejected options are kept here too.

## Design decisions

- **Minutes are formatted, never printed raw.** Stint lengths are legitimately
  fractional, so every surface that shows minutes goes through `fmtMinutes`.
- **A corrupt save must not cost the coach their roster.** There is no server to
  recover from, so `storage.js` validates and repairs what it can, keeps the
  previous good record as a one-write-behind backup, and falls back to it with a
  visible warning. The warning distinguishes the three ways the main record can
  fail — `loadState` returns `recoveredFrom: 'unreadable'` when there were bytes
  it could not turn into a record, `'missing'` when the key was simply gone, and
  `'incomplete'` when the key was there and readable and merely not a whole
  record — because telling a coach whose store was evicted that their save was
  "unreadable" invents a corruption that never happened, and calling a record
  that is sitting right there "missing" is no better.
- **An empty app is a state a coach can ask for, and the backup must not
  overrule it.** Removing the last team writes a complete record that says so:
  one team, no players, `onboarded: false`. `sanitize` is total — it coerces any
  object into a valid-looking record — so "it sanitized" cannot tell that record
  from junk, and emptiness is exactly what the two share. `loadState` asks
  instead whether the record is COMPLETE: the version this build stamps, a
  `teams` array with at least one team, and `onboarded` as an actual boolean.
  A record carrying all three is entitled to say the coach has no team; anything
  else still falls through to the backup and still raises the banner.
  Constraints pointing at deleted players are dropped rather
  than left dangling, duplicate ids are collapsed, out-of-range numbers are
  clamped, and unknown enum values fall back. A failed write surfaces instead of
  being swallowed — silently not saving is the worst possible outcome.
- **A team's settings belong to the team, and absent means the default.**
  `teams[].settings` (schema v7) holds both planning rules (`maxSubs`,
  `tieBreak` and the rest) and identity (`color` —
  the team's tint, #25). It is how a team wants its plans made, as opposed to
  what happens in one game — a league rule set for one squad must never land on
  the other. A record written before it existed simply has no block, which
  `sanitize` reads as today's defaults, so there is still no version branch
  anywhere in `storage.js`: the shape *is* the migration, which is what keeps it
  idempotent and what lets a backup file from an older build import for free.
  Older keys are read, never written, so a coach whose service worker has not
  updated still finds the record their code expects. The block holds exactly the
  keys something honours — a key nothing reads is a claim the app does not keep
  in a file a coach can open. A second team **copies** the first's settings on
  create rather than inheriting them, except for the color: one league is the
  common case, and a link would be a second thing to explain and to get wrong
  when a team is removed. The color is how two teams are told apart, so it
  starts at the default instead of copying. The `color` key has a fallback to
  the pre-#61 variant for records saved before #61 — a valid `color` wins, else
  a valid value from the old key, else hardwood.
- **The game format default loses to the clone, on purpose.** `settings.periods`
  and `settings.periodMinutes` (4 and 8 = the literals `newGame` always carried)
  are read by `newGame` **only when there is no game to clone from**. The format
  was already sticky — `newGame` deep-copies it off the game it clones, and
  every **Add a game** and every day's own fresh first game (`fileIfPast`, #100)
  hands it `lastGame()` — so a default that won
  over the clone would snap game 2 of a tournament day back off the odd format
  a coach had just set. The default therefore earns its keep somewhere else:
  `newTeam`'s first game and `sanitizeTeam`'s no-games fallback pass the
  settings through, which is the one place the app used to guess 4×8 at a coach
  whose league is not, and `addTeam` already copies the settings block. It never
  reaches the solver and it is deliberately **not** in the plan signature — the
  game's own `periods`/`periodMinutes` already are, so putting it there would
  re-solve the day for nothing. Substitution granularity is deliberately not a
  setting: it is a preference rather than a league rule, and it lives with the
  period shape. Both are set from the sentence at the top of the game (#27):
  the format phrase (`4 × 8`) opens a sheet with period and minute steppers,
  and the interval phrase opens the Sub interval sheet. The format was once a
  **Game format** block inside the fold labelled *Rules*, shut and below the
  rotation — which reads as the player rules, so a coach looking for "two
  halves of twenty minutes" never opened it. It then became its own fold, and
  is now a phrase the coach reads before touching anything.
- **A league minimum is a floor on the map the engine already reads.**
  `settings.minMinutes` (0 meaning off) is composed into each game's per-player
  `minMinutes` in `computeAll`, so `engine.js` never learns the setting exists —
  the same trick as the tie-break stance, and the reason neither cost a solver
  change. A minimum the coach set on one player wins when it is higher; their
  **cap wins when it is lower**, because a cap is a deliberate "hold this kid
  back" and raising past it would manufacture a `MIN_ABOVE_CAP` error nobody
  asked for. The engine's own arithmetic still gets to refuse: twelve players at
  fifteen minutes wants more floor-minutes than a 32-minute game has, and
  `MINS_UNSATISFIABLE` says so. One knock-on worth knowing —
  `MIN_OFF_STINT_BOUNDARY` is per player, so a league number that is not a whole
  multiple of the stint fired it once for everybody; `renderIssues` collapses
  the repeat, in the same place and for the same reason it drops Platoon's
  `SPREAD_FLOOR`.
- **"How many change at once" is a preference, and the plan says when it misses.**
  `repairChurn` holds the ceiling while a lineup is built, but the local search
  that follows charges 40 per extra change against 60 a minute off target — so
  when holding to the number would cost somebody minutes, the plan goes over.
  Measured across 160 scenarios it does in about one plan in nine at the default
  of 3. Rather than dress a preference up as a cap (or buy floor continuity by
  quietly paying in the minute evenness the whole app promises), the plan
  carries a `SUBS_EXCEEDED` warning naming the arithmetic, the same contract
  `CONSEC_EXCEEDED` has. Platoon is exempt: alternating whole fives is the
  strategy the coach asked for.
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
  takes it out of the day. Games that were never started, when nothing from the
  plan was ever played, are left out entirely rather than filing their planned
  minutes (#133). A day set up the night before and never started is not
  left out in the morning: while it is the latest past day and today has no day
  yet, it moves to today (`carryUnplayedDay`, #379), so the coach who set up and
  printed on Friday night gets the same game on Saturday. It carries with no
  toast and no Undo, because the plan does not change, and the only thing that
  moves is the date. Once any game in it is started, it files as above. The
  minutes come from `effectiveMinutes`, never
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
- **And it can plan the next game.** *Even out the season so far*, a switch in
  the Plan sheet's Across the season group (#28), opens each player's minute
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
  It is **off by default, per game, and not inherited by a new game** — a coach
  who has never finished a game never sees the switch at all. Nothing is
  written to the record but the one boolean: the targets are re-derived on
  every `computeAll`, so turning it off restores the previous plan exactly.
  A **hand-set target and a lock are untouchable by construction**: it writes a
  target only where there is not one already, so the By hand strategy gets
  nothing (those sliders *are* the coach's targets), Platoon gets nothing (the
  units are exact), and a locked row is left out of the pinned set entirely
  rather than handed a target — a target would pin it at 1000/min, and a
  suggestion must not be promoted to a promise on its way past one.
  A single game corrects by **at most two stints either way** — the same clamp
  the day carryover already uses — bounded by `minMinutes`/`maxMinutes` and the
  game itself, and if the numbers cannot be made to add up to the floor budget
  exactly the whole adjustment stands down rather than shipping targets the
  solver would stop honouring. "The season so far" **includes today's earlier
  games** (as planned minutes, the same choice `cum` makes; a game that went
  to overtime hands over its effective minutes instead, #368), or game 2 of a
  tournament would pay off a debt game 1 has already cleared.
  And it **says what it did**, under the switch: the even share, then one line
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
- **The stint shape comes from `buildStints`, never a local copy.** `app.js`
  briefly carried a hand-copied duplicate of `periodLengths`, tail-merge rule
  and all. Any drift between the two would have desynced the slot count the
  sliders allocate against from the stints the engine actually builds, silently
  corrupting the whole budget with no error anywhere.
- **Under "× / period", overtime is cut at the regulation stint length.** Each
  overtime period gets stints of `periodMinutes / n`, split with the same rule
  as "every N min": a tail shorter than half a stint folds into the stint before
  it. So a 2-minute overtime under 4 × 8 is one stint, not four. Regulation,
  every-N and breaks-only splits are unchanged.
- **Re-allocation uses Hamilton apportionment, not take-from-the-largest.**
  Repeatedly shaving the current maximum flattens the shape the coach dialled
  in: adding an 11th player to a roster with someone set to 32 minutes took all
  four surplus slots off that one player and reset them to average. Scale,
  floor, then hand leftovers to the largest fractional parts.
- **Move legality is re-checked against live state.** The local-search move
  generators are lazy, and an accepted move rewrites the lineup while they are
  still yielding. Without the re-check a stale move could swap in a player who
  was already on the floor — putting the same player on twice and silently
  fielding four.
- **The minute budget is modelled in stint SLOTS, not minutes.** A player's
  minutes are necessarily a whole number of stints, so integer slots make every
  value the coach can dial in exactly achievable -- there is no rounding, the
  budget always sums to the game, and dragging one slider redistributes the
  others one slot at a time so the total lands exactly on capacity.
- **A pinned lineup outranks the consecutive-stint limit.** If the coach names
  five players to close, they close; the fatigue limit is a heuristic and
  yields, with the over-run reported. In practice the local search rests the
  closing group ahead of its window and neither has to give.
- **A Plays at most N in a row limit that cannot hold is caught before the search (#439).** The
  limit (`maxConsecutive`) is the most stints anyone may play in a row.
  Any `r+1` stints in a row must give every player a sit, and those stints
  have only `(r+1) x (n-5)` bench seats, so the limit can hold only when
  `(r+1) x (n-5) >= n`. `analyzeFeasibility` checks that with arithmetic,
  no search. If it fails, one `CONSEC_TOO_FEW` line names the players the
  limit needs, `ceil(5(r+1)/r)`, and the smallest limit that holds with the
  players present, `ceil(5/(n-5))`, or says to turn the limit off when that
  number is not shorter than the game. With fewer than `r+1` stints the limit
  cannot bind, so nothing is checked. A minimum the limit makes impossible
  gets one `CONSEC_MIN_CONFLICT` line naming every player it hits, unless
  a minimum is already refused outright. The most minutes a player can reach
  under the limit comes from an exact DP over the stint lengths, and the
  minimum still wins, as it always has. A player named by
  `CONSEC_MIN_CONFLICT` gets no per-kid `CONSEC_EXCEEDED`, and nobody does
  when `CONSEC_TOO_FEW` or `CONSEC_IMPOSSIBLE` is present. Where the search
  still runs past the limit, an overrun costs its square, so one long run
  costs more than the same overrun spread out. A break counts as forced when
  more players than the number asked for reached the limit and came off
  there; when every over-number break is forced, `SUBS_EXCEEDED` names the
  rule that forced more of them instead of blaming minutes. On a tie that is
  Plays at most.
- **The old Rest limit is now Plays at most N in a row (#441).** The name
  "Rest limit" sounded like a bench limit, and it caps play, so the coach-facing
  name changed. The stored key stays `maxConsecutive`, so a team saved under
  the old name loads unchanged.
- **Sits at most N in a row is the bench twin of that limit (#441).** The
  stored key is `maxBench`, 1 to 4 stints, default 2. The engine counts a bench
  run with the same counter it uses for a play run, read the other way round
  (`runEndingAt` and `longestRun` take an `on` flag), so there is one run
  counter, not two. The search treats a kid whose bench run has reached the
  limit as due on: the greedy pass brings them in when the other rules allow,
  and `repairChurn` does not swap them back out. Each stint past the limit costs
  `over x over x 400`, the same shape as the play limit, so one long sit costs
  more than the same overrun split up.
- **A Sits at most limit that cannot hold is said up front, in one of two lines
  (#441).** `BENCH_TOO_FEW` means the rule is impossible: each kid needs
  `ceil((S - m) / (m + 1))` stints on, where S is the stints and m the limit,
  and five seats a stint cannot cover everyone. It replaces the after-the-fact
  `BENCH_EXCEEDED`, the way `CONSEC_TOO_FEW` replaces `CONSEC_EXCEEDED`.
  `BENCH_SUBS` means the rule can hold, but only by changing more players at
  once than the change limit allows, so the plan changes more and says so. It
  replaces `SUBS_EXCEEDED` for that case and does not suppress
  `BENCH_EXCEEDED`. When both would apply, `BENCH_TOO_FEW` is the one said.
  Platoon gets no `BENCH_SUBS`, as it gets no `SUBS_EXCEEDED`. Neither is said
  with 5 or fewer available, because nobody sits.
- **The bench run counts across a re-plan too.** `resolveRest` builds
  `sitBefore` from the same lead list as `streakBefore`, so a kid who has
  already sat brings that run into the re-plan. A late arrival counts from the
  stint they walked in. `sitBefore` is only built when the rule is on, so a plan
  without it is unchanged. Pinned overtime fives win over the rule, as they do
  over Plays at most, and the rule is not checked inside one.
- **Plays at most N in a row counts across a re-plan and into overtime (#442).**
  `resolveRest` hands the engine `streakBefore`: each player's run ending at
  the cut (stints played, from `effectiveStints`, plus pinned overtime fives
  before the first open stint). The engine's `longestRun` / `runEndingAt`
  add it to a run that starts at the first stint solved, so the search, the
  `CONSEC_EXCEEDED` note and the `SUBS_EXCEEDED` attribution all see it.
  Absent, plans are unchanged. The `CONSEC_EXCEEDED` note is in
  `resolveRest`'s issues, which bench mode's Sit for the rest and swap paths
  show; the freeze re-plan (overtime added, roster change underway) does not
  surface re-plan issues today (#456).
- **A pin is held over a cap, or refused up front, never dropped quietly
  (#436).** A kid named in the starting five, in a Starts the last period rule or the
  closing group is on the floor for those stints. The greedy pass keeps back
  the minutes a kid is pinned to from their cap before it spends that cap
  elsewhere. The local search charges 1000 a minute for each pinned minute a
  kid is off the floor. If a cap cannot cover a kid's pinned minutes,
  `PINS_OVER_CAP` refuses the plan and names the kid. If the players pinned to
  one stint are more than five, `FORCED_GROUP_TOO_BIG` refuses it, even when
  the extra players come from two different groups. Two players set Apart who
  are pinned to the same stint are refused the same way by `FORCED_GROUP_AVOID`,
  again across groups. `buildForced` is the one place that decides which stints
  each group pins; feasibility, the greedy pass and `finish()` all read it. A
  pin the search still misses is a warning, one per group, naming everyone it
  missed (`OPENING_MISSED`, `LAST_PERIOD_MISSED`, `CLOSER_MISSED`). Platoon
  applies no pins, so none of this applies to it.
- **A re-plan drops the pin it cannot hold, says so, and leaves the past alone
  (#437).** A re-plan of the remaining stints (a late arrival, a kid marked
  Out, a Who's here change, a Shuffle) can meet a kid whose Plays at most
  minutes are used up while they are fixed to a stint. The engine refuses that
  with `PINS_OVER_CAP` or `FORCED_OVER_CAP` and names the kid. `resolveRest`
  then takes exactly those kids off Starts the last period and the closing
  group, solves again, and adds one `PIN_CAP_USED` warning per kid. If the
  solve still refuses, `replanRest` retries once with every fixed group
  cleared, and records the available kids it stopped holding. Only when that
  also refuses does the #134 whole-game fallback run. Stints already played are
  never written either way. The coach hears this once, appended to the toast the
  change already raises: "Not enough minutes left to keep {names} fixed to a
  stint." for a dropped pin, and "Could not keep {names} fixed to a stint." when
  the retry was needed. A **This stint** swap and **Sit for the rest** call
  `resolveRest` directly rather than `replanRest`, and their own toasts add the
  same first sentence when a pin is dropped. By hand and Platoon never reach this path, because `resolveRest`
  refuses them, so they still fall back to #134 and can rewrite played stints.
  That is follow-up #489.
- **A pinned overtime five that breaks a rule is kept and reported (#440).**
  The coach asked for that five by name, so a rule does not reshape it. The
  plan says so instead, with a `PIN_BREAKS_RULE` warning naming the kids and
  the rule ([planning-strategies.md](architecture/planning-strategies.md)).
  Refusing would take away a choice the coach made, and dropping it quietly
  would hide it. Together and both in-a-row limits (Plays at most N in a row, Sits at
  most N in a row) are not checked inside a pinned overtime.
- **A coach's minute target is a pin, not a preference.** It survives caps and
  tournament carryover; everyone else water-fills the remaining floor-time.
- **Somebody has to play the odd stint, so it is decided out loud.** When the
  floor-minutes do not divide, `generatePlan` takes a `priority` map -- one
  number per player, highest first -- and nudges the free targets along a ramp
  spanning a tenth of a minute either way. `state.js` fills it with `deficitOf`,
  which is the season deficit where a season exists and reduces to "who has
  played least so far today" where it does not; all zeroes and the engine falls
  back to a seeded rotation. The nudge's largest possible swing anywhere in the
  cost function is 12, under the 20 a missed sub is worth and two orders of
  magnitude under a floor, a cap or a lock, so it decides only what nothing else
  has an opinion about. It is an input, not a cost term: the objective is
  untouched. A stable-arbitrary tie-break was rejected because the same child
  lands short every week by roster position. The `SPREAD_FLOOR` line names who
  pays and `state.js` appends why, so the coach can answer it per player with a
  lock or a hand-set target instead of a global preference.
- **The stance on that tie is the coach's, and it is the one place in a game's
  regulation where a level may move a minute.** The only other is an overtime
  the coach set to Strongest five ([ADR 0001](adr/0001-level-picks-the-overtime-five.md)). `settings.tieBreak` is `'behind'` (the default, and exactly
  what the app did before it existed) or `'levels'`. Because the engine reads
  `priority` for its ORDER alone and is deliberately never told what the number
  means, the stance is composed in `state.js` -- `tier * 1000 + deficit` -- and
  `engine.js` is not involved in the choice at all. Two properties make it safe
  to leave on a settings page: a roster with no levels set is every tier equal,
  so `'levels'` solves *identically* to `'behind'`; and `applyTieBreak` already
  excludes anyone the coach has spoken for, so a floor, a cap, a lock or a
  hand-set target still outranks it. The claim in the `SPREAD_FLOOR` line
  follows what actually separated the two groups, and the level note in the
  player sheet stops saying the share is worked out without levels when it is
  not --
  copy that is false in a state the app can be in is why the option is opt-in
  rather than a weight folded into the default.
- **Players carry generated ids.** Constraints, availability and carryover all
  key off the id, never a roster position. With positional ids, fixing a typo or
  deleting a player mid-tournament silently reattached Kade's cap to Aaron and
  rebalanced the rest of the day against it, with nothing on screen to show
  anything had gone wrong. Deleting a player sweeps every reference to them
  across every game (`removePlayer` in `team-ops.js`).
- **An explicit short name beats the derived one**, and auto-derivation dodges
  the overrides as well as the other auto names -- otherwise overriding one Jack
  to `JACK` silently collides with `Jackson`.
- **Short names are a card constraint, not a naming scheme.** Five letters exist
  so five columns fit a pocket card. Everywhere with room for the real name uses
  it -- including the timeline, whose rows put the name above a full-width bar
  and which read `AUST` until 2026-08-24 while already announcing "Austin
  Schumacher" to a screen reader; `tlName` in `timeline.js` is the single answer
  now, and it prefers the full name. Bench mode's next-sub call -- the line the coach shouts -- uses `callNames()`
  in `roster.js`: first names, plus a last initial when two available players share
  one (the full name if even that collides). It drops back to the short names only
  when a call row would wrap, and then both rows drop together so the block never
  mixes the two.
- **Public pages always carry Hardwood orange, not the saved team color.** `about.html`,
  `advanced.html` and the eight generated chart pages are reachable from search
  results and may be visited by someone with no team saved locally. They use
  Hardwood styling (the orange button, links and phrases) so a visitor sees
  Benchcard's own warmth rather than a gray template. The mapping of `--accent*`
  to `--tint*` lives once, in `app/site.css`, so in-app elements that read the
  accent stay Hardwood while the app itself honors a saved Graphite or other
  color in-game.
  The welcome screen uses `--tint*` directly, so a saved non-Hardwood color stays
  honest there too.
- **Plans are recomputed, not stored.** The engine is deterministic, so inputs
  plus a stored `seed` reproduce a card exactly. That gives the stability that
  matters (a refresh cannot change a card you already printed) without a cache
  to invalidate. Shuffle just rolls a new seed.
- **A new game inherits the tournament-level setup** from the previous one:
  format, Sub interval, who is at the gym, and all constraints. Only
  the opponent, the tip time and the seed are per-game. The inherited
  constraints are deep-copied -- sharing the object would let an edit on game 2
  silently rewrite game 1's plan and therefore the whole day's carryover.
  A fresh day's own first game (`fileIfPast`, #100) keeps the format (you play
  the same league every week) but clears absences. The copy itself did not
  change when #32 put a three-step flow in
  front of it ([`architecture/interface.md`](architecture/interface.md)); what changed is that the coach is
  shown what is being inherited and can take it in one tap, instead of finding
  out on the game screen.
- **The team name is the fallback identity, not a decoration.** Asked for once
  at onboarding and editable in Settings, under the team's own name (#22 moved
  it off the roster page), it heads the card when a game
  has no opponent (where a generic `ROTATION` used to sit) and stands in as the
  day-title placeholder. It is stored raw and trimmed at every read, so typing
  a space does not fight the caret. The card header clamps it: `.when` never
  shrinks, so a long name cannot push the weekday and tip-off (`cornerLabel`,
  #103) off the card, and the title
  itself elides through `fitHeadline` in `card.js` — the same middle cut
  squad pills use (`elideMiddle` in `state.js`), for the same reason: printing a day of tournament
  games gave three cards the identical header `VS RIVERSIDE REGIONAL TOURNAMENT
  QUART…`. Unlike the tabs it is sized by measurement, not a character count,
  because a pocket card and a half-sheet have very different header widths and
  the half-sheet usually fits the whole label. The weekday/tip-off corner and
  the `Q1-Q2` scope are never elided, and the CSS `text-overflow: ellipsis`
  on `.opp` stays as
  the backstop for the frame before the webfont lands.
- **Games chain within a day.** Game N is planned against the minutes actually
  assigned in games 1..N-1, so a kid who sat out game one gets caught up. The
  credit is clamped to +/- 2 stints so one absence cannot hand someone an entire
  later game.
- **Carryover suppresses the fairness messaging.** With carryover on, an uneven
  game is the point -- the target is an even day, not an even game -- so the
  single-game "best possible spread" benchmark is wrong and gets replaced by an
  explanation of who is being caught up. Platoon suppresses the same benchmark,
  in the view rather than the engine: the number is still correct about the
  format, but under a strategy that is by definition not optimizing minutes it
  reads as an accusation.
- **Everyone plays before halftime, and it is a default rather than a setting.**
  Even *totals* were never the whole promise: a kid who does not start, sits a
  period and then plays one has the same number on the card and a different
  afternoon. Measured across 2,880 plans, 4.4% of players got their first
  minutes at or after the break and one plan in four had at least one of them;
  a flat 200-per-late-player term in `cost()` takes that to 1.7% and one plan in
  thirteen, with the minute spread and the solve time unmoved (the fix comes out
  of the minute-neutral exchange move, not out of anyone's total). It is not a
  control because the coach already has two — minimum minutes, and Who's here.
  The term is level-blind, so it runs in both search passes without a rotation
  level reaching a single total.
  **`maxSubs` governs it.** The first stint seats five and every break after it
  seats `maxSubs` more, so `halfReach = 5 + maxSubs x (stints before halftime -
  1)` is the most that can be got on early without overriding a number the coach
  set by hand on a page that displays it. Past that the app's own default yields
  and says so: `HALF_LATE` names who is still waiting, gives the arithmetic, and
  offers the second lever only when lifting it would help. That governance is
  why `maxSubs` was exposed to the coach before this shipped, and it is what
  keeps `SUBS_EXCEEDED` at exactly its 11.3% baseline across the same 160
  scenarios. Platoon is exempt for the `SUBS_EXCEEDED` reason: the units and
  their order are the coach's.
- **Fairness is scored against water-filled per-player targets**, not raw max-minus-min. A capped player otherwise anchors the minimum and blinds the optimizer to real imbalance among everyone else. `spreadUnconstrained` is the number that actually tells you if the rotation is fair.
- **Local search needs more than one move type.** A single in-for-out swap shifts both players' minute totals, so once minutes are even it can never improve pairing or sit patterns without breaking balance. The minute-neutral exchange move (trade two players' places across two stints) is what makes pair constraints reachable. A hard pair needs a third, the paired move, because one swap cannot seat or bench both players at once: it moves the two as one.
- **Pairs are soft by default** (`hardPairs: true` to force). Requiring two players together every stint fights even minutes hard; the plan maximizes shared floor time and reports it as "together 20 of a possible 20 minutes". A hard pair costs even minutes only when no even plan keeps the pair together: the search has a move that seats, benches or trades the pair as one.
- **Infeasibility is arithmetic, checked before any search**, so the message can name the offending constraint and the numbers.
- **Subs are held to 1-3 per stint** so there is continuity on the floor.
- **A sit for the rest is a fact about the game, not only about its stints.** Sitting a kid writes their later stints as overrides, but every later re-plan (an arrival, a Who's here change, a Shuffle, overtime, a hand-off) plans afresh, so the sit used to vanish on the next one. The sit is now also recorded as `live.sat`, and every re-plan leaves those kids out. No "Back in" control was added: Undo and Back to the printed plan are the way back, and that button stays on screen while a sit stands. A re-plan cannot refuse over a short bench, because the arrival or change has already happened. So when leaving the sat kid out would leave fewer than five, that one solve puts them back for the fifth seat, the sit stays recorded, and the coach is told once. The mechanics are in [bench-mode.md](architecture/bench-mode.md).
- **A hand-off link carries a live copy, not a link between phones.** The
  assistant's phone receives a complete working copy of the game and its roster
  and can edit it freely. The two phones are not synchronized afterward, so
  edits on either one diverge from the other. Syncing would need a server or
  accounts, and Benchcard has neither.
- **Only call names travel, never full names.** Each kid travels as the name
  bench mode calls them by (`callNames` in `roster.js`): first name, or first
  name plus last initial when two kids share a first name. The 5-letter card
  abbreviations are re-derived on the receiving phone, as they are everywhere
  else. This keeps the shortest unique names in the URL without duplicating the
  shortening logic.
- **The roster the phone already has is kept.** Teams are matched by id. If the
  receiving phone has the team, its own roster stands — full names, levels and
  everything else stay — and players from the link that are not on the phone
  are added by their call name. A kid on the phone keeps their full name and
  level whatever the link carries. The link carries the game's label and
  tip-off time (#379), so a game the phone did not have takes them. When the
  phone already has the game, its own label and tip-off time are kept
  (#377).
- **Re-opening a link does not wipe a game that is further along, and does not
  file a game twice.** The link is a snapshot from when it was sent, so an old
  one would undo the coach's swaps and stints without warning. Three cases:
  - **The season already has the game** (it was filed when its day passed). The
    link changes nothing: the phone does not switch team, open a game or carry
    anything. It says `You already filed this game.` and stays where it was.
  - **The phone has the game, not yet filed, and its copy is further along.**
    The phone keeps it and opens it. "Further along" is checked in order:
    the phone finished and the link did not, keep the phone's; the link
    finished and the phone did not, import the link's; otherwise more played
    stints wins; with equal stints, more hand swaps on the phone keeps it;
    anything else imports the link's game.
  - **The link's game replaces the phone's.** It gets an Undo toast reading
    `<team> game updated.`. If the game has started (finished, or with a stint
    played), it takes the link's date: the day it was played. The night-before
    carry (#379) can move an unstarted game onto today, so without this a
    started game could sit on the wrong day. A passed day then files under the
    played date, so both phones show the game in the same place. An unstarted
    game keeps the phone's day.

  A game the phone did not have imports with no Undo, as before.
- **New link fields do not bump the link's version.** The day date, label and
  tip-off are added without changing the version, which stays `1`. A link from
  before #379 has no date and imports as today. A link from #379 opened on a
  phone from before it ignores the unknown date, because a bump would make every
  phone that has not updated call a new link damaged. The prefix still names
  the version, so a breaking change later can bump it.
- **The link is sent as a URL fragment, never the path or query.** The plan
  travels in the part of the URL after `#`, which browsers never send to a
  server. This keeps the privacy claim true — a roster never reaches a server —
  at no cost to the coach: the QR code encodes the same link Share hands out.
  Anyone who has the link can open it, so the sheet lists the names it carries
  and says so before the coach shares.
- **A dead URL gets a real 404, not the app shell.** Rewriting every unknown
  path to `index.html` would make a mistyped link look like a working page with
  nothing to say it went wrong. The 404 page says so, returns status 404, and
  links home and to the rotation chart pages. Offline the shell still answers,
  because the app runs from `localStorage` and a coach with no signal is better
  served by it than by an error.
- **www is redirected by the Worker, configured in the repo.** The alternative
  was a redirect set by hand in the Cloudflare dashboard. A dashboard setting is
  invisible to this repo and can be lost on a deploy, the same reason the
  `/e` rate limit lives in `wrangler.jsonc`. The Worker runs for every request
  (`run_worker_first`) so the redirect sees www before the asset layer does. The
  price is a Worker invocation per request; `docs/operations.md` § Deployment
  has the rest.
