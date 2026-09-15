# 49 — Build test-first, drop the guard-falsifier, prove once per commit

## Issue

#49: make `/tdd` how `/ship-feature` builds, remove the `tester` and
`guard-falsifier` agents, and run the proof pair once per commit instead of
after every agent.

## Goal

A ticket like #22 spends its time building, not re-checking. Tests are written
one at a time, each seen to fail for the right reason before its code exists,
at seams the spec agreed. The full proof pair runs once per commit.

## Evidence (#22, 2026-09-15)

- `guard-falsifier`: 29 min, then a 38 min fix pass (tester 22, developer 16).
  It found 22 surviving mutations, all in tests written that day. Most were
  source-reading regex tests. It found no app defect.
- The app defects came from elsewhere: the stale Settings back target from
  the Claude review, and the third Backup box from `/browser-verify`.
- The one falsifier finding test-first would not have prevented is the
  settings-row smoke check passing on zero rows. `/new-guard` rule 2a now
  covers that class.
- About twelve proof pairs ran for one ticket. Every agent ran one before
  handing back, and the committer ran another on the same bytes.

## What would settle it

1. `.claude/skills/tdd/` holds `SKILL.md`, `tests.md` and `mocking.md`
   byte-identical to `skills/engineering/tdd/` in mattpocock/skills at
   3216582. Its `agents/openai.yaml` is not copied, because it is for another
   tool.
2. `.claude/agents/tester.md` and `.claude/agents/guard-falsifier.md` are
   deleted, and `/ship-feature`'s team table has no row for either. The
   `developer` row writes `app/`, `scripts/` and `test/`.
3. `developer.md` builds with `/tdd` over the seams named in the spec's
   **Proof**. It treats that section as the seam confirmation `/tdd` asks for.
   It reports each slice's test name and the failure it printed before the code
   existed, and runs `npm test` once before handing back.
4. No file in `.claude/agents/` tells an agent to run the proof pair.
   `AGENTS.md` § Layout says the proof pair runs once per commit, by whoever
   commits, and that work handed to someone else gets `npm test` once.
5. `/ship-feature`:
   - The spec template's **Proof** names seams.
   - Step 5 is the test-first build, and there is no tester step.
   - Step 7 launches no falsifier, and `quality-reviewer` judges tests against
     `/tdd`'s anti-patterns.
   - Step 8's fix goes to `developer`.
6. `/new-guard` scopes itself to checks that judge the tree and points
   behaviour tests at `/tdd`. It gains rule 2a: a check that measured nothing
   fails.
7. `AGENTS.md` names `/tdd`, so `test/one-answer.test.js` passes.
   `test/sdlc.test.js` passes with the smaller team.
8. `npm test` passes.

## Surfaces

- Change: `AGENTS.md`, `.claude/skills/ship-feature/SKILL.md`,
  `.claude/skills/new-guard/SKILL.md`, `.claude/agents/developer.md`,
  `.claude/agents/refactorer.md`.
- Add: `.claude/skills/tdd/`.
- Delete: `.claude/agents/tester.md`, `.claude/agents/guard-falsifier.md`.
- Must not change: anything under `app/`, `scripts/` or `test/`. The history
  comments that mention a guard-falsifier run in `scripts/smoke-checks.js` and
  `test/one-answer.test.js` stay; they describe what happened.

## Constraints

- **Matt Pocock's skills are copied unchanged** (`AGENTS.md` § the skills
  paragraph).
  - `/tdd` refers to `codebase-design` and `code-review` skills. Neither lives
    in this tree, and neither is written as a `/name` reference, so
    `one-answer.test.js`'s resolver does not read them.
  - Here, the refactor stage it hands off to is `refactorer`.
- **One answer in one place.** When tests run is stated once, in `AGENTS.md`
  § Layout. Agent files point at it.

## Proof

Only harness docs change; nothing under `app/` or `scripts/smoke*` does. So by
`AGENTS.md` § Layout this is `npm test` alone. Its seams are:

- `test/sdlc.test.js`: the team table matches `.claude/agents/`.
- `test/one-answer.test.js`: skills are named, and owned facts are not copied.
- `test/hooks.test.js`: unchanged.

## Out of scope

- A developer screenshot at hand-back.
- A `timeout-minutes` on `claude-code-review.yml`.
- Running tickets in parallel.
