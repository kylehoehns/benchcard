# #136 — Messages use today's rule names

## Issue

#136 (item of #153). Bench mode, the solver's warnings and the tour still use
rule names from before the redesign, and the tour gives advice that wipes a
player's minutes.

## Goal

Every message a coach reads names a rule the way the Add a rule screen does,
and calls the bench-mode action what the button calls it. Following the tour
never costs a player their minutes.

## Survey (origin/main at 1e6373f, after #161)

Every claim on the issue holds. Line numbers moved since it was written:

- `SIT_RULES` is at `app/gamemode.js:703-718`. It uses "Minutes limit",
  "floor"/"floors" (a minimum), "cap"/"caps" (a maximum) and "pinned".
- The button is `'Sit, rebalance'` at `gamemode.js:461`. Its three toasts are
  at `:745`, `:747` and `:754`.
- The Add a rule labels are `KINDS` at `app/rules.js:266-275`: Plays at least,
  Plays at most, Apart, Together, One of two on, Starting five, Last-period
  five, Rest limit.
- The engine's coach-visible warnings are at `app/engine.js:300`, `:307`,
  `:328`, `:329`, `:332`, `:410` and `:460`. They use an ASCII "x", "on the
  court", "--", "floor-minutes", "Pair", "Avoid" and "the consecutive-stint
  limit".
- `rules.js:102`: the switch "Force together pairs every stint".
- `tour.js:58`: step 1 of the tour (the issue's "step 3" is the third item a
  coach reads, counting the welcome). It suggests marking someone absent for
  foul trouble.
- Three more coach-visible "rebalance" strings the issue did not list but its
  "Done when" covers:
  - `app/plan-view.js:272`: "Later games rebalance against this automatically."
  - `app/teams-view.js:635`: "The day rebalanced."
  - `app/index.html:1941`: the help sheet's `<dt>Sit, rebalance</dt>`.
- Code names (`rebalance()` in budget.js, `rebalanceSlots`, the `PAIR_DROPPED`
  codes) are not coach-visible. They stay.

## Decided

1. The toast after sitting a player does not use a pronoun: the app does not
   know any player's pronouns. It reads: **"Ana sits for the rest. The others
   share those minutes."** (with the player's name).
2. Rule names in messages are the `KINDS` labels exactly, in the same case:
   "Plays at least", "Plays at most", "Apart", "Together", "One of two on",
   "Starting five", "Last-period five", "Rest limit".
3. "On the floor" (the five playing) stays. It is the app's word for the
   court. Only "floor" meaning a minimum goes.

## What would settle it

1. No coach-visible string (markup text, `el()`/`flash()`/`undoable()`/toast
   text, `warn()` messages, `SIT_RULES` values, help and tour copy) contains:
   "Minutes limit", "floor-minutes", "floors", "a floor", "cap"/"caps" as a
   word, "pinned", "Pair ", "Avoid ", "rebalanc" (any case), "on the court",
   " -- ", or an ASCII "x" between a number or "min" and a number.
2. The bench-mode button reads **"Sit for the rest"**, and so does the help
   sheet's entry for it.
3. After sitting Ana, the toast reads **"Ana sits for the rest. The others
   share those minutes."** and still offers Undo.
4. The two refusal toasts read:
   - strategy: **"Sit for the rest does not apply to this strategy. Its
     minutes are set by hand."**
   - nothing: **"Nothing left to share out. This is the last stint."**
5. Tour step 1's body reads exactly: **"Everyone on the roster is available.
   Tap the number of players to mark who isn't here, and the rotation
   rebuilds."**
6. Every `SIT_RULES` value and every engine warning names rules by the
   `KINDS` labels. Numbers use "×" and dashes use "—".
7. `engine.js`'s diff touches message strings only. The same inputs give
   the same plans, the same issue codes and the same severities.
8. A test fails if any word from item 1 comes back into `SIT_RULES` or into
   an engine warning.

## Surfaces

- Changes: `app/gamemode.js`, `app/engine.js` (strings only), `app/rules.js`
  (the one switch label), `app/tour.js`, `app/plan-view.js`,
  `app/teams-view.js` (the one toast), `app/index.html` (the help entry),
  `app/sw.js`, `test/`.
- Must not change: any engine logic, any issue `code`, `KINDS`, `CONTEXT.md`'s
  terms (it already says **Sit for the rest**).

## Constraints

- W1 (plain words), W2 (the app's own names, one name per thing), W4 (say
  what happens, not how).
- `engine.js` is one of the four pure modules: strings only, no logic.
- Tests that assert the old strings get the new ones. None is deleted.
- Precache: bump `VERSION` in `app/sw.js` and set `SHELL` to the digest
  `npm test` names.
- Wrap any smoke run in `perl -e 'alarm 900; exec @ARGV' …`.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Engine warnings, by running `solve` on inputs that trigger each one (the existing engine tests already build most of them) and asserting the new text | `node --test` | 6, 7 |
| `SIT_RULES` words: export it (or read it through `sitForTheRest`'s refusal path) and assert every value against the avoid list and the `KINDS` labels | `node --test` | 1, 6, 8 |
| Avoid-list guard over the engine's `warn(` messages and `SIT_RULES`, comment-stripped the way `test/help-deeplink.test.js` does — a source-reading guard, named here as a seam under `/new-guard` | `node --test` | 1, 8 |
| Button label, both refusal toasts, the sit toast and its Undo | extend the bench-mode smoke check that already sits a player (find it in `scripts/smoke/registry.mjs`) | 2, 3, 4 |
| Tour copy | `node --test` on `TOUR` (import it) or the existing tour smoke | 5 |
| Everything else | full smoke | — |

## Out of scope

- Renaming code identifiers (`rebalance`, `PAIR_DROPPED`, …).
- Rewording messages that already use today's names.
