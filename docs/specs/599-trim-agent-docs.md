# #599 — Trim AGENTS.md and ship-feature to rules that change what an agent does

## Issue

#599 asks to cut `AGENTS.md`, the ship-feature skill and the lane template down
to lines that change what an agent does, with no rule written in two places.

## What would settle it

- `AGENTS.md` and `.claude/skills/ship-feature/SKILL.md` are smaller (bytes,
  before and after, in the PR).
- No rule says the same thing in two of the three files.
- Every removed or moved rule is listed below with its reason.
- `npm test` and local CI are green; every test and hook that reads these
  files passes without being weakened.

## Proof

The existing guards over these files, run unchanged: `test/one-answer.test.js`
(owned markers, `## Test seams`, skill index, trap headlines),
`test/hooks.test.js` (the "What is enforced" rows for `guard-edit.sh` and
`after-edit.sh`), `test/sdlc.test.js` (the team table) and `test/lanes.test.js`
(the template's placeholders). Then local CI.

## Choices the issue did not make

- Docs-only change, so the orchestrator edited the prose directly instead of
  launching a `developer`, and skipped the `refactorer` (nothing to refactor in
  prose). Review was light: `quality-reviewer` and `reuse-reviewer` only.
- Where a Rules bullet and a "What is enforced" row said the same thing, the
  table row is now the one statement and the hook's deny message carries the
  why. The hooks' pointers moved from "Rules" to "What is enforced".
- Smoke-harness reference moved to `scripts/smoke/README.md`, which
  `AGENTS.md` already pointed at for the smoke rows.
- The look-check rule (long names, scrolled to the bottom, full height) moved
  from the lane template into ship-feature step 7, so it applies outside a
  batch too. "Never quote the owner" moved from the lane template to
  `AGENTS.md` § Rules, so it applies to every agent.
- § The merge step in ship-feature is left word for word, job names included,
  so open #618 (which edits it) lands without a conflict.
- #615's suggested `lastToast()` clause for § Test seams was not added: the
  driver's verb list in `test/coach.js` already documents it.

## Removed or moved

### AGENTS.md

| Rule or passage | Now | Why |
| --- | --- | --- |
| Intro "Open work is GitHub issues" | removed | said again in § The loop |
| Loop: read the issue with its comments | ship-feature step 1 | the procedure says it |
| Loop: tickets are vertical slices with native dependencies | § Agent skills, `docs/agents/issue-tracker.md` | said there |
| Loop: spec is written after `/grill-with-docs`; ready-for-agent exception; What would settle it; CONTEXT.md and ADRs | ship-feature steps 2–3 | the procedure says it |
| Loop: "Finish it, hand it back"; "Finished work is the closed issue, its PR and git log" | removed | no-op |
| Loop: `lane.sh` and what `scripts/lanes/` holds | ship-feature § A batch of tickets | lane procedure |
| Loop: branch, commit, push, open PR, let checks report; same passes and severity | ship-feature steps; `REVIEW.md` | said there |
| Rules: "Verify in a real browser. Screenshot layout changes." | merged into § The loop's Proof | same meaning as Proof |
| Rules: no trailers; PR body ends at `Closes #N` | the "What is enforced" rows | hook-enforced; one statement |
| Rules: stage explicit paths, with why | table row; why in the `guard-bash.sh` deny message | hook-enforced |
| Rules: third-party code only through `fetch.sh` | table row; why in the `guard-edit.sh` deny message | hook-enforced |
| Rules: American spelling everywhere | table row | hook and `test/spelling.test.js` enforce it |
| Rules: one writer at a time, and its why (a second writer reverted an uncommitted fix) | table row; why in the `session-start.sh` header | hook reports it |
| Rules: privacy claim's file counts (9, 31), comment and regex scope, guard history | `test/analytics.test.js` | the test owns the detail; counts go stale |
| Enforced: paragraph on `hooks.test.js` ALLOW cases | `test/hooks.test.js` header | said there |
| Layout: directory tree block | removed | `ls` shows it |
| Layout: the list of what smoke checks | `scripts/smoke/README.md` index | the index is the list |
| Layout: entry point, one module per check, size `LIMIT` | `scripts/smoke/README.md`, `test/smoke-size.test.js` | said or enforced there |
| Layout: SEED and RICH fixtures, `land()`, reset to rich | `scripts/smoke/README.md` | needed only when writing a check |
| Layout: pinned clock (#178) | `scripts/smoke/README.md` | same |
| Layout: timeout, SIGKILL watcher, reaping | `scripts/smoke/README.md` (one sentence stays) | same |
| Layout: 32px app pass, `STRANDED_ABOVE`, the twelve other pages | `scripts/smoke/README.md` | same; the allow-map rule stays in AGENTS.md |
| Layout: "Bartholomew-Christopherson" measurement | removed | the #131–#150 count carries the reason |
| Layout: CI sharding (#459) | `docs/operations.md` § Testing, smoke README | said there |
| Layout: per-file coverage table; `--only` prints no coverage row | removed | the output shows it |
| Layout: budgets history (#35, #37, `budgets.json` erasing the pin) | removed | the rule (re-pin, never widen) stays |
| Layout: compare-shots measurement details (#86) | removed | the script does it; pointer stays |
| Traps: "every one has cost iterations, none is restated" | removed | no-op |
| Guards: the five failure ways listed | `/new-guard` | it owns them |
| Judgement: two anecdotes (verified-it-worked, `app.css` device claims) | removed | one example per bullet kept |
| Deploy: the four dashboard commands, "confirmed 2026-08-24, keep three copies in step" | `wrangler.jsonc` header, `docs/operations.md` § Deployment | two copies, not three |
| Loop: "neither is optional" | § Layout's iterate-then-prove rule | one answer to when each half runs |
| Loop: "Its body says `Closes #N`" | the "What is enforced" row | one statement |
| Agent skills: a paragraph per Matt Pocock skill; `/address-review`'s verify-first | the names stay; each skill's own description | the skill says it |
| Layout: design-decisions side-file rule | `docs/design-decisions.md` § Side files | said and tested there |
| Layout: serve's 60-minute stop, `--ttl`, bare `&`; the why "a local server that disagrees with production…" | `docs/operations.md` | said there; the redirect fact stays |
| Layout: smoke's own server is "immune to the stale-service-worker trap"; "do the hand checks it covers only when it fails" | removed | no-op beside the iterate-then-prove rule |
| Layout: `npm test` from the root, no dependencies | removed | `package.json` |
| Layout: "a main-frame navigation with no coverage taken fails the row" | `scripts/smoke/README.md` | said there |
| Layout: the CI job is named `smoke` for the ruleset | removed | `test/ci-config.test.js` guards it |
| Layout: `--timeout` and the run closing its Chrome | `scripts/smoke/README.md` § Ending | said there |
| Layout: look.mjs flags, PNG per cell, exit code (#180) | `node scripts/look.mjs --help` | the script says it |
| Layout and Traps: anecdotes (#22's twelve pairs, the 228px pan, seven of ten red runs, the 61% ceiling) | shortened to the reason alone | the rule stays |
| Traps: check-whats-new fails a change with no entry | `/ship-feature` § Would a coach notice this? | said there |
| Deploy: build fails without the `unbuilt` line; `app/` never rewritten; 77% of gzipped bytes | removed | `scripts/build.mjs` behavior and history |

### ship-feature SKILL.md

| Rule or passage | Now | Why |
| --- | --- | --- |
| Intro: issues are fuzzy and get falsified | `AGENTS.md` § The loop | said there |
| #23 developer anecdote (seven rounds, 964k tokens) | one clause | the rule stays |
| Step 1: "Do not resolve the gaps yourself"; "A small change skips step 3" | merged; the lane table says it | duplicate |
| Step 3: "a ticket that touches nothing a coach sees names none" | removed | no-op |
| Step 5: each coach-facing slice starts red | `AGENTS.md` § Test seams | said there |
| Step 6: what the proof pair contains; the hook denies `git add -A` and trailers | `AGENTS.md` § Layout and § What is enforced | said and enforced there |
| Step 7: a 60 KB diff is read in parts | `guard-read.sh` | hook-enforced |
| Step 7: review skills "run in this session" | removed | no-op |
| Step 10: template section names and upstream source | the `pr` skill | the names were already stale |
| Step 10: `No coach note:` placement | § Would a coach notice this? | said there |
| Step 10: `guard-bash.sh` denies a footer; "the body ends with `Closes #N`" | `AGENTS.md` table | enforced; one statement |
| Step 11: "the same five checks"; merge step: "local green is not CI green" | the merge step waits for the `tests` jobs | it enforces this |
| Build preface: a fresh session "keeps the unattended run clean" | removed | the instruction stays |
| Merge step: history checks need a base ref | `AGENTS.md` § Traps | said there |
| Batch: `git worktree add` | `scripts/lanes/lane.sh` | the script does it |
| Batch: proof pair one lane at a time | the `ci-local.sh` / `ci-slot.sh` slot | the slot enforces it |
| Batch: "Never approve" | step 12 | said there |

### lane-template.txt

| Rule | Now | Why |
| --- | --- | --- |
| Local CI runs five checks, before the PR and after each push, never push red, GREEN line in Evidence | ship-feature step 11 | one statement |
| Do not wait for GitHub CI or the preview | ship-feature step 12 | said there |
| Never quote the owner | `AGENTS.md` § Rules | applies to every agent |
| No trailers | `AGENTS.md` table, `guard-bash.sh` | hook-enforced |
| PR body: `pr` template, global CLAUDE.md rules, 400 words, ends at `Closes #N` | ship-feature step 10, the `AGENTS.md` table; global CLAUDE.md loads on its own | duplicate |
| GREEN line "(sha and time)" | `ci-local.sh` prints it | the script says it |
| `ci-local.sh` refuses when behind or dirty | the script's refusal message | the script says it |
| Servers and Chromes stop on their own (#595) | `docs/operations.md`, `scripts/smoke/README.md` | said there |
| Look checks with long names, scrolled to the bottom, full height | ship-feature step 7 | one statement, outside batches too |
| SKIP-OK: "GitHub's checks must still all pass" | the merge step | it enforces this |
| DO NOT MERGE and do not approve; merge-one runs the preview check | ship-feature step 12 and § The merge step | said there |

## Kept because a check needs it

- The `guard-edit.sh` and `after-edit.sh` table rows saying "not a shell
  write": `test/hooks.test.js`.
- `## Test seams` and its wording ("taps or reads", "many input cases"); the
  `document.fonts.ready`, "so the proof pair skips them", `benchcard-${SHELL}`
  and "a window of source is not a scope" passages; the six browser-trap
  headlines; a `/name` for every skill: `test/one-answer.test.js`.
- `## The team` table: `test/sdlc.test.js`.
- `## Agent skills`: `/setup-matt-pocock-skills` looks for it.

## Out of scope

`REVIEW.md`, the agent files (beyond one pointer in `developer.md`), and the
other skills.
