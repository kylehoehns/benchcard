# #86 — Commit the compare-screenshot harness so it stops lying

## Issue

#86. Every ship agent writes a throwaway screenshot script in its own worktree
to fill `notes/mockups/prototype/compare/<issue>/`, so the same two capture
bugs keep coming back — and both of them report SUCCESS while measuring the
wrong thing. Commit one harness that cannot make either mistake silently.

## Goal

No coach sees this. An agent shipping a redesign ticket runs one committed
command and gets a compare set it can trust: every shot taken at the root font
size it asked for, and every dark shot actually painted dark. When either is
untrue the run stops with a message naming both numbers, instead of writing a
PNG that looks right and is not.

## The two bugs, as the issue reports them

1. **The font size override gets dropped.** `Page.captureScreenshot` with
   `captureBeyondViewport: true` resizes the renderer internally, which throws
   away the `Page.setFontSizes` override. The shot still reports the viewport
   it asked for, so nothing looks wrong. In #32, 23 of 69 shots were taken at
   a 16px root while claiming to be the 32px large-text state.
2. **Dark mode paints light.** The rich fixture sets `ui.theme` to `'light'`,
   and `applyTheme` in `app/render.js` only consults
   `prefers-color-scheme` when that setting is `'auto'`. So emulating a dark
   OS does nothing, and every dark shot came out byte-identical to its light
   twin.

Both claims were surveyed against this tree before this spec was written and
both hold: `UI` in `scripts/smoke/fixtures.mjs` is `theme: 'light'`, and
`applyTheme` resolves `auto` and nothing else.

## What would settle it

1. **One committed entry point.** `node scripts/compare-shots.mjs --issue 86`
   writes PNGs and `measurements.json` under
   `notes/mockups/prototype/compare/86/` and exits 0. `--states a,b` narrows
   the run to those shot names; `--out <dir>` overrides the directory. An
   unknown state name is refused by name, before Chrome launches.
2. **The font size is measured after the last resize, and a mismatch fails the
   run.** The harness never passes `captureBeyondViewport: true`. It grows the
   viewport with `Emulation.setDeviceMetricsOverride` instead, then re-reads
   `getComputedStyle(document.documentElement).fontSize` and compares it with
   the value it asked for. Within 0.5px is a pass. Anything else stops the run
   with a message naming the measured px, the requested px and the shot.
3. **The theme is proved by paint, not by an attribute.** The harness reads
   `getComputedStyle(document.body).backgroundColor` and requires
   `rgb(244, 244, 246)` for light and `rgb(11, 11, 12)` for dark — the
   `--bg` values in `app/tokens.css`. `data-theme` is never the evidence. Dark
   is reached by writing `ui.theme: 'dark'` into the record through `goRich`'s
   existing override, not by emulating a dark OS.
4. **A light shot and its dark twin are never byte-identical.** Every shot that
   declares a twin is hashed, and two twins with the same digest fail the run
   naming both files. A set in which no shot has a twin fails too, rather than
   passing having compared nothing (/new-guard rule 2a).
5. **The required states are covered.** The default set includes, and a test
   asserts it keeps including: a long real name, a screen scrolled to its
   bottom, a full-height capture, 320px at a 32px root, and the empty
   first-run screen. Light and dark for everything except the large-text cell,
   which is about layout and runs light only.
6. **The guard goes red on both known-bad conditions.** `test/compare-shots.test.js`
   replays a measured root of 16px against a requested 32px, and a light paint
   under a shot that claims dark, through the harness's own rule functions and
   asserts each is reported. Each arm was watched fail before it was trusted:
   the rule it exercises was broken, the test went red, the rule was restored.
   The red output is quoted in the pull request.
7. **A real set exists, produced by the committed harness.**
   `notes/mockups/prototype/compare/86/` holds the PNGs and
   `measurements.json` that this harness wrote — the harness proved by use,
   not only by its tests.
8. **Nothing under `app/` changes.** `git diff main -- app/` is empty, so no
   `VERSION`/`SHELL` bump is owed. `npm test` and `npm run smoke` are green.

## Surfaces

Change:

- `scripts/compare-shots.mjs` — new. The CLI, the shot table, and the three
  rule functions the test imports.
- `test/compare-shots.test.js` — new. The guard.
- `scripts/smoke/fixtures.mjs` — export `LONG_NAME`, which
  `scripts/smoke/team-screen.mjs` and `scripts/smoke/sheet-spacing.mjs`
  already each hold their own copy of. The new harness needs the same string
  and a third copy is a third place for it to drift.
- `scripts/smoke/team-screen.mjs`, `scripts/smoke/sheet-spacing.mjs` — import
  that constant instead of declaring it. No other edit.
- `notes/mockups/prototype/compare/86/` — new, the produced set.
- `AGENTS.md` — one line under § Layout pointing at the harness, so the next
  agent finds it instead of writing their own.

Must not change: everything under `app/`, `scripts/smoke.mjs`,
`scripts/smoke/registry.mjs`, `scripts/budgets.json`, `scripts/budgets.mjs`,
`.github/workflows/`, `package.json`, the hooks. In particular the smoke
registry stays at 41 checks — this harness is a separate command, not a new
smoke row.

## Constraints

- **Reuse the browser driver.** `launch` and `cdp` from
  `scripts/smoke/chrome.mjs`, `serve` from `scripts/serve.mjs`, `evalIn`,
  `step`, `SETTLE` and `WIDTH`/`HEIGHT` from `scripts/smoke/dom.mjs`, `goRich`
  from `scripts/smoke/fixtures.mjs`, `fixturePass` from
  `scripts/smoke/rich-fixture.mjs`, `VIEWS` from `scripts/smoke/sweep.mjs`,
  `LARGE_TEXT_PX` / `LARGE_TEXT_WIDTH` from `scripts/smoke/registry.mjs`. Do
  not write a second Chrome launcher, a second static server, a second settle
  or a second copy of the five view names.
- **The fixture is a guard.** Run `fixturePass` once after the first `goRich`
  and stop the run if it fails. A compare set taken against a fixture that did
  not arrive proves nothing, which is the whole subject of this ticket.
- **/new-guard applies in full.** This change *is* a guard. Green first, then
  red deliberately, on both bug classes. A check that measured nothing fails
  (rule 2a): no shots selected, no font size read, no twins compared.
- **Set the font size before the navigation.** `Page.setFontSizes` on a
  laid-out document leaves it unreflowed — `scripts/smoke/app-large-text.mjs`
  already records this. Re-apply it after any resize and re-measure; a
  re-apply that does not take is still a failure, not a retry loop.
- **Restore the overrides.** Leave the font size at 16 and the metrics at
  390×844 when the run ends, the way `appLargeTextPass` does in its `finally`.
- American spelling. No `Co-Authored-By` trailer. Stage explicit paths.

## Design

`scripts/compare-shots.mjs`:

- `SHOTS` — one frozen table. Each entry is
  `{ name, view, theme, width, rootPx, full, bottom, longNames, firstRun, twin }`.
  Built from `VIEWS` plus the five required extras, so the five view names are
  read from `sweep.mjs` rather than retyped.
- `THEME_BG` — `{ light: 'rgb(244, 244, 246)', dark: 'rgb(11, 11, 12)' }`,
  derived from `--bg` in `app/tokens.css` through `scripts/tokens-css.mjs`
  (already this repo's one answer to what a token resolves to — see
  `test/contrast.test.js`) rather than typed here a second time.
  `test/compare-shots.test.js` still types its expectation by hand, which is
  the independent second reading.
- `shotProblems(want, got)` — the rule. Returns an array of strings; empty
  means the shot is trustworthy. Pure, no browser, so the test can feed it
  anything.
- `twinProblems(records)` — the second rule. Pure, same shape.
- `capture(...)` — drives one shot and calls `shotProblems` with what it
  measured. Throws on a non-empty result.
- `main()` — runs only when the file is executed directly, so the test can
  import the rules without launching Chrome.

## Proof

The seams, and which **What would settle it** item each covers:

- `shotProblems` exported from `scripts/compare-shots.mjs`, run under
  `node --test` from `test/compare-shots.test.js` — items 2, 3 and the 2a
  arms of item 4. Known-bad readings in, problem strings out.
- `twinProblems`, same seam — item 4, including the empty-set arm.
- `SHOTS`, read under `node --test` — item 5. A guard over the table, named
  here as a seam so it is not an unnamed source-reading test.
- The source of `scripts/compare-shots.mjs`, read under `node --test` — item
  2's "never passes `captureBeyondViewport: true`" clause only. Named here as
  a seam for the same reason.
- The real run, `node scripts/compare-shots.mjs --issue 86` — items 1 and 7.
- `npm test` and `npm run smoke` — item 8.

The red proof for item 6 is the rule broken and restored, per /new-guard step
2, plus one end-to-end arm: the harness edited to reintroduce each original
bug and run for real, so the loud failure is observed from the CLI and not
only from the unit seam.

## Out of scope

- A new smoke check. This is a command an agent runs when shipping a redesign
  ticket, not a per-commit gate, and adding a row would move the count
  `AGENTS.md` states and lengthen every CI run for no coverage.
- Comparing a shot against the prototype PNG. The harness produces the app
  side; the judgement stays with the reader.
- Backfilling compare sets for #28–#32.
