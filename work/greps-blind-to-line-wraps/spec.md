# Spec: the guards are not exposed; the hazard is interactive searching

**Stage 2.** Written from `intent.md`, and **it contradicts it.** The survey the
intent asked for was run first, as the intent said it should be, and the answer
removes most of the proposed work.

## The intent's central claim is false

> "Every guard that searches prose for a phrase compares against
> whitespace-normalised text" — proposed as the outcome to *reach*.

It is already the case. Every committed guard that searches prose flattens
first, by one of three routes:

| Guard | How it survives a wrap |
| --- | --- |
| `test/analytics.test.js` | `claim()` rewrites every space in a banned phrase as `\s+`, which crosses newlines |
| `test/one-answer.test.js` | `flat()` — `replace(/\s+/g, ' ')` before every comparison |
| `test/trust-line.test.js` | flattens each surface before matching |
| `test/feature-coverage.test.js` | matches through `textOf()` in `scripts/feature-keys.mjs`, which ends `.replace(/\s+/g, ' ')` |
| `test/sdlc.test.js` | flattens for the `bands.yaml` check; reads raw only for frontmatter, where line structure is real |
| `test/ci-config.test.js` | line-oriented **on purpose** — it reads YAML keys, not prose |
| `test/about-date.test.js` | parses a date, not a phrase |

**`test/analytics.test.js` was the one that mattered and it is proven safe, not
assumed safe.** A banned absolute was injected into a copy of `app/about.html`,
wrapped across a newline exactly the way this repo hard-wraps prose:

```
<p>Benchcard is private: nothing ever leaves
        your device.</p>
```

The guard failed, as it should:

```
about.html still makes an absolute privacy claim:
  /nothing\s+(?:ever\s+)?leaves\s+(?:your|this)\s+device/i
```

## Where the three misses actually happened

Re-read with the survey in hand, none of the three was a committed guard:

1. **The `ROADMAP.md` scrub** — an ad-hoc `git grep` typed into a session. No
   guard was involved.
2. **The stale comment in `scripts/charts.mjs`** — an ad-hoc `grep -rn` missed
   it; `test/trust-line.test.js` caught it within the minute, because it
   flattens.
3. **`test/one-answer.test.js`'s first run** — a guard being written, wrong for
   about ninety seconds, fixed before it was committed.

**The exposure is in interactive searching, not in the tree.** The intent
generalised from three incidents to a class of defect that the code does not
have. That is worth saying plainly: the survey was the right first task and its
answer was "there is much less here than it looked like".

## Requirement, narrowed

1. **A rule, written where a session will meet it**: a phrase search over prose
   is run against flattened text, because this repo hard-wraps at ~78 columns
   and any phrase of more than two or three words can wrap. `grep`, `git grep`
   and `rg` are all line-oriented and will lie by returning nothing.
2. **A guard against regression**, since the property currently holds by
   coincidence rather than by rule: no committed guard that searches prose for
   a phrase may compare against unflattened text.

Nothing else. No sweep, no shared helper, no rewrite of any existing guard.

## Explicitly not doing

- **Changing any existing guard.** All of them are correct. A change with no
  defect behind it is churn, and this repo's own standard is that "it works" and
  "what does it buy" are different questions.
- **Banning `grep` in a hook.** It is the right tool for a one-line match and
  the wrong one for a wrapped phrase; a hook cannot tell which is which, and a
  guard that fires on ordinary work gets switched off.

## Acceptance

1. The rule exists somewhere a session reads before searching prose.
2. A guard fails if a prose-searching test compares unflattened text, and that
   guard has been shown to go red against a real unflattened comparison.
3. `test/analytics.test.js`'s wrap-resistance is pinned by a test rather than
   left as a property somebody proved once in a scratch directory — it is the
   privacy claim's enforcement and the most consequential of the set.

## Open question for the plan

Where does requirement 2 live? A test that reads other test files is unusual
here and slightly self-referential. The alternative is accepting the rule as
prose only. The plan decides; the intent's suggestion of "a guard on the
guards" is one option, not a settled one.
