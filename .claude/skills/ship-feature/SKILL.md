---
name: ship-feature
description: >
  Use when building a change end-to-end from a GitHub issue — asks like "ship
  issue #14", "build the ticket #14", or "work the next issue". Reads the issue
  as the source of truth, grills it into a spec with grill-with-docs (or, for a
  small fix, a short brief), then orchestrates the subagent team through build →
  test → refactor → review → PR → notify. The merge step then waits for CI,
  checks the preview, and merges.
---

# Ship a change from a GitHub issue

The pipeline has two halves:

- **Understand** — *with the human.* You grill the issue into a locked, written
  spec. You ask, the human decides.
- **Build → Ship → Verify** — *unattended.* Once the spec is locked this runs on
  its own. You orchestrate the subagents in `.claude/agents/`; you do not write
  the production code yourself.

Run it top to bottom. **Do not start Build until the human confirms the spec**
(in the small lane, the brief) — except for a `ready-for-agent` ticket with
nothing left to ask (step 2), where the ticket is the confirmation. One issue
at a time — `AGENTS.md` § The loop says why.

## The team

`test/sdlc.test.js` holds this table and `.claude/agents/` to each other in both
directions, so a renamed or new agent fails the suite until this table agrees.

| Agent | Job | Writes |
| --- | --- | --- |
| `developer` | builds the change test-first with `/tdd`: tests and code, one slice at a time | `app/`, `scripts/`, `test/` |
| `refactorer` | one behavior-preserving cleanup pass, on green | code and tests |
| `reuse-reviewer` | duplication, missed reuse | nothing |
| `quality-reviewer` | correctness and `REVIEW.md`'s passes | nothing |
| `efficiency-reviewer` | wasted work on hot paths | nothing |
| `doc-writer` | `docs/` and `README.md` catch up with the change | `docs/`, `README.md` |

**Every hand-off to `developer` launches a new one.** Do not message a
`developer` that has already reported, for review findings, a broken proof, a
browser defect or a red CI run: every turn re-sends its whole context (#23's
reused developer cost 28% of all the tokens this project had used). The new
one gets the spec path, the current handoff and the findings verbatim; that is
the whole brief.

## The small-fix lane

Most issues are a few lines, and the whole pipeline costs what a feature costs
(#245: 4 lines of `app/`). So there are two lanes, and step 1 picks one.
**This section is the only place the lane's conditions are written;**
`AGENTS.md` and `REVIEW.md` point here. The small lane is a deliberate trade
against `REVIEW.md`'s "the same passes every time": the quality pass still
runs; the reuse and efficiency passes do not.

A change is **small** when all three hold:

- it changes **at most 20 lines outside `test/` and `docs/`** (`app/`,
  `scripts/`, `.claude/`, config);
- it changes no logic in the four pure modules `AGENTS.md` § Rules names, nor
  in `state.js` or `live.js`;
- after step 2's grilling, the issue says what "done" looks like, with a
  concrete value.

Step 1's line count is an estimate; the diff decides.

In the small lane:

| Skipped | Kept |
| --- | --- |
| the spec file: the issue and the PR body are the record | step 1's survey, and grilling whatever the survey leaves open |
| `refactorer` | a new `developer`, test-first with `/tdd` |
| `reuse-reviewer`, `efficiency-reviewer` | `quality-reviewer`, judging the diff against the issue |
| `doc-writer`, unless a file under `docs/` or `README.md` names what changed | the proof pair, once per commit, by you |
| | `/code-review` and `/security-review`, by you (step 7) |

**Wherever the steps below or an agent file say "spec", the small lane
substitutes:**

- **the spec** (steps 4, 5, 7, and `developer.md`/`quality-reviewer.md`):
  the issue with its comments, plus a short brief you write that lists each
  acceptance value and **the seam that tests it** — what a spec's Proof would
  have named; coach-facing work defaults to the Coach seam (`AGENTS.md` §
  Test seams). Pass the brief to every agent in place of a spec path, and tell
  them the issue's acceptance values stand in for **What would settle it**;
- **step 3:** not run. Show the human the brief and get the go-ahead, unless
  the issue is `ready-for-agent` with nothing left to ask;
- **step 6:** no `refactorer`; commit with no spec file to stage;
- **step 7:** launch `quality-reviewer`, plus `doc-writer` only when a doc
  names what changed; run both review skills as usual;
- **step 10:** the PR body names the lane.

**If it grows past the limit mid-build, switch to the full lane there:** write
the spec, run the `refactorer`, then all three reviewers and the `doc-writer`.
The PR body says it switched.

## Understand

1. **Read the issue** — body *and* comments:

   ```bash
   gh issue view "$ISSUE" --comments
   ```

   List the fuzzy terms, the contradictions, the unstated thresholds, and
   every claim about the tree — then **survey the claims before grilling**. A
   claim the code does not support is a question for the human, not a
   requirement.

   If the issue is a `ready-for-agent` ticket, also read its parent issue (the
   spec `/to-tickets` cut it from) and every closed blocker's pull request: the
   decisions live there, and a blocker may have changed the tree the ticket
   describes.

   Then **pick the lane** (§ The small-fix lane).

2. **Grill only what is still open.** A `ready-for-agent` ticket was decided
   with the human before it was published. If the survey holds up every claim
   and each acceptance criterion has a concrete value, there is nothing to ask:
   skip to step 3 (small lane: step 4) and do not wait for a go-ahead.
   Otherwise, grill just the falsified claims and the missing values. Any other
   issue is grilled in full.

   **Grill it** with `/grill-with-docs`: one question at a time, each with your
   recommended answer; facts get looked up, decisions go to the human. Terms go
   to `CONTEXT.md`; a hard-to-reverse trade-off gets an ADR in `docs/adr/`
   (sparingly — `/domain-modeling` says when). **Do not proceed until the
   human says it is locked.**

3. **Write the spec** to `docs/specs/<issue>-<slug>.md`, in this shape:

   - **Issue** — `#N`, and one sentence of what it asks.
   - **Goal** — the outcome, in a coach's terms where there is a coach in it.
   - **What would settle it** — the acceptance test, with concrete values: a
     roster size, a viewport width, a byte count, the exact copy. An item
     without this is not ready to build.
   - **Surfaces** — the files that change, and the ones that must not.
   - **Constraints** — the `AGENTS.md` rules this touches, applied rather than
     restated (the card, mobile first, the privacy claim, the four pure
     modules), and every **"reuse X / do not re-derive Y"**.
   - **Design** — what gets built.
   - **Proof** — the **seams** `/tdd` builds at, agreed here so the build can
     run unattended: for each, where the test runs from (a module's exports
     under `node --test`, a named smoke check, a `/browser-verify` step) and
     which **What would settle it** items it covers. Coach-facing work
     defaults to the Coach seam (`AGENTS.md` § Test seams). A test that reads
     source instead of running it is a seam only if it is named here, and is
     then a guard under `/new-guard`.
   - **Out of scope** — what the grilling decided not to do.

   For a ticket, **What would settle it** is its acceptance criteria. If the
   ticket names `docs/interface-guidelines.md` rules, **Constraints** include
   them.

   Leave the spec, `CONTEXT.md` and any ADR on disk, uncommitted. Get the
   human's go-ahead — unless step 2 found nothing to ask, in which case build.

## Build

> The spec on disk is the whole handoff. Start this half in a **fresh
> session** pointed at the spec: if the build reaches for something only the
> chat knew, the spec was incomplete.

4. **Branch and read.** `git switch -c issue-<N>-<slug>` from an up-to-date
   `main`. Read the spec and `AGENTS.md`. Pull out every "reuse / do not
   re-derive" constraint and every `AGENTS.md` trap the Surfaces list walks
   into — they go to the developer **verbatim, up front**, not buried in prose.

5. **`developer`** builds it test-first, with `/tdd`, over the seams in the
   spec's **Proof**. Its prompt carries the spec path and those constraints.
   Wait until it reports each slice's test and the failure it saw before the
   code existed, and a green `npm test`. A slice whose reported failure is an
   import error or a typo rather than the behavior's assertion never saw red:
   send it back. The build also settles "Would a coach notice this?" (the
   section below): an entry, or the opt-out line.

6. > **Refactor on green, once.** Hand the change to **`refactorer`**:
   > production first (the suite is the oracle), then tests (production frozen,
   > keep every case). Keep the instruction generic — "improve the internal
   > structure without changing behavior". `refactorer.md` owns its hand-back
   > condition. Run it here, never in the fix loop.

   **Prove and commit.** You run the proof pair here (`AGENTS.md` § Layout);
   no agent before this point ran it. Green: stage explicit paths, including
   `docs/specs/<N>-<slug>.md`, and commit. Record the **handoff**: `git
   rev-parse HEAD`, that `git status --porcelain` printed nothing, and the
   smoke table as printed (its `node --test` row carries the suite's pass
   count). Every agent launched from here on gets that handoff verbatim.

7. **Review and docs, in parallel.** Build one diff per changed file, not one
   combined diff — step 6 committed the change, so `git diff HEAD` is empty
   here:

   ```bash
   rm -rf .review && mkdir .review
   git diff --stat main...HEAD > .review/stat.txt
   git diff --name-only main...HEAD | while read -r f; do
     git diff main...HEAD -- "$f" > ".review/$(printf %s "$f" | tr / _).diff"
   done
   ```

   In **one** message, launch `reuse-reviewer`, `quality-reviewer`,
   `efficiency-reviewer` and `doc-writer`, passing the absolute path of
   `.review/`, the spec path and **the handoff from step 6** to each — told to
   read `stat.txt` first and then only the diff files it needs.
   `quality-reviewer` also judges the tests against `/tdd`'s anti-patterns:
   implementation-coupled, tautological, and a source-reading test the spec
   did not name as a seam.

   While they work, run **`/code-review <branch>`** and
   **`/security-review`** yourself. Neither reads `REVIEW.md`, so grade each
   finding with its severity, then write the ones that survive verification to
   `.review/skills.md`, next to the diffs step 8 hands on. A skill that finds
   nothing still gets a line there, saying it ran clean.

   When the diff touches anything a coach sees (`app/**` other than
   `sw.js`), take pictures first: with `npm run serve` running, run `node
   scripts/look.mjs --url http://127.0.0.1:8201 --widths 320,390 --font 16,32
   --view <the views the diff touches> --out .review/look` (add `--dark` when
   colors change), and hand `quality-reviewer` the absolute path of
   `.review/look` too. Use long, real-length made-up names (e.g. "Alexandria
   Montgomery-Okafor"), and shoot each sheet scrolled to the bottom and at
   full height. Clipping or cramped wrapping is a blocker, not a note.
   `AGENTS.md` § Layout says how to read `measurements.json`.

8. **Fix, once.** Actionable findings, from the reviewers and from
   `.review/skills.md` alike, go to a new `developer`, handed the same
   `.review/` directory step 7 built, which fixes them the same way it built:
   a failing test first where the finding is a behavior. At most one pass. A
   `REVIEW.md` **Blocker** that survives it stops the run: report it in the
   wrap-up rather than shipping.

   **Prove and commit again**, the same way as step 6, including every file
   `doc-writer` changed, with a fresh handoff. Only when nothing was
   actionable **and** `git status --porcelain` is still empty is the tree
   exactly what step 6 proved: keep that handoff and go on to step 9.

9. **Verify what a harness cannot.** `/browser-verify` for anything a reader
   sees. Cite the current handoff for the proof pair rather than running it
   again.

## Would a coach notice this?

This is the one place that says so; anything else points here. A coach notices a
change if they could see it or feel it: a new screen, setting, rule or wording,
a plan that comes out differently, a layout that moves, a bug they could have
hit. They do not notice a refactor, a test, a guard, a doc or the harness.

- **If they would:** the same PR adds one entry to `scripts/whats-new.json`
  (newest first: `{ "date": "YYYY-MM-DD", "text": "<one or two short
  sentences>" }`, no markup, no issue numbers), runs `npm run whats-new` to
  rewrite `app/whats-new.html`, and moves the What's new page's `<lastmod>`
  in `app/sitemap.xml` to the entry's date.
- **How an entry reads.** Write for a volunteer parent coach who has used the
  app twice. Say what they can now do or will now see, and where ("New in
  Settings: …", "During the game, …"). Use the words a coach says: "change the
  plan", "sub", "on the bench", "quarter or half". Not our words: re-plan,
  stint, cap, pin, By hand, bench mode, toast. A setting's name may appear
  only after the sentence has said what it does. One change per entry; if it
  needs "and" twice, split it.
- **If they would not:** put one line that starts `No coach note:` and gives
  the reason (`No coach note: harness only`) in a commit message, so
  `npm run check:history` passes before the PR exists, and in the PR body,
  which is what CI reads. A bare `No coach note:` does not count.

`scripts/check-whats-new.mjs` (in `npm run check:history` and the `history` job)
fails a PR that changes a coach-facing path under `app/` and has neither.

## Ship

10. **Open the PR.** This pushes what the proof points already committed. In a
    batch, local CI (step 11) is green on this commit first.

    ```bash
    npm run check:history
    git push -u origin "$(git branch --show-current)"
    gh pr create --base main --title "<what changed>" --body-file <body.md>
    PR=$(gh pr view --json number -q .number)
    ```

    Write the body with the `pr` skill's template, in plain words a newcomer
    can follow. Evidence is what you ran and what it printed, before and
    after. The body ends with `Closes #N`, and nothing after it.

11. **Prove the pushed commit.** In a batch, run local CI
    (`scripts/lanes/ci-local.sh <worktree>`, the same five checks GitHub runs)
    on the commit before you push it, and again after any later commit or
    rebase; never push a commit whose local CI is red. Its GREEN line goes in
    the PR's Evidence. Outside a batch, the proof pair from step 6 or 8
    already names this commit.

## Wrap up

12. **Notify, and stop.** One PR comment that @mentions `@kylehoehns`: the PR
    and issue, the local proof, and the final commit sha. The run ends here.
    It does not wait for GitHub CI or the preview deploy: the merge step
    waits for both. **Do not merge and do not approve** — `REVIEW.md` says
    the approval is a human's.

## The merge step

Whoever merges runs `scripts/lanes/merge-one.sh <PR>`: the orchestrator in a
batch, the human otherwise. In order, it:

1. waits until the five `tests` jobs (`node 24`, `smoke`, `evals`,
   `service worker behind redirects`, `checks that need history`) pass on a
   head that contains `main`. Red is exit 1; behind `main` is exit 3;
2. runs the preview check, `scripts/lanes/preview-check.mjs <PR>`. It waits
   for Cloudflare's `Workers Builds: benchcard` check on the head commit and
   for `https://<branch>-benchcard.kyhoehns.workers.dev` to serve that build,
   picks the pages the PR changed, shoots them at 390×844 with `look.mjs`,
   fails on cut-off text or a console error, and posts what it measured as a
   PR comment. A failure is exit 4, and nothing is merged;
3. squash-merges, prints `merged #N as <sha>`, and watches `main` (§ A batch
   of tickets, **Watch `main` after each merge**): `main green + deployed at
   <sha>`, or exit 2 with `MAIN RED`.

Where the human has not allowed the merge, run `node
scripts/lanes/preview-check.mjs <PR>` alone: it posts the same comment and
merges nothing.

**When the merge step stops on red** (exit 1 or 4), the PR goes back to a
build run. Fix from the real log, never a guess:

```bash
RUN=$(gh run list --branch <branch> --workflow tests --limit 1 --json databaseId -q '.[0].databaseId')
gh run view "$RUN" --log-failed
```

or from the preview comment. Fix, prove, push, and run the merge step again.
**Three attempts at most**; then stop and report.

## A batch of tickets

When the human hands over a list of tickets and says the PRs may be merged,
they run as lanes: `scripts/lanes/lane.sh <issue> <branch> <port>` makes each
ticket its own worktree and lane prompt, and the lanes build in parallel. Each
is still one issue, one spec (or small-lane brief) and one PR. What stays
serial:

- **Chrome-heavy runs share one machine-wide slot**: `ci-local.sh` takes it,
  and any other smoke or look run goes through `scripts/lanes/ci-slot.sh`.
  Two at once starve each other's Chrome and fail on timing.
- **Merge one at a time,** with the merge step (§ The merge step).
- **Watch `main` after each merge.** No person is watching it. The merge step
  watches it for you and exits 2 with `MAIN RED` when it fails; find that run
  with `gh run list --workflow tests --commit <sha> --json databaseId`. Then
  run `npm run flakes`. When a failing name shows two or more failures there
  (this run and at least one before it), rerun the failed jobs once (`gh run
  rerun <id> --failed`) and watch again. Otherwise, or if the rerun fails too,
  treat it as a real break: file an issue naming the run and the failing test,
  and merge nothing more until it is understood.
- **After each merge, the next lane rebases onto `main`,** then proves again.
- **Remove the worktree** once its PR is merged.

Step 12's "do not merge" is the default; only the human's word for this batch
lifts it.
