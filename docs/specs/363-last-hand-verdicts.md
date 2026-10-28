# #363 — the last hand-built smoke verdicts move onto the recorder

## Issue

#363: the smoke rows that still build `{ pass, detail }` by hand, with their
own `slice(0, 4).join(' | ')`, record into `ctx.rec` like every other probe
since #358.

## Goal

"How is a failing row's detail cut short" has one answer:
`scripts/smoke/verdict.mjs`, which holds the limit and the separators. No
probe keeps a second copy.

## What would settle it

1. `grep -nE "slice\(0, ?[0-9]+\)\.join\(' \| '\)" scripts/smoke/*.mjs`
   prints nothing.
2. `grep -nE "pass: *[a-zA-Z.]+\.length === 0" scripts/smoke/*.mjs` prints
   nothing.
3. These rows record with `rec.check` / `rec.fail` / `rec.ok` and return
   nothing: `phoneGutterPass` (phone-gutter.mjs), `pinnedFocusPass`
   (pinned-focus.mjs), `touchPass` (touch.mjs), `fixturePass`
   (rich-fixture.mjs), `whoRowsPass` (who-rows.mjs), `planRowsPass`
   (plan-rows.mjs), `todayGameRowsPass` (today-game-rows.mjs).
4. Every success detail is word for word what it was.
5. `npm run smoke` passes with the same 92 rows and names.

## Surfaces

Change: the seven files above, `scripts/smoke/registry.mjs` (those rows'
`run` lines pass `ctx.rec`), `scripts/compare-shots.mjs` (it calls
`fixturePass` and reads `.pass`/`.detail`).

Must not change: anything under `app/`, row names, `replaces:` fields,
`width-sweep.mjs`'s return shape (`{ bad, audited, seen }`; `settings-rows.mjs`
uses it too), `smoke-checks.js`.

## Constraints

- **Reuse verdict.mjs.** `recorder`, `verdict`, `firstLine` (and `scoped` if
  a prefix fits). No new limit, separator or join of a problem list.
- Each problem in a `bad` / `missing` list is its own `rec.fail`. The
  "N/M measurement(s) …" count prefix goes away with the join; the limit and
  `' | …'` say there are more.
- A row must not be judged "checked nothing" when its list is empty: record
  the measuring itself, e.g. `rec.check(audited > 0, 'measured nothing')`.
- `pinnedFocusPass`'s `scenarios === 6` stays a recorded check. Its catch
  that only pushes `firstLine(e)` goes (runCheck records throws); its
  `finally { land(...) }` stays.
- `compare-shots.mjs` is not a smoke row. It builds a local `recorder()`,
  hands it to `fixturePass`, and judges with `verdict(rec)`; its stop message
  stays `rich fixture did not arrive, stopping: <detail>`.
- Proof is one full `npm run smoke` by the orchestrator; agents may run
  `node scripts/smoke.mjs --only "<row>"` for rows they touch.

## Design

Mechanical, per file, as #358 did: add `rec` as the pass's last parameter,
turn each pushed problem into `rec.fail`, each kept condition into
`rec.check`, the success string into `rec.ok`, delete the returned verdict.
Registry rows append `ctx.rec`.

## Proof

- **The greps** cover items 1 and 2.
- **`npm run smoke`** covers items 3-5: the seven rows PASS with their old
  success details; 92 rows, same names.
- No new unit test: the recorder's behavior is already pinned by
  `test/smoke-verdict.test.js`.

## Out of scope

- Comma-joined summaries inside one message (`bench-look.mjs:129`,
  `team-screen.mjs:70`): they list examples inside one finding, not a
  problem list.
- Renaming helper parameters called `ck` that receive `rec.check`.
