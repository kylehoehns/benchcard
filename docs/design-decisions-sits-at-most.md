# Design decisions: Sits at most and the bench run

Split out of [design decisions](design-decisions.md), which has a size limit.
The same rule applies: a decision is kept with its alternative.

The short entries in design-decisions.md point here. Overtime and late
arrivals were decided in #537, #540 and #541; their entries are at the end.

## Sits at most N in a row

- **Sits at most N in a row is the bench twin of that limit (#441).** The
  stored key is `maxBench`, 1 to 4 stints, default 2. The engine counts a bench
  run with the same counter it uses for a play run, read the other way round
  (`runEndingAt` and `longestRun` take an `on` flag), so there is one run
  counter, not two. The search treats a kid whose bench run has reached the
  limit as due on, in regulation (see [Overtime](#overtime)): the greedy pass
  brings them in when the other rules allow,
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

## The bench run across a re-plan

- **The bench run counts across a re-plan too.** `resolveRest` builds
  `sitBefore` from the same lead list as `streakBefore`, so a kid who has
  already sat brings that run into the re-plan. It reads the same counted stints
  as the notes (`sitStints`, see [Overtime](#overtime) and
  [A late arrival](#a-late-arrival)), so a late kid's run starts after the stint
  they walked in during. `sitBefore` is only built when the rule is on, so a plan
  without it is unchanged. Pinned overtime fives win over the rule, as they do
  over Plays at most, and the rule is not checked inside one. After a swap,
  `BENCH_EXCEEDED` is rebuilt from the fives on screen (#534).

## Overtime

- **Overtime neither counts toward Sits at most nor resets it (#541).** Overtime
  is always planned after regulation (`buildStints`), so "does not count" and
  "does not reset" are the same thing: the count is over the regulation stints.
  `benchSpan(stints)` in `engine.js` is the number of stints before the first
  overtime stint, or all of them when there is none. Every bench-run count in
  the engine reads it, and `sitStints` in `state.js` cuts to it, so the warning,
  the Longest sit note, the timeline detail's Longest sit, `resolveRest`'s
  `sitBefore` and the solver all count the same stints.
- **The option not taken was to count overtime.** That is what the engine did
  before #541. It warned a kid who sat at the end of regulation and again in
  overtime, and it pushed the planner to bring a kid on in overtime to meet a
  limit that was never set for overtime. The rule is about how long a kid sits
  in a row, and overtime is extra time the limit was never set for.
- **The On the bench column still lists who sits in overtime.** It is a list of
  who is on the bench at each stint, not a count of sits, so it keeps the
  overtime stints. The rule above is for counts only.
- **Not changed:** the full-period credit (overtime never counted for it), and
  Plays at most N in a row, which still counts into overtime (#442).

## A late arrival

- **A kid is not sitting before they walk in (#537).** `benchStints(g, p)` is
  `effectiveStints` with a late kid's `sitting` taken off for every stint up to
  and including the one they walked in during, as `live.arrived` records it. It
  returns `effectiveStints`'s array untouched when nobody is late. The On the
  bench column reads it, and so does every sit count through `sitStints`.
  The timeline detail and the sit-in-a-row warning are covered by the same cut.
- **The option not taken was a fresh `lateArrivals` call.** The two readings
  match after any re-plan, because every freeze already prunes the record with
  `lateArrivals` (`freezePlayedAndReplan`), which keeps a kid who did not play in a
  stint before the one they walked in during (playing in that stint is how a late
  kid starts). They differ in one case: a kid swapped
  on during the stint they walked in, before any re-plan. A #534 test pins that
  case to the record, so the record is the reading.
- **Fair shares and minimums are not changed.** `lateArrivals` still decides
  who is late for the league's share (#447). Only the sit count reads the
  record.
