# #295 — Build loop starts from a failing scenario

## Issue

#295 (sub-issue of #293): an agent running `/ship-feature` on a coach-facing
ticket writes a failing Coach scenario first, then the code, and adds a unit
test only for pure logic with many input cases. `AGENTS.md` says which seam to
test at.

## Goal

The developer agent stops guessing where a test goes. For anything a coach
taps or reads, its first red test is a scenario a coach would recognize, not a
unit test of a handler. The rule is written once, in `AGENTS.md`, and the
skill and the agent point at it.

## What the survey found

On `main` (7306a47, which has the pilot from #292 / #294):

- `AGENTS.md` names no test seam. It says `/tdd` builds "at a seam the spec
  named" (§ What is enforced) and § Guards sends guards to `/new-guard`, but
  nothing says which seam a coach-facing change should use.
- `test/coach.js` is the Coach driver; `test/roster-scenarios.test.js` and
  `test/game-day-scenarios.test.js` are the two pilot journeys. No harness doc
  mentions any of them.
- `/ship-feature` step 3's **Proof** is where seams are agreed (the "test-seam
  question" the ticket means). The small lane's brief names "the seam that
  tests it". Step 5 hands the developer "the seams in the spec's Proof".
- `.claude/agents/developer.md` § The loop takes the spec's Proof as the seam
  confirmation `/tdd` asks for, and lists seams as "a module's exports under
  `node --test`, a smoke check, a browser step". It has no Coach seam.
- `/tdd` and `/to-spec` are Matt Pocock's skills, copied in unchanged
  (`AGENTS.md` § What is enforced). They stay unchanged.
- `test/one-answer.test.js` already guards "one answer in one place" with
  owned markers over every harness doc, including `.claude/agents/` and every
  skill. A marker owned by `AGENTS.md` fails if it is missing there or
  appears in any other harness doc.

Every claim in the ticket holds. Nothing is left to ask.

## What would settle it

1. `AGENTS.md` has one short section, `## Test seams`, naming the two seams:
   Coach scenarios (`test/coach.js`) for anything a coach taps or reads, and
   `node --test` for pure functions with many input cases. It says smoke
   keeps layout and visuals (overflow, clipping, dark mode, text size).
2. `/ship-feature` and `.claude/agents/developer.md` each say that a
   coach-facing slice starts from a red scenario, and point at `AGENTS.md`
   § Test seams rather than restating it.
3. `/ship-feature` step 3's **Proof** (and the small lane's brief) defaults
   to the Coach seam for coach-facing work.
4. The seam rule has one copy: its markers appear in `AGENTS.md` and in no
   other harness doc, and `test/one-answer.test.js` fails if a copy is
   planted in another one.

## Surfaces

- Change: `AGENTS.md`, `.claude/skills/ship-feature/SKILL.md`,
  `.claude/agents/developer.md`, `test/one-answer.test.js`.
- Must not change: `app/` (no coach-visible change, so no precache bump),
  `.claude/skills/tdd/`, `.claude/skills/to-spec/` (upstream copies),
  `test/coach.js` and the scenario files, smoke.

## Constraints

- **One answer in one place** (`CLAUDE.md`). The rule's wording lives only in
  `AGENTS.md`; the two others carry a pointer plus the one instruction the
  ticket asks them to carry (start from a red scenario).
- The new check in `test/one-answer.test.js` judges the tree, so it is a
  guard: `/new-guard` applies, including seeing it fail.
- Reuse the existing `OWNED` table and `flat` from `test/prose.js`; do not
  write a second one-answer guard.
- American spelling (`test/spelling.test.js`).
- Keep `AGENTS.md` short: this is one short section, not a tutorial on the
  driver. The driver's own header comment documents its verbs.

## Design

A new `## Test seams` section in `AGENTS.md`, after § The loop:

- Coach scenarios are the main seam for anything a coach taps or reads. A
  scenario drives the app through `test/coach.js` and asserts only what is on
  screen or saved across a reopen. A screen with no verb yet gets one added
  to the driver.
- `node --test` on a pure function is the second seam, used only when it has
  many input cases (the engine, roster-line parsing, Filing, the wording
  builders). A unit test of a handler or of rendering is not added beside a
  scenario that covers it.
- Smoke keeps layout and visuals. Guards go to `/new-guard`.

`/ship-feature` step 3's **Proof** bullet and the small lane's brief say the
default seam for coach-facing work is the Coach seam, pointing at
`AGENTS.md` § Test seams. Step 5 says each coach-facing slice starts from a
red scenario.

`developer.md` § The loop says the same: a coach-facing slice's first test is
a red scenario, with a pointer to `AGENTS.md` § Test seams, and the Coach
seam joins its list of seams.

`test/one-answer.test.js` gets the section's specific phrases as `OWNED`
markers owned by `AGENTS.md`, plus one test that both the skill and the
developer agent point at `AGENTS.md` § Test seams.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| `OWNED` markers for the section, red before the section exists | `node --test test/one-answer.test.js` | 1, 4 |
| a planted copy of a marker in `developer.md` turns the "nowhere else" test red, then is removed | `node --test test/one-answer.test.js` (guard falsified by hand, `/new-guard`) | 4 |
| pointer test: `ship-feature` and `developer.md` name `AGENTS.md` § Test seams, red before they do | `node --test test/one-answer.test.js` | 2, 3 |
| reading the three files' diff against items 1-3 | `quality-reviewer` | 1, 2, 3 |
| the proof pair | orchestrator | all |

## Out of scope

- Pruning unit tests that scenarios cover (#296-#304, each journey's own
  ticket).
- New driver verbs or scenarios.
- Changing `/tdd` or `/to-spec` (upstream copies).
- The reviewer agents' briefs: the ticket names only `/ship-feature` and the
  developer agent.
