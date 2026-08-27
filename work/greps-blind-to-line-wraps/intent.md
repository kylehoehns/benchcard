# Intent: every grep-based guard is blind to a line wrap

**Stage 1.** The problem, written down. No spec and no plan yet.

## Problem

This repository's prose is hard-wrapped at about 78 columns, and several of its
guards search that prose with line-oriented tools. A phrase that wraps across
two lines is invisible to them.

**Three separate misses in a single day**, none of them hypothetical:

1. A named individual and their city — the sharpest privacy item in the tree —
   survived a `git grep` scrub of `notes/ROADMAP.md` because the name split
   across a line break. It was found only by a second pass over flattened text.
2. `scripts/charts.mjs` carried a comment quoting the old privacy wording. A
   `grep -rn` for that wording returned nothing; `test/trust-line.test.js`,
   which flattens whitespace first, found it immediately.
3. `test/one-answer.test.js` failed on its own first run because "service
   worker" wraps in `AGENTS.md`. There the guard was wrong and the tree was
   right — the same blindness, pointing the other way.

Two of the three were caught by luck or by a guard that happened to flatten.
Nothing systematic covers this.

## Proposed outcome

Every guard that searches prose for a phrase compares against
whitespace-normalised text. Where a guard genuinely needs line structure — a
frontmatter field, an indent-sensitive parse — it says so.

## Affected surfaces

Unknown, and establishing the list is most of the work. Candidates are any
guard reading a `.md`, `.html` or comment body and asking whether a phrase is
present: `test/analytics.test.js` (bans four absolute phrasings across every
HTML file and every module string — the highest-stakes one), `test/one-answer.test.js`,
`test/feature-coverage.test.js`, `scripts/feature-keys.mjs`, and any
`git grep` used as a check in CI or a hook.

## Constraints

- **`test/analytics.test.js` is the one that matters most.** It enforces the
  privacy claim's narrowness. If a banned absolute could hide in a line wrap,
  that guard has a hole in the most consequential sentence on the site — and
  whether it does is currently unknown.
- Flattening changes what a pattern means. A regex written against line-oriented
  text may match differently once newlines become spaces, so this is not a
  blanket find-and-replace; each guard has to be re-reasoned and re-falsified.
- Some guards read code, not prose, where line structure is real. Do not
  flatten those.

## Open questions

1. Which guards are actually exposed? A survey comes before any fix.
2. Is a shared helper the right shape, or does one-per-guard stay clearer?
3. Should this be enforced — a guard on the guards, failing when a prose search
   runs unflattened — or is that a rule better written down than mechanised?

## What would settle it

A survey naming every prose-searching guard and whether it is exposed;
the exposed ones fixed and each re-falsified with a wrapped phrase as one of
the mutation arms; and `test/analytics.test.js` specifically proven to catch a
banned absolute that wraps across a line.
