# #98 — The app calls the pair rules by three sets of names

## Issue

#98. The Plan sheet's rule picker, bench mode's blocked-plan messages and the
help sheet each name the three pair rules differently. The glossary
(`CONTEXT.md`) gives one name for each: **Together**, **Apart** and **One of two
on**.

## Goal

A coach sees one name for each pair rule, whether they are adding it, reading
it back in the rules list, reading the help, or being told bench mode cannot
meet it.

## Decisions

The issue is unlabelled. The survey held up its claims and found more. The
glossary answers every naming question, so there is nothing for the maintainer
to decide. Each decision and its reason:

- **The scope is every place a coach reads a pair rule's name, not just the
  two files the issue names.** The issue's own test ("no avoided rule name in
  any string literal in `app/*.js`") also catches `app/state.js`'s rule rows
  ("Devon and Hana play together") and `app/engine.js`'s plan errors ("set to
  never play together"). Its goal ("everywhere a coach reads them") also
  covers the help sheet in `app/index.html`, which says "Play together / Keep
  apart" and "Always one on". All of these change.
- **Rule rows follow About and Advanced.** #75 made those pages' example
  chips read "Bria + Ty together" and "Noah / Mia apart". The rules list uses
  the same short form: "Devon and Hana together" and "Devon and Hana apart".
  The One of two on row ("Devon or Hana is always on the floor") uses no
  avoided word and stays.
- **Which phrases the guard bans comes from `CONTEXT.md`, not a second list.**
  It bans the `_Avoid_` phrases of Together, Apart and One of two on, the same
  three terms `test/static-pages.test.js` already reads. "pair" is dropped,
  for the reason #75 gave: it is ordinary copy ("A pair you never want
  resting..."). "avoid" is also dropped if the tree shows it in ordinary copy.
  The test says why for each phrase it drops.

## What would settle it

1. The Plan sheet's rule picker (`app/rules.js`) offers, in today's order:
   `Apart`, `Together`, `One of two on`.
2. The rules list reads `<A> and <B> together` and `<A> and <B> apart`. The One of
   two on row is unchanged.
3. Bench mode's blocked-plan reasons (`app/gamemode.js`) read:
   - `PAIR_AVOID_CONFLICT`: `a pair is set to both Together and Apart`
   - `AVOID_IMPOSSIBLE`: `the Apart rules cannot all be met with who is left`
   - `CLOSERS_AVOID`: `two players set to close are also set Apart`
   - `FORCED_GROUP_AVOID`: `two players pinned to the same stint are set Apart`
   - `KEEPON_UNSATISFIABLE`: `a One of two on pair cannot be covered without them`
   - `FORCED_GROUP_KEEPON`: `a pinned stint leaves a One of two on pair uncovered`
4. The plan errors (`app/engine.js`) name the rule by its glossary name:
   - `<A> and <B> are set both Together and Apart.`
   - `... are both pinned to the <name> but are set Apart.`
   - `... are both set to close but are set Apart.`
   - `Unit <n> puts <A> and <B> on the floor together, but you have them set
     Apart. The unit wins — drop the rule or change the unit.`
   - `No legal lineup of 5 exists -- the Apart rules rule out every
     combination. Drop one of them.`
   Only the rule's name changes in each message. The rest of the text stays.
5. The help sheet (`app/index.html`) has `<dt>Together / Apart</dt>` and
   `<dt>One of two on</dt>`. The "mirror of" sentence names Apart instead of
   “keep apart”.
6. A test fails if any of the banned phrases appears in a string or template
   literal in any `app/*.js` file, or in `app/index.html`'s text with comments
   removed. The failure names the file and the phrase. It is shown red against
   today's tree, listing the hits above, before the copy changes.
7. `npm test` and `npm run smoke` pass.

## Surfaces

Changes: `app/rules.js`, `app/gamemode.js`, `app/engine.js`, `app/state.js`,
`app/index.html`, `app/sw.js` (`VERSION`, `SHELL`), `app/app.css` only for the
comment at 3239 that quotes the old label. Also tests and smoke checks that
assert the old copy, one new test, and a shared test helper for the glossary
parser.

Must not change: rule `kind` keys (`together`, `apart`, `keepon`), stored data
field names (`pairs`, `avoids`, `keepOnFloor`), error codes, the engine's
behavior, About and Advanced (#75 owns those).

## Constraints

- **Reuse, do not re-derive:**
  - `test/js-strings.js`'s `jsStrings` reads the literals. Do not write a
    second comment or string scanner.
  - Move `parseGlossaryAvoid` from `test/static-pages.test.js` into a shared
    helper (not a `*.test.js` file, like `test/js-strings.js`). Both tests
    import it. Do not copy it.
  - The banned phrases come from `CONTEXT.md` through that parser. Do not
    type them in again.
- **Precache bump:** every changed file under `app/` is precached. Bump
  `VERSION` in `app/sw.js` and set `SHELL` to the digest `npm test` names.
- **Mobile first:** the picker labels get shorter, so nothing new can
  overflow. The browser check still looks at 320px with 32px text.
- The new test reads source on purpose, because checking copy across every
  file is its job. It is a guard: show it red before the fix, as `/new-guard`
  says.

## Design

- Change the copy listed in items 1–5.
- `test/glossary.js`: export `parseGlossaryAvoid` (moved as-is) and let
  `static-pages.test.js` import it.
- `test/rule-names.test.js`: parse `CONTEXT.md`. Take the `_Avoid_` phrases
  of the three terms, minus the documented drops. Match each one as a whole
  word, case-insensitively, against `jsStrings` of every `app/*.js` file and
  against `app/index.html` with comments removed.
- Update tests and smoke checks that assert the old copy, so they assert the
  new copy.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| guard over `app/*.js` literals and `app/index.html` | `node --test`, `test/rule-names.test.js` | 6 |
| engine error messages | `node --test`, existing `test/engine.test.js` cases | 4 |
| rule rows (`state.js`) | `node --test`, existing state or plan-sheet tests | 2 |
| picker labels and rule rows on the Plan sheet | `npm run smoke`, `scripts/smoke/plan-sheet.mjs` | 1, 2 |
| `/browser-verify` on the preview at 390×844 and 320px/32px: the picker, the rules list, the help sheet's rule terms | preview | 1, 2, 5 |

## Out of scope

- About and Advanced (#75 already did those).
- Renaming code identifiers, `kind` keys or error codes.
