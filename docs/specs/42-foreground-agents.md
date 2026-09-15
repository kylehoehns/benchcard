# 42 — Run the Claude workflows' subagents in the foreground

## Issue

#42: the Claude review check can pass green without reviewing anything. The
issue asked for a warning when that happens; its follow-up comment traced the
cause to background subagents, and the human chose to fix the cause instead.

## Goal

No coach sees any of this. A pull request's Claude review either reviews the PR
and posts what it found, or fails in a way someone can see. It stops finishing
green after a few turns, having posted nothing, because the action treated a
"still waiting for my subagents" message as the end of the run.

## What the survey established

- `anthropics/claude-code-action` stops reading the session at the **first**
  `result` message (anthropics/claude-code-action#1499; the same bug through
  the `code-review` plugin is #1646).
- Claude Code starts subagents in the background by default. A session that
  launches one and waits for it emits an **interim** `result` first.
- Measured locally with Claude Code 2.1.271 (the version CI installs), one
  subagent asked to reply `PONG`:
  - default: the Agent tool took `run_in_background: true`, returned
    `Async agent launched successfully…`, and the stream carried **two**
    `result` messages, the first saying the subagent was still running;
  - with `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`: the Agent tool had no
    `run_in_background` option, returned `PONG`, and the stream carried **one**
    `result`.
- Silent passes observed on this repo: #38 (5 turns, $0.13), #41 at `b201706`
  twice (3 turns, $0.11; 5 turns, $0.13) and at `086dcf0` (6 turns, $0.18). #41
  at `8f7aa3f` reviewed fully (30 turns, $3.86, two threads).

## What would settle it

1. `.github/workflows/claude-code-review.yml`: the step that `uses:
   anthropics/claude-code-action` has `env:` with
   `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1'`.
2. `.github/workflows/claude.yml`: its `anthropics/claude-code-action` step has
   the same `env:` entry.
3. The reason is written once, in `claude-code-review.yml`'s header, next to
   the existing "A GREEN CHECK HERE CAN MEAN 'DID NOT RUN'" note: a third way
   the job passes without reviewing, what the variable does, and the two action
   issues. `claude.yml` points at it in one line rather than restating it.
4. A test in `test/ci-config.test.js` fails if either workflow's
   `anthropics/claude-code-action` step does not set
   `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` to `'1'` in that step's own `env:`.
   It must not be satisfied by the name appearing in a comment, in another
   step's `env:`, in a job- or workflow-level `env:` of a different job, or with
   another value.
5. `guard-falsifier` shows the test going red for: the entry removed from each
   workflow; the value changed to `'0'`; the entry moved to the checkout step;
   and the entry left only in a comment.
6. `npm test` and `npm run smoke -- --no-tests` green.

After merge, and not a condition of merging: reviews on later PRs post a
review or a "No issues found" comment. This PR cannot show that on itself —
the action skips a PR that edits its own workflow file (the header already
says so), so its `claude-review` check will pass without running.

## Surfaces

Change:

- `.github/workflows/claude-code-review.yml` — the `env:` entry and the header
  paragraph.
- `.github/workflows/claude.yml` — the `env:` entry and a one-line pointer.
- `test/ci-config.test.js` — the new test.

Must not change:

- `test.yml` and `vendor-drift.yml`, and every existing trigger, permission,
  `paths-ignore`, `claude_args` and prompt in the two Claude workflows.
- `app/`, `scripts/`. Nothing is precached; no `VERSION`/`SHELL` bump.

## Constraints

- **One answer in one place.** The explanation lives in
  `claude-code-review.yml`'s header only.
- **`/new-guard`** for the test (item 5).
- **Required checks.** `test/ci-config.test.js` already pins `test.yml`'s job
  names and filters; do not disturb those tests.

## Design

Add an `env:` block to each action step, and a paragraph to the review
workflow's header. The test finds each workflow's `uses:
anthropics/claude-code-action` step, reads that step's own `env:` mapping (the
lines indented under `env:` at that step's level, comment lines dropped), and
asserts the entry and value. Reuse the step-scanning approach of
`extractRunCommands` in the same file where it fits, rather than writing a
second YAML walker.

## Proof

`npm test` (the new test green), `npm run smoke -- --no-tests` (proof point),
`guard-falsifier` on item 5. No `/browser-verify`: nothing a reader sees
changes.

## Out of scope

- The warning annotation #42 originally asked for. If silent passes continue
  after merge, that becomes a new issue.
- `claude.yml`'s `--append-system-prompt` still says "Run npm test and npm run
  smoke", which predates #40's proof pair. Separate change.
- Pinning the action or Claude Code to a version.
