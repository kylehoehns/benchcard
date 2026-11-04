# 568 — Add a rule: grouped kinds that explain themselves

## Issue

#568 (part of #561, the ease-of-use pass): Add a rule groups its seven kinds
under three headings, the picked kind says what it does in one plain line, and
each Together rule gets its own strength in place of the one game-wide Force
Together switch (`hardPairs`), with a storage migration that keeps every saved
game planning the same.

## Goal

A coach adding a rule sees the kinds sorted by what they are about (one
player, two players, who starts and finishes), and reads what the one they
picked does without opening How it works. A coach who wants two kids on the
floor every time sets that on that one Together rule, when they add it, and
can see it in the rule's own sentence. Nothing a coach saved plans
differently.

## Survey (on `b7b3e5a`)

- `KINDS` in `app/rules.js` is a flat list of seven `['kind', 'Label']`
  entries painted as one `.chips.plan-kinds` row (`paintKindChips`). #566
  already took `rest` and `bench` out. Under Order, `starts` is left out
  unless it is the draft's kind. `scripts/feature-keys.mjs` (`ruleKinds`) and
  `test/rule-words.test.js` (`KIND_LABEL`) parse `KINDS` with the regex
  `\['(\w+)',\s*'([^']+)'\]` between `const KINDS = [` and `\n];`.
- `hardPairs` is one boolean on `g.constraints` (`emptyConstraints` in
  `app/team-ops.js`; cleaned to a boolean in `sanitizeTeam`; in `RULE_KEYS`
  in `app/state.js`, so `newGame` and Copy rules carry it). The Plan sheet
  shows it as one switch, "Force Together keeps each pair on the floor at the
  same time", in `#planPairs`, only while the game has a Together rule
  (`renderPairsGroup`, edit kind `pairs`).
- The engine reads it in five places (`app/engine.js`): `normalize` passes it
  through; `analyzeFeasibility` builds `tiedGroups` over every pair for
  `PAIR_CHAIN_APART`; `cost()` weighs a split pair 400 a minute instead of 25;
  `pairSwaps` yields the pair moves only with it on; and two info notes (a
  tied kid playing a capped partner's minutes, a tied group too big to sit).
  Their wording says "Force Together".
- `pairs` entries are `[a, b]`. `sanitizeTeam`'s `keepPairs` keeps only
  length-2 arrays of known ids; the same helper cleans `avoids` and
  `keepOnFloor`. Every reader destructures `[a, b]` or uses `pr.includes(id)`,
  `pr[0]`, `pr[1]`.
- The plan cache signature includes `g.constraints`; the rotation stamp and
  the warm-start key do not. A plan that comes out identical keeps its
  live overrides.
- Smoke: `scripts/smoke/switch-row.mjs` measures switch rows only in the
  state "plan sheet, with a pair" (Force Together is "the one switch left");
  `scripts/smoke/overlay.mjs` seeds that state; `scripts/smoke/plan-sheet.mjs`
  checks the switch (items H/I) and the kind chip list (`WANT_KINDS`).
  "plan sheet, copy from another game" also draws switch rows (Copy's four).
- `CONTEXT.md` lists "always together" under Together's _Avoid_.

## Choices the issue left open (decided here)

1. **Stored shape.** A Together rule is `[a, b]` (As much as possible, the
   soft default) or `[a, b, true]` (Always). No new key: every reader that
   destructures `[a, b]` or calls `includes` keeps working, and removing a
   rule or a player removes its strength with it. `hardPairs` leaves
   `emptyConstraints`, `RULE_KEYS` and the cleaner. `avoids` and
   `keepOnFloor` stay strictly two ids.
2. **Migration** (`sanitizeTeam`, shape-driven, no version branch,
   idempotent): a saved game with `hardPairs: true` has `true` added to each
   of its kept Together rules; with it false or absent they stay `[a, b]`.
   A third field is kept only when it is exactly `true`; any other third
   field is dropped (the rule is kept, soft). Running the cleaner twice gives
   the same record. A game with `hardPairs: true` and no Together rule simply
   loses the flag (there is nothing to copy it onto); a rule added later
   starts as As much as possible.
3. **The words.** The strength is a group under the two-player picker on a
   Together rule, headed **Keep them on together**, with two choice rows
   (`paintChoiceRows`, a checkmark on the chosen one): **As much as
   possible** (default) and **Always**. One gray line under it: "Always can
   make minutes less even." Choice rows rather than a segmented control so
   the long label never wraps inside a half-width button at 320px / 32px.
   The rule's sentence says it: "Avery and Blake together" stays for As much
   as possible; Always reads "Avery and Blake always together". The Changed
   and Removed toasts follow, since they reuse the sentence.
4. **Where the strength is set.** On Add a rule when Together is picked, and
   on a Together rule's detail page (the same `kindControls`, a live edit
   through `replaceRule`, with one Undo per visit like every other edit
   there). The draft carries `always: true | false`.
5. **Engine wording** (no "Force Together", no "stint"):
   - `PAIR_CHAIN_APART`: "Blake and Casey are set Apart, but both are set
     Always together with Avery, so they would always be on together. Drop
     one of the rules."
   - tied partner note: "Blake plays 8 min because they are set Always
     together with Avery (capped at 8 min)."
   - tied group note: "Avery, Blake and Casey play every minute because 3
     players are set Always together and only 2 can sit."
   - `SIT_RULES.PAIR_CHAIN_APART` in `app/gamemode.js`: "two players set
     Apart are both set Always together with a third".
6. **Groups and lines** in Add a rule. `KINDS` keeps its name and its
   `['kind', 'Label']` entries (so both parsers above keep working), grouped
   under headings in the order below. Each heading is a `.pgrp-h`, and each
   group's chips are one `.chips.plan-kinds` row with `role="group"` and an
   accessible name equal to its heading. The picked kind's line is one
   `p.pgrp-f` at the top of `#planKindBody`, above the picker, written in
   plain words with no "stint" or "N":

   | Heading | Kind | Line |
   | --- | --- | --- |
   | One player | Plays at least | The fewest minutes one player gets. |
   | One player | Plays at most | The most minutes one player gets. |
   | Two players | Together | Two players who play well as a pair are on the floor together. |
   | Two players | Apart | Two players are never on the floor at the same time. |
   | Two players | One of two on | One of two players is always on the floor, like your two ball handlers. |
   | Who starts and finishes | Starting five | Who is on the floor at tip-off. Minutes stay even. |
   | Who starts and finishes | Starts the last period | Who is on the floor when the last quarter starts. |

   "quarter" in the last line follows the game's period word ("half" in a
   2-period game, "period" otherwise), the way `periodNoun` words it
   elsewhere. Starts the last period keeps its #571 line under the picker
   ("Only picks who starts it. To give kids more minutes at the end, use
   Closers."). Under Order, Starting five is still left out of Add a rule (6
   kinds, the third heading over one chip); an existing Starting five rule
   stays in the rules list with its "Not used" sentence.
7. **The `pairs` edit kind** in `app/edit.js` goes with the switch; a
   strength change is a rule edit (`edit('rule')`).
8. **How it works** (`#help`, Together / Apart) and `app/advanced.html`
   (Together) say the strength is set on each Together rule, As much as
   possible or Always, with no "stint". `CONTEXT.md`'s Together entry names
   the two strengths and moves "always together" out of _Avoid_ (it is now
   the Always strength's sentence), with `_In code_` naming the third field.
9. **Smoke.** The switch-row check moves to "plan sheet, copy from another
   game" (Copy's switches); "plan sheet, with a pair" is dropped. The
   plan-sheet items that drove the switch drive the strength rows on a
   Together rule's detail page instead. `WANT_KINDS` reads the seven labels
   in group order, and the three headings are checked.
10. **What's new** (two entries, one change each):
    - "Add a rule now sorts the kinds under three headings: one player, two
      players, and who starts and finishes. The kind you pick says what it
      does in one line."
    - "Each Together rule now has its own choice: keep the two on together as
      much as possible, or always. It replaces the one switch that covered
      every pair in the game."
11. **Hand-off links and backups** written by this version and opened by an
    older cached app drop an Always rule (the old cleaner wants exactly two
    ids). The app updates itself on the next load, so this is accepted and
    not worked around.

## What would settle it

1. **Plans unchanged**: `test/together-568-fingerprint.test.js` keeps the
   hash `e4f9f19d…4ac5` recorded on `b7b3e5a` before any edit (60 seeded
   teams, two days each, old-shape games with 0–3 Together rules,
   `hardPairs` on or off, some Apart rules including the A–B, A–C, B Apart C
   chain, some kids out, a cap, 2- and 4-period, Breaks only and every-N,
   all five strategies, some overtime, loaded through `sanitizeTeam`; the
   hash covers each plan's fives and sorted note codes). The earlier
   fingerprint tests keep their hashes.
2. **Migration** (`node --test`, `sanitizeTeam`), one case per saved shape:
   - `hardPairs: true` with two pairs → both `[a, b, true]`, no `hardPairs`;
   - `hardPairs: false` → pairs stay `[a, b]`;
   - no `hardPairs` key → pairs stay `[a, b]`;
   - `hardPairs: true` and no pairs → empty pairs, no `hardPairs`;
   - `hardPairs: true` with a pair naming an unknown id → that pair dropped,
     the other kept as `[a, b, true]`;
   - an already-migrated `[a, b, true]` with no `hardPairs` → kept;
   - junk third fields (`false`, `1`, `"x"`, `null`) → `[a, b]`; a
     four-element pair → dropped;
   - `avoids` / `keepOnFloor` with a third field → dropped, as today;
   - running the cleaner twice gives the same team.
3. **Per-pair strength in the engine** (`node --test` on `generatePlan` /
   `analyzeFeasibility`):
   - two Together pairs in one game, one Always and one As much as possible,
     on a 4 × 8 every-4 game with 10 players where a minimum on one Always
     player pulls them off even: the Always pair is never split; the soft pair
     is scored at 25 a minute (a direct `cost` check, or the plan matching a
     plan where only that pair is given, soft) and may split;
   - the same two pairs with the strengths swapped flip which one never
     splits;
   - `PAIR_CHAIN_APART` fires for A–B and A–C both Always with B Apart C,
     naming B, C and A; it does not fire when either link is As much as
     possible; a direct Together+Apart pair is still `PAIR_AVOID_CONFLICT`
     only;
   - the two info notes fire for Always pairs only, worded as in choice 5;
   - the existing #438 / #446 engine tests and the fuzz pair test pass with
     every pair marked Always in place of `hardPairs: true`.
4. **Add a rule** (Coach seam): the page shows the three headings in order,
   with the kind chips under each as in choice 6 (seven; six under Order with
   no Starting five); tapping each kind shows its line, exactly as in the
   table (the last-period line says "quarter" in a 4-period game and "half"
   in a 2-period game); no label or line contains "N" as a word or "stint".
5. **Strength** (Coach seam): adding Together for two players shows Keep them
   on together with As much as possible checked; picking Always and adding
   the rule shows "… always together" in the rules list and saves
   `[a, b, true]` after a reopen; the rule's detail page shows Always checked;
   switching it to As much as possible changes the sentence back, raises the
   Changed toast, and Undo restores Always. The Plan sheet has no "Force
   Together" switch with a Together rule on the game. The existing rules
   scenario that used the switch sets Always on its Together rule and still
   holds the pair together in every five.
6. **Copy and new games** (`node --test`): `copySetup` with rules copies a
   pair's strength; `newGame` cloning a game with an Always pair keeps it;
   removing a player removes their Always pair.
7. **Look checks**: Add a rule with each kind picked (seven shots per cell,
   the line under the chips), a Together rule's detail page with Always
   checked, and the Plan sheet rules list with an Always rule, using long
   names ("Alexandria Montgomery-Okafor"), at 320 and 390 wide, 16 and 32px
   text, each sheet scrolled to the bottom and at full height. No clipping or
   cramped wrapping.
8. **Docs**: `docs/design-decisions.md` table rows for Force Together and the
   cost row say per-rule Always; any new decision that does not fit the
   60000-byte limit goes to `docs/design-decisions-together.md`, linked from
   it.
9. **What's new**: both entries added, page regenerated, sitemap lastmod
   moved.

## Surfaces

Change: `app/engine.js` (normalize, feasibility, cost, pairSwaps, notes,
comments), `app/storage.js` (cleaner and migration), `app/team-ops.js`
(`emptyConstraints`), `app/state.js` (`RULE_KEYS`, `ruleItems` sentence,
`replaceRule` strength), `app/rules.js` (grouped `KINDS`, kind lines,
strength rows, `renderPairsGroup` removed, `commitAddRule`), `app/edit.js`
(`pairs` kind), `app/gamemode.js` (`SIT_RULES`), `app/index.html`
(`#planPairs` removed, How it works), `app/advanced.html`, `app/app.css`
(headings and line in Add a rule), smoke checks named above, tests (the many
fixtures that spell `hardPairs: false` in a constraints object), `CONTEXT.md`,
docs, `scripts/whats-new.json` + `app/whats-new.html` + `app/sitemap.xml`.

Must not change: `app/budget.js`, `app/roster.js`; any cost weight, move or
search step other than reading the strength per pair; what `computeAll`
plans for any saved game.

## Constraints

- `engine.js` and `storage.js` are pure and heavily tested. Their change here
  is only the per-pair read and the migration. Iteration order over pairs is
  kept (the Always pairs in their stored order), so an all-Always game plans
  exactly as `hardPairs: true` did.
- Reuse, do not re-derive: the rule sentence comes only from `ruleItems`; the
  strength rows use `paintChoiceRows`; the strength controls live in
  `kindControls` so Add a rule and the detail page share them; duplicate
  checks keep `pairInList` / `samePairAs`; the period word comes from the
  existing period-noun helper.
- Both `KINDS` parsers (`scripts/feature-keys.mjs`, `test/rule-words.test.js`)
  keep reading seven kinds.
- Interface guidelines: C6 (rows ≥ 48px, a checkmark means chosen), W1
  (sentence case), W3 (one gray line per group), T2/A4 (nothing clipped at
  320px with 32px text), I1 (48px targets).
- Coach copy in plain words, no "stint", no "N". Made-up names only (Avery,
  Blake, Casey, Drew, Emery, Finley, Gray, Harper, Indy) in new tests and
  docs.
- `docs/design-decisions.md` is at its 60000-byte limit.
- Do not lower `scripts/coverage.json`. Widen `bytesAbs` if needed and say so.

## Proof

- `node --test test/together-568-fingerprint.test.js` and the other
  `*-fingerprint.test.js` files: item 1.
- `node --test` on `sanitizeTeam` (a new `test/together-568-migration.test.js`):
  item 2.
- `node --test` on the engine (`test/engine.test.js`, `test/fuzz.test.js`, and
  new cases for item 3).
- Coach scenarios (`test/coach.js`, a new
  `test/together-568-scenarios.test.js`, and the updated
  `test/rules-scenarios.test.js` and `test/plan-sheet-words-scenarios.test.js`):
  items 4 and 5.
- `node --test` on `copySetup`, `newGame`, `removePlayer`: item 6.
- Smoke rows (`plan sheet`, `app large text`, the switch-row state) and
  `scripts/look.mjs`: item 7.

## Out of scope

- Any other #561 child.
- A strength on Apart or One of two on.
- A Settings default for the strength.
