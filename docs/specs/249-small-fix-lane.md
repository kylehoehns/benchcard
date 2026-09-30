# #249 — a small fix takes a lighter path through /ship-feature

## Issue

#249: give `/ship-feature` a lighter path for small fixes, so a 4-line change
doesn't cost what a feature costs.

## Goal

A small fix ships with one spec-free PR, one developer, one reviewer and the
same proof pair as everything else. Coaches get small fixes sooner; nothing a
coach relies on is checked less.

## What the survey found

- #245 changed 4 lines of `app/index.html`. It also carried a 35-line spec,
  an `sw.js` bump, a docs edit, two smoke edits, a developer, a refactorer,
  three reviewers, a doc-writer and a preview check.
- The rule that every change carries a spec is written in three places, not
  one: `AGENTS.md` § The loop ("The spec ships in the same pull request"),
  `REVIEW.md` pass 7 (a diff doing something no spec asked for is Important),
  and `.claude/skills/ship-feature/SKILL.md` step 3. Each needs the exception,
  or a small-lane PR is an Important finding under its own review.
- Nothing mechanical checks for a spec: no test, script or hook reads
  `docs/specs/` to require one. So this is a prose change only.

## Decisions (made with the human)

1. **Small** means all three: at most **20 changed lines outside `test/` and
   `docs/`** (`app/`, `scripts/`, `.claude/`, config); no change to the logic
   of `engine.js`, `state.js`, `storage.js` or `live.js` (a `sw.js` version
   bump from `npm run sw:bump` does not count against the lane); and the issue
   already states what "done" looks like with a concrete value.
2. **Builder:** a `developer` agent, test-first as now. **No refactorer.**
3. **Reviewers:** `quality-reviewer` only. `doc-writer` runs only when a file
   under `docs/` or `README.md` names the thing that changed.
4. **Preview check** (step 12) stays when a coach can see the change; it is
   skipped for a change nobody sees (harness, tests, scripts).
5. **Overflow:** a change that grows past the limit mid-build switches to the
   full lane at that point: write the spec, run all three reviewers. The PR
   body says it switched.
6. `npm test` and `npm run smoke` run in both lanes. They are not optional.

## What would settle it

- `SKILL.md` has a section that states the three conditions above with the
  number 20, names what the small lane skips (spec file, refactorer, reuse and
  efficiency reviewers, doc-writer unless a doc names the change) and what it
  keeps (developer test-first, quality reviewer, the proof pair, the preview
  check when a coach sees the change), and the overflow rule.
- `SKILL.md` step 1 decides the lane, and the PR body names it.
- `AGENTS.md`'s spec rule and `REVIEW.md` pass 7 each say a small-lane change
  carries no spec and is judged against its issue, and point at the skill
  rather than repeating the conditions. The conditions are written once.
- Replaying #245 through the new text: 4 app lines + `sw.js` bump qualifies;
  it would ship with no spec, a developer, one reviewer, the proof pair, and
  the preview check (the logo is visible).
- `npm test` passes (the `sdlc.test.js` team table still agrees with
  `.claude/agents/`).

## Surfaces

Changes: `.claude/skills/ship-feature/SKILL.md`, `AGENTS.md`, `REVIEW.md`, this
spec. Must not change: `app/`, `.claude/agents/`, the team table in
`SKILL.md`, the hooks.

## Constraints

- One answer in one place: the lane's conditions live in `SKILL.md` only.
  `AGENTS.md` and `REVIEW.md` point at it.
- No precache bump: no file under `app/` changes.
- The proof pair still runs once per commit, by the orchestrator.

## Proof

No new test. The change is prose that an agent reads, and a test that greps
the skill for "20" would be the kind of source-reading guard that makes prose
rigid without showing the lane works. Proof is `npm test` (team-table guard
still green), `npm run smoke` (unchanged), and a reviewer reading the replay
of #245 against the new text.

## Out of scope

- Dropping the second CI run on `main` (discussed and declined: the PR run
  already tests the merged tree, and the second run costs nobody time).
- Pruning existing specs or harness-testing tests.
