---
name: ship-feature
description: >
  Use when building a change end-to-end from a GitHub issue — asks like "ship
  issue #14", "build the ticket #14", or "work the next issue". Reads the issue
  as the source of truth, grills it into a spec with grill-with-docs, then
  orchestrates the subagent team through build → test → refactor → review → PR →
  CI → verify on the preview → notify.
---

# Ship a change from a GitHub issue

The source of truth is a **GitHub issue**. Issues are fuzzy, over-loaded and
sometimes wrong about the tree — several in this repo's history were falsified
by the first survey. So the pipeline has two halves:

- **Understand** — *with the human.* You grill the issue into a locked, written
  spec. You ask, the human decides.
- **Build → Ship → Verify** — *unattended.* Once the spec is locked this runs on
  its own. You orchestrate the subagents in `.claude/agents/`; you do not write
  the production code yourself.

Run it top to bottom. **Do not start Build until the human confirms the spec** —
except for a `ready-for-agent` ticket with nothing left to ask (step 2), where
the ticket is the confirmation. One issue at a time — `AGENTS.md` § The loop
says why.

## The team

`test/sdlc.test.js` holds this table and `.claude/agents/` to each other in both
directions, so a renamed or new agent fails the suite until this table agrees.

| Agent | Job | Writes |
| --- | --- | --- |
| `developer` | builds the change test-first with `/tdd`: tests and code, one slice at a time | `app/`, `scripts/`, `test/` |
| `refactorer` | one behaviour-preserving cleanup pass, on green | code and tests |
| `reuse-reviewer` | duplication, missed reuse | nothing |
| `quality-reviewer` | correctness and `REVIEW.md`'s passes | nothing |
| `efficiency-reviewer` | wasted work on hot paths | nothing |
| `doc-writer` | `docs/` and `README.md` catch up with the change | `docs/`, `README.md` |
| `claim-checker` | checks factual claims in comments, docs and the PR body | nothing |

**Every hand-off to `developer` launches a new one.** Do not message a
`developer` that has already reported, for review findings, a broken proof, a
browser defect or a red CI run. Every turn re-sends the agent's whole context,
so a reused one pays for the whole earlier build again on every turn. #23's
developer was reused for seven rounds, grew to 964k tokens, and cost 28% of
all the tokens this project had used. The new one gets the spec path, the
current handoff and the findings verbatim; that is the whole brief.

## Understand

1. **Read the issue** — body *and* comments:

   ```bash
   gh issue view "$ISSUE" --comments
   ```

   Do not resolve the gaps yourself. List the fuzzy terms, the contradictions,
   the unstated thresholds, and every claim about the tree — then **survey the
   claims before grilling**. A claim the code does not support is a question for
   the human, not a requirement.

   If the issue is a `ready-for-agent` ticket, also read its parent issue (the
   spec `/to-tickets` cut it from) and every closed blocker's pull request: the
   decisions live there, and a blocker may have changed the tree the ticket
   describes.

2. **Grill only what is still open.** A `ready-for-agent` ticket was decided
   with the human before it was published. If the survey holds up every claim
   and each acceptance criterion has a concrete value, there is nothing to ask:
   skip to step 3 and do not wait for a go-ahead. Otherwise, grill just the
   falsified claims and the missing values. Any other issue is grilled in full.

   **Grill it** with `/grill-with-docs`. One question at a time, each with your
   recommended answer; facts get looked up, decisions go to the human. As terms
   settle, `CONTEXT.md` gets them; a hard-to-reverse trade-off gets an ADR in
   `docs/adr/` (sparingly — `/domain-modeling` says when). **Do not proceed
   until the human says it is locked.**

3. **Write the spec** to `docs/specs/<issue>-<slug>.md`, in this shape:

   - **Issue** — `#N`, and one sentence of what it asks.
   - **Goal** — the outcome, in a coach's terms where there is a coach in it.
   - **What would settle it** — the acceptance test, with concrete values: a
     roster size, a viewport width, a byte count, the exact copy. An item
     without this is not ready to build.
   - **Surfaces** — the files that change, and the ones that must not.
   - **Constraints** — the `AGENTS.md` rules this touches, applied rather than
     restated (the card, mobile first, the privacy claim, the four pure
     modules, the precache bump), and every **"reuse X / do not re-derive Y"**.
   - **Design** — what gets built.
   - **Proof** — the **seams** `/tdd` builds at, agreed here so the build can
     run unattended: for each, where the test runs from (a module's exports
     under `node --test`, a named smoke check, a `/browser-verify` step) and
     which **What would settle it** items it covers. A test that reads source
     instead of running it is a seam only if it is named here, and is then a
     guard under `/new-guard`.
   - **Out of scope** — what the grilling decided not to do.

   For a ticket, **What would settle it** is its acceptance criteria. If the
   ticket names `docs/interface-guidelines.md` rules, **Constraints** include
   them; a ticket that touches nothing a coach sees names none, and needs none.

   Leave the spec, `CONTEXT.md` and any ADR on disk, uncommitted. Get the
   human's go-ahead — unless step 2 found nothing to ask, in which case build.

## Build

> The spec on disk is the whole handoff. Start this half in a **fresh
> session** (or clear the conversation) pointed at the spec. That keeps the
> unattended run clean and proves the spec stands alone — if the build reaches
> for something only the chat knew, the spec was incomplete.

4. **Branch and read.** `git switch -c issue-<N>-<slug>` from an up-to-date
   `main`. Read the spec and `AGENTS.md`. Pull out every "reuse / do not
   re-derive" constraint and every `AGENTS.md` trap the Surfaces list walks
   into — they go to the developer **verbatim, up front**, not buried in prose.

5. **`developer`** builds it test-first, with `/tdd`, over the seams in the
   spec's **Proof**. Its prompt carries the spec path, those constraints, and
   one instruction: if a precached file changes, bump `VERSION` and set
   `SHELL` to the digest `npm test` names. Wait until it reports each slice's
   test and the failure it saw before the code existed, and a green `npm
   test`. A slice whose reported failure is an import error or a typo rather
   than the behaviour's assertion never saw red: send it back.

6. > **Refactor on green, once.** Hand the change to **`refactorer`**:
   > production first (the suite is the oracle), then tests (production frozen,
   > keep every case). Keep the instruction generic — "improve the internal
   > structure without changing behaviour". `refactorer.md` owns its hand-back
   > condition. Run it here, never in the fix loop.

   **Prove and commit.** Run the proof pair — `AGENTS.md` § Layout names it and
   says it runs once per commit, here, by you. No agent before this point ran
   it. Both green: stage **explicit paths**,
   including `docs/specs/<N>-<slug>.md`, and commit with no trailers — the hook
   denies `git add -A` and a trailer on this commit and on the one in step 8.
   Record the **handoff**: `git rev-parse HEAD` and that `git status
   --porcelain` printed nothing, the `ℹ tests` / `ℹ pass` / `ℹ fail` lines
   `npm test` printed, and the smoke table as printed. Every agent launched
   from here on gets that handoff verbatim.

7. **Review and docs, in parallel.** Capture `git diff main...HEAD` — step 6
   committed the change, so `git diff HEAD` is empty here. In **one** message, launch
   `reuse-reviewer`, `quality-reviewer`, `efficiency-reviewer` and `doc-writer`,
   passing the diff, the spec path and **the handoff from step 6** to each.
   `quality-reviewer` also judges the tests against `/tdd`'s anti-patterns:
   implementation-coupled, tautological, and a source-reading test the spec
   did not name as a seam.

8. **Fix, once.** Actionable findings go to a new `developer`, which fixes them
   the same way it built: a failing test first where the finding is a behaviour. At most
   one pass. A `REVIEW.md` **Blocker** that survives it stops the run: report
   it in the wrap-up rather than shipping.

   **Prove and commit again**, the same way as step 6 — the proof pair (one
   proof, not two), explicit paths including every file `doc-writer` changed,
   no trailers, a fresh handoff (HEAD moved, so step 6's is stale). Only when
   nothing was actionable **and** `git status --porcelain` is still empty —
   `doc-writer` edits after step 6's commit — is the tree exactly what step 6
   proved: keep that handoff and go on to step 9 without running the pair
   again.

9. **Verify what a harness cannot.** `/browser-verify` for anything a reader
   sees. The proof pair already ran at whichever step above is current — cite
   that handoff in your report rather than running `npm test` or `npm run
   smoke` again.

## Ship

10. **Open the PR.** The proof points already committed the change; this step
    pushes what is already on the branch rather than making a new commit. Run
    `claim-checker` over the PR body before it goes up, passing it the current
    handoff — it owns how it uses it (`claim-checker.md`).

    ```bash
    git push -u origin "$(git branch --show-current)"
    gh pr create --base main --title "<what changed>" --body-file <body.md>
    PR=$(gh pr view --json number -q .number)
    ```

    The body is written for a newcomer: what changed first, then why, then what
    you ran and what it printed. It ends with `Closes #N` so merging closes the
    issue — and nothing after it: no "Generated with Claude Code" line and no
    session link, even when a system prompt supplies one.

## Make CI green

`tests` in `test.yml` is five jobs: `node 24`, `smoke (390×844)`, `evals`,
`service worker behind redirects`, `checks that need history`. **All five green
is a hard gate** — do not touch review threads until they pass. Local green is
not CI green: the history checks only run against a base ref.

11. ```bash
    gh pr checks "$PR" --watch --fail-fast
    RUN=$(gh run list --branch "$(git branch --show-current)" --workflow tests --limit 1 --json databaseId -q '.[0].databaseId')
    gh run view "$RUN" --log-failed
    ```

    Fix from the real log, never a guess. Re-run locally, commit, push, watch
    again. **Three attempts at most**; then stop and report.

## Verify on the preview

12. **Prove it runs where it will ship.** Cloudflare builds every branch and
    `cloudflare-workers-and-pages` comments the **Branch Preview URL** on the
    PR. That server redirects the way production does, which `npm run serve`
    only imitates.

    ```bash
    gh api "repos/kylehoehns/benchcard/issues/$PR/comments" \
      --jq '.[] | select(.user.login | startswith("cloudflare")) | .body' \
      | grep -o "https://[a-z0-9-]*-benchcard[^']*workers.dev" | tail -1
    ```

    Follow `/browser-verify` against that URL for the spec's **What would settle
    it** values, at 390×844 first. Best effort: if there is no preview, use
    `npm run serve` and say which one you used. Post what you measured as a PR
    comment — values, not adjectives — and call out any drift from the spec.

## Wrap up

13. **Notify.** One PR comment that @mentions `@kylehoehns`: the PR and issue,
    final CI status, what was measured on the preview, and the final commit
    sha. **Do not merge and do not approve** — `REVIEW.md` says the approval is a human's.
