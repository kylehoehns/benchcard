# Evals

Stage 4's "continuous evals" -- the AI-native equivalent of a QA suite. Each
file is one task with acceptance checks, run by `npm run evals`.

**Two kinds, and the distinction is the honest part.**

- `"kind": "deterministic"` -- the acceptance check can be decided without a
  model. Every hook eval is this: feed the hook its stdin JSON, read the
  decision back. These RUN, here and in CI, for free.
- `"kind": "agent"` -- deciding it needs a model in the loop (did the right
  skill load? did the session reach for the harness before hand-rolling a
  browser?). These are **defined but NOT run** by `npm run evals`. The runner
  reports them as not-run.

The second group is not padding: writing the acceptance check down is most of
the work, and a check nobody can run yet is still a check somebody can run
later. But a runner that counted them as passes would be exactly the false
green this repo has been bitten by more than any other failure -- so it counts
them as what they are, and `npm run evals` exits non-zero only on a real
deterministic failure.

**Adding one.** Every production incident should become an eval. Copy the
shape, give it an `id` matching its filename, and run `npm run evals`.
`test/evals.test.js` checks the shape of every file here, so a malformed eval
fails `npm test` rather than being silently skipped.
