# #358 — runCheck builds each probe's verdict

## Issue

#358: `runCheck` hands each smoke probe a recorder, and builds the row's
`{ pass, detail }` from what the probe recorded, in place of every probe
building its own verdict by hand.

## Goal

A smoke row's verdict has one shape, built in one place. A probe file is the
checks it makes, without ~20 lines of `ck`/`problems`/`catch` around them. A
probe that checks nothing cannot pass.

## What would settle it

1. A unit test (`node --test`, no browser) covers the recorder and the
   verdict it builds:
   - all checks pass → `pass: true`, detail is the probe's success detail;
   - one fails → `pass: false`, detail is that failure's message;
   - 7 fail → `pass: false`, detail is the first **5** messages joined with
     `' | '`, then `' | …'` (the one fixed limit and separator);
   - a throw after two recorded checks → `pass: false`, and the detail keeps
     the recorded failures and names the throw (`threw: <first line>`);
   - nothing recorded → `pass: false`, with a detail that says the probe
     checked nothing.
2. `grep -nE '(function|const) ck\b' scripts/smoke/*.mjs` prints nothing.
3. `grep -c 'problems.length === 0' scripts/smoke/*.mjs` totals 0.
4. `npm run smoke` passes, and every row that passed before still passes,
   with the same row names.

## Surfaces

Change: a new pure module `scripts/smoke/verdict.mjs`, `scripts/smoke.mjs`
(`runCheck`), `scripts/smoke/registry.mjs` (rows hand the recorder to their
pass), every `scripts/smoke/*.mjs` that holds `ck` or `problems.length ===
0`, the tests that call those passes directly, new `test/smoke-verdict.test.js`.

Must not change: anything under `app/`, row names, `setup`/`selectable`
fields, what each probe measures, `smoke-checks.js`.

## Constraints

- **One answer.** The limit (5) and separator (`' | '`) live once, in
  `verdict.mjs`. No probe truncates or joins its own problem list.
- `runCheck` already turns a throw into a FAIL row (`scripts/smoke.mjs`
  ~:113-137). With the recorder it keeps the checks recorded before the throw.
  So a `catch` that only does `problems.push(e.message…)` is deleted. A
  `catch` or `finally` that does more, such as cleanup, restoring the
  viewport or closing a sheet, stays.
- `runCheck` builds the recorder and passes it to the row (`ctx.rec`, say).
  A row's `run` may still return `{ pass, detail }` directly. Passes with
  their own pass rule, such as `narrow.mjs` and `sweep.mjs`, stay valid that
  way and do not have to migrate. A pass that records is judged from the
  recorder. Decide in one place what happens if a pass both records and
  returns a `pass`, and test that rule.
- A pass that is not a registry row but is called by another pass, such as
  `cardAt32Pass` extending the cold `cardsize` row, gets the caller's
  recorder or keeps returning `{ pass, detail }`. Pick per caller and keep it
  simple.
- **A probe that records nothing fails.** Several probes today pass with an
  empty problem list after checking a list that might be empty. Each already
  has a "must find at least one" check (welcome-tag's `no .wel-bench .tag.in`).
  Keep those as recorded checks.
- Success details stay word-for-word, since `test/` or docs may quote them.
  Failure detail wording may change to the fixed truncation.
- `wide-layout.mjs`'s `ck` also counts `audited`. Keep that count in its
  success detail, read from the recorder or kept locally.
- Probes inside `evalIn` page-side strings that build their own `problems`
  array in the page are page code, not the Node-side verdict. Leave the page
  side alone, and record what it returns.
- `/tdd`: the recorder is the seam. Each behavior in item 1 goes red on its
  assertion before the code exists.

## Design

- `scripts/smoke/verdict.mjs`:
  - `recorder()` returns `{ check(cond, msg) → cond, fail(msg), ok(detail) }`.
    `ok` sets the success detail.
  - `verdict(rec, thrown?) → { pass, detail }` holds the limit, separator,
    empty rule and throw rule.
- `runCheck`: `ctx.rec = recorder()`, then run the row. If the result
  carries `pass`, return it as before. Otherwise return `verdict(ctx.rec)`.
  On a throw, return `verdict(ctx.rec, e)`.
- Registry rows: `run: ctx => welcomeTagPass(ctx.c, ctx.origin, ctx.rec)`.
- A migrated probe calls `rec.check(...)`/`rec.fail(...)`, then
  `rec.ok('<old success detail>')`, and returns nothing.

## Proof

- **`test/smoke-verdict.test.js`** on `verdict.mjs`'s exports covers item 1.
- **The greps** cover items 2 and 3.
- **`npm run smoke`** covers item 4: same row count and names, all PASS.

## Out of scope

- `smoke-checks.js`'s in-page checks, and page-side `problems` arrays inside
  probe strings.
- Changing what any probe measures.
