---
name: ship-feature
description: >
  Use when building a change end-to-end from a GitHub issue — asks like "ship
  issue #14", "build the ticket #14", or "work the next issue". Reads the issue
  as the source of truth, grills it into a spec with grill-with-docs, then
  orchestrates the subagent team through build → test → refactor → review → PR →
  CI → address review → verify on the preview → notify.
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

Run it top to bottom. **Do not start Build until the human confirms the spec.**
One issue at a time — `AGENTS.md` § The loop says why.

## The team

`test/sdlc.test.js` holds this table and `.claude/agents/` to each other in both
directions, so a renamed or new agent fails the suite until this table agrees.

| Agent | Job | Writes |
| --- | --- | --- |
| `developer` | production code from the spec | `app/`, `scripts/` |
| `tester` | tests for the change; `npm test` green | `test/` |
| `refactorer` | one behaviour-preserving cleanup pass, on green | code and tests |
| `reuse-reviewer` | duplication, missed reuse | nothing |
| `quality-reviewer` | correctness and `REVIEW.md`'s passes | nothing |
| `efficiency-reviewer` | wasted work on hot paths | nothing |
| `doc-writer` | `docs/` and `README.md` catch up with the change | `docs/`, `README.md` |
| `guard-falsifier` | proves a new or changed guard can go red | nothing |
| `claim-checker` | checks factual claims in comments, docs and the PR body | nothing |

## Understand

1. **Read the issue** — body *and* comments:

   ```bash
   gh issue view "$ISSUE" --comments
   ```

   Do not resolve the gaps yourself. List the fuzzy terms, the contradictions,
   the unstated thresholds, and every claim about the tree — then **survey the
   claims before grilling**. A claim the code does not support is a question for
   the human, not a requirement.

2. **Grill it** with `/grill-with-docs`. One question at a time, each with your
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
   - **Proof** — which of `npm test`, `npm run smoke` and `/browser-verify`
     prove it, and which guard must be shown going red.
   - **Out of scope** — what the grilling decided not to do.

   Leave the spec, `CONTEXT.md` and any ADR on disk, uncommitted. Get the
   human's go-ahead.

## Build

> The spec on disk is the whole handoff. Start this half in a **fresh
> session** (or clear the conversation) pointed at the spec. That keeps the
> unattended run clean and proves the spec stands alone — if the build reaches
> for something only the chat knew, the spec was incomplete.

4. **Branch and read.** `git switch -c issue-<N>-<slug>` from an up-to-date
   `main`. Read the spec and `AGENTS.md`. Pull out every "reuse / do not
   re-derive" constraint and every `AGENTS.md` trap the Surfaces list walks
   into — they go to the developer **verbatim, up front**, not buried in prose.

5. **`developer`** implements. Its prompt carries the spec path, those
   constraints, and one instruction: if a precached file changes, bump
   `VERSION` and set `SHELL` to the digest `npm test` names. Wait until it
   reports `npm test` run.

6. **`tester`** writes the tests and gets `npm test` green. It does not touch
   production code; a failure it cannot fix from `test/` comes back to you and
   goes to `developer`.

   > **Refactor on green, once.** Hand the change to **`refactorer`**:
   > production first (the suite is the oracle), then tests (production frozen,
   > keep every case). Keep the instruction generic — "improve the internal
   > structure without changing behaviour". It hands back only on a green
   > `npm test`. Run it here, never in the fix loop.

7. **Review and docs, in parallel.** Capture `git diff HEAD` (plus
   `git status --porcelain` for new files). In **one** message, launch
   `reuse-reviewer`, `quality-reviewer`, `efficiency-reviewer` and `doc-writer`,
   passing the diff and the spec path to each. Add `guard-falsifier` to the same
   message if the diff touches `test/`, `scripts/` or `.claude/hooks/`.

8. **Fix, once.** Actionable findings go to `developer` (or `tester`), then
   `npm test` again. At most one pass. A `REVIEW.md` **Blocker** that survives
   it stops the run: report it in the wrap-up rather than shipping.

9. **Prove it locally.** `npm test` and `npm run smoke`, both green, and
   `/browser-verify` for anything a reader sees. Record what you ran and what
   it printed — the PR body quotes it.

## Ship

10. **Open the PR.** Stage **explicit paths** — the hook denies `git add -A` —
    and write the commit message without trailers (the hook denies those too).
    Run `claim-checker` over the PR body before it goes up.

    ```bash
    git add <every path, by name> docs/specs/<N>-<slug>.md
    git commit -m "<what changed>"
    git push -u origin "$(git branch --show-current)"
    gh pr create --base main --title "<what changed>" --body-file <body.md>
    PR=$(gh pr view --json number -q .number)
    ```

    The body is written for a newcomer: what changed first, then why, then what
    you ran and what it printed. It ends with `Closes #N` so merging closes the
    issue.

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

## Address the Claude review

`claude-code-review.yml` reviews every non-draft PR against `REVIEW.md` and
posts inline threads as `claude`. It is advisory, not required — and it can
finish green having reviewed nothing (`/address-review` §4).

12. **Wait for the `claude-review` check to finish**, not for a comment: a clean
    review may post nothing at all. Poll `gh pr checks "$PR"` every ~30s for up
    to ~15 minutes. Then read the threads:

    ```bash
    gh api graphql -f query='
      query($owner:String!,$repo:String!,$pr:Int!){
        repository(owner:$owner,name:$repo){ pullRequest(number:$pr){
          reviewThreads(first:100){ nodes{ id isResolved
            comments(first:20){ nodes{ author{login} body path line } } } } } } }' \
      -f owner=kylehoehns -f repo=benchcard -F pr="$PR"
    ```

    Three ways out, and only three:
    - **Finished, unresolved `claude` threads** → step 13.
    - **Finished, no threads** → read the job's duration first. Under a minute
      means it did not run; say so. Otherwise it is a clean pass.
    - **Not finished after ~15 minutes** → say so and go to the wrap-up.

13. **Triage each thread with `/address-review`.** It owns how: verify the
    finding before complying, fix the cause, reply with what you ran, resolve
    only what you fixed, and treat a repeat of a class `AGENTS.md` already names
    as the harness failing. Code changes go to `developer`.

14. **Push the fixes.** `npm test`, commit, push — that re-triggers CI, so go
    back to step 11. **Two review rounds at most.** After the second, reply to
    what is left with your decision and move on.

## Verify on the preview

15. **Prove it runs where it will ship.** Cloudflare builds every branch and
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

16. **Notify.** One PR comment that @mentions `@kylehoehns`: the PR and issue,
    final CI status, Claude threads fixed vs. declined (with reasons), what was
    measured on the preview, and the final commit sha. **Do not merge and do not
    approve** — `REVIEW.md` says the approval is a human's.
