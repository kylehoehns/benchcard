# #14 — Phrase checks are blind to a line wrap

## Issue

#14. This repo hard-wraps prose at about 78 columns, so a phrase can split
across two lines. A search that reads one line at a time cannot see a wrapped
phrase. The issue asks that every guard which searches prose for a phrase be
safe against a wrap, and that `test/analytics.test.js` be proven to catch a
banned phrase that wraps.

## Goal

A guard that says "this phrase is not in the tree" cannot be fooled by a line
break. The rule for searching prose is written where a session reads it.

## Decisions

The issue is unlabelled. Its spec comment leaves one question to the plan
("where does requirement 2 live?"). The survey below answers it, so nothing
here needs the owner:

- **Only "must not contain" checks are exposed.** A check that a phrase *is*
  present fails loudly when the phrase wraps. It goes red, someone looks, and
  the tree is fine. That is the third miss in the issue, and it cost ninety
  seconds. A check that a phrase is *absent* passes silently when the phrase
  wraps. That is a green guard over a broken tree, which is the failure
  `AGENTS.md` § Guards exists to prevent. So the guard only covers negative
  checks.
- **The survey.** The earlier spec comment on the issue says every prose guard
  already flattens. That holds for the guards it listed (`analytics`,
  `one-answer`, `trust-line`, `feature-coverage` through `textOf`, `sdlc`). It
  does not hold for the tree as a whole. A scan of `test/*.js` finds **22**
  negative multi-word phrase checks written as `!x.includes('a b')` or
  `assert.doesNotMatch(x, /a b/)` with a literal space, in 12 files:
  `feature-coverage` (4), `traffic` (4), `budget-actuals` (2), `settings` (2),
  `timeline-name-button` (2), `undo-view` (2), `card-blocked`,
  `compare-shots`, `events`, `season`, `smoke-only` and `wide-layout` (1
  each). Any of these passes over a tree where the phrase wraps. (The build
  found that the `compare-shots` hit is inside a comment, so 21 are real
  checks. The guard strips comments and does not flag it.)
- **One shared helper, and a guard that requires it.** The issue asks whether a
  shared helper or one per guard is clearer. It is a shared helper, because
  `AGENTS.md`'s first rule is that one answer lives in one place. The 22 checks
  then share a single flatten. `test/prose.js` exports `flat(s)`
  (`s.replace(/\s+/g, ' ')`, the same as `one-answer.test.js`'s) and
  `lacks(text, phrase)`, which is true when the flattened text does not
  contain the flattened phrase. A phrase can be a string or a RegExp; for a
  RegExp, each literal space in its source becomes `\s+`, the same move
  `analytics.test.js`'s `claim()` makes.
- **The guard is precise, not a blanket ban.** It fails only on a negated
  `.includes()` or a `doesNotMatch` whose literal holds a space between two
  word characters. A regex already written with `\s+` passes. Positive checks
  are untouched. A single-line string, like rendered text or a CSS value,
  flattens to itself, so the guard never has to decide whether something is
  prose or code. That is why it stays quiet on ordinary work. The issue feared
  a hook that fires on every `grep`, and this is not that.
- **The rule lives in `AGENTS.md` § Judgement**, next to "a grep MISS is not
  proof". That is where a session reads about trusting a search.
  `grep`/`git grep`/`rg` stay allowed: they are right for one-line matches.
  The bullet says to flatten, or to use a pattern with `\s+`, before trusting a
  miss on a phrase.

## What would settle it

1. `test/prose.js` exports `flat` and `lacks`. Unit tests show that:
   - `lacks('nothing ever leaves\n   your device', 'leaves your device')` is
     `false`;
   - the same text with the phrase absent gives `true`;
   - a RegExp phrase with a literal space matches across a newline;
   - a single-line string behaves like `!includes`.
2. All 22 checks from the survey go through `lacks` (or a `\s+` pattern), and
   every one still passes. If one goes red, that is a real wrapped phrase the old
   check missed. Report it and fix the tree, not the check.
3. A new guard, `test/wrap-blind.test.js`, scans every `test/*.js` except
   itself and fails on a negated multi-word `.includes()` or a `doesNotMatch`
   with a literal space. The message names the file and line and points to
   `lacks`. Prove it the `/new-guard` way:
   - red against a real planted `!x.includes('two words')`;
   - red against a `doesNotMatch(x, /two words/)`;
   - green against `/two\s+words/` and against a one-word `!x.includes('word')`;
   - it refuses to pass if it scanned fewer files than a floor, so it cannot
     go green by reading nothing.
4. `test/analytics.test.js` pins its own wrap-resistance: for each of the four
   `ABSOLUTE` patterns, a sample wrapped across a newline and indented, the way
   this repo wraps markup, is matched. Remove `claim()`'s `\s+` rewrite and
   this test goes red.
5. `AGENTS.md` § Judgement carries the rule in one bullet, or one clause added
   to the grep bullet.
6. `npm test` passes. `npm run smoke` passes (nothing a coach sees changes).

## Surfaces

Changes: `test/prose.js` (new), `test/wrap-blind.test.js` (new),
`test/analytics.test.js` (one new test), the 12 test files above (their negative
checks only), `test/one-answer.test.js` (imports `flat` in place of its own),
`AGENTS.md` (one bullet).

Must not change: anything in `app/`, so there is no precache bump. Must not
change what any existing check asserts. Must not change the positive checks.

## Constraints

- **`/new-guard` owns how a guard is written and proven.** Load it before
  writing `wrap-blind.test.js`. Its five ways to go green on a broken tree all
  apply: the scan floor, reading the right directory, a planted real failure,
  and restoring after a mutation without deleting the fix.
- **Reuse, do not re-derive:** there is one `flat` in `test/prose.js`.
  `one-answer.test.js` imports it. Do not add a third. `analytics.test.js`'s
  `claim()` stays as it is, since it builds patterns rather than testing
  absence, but the new pin test may use `flat` to build its samples.
- **Converting a check must keep its meaning.** A regex with alternation or
  anchors goes through `lacks` as a RegExp, not rewritten as a string. The
  failure messages stay as they are.
- **The guard's own source has to name the banned shapes.** It excludes itself
  from the scan and says why, the way `analytics.test.js` strips comments
  before checking.

## Design

- `test/prose.js`:
  `export const flat = s => s.replace(/\s+/g, ' ');`
  and `export function lacks(text, phrase)`, where a string phrase is
  flattened and passed to `includes`, and a RegExp phrase is rebuilt with each
  literal space as `\s+` (flags kept) and tested against the raw text.
- `test/wrap-blind.test.js`: read `test/` with `readdirSync`, assert a floor
  (the current count of `*.js` files there, minus a margin), and use the survey's
  two regexes. Strip comments with the existing `test/js-comments.js`, so a
  comment that names a shape is not flagged.
- `AGENTS.md` § Judgement: extend the grep bullet with one sentence. For
  example: "A phrase search misses a phrase that wraps, and this repo wraps
  prose at ~78 columns: flatten first, or write the pattern with `\s+`, before
  a miss counts as an answer. `test/prose.js`'s `lacks` does this for tests."

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `flat`/`lacks` over literal strings | `node --test`, a new `test/prose.test.js` | 1 |
| the 22 converted checks still passing | `npm test` | 2 |
| `wrap-blind.test.js`, proven with `/new-guard` mutation arms | `npm test`, plus the arms reported by hand | 3 |
| wrapped sample per `ABSOLUTE` pattern, with the `\s+` rewrite removed as the red arm | `node --test test/analytics.test.js` | 4 |
| `AGENTS.md` read by the existing doc guards (`one-answer`, `sdlc`) | `npm test` | 5 |

## Out of scope

- Hooks that inspect `grep` use.
- Positive phrase checks.
- Rewriting any guard the survey found already safe.
- Scripts outside `test/` (the smoke checks read the DOM, not files).
