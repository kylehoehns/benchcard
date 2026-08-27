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
  `teams[].settings` (schema v6) is how a team wants its plans made, as opposed
  to what happens in one game — a league rule set for one squad must never land
  on the other. A record written before it existed simply has no block, which
  `sanitize` reads as today's defaults, so there is still no version branch
  anywhere in `storage.js`: the shape *is* the migration, which is what keeps it
  idempotent and what lets a backup file from an older build import for free.
  Older keys are read, never written, so a coach whose service worker has not
  updated still finds the record their code expects. The block holds exactly the
  keys something honours — a key nothing reads is a claim the app does not keep
  in a file a coach can open. A second team **copies** the first's settings on
  create rather than inheriting them: one league is the common case, and a link
  would be a second thing to explain and to get wrong when a team is removed.
- **The game format default loses to the clone, on purpose.** `settings.periods`
  and `settings.periodMinutes` (4 and 8 = the literals `newGame` always carried)
  are read by `newGame` **only when there is no game to clone from**. The format
  was already sticky — `newGame` deep-copies it off the game it clones, and
  every "+ Game" and "New day" hands it `lastGame()` — so a default that won
  over the clone would snap game 2 of a tournament day back off the odd format
  a coach had just set. The default therefore earns its keep somewhere else:
  `newTeam`'s first game and `sanitizeTeam`'s no-games fallback pass the
  settings through, which is the one place the app used to guess 4×8 at a coach
  whose league is not, and `addTeam` already copies the settings block. It never
  reaches the solver and it is deliberately **not** in the plan signature — the
  game's own `periods`/`periodMinutes` already are, so putting it there would
  re-solve the day for nothing. Substitution granularity is deliberately not a
  setting: it is a preference rather than a league rule, and it lives with the
  period shape in the **Game format** block. That block used to be inside the
  fold labelled *Rules*, shut and below the rotation — which reads as the
  player rules, so a coach looking for "two halves of twenty minutes" never
  opened it. Rules now holds only the player rules; its collapsed summary
  carries the format in words (`2 × 20 min`) so the answer is visible without
  opening anything.
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
  coach taps **New day** *and its plan solved*: there is deliberately no
  "Finish game" button, because the bug being fixed is that a coach loses a day
  without ever being asked, and an answer that only works when they remember to
  press something reproduces it for the coach who is busiest. `plan.ok` is the
  one honest signal available with no UI — a game that never produced a
  rotation was never played — and deleting a game beforehand already takes it
  out of the day. The minutes come from `effectiveMinutes`, never
  `plan.minutes`, so a hand swap in bench mode is counted as what happened.
  Archiving runs inside `undoable`'s mutation, after the snapshot, so Undo
  un-archives with no second code path, and it is idempotent by game id so
  nothing can be counted twice. The season is **history, not instruction**:
  unlike constraints, its minutes are not swept against the current roster,
  because a kid who left in November still played those minutes in October.
- **And it can be read, and corrected.** The **Season** view — the third nav
  tab — is the ledger over that record: minutes this season per player,
  most first, then one collapsible row per game holding what everyone played in
  it. Game-first rather than a grid on purpose — twelve players by ten games is
  120 cells, and at 390px a table of them either pans sideways or shrinks past
  reading, so it is two lists a phone can hold. An id with no player on the
  roster is shown as *Left the team*, hollow dot and minutes intact, which is
  what "history, not instruction" looks like on screen. Each game carries a
  **Delete this game**, through `undoable`: "New day" finishes whatever is in
  the day, so tapping it twice files a game nobody played, and this is the only
  correction path there is. No levels, ever — `test/leak.test.js` covers the
  ledger for the same reason it covers the card.
- **And it can be handed to someone else.** *Save a spreadsheet* at the top of
  the Season box writes the ledger as one wide CSV — `Player | Sep 14 vs
  Falcons | … | Total`, one row per player, one column per game — which is the
  shape a coach pastes into a parent email and the shape a league timesheet
  asks for, and the shape the ledger on screen cannot be. It is the ledger's
  twin, so it is built in `season-view.js` next to the wording it shares
  (*Left the team* included) rather than in `backup.js`; it borrows only the
  filename stamp and the `<a download>` from there, because a **report is not a
  backup** — nothing reads it back and it never goes near `sanitize`. Columns
  run oldest first, which is the one place it disagrees with the ledger: a
  spreadsheet reads left to right as time. **A player who was not at a game
  reads as an em dash, and a `0` means she was there and did not get on the
  floor** — a `minutes` map holds a key for everyone who was available, so the
  record already tells the two apart, and a blanket `0` credited a kid with
  turning up to games played before she joined the team and to games after she
  left. Her `Total` is still a number, and it still sums (Excel and Sheets skip
  a dash in a `SUM` exactly as they skip a blank). The count of games beside
  her name in the ledger is the same attendance, read from `seasonShare`, so
  the two surfaces cannot say different things about the same child. RFC 4180 quoting
  (opponents and team names are free text and one of them is eventually
  `Falcons, B`), CRLF, and a UTF-8 BOM so Excel on Windows renders *Tomás*
  rather than *TomÃ¡s*. **The header row is whitelisted by
  `test/leak.test.js`**: this is the one file that gets forwarded, so a column
  added "for completeness" fails the build rather than shipping a child's
  rotation level to their parents.
- **And it can plan the next game.** *Even out the season so far*, a switch in
  the Rules section, opens each player's minute target adjusted by how far off
  their share of the season they are. It is an **input, not solver machinery**:
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
  target only where there is not one already, so the Minutes strategy gets
  nothing (those sliders *are* the coach's targets), Platoon gets nothing (the
  units are exact), and a locked row is left out of the pinned set entirely
  rather than handed a target — a target would pin it at 1000/min, and a
  suggestion must not be promoted to a promise on its way past one.
  A single game corrects by **at most two stints either way** — the same clamp
  the day carryover already uses — bounded by `minMinutes`/`maxMinutes` and the
  game itself, and if the numbers cannot be made to add up to the floor budget
  exactly the whole adjustment stands down rather than shipping targets the
  solver would stop honouring. "The season so far" **includes today's earlier
  games** (as planned minutes, the same choice `cum` makes), or game 2 of a
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
- **The stance on that tie is the coach's, and it is the one place a level may
  move a minute.** `settings.tieBreak` is `'behind'` (the default, and exactly
  what the app did before it existed) or `'levels'`. Because the engine reads
  `priority` for its ORDER alone and is deliberately never told what the number
  means, the stance is composed in `state.js` -- `tier * 1000 + deficit` -- and
  `engine.js` is not involved in the choice at all. Two properties make it safe
  to leave on a settings page: a roster with no levels set is every tier equal,
  so `'levels'` solves *identically* to `'behind'`; and `applyTieBreak` already
  excludes anyone the coach has spoken for, so a floor, a cap, a lock or a
  hand-set target still outranks it. The claim in the `SPREAD_FLOOR` line
  follows what actually separated the two groups, and the roster page's level
  note stops saying the share is worked out without levels when it is not --
  copy that is false in a state the app can be in is why the option is opt-in
  rather than a weight folded into the default.
- **Players carry generated ids.** Constraints, availability and carryover all
  key off the id, never a roster position. With positional ids, fixing a typo or
  deleting a player mid-tournament silently reattached Kade's cap to Aaron and
  rebalanced the rest of the day against it, with nothing on screen to show
  anything had gone wrong. Deleting a player sweeps every reference to them
  across every game.
- **An explicit short name beats the derived one**, and auto-derivation dodges
  the overrides as well as the other auto names -- otherwise overriding one Jack
  to `JACK` silently collides with `Jackson`.
- **Short names are a card constraint, not a naming scheme.** Five letters exist
  so five columns fit a pocket card. Everywhere with room for the real name uses
  it -- including the timeline, whose rows put the name above a full-width bar
  and which read `AUST` until 2026-08-24 while already announcing "Austin
  Schumacher" to a screen reader; `tlName` in `timeline.js` is the single answer
  now, and it prefers the full name. Game mode's next-sub call -- the line the coach shouts -- uses `callNames()`
  in `roster.js`: first names, plus a last initial when two available players share
  one (the full name if even that collides). It drops back to the short names only
  when a call row would wrap, and then both rows drop together so the block never
  mixes the two.
- **Plans are recomputed, not stored.** The engine is deterministic, so inputs
  plus a stored `seed` reproduce a card exactly. That gives the stability that
  matters (a refresh cannot change a card you already printed) without a cache
  to invalidate. Shuffle just rolls a new seed.
- **A new game inherits the tournament-level setup** from the previous one:
  format, substitution interval, who is at the gym, and all constraints. Only
  the opponent, the tip time and the seed are per-game. The inherited
  constraints are deep-copied -- sharing the object would let an edit on game 2
  silently rewrite game 1's plan and therefore the whole day's carryover.
  "New day" keeps the format (you play the same league every week) but clears
  absences.
- **The team name is the fallback identity, not a decoration.** Asked for once
  at onboarding and editable on the roster page, it heads the card when a game
  has no opponent (where a generic `ROTATION` used to sit) and stands in as the
  day-title placeholder. It is stored raw and trimmed at every read, so typing
  a space does not fight the caret. The card header clamps it: `.when` never
  shrinks, so a long name cannot push the date off the card, and the title
  itself elides through `fitHeadline` in `card.js` — the same middle cut the
  tabs use (`elideMiddle`), for the same reason: printing a day of tournament
  games gave three cards the identical header `VS RIVERSIDE REGIONAL TOURNAMENT
  QUART…`. Unlike the tabs it is sized by measurement, not a character count,
  because a pocket card and a half-sheet have very different header widths and
  the half-sheet usually fits the whole label. The date and the `Q1-Q2` scope
  are never elided, and the CSS `text-overflow: ellipsis` on `.opp` stays as
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
  format, but under a strategy that is by definition not optimising minutes it
  reads as an accusation.
- **Everyone plays before halftime, and it is a default rather than a setting.**
  Even *totals* were never the whole promise: a kid who does not start, sits a
  period and then plays one has the same number on the card and a different
  afternoon. Measured across 2,880 plans, 4.4% of players got their first
  minutes at or after the break and one plan in four had at least one of them;
  a flat 200-per-late-player term in `cost()` takes that to 1.7% and one plan in
  thirteen, with the minute spread and the solve time unmoved (the fix comes out
  of the minute-neutral exchange move, not out of anyone's total). It is not a
  control because the coach already has two — minimum minutes, and the out list.
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
- **Local search needs two move types.** A single in-for-out swap shifts both players' minute totals, so once minutes are even it can never improve pairing or sit patterns without breaking balance. The minute-neutral exchange move (trade two players' places across two stints) is what makes pair constraints reachable.
- **Pairs are soft by default** (`hardPairs: true` to force). Requiring two players together every stint fights even minutes hard; the plan maximizes shared floor time and reports it as "together 20 of a possible 20 minutes".
- **Infeasibility is arithmetic, checked before any search**, so the message can name the offending constraint and the numbers.
- **Subs are held to 1-3 per stint** so there is continuity on the floor.
