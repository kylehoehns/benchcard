# Design decisions: Together strength (#568)

Split out of [design decisions](design-decisions.md), which has a size limit.
The same rule applies: a decision is kept with its alternative.

#568 replaces the one game-wide **Force Together** switch with a strength on
each Together rule. Add a rule also sorts its seven kinds under three headings.

## The two strengths

A Together rule is stored one of two ways:

- **As much as possible** (the default) is `[a, b]`. A split pair costs 25 a
  minute, so the plan keeps the two together when even minutes allow it and
  splits them when they do not.
- **Always** is `[a, b, true]`. A split pair costs 400 a minute. The search can
  move the pair as one, the pair counts toward `PAIR_CHAIN_APART`, and the two
  info notes about tied players apply to it. Those notes only ever name Always
  pairs.

## Choices

- **The strength is a third field on the pair, not a new key.** Alternative: a
  `strength` key on the constraints, or an object per pair. Not done: every
  reader already destructures `[a, b]` or calls `includes`, so they keep
  working. Removing a rule or a player removes its strength with it. `avoids`
  and `keepOnFloor` stay strictly two ids.
- **A third field other than `true` is dropped, and the rule is kept soft.**
  Alternative: refuse the rule. Not done: a junk field should not cost the coach
  a rule they can see in the list.
- **The old switch is copied onto the rules, then removed (`sanitizeTeam`).** A
  saved game with `hardPairs: true` gets `true` on each kept Together rule and
  loses the flag. With it false or absent, the rules stay soft. A game with
  `hardPairs: true` and no Together rule just loses the flag, since there is
  nothing to copy it onto. The step is shape-driven, with no version number, as
  the rest of `storage.js` is, and running it twice gives the same record.
- **Saved plans do not change.** An all-Always game walks its pairs in stored
  order, which is what `hardPairs: true` did, and soft pairs are scored as they
  were. `test/together-568-fingerprint.test.js` holds the plans of a set of
  seeded teams, loaded through `sanitizeTeam`.
- **The strength is set in two places, through one builder.** Add a rule shows
  it under the two-player picker once Together is picked, and a Together rule's
  own page shows it too. Both use `kindControls` and `strengthControls` in
  `app/rules.js`, so the words cannot differ. Alternative: a Settings default.
  Not done: each rule carries its own choice, and a default would be a second
  answer to the same question. Adding Together for a pair that already has a
  Together rule sets that rule's strength in place (`setTogether`), so a pair
  never holds two Together rules.
- **Choice rows, not a segmented control.** The two strengths are rows with a
  checkmark on the chosen one, under the heading "Keep them on together", with
  one gray line below. Alternative: a segmented control. Not done: its longer
  label would wrap inside a half-width button on a phone at large text.
- **The rule's sentence says which strength it is.** "Avery and Blake together"
  for As much as possible, and "Avery and Blake always together" for Always. The
  Changed and Removed toasts reuse the same sentence (`ruleItems` in
  `app/state.js`). Alternative: a badge on the chip. Not done: a second label
  would be a second answer.
- **Engine messages say "set Always together", never "Force Together" or
  "stint".** The wording lives in `app/engine.js` and is not repeated here.
- **Old cached apps drop an Always rule from a hand-off link or backup.** A link
  or backup written by this version and opened by an older cached app loses the
  Always rule, because the older cleaner wants exactly two ids. The app updates
  itself on the next load, so this is accepted rather than worked around.

## Add a rule groups its kinds

Add a rule shows the seven kinds under three headings: **One player** (Plays at
least, Plays at most), **Two players** (Together, Apart, One of two on), and
**Who starts and finishes** (Starting five, Starts the last period). The picked
kind's one plain line sits above the picker. Under Order, Starting five is still
left out, as before.

- **The groups are a separate list, and `KINDS` stays flat.** Alternative: nest
  the kinds under their headings in `KINDS`. Not done: `scripts/feature-keys.mjs`
  and `test/rule-words.test.js` read `KINDS` with a regex, so a nested list would
  hide the kinds from both. The groups live in `KIND_GROUPS`, and the lines in
  `KIND_LINES`, both in `app/rules.js`.
- **The last-period line follows the game's period word.** It says "quarter" in
  a 4-period game and "half" in a 2-period game, the word `periodNoun` already
  gives every other line.

## Tests that pin these

- `test/together-568-migration.test.js`: the cleaner's cases for each saved shape.
- `test/together-568-fingerprint.test.js`: the plans of the seeded teams.
- `test/together-568-scenarios.test.js`: Add a rule and a Together rule's
  strength, as a coach sees them.
- `test/engine.test.js`: the per-pair strength in the engine.
