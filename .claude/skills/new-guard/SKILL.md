---
name: new-guard
description: How to write, falsify and trust a guard in this repo -- a test, a CI check, a hook, or any script that reports pass/fail -- and the five ways guards here have gone green against a broken tree. Use when adding or editing anything under test/ or scripts/ that judges the tree, when writing a mutation harness, and whenever a check reports a suspiciously perfect result.
allowed-tools: Bash(node --test*), Bash(npm test), Bash(node scripts/*)
---

# Writing a guard that is actually a guard

This file owns the guard lessons outright. `AGENTS.md` indexes them and does
not restate them, because two answers to one question is the defect that has
cost this repo more than any other.

Each step below exists because skipping it produced a green report about a
broken tree, here, in this repo.

## The loop

**1. Run it GREEN first, before mutating anything.** One guard here was written
with a floor of 5 against 4 real rules and could never have passed. If it
cannot pass on a healthy tree, everything you learn from it afterwards is
noise.

**2. Then make it go RED, deliberately.** Break the thing it guards, confirm
the failure, restore. **A guard that cannot fail is not a guard, and one that
cannot pass is broken.** A guard that cannot fail is a statement that
everything is fine, printed unconditionally.

**3. Mutation-check by ADDING a member, not only by renaming one.** A
cross-file scan went green against a wrong implementation because it matched a
variable name that differed by file. Renaming tests one direction; adding tests
the other.

**4. Prove the mutation LANDED.** Re-read the surface through the guard's own
eyes after the edit and confirm the thing really stopped being covered. A
mutation that edits a literal the guard never reads produces a false green that
reads as "the guard is dead". `scripts/feature-mutate.mjs` is the worked
example — 2N mutations, landing check, byte-identical restore.

**5. Judge by EXIT CODE, or count `not ok` under `--test-reporter=tap`.**
**node's default reporter does not print `not ok`.** A harness parsing for it
returned its "could not read" sentinel on all eleven arms and reported them
caught. A second one reported 21 of 21 arms green because it parsed a fail
count the runner never printed, fell through to a `-1` sentinel, and `-1 > 0`
is false.

**6. Restore, and read back.** **`git checkout <file>` between arms reverts to
HEAD and deletes your uncommitted fix.** So does a scratchpad snapshot taken
*before* the fix. Snapshot after, and read back four tokens from the fix every
restore. **A read-back that prints nothing is a failed read-back**, not a quiet
one.

**7. End with the real suite green**, from the real files, and say so.

## The trap that has cost the most here: writing a guard in one state

**A guard run in a single state is a guard whose other states are guesses.**
Three assertions in this repo were written while exactly one example of the
thing existed, and all three were wrong in the same way — each one encoded an
accident of the moment as a rule:

- `work/` must be non-empty. Written while one item existed. It would have gone
  red the moment somebody did the right thing and finished it.
- every skill must declare it "owns X outright". Written while two skills
  existed, both of them content moved out of `AGENTS.md`. It failed on arrival
  of the first skill that was new material.
- every work item must carry all three stages. Written while the only item that
  had ever existed was already at Stage 3. It made an intent-only item — which
  is what Stage 1 *is* — impossible to commit.

Each passed on the day it was written. Each was a guess about states that did
not exist yet, dressed as a check.

Before you commit an assertion, name the states the thing can be in — none of
them, one, several, the first of a new kind — and say which you have actually
run it against. If the answer is "the one in front of me", the guard is not
finished. Construct the others: an empty directory, a second kind, the state
right after the work succeeds.

## Two smells

- **If a check reports a suspiciously perfect result, verify the check.** Every
  false green above announced itself this way first. When the check under
  suspicion is a browser measurement, `/browser-verify` is the procedure.
- **A guard whose failure message does not name what to do instead** teaches
  nothing and gets worked around. Name the escape hatch in the message: the
  budget guard names `scripts/budgets.mjs`, the chart-page hook names
  `scripts/charts.mjs`.

## Worked examples in this tree

- `scripts/feature-mutate.mjs` — the mutation harness this list was written
  from.
- `test/hooks.test.js` — both directions asserted, and the ALLOW cases are real
  commands from this repo's history. They are as load bearing as the DENY ones:
  a hook that ate `grep -n update-budgets` would be switched off within a day,
  and a switched-off hook is worse than none because the prose was deleted on
  the strength of it.
- `test/one-answer.test.js` — guards the split between `AGENTS.md` and these
  skills, in both directions.
